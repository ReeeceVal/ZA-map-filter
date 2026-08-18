"""
Dissolves a ward-level GeoPackage into 4 ADM levels, simplifies geometries,
and writes prepared GeoJSON files.

Run standalone:
    uv run prepare_data.py

Or use the in-app setup page (http://localhost:5000/setup), which calls the
same functions.
"""
from pathlib import Path

DATA_DIR = Path("Data")
OUT_DIR = Path("prepared_data")

# Columns the source layer must carry for the pipeline to work
REQUIRED_COLS = {
    "ADM1_EN", "ADM1_PCODE", "ADM1_ID",
    "ADM2_EN", "ADM2_PCODE", "ADM2_ID",
    "ADM3_EN", "ADM3_PCODE", "ADM3_ID",
    "ADM4_EN", "ADM4_PCODE",
}

LEVELS = [
    {
        "out": "adm4_wards",
        "label": "wards",
        "dissolve_by": None,
        "simplify_tol": 0.002,
        "pct_from": 0, "pct_to": 55,
        "keep_cols": [
            "ADM4_EN", "ADM4_PCODE",
            "ADM3_EN", "ADM3_ID",
            "ADM2_EN", "ADM2_ID",
            "ADM1_EN", "ADM1_ID",
        ],
    },
    {
        "out": "adm3_municipalities",
        "label": "municipalities",
        "dissolve_by": "ADM3_PCODE",
        "simplify_tol": 0.005,
        "pct_from": 55, "pct_to": 80,
        "keep_cols": [
            "ADM3_EN", "ADM3_PCODE", "ADM3_ID",
            "ADM2_EN", "ADM2_ID",
            "ADM1_EN", "ADM1_ID",
        ],
    },
    {
        "out": "adm2_districts",
        "label": "districts",
        "dissolve_by": "ADM2_PCODE",
        "simplify_tol": 0.01,
        "pct_from": 80, "pct_to": 92,
        "keep_cols": [
            "ADM2_EN", "ADM2_PCODE", "ADM2_ID",
            "ADM1_EN", "ADM1_ID",
        ],
    },
    {
        "out": "adm1_provinces",
        "label": "provinces",
        "dissolve_by": "ADM1_PCODE",
        "simplify_tol": 0.02,
        "pct_from": 92, "pct_to": 100,
        "keep_cols": ["ADM1_EN", "ADM1_PCODE", "ADM1_ID"],
    },
]

OUTPUT_FILES = [f"{cfg['out']}.geojson" for cfg in LEVELS]


def outputs_ready() -> bool:
    """True when every prepared GeoJSON exists and is non-empty."""
    return all(
        (OUT_DIR / name).exists() and (OUT_DIR / name).stat().st_size > 0
        for name in OUTPUT_FILES
    )


def find_gpkg() -> Path | None:
    """First .gpkg in Data/, or None."""
    if not DATA_DIR.exists():
        return None
    return next(iter(sorted(DATA_DIR.glob("*.gpkg"))), None)


def validate_gpkg(path: Path) -> tuple[str | None, str | None]:
    """
    Find a layer carrying every column in REQUIRED_COLS.

    Returns (layer_name, None) on success, or (None, error_message).
    """
    import geopandas as gpd

    try:
        layers = gpd.list_layers(str(path))["name"].tolist()
    except Exception as e:
        return None, f"Could not read as a GeoPackage: {e}"

    if not layers:
        return None, "The GeoPackage contains no layers."

    best_layer, best_missing = None, None
    for layer in layers:
        try:
            head = gpd.read_file(str(path), layer=layer, rows=1)
        except Exception:
            continue
        missing = REQUIRED_COLS - set(head.columns)
        if not missing:
            return layer, None
        if best_missing is None or len(missing) < len(best_missing):
            best_layer, best_missing = layer, missing

    found = ", ".join(layers)
    if best_missing:
        cols = ", ".join(sorted(best_missing))
        return None, (
            f"No layer has the required columns. Closest was '{best_layer}', "
            f"missing: {cols}. Layers found: {found}."
        )
    return None, f"None of the layers could be read. Layers found: {found}."


def prepare(gpkg: Path, layer: str, progress=None) -> None:
    """Build the 4 prepared GeoJSON levels. progress(pct:int, message:str)."""
    import geopandas as gpd

    def report(pct: int, msg: str) -> None:
        if progress:
            progress(pct, msg)

    OUT_DIR.mkdir(exist_ok=True)

    report(0, f"Loading {gpkg.name} ...")
    src = gpd.read_file(str(gpkg), layer=layer)
    report(0, f"{len(src)} source features, CRS: {src.crs}")

    # Simplify tolerances below are in degrees, so the source must be lat/lon
    if src.crs is not None and src.crs.to_epsg() != 4326:
        report(0, f"Reprojecting {src.crs} -> EPSG:4326 ...")
        src = src.to_crs(4326)

    for cfg in LEVELS:
        lo, hi = cfg["pct_from"], cfg["pct_to"]
        span = hi - lo
        gdf = src.copy()

        if cfg["dissolve_by"]:
            report(lo, f"Dissolving {cfg['label']} ...")
            gdf = gdf.dissolve(by=cfg["dissolve_by"], aggfunc="first").reset_index()

        report(lo + span // 3, f"Simplifying {len(gdf)} {cfg['label']} ...")
        gdf["geometry"] = gdf.geometry.simplify(
            cfg["simplify_tol"], preserve_topology=True
        )

        # Representative point for label/fly-to placement
        rp = gdf.geometry.representative_point()
        gdf["label_lon"] = rp.x.round(5)
        gdf["label_lat"] = rp.y.round(5)

        cols = cfg["keep_cols"] + ["label_lon", "label_lat", "geometry"]
        gdf = gdf[[c for c in cols if c in gdf.columns]]

        report(lo + 2 * span // 3, f"Writing {cfg['label']} ...")
        out = OUT_DIR / f"{cfg['out']}.geojson"
        gdf.to_file(str(out), driver="GeoJSON")
        size_mb = out.stat().st_size / 1024 / 1024
        report(hi, f"Saved {len(gdf)} {cfg['label']} ({size_mb:.1f} MB)")

    report(100, "All levels prepared.")


if __name__ == "__main__":
    import sys

    gpkg = find_gpkg()
    if gpkg is None:
        print(f"No .gpkg found in {DATA_DIR}/ — download the source data first.")
        print("See the README, or start the app and follow the setup page.")
        sys.exit(1)

    print(f"Validating {gpkg} ...")
    layer, error = validate_gpkg(gpkg)
    if error:
        print(f"Error: {error}")
        sys.exit(1)
    print(f"  Using layer '{layer}'")

    prepare(gpkg, layer, progress=lambda pct, msg: print(f"  [{pct:3d}%] {msg}"))
    print("\nAll done. Run: uv run app.py")
