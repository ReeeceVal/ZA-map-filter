'use strict';

window.Resize = (() => {
  const MIN_W = 160;
  const MAX_W = 620;

  let _drag = null;  // { cssVar, startX, startW }

  function init() {
    const leftHandle  = document.getElementById('resize-left');
    const rightHandle = document.getElementById('resize-right');

    leftHandle.addEventListener('mousedown',  e => _start(e, '--sql-w', 'sql-panel'));
    rightHandle.addEventListener('mousedown', e => _start(e, '--sel-w', 'sel-panel'));

    document.addEventListener('mousemove', _move);
    document.addEventListener('mouseup',   _stop);
  }

  function _start(e, cssVar, panelId) {
    e.preventDefault();
    const panel = document.getElementById(panelId);
    _drag = {
      cssVar,
      startX: e.clientX,
      startW: panel.getBoundingClientRect().width,
      dir: cssVar === '--sql-w' ? 1 : -1,  // sql grows right, sel grows left
    };
    document.body.style.cursor    = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  function _move(e) {
    if (!_drag) return;
    const delta = (e.clientX - _drag.startX) * _drag.dir;
    const newW  = Math.min(MAX_W, Math.max(MIN_W, _drag.startW + delta));
    document.documentElement.style.setProperty(_drag.cssVar, `${newW}px`);
  }

  function _stop() {
    if (!_drag) return;
    _drag = null;
    document.body.style.cursor     = '';
    document.body.style.userSelect = '';
  }

  return { init };
})();
