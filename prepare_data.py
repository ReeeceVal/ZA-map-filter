"""
One-time script: dissolves SA ward GeoPackage into 4 ADM levels,
simplifies geometries, and writes prepared GeoJSON files.

Run once before starting the Flask app:
    py prepare_data.py
"""
import geopandas as gpd
from pathlib import Path

GPKG = Path("Data/SA_Ward_demarcations_2020.gpkg")
OUT_DIR = Path("prepared_data")
OUT_DIR.mkdir(exist_ok=True)

LEVELS = [
    {
        "out": "adm4_wards",
        "dissolve_by": None,
        "simplify_tol": 0.002,
        "keep_cols": [
            "ADM4_EN", "ADM4_PCODE",
            "ADM3_EN", "ADM3_ID",
            "ADM2_EN", "ADM2_ID",
            "ADM1_EN", "ADM1_ID",
        ],
    },
    {
        "out": "adm3_municipalities",
        "dissolve_by": "ADM3_PCODE",
        "simplify_tol": 0.005,
        "keep_cols": [
            "ADM3_EN", "ADM3_PCODE", "ADM3_ID",
            "ADM2_EN", "ADM2_ID",
            "ADM1_EN", "ADM1_ID",
        ],
    },
    {
        "out": "adm2_districts",
        "dissolve_by": "ADM2_PCODE",
        "simplify_tol": 0.01,
        "keep_cols": [
            "ADM2_EN", "ADM2_PCODE", "ADM2_ID",
            "ADM1_EN", "ADM1_ID",
        ],
    },
    {
        "out": "adm1_provinces",
        "dissolve_by": "ADM1_PCODE",
        "simplify_tol": 0.02,
        "keep_cols": ["ADM1_EN", "ADM1_PCODE", "ADM1_ID"],
    },
]

print(f"Loading {GPKG} ...")
src = gpd.read_file(GPKG, layer="SA_Ward")
print(f"  {len(src)} ward features, CRS: {src.crs}")

for cfg in LEVELS:
    print(f"\nProcessing {cfg['out']} ...")
    gdf = src.copy()

    if cfg["dissolve_by"]:
        key = cfg["dissolve_by"]
        print(f"  Dissolving by {key} ...")
        gdf = gdf.dissolve(by=key, aggfunc="first").reset_index()
        print(f"  -> {len(gdf)} features")

    print(f"  Simplifying (tol={cfg['simplify_tol']}) ...")
    gdf["geometry"] = gdf.geometry.simplify(cfg["simplify_tol"], preserve_topology=True)

    # Representative point for label/fly-to placement
    rp = gdf.geometry.representative_point()
    gdf["label_lon"] = rp.x.round(5)
    gdf["label_lat"] = rp.y.round(5)

    cols = cfg["keep_cols"] + ["label_lon", "label_lat", "geometry"]
    gdf = gdf[[c for c in cols if c in gdf.columns]]

    out = OUT_DIR / f"{cfg['out']}.geojson"
    gdf.to_file(str(out), driver="GeoJSON")
    size_mb = out.stat().st_size / 1024 / 1024
    print(f"  Saved {len(gdf)} features -> {out} ({size_mb:.1f} MB)")

print("\nAll done. Run: py app.py")
