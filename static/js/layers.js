'use strict';

window.LayerManager = (() => {
  // Distinct palette — clear of the cyan accent (#00e5ff) used by selections
  const COLORS = ['#ff6b6b', '#ffd93d', '#6bcb77', '#a78bfa'];

  // Each entry: { meta, geojson, active, color, currentField }
  const _entries = {};

  let _map;
  // Own canvas renderer so point layers always render above polygon canvases
  let _canvas;

  async function init(map) {
    _map    = map;
    _canvas = L.canvas({ padding: 0.5 });

    const resp  = await fetch('/api/layers');
    const metas = await resp.json();
    if (!metas.length) return;

    const panel = document.getElementById('point-layers-panel');
    panel.style.display = 'flex';

    metas.forEach((meta, i) => {
      const color = COLORS[i % COLORS.length];
      _entries[meta.id] = { meta, geojson: null, active: false, color, currentField: meta.defaultField };
      _buildItem(panel, meta, color);
    });
  }

  // ── Panel item ──────────────────────────────────────────
  function _buildItem(panel, meta, color) {
    const wrap = document.createElement('div');
    wrap.className = 'layer-item';

    // Toggle button
    const btn = document.createElement('button');
    btn.className = 'layer-toggle';
    btn.dataset.id = meta.id;
    btn.innerHTML = `<span class="layer-dot" style="background:${color};box-shadow:0 0 5px ${color}88"></span>${meta.label}`;
    btn.addEventListener('click', () => _toggle(meta.id));

    // Field selector dropdown
    const sel = document.createElement('select');
    sel.className = 'layer-field-sel';
    sel.title = 'Tooltip label field';
    meta.fields.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f;
      opt.textContent = f;
      if (f === meta.defaultField) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', e => _setField(meta.id, e.target.value));

    wrap.appendChild(btn);
    wrap.appendChild(sel);
    panel.appendChild(wrap);
  }

  // ── Toggle on/off ────────────────────────────────────────
  async function _toggle(id) {
    const entry = _entries[id];
    if (!entry) return;

    if (entry.active) {
      if (entry.geojson) _map.removeLayer(entry.geojson);
      entry.active = false;
    } else {
      if (!entry.geojson) await _load(id);
      _map.addLayer(entry.geojson);
      entry.active = true;
    }
    _refreshBtn(id);
  }

  // ── Load GeoJSON and build Leaflet layer ─────────────────
  async function _load(id) {
    const entry = _entries[id];
    const resp  = await fetch(entry.meta.url);
    const data  = await resp.json();

    entry.geojson = L.geoJSON(data, {
      renderer: _canvas,
      pointToLayer: (_, latlng) => L.circleMarker(latlng, {
        radius:      5,
        color:       entry.color,
        weight:      1.5,
        fillColor:   entry.color,
        fillOpacity: 0.85,
      }),
      onEachFeature: (feature, layer) => {
        _bindTip(layer, feature.properties, entry.currentField);
        // Allow clicking through to underlying map features
        layer.on('click', e => L.DomEvent.stopPropagation(e));
      },
    });
  }

  // ── Tooltip helpers ──────────────────────────────────────
  function _bindTip(layer, props, field) {
    const val = props[field] ?? '';
    layer.bindTooltip(String(val), { sticky: true, className: 'map-tooltip' });
  }

  function _setField(id, field) {
    const entry = _entries[id];
    if (!entry) return;
    entry.currentField = field;
    if (!entry.geojson) return;
    entry.geojson.eachLayer(lyr => {
      lyr.unbindTooltip();
      _bindTip(lyr, lyr.feature.properties, field);
    });
  }

  // ── Button state ─────────────────────────────────────────
  function _refreshBtn(id) {
    const btn = document.querySelector(`.layer-toggle[data-id="${id}"]`);
    if (!btn) return;
    const entry = _entries[id];
    btn.classList.toggle('active', entry.active);
    // Dim dot when off
    const dot = btn.querySelector('.layer-dot');
    if (dot) dot.style.opacity = entry.active ? '1' : '0.35';
  }

  return { init };
})();
