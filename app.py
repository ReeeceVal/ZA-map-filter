import json
from pathlib import Path
from flask import Flask, render_template, send_file, jsonify, request
from flask_compress import Compress

app = Flask(__name__)
Compress(app)

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


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/data/adm1.geojson")
def adm1():
    return send_file(DATA_DIR / "adm1_provinces.geojson",
                     mimetype="application/geo+json", conditional=True, max_age=3600)


@app.route("/data/adm2.geojson")
def adm2():
    return send_file(DATA_DIR / "adm2_districts.geojson",
                     mimetype="application/geo+json", conditional=True, max_age=3600)


@app.route("/data/adm3.geojson")
def adm3():
    return send_file(DATA_DIR / "adm3_municipalities.geojson",
                     mimetype="application/geo+json", conditional=True, max_age=3600)


@app.route("/data/adm4.geojson")
def adm4():
    return send_file(DATA_DIR / "adm4_wards.geojson",
                     mimetype="application/geo+json", conditional=True, max_age=3600)


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


_build_search_index()
_scan_layers()

if __name__ == "__main__":
    app.run(debug=True, port=5000)
