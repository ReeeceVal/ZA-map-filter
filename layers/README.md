# Point reference layers

Drop `.geojson` files in this folder. They are picked up when the app starts
(restart to see a new file) and appear as toggle buttons in the bottom-left of
the map.

See `example_sites.geojson` for a working file you can copy.

## Requirements

| | |
|---|---|
| File type | `.geojson` only (`.json`, `.shp`, `.gpkg`, `.csv` are ignored) |
| CRS | **EPSG:4326** (WGS 84), lon/lat decimal degrees — the GeoJSON default |
| Coordinate order | `[longitude, latitude]` — e.g. `[28.05, -26.20]` for Johannesburg |
| Geometry | `Point`, one per feature |
| Properties | Anything. Include a name-ish field for tooltips |

The tooltip field defaults to the first property named `name`, `names`,
`label`, `title`, `nom` or `naam`; otherwise the first property. Any property
can be chosen from the dropdown next to the layer's toggle button.

The button label comes from the filename: `retail_sites.geojson` → "Retail Sites".

## Minimal file

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [28.04, -26.20] },
      "properties": { "name": "Site A" }
    }
  ]
}
```

## Exporting

- **QGIS** — Layer → Export → Save Features As… → GeoJSON, CRS `EPSG:4326`
- **geopandas** — `gdf.to_crs(4326).to_file("layers/my_sites.geojson")`
- **ArcGIS Pro** — Share → Export Features → GeoJSON

## Git

Everything in this folder is git-ignored except this README and
`example_sites.geojson`, so your own layers stay local. To track one, force-add
it: `git add -f layers/my_sites.geojson`.
