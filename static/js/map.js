'use strict';

window.MapManager = (() => {
  const TILE_URL  = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

  // Config per ADM level
  const CFG = {
    adm1: { url: '/data/adm1.geojson', idCol: 'ADM1_ID',    labelCol: 'ADM1_EN', flyZoom: 7,  labelZoom: 5  },
    adm2: { url: '/data/adm2.geojson', idCol: 'ADM2_ID',    labelCol: 'ADM2_EN', flyZoom: 9,  labelZoom: 6  },
    adm3: { url: '/data/adm3.geojson', idCol: 'ADM3_ID',    labelCol: 'ADM3_EN', flyZoom: 11, labelZoom: 8  },
    adm4: { url: '/data/adm4.geojson', idCol: 'ADM4_PCODE', labelCol: 'ADM4_EN', flyZoom: 13, labelZoom: 11 },
  };

  // Which parent levels to show as outlines when a lower level is active.
  // Listed inner-to-outer so they're added in that draw order (outermost on top).
  const OVERLAYS_FOR = {
    adm1: [],
    adm2: ['adm1'],
    adm3: ['adm2', 'adm1'],
    adm4: ['adm3', 'adm2', 'adm1'],
  };

  // Outline style per overlay level — thicker = higher in hierarchy
  const OVERLAY_STYLE = {
    adm3: { color: '#546e7a', weight: 1.5, opacity: 0.75, fillOpacity: 0 },
    adm2: { color: '#90a4ae', weight: 2.5, opacity: 0.70, fillOpacity: 0 },
    adm1: { color: '#cfd8dc', weight: 4.0, opacity: 0.60, fillOpacity: 0 },
  };

  let _map;
  const _layers        = {};     // level → L.GeoJSON (interactive)
  const _labels        = {};     // level → L.LayerGroup
  const _byId          = {};     // level → { id → L.Path }
  const _data          = {};     // level → raw GeoJSON (for overlay reuse)
  const _overlayLayers = {};     // level → L.GeoJSON outline (non-interactive, lazy)
  const _loading = new Set();
  let _crossHighlight  = null;   // L.GeoJSON: selected features from non-active levels

  let _canvas;

  function _style(level, feature) {
    const id  = feature.properties[CFG[level].idCol];
    const sel = AppState.isSelected(level, id);
    return {
      color:       sel ? '#00e5ff' : '#546e7a',
      weight:      sel ? 2         : 0.5,
      fillColor:   sel ? '#00e5ff' : '#37474f',
      fillOpacity: sel ? 0.38      : 0.15,
      opacity: 1,
    };
  }

  function _buildLayer(level, geojson) {
    _byId[level] = {};
    const labelGroup = L.layerGroup();
    const cfg = CFG[level];

    const layer = L.geoJSON(geojson, {
      renderer: _canvas,
      style: f => _style(level, f),
      onEachFeature: (feature, lyr) => {
        const p  = feature.properties;
        const id = p[cfg.idCol];
        _byId[level][id] = lyr;

        // Tooltip
        lyr.bindTooltip(AppState.getDisplayName(level, p), {
          sticky: true,
          className: 'map-tooltip',
        });

        // Click → toggle selection
        lyr.on('click', e => {
          L.DomEvent.stopPropagation(e);
          AppState.toggleFeature(level, id, p);
          // Immediately update this single layer without full refresh
          lyr.setStyle(_style(level, feature));
          if (window.Panels) Panels.render();
        });

        // Hover
        lyr.on('mouseover', () => {
          const sel = AppState.isSelected(level, id);
          lyr.setStyle({
            ..._style(level, feature),
            fillOpacity: sel ? 0.55 : 0.3,
            weight: sel ? 2.5 : 1,
          });
        });
        lyr.on('mouseout', () => lyr.setStyle(_style(level, feature)));

        // Label marker
        if (p.label_lat != null && p.label_lon != null) {
          const name = level === 'adm4' ? `Ward ${p.ADM4_EN}` : p[cfg.labelCol];
          labelGroup.addLayer(L.marker([p.label_lat, p.label_lon], {
            icon: L.divIcon({
              className: `map-label map-label-${level}`,
              html: `<span>${name}</span>`,
              iconSize: null,
              iconAnchor: [0, 0],
            }),
            interactive: false,
            zIndexOffset: -1000,
          }));
        }
      },
    });

    _layers[level] = layer;
    _labels[level] = labelGroup;
  }

  async function _load(level) {
    if (_layers[level] || _loading.has(level)) return;
    _loading.add(level);
    const resp = await fetch(CFG[level].url);
    const geojson = await resp.json();
    _data[level] = geojson;          // store for overlay reuse
    _buildLayer(level, geojson);
    _loading.delete(level);
  }

  // Lazily build a non-interactive outline-only layer for parent boundary display.
  function _buildOverlay(level) {
    if (_overlayLayers[level] || !_data[level]) return;
    const s = OVERLAY_STYLE[level];
    _overlayLayers[level] = L.geoJSON(_data[level], {
      renderer: _canvas,
      interactive: false,
      style: () => s,
    });
  }

  function _removeOverlays() {
    Object.values(_overlayLayers).forEach(l => {
      if (_map.hasLayer(l)) _map.removeLayer(l);
    });
  }

  function _addOverlaysForLevel(level) {
    for (const ol of OVERLAYS_FOR[level]) {
      _buildOverlay(ol);
      if (_overlayLayers[ol]) _map.addLayer(_overlayLayers[ol]);
    }
  }

  // Rebuild the cross-level selection highlight layer.
  // Shows selected features from non-active levels as dashed outlines (view-only).
  function _updateCrossHighlights() {
    if (_crossHighlight) {
      if (_map.hasLayer(_crossHighlight)) _map.removeLayer(_crossHighlight);
      _crossHighlight = null;
    }

    const activeLevel = AppState.activeLevel;
    const features = [];

    for (const [lvl, selMap] of Object.entries(AppState.selected)) {
      if (lvl === activeLevel || selMap.size === 0 || !_data[lvl]) continue;
      const cfg = CFG[lvl];
      const ids = new Set(selMap.keys());
      for (const feat of _data[lvl].features) {
        if (ids.has(feat.properties[cfg.idCol])) features.push(feat);
      }
    }

    if (!features.length) return;

    _crossHighlight = L.geoJSON({ type: 'FeatureCollection', features }, {
      renderer: _canvas,
      interactive: false,
      style: () => ({
        color:       '#00e5ff',
        weight:      2.5,
        opacity:     0.7,
        fillColor:   '#00e5ff',
        fillOpacity: 0.07,
        dashArray:   '6 4',
      }),
    });
    _map.addLayer(_crossHighlight);
  }

  async function _switchTo(level) {
    const prev = AppState.activeLevel;

    // Remove old layers, overlays, and cross-highlights from map
    if (_layers[prev])  _map.removeLayer(_layers[prev]);
    if (_labels[prev])  _map.removeLayer(_labels[prev]);
    _removeOverlays();
    if (_crossHighlight && _map.hasLayer(_crossHighlight)) _map.removeLayer(_crossHighlight);

    AppState.activeLevel = level;

    // Update button states
    document.querySelectorAll('.level-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.level === level)
    );

    // Load if needed
    if (!_layers[level]) {
      const btn = document.querySelector(`.level-btn[data-level="${level}"]`);
      if (btn) btn.classList.add('loading');
      await _load(level);
      if (btn) btn.classList.remove('loading');
    }

    // Add main layer first (drawn below overlays in shared canvas)
    _layers[level].setStyle(f => _style(level, f));
    _map.addLayer(_layers[level]);

    // Add parent boundary overlays on top
    _addOverlaysForLevel(level);

    // Cross-level selection highlights on top of everything canvas-rendered
    _updateCrossHighlights();

    _updateLabels();
  }

  function _updateLabels() {
    const level = AppState.activeLevel;
    const group = _labels[level];
    if (!group) return;
    const zoom = _map.getZoom();
    if (zoom >= CFG[level].labelZoom) {
      if (!_map.hasLayer(group)) _map.addLayer(group);
    } else {
      if (_map.hasLayer(group)) _map.removeLayer(group);
    }
  }

  // Public: re-style active layer + rebuild cross-level highlights (called by AppState._notify)
  function refreshActiveLayer() {
    const level = AppState.activeLevel;
    if (_layers[level]) _layers[level].setStyle(f => _style(level, f));
    _updateCrossHighlights();
  }

  // Public: fly to a specific feature by level + id
  function flyTo(level, id) {
    // Ensure level is active
    if (AppState.activeLevel !== level) {
      _switchTo(level).then(() => _flyToId(level, id));
    } else {
      _flyToId(level, id);
    }
  }

  function _flyToId(level, id) {
    const lyr = (_byId[level] || {})[id];
    if (!lyr) return;
    try {
      const bounds = lyr.getBounds();
      if (bounds && bounds.isValid()) {
        _map.flyToBounds(bounds, { duration: 0.8, padding: [40, 40] });
        return;
      }
    } catch (_) {}
    const p = lyr.feature.properties;
    if (p.label_lat != null) {
      _map.flyTo([p.label_lat, p.label_lon], CFG[level].flyZoom, { duration: 0.8 });
    }
  }

  // Public: fly to raw coordinates
  function flyToLatLng(lat, lng, zoom) {
    _map.flyTo([lat, lng], zoom, { duration: 0.8 });
  }

  // Public: briefly highlight a feature (search result flash)
  function highlightFeature(level, id) {
    const lyr = (_byId[level] || {})[id];
    if (!lyr) return;
    lyr.setStyle({ color: '#fff176', weight: 3, fillColor: '#fff176', fillOpacity: 0.45 });
    setTimeout(() => lyr.setStyle(_style(level, lyr.feature)), 2000);
  }

  // Public: switch level (used by search)
  function switchLevel(level) {
    _switchTo(level);
  }

  function init() {
    _canvas = L.canvas({ padding: 0.5 });

    _map = L.map('map', {
      center: [-28.5, 25.0],
      zoom: 6,
      zoomControl: true,
    });

    L.tileLayer(TILE_URL, {
      attribution: TILE_ATTR,
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(_map);

    _map.on('zoomend', _updateLabels);

    // Level buttons
    document.querySelectorAll('.level-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!btn.classList.contains('loading')) {
          _switchTo(btn.dataset.level);
        }
      });
    });

    // Load ADM1 then ADM2, then switch to ADM2 as default
    _load('adm1').then(() => {
      _load('adm2').then(() => _switchTo('adm2'));
    });

    // Pre-fetch ADM3 in background after initial render
    setTimeout(() => _load('adm3'), 1500);
  }

  function getMap() { return _map; }

  return { init, refreshActiveLayer, flyTo, flyToLatLng, highlightFeature, switchLevel, getMap };
})();
