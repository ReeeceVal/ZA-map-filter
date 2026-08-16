'use strict';

/* First-run setup page: upload a .gpkg, then poll prep progress. */
window.SetupPage = (function () {
  const POLL_MS = 1000;

  let _statusEl, _fillEl, _msgEl, _pctEl, _errEl, _doneEl;
  let _timer = null;

  function _show(el, on) {
    if (el) el.classList.toggle('setup-hidden', !on);
  }

  function _progress(pct, message) {
    _show(_statusEl, true);
    _fillEl.style.width = Math.max(0, Math.min(100, pct)) + '%';
    _msgEl.textContent = message || '';
    _pctEl.textContent = pct + '%';
  }

  function _fail(message) {
    _stopPolling();
    _show(_statusEl, false);
    _errEl.textContent = message;
    _show(_errEl, true);
  }

  function _succeed() {
    _stopPolling();
    _progress(100, 'Done.');
    _show(_doneEl, true);
  }

  function _stopPolling() {
    if (_timer) { clearInterval(_timer); _timer = null; }
  }

  function _startPolling() {
    if (_timer) return;
    _timer = setInterval(() => {
      fetch('/setup/status')
        .then(r => r.json())
        .then(s => {
          if (s.stage === 'error') return _fail(s.error || 'Preparation failed.');
          if (s.stage === 'done') return _succeed();
          _progress(s.pct || 0, s.message || 'Working ...');
        })
        .catch(() => _fail('Lost contact with the server. Is it still running?'));
    }, POLL_MS);
  }

  function _upload(file) {
    if (!file.name.toLowerCase().endsWith('.gpkg')) {
      return _fail('That is not a .gpkg file — pick the GeoPackage download.');
    }
    _show(_errEl, false);

    const form = new FormData();
    form.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/setup/upload');

    // Real percentage matters here — the source file is ~62 MB
    xhr.upload.onprogress = e => {
      if (e.lengthComputable) {
        _progress(Math.round((e.loaded / e.total) * 100), 'Uploading ' + file.name + ' ...');
      }
    };
    xhr.onload = () => {
      let body = {};
      try { body = JSON.parse(xhr.responseText); } catch (e) { /* non-JSON error page */ }
      if (xhr.status >= 200 && xhr.status < 300) {
        _progress(0, 'Checking the file ...');
        _startPolling();
      } else {
        _fail(body.error || 'Upload failed (HTTP ' + xhr.status + ').');
      }
    };
    xhr.onerror = () => _fail('Upload failed — the connection dropped.');

    _progress(0, 'Uploading ' + file.name + ' ...');
    xhr.send(form);
  }

  function _prepareExisting(btn) {
    btn.disabled = true;
    _show(_errEl, false);
    _progress(0, 'Starting ...');
    fetch('/setup/prepare', { method: 'POST' })
      .then(r => r.json().then(b => ({ ok: r.ok, body: b })))
      .then(({ ok, body }) => {
        if (!ok) { btn.disabled = false; return _fail(body.error || 'Could not start.'); }
        _startPolling();
      })
      .catch(() => { btn.disabled = false; _fail('Could not reach the server.'); });
  }

  function _initDropzone() {
    const zone = document.getElementById('dropzone');
    const input = document.getElementById('file-input');
    if (!zone) return;

    zone.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      if (input.files.length) _upload(input.files[0]);
    });

    ['dragenter', 'dragover'].forEach(ev =>
      zone.addEventListener(ev, e => {
        e.preventDefault();
        zone.classList.add('dragging');
      })
    );
    ['dragleave', 'drop'].forEach(ev =>
      zone.addEventListener(ev, e => {
        e.preventDefault();
        zone.classList.remove('dragging');
      })
    );
    zone.addEventListener('drop', e => {
      const files = e.dataTransfer.files;
      if (files.length) _upload(files[0]);
    });
  }

  function init() {
    _statusEl = document.getElementById('setup-status');
    _fillEl   = document.getElementById('progress-fill');
    _msgEl    = document.getElementById('status-message');
    _pctEl    = document.getElementById('status-pct');
    _errEl    = document.getElementById('setup-error');
    _doneEl   = document.getElementById('setup-done');

    _initDropzone();

    const btn = document.getElementById('prepare-btn');
    if (btn) btn.addEventListener('click', () => _prepareExisting(btn));

    // A run may already be in flight (page reloaded mid-prep)
    fetch('/setup/status')
      .then(r => r.json())
      .then(s => {
        if (s.stage === 'validating' || s.stage === 'preparing') {
          _progress(s.pct || 0, s.message || 'Working ...');
          _startPolling();
        } else if (s.stage === 'error') {
          _fail(s.error || 'Preparation failed.');
        }
      })
      .catch(() => { /* first load, nothing running */ });
  }

  return { init };
})();
