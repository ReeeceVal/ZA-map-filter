'use strict';

window.Search = (() => {
  const LEVEL_LABEL = { adm1: 'Province', adm2: 'District', adm3: 'Municipality', adm4: 'Ward' };
  const FLY_ZOOM   = { adm1: 7, adm2: 9, adm3: 11, adm4: 13 };

  let _timer = null;

  function init() {
    const input   = document.getElementById('search-input');
    const results = document.getElementById('search-results');

    input.addEventListener('input', () => {
      clearTimeout(_timer);
      const q = input.value.trim();
      if (q.length < 2) {
        _hide();
        return;
      }
      _timer = setTimeout(() => _doSearch(q), 220);
    });

    // Re-show dropdown on focus if there's already a value
    input.addEventListener('focus', () => {
      if (input.value.trim().length >= 2 && results.innerHTML) {
        results.classList.remove('hidden');
      }
    });

    // Hide on outside click
    document.addEventListener('click', e => {
      if (!e.target.closest('#search-bar')) _hide();
    });

    // Escape key
    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') { _hide(); input.blur(); }
    });
  }

  async function _doSearch(q) {
    const resp = await fetch(`/search?q=${encodeURIComponent(q)}&limit=8`);
    const items = await resp.json();
    _renderResults(items);
  }

  function _renderResults(items) {
    const results = document.getElementById('search-results');
    if (!items.length) {
      results.innerHTML = '<div class="search-no-results">No results found</div>';
      results.classList.remove('hidden');
      return;
    }

    results.innerHTML = items.map(item => {
      const label  = LEVEL_LABEL[item.level] || item.level;
      const name   = _esc(item.displayName);
      return `<div class="search-result"
                   data-level="${item.level}"
                   data-id="${_esc(item.id)}"
                   data-lat="${item.labelLat}"
                   data-lon="${item.labelLon}">
                <span class="search-level">${label}</span>
                <span class="search-name">${name}</span>
              </div>`;
    }).join('');
    results.classList.remove('hidden');

    results.querySelectorAll('.search-result').forEach(el => {
      el.addEventListener('click', () => {
        const level = el.dataset.level;
        const lat   = parseFloat(el.dataset.lat);
        const lon   = parseFloat(el.dataset.lon);
        const zoom  = FLY_ZOOM[level] || 9;

        MapManager.switchLevel(level);
        MapManager.flyToLatLng(lat, lon, zoom);

        // Highlight after level switch animation completes
        setTimeout(() => MapManager.highlightFeature(level, el.dataset.id), 900);

        // Update input with selected name, hide dropdown
        document.getElementById('search-input').value =
          el.querySelector('.search-name').textContent;
        _hide();
      });
    });
  }

  function _hide() {
    document.getElementById('search-results').classList.add('hidden');
  }

  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  return { init };
})();
