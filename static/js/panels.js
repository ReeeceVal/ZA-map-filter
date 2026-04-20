'use strict';

window.Panels = (() => {
  const LEVEL_ORDER  = ['adm4', 'adm3', 'adm2', 'adm1'];
  const LEVEL_LABELS = { adm4: 'Wards', adm3: 'Municipalities', adm2: 'Districts', adm1: 'Provinces' };

  function init() {
    document.getElementById('copy-btn').addEventListener('click', _copySQL);
    document.getElementById('clear-btn').addEventListener('click', () => AppState.clearAll());

    // Event delegation for locate / remove buttons
    document.getElementById('sel-list').addEventListener('click', e => {
      const locate = e.target.closest('.item-btn.locate');
      const remove = e.target.closest('.item-btn.remove');
      if (locate) {
        const item = locate.closest('.sel-item');
        MapManager.flyTo(item.dataset.level, item.dataset.id);
      }
      if (remove) {
        const item = remove.closest('.sel-item');
        AppState.removeFeature(item.dataset.level, item.dataset.id);
      }
    });

    render();
  }

  function render() {
    _renderSQL();
    _renderSelection();
  }

  function _renderSQL() {
    document.getElementById('sql-output').innerHTML = _colorizeSQL(AppState.generateSQL());
  }

  function _colorizeSQL(sql) {
    // Handle empty state
    if (!sql.includes('\n') && sql.startsWith('--')) {
      return `<span class="sql-comment">${_hesc(sql)}</span>`;
    }
    return sql.split('\n').map(line => {
      // Split at first '--' to separate code from comment
      const ci = line.indexOf('--');
      const code    = ci >= 0 ? line.slice(0, ci) : line;
      const comment = ci >= 0 ? line.slice(ci)    : '';
      // Wrap quoted values in the code portion
      const coloredCode = _hesc(code).replace(/'([^']*)'/g,
        `<span class="sql-value">'$1'</span>`);
      const coloredComment = comment
        ? `<span class="sql-comment">${_hesc(comment)}</span>`
        : '';
      return coloredCode + coloredComment;
    }).join('\n');
  }

  function _hesc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function _renderSelection() {
    const list = document.getElementById('sel-list');
    let html = '';
    let hasAny = false;

    for (const level of LEVEL_ORDER) {
      const items = [...AppState.selected[level].entries()];
      if (!items.length) continue;
      hasAny = true;

      html += `<div class="sel-group">`;
      html += `<div class="sel-group-header">${LEVEL_LABELS[level]} <span style="font-weight:400;opacity:.6">(${items.length})</span></div>`;
      for (const [id, data] of items) {
        const esc = id.replace(/"/g, '&quot;');
        html += `
          <div class="sel-item" data-level="${level}" data-id="${esc}">
            <span class="sel-item-name" title="${data.displayName.replace(/"/g, '&quot;')}">${data.displayName}</span>
            <button class="item-btn locate" title="Locate on map">&#9678;</button>
            <button class="item-btn remove" title="Remove">&times;</button>
          </div>`;
      }
      html += `</div>`;
    }

    list.innerHTML = hasAny
      ? html
      : '<div class="sel-empty">Click map features to add regions to query</div>';
  }

  function _copySQL() {
    const sql = AppState.generateSQL();
    navigator.clipboard.writeText(sql).then(() => {
      const btn = document.getElementById('copy-btn');
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1600);
    }).catch(() => {
      // Fallback for non-HTTPS
      const ta = document.createElement('textarea');
      ta.value = sql;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      const btn = document.getElementById('copy-btn');
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1600);
    });
  }

  return { init, render };
})();
