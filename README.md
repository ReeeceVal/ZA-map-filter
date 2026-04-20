# SA Region Filter Builder

A Flask + Leaflet.js tool for visually selecting South African administrative regions and generating filter code for spatial analysis — output in **SQL, Pandas, PySpark, or R**.

---

## First-time setup

### 1. Get the base demarcation data

The GeoPackage is **not committed to git** (too large). Download it manually:

**SA 2020 Ward Demarcations** — [MDB SA Open Data Portal](https://dataportal-mdb-sa.opendata.arcgis.com/datasets/279fbf82a48f46678ddd498627af3f0a_0/explore?location=-28.479600%2C24.698437%2C6)

Download as **GeoPackage (.gpkg)** and place it at:
```
Data/SA_Ward_demarcations_2020.gpkg
```

> This is the South Africa example dataset. The app expects ward-level polygons with `ADM1`–`ADM4` columns in the standard OCHA/HDX naming convention. Any country's equivalent dataset in EPSG:4326 with the same column schema will work.

### 2. Install dependencies and prepare data

```powershell
py -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt

# One-time: dissolve + simplify the GeoPackage into 4 optimised GeoJSON layers
py prepare_data.py
```

`prepare_data.py` reads the raw `.gpkg` and writes four simplified GeoJSON files to `prepared_data/` (also git-ignored):

| File | Level | Features |
|------|-------|----------|
| `adm1_provinces.geojson` | Province | 9 |
| `adm2_districts.geojson` | District | 52 |
| `adm3_municipalities.geojson` | Municipality | 213 |
| `adm4_wards.geojson` | Ward | 4 392 |

You only need to run this once (or again if the source `.gpkg` changes).

### 3. Start the app

```powershell
py app.py
```

Open `http://localhost:5000`.


---

## Usage

- Toggle between **Province / District / Municipality / Ward** levels using the buttons at the bottom of the map.
- **Click** any region to add it to the filter. Click again to deselect.
- Selected regions from other levels remain visible as dashed outlines when you switch levels.
- Use the **search bar** (top) to jump to any region by name across all levels.
- The **Filter Output panel** (left) shows the live filter code — click **Copy ↗** or press `Ctrl+Shift+X` to copy.
- The **Selected panel** (right) lists chosen regions grouped by level; use ⊙ to locate and × to remove.
- Drag the dividers between panels to resize them.

---

## Filter output languages

Switch between languages using the pill tabs at the top of the Filter Output panel.

### SQL
```sql
WHERE ADM4_PCODE IN ('ZA...', ...) -- Wards
   OR ADM3_ID    IN ('...', ...)   -- Municipalities
   OR ADM2_ID    IN ('...', ...)   -- Districts
   OR ADM1_ID    IN ('...', ...)   -- Provinces
```

### Pandas (Python)
```python
df = df[
    df['ADM2_ID'].isin(['ZA...', ...]) |  # Districts
    df['ADM1_ID'].isin(['ZA...'])          # Provinces
]
```

### PySpark
```python
from pyspark.sql.functions import col

df = df.filter(
    col('ADM2_ID').isin(['ZA...', ...]) |  # Districts
    col('ADM1_ID').isin(['ZA...'])          # Provinces
)
```

### R / dplyr
```r
df <- df %>%
  filter(
    ADM2_ID %in% c('ZA...', ...) |  # Districts
    ADM1_ID %in% c('ZA...')          # Provinces
  )
```

### Configuring the default variable name

For Pandas, PySpark, and R output the variable name defaults to `df`. To change the default, edit `static/js/config.js`:

```js
window.AppConfig = {
  dfName: 'gdf',  // change to whatever your DataFrame is called
};
```

The name can also be changed per-session using the `var` input that appears next to the language tabs when a non-SQL language is active.

---

## Adding point reference layers

Drop any number of `.geojson` files into the `layers/` folder. They are auto-discovered on app startup — no code changes needed.

```
layers/
  points.geojson
  other_points.geojson
```

Each file appears as a toggle button in the **bottom-left panel** of the map, with a distinct colour. Clicking it loads and displays the points; a dropdown next to the button selects which property to show in the tooltip (defaults to `name`, `names`, `label`, or `title` if present).

### GeoJSON format requirements

- CRS: **EPSG:4326** (WGS 84) — standard for GeoJSON
- Geometry type: `Point` (one feature per point)
- Any properties are fine; include at least a human-readable name field

Minimal example:
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [28.04, -26.20] },
      "properties": { "name": "Site A", "type": "example" }
    }
  ]
}
```

Export from **QGIS**: *Layer → Export → Save Features As → GeoJSON, CRS: EPSG:4326*  
Export from **geopandas**: `gdf.to_crs(4326).to_file("output.geojson")`  
Export from **ArcGIS Pro**: *Share → Export Features → GeoJSON*

> `layers/` is git-ignored by default. Add specific files to git explicitly if needed.

---

## Data sources

| Asset | Location | Tracked in git |
|-------|----------|----------------|
| Source GeoPackage | `Data/SA_Ward_demarcations_2020.gpkg` | No — download separately |
| Prepared GeoJSON layers | `prepared_data/` | No — generated by `prepare_data.py` |
| Point reference layers | `layers/*.geojson` | No — add manually |
