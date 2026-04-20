'use strict';

window.AppState = (() => {
  const ID_COL   = { adm1: 'ADM1_ID', adm2: 'ADM2_ID', adm3: 'ADM3_ID', adm4: 'ADM4_PCODE' };
  const NAME_COL = { adm1: 'ADM1_EN', adm2: 'ADM2_EN', adm3: 'ADM3_EN', adm4: 'ADM4_EN'    };

  let activeLevel = 'adm2';

  const selected = {
    adm1: new Map(),
    adm2: new Map(),
    adm3: new Map(),
    adm4: new Map(),
  };

  function getId(level, props)  { return props[ID_COL[level]]   || ''; }
  function getName(level, props){ return props[NAME_COL[level]] || ''; }

  function getDisplayName(level, props) {
    if (level === 'adm4') return `Ward ${props.ADM4_EN} \u2014 ${props.ADM3_EN}`;
    return getName(level, props);
  }

  function isSelected(level, id) {
    return selected[level].has(id);
  }

  function toggleFeature(level, id, props) {
    if (selected[level].has(id)) {
      selected[level].delete(id);
    } else {
      selected[level].set(id, {
        id,
        displayName: getDisplayName(level, props),
        labelLat: props.label_lat,
        labelLon: props.label_lon,
      });
    }
    _notify();
  }

  function removeFeature(level, id) {
    selected[level].delete(id);
    _notify();
  }

  function clearAll() {
    Object.values(selected).forEach(m => m.clear());
    _notify();
  }

  const _LEVELS = ['adm4', 'adm3', 'adm2', 'adm1'];
  const _SQL_COL = { adm4: 'ADM4_PCODE', adm3: 'ADM3_ID', adm2: 'ADM2_ID', adm1: 'ADM1_ID' };
  const _CMT     = { adm4: 'Wards', adm3: 'Municipalities', adm2: 'Districts', adm1: 'Provinces' };

  function _activeEntries() {
    return _LEVELS
      .filter(lvl => selected[lvl].size)
      .map(lvl => ({
        lvl,
        col:  _SQL_COL[lvl],
        cmt:  _CMT[lvl],
        vals: [...selected[lvl].keys()].map(k => `'${k}'`).join(', '),
      }));
  }

  function generateSQL() {
    const entries = _activeEntries();
    if (!entries.length) return '-- No features selected';
    const parts = entries.map(e => `    ${e.col} IN (${e.vals}) -- ${e.cmt}`);
    return 'WHERE ' + parts.join('\n   OR ');
  }

  function _dfName() {
    return (window.AppConfig && AppConfig.dfName) || 'df';
  }

  function generatePandas() {
    const entries = _activeEntries();
    if (!entries.length) return '# No features selected';
    const n = _dfName();
    const lines = entries.map((e, i) => {
      const pipe = i < entries.length - 1 ? ' |' : '';
      return `    ${n}['${e.col}'].isin([${e.vals}])${pipe}  # ${e.cmt}`;
    });
    return `${n} = ${n}[\n` + lines.join('\n') + '\n]';
  }

  function generatePySpark() {
    const entries = _activeEntries();
    if (!entries.length) return '# No features selected';
    const n = _dfName();
    const lines = entries.map((e, i) => {
      const pipe = i < entries.length - 1 ? ' |' : '';
      return `    col('${e.col}').isin([${e.vals}])${pipe}  # ${e.cmt}`;
    });
    return `from pyspark.sql.functions import col\n\n${n} = ${n}.filter(\n` + lines.join('\n') + '\n)';
  }

  function generateR() {
    const entries = _activeEntries();
    if (!entries.length) return '# No features selected';
    const n = _dfName();
    const lines = entries.map((e, i) => {
      const pipe = i < entries.length - 1 ? ' |' : '';
      return `    ${e.col} %in% c(${e.vals})${pipe}  # ${e.cmt}`;
    });
    return `${n} <- ${n} %>%\n  filter(\n` + lines.join('\n') + '\n  )';
  }

  function _notify() {
    if (window.Panels)     Panels.render();
    if (window.MapManager) MapManager.refreshActiveLayer();
  }

  return {
    get activeLevel()       { return activeLevel; },
    set activeLevel(v)      { activeLevel = v; },
    selected,
    getId,
    getName,
    getDisplayName,
    isSelected,
    toggleFeature,
    removeFeature,
    clearAll,
    generateSQL,
    generatePandas,
    generatePySpark,
    generateR,
  };
})();
