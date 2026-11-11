/* 브라우저 저장소 — localStorage 를 쓰되, 막혀 있거나 용량이 차면 메모리로만 동작합니다.
   2026-10-28: 옛 판(schema 1) 자료는 QWCapture.migrate 로 옮기고(업무 목록 · 흐름도 · 교육 자료 유지), 읽을 수 없는 자료는
   지우지 않고 「data10-09.db.broken」 칸에 따로 남긴 뒤 새로 시작합니다(화면이 안내). 사진 · 캡처는 용량이 커서 IndexedDB 에 둡니다. */
(function (root) {
  'use strict';
  var KEY_DB = 'data10-09.db', KEY_BROKEN = 'data10-09.db.broken';
  var memory = {};
  var ok = true;
  var lastError = '';
  var loadNotice = '';
  function get(k) {
    try { var v = root.localStorage.getItem(k); return v == null && memory[k] != null ? memory[k] : v; }
    catch (e) { ok = false; return memory[k] == null ? null : memory[k]; }
  }
  function set(k, v) {
    memory[k] = v;
    try { root.localStorage.setItem(k, v); lastError = ''; return true; }
    catch (e) {
      ok = false;
      lastError = (e && (e.name === 'QuotaExceededError' || e.code === 22)) ? 'quota' : 'blocked';
      return false;
    }
  }
  function del(k) {
    delete memory[k];
    try { root.localStorage.removeItem(k); } catch (e) { ok = false; }
  }
  root.QWStore = {
    loadDb: function () {
      var C = root.QWCapture, raw = get(KEY_DB);
      loadNotice = '';
      if (!raw) return C.emptyDb();
      var parsed;
      try { parsed = JSON.parse(raw); } catch (e) { parsed = undefined; }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        set(KEY_BROKEN, raw); loadNotice = 'broken';
        return C.emptyDb();
      }
      try { var m = C.migrate(parsed); loadNotice = m.notice; return m.db; }
      catch (e2) { set(KEY_BROKEN, raw); loadNotice = 'broken'; return C.emptyDb(); }
    },
    /* '' · 'upgraded'(옛 판 자료를 옮김) · 'broken'(읽지 못해 따로 남기고 새로 시작) */
    loadNotice: function () { return loadNotice; },
    brokenRaw: function () { return get(KEY_BROKEN); },
    clearBroken: function () { del(KEY_BROKEN); },
    /* true = 브라우저에 저장됨, false = 이번 창의 메모리에만 있음 */
    saveDb: function (db) { return set(KEY_DB, JSON.stringify(db)); },
    clearDb: function () { del(KEY_DB); },
    lastError: function () { return lastError; },
    sizeKb: function () { var v = get(KEY_DB); return v ? Math.round(v.length * 2 / 1024) : 0; },
    available: function () { get(KEY_DB); return ok; }
  };

  /* 사진 · 캡처 — IndexedDB(key → dataURL). 막혀 있으면 이번 창의 메모리에만 둡니다 */
  var mem = {}, dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve) {
      try {
        if (!root.indexedDB) return resolve(null);
        var rq = root.indexedDB.open('data10-09', 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore('images'); };
        rq.onsuccess = function () { resolve(rq.result); };
        rq.onerror = function () { resolve(null); };
        rq.onblocked = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
    return dbp;
  }
  function un(x) { return x && typeof x === 'object' && 'result' in x ? x.result : x; }
  function tx(mode, fn) {
    return open().then(function (d) {
      if (!d) return un(fn(null));
      return new Promise(function (resolve) {
        try {
          var t = d.transaction('images', mode), st = t.objectStore('images'), out = fn(st);
          t.oncomplete = function () { resolve(un(out)); };
          t.onerror = function () { resolve(un(fn(null))); };
        } catch (e) { resolve(un(fn(null))); }
      });
    });
  }
  root.QWImages = {
    put: function (key, url) { mem[key] = url; return tx('readwrite', function (st) { if (st) st.put(url, key); return true; }); },
    get: function (key) {
      if (mem[key]) return Promise.resolve(mem[key]);
      return tx('readonly', function (st) { return st ? st.get(key) : { result: mem[key] || null }; }).then(function (v) { if (v) mem[key] = v; return v || null; });
    },
    del: function (key) { delete mem[key]; return tx('readwrite', function (st) { if (st) st.delete(key); return true; }); },
    clear: function () { mem = {}; return tx('readwrite', function (st) { if (st) st.clear(); return true; }); },
    cached: function (key) { return mem[key] || null; }
  };
})(window);
