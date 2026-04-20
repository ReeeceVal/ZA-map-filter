'use strict';

window.Panels = (() => {
  const LEVEL_ORDER  = ['adm4', 'adm3', 'adm2', 'adm1'];
  const LEVEL_LABELS = { adm4: 'Wards', adm3: 'Municipalities', adm2: 'Districts', adm1: 'Provinces' };

  const GENERATORS = {
    sql:     () => AppState.generateSQL(),
    pandas:  () => AppState.generatePandas(),
    pyspark: () => AppState.generatePySpark(),
    r:       () => AppState.generateR(),
  };

  let currentLang = 'sql';

  function init() {
    document.getElementById('copy-btn').addEventListener('click', _copyOutput);
    document.getElementById('clear-btn').addEventListener('click', () => AppState.clearAll());

    const dfInput = document.getElementById('df-name-input');
    dfInput.value = (window.AppConfig && AppConfig.dfName) || 'df';
    dfInput.addEventListener('input', () => {
      if (window.AppConfig) AppConfig.dfName = dfInput.value || 'df';
      _renderOutput();
    });

    document.querySelectorAll('.lang-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        currentLang = btn.dataset.lang;
        document.querySelectorAll('.lang-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _updateDfWrap();
        _renderOutput();
      });
    });

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

    _updateDfWrap();
    render();
  }

  function _updateDfWrap() {
    const wrap = document.getElementById('df-name-wrap');
    wrap.classList.toggle('hidden', currentLang === 'sql');
  }

  function render() {
    _renderOutput();
    _renderSelection();
  }

  function _renderOutput() {
    const colorizers = {
      sql:     _colorizeSQL,
      pandas:  _colorizePython,
      pyspark: _colorizePython,
      r:       _colorizeR,
    };
    const text = GENERATORS[currentLang]();
    document.getElementById('sql-output').innerHTML = colorizers[currentLang](text);
  }

  function _colorizeSQL(sql) {
    if (!sql.includes('\n') && sql.startsWith('--')) {
      return `<span class="sql-comment">${_hesc(sql)}</span>`;
    }
    return sql.split('\n').map(line => {
      const ci = line.indexOf('--');
      const code    = ci >= 0 ? line.slice(0, ci) : line;
      const comment = ci >= 0 ? line.slice(ci)    : '';
      const coloredCode = _hesc(code).replace(/'([^']*)'/g,
        `<span class="sql-value">'$1'</span>`);
      const coloredComment = comment
        ? `<span class="sql-comment">${_hesc(comment)}</span>`
        : '';
      return coloredCode + coloredComment;
    }).join('\n');
  }

  function _colorizePython(code) {
    if (code.startsWith('#')) return `<span class="py-cmt">${_hesc(code)}</span>`;
    return code.split('\n').map(line => {
      const ci = line.indexOf('  #');
      const codePart = ci >= 0 ? line.slice(0, ci) : line;
      const cmtPart  = ci >= 0 ? line.slice(ci)    : '';
      const colored = _hesc(codePart)
        .replace(/'([^']*)'/g, `<span class="py-str">'$1'</span>`)
        .replace(/\b(from|import|col|df|isin|filter)\b/g, `<span class="py-kw">$1</span>`);
      const coloredCmt = cmtPart
        ? `<span class="py-cmt">${_hesc(cmtPart)}</span>`
        : '';
      return colored + coloredCmt;
    }).join('\n');
  }

  function _colorizeR(code) {
    if (code.startsWith('#')) return `<span class="r-cmt">${_hesc(code)}</span>`;
    return code.split('\n').map(line => {
      const ci = line.indexOf('  #');
      const codePart = ci >= 0 ? line.slice(0, ci) : line;
      const cmtPart  = ci >= 0 ? line.slice(ci)    : '';
      const colored = _hesc(codePart)
        .replace(/'([^']*)'/g, `<span class="r-str">'$1'</span>`)
        .replace(/(%in%|%&gt;%|&lt;-)/g, `<span class="r-op">$1</span>`)
        .replace(/\b(df|filter|library|c)\b/g, `<span class="r-kw">$1</span>`);
      const coloredCmt = cmtPart
        ? `<span class="r-cmt">${_hesc(cmtPart)}</span>`
        : '';
      return colored + coloredCmt;
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

  function _copyOutput() {
    const text = GENERATORS[currentLang]();
    navigator.clipboard.writeText(text).then(() => {
      _flashCopy();
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      _flashCopy();
    });
  }

  function _flashCopy() {
    const btn = document.getElementById('copy-btn');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 1600);
  }

  return { init, render };
})();
