# SA Region Filter Builder

A Flask + Leaflet.js tool for visually selecting South African administrative regions and generating filter code for spatial analysis — output in **SQL, Pandas, PySpark, R, or a Python dictionary**.

---

## Quick start

Dependencies are managed with [uv](https://docs.astral.sh/uv/). It creates the
virtual environment, installs the locked versions, and runs the app:

```powershell
uv sync
uv run app.py
```

Open `http://localhost:5000`.

The base map data is **not committed to git** (too large), so on first run the app
shows a **setup page** instead of the map. It walks you through it:

1. Download **SA 2020 Ward Demarcations** as **GeoPackage (.gpkg)** from the
   [MDB SA Open Data Portal](https://dataportal-mdb-sa.opendata.arcgis.com/datasets/279fbf82a48f46678ddd498627af3f0a_0/explore?location=-28.479600%2C24.698437%2C6)
   — the link is on the page.
2. Drag the `.gpkg` onto the drop zone. It is validated, saved to `Data/`, and
   dissolved into the four map layers with a live progress bar (~1–3 minutes).
3. Click **Open the app** — no restart needed.

That's it. Subsequent starts go straight to the map.

### Using another country's data

The app expects ward-level polygons with `ADM1`–`ADM4` columns in the standard
OCHA/HDX naming convention. Any country's equivalent dataset will work — the
setup step scans the GeoPackage's layers and picks the first one carrying those
columns, and reprojects to EPSG:4326 if needed. If validation fails it tells you
which columns were missing and which layers it found.

### Command-line alternative

If you'd rather not use the setup page, drop the `.gpkg` into `Data/` yourself and run:

```powershell
uv run prepare_data.py
```

Either route writes the same four simplified GeoJSON files to `prepared_data/`
(also git-ignored):

| File | Level | Features |
|------|-------|----------|
| `adm1_provinces.geojson` | Province | 9 |
| `adm2_districts.geojson` | District | 52 |
| `adm3_municipalities.geojson` | Municipality | 213 |
| `adm4_wards.geojson` | Ward | 4 392 |

You only need to do this once (or again if the source `.gpkg` changes).


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

## Filter output formats

Switch between formats using the pill tabs at the top of the Filter Output panel.

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

### Python dictionary

Emits a fixed-shape `admin_dict` for use as a lookup or filter spec. Every key is
always present; the ID columns carry the selection (`ADM4_PCODE` for wards,
`ADM3_ID` / `ADM2_ID` / `ADM1_ID` for the levels above), and the name columns are
left empty for the consumer to fill.

```python
admin_dict = {
    "ADM4_PCODE": [],
    "ADM3_EN": [],
    "ADM3_ID": ["ZAdc13201", ...],
    "ADM2_EN": [],
    "ADM2_ID": ["ZAdc132", ...],
    "ADM1_EN": [],
    "ADM1_ID": ["ZA-WC"]
}
```

### Configuring the default variable name

For Pandas, PySpark, and R output the variable name defaults to `df`. To change the default, edit `static/js/config.js`:

```js
window.AppConfig = {
  dfName: 'gdf',  // change to whatever your DataFrame is called
};
```

The name can also be changed per-session using the `var` input that appears next to the format tabs when Pandas, PySpark, or R is active.

---

## Adding point reference layers

Drop any number of `.geojson` files into the `layers/` folder. This enables a reference for selecting regions aligned with any set of points. They are auto-discovered on app startup — no code changes needed.

```
layers/
  README.md                 # format guide
  example_sites.geojson     # worked example — ships with the repo
  my_sites.geojson          # ← yours
```

Each file appears as a toggle button in the **bottom-left panel** of the map, with a distinct colour. Clicking it loads and displays the points; a dropdown next to the button selects which property to show in the tooltip (defaults to `name`, `names`, `label`, or `title` if present).


[`layers/README.md`](layers/READMEcontainssdetails on adding these   for **QGIS**, **geopandas** and **ArcGIS Pro**.


---

## Data sources

| Asset | Location | Tracked in git |
|-------|----------|----------------|
| Source GeoPackage | `Data/*.gpkg` | No — added via the setup page |
| Prepared GeoJSON layers | `prepared_data/` | No — generated by `prepare_data.py` |
| Point reference layers | `layers/*.geojson` | No — add manually (except `example_sites.geojson`) |
