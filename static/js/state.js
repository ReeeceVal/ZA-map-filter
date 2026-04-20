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

  function generateSQL() {
    const parts = [];

    if (selected.adm4.size) {
      const vals = [...selected.adm4.keys()].map(k => `'${k}'`).join(', ');
      parts.push(`    ADM4_PCODE IN (${vals}) -- Wards`);
    }
    if (selected.adm3.size) {
      const vals = [...selected.adm3.keys()].map(k => `'${k}'`).join(', ');
      parts.push(`    ADM3_ID IN (${vals}) -- Municipalities`);
    }
    if (selected.adm2.size) {
      const vals = [...selected.adm2.keys()].map(k => `'${k}'`).join(', ');
      parts.push(`    ADM2_ID IN (${vals}) -- Districts`);
    }
    if (selected.adm1.size) {
      const vals = [...selected.adm1.keys()].map(k => `'${k}'`).join(', ');
      parts.push(`    ADM1_ID IN (${vals}) -- Provinces`);
    }

    if (parts.length === 0) return '-- No features selected';
    return 'WHERE ' + parts.join('\n   OR ');
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
  };
})();
