import json
import os
import threading
from pathlib import Path
from flask import Flask, render_template, send_file, jsonify, request, redirect, url_for
from flask_compress import Compress
from werkzeug.utils import secure_filename

import prepare_data

app = Flask(__name__)
Compress(app)

# Source GeoPackage is ~62 MB; leave headroom for larger national datasets
app.config["MAX_CONTENT_LENGTH"] = 400 * 1024 * 1024

DATA_DIR   = Path("prepared_data")
LAYERS_DIR = Path("layers")

# Fields that, if present, should be used as the default tooltip label
_LABEL_PRIORITY = {'name', 'names', 'label', 'title', 'nom', 'naam'}

_layer_meta: list[dict] = []


def _scan_layers() -> None:
    global _layer_meta
    _layer_meta = []
    if not LAYERS_DIR.exists():
        return
    for path in sorted(LAYERS_DIR.glob("*.geojson")):
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            feats = data.get("features", [])
            fields = list(feats[0]["properties"].keys()) if feats else []
            default_field = next(
                (f for f in fields if f.lower() in _LABEL_PRIORITY),
                fields[0] if fields else None,
            )
            stem = path.stem
            _layer_meta.append({
                "id":           stem,
                "label":        stem.replace("_", " ").replace("-", " ").title(),
                "fields":       fields,
                "defaultField": default_field,
                "url":          f"/layers/{path.name}",
            })
        except Exception as e:
            print(f"  Warning: could not read {path}: {e}")
    print(f"Point layers: {[m['id'] for m in _layer_meta]}")

_LEVEL_CONFIGS = [
    ("adm1", "adm1_provinces.geojson",      "ADM1_ID",    "ADM1_EN"),
    ("adm2", "adm2_districts.geojson",      "ADM2_ID",    "ADM2_EN"),
    ("adm3", "adm3_municipalities.geojson", "ADM3_ID",    "ADM3_EN"),
    ("adm4", "adm4_wards.geojson",          "ADM4_PCODE", "ADM4_EN"),
]

_search_index: list[dict] = []


def _display_name(level: str, props: dict) -> str:
    if level == "adm4":
        return f"Ward {props.get('ADM4_EN', '')} — {props.get('ADM3_EN', '')}"
    if level == "adm3":
        return f"{props.get('ADM3_EN', '')} ({props.get('ADM1_EN', '')})"
    if level == "adm2":
        return f"{props.get('ADM2_EN', '')} ({props.get('ADM1_EN', '')})"
    return props.get("ADM1_EN", "")


def _build_search_index() -> None:
    global _search_index
    _search_index = []
    for level, filename, id_col, name_col in _LEVEL_CONFIGS:
        path = DATA_DIR / filename
        if not path.exists():
            print(f"  Warning: {path} not found — skipping {level} in search index")
            continue
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        for feat in data["features"]:
            p = feat["properties"]
            _search_index.append({
                "level": level,
                "id": p.get(id_col, ""),
                "name": p.get(name_col, ""),
                "displayName": _display_name(level, p),
                "labelLon": p.get("label_lon"),
                "labelLat": p.get("label_lat"),
            })
    print(f"Search index: {len(_search_index)} features loaded")


# ── First-run setup ──────────────────────────────────────────────────────────
# stage: idle | validating | preparing | done | error
_setup = {"stage": "idle", "pct": 0, "message": "", "error": None}
_setup_lock = threading.Lock()


def _set_setup(**fields) -> None:
    with _setup_lock:
        _setup.update(fields)


def _run_prepare(gpkg: Path) -> None:
    """Validate then prepare, in a background thread. Updates _setup as it goes."""
    try:
        _set_setup(stage="validating", pct=0, message="Checking the GeoPackage ...",
                   error=None)
        layer, error = prepare_data.validate_gpkg(gpkg)
        if error:
            _set_setup(stage="error", error=error)
            return

        _set_setup(stage="preparing", message=f"Using layer '{layer}'")
        prepare_data.prepare(
            gpkg, layer,
            progress=lambda pct, msg: _set_setup(pct=pct, message=msg),
        )

        # Rebuild in-process so the user can go straight to the app, no restart
        _build_search_index()
        _set_setup(stage="done", pct=100, message="Ready.")
    except Exception as e:
        _set_setup(stage="error", error=f"{type(e).__name__}: {e}")


def _start_prepare(gpkg: Path):
    """Kick off the worker. Returns an error response, or None on success."""
    with _setup_lock:
        if _setup["stage"] in ("validating", "preparing"):
            return jsonify({"error": "Preparation already running"}), 409
        _setup.update(stage="validating", pct=0, message="Starting ...", error=None)
    threading.Thread(target=_run_prepare, args=(gpkg,), daemon=True).start()
    return None


@app.route("/setup")
def setup():
    if prepare_data.outputs_ready():
        return redirect(url_for("index"))
    gpkg = prepare_data.find_gpkg()
    return render_template("setup.html", gpkg_name=gpkg.name if gpkg else None)


@app.route("/setup/status")
def setup_status():
    with _setup_lock:
        return jsonify(dict(_setup))


@app.route("/setup/upload", methods=["POST"])
def setup_upload():
    file = request.files.get("file")
    if file is None or not file.filename:
        return jsonify({"error": "No file received"}), 400

    name = secure_filename(file.filename)
    if not name.lower().endswith(".gpkg"):
        return jsonify({"error": "That is not a .gpkg file"}), 400

    prepare_data.DATA_DIR.mkdir(exist_ok=True)
    final = prepare_data.DATA_DIR / name
    partial = final.parent / (name + ".part")
    file.save(partial)                 # .part so find_gpkg() can't see a half file
    os.replace(partial, final)

    started = _start_prepare(final)
    return started if started else jsonify({"ok": True, "filename": name})


@app.route("/setup/prepare", methods=["POST"])
def setup_prepare():
    gpkg = prepare_data.find_gpkg()
    if gpkg is None:
        return jsonify({"error": "No .gpkg found in Data/"}), 400
    started = _start_prepare(gpkg)
    return started if started else jsonify({"ok": True, "filename": gpkg.name})


@app.errorhandler(413)
def too_large(_e):
    limit = app.config["MAX_CONTENT_LENGTH"] // (1024 * 1024)
    return jsonify({"error": f"File exceeds the {limit} MB upload limit"}), 413


# ── App ──────────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    if not prepare_data.outputs_ready():
        return redirect(url_for("setup"))
    return render_template("index.html")


def _send_level(filename: str):
    path = DATA_DIR / filename
    if not path.exists():
        return jsonify({"error": "data not prepared"}), 503
    return send_file(path, mimetype="application/geo+json",
                     conditional=True, max_age=3600)


@app.route("/data/adm1.geojson")
def adm1():
    return _send_level("adm1_provinces.geojson")


@app.route("/data/adm2.geojson")
def adm2():
    return _send_level("adm2_districts.geojson")


@app.route("/data/adm3.geojson")
def adm3():
    return _send_level("adm3_municipalities.geojson")


@app.route("/data/adm4.geojson")
def adm4():
    return _send_level("adm4_wards.geojson")


@app.route("/search")
def search():
    q = request.args.get("q", "").strip().lower()
    limit = min(int(request.args.get("limit", 10)), 20)
    if len(q) < 2:
        return jsonify([])
    results = [
        item for item in _search_index
        if q in item["name"].lower() or q in item["displayName"].lower()
    ]
    return jsonify(results[:limit])


@app.route("/api/layers")
def api_layers():
    return jsonify(_layer_meta)


@app.route("/layers/<path:filename>")
def serve_layer(filename):
    path = LAYERS_DIR / filename
    if not path.exists():
        return jsonify({"error": "not found"}), 404
    return send_file(path, mimetype="application/geo+json",
                     conditional=True, max_age=3600)


if prepare_data.outputs_ready():
    _build_search_index()
else:
    print("No prepared data yet — open http://localhost:5000 to run setup.")
_scan_layers()

if __name__ == "__main__":
    managed = os.environ.get("LAUNCHER_MANAGED") == "1"
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "5000"))
    debug = os.environ.get("FLASK_DEBUG", "0" if managed else "1") == "1"
    app.run(host=host, port=port, debug=debug, use_reloader=False)
