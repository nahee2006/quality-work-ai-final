/* 품질 업무 자료 도우미 — 화면 (2026-11-10 메뉴 정리: ① 자료 등록하기 → ② 담당자에게 질문하기 → ③ AI 초안 작성 → ④ 문서로 내보내기 → ⑤ 신입 교육 자료 만들기)
   계산은 js/logic.js(QWLogic), 저장은 js/store.js, AI 연결은 js/ai-endpoint.js·ai-panel.js.
   뼈대(사이드 메뉴·가져오기·열 연결·AI 패널·내보내기)는 같은 과정의 data10-11 에서 가져왔습니다. */
(function () {
  'use strict';
  var L = window.QWLogic, S = window.QWStore, AIP = window.AIPanel, CQ = window.QWCapture;
  /* 판 맞추기 — 브라우저가 옛 logic.js 와 새 app.js 를 섞어 쓰면(Pages 캐시) 버튼과 결과가 어긋날 수 있어, 섞였으면 계산하지 않고 새로고침을 안내합니다.
     판은 scripts/bump-version.mjs 로 index.html(?v=) · logic.js 와 함께 올립니다. */
  var APP_VERSION = '2026-11-11.6';
  if (!L || L.VERSION !== APP_VERSION || !CQ || CQ.VERSION !== APP_VERSION) {
    var m0 = document.getElementById('main') || document.body;
    m0.innerHTML = '<section class="card" id="versionMismatch"><h1>새 판이 나왔습니다 — 새로고침(Ctrl+F5)해 주세요</h1><p class="alert warn">이 브라우저가 옛 파일과 새 파일을 섞어 불러왔습니다(js/logic.js ' +
      (L && L.VERSION ? L.VERSION : '옛 판') + ' · js/capture.js ' + (CQ && CQ.VERSION ? CQ.VERSION : '옛 판') + ' · 화면 ' + APP_VERSION + '). 이대로 계산하면 버튼과 결과가 어긋날 수 있어 멈췄습니다.</p>' +
      '<p>Windows 는 <b>Ctrl+F5</b>, Mac 은 <b>Cmd+Shift+R</b> 을 한 번 눌러 주세요. 쌓아 둔 자료는 지워지지 않습니다.</p></section>';
    return;
  }
  (function () { var ft = document.querySelector('.site-footer .inner') || document.querySelector('.site-footer'); if (!ft) return; var s = document.createElement('span'); s.className = 'ver'; s.textContent = ' · 판 ' + APP_VERSION; ft.appendChild(s); })();
  var db = S.loadDb();
  var ui = { pend: { task: null, doc: null }, errors: [], cat: '', onlyCore: false, docTab: 'map', allTasks: false, kindFilter: '', flowTask: '', eduTask: '', aiFlowAnswer: '', aiFlowParsed: null, aiLessonAnswer: '', editDoc: null, draftAnswer: '', draftParsed: null, qAnswer: '', qParsed: null, qPick: [], onlyOpen: false, noticeClosed: false };
  var main = document.getElementById('main');
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

  /* ── 작은 도구 ───────────────────────────── */
  function h(tag, attrs) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') e.className = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, v);
    });
    for (var i = 2; i < arguments.length; i++) add(e, arguments[i]);
    return e;
  }
  function add(e, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { add(e, x); }); return; }
    e.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
  function fld(label, control, hint) {
    return h('label', { class: 'field' }, h('span', null, label), control, hint ? h('small', { class: 'hint' }, hint) : null);
  }
  var toastTimer = null;
  function toast(msg, err) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.className = 'toast' + (err ? ' error' : ''); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 3500);
  }
  function save() {
    var ok = S.saveDb(db);
    document.getElementById('storeNote').textContent = ok ? '이 브라우저에 저장됨 · ' + S.sizeKb() + 'KB' : '저장 안 됨(브라우저 저장소가 막혔거나 가득 참) — 설정에서 JSON 백업을 받아 두세요';
    return ok;
  }
  function download(name, blob) {
    var a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function copyText(t) {
    function fallback() { var ta = h('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('복사했습니다.'); } catch (e) { toast('복사하지 못했습니다. 직접 선택해 복사해 주세요.', true); } ta.remove(); }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(function () { toast('복사했습니다.'); }, fallback); else fallback();
  }
  function pageHead(stage, title, lead, right) {
    return h('div', { class: 'page-head' }, h('div', { class: 'titles' }, h('div', { class: 'stage' }, stage), h('h1', null, title), lead ? h('p', { class: 'lead' }, lead) : null), right || null);
  }
  function tile(k, v, sub, cls) { return h('div', { class: 'tile' }, h('div', { class: 'k' }, k), h('div', { class: 'v' + (cls ? ' ' + cls : '') }, v), sub ? h('div', { class: 'note' }, sub) : null); }
  function table(head, rows, opts) {
    opts = opts || {};
    var t = h('table', { class: 'list' + (opts.cls ? ' ' + opts.cls : '') });
    var tr = h('tr');
    head.forEach(function (x, i) { tr.appendChild(h('th', { class: opts.num && opts.num[i] ? 'num' : null, scope: 'col' }, x)); });
    t.appendChild(h('thead', null, tr));
    var tb = h('tbody');
    rows.forEach(function (r) {
      var row = h('tr', { class: r.cls || null });
      (r.cells || r).forEach(function (x, i) { row.appendChild(h('td', { class: ((opts.num && opts.num[i] ? 'num' : '') + (r.tdCls && r.tdCls[i] ? ' ' + r.tdCls[i] : '')) || null }, x)); });
      tb.appendChild(row);
    });
    t.appendChild(tb);
    return h('div', { class: 'table-wrap' }, t);
  }
  function emptyNotice(what) {
    return h('section', { class: 'card empty' },
      h('p', null, what || '아직 가져온 업무 목록이 없습니다.'),
      h('p', null, '업무 목록 엑셀을 가져오거나, 가상 샘플(업무 52 · 문서 24 · 흐름도 3)로 먼저 둘러봐 주세요.'),
      h('div', { class: 'btn-row', style: 'justify-content:center' },
        h('a', { class: 'btn btn-primary', href: '#/work' }, '① 자료 등록하기로'),
        h('button', { type: 'button', class: 'btn', onclick: loadSample }, '샘플로 시작')));
  }
  function kindTag(k) { return k ? h('span', { class: 'tag kind-' + ({ '정형': 'formal', '비정형': 'informal', '형식': 'form' })[k] }, k) : h('span', { class: 'tag' }, '종류 미정'); }
  function diffTag(d) { return h('span', { class: 'tag diff-' + (d || 2) }, L.DIFF_LABEL[d || 2]); }
  function taskById(id) { return db.tasks.filter(function (t) { return t.id === id; })[0]; }
  function docById(id) { return db.docs.filter(function (d) { return d.id === id; })[0]; }
  function coreTasks() { return db.core.map(taskById).filter(Boolean); }
  function settings() { return L.cleanSettings(db.settings); }
  /* 한 덩어리만 인쇄 — 그 카드에 print-on 을 달고 body[data-print] 로 나머지를 숨깁니다 */
  function printSection(el) {
    document.querySelectorAll('.print-on').forEach(function (x) { x.classList.remove('print-on'); });
    el.classList.add('print-on'); document.body.setAttribute('data-print', '1');
    function done() { document.body.removeAttribute('data-print'); el.classList.remove('print-on'); window.removeEventListener('afterprint', done); }
    window.addEventListener('afterprint', done);
    window.print();
    setTimeout(done, 1500);
  }

  /* ── 엑셀 읽기 · 열 연결 (업무 목록 · 문서 목록 공용) ─────── */
  var KIND = {
    task: { fields: L.TASK_FIELDS, label: '업무 목록', parse: function (aoa, ov) { return L.parseTaskSheet(aoa, { overrides: ov }); }, count: function (r) { return r.tasks.length; } },
    doc: { fields: L.DOC_FIELDS, label: '문서 목록', parse: function (aoa, ov) { return L.parseDocSheet(aoa, { overrides: ov }); }, count: function (r) { return r.docs.length; } }
  };
  function readFile(file, kind) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () {
        try { resolve(prepare(file.name, XLSX.read(new Uint8Array(fr.result), { type: 'array', cellDates: true }), kind)); }
        catch (e) { reject(new Error(file.name + ': 엑셀로 읽지 못했습니다(' + e.message + ')')); }
      };
      fr.onerror = function () { reject(new Error(file.name + ': 파일을 읽지 못했습니다.')); };
      fr.readAsArrayBuffer(file);
    });
  }
  function prepare(name, wb, kind) {
    var sheets = wb.SheetNames.map(function (n) { return { name: n, aoa: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null }) }; });
    var pick = L.pickSheet(sheets, KIND[kind].fields) || sheets[0];
    var item = { kind: kind, fileName: name, sheets: sheets, sheet: pick ? pick.name : '', overrides: {} };
    reparse(item);
    return item;
  }
  function reparse(item) {
    var sh = item.sheets.filter(function (s) { return s.name === item.sheet; })[0];
    item.aoa = sh ? sh.aoa : [];
    item.result = KIND[item.kind].parse(item.aoa, item.overrides);
  }
  /* from: 'work'(① 화면의 「업무 목록 파일로 바꾸기」 — 늘 바꾸기) | 'import'(업무 목록 가져오기 화면 — 합치기 · 바꾸기 고름) */
  function handleFile(list, kind, from) {
    var f = Array.prototype.filter.call(list || [], function (x) { return /\.(xlsx|xlsm|xls|csv)$/i.test(x.name) && !/^~\$/.test(x.name); })[0];
    if (!f) { toast('엑셀 파일(.xlsx·.xls·.csv)을 골라 주세요.', true); return; }
    readFile(f, kind).then(function (it) {
      it.from = from || 'import';
      // ① 화면에서 바로 바꿀 때 — 업무명 열을 확실히 찾았으면 열 연결 화면 없이 바로 확인 창
      if (kind === 'task' && it.from === 'work' && pendReady(it) && !it.result.det.simple) { ui.pend.task = null; confirmTaskReplace(it); return; }
      ui.pend[kind] = it; render();
      var c = document.getElementById('pendCard'); if (c && it.from === 'work') c.scrollIntoView({ block: 'start' });
      toast(f.name + ' 을(를) 읽었습니다. 아래에서 열 연결을 확인한 뒤 반영해 주세요.');
    }, function (e) { toast(e.message, true); });
  }
  function pendReady(it) {
    var det = it.result.det, list = it.kind === 'task' ? it.result.tasks : it.result.docs;
    return !det.missing.length && (det.headerRow >= 0 || !!det.simple) && list.length > 0;
  }
  /* 가져오기 화면의 반영 방식 — 지금 목록이 가상 샘플이면 바꾸기가 기본 */
  function taskMode() { return !db.tasks.length ? 'merge' : (ui.taskMode || (db.sample ? 'replace' : 'merge')); }
  /* 샘플 표시 내리기 — 업무 자료화에 가상 샘플 업무가 남아 있으면 그 부분만 따로 표시 */
  function leaveSample() {
    if (!db.sample) return;
    var SC = window.QWSampleCapture;
    db.sampleWorks = db.works.some(function (w) { return SC && w.name === SC.NAME; });
    db.sample = false;
  }
  function taskSourceText() {
    return db.taskSource ? '내 파일 ' + db.taskSource.name : db.sample ? '가상 샘플' : '';
  }
  /* 업무 목록 바꾸기 · 비우기 — 지워지는 것 · 남는 것을 화면 안 확인 창으로 보이고, 누르면 바꿉니다. it 이 없으면 비우기 */
  function confirmTaskReplace(it) {
    var wasSample = db.sample, incoming = it ? it.result.tasks : [];
    var r = L.replaceTasks(db, incoming, { dropDocs: wasSample }), st = r.stat;
    if (it && !r.tasks.length) { toast(it.fileName + ': 업무명을 하나도 읽지 못했습니다. 업무명 열을 확인해 주세요.', true); return; }
    var gone = [
      '업무 목록 ' + st.removed + '개' + (wasSample ? ' (가상 샘플)' : db.taskSource ? ' (' + db.taskSource.name + ')' : ''),
      st.flows || st.lessons ? '업무 흐름도 ' + st.flows + '개 · 교육 한 장 ' + st.lessons + '개 (그 업무에 딸린 것)' : null,
      st.core ? '교육에 넣은 업무 ' + st.core + '개' : null,
      st.links ? '업무 ↔ 문서 연결 ' + st.links + '건' : null,
      wasSample ? '가상 문서 목록 ' + st.docs + '개' : null,
      wasSample ? '「가상 샘플」 표시(업무 목록 부분)' : null
    ].filter(Boolean);
    var stay = [
      db.works.length ? '업무 자료화 ' + db.works.length + '개 — 자료 · 담당자 답변 · 말로 한 설명 · 초안 · 사진 모두 그대로' +
        (st.relinked ? ' · 새 목록의 같은 이름 업무에 다시 이음 ' + st.relinked + '개' : '') +
        (st.unlinked ? ' · 업무 목록과의 연결만 풀림 ' + st.unlinked + '개(업무 이름은 그대로)' : '') : '업무 자료화 — 아직 없음',
      !wasSample && db.docs.length ? '문서 목록 ' + db.docs.length + '개 — 새 업무의 「관련 문서」 칸으로 다시 이음' : null,
      '설정(계산 기준 · AI 연결)'
    ].filter(Boolean);
    var preview = r.tasks.slice(0, 8).map(function (t) { return t.name; }).join(' · ') + (r.tasks.length > 8 ? ' 외 ' + (r.tasks.length - 8) + '개' : '');
    var dlg = h('dialog', { class: 'dialog', id: 'replaceDialog', 'aria-labelledby': 'replaceTitle' });
    function close() { try { dlg.close(); } catch (e) { /* 이미 닫힘 */ } dlg.remove(); }
    dlg.addEventListener('cancel', function (e) { e.preventDefault(); close(); });
    add(dlg, h('div', { class: 'dialog-body' },
      h('h2', { id: 'replaceTitle' }, it ? '업무 목록을 「' + it.fileName + '」의 ' + r.tasks.length + '개로 바꿀까요?' : '업무 목록을 비울까요?'),
      it ? h('p', null, '지금 목록에 합치지 않고, 이 파일의 업무만 남깁니다.' + (st.dup ? ' 같은 이름 ' + st.dup + '개는 한 번만 넣습니다.' : '')) : null,
      it ? h('p', { class: 'note' }, '새 목록: ' + preview) : null,
      it && it.result.det.simple ? h('p', { class: 'alert info' }, it.result.det.warnings[0]) : null,
      h('h3', null, '지워지는 것'), h('ul', { class: 'dlg-gone' }, gone.map(function (x) { return h('li', null, x); })),
      h('h3', null, '남는 것'), h('ul', { class: 'dlg-stay' }, stay.map(function (x) { return h('li', null, x); })),
      h('p', { class: 'note' }, '되돌릴 수 없습니다. 지금 목록이 아깝다면 먼저 「설정 › JSON 백업」을 받아 두세요.'),
      h('div', { class: 'dialog-actions' },
        h('button', { type: 'button', class: 'btn', onclick: close }, '취소'),
        h('button', { type: 'button', class: 'btn btn-primary', id: 'replaceOk', onclick: function () { close(); applyTaskReplace(it); } }, it ? '업무 ' + r.tasks.length + '개로 바꾸기' : '업무 목록 비우기'))));
    document.body.appendChild(dlg);
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }
  function applyTaskReplace(it) {
    var wasSample = db.sample;
    var r = L.replaceTasks(db, it ? it.result.tasks : [], { dropDocs: wasSample });
    db.tasks = r.tasks; db.core = []; db.links = {}; db.flows = {}; db.lessons = {}; db.docs = r.docs; db.works = r.works;
    if (db.tasks.length && db.docs.length) db.links = L.autoLink(db.tasks, db.docs, {}).links;
    if (db.tasks.length) db.core = L.recommendCore(L.scoreTasks(db.tasks, db.settings), settings().coreTarget);
    leaveSample();
    if (wasSample) { db.files = []; db.checked = {}; }
    if (it) { db.files.push({ name: it.fileName, kind: '업무 목록(바꾸기)', rows: r.tasks.length, at: today() }); db.taskSource = { name: it.fileName, rows: r.tasks.length, at: today() }; }
    else db.taskSource = null;
    ui.pend.task = null; ui.flowTask = ''; ui.eduTask = ''; ui.cat = ''; ui.taskMode = null;
    save(); render();
    toast(it ? '업무 목록을 「' + it.fileName + '」의 ' + r.tasks.length + '개로 바꿨습니다' + (r.stat.dup ? '(같은 이름 ' + r.stat.dup + '개는 한 번만)' : '') + '. 업무 자료화는 그대로입니다.'
      : '업무 목록을 비웠습니다. 업무 자료화는 그대로입니다.');
  }
  function commitTasks(it) {
    if (it.from === 'work' || taskMode() === 'replace') { confirmTaskReplace(it); return; }
    var r = it.result, m = L.mergeTasks(db, r.tasks);
    db.tasks = m.tasks; db.core = m.core; db.links = m.links;
    if (db.docs.length) db.links = L.autoLink(db.tasks, db.docs, db.links).links;
    if (!db.core.length) db.core = L.recommendCore(L.scoreTasks(db.tasks, db.settings), settings().coreTarget);
    leaveSample();
    db.files.push({ name: it.fileName, kind: '업무 목록', rows: r.tasks.length, at: today() });
    db.taskSource = { name: it.fileName, rows: db.tasks.length, at: today() };
    ui.pend.task = null; save();
    toast('업무 ' + r.tasks.length + '개 반영 — 새 업무 ' + m.stat.added + ' · 이어 쓴 업무 ' + m.stat.kept + (m.stat.removed ? ' · 목록에서 빠져 지운 업무 ' + m.stat.removed : '') + (m.stat.keptForFlow ? ' · 흐름도가 있어 남긴 업무 ' + m.stat.keptForFlow : ''));
    render();
  }
  function commitDocs(it) {
    var m = L.mergeDocs(db.docs, it.result.docs);
    db.docs = m.docs;
    var al = L.autoLink(db.tasks, db.docs, db.links); db.links = al.links;
    leaveSample();
    db.files.push({ name: it.fileName, kind: '문서 목록', rows: it.result.docs.length, at: today() });
    ui.pend.doc = null; save();
    toast('문서 ' + it.result.docs.length + '개 반영 — 새 문서 ' + m.stat.added + ' · 고친 문서 ' + m.stat.updated + ' · 업무 목록의 관련 문서 칸으로 연결 ' + al.added + '건');
    render();
  }
  function roundTrip(aoa, name) {
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
    var back = XLSX.read(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }), { type: 'array', cellDates: true });
    return XLSX.utils.sheet_to_json(back.Sheets[back.SheetNames[0]], { header: 1, raw: true, defval: null });
  }
  /* 샘플 — 1단계 가상 업무 52 · 문서 24 · 흐름도 3 + 업무 자료화 한 바퀴(「수입검사 부적합품 처리」). target: 넘어갈 화면 */
  function loadSample(target) {
    target = typeof target === 'string' ? target : '#/work';
    if ((db.tasks.length && !db.sample || db.works.length && !db.sample) && !confirm('지금 데이터를 지우고 가상 샘플을 불러올까요? 먼저 설정에서 JSON 백업을 받아 두면 안전합니다.')) return;
    // 앱이 실제 파일을 읽을 때와 같은 길로 — 엑셀 통합문서로 만들었다가 다시 읽습니다
    db = window.QWSample.buildDb(L, { taskAoa: roundTrip(window.QWSample.taskAoa(), '업무 목록'), docAoa: roundTrip(window.QWSample.docAoa(), '문서 목록') });
    db.schema = CQ.SCHEMA;
    var SC = window.QWSampleCapture, t = db.tasks.filter(function (x) { return x.name === '부적합품 처리'; })[0];
    var w = SC.buildWork(CQ, { id: 'W1', taskId: t ? t.id : '' });
    db.works = [w]; db.curWork = w.id;
    window.QWImages.put(w.images[0].key, SC.CAPTURE_URL);
    ui.pend = { task: null, doc: null }; ui.flowTask = ''; ui.eduTask = ''; ui.draftParsed = null; ui.draftAnswer = ''; ui.qParsed = null;
    save(); toast('가상 샘플을 불러왔습니다.');
    if (location.hash === target) render(); else location.hash = target;
  }
  function pendingCard(it) {
    var r = it.result, det = r.det, K = KIND[it.kind];
    var sheetSel = h('select', { 'aria-label': '시트' });
    it.sheets.forEach(function (s) { var o = h('option', { value: s.name }, s.name); if (s.name === it.sheet) o.selected = true; sheetSel.appendChild(o); });
    sheetSel.addEventListener('change', function () { it.sheet = sheetSel.value; it.overrides = {}; reparse(it); render(); });
    var hRow = det.headerRow >= 0 ? det.headerRow : det.guessRow >= 0 ? det.guessRow : 0;
    var hdr = it.aoa[hRow] || [];
    var ex = it.aoa[det.simple && det.headerRow < 0 ? 0 : hRow + 1] || [];
    var mapGrid = h('div', { class: 'map-grid' });
    K.fields.forEach(function (f) {
      var sel = h('select', { 'aria-label': f.label + ' 열' });
      sel.appendChild(h('option', { value: '-1' }, '(이 파일에는 없음)'));
      hdr.forEach(function (t, i) {
        var o = h('option', { value: String(i) }, L.colName(i) + ' · ' + (t == null || t === '' ? '(빈 머리)' : t));
        if (det.map[f.id] === i) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', function () { it.overrides[f.id] = Number(sel.value); reparse(it); render(); });
      var col = det.map[f.id], exv = col == null ? '' : ex[col];
      if (exv instanceof Date) exv = L.toISO(exv);
      mapGrid.appendChild(h('div', { class: 'map-row' + (f.req && col == null ? ' missing' : '') },
        h('span', { class: 'col' }, f.label, f.req ? h('span', { class: 'req' }, ' 필수') : null), sel,
        h('span', { class: 'ex' }, col == null ? '연결 안 됨' : '예: ' + (exv == null || exv === '' ? '(빈칸)' : String(exv)))));
    });
    var list = it.kind === 'task' ? r.tasks : r.docs;
    var preview = it.kind === 'task'
      ? table(['구분', '업무명', '주기', '소요 시간', '직책', '관련 문서'], list.slice(0, 6).map(function (t) { return [t.category, t.name, t.cycle, t.hours, t.role, t.docsText]; }))
      : table(['문서번호', '문서명', '종류', '버전', '개정일', '담당'], list.slice(0, 6).map(function (d) { return [d.code, d.name, d.kind || '(미정)', d.version, d.revised, d.owner]; }));
    var ready = pendReady(it);
    var replace = it.kind === 'task' && (it.from === 'work' || taskMode() === 'replace');
    return h('section', { class: 'card', id: 'pendCard' }, h('h2', null, '열 연결 확인 — ' + it.fileName),
      it.kind === 'task' && db.tasks.length ? h('p', { class: 'note' }, '반영 방식: ' + (replace ? '바꾸기 — 지금 업무 목록 ' + db.tasks.length + '개를 빼고 이 파일의 업무만 남김(누르면 확인 창)' : '합치기 — 같은 업무명은 이어 쓰고 새 업무를 더함')) : null,
      h('div', { class: 'form-grid' },
        fld('시트', sheetSel, it.sheets.length > 1 ? K.label + ' 시트를 자동으로 골랐습니다.' : null),
        h('div', { class: 'field span2' }, h('span', null, '읽은 결과'),
          h('div', null, det.simple ? '제목 줄 없는 목록(' + L.colName(det.map.name) + '열) · ' + K.label.replace(' 목록', '') + ' ' + list.length + '개 · 건너뛴 행 ' + r.skipped
            : det.headerRow < 0 ? '머리행을 못 찾음' : '머리행 ' + (det.headerRow + 1) + '행 · ' + K.label.replace(' 목록', '') + ' ' + list.length + '개 · 건너뛴 행 ' + r.skipped))),
      det.warnings.map(function (w) { return h('p', { class: 'alert warn' }, w); }),
      h('h3', null, '열 연결'), mapGrid,
      r.warnings.length ? h('details', { class: 'warn-list', open: r.warnings.length < 6 ? true : null }, h('summary', null, '행 점검 알림 ' + r.warnings.length + '건'), h('ul', null, r.warnings.map(function (w) { return h('li', null, w); }))) : null,
      list.length ? [h('h3', null, '앞부분 미리 보기'), preview] : null,
      h('div', { class: 'btn-row', style: 'margin-top:12px' },
        h('button', { type: 'button', class: 'btn btn-primary', disabled: !ready, onclick: function () { if (it.kind === 'task') commitTasks(it); else commitDocs(it); } }, replace ? '업무 목록 ' + list.length + '개로 바꾸기' : K.label + ' ' + list.length + '개 반영'),
        h('button', { type: 'button', class: 'btn', onclick: function () { ui.pend[it.kind] = null; render(); } }, '취소')));
  }
  function dropZone(kind, label, note) {
    var input = h('input', { type: 'file', accept: '.xlsx,.xlsm,.xls,.csv', 'aria-label': label });
    input.addEventListener('change', function () { handleFile(input.files, kind); input.value = ''; });
    var drop = h('div', { class: 'drop' }, h('label', { class: 'btn btn-primary' }, input, label), h('span', { class: 'note' }, note));
    drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
    drop.addEventListener('drop', function (e) { e.preventDefault(); drop.classList.remove('over'); handleFile(e.dataTransfer.files, kind); });
    return drop;
  }

  /* ── 0 가져오기 ─────────────────────────── */
  function pageImport() {
    var out = [pageHead('준비', '업무 목록 · 문서 목록 가져오기', '팀에서 정리해 둔 품질 업무 엑셀(업무명 · 주기 · 소요 시간 · 직책)과 문서 목록을 그대로 넣어 주세요. 제목 줄 아래의 머리행을 알아서 찾습니다.'),
      h('section', { class: 'card' }, h('h2', null, '일하는 순서'),
        h('ol', { class: 'steps' },
          h('li', null, h('strong', null, '업무 목록 가져오기'), ' — 업무 엑셀(필수: 업무명, 있으면: 주기 · 소요 시간 · 직책 · 구분 · 관련 문서)'),
          h('li', null, h('a', { href: '#/core' }, '① 핵심 업무 선정'), ' — 빈도×소요 시간 · 신입 관련성 · 고객 영향으로 점수를 매겨 10~15개 고르기'),
          h('li', null, h('a', { href: '#/docs' }, '② 문서 맵'), ' — 문서 목록(정형 · 비정형 · 형식)을 등록하고 업무와 잇기, 누락 · 고아 문서 · 오래된 버전 확인'),
          h('li', null, h('a', { href: '#/flow' }, '③ 업무 흐름도'), ' — 핵심 업무마다 단계 표를 적으면 직책별 칸으로 나뉜 흐름도가 그려짐(절차서 문단을 AI 로 표로 바꾸기 가능)'),
          h('li', null, h('a', { href: '#/edu' }, '④ 신입 교육'), ' — 주차별 커리큘럼과 업무마다 「교육 한 장」(목적 · 흐름도 · 핵심 포인트 · 자주 하는 실수 · 확인 퀴즈 3문항)')),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn btn-primary', onclick: loadSample }, '샘플로 시작(가상 업무 52 · 문서 24 · 흐름도 3)'),
          h('a', { class: 'btn', href: 'samples/' + encodeURIComponent('품질경영팀_업무목록_가상예시.xlsx'), download: '' }, '샘플 업무 목록 엑셀'),
          h('a', { class: 'btn', href: 'samples/' + encodeURIComponent('품질문서_목록_가상예시.xlsx'), download: '' }, '샘플 문서 목록 엑셀'))),
      h('section', { class: 'card' }, h('h2', null, '1. 업무 목록 엑셀'),
        modeRadios(),
        dropZone('task', '업무 목록 엑셀 고르기', '또는 파일을 여기로 끌어다 놓아 주세요.'),
        h('ul', { class: 'note' },
          h('li', null, '꼭 있어야 하는 열은 업무명 하나입니다. 주기 · 소요 시간 · 직책 · 구분 · 관련 문서는 있으면 읽습니다(없으면 점수 계산에서 빈칸).'),
          h('li', null, '제목 줄 없이 업무 이름만 한 열로 죽 적은 목록도 읽습니다(글자가 든 첫 열).'),
          h('li', null, '열 이름이 조금 달라도(「업무 항목」「빈도」「공수」「담당자」 등) 찾습니다. 못 찾은 열은 아래 「열 연결」에서 골라 주세요.'),
          h('li', null, '주기는 「매일 · 주 1회 · 월 2~3회 · 분기 · 반기 · 연 1회 · 수시」, 소요 시간은 「30분 · 2시간 · 1시간 30분 · 1일」처럼 적힌 그대로 읽습니다. 수시 업무를 1년에 몇 번으로 칠지는 설정에서 바꿉니다.'),
          h('li', null, '「구분」이 묶음 첫 줄에만 있어도(병합 셀) 아래 줄에 이어 씁니다. 같은 업무명이 두 번 있으면 첫 줄만 씁니다.'),
          h('li', null, '「합치기」는 업무명이 같으면 핵심 업무 선택 · 점수 · 흐름도 · 교육 한 장을 그대로 잇고, 흐름도가 있는 업무는 「최근 목록에 없음」으로 남깁니다. 「바꾸기」는 지금 목록을 모두 빼고 이 파일의 업무만 남깁니다(업무 자료화는 그대로).'),
          h('li', null, '파일은 서버로 보내지 않고 이 브라우저 안에서만 읽습니다.'))),
      ui.pend.task && ui.pend.task.from !== 'work' ? pendingCard(ui.pend.task) : null,
      h('section', { class: 'card' }, h('h2', null, '2. 문서 목록 엑셀 (선택 — ② 문서 맵 화면에서 직접 넣어도 됩니다)'),
        dropZone('doc', '문서 목록 엑셀 고르기', '문서번호 · 문서명(필수) · 종류 · 버전 · 개정일 · 담당'),
        h('p', { class: 'note' }, '종류 칸이 없거나 비어 있으면 이름으로 짐작합니다(매뉴얼 · 절차서 → 정형, Flow Chart · 관리계획서 · PFMEA · 검사기준서 → 형식, PPT · 교육자료 · 지침서 → 비정형). 반영하면 업무 목록의 「관련 문서」 칸으로 업무와 자동으로 잇습니다.')),
      ui.pend.doc ? pendingCard(ui.pend.doc) : null];

    var flows = Object.keys(db.flows).filter(function (k) { return db.flows[k].steps.length; }).length;
    out.push(h('section', { class: 'card' }, h('h2', null, '쌓인 데이터'),
      db.tasks.length || db.docs.length ? h('div', null,
        h('div', { class: 'tiles' }, tile('업무', db.tasks.length + '개', '직책 ' + uniqCount(db.tasks.map(function (t) { return t.role; })) + '종'),
          tile('핵심 업무', db.core.length + '개', L.coreStatus(db.core, db.settings).ok ? '목표 범위 안' : '목표 ' + settings().coreMin + '~' + settings().coreMax + '개', L.coreStatus(db.core, db.settings).ok ? 'ok' : 'over'),
          tile('문서', db.docs.length + '개', L.KINDS.map(function (k) { return k + ' ' + db.docs.filter(function (d) { return d.kind === k; }).length; }).join(' · ')),
          tile('흐름도 · 교육 한 장', flows + ' · ' + Object.keys(db.lessons).length, '핵심 업무 기준')),
        db.tasks.length ? h('details', null, h('summary', null, '업무 목록 ' + db.tasks.length + '개 보기'),
          table(['번호', '구분', '업무명', '주기', '소요 시간', '직책', '관련 문서'], db.tasks.map(function (t) { return { cls: t.missing ? 'excluded' : null, cells: [t.no, t.category, t.name + (t.missing ? ' (최근 목록에 없음)' : ''), t.cycle, t.hours, t.role, t.docsText] }; }))) : null,
        db.files.length ? h('details', null, h('summary', null, '가져온 파일 ' + db.files.length + '개'),
          table(['파일', '종류', '행', '가져온 날'], db.files.slice().reverse().map(function (f) { return [f.name, f.kind, f.rows, f.at]; }), { num: [0, 0, 1, 0] })) : null,
        h('div', { class: 'btn-row', style: 'margin-top:12px' },
          h('button', { type: 'button', class: 'btn btn-danger', onclick: function () {
            if (!confirm('이 브라우저에 쌓인 업무 · 문서 · 흐름도 · 교육 자료 · 업무 자료화(자료 · 답변 · 초안 · 사진) · 설정을 모두 지울까요? (되돌릴 수 없습니다. 먼저 설정 화면에서 JSON 백업을 받아 두면 안전합니다)')) return;
            db = CQ.emptyDb(); S.clearDb(); window.QWImages.clear(); save(); render();
          } }, '모든 데이터 지우기')))
        : h('p', { class: 'note' }, '아직 없습니다.')));
    return out;
  }
  function modeRadios() {
    if (!db.tasks.length) return null;
    var cur = taskMode();
    function opt(v, label, note) {
      var r = h('input', { type: 'radio', name: 'taskMode', value: v }); r.checked = cur === v;
      r.addEventListener('change', function () { if (r.checked) { ui.taskMode = v; render(); } });
      return h('label', { class: 'mode-opt' }, r, h('span', null, h('strong', null, label), ' — ', note));
    }
    return h('fieldset', { class: 'mode-set' }, h('legend', null, '지금 업무 목록 ' + db.tasks.length + '개' + (taskSourceText() ? '(' + taskSourceText() + ')' : '') + '와'),
      opt('replace', '바꾸기', '지금 목록을 모두 빼고 이 파일의 업무만 남김' + (db.sample ? ' (가상 샘플이라 기본값)' : '')),
      opt('merge', '합치기', '같은 업무명은 이어 쓰고 새 업무를 더함'));
  }
  function uniqCount(a) { var o = {}; a.forEach(function (x) { if (x) o[x] = 1; }); return Object.keys(o).length; }

  /* ── ① 핵심 업무 선정 ───────────────────── */
  function pageCore() {
    var head = pageHead('①', '핵심 업무 선정', '업무마다 점수를 매겨 신입사원 교육과 흐름도를 먼저 만들 핵심 업무 10~15개를 고릅니다. 점수는 고르는 것을 돕는 참고값이고, 최종 선택은 직접 합니다.');
    if (!db.tasks.length) return [head, emptyNotice()];
    var s = settings();
    var scored = L.scoreTasks(db.tasks, s);
    var st = L.coreStatus(db.core, s);
    var w = { wFreq: num(s.wFreq), wNewbie: num(s.wNewbie), wCustomer: num(s.wCustomer), coreTarget: num(s.coreTarget, 1) };
    function num(v, step) { return h('input', { type: 'number', min: 0, max: 100, step: step || 5, inputmode: 'numeric', value: v }); }
    function saveW() {
      var p = Object.assign({}, db.settings); Object.keys(w).forEach(function (k) { p[k] = w[k].value === '' ? null : Number(w[k].value); });
      db.settings = L.cleanSettings(p); save(); toast('가중치를 바꿨습니다. 점수와 순위를 다시 셌습니다.'); render();
    }
    var cats = []; db.tasks.forEach(function (t) { if (t.category && cats.indexOf(t.category) < 0) cats.push(t.category); });
    var catSel = h('select', { 'aria-label': '구분' }, h('option', { value: '' }, '모든 구분'), cats.map(function (c) { var o = h('option', { value: c }, c); if (c === ui.cat) o.selected = true; return o; }));
    catSel.addEventListener('change', function () { ui.cat = catSel.value; render(); });
    var onlyCore = h('input', { type: 'checkbox' }); onlyCore.checked = ui.onlyCore;
    onlyCore.addEventListener('change', function () { ui.onlyCore = onlyCore.checked; render(); });
    function scoreSel(t, key, max) {
      var sel = h('select', { class: 'mini', 'aria-label': t.name + ' ' + ({ newbie: '신입 관련성', customer: '고객 영향', difficulty: '난이도' })[key] });
      var cur = t[key];
      sel.appendChild(h('option', { value: '' }, key === 'difficulty' ? '보통' : '3(기본)'));
      for (var i = 1; i <= max; i++) { var o = h('option', { value: String(i) }, key === 'difficulty' ? L.DIFF_LABEL[i] : String(i)); if (cur === i) o.selected = true; sel.appendChild(o); }
      sel.addEventListener('change', function () { t[key] = sel.value === '' ? null : Number(sel.value); save(); render(); });
      return sel;
    }
    var rows = scored.filter(function (r) { return (!ui.cat || r.task.category === ui.cat) && (!ui.onlyCore || db.core.indexOf(r.task.id) >= 0); });
    var maxScore = scored.length ? scored[0].score : 100;
    var body = rows.map(function (r) {
      var t = r.task, on = db.core.indexOf(t.id) >= 0;
      var cb = h('input', { type: 'checkbox', 'aria-label': t.name + ' 핵심 업무로' }); cb.checked = on;
      cb.addEventListener('change', function () {
        if (cb.checked) { if (db.core.indexOf(t.id) < 0) db.core.push(t.id); } else db.core = db.core.filter(function (x) { return x !== t.id; });
        save(); render();
      });
      return { cls: (on ? 'picked' : '') + (t.missing ? ' excluded' : ''), cells: [cb, r.rank,
        h('span', null, h('strong', null, t.name), t.category ? h('span', { class: 'sub' }, t.category) : null, t.missing ? h('span', { class: 'sub' }, '최근 목록에 없음') : null),
        t.cycle || '-', t.hours || '-', r.annual == null ? h('span', { class: 'tag warn' }, '읽지 못함') : L.fmtNum(r.annual) + 'h', t.role,
        scoreSel(t, 'newbie', 5), scoreSel(t, 'customer', 5), scoreSel(t, 'difficulty', 3),
        h('span', { class: 'score' }, h('span', { class: 'bar', style: 'width:' + Math.round(100 * r.score / (maxScore || 1)) + '%', title: '빈도×시간 ' + r.parts.freq + ' · 신입 ' + r.parts.newbie + ' · 고객 ' + r.parts.customer }), h('b', null, r.score))] };
    });
    var core = coreTasks();
    return [head,
      h('section', { class: 'card' }, h('h2', null, '점수 매기는 법'),
        h('p', { class: 'note' }, '점수(0~100) = 빈도×소요 시간 · 신입 관련성 · 고객 영향의 가중 평균입니다. 빈도×소요 시간은 「1년 횟수 × 1회 시간」(연간 시간)을 로그로 눌러 가장 많은 업무를 만점으로 둡니다(매일 하는 업무가 다른 기준을 모두 덮지 않게). 신입 관련성 · 고객 영향은 표에서 1~5 로 고르고, 비워 두면 3 으로 셉니다.'),
        h('div', { class: 'inline-form' }, fld('빈도×소요 시간 가중치', w.wFreq), fld('신입 관련성 가중치', w.wNewbie), fld('고객 영향 가중치', w.wCustomer), fld('추천 개수', w.coreTarget, settings().coreMin + '~' + settings().coreMax + '개'),
          h('button', { type: 'button', class: 'btn btn-primary', onclick: saveW }, '가중치 적용'))),
      h('section', { class: 'card' },
        h('div', { class: 'card-head' }, h('h2', null, '선택한 핵심 업무 ' + core.length + '개'),
          h('div', { class: 'btn-row' },
            h('button', { type: 'button', class: 'btn', onclick: function () {
              if (db.core.length && !confirm('지금 고른 핵심 업무를 점수 상위 ' + s.coreTarget + '개로 바꿀까요?')) return;
              db.core = L.recommendCore(scored, s.coreTarget); save(); render(); toast('점수 상위 ' + s.coreTarget + '개를 골랐습니다.');
            } }, '점수 상위 ' + s.coreTarget + '개로 고르기'),
            h('button', { type: 'button', class: 'btn', onclick: function () { XLSX.writeFile(xlsxBook([['업무 점수', L.tasksToAoa(scored)], ['핵심 업무', [['순서', '업무명', '직책', '주기', '소요 시간']].concat(core.map(function (t, i) { return [i + 1, t.name, t.role, t.cycle, t.hours]; }))]]), '핵심업무_선정_' + today() + '.xlsx'); } }, '엑셀로'))),
        h('p', { class: 'alert ' + (st.ok ? 'info' : 'warn') }, st.text),
        core.length ? h('ol', { class: 'core-list' }, core.map(function (t, i) {
          return h('li', null, h('span', { class: 'nm' }, t.name), h('span', { class: 'sub' }, t.role), diffTag(t.difficulty),
            h('span', { class: 'btn-row tight' },
              h('button', { type: 'button', class: 'btn btn-sm', disabled: i === 0, 'aria-label': t.name + ' 위로', onclick: function () { move(i, -1); } }, '위로'),
              h('button', { type: 'button', class: 'btn btn-sm', disabled: i === core.length - 1, 'aria-label': t.name + ' 아래로', onclick: function () { move(i, 1); } }, '아래로'),
              h('button', { type: 'button', class: 'btn btn-sm', 'aria-label': t.name + ' 빼기', onclick: function () { db.core.splice(i, 1); save(); render(); } }, '빼기')));
        })) : null,
        h('p', { class: 'note' }, '순서는 커리큘럼에서 같은 난이도끼리의 배치 순서가 됩니다. 핵심 업무를 고르는 기준이 따로 있으면(기획서 10장 ②) 가중치나 점수 칸에 반영해 주세요.')),
      h('section', { class: 'card' }, h('h2', null, '업무 ' + db.tasks.length + '개 — 점수 순'),
        h('div', { class: 'filters' }, fld('구분', catSel), h('label', { class: 'opt' }, onlyCore, h('span', null, h('span', { class: 't' }, '핵심 업무만 보기')))),
        table(['핵심', '순위', '업무명', '주기', '1회', '연간 시간', '직책', '신입 관련성', '고객 영향', '난이도', '점수'], body, { cls: 'core-table', num: [0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0] }))];
    function move(i, d) { var a = db.core, x = a[i]; a[i] = a[i + d]; a[i + d] = x; save(); render(); }
  }
  function xlsxBook(sheets) {
    var wb = XLSX.utils.book_new();
    sheets.forEach(function (s) { XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s[1]), s[0].replace(/[\\\/?*\[\]:]/g, '').slice(0, 30)); });
    return wb;
  }

  /* ── ② 문서 맵 ──────────────────────────── */
  function pageDocs() {
    var head = pageHead('②', '문서 맵', '품질 문서를 정형(규정 · 절차서) · 비정형(개인 PPT · 엑셀) · 형식(Flow Chart · 관리계획서 · PFMEA · 검사기준서)으로 나눠 등록하고, 핵심 업무와 이어 누락 · 고아 문서 · 오래된 버전을 확인합니다.');
    var tabs = [['map', '문서 맵'], ['matrix', '업무 × 문서 연결표'], ['list', '문서 목록 (' + db.docs.length + ')'], ['check', '연계 · 누락 체크리스트']];
    var cl = L.checklist(db, today());
    var tabBar = h('div', { class: 'tabs', role: 'group', 'aria-label': '문서 맵 보기' }, tabs.map(function (t) {
      return h('button', { type: 'button', 'aria-pressed': ui.docTab === t[0] ? 'true' : 'false', onclick: function () { ui.docTab = t[0]; render(); } }, t[1] + (t[0] === 'check' ? ' · ' + (cl.count.bad + cl.count.warn) : ''));
    }));
    var out = [head, tabBar];
    if (ui.docTab === 'list') out.push(docListCard());
    else if (!db.docs.length) out.push(h('section', { class: 'card empty' }, h('p', null, '아직 등록한 문서가 없습니다.'), h('div', { class: 'btn-row', style: 'justify-content:center' },
      h('button', { type: 'button', class: 'btn btn-primary', onclick: function () { ui.docTab = 'list'; render(); } }, '문서 목록에 직접 넣기'), h('a', { class: 'btn', href: '#/import' }, '문서 목록 엑셀 가져오기'), h('button', { type: 'button', class: 'btn', onclick: loadSample }, '샘플로 시작'))));
    else if (ui.docTab === 'map') out.push(docMapCard());
    else if (ui.docTab === 'matrix') out.push(matrixCard());
    else out.push(checkCard(cl));
    return out;
  }
  function docMapCard() {
    var core = coreTasks();
    var flowIdsOf = function (t) { return db.flows[t.id] ? L.flowDocRefs(db.flows[t.id], db.docs).ids : []; };
    return h('section', { class: 'card' }, h('h2', null, '핵심 업무별 문서 맵'),
      h('p', { class: 'note' }, '업무마다 이어진 문서를 종류별 줄로 보여 줍니다. 「흐름도」 표시는 그 업무 흐름도의 입력 · 산출 문서로 쓰인 것입니다. 정형 줄이 비어 있으면 근거 절차서가 연결되지 않은 업무입니다.'),
      h('div', { class: 'legend' }, L.KINDS.map(function (k) { return h('span', { class: 'lg' }, kindTag(k), ' ' + L.KIND_HELP[k]); })),
      core.length ? h('div', { class: 'map-cards' }, core.map(function (t) {
        var ids = (db.links[t.id] || []).filter(docById), fids = flowIdsOf(t);
        return h('article', { class: 'map-card' }, h('h3', null, t.name), h('p', { class: 'sub' }, t.role + ' · ' + (t.cycle || '주기 미상')),
          L.KINDS.map(function (k) {
            var ds = ids.map(docById).filter(function (d) { return d.kind === k; });
            return h('div', { class: 'kind-row' }, h('span', { class: 'kind-label' }, k),
              ds.length ? ds.map(function (d) { return h('span', { class: 'chip chip-' + ({ '정형': 'formal', '비정형': 'informal', '형식': 'form' })[k] }, (d.code ? d.code + ' ' : '') + d.name, fids.indexOf(d.id) >= 0 ? h('small', null, ' 흐름도') : null); })
                : h('span', { class: 'none' }, k === '정형' ? '없음 — 근거 문서 확인 필요' : '없음'));
          }),
          ids.some(function (id) { return !docById(id).kind; }) ? h('p', { class: 'note' }, '종류 미정: ' + ids.map(docById).filter(function (d) { return !d.kind; }).map(function (d) { return d.name; }).join(', ')) : null,
          h('div', { class: 'btn-row tight' }, h('a', { class: 'btn btn-sm', href: '#/flow', onclick: function () { ui.flowTask = t.id; } }, db.flows[t.id] ? '흐름도 보기' : '흐름도 만들기')));
      })) : h('p', { class: 'note' }, '① 화면에서 핵심 업무를 먼저 골라 주세요.'));
  }
  function matrixCard() {
    var tasks = ui.allTasks ? db.tasks : coreTasks();
    var all = h('input', { type: 'checkbox' }); all.checked = ui.allTasks;
    all.addEventListener('change', function () { ui.allTasks = all.checked; render(); });
    var docs = L.KINDS.concat(['']).reduce(function (a, k) { return a.concat(db.docs.filter(function (d) { return (d.kind || '') === k; })); }, []);
    var t = h('table', { class: 'list matrix' });
    var hr = h('tr', null, h('th', { scope: 'col', class: 'stick' }, '업무 \\ 문서'));
    docs.forEach(function (d) { hr.appendChild(h('th', { scope: 'col', class: 'mx-head k-' + ({ '정형': 'formal', '비정형': 'informal', '형식': 'form' })[d.kind] , title: d.name }, h('span', null, d.code || d.name.slice(0, 6)))); });
    hr.appendChild(h('th', { scope: 'col', class: 'num' }, '연결'));
    t.appendChild(h('thead', null, hr));
    var tb = h('tbody'), colCount = docs.map(function () { return 0; });
    tasks.forEach(function (task) {
      var linked = db.links[task.id] || [], fids = db.flows[task.id] ? L.flowDocRefs(db.flows[task.id], db.docs).ids : [];
      var tr = h('tr', null, h('th', { scope: 'row', class: 'stick' }, task.name));
      docs.forEach(function (d, j) {
        var on = linked.indexOf(d.id) >= 0, inFlow = fids.indexOf(d.id) >= 0;
        if (on) colCount[j]++;
        tr.appendChild(h('td', { class: 'mx' + (on ? ' on' : '') + (inFlow && !on ? ' flow' : '') },
          h('button', { type: 'button', 'aria-pressed': on ? 'true' : 'false', 'aria-label': task.name + ' — ' + d.name + (on ? ' 연결 끊기' : ' 연결'), title: d.name + (inFlow ? ' (흐름도에 나옴)' : ''),
            onclick: function () { db.links = L.toggleLink(db.links, task.id, d.id); save(); render(); } }, on ? '●' : inFlow ? '○' : '')));
      });
      tr.appendChild(h('td', { class: 'num' }, linked.filter(docById).length));
      tb.appendChild(tr);
    });
    var foot = h('tr', { class: 'sum' }, h('th', { scope: 'row', class: 'stick' }, '이 문서를 쓰는 업무 수'));
    docs.forEach(function (d, j) { foot.appendChild(h('td', { class: 'num' + (colCount[j] ? '' : ' zero') }, colCount[j])); });
    foot.appendChild(h('td'));
    tb.appendChild(foot);
    t.appendChild(tb);
    return h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, '업무 × 문서 연결표 (' + tasks.length + ' × ' + docs.length + ')'),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn', onclick: function () { var r = L.autoLink(db.tasks, db.docs, db.links); db.links = r.links; save(); render(); toast('업무 목록의 관련 문서 칸으로 ' + r.added + '건 더 이었습니다.'); } }, '관련 문서 칸으로 다시 잇기'),
        h('button', { type: 'button', class: 'btn', onclick: function () { XLSX.writeFile(xlsxBook([['연결표', L.matrixToAoa(tasks, docs, db.links)], ['문서 목록', L.docsToAoa(docs)]]), '업무_문서_연결표_' + today() + '.xlsx'); } }, '엑셀로'))),
      h('div', { class: 'filters' }, h('label', { class: 'opt' }, all, h('span', null, h('span', { class: 't' }, '모든 업무 보기(' + db.tasks.length + '개)'), h('span', { class: 's' }, '끄면 핵심 업무만')))),
      h('p', { class: 'note' }, '칸을 누르면 연결하거나 끊습니다. ● 연결됨 · ○ 흐름도에 나오지만 연결표에는 없음. 머리의 문서번호에 마우스를 올리면 문서명이 보입니다(아래 목록).'),
      h('div', { class: 'legend' }, L.KINDS.map(function (k) { return h('span', { class: 'lg' }, h('i', { class: 'sw k-' + ({ '정형': 'formal', '비정형': 'informal', '형식': 'form' })[k] }), k); })),
      h('div', { class: 'table-wrap matrix-wrap' }, t),
      h('details', null, h('summary', null, '문서번호 · 문서명'), h('ul', { class: 'code-list' }, docs.map(function (d) { return h('li', null, h('b', null, d.code || '-'), ' ', d.name, ' ', kindTag(d.kind)); }))));
  }
  function docListCard() {
    var e = ui.editDoc ? Object.assign({}, ui.editDoc) : { id: '', code: '', name: '', kind: '', version: '', revised: '', owner: '', note: '' };
    var inp = {
      code: h('input', { value: e.code, placeholder: '예: QP-02' }), name: h('input', { value: e.name, placeholder: '예: 수입검사 절차서' }),
      kind: h('select', null, h('option', { value: '' }, '(미정)'), L.KINDS.map(function (k) { var o = h('option', { value: k }, k + ' — ' + L.KIND_HELP[k]); if (e.kind === k) o.selected = true; return o; })),
      version: h('input', { value: e.version, placeholder: '예: Rev.3' }), revised: h('input', { type: 'date', value: e.revised }), owner: h('input', { value: e.owner, placeholder: '예: 품질 엔지니어' }), note: h('input', { value: e.note })
    };
    function saveDoc() {
      var d = {}; Object.keys(inp).forEach(function (k) { d[k] = inp[k].value; });
      if (!d.name.trim()) { toast('문서명을 적어 주세요.', true); return; }
      if (!d.kind) d.kind = L.normalizeKind('', d.name);
      if (e.id) { var o = docById(e.id); Object.assign(o, L.cleanDoc(Object.assign({ id: e.id }, d))); toast('고쳤습니다.'); }
      else { var m = L.mergeDocs(db.docs, [L.cleanDoc(d)]); db.docs = m.docs; toast(m.stat.added ? '넣었습니다.' : '같은 이름 · 번호의 문서가 있어 그 문서를 고쳤습니다.'); }
      ui.editDoc = null; save(); render();
    }
    var docs = db.docs.filter(function (d) { return !ui.kindFilter || (d.kind || '') === (ui.kindFilter === '-' ? '' : ui.kindFilter); });
    var used = {};
    Object.keys(db.links).forEach(function (k) { db.links[k].forEach(function (d) { used[d] = (used[d] || 0) + 1; }); });
    var stale = settings().staleMonths, now = today();
    var kf = h('select', { 'aria-label': '종류 거르기' }, h('option', { value: '' }, '모든 종류'), L.KINDS.map(function (k) { var o = h('option', { value: k }, k); if (ui.kindFilter === k) o.selected = true; return o; }), h('option', { value: '-' }, '종류 미정'));
    kf.addEventListener('change', function () { ui.kindFilter = kf.value; render(); });
    return [h('section', { class: 'card' }, h('h2', null, e.id ? '문서 고치기 — ' + e.name : '문서 넣기'),
        h('div', { class: 'form-grid' }, fld('문서번호', inp.code), fld('문서명 (필수)', inp.name), fld('종류', inp.kind), fld('버전', inp.version), fld('개정일', inp.revised), fld('담당', inp.owner), h('div', { class: 'span-all' }, fld('비고', inp.note))),
        h('div', { class: 'btn-row', style: 'margin-top:12px' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: saveDoc }, e.id ? '고친 내용 저장' : '넣기'),
          e.id ? h('button', { type: 'button', class: 'btn', onclick: function () { ui.editDoc = null; render(); } }, '그만 고치기') : null,
          h('a', { class: 'btn', href: '#/import' }, '엑셀로 한꺼번에 넣기'))),
      h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, '문서 목록 ' + db.docs.length + '개'),
          h('button', { type: 'button', class: 'btn', onclick: function () { XLSX.writeFile(xlsxBook([['문서 목록', L.docsToAoa(db.docs)]]), '품질문서_목록_' + today() + '.xlsx'); } }, '엑셀로')),
        h('div', { class: 'filters' }, fld('종류', kf)),
        docs.length ? table(['문서번호', '문서명', '종류', '버전', '개정일', '담당', '쓰는 업무', ''], docs.map(function (d) {
          var old = d.revised && L.monthsBetween(d.revised, now) >= stale;
          return { cls: old ? 'differs' : null, cells: [d.code, h('span', null, d.name, d.note ? h('span', { class: 'sub' }, d.note) : null), kindTag(d.kind), d.version || h('span', { class: 'tag' }, '없음'),
            d.revised ? h('span', null, d.revised, old ? h('span', { class: 'tag warn' }, '오래됨') : null) : '-', d.owner || h('span', { class: 'tag' }, '없음'),
            used[d.id] ? used[d.id] + '개' : h('span', { class: 'tag warn' }, '고아'),
            h('span', { class: 'btn-row tight' }, h('button', { type: 'button', class: 'btn btn-sm', onclick: function () { ui.editDoc = d; render(); window.scrollTo(0, 0); } }, '고치기'),
              h('button', { type: 'button', class: 'btn btn-sm btn-danger', onclick: function () {
                if (!confirm('「' + d.name + '」을(를) 목록에서 지울까요? 연결표의 연결도 함께 지워집니다.')) return;
                db.docs = db.docs.filter(function (x) { return x !== d; });
                Object.keys(db.links).forEach(function (k) { db.links[k] = db.links[k].filter(function (x) { return x !== d.id; }); });
                save(); render();
              } }, '지우기'))] };
        }), { cls: 'doc-table' }) : h('p', { class: 'note' }, '없습니다.'))];
  }
  function checkCard(cl) {
    var groups = ['핵심 업무', '문서', '업무 목록'];
    var LV = { bad: '꼭 고칠 것', warn: '확인', info: '참고' };
    var done = cl.items.filter(function (i) { return db.checked[i.text]; }).length;
    function action(i) {
      if (i.action === 'link') return h('button', { type: 'button', class: 'btn btn-sm', onclick: function () { db.links = L.toggleLink(db.links, i.taskId, i.docId); save(); render(); toast('연결했습니다.'); } }, '연결표에 넣기');
      if (i.kindOf === 'noFlow' || i.kindOf === 'flowUnknown' || i.kindOf === 'flowCheck') return h('a', { class: 'btn btn-sm', href: '#/flow', onclick: function () { ui.flowTask = i.taskId; } }, '흐름도로');
      if (i.kindOf === 'noLesson') return h('a', { class: 'btn btn-sm', href: '#/edu', onclick: function () { ui.eduTask = i.taskId; } }, '교육 한 장으로');
      if (i.kindOf === 'noDoc' || i.kindOf === 'noFormal' || i.kindOf === 'orphan') return h('button', { type: 'button', class: 'btn btn-sm', onclick: function () { ui.docTab = 'matrix'; ui.allTasks = i.kindOf === 'orphan'; render(); } }, '연결표로');
      if (i.docId) return h('button', { type: 'button', class: 'btn btn-sm', onclick: function () { ui.editDoc = docById(i.docId); ui.docTab = 'list'; render(); } }, '문서 고치기');
      return null;
    }
    return h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, '연계 · 누락 체크리스트'),
        h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn', onclick: function () { XLSX.writeFile(xlsxBook([['체크리스트', L.checklistToAoa(cl)]]), '문서_연계_체크리스트_' + today() + '.xlsx'); } }, '엑셀로'),
          h('button', { type: 'button', class: 'btn', onclick: function (ev) { printSection(ev.target.closest('.card')); } }, '인쇄'))),
      h('div', { class: 'tiles' }, tile('꼭 고칠 것', cl.count.bad + '건', null, cl.count.bad ? 'over' : 'ok'), tile('확인', cl.count.warn + '건'), tile('참고', cl.count.info + '건'), tile('확인 표시', done + ' / ' + cl.items.length)),
      h('p', { class: 'note' }, '핵심 업무를 먼저 봅니다. 문서가 바뀌거나 흐름도를 고치면 목록이 다시 계산됩니다. 확인한 항목은 왼쪽 칸에 표시해 두세요(이 브라우저에 저장). 오래된 버전 기준(지금 ' + settings().staleMonths + '개월)은 설정에서 바꿉니다.'),
      groups.map(function (g) {
        var items = cl.items.filter(function (i) { return i.group === g; });
        if (!items.length) return null;
        return [h('h3', null, g + ' (' + items.length + ')'), h('ul', { class: 'check-list' }, items.map(function (i) {
          var cb = h('input', { type: 'checkbox', 'aria-label': '확인함' }); cb.checked = !!db.checked[i.text];
          cb.addEventListener('change', function () { if (cb.checked) db.checked[i.text] = true; else delete db.checked[i.text]; save(); li.classList.toggle('done', cb.checked); });
          var li = h('li', { class: 'lv-' + i.level + (cb.checked ? ' done' : '') }, cb, h('span', { class: 'tag lv-' + i.level }, LV[i.level]), h('span', { class: 'txt' }, i.text), action(i));
          return li;
        }))];
      }),
      !cl.items.length ? h('p', { class: 'alert info' }, '걸린 항목이 없습니다.') : null);
  }

  /* ── ③ 업무 흐름도 ──────────────────────── */
  function taskPicker(cur, onPick, label) {
    var sel = h('select', { 'aria-label': label || '업무 고르기' });
    var core = coreTasks(), rest = db.tasks.filter(function (t) { return db.core.indexOf(t.id) < 0; });
    function opt(t) { var mark = (db.flows[t.id] && db.flows[t.id].steps.length ? ' · 흐름도' : '') + (db.lessons[t.id] ? ' · 교육' : ''); var o = h('option', { value: t.id }, t.name + mark); if (t.id === cur) o.selected = true; return o; }
    if (core.length) sel.appendChild(h('optgroup', { label: '핵심 업무' }, core.map(opt)));
    if (rest.length) sel.appendChild(h('optgroup', { label: '나머지 업무' }, rest.map(opt)));
    sel.addEventListener('change', function () { onPick(sel.value); });
    return sel;
  }
  function pickDefault(key) {
    if (ui[key] && taskById(ui[key])) return ui[key];
    var core = coreTasks();
    var withFlow = core.filter(function (t) { return db.flows[t.id] && db.flows[t.id].steps.length; })[0];
    return (withFlow || core[0] || db.tasks[0] || {}).id || '';
  }
  function flowOf(id) { return db.flows[id] || (db.flows[id] = { steps: [], source: '', updated: '' }); }
  function pageFlow() {
    var head = pageHead('③', '업무 흐름도', '단계 표(순서 · 단계명 · 담당 직책 · 입력/산출 문서 · 판단 분기)를 적으면 직책별 칸(swimlane)으로 나뉜 흐름도를 그립니다. 절차서 문단을 AI 로 단계 표로 바꿀 수도 있습니다.');
    if (!db.tasks.length) return [head, emptyNotice()];
    ui.flowTask = pickDefault('flowTask');
    var t = taskById(ui.flowTask), f = flowOf(t.id);
    var picker = h('section', { class: 'card filters no-print' }, fld('업무', taskPicker(t.id, function (v) { ui.flowTask = v; ui.aiFlowParsed = null; ui.aiFlowAnswer = ''; render(); })),
      h('div', { class: 'field' }, h('span', null, '업무 정보'), h('div', null, (t.cycle || '주기 미상') + ' · 1회 ' + (t.hours || '미상') + ' · ' + (t.role || '직책 미상')), h('small', { class: 'hint' }, '관련 문서: ' + ((db.links[t.id] || []).map(docById).filter(Boolean).map(function (d) { return d.name; }).join(', ') || '연결 없음'))));
    var out = [head, picker];
    if (!f.steps.length) {
      out.push(h('section', { class: 'card empty no-print' }, h('p', null, '「' + t.name + '」의 단계 표가 아직 없습니다.'),
        h('div', { class: 'btn-row', style: 'justify-content:center' },
          h('button', { type: 'button', class: 'btn btn-primary', onclick: function () { f.steps = [0, 1, 2].map(function () { return Object.assign(L.emptyStep(), { role: t.role }); }); save(); render(); } }, '빈 표로 시작(3줄)'),
          h('button', { type: 'button', class: 'btn', onclick: function () { var x = document.getElementById('aiFlow'); if (x) x.scrollIntoView(); } }, '절차서 문단으로 AI 초안 만들기'))));
    } else {
      out.push(h('section', { class: 'card flow-card', id: 'flowCard' }, h('div', { class: 'card-head' }, h('h2', null, '흐름도 — ' + t.name),
        h('div', { class: 'btn-row no-print' },
          h('button', { type: 'button', class: 'btn', onclick: function () { printSection(document.getElementById('flowCard')); } }, '인쇄 / PDF'),
          h('button', { type: 'button', class: 'btn', onclick: function () { download('업무흐름도_' + safe(t.name) + '.svg', new Blob([flowSvgText(t, f)], { type: 'image/svg+xml' })); } }, 'SVG'),
          h('button', { type: 'button', class: 'btn', onclick: function () { svgToPng(flowSvgText(t, f), '업무흐름도_' + safe(t.name) + '.png'); } }, 'PNG'),
          h('button', { type: 'button', class: 'btn', onclick: function () { XLSX.writeFile(xlsxBook([['단계 표', L.stepsToAoa(f.steps)]]), '단계표_' + safe(t.name) + '.xlsx'); } }, '단계 표 엑셀'))),
        h('div', { id: 'flowCheck' }), h('div', { class: 'flow-wrap', id: 'flowPreview' }),
        h('p', { class: 'note' }, '칸 = 담당 직책 · 부서(처음 나온 순서) · 네모 = 단계(입력 · 산출 문서는 작은 글씨) · 마름모 = 판단 · 초록 선 = 예 · 빨간 선 = 아니오 · 바로 아래가 아닌 단계로 가는 선은 오른쪽 통로로 돌아갑니다. 아래 단계 표를 고치면 바로 다시 그립니다.')));
      out.push(stepEditor(t, f));
    }
    out.push(aiFlowCard(t, f));
    setTimeout(refreshFlow, 0);
    return out;
  }
  function safe(s) { return String(s).replace(/[\\\/:*?"<>|\s]+/g, '_'); }
  function flowSvgText(t, f) { return L.flowSvg(L.layoutFlow(f.steps), { title: t.name + ' — 업무 흐름도' }); }
  function refreshFlow() {
    var pv = document.getElementById('flowPreview'), ck = document.getElementById('flowCheck');
    if (!pv) return;
    var t = taskById(ui.flowTask), f = flowOf(t.id);
    var v = L.validateFlow(f.steps), lay = L.layoutFlow(f.steps), probs = L.checkFlowLayout(lay);
    ck.innerHTML = '';
    v.errors.forEach(function (e) { ck.appendChild(h('p', { class: 'alert warn' }, e)); });
    v.warnings.forEach(function (e) { ck.appendChild(h('p', { class: 'alert info' }, e)); });
    probs.forEach(function (e) { ck.appendChild(h('p', { class: 'alert info' }, '그림 점검: ' + e)); });
    var fr = L.flowDocRefs(f, db.docs);
    if (fr.unknown.length) ck.appendChild(h('p', { class: 'alert info' }, '문서 목록에 없는 문서 이름: ' + fr.unknown.join(', ') + ' — ② 문서 목록에 넣거나 이름을 맞춰 주세요.'));
    pv.innerHTML = L.flowSvg(lay, { title: t.name + ' — 업무 흐름도' });
  }
  function svgToPng(svg, name) {
    var img = new Image();
    img.onload = function () {
      var c = document.createElement('canvas'), sc = 2;
      c.width = img.width * sc; c.height = img.height * sc;
      var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.scale(sc, sc); g.drawImage(img, 0, 0);
      try { c.toBlob(function (b) { if (b) download(name, b); else toast('PNG 를 만들지 못했습니다. SVG 로 받아 주세요.', true); }, 'image/png'); }
      catch (e) { toast('이 브라우저에서는 PNG 를 만들지 못했습니다. SVG 로 받아 주세요.', true); }
    };
    img.onerror = function () { toast('PNG 를 만들지 못했습니다. SVG 로 받아 주세요.', true); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  function stepEditor(t, f) {
    var roles = L.flowRoles(f.steps).filter(function (r) { return r !== '(담당 미정)'; });
    ['검사원', '품질 엔지니어', '품질경영팀장', '생산팀', '영업팀', '자재창고', '구매팀'].concat(db.tasks.map(function (x) { return x.role; })).forEach(function (r) { if (r && roles.indexOf(r) < 0) roles.push(r); });
    var lists = [h('datalist', { id: 'roleList' }, roles.map(function (r) { return h('option', { value: r }); })), h('datalist', { id: 'docList' }, db.docs.map(function (d) { return h('option', { value: d.name }); }))];
    function upd(i, k, v) { f.steps[i][k] = v; f.updated = today(); save(); refreshFlow(); }
    function inp(i, k, ph, list) {
      var e = h('input', { value: f.steps[i][k] || '', placeholder: ph || '', list: list || null, autocomplete: 'off' });
      e.addEventListener('change', function () { upd(i, k, e.value.trim()); if (k === 'question') render(); });
      return e;
    }
    function edit(fn) { f.steps = fn(f.steps); f.updated = today(); save(); render(); }
    var cards = f.steps.map(function (s, i) {
      var dec = !!s.question;
      return h('fieldset', { class: 'step' + (dec ? ' dec' : '') }, h('legend', null, (i + 1) + '. ' + (dec ? '판단' : '단계')),
        h('div', { class: 'step-grid' },
          fld('단계명', inp(i, 'name', '예: 샘플링 후 검사 실시')), fld('담당 직책 · 부서', inp(i, 'role', '예: 검사원', 'roleList')),
          fld('입력 문서', inp(i, 'inputs', '예: 검사기준서', 'docList')), fld('산출 문서', inp(i, 'outputs', '예: 수입검사 성적서', 'docList')),
          fld('판단 질문(있으면 마름모)', inp(i, 'question', '예: 합격 기준을 만족하는가?')),
          dec ? [fld('예 → 단계 번호', inp(i, 'yes', '비우면 다음 순서')), fld('아니오 → 단계 번호', inp(i, 'no', '번호 또는 「끝」'))]
            : fld('다음 → 단계 번호', inp(i, 'next', i === f.steps.length - 1 ? '비우면 끝' : '비우면 ' + (i + 2) + '번'))),
        h('div', { class: 'btn-row tight' },
          h('button', { type: 'button', class: 'btn btn-sm', disabled: i === 0, onclick: function () { edit(function (st) { return L.moveStep(st, i, i - 1); }); } }, '위로'),
          h('button', { type: 'button', class: 'btn btn-sm', disabled: i === f.steps.length - 1, onclick: function () { edit(function (st) { return L.moveStep(st, i, i + 1); }); } }, '아래로'),
          h('button', { type: 'button', class: 'btn btn-sm', onclick: function () { edit(function (st) { return L.insertStep(st, i + 1, { role: s.role }); }); } }, '아래에 넣기'),
          h('button', { type: 'button', class: 'btn btn-sm btn-danger', onclick: function () { if (confirm((i + 1) + '번 단계를 뺄까요? 이 단계를 가리키던 번호는 비워집니다.')) edit(function (st) { return L.deleteStep(st, i); }); } }, '빼기')));
    });
    return h('section', { class: 'card no-print' }, h('div', { class: 'card-head' }, h('h2', null, '단계 표 (' + f.steps.length + '단계)'),
        h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn', onclick: function () { edit(function (st) { return L.insertStep(st, st.length, { role: t.role }); }); } }, '맨 끝에 단계 더하기'),
          h('button', { type: 'button', class: 'btn btn-danger', onclick: function () { if (confirm('「' + t.name + '」 단계 표를 모두 지울까요?')) { f.steps = []; save(); render(); } } }, '표 지우기'))),
      h('p', { class: 'note' }, '번호는 표의 순서입니다. 단계를 넣거나 빼거나 옮기면 다른 단계의 예 · 아니오 · 다음 번호도 따라 바뀝니다. 담당 · 문서 칸은 목록에서 고르거나 직접 적습니다(문서는 ② 문서 목록의 이름과 같게 적으면 문서 맵에 이어집니다). 여러 문서는 쉼표로 나눕니다.'),
      lists, h('div', { class: 'steps-list' }, cards));
  }
  function aiFlowCard(t, f) {
    var src = h('textarea', { rows: 6, placeholder: '절차서 · 업무지침서에서 이 업무 부분 문단을 붙여 넣어 주세요.' }); src.value = f.source || '';
    var promptBox = h('textarea', { rows: 8, readonly: true, class: 'mono' });
    function roles() { var r = L.flowRoles(f.steps).filter(function (x) { return x !== '(담당 미정)'; }); db.tasks.forEach(function (x) { if (x.role && r.indexOf(x.role) < 0) r.push(x.role); }); return r; }
    function prompt() { return L.flowPrompt(t, src.value, roles(), db.docs.map(function (d) { return d.name; })); }
    promptBox.value = prompt();
    src.addEventListener('input', function () { promptBox.value = prompt(); });
    src.addEventListener('change', function () { f.source = src.value; save(); });
    var ans = h('textarea', { rows: 8, placeholder: 'AI 답(| 순서 | 단계명 | 담당 | … | 표)을 그대로 붙여 넣어 주세요. 엑셀에서 복사한 표(탭)도 됩니다.' }); ans.value = ui.aiFlowAnswer;
    ans.addEventListener('input', function () { ui.aiFlowAnswer = ans.value; });
    var res = ui.aiFlowParsed;
    function parse() { ui.aiFlowAnswer = ans.value; ui.aiFlowParsed = L.parseStepsAnswer(ans.value); render(); setTimeout(function () { var x = document.getElementById('aiParsed'); if (x) x.scrollIntoView(); }, 30); }
    return h('section', { class: 'card no-print', id: 'aiFlow' }, h('h2', null, 'AI 로 절차서 문단 → 단계 표 (반자동)'),
      h('ol', { class: 'steps' }, h('li', null, '절차서 문단을 붙여 넣습니다(회사 문서를 외부 AI 에 넣어도 되는지 보안 기준을 먼저 확인해 주세요).'), h('li', null, '프롬프트를 복사해 회사가 허용한 AI 에 붙여 넣습니다.'), h('li', null, 'AI 답(표)을 아래에 붙여 넣고 「표로 읽기」 → 확인 후 「이 표로 바꾸기」.')),
      fld('절차서 문단', src, '이 업무에 저장됩니다(이 브라우저).'),
      h('details', null, h('summary', null, '프롬프트 보기'), promptBox),
      h('div', { class: 'btn-row', style: 'margin:10px 0' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: function () { f.source = src.value; save(); copyText(prompt()); } }, '프롬프트 복사'),
        AIP.sendButton('설정한 AI 서버로 보내기(선택)', function () { f.source = src.value; save(); return prompt(); }, function (text) { ans.value = text; parse(); toast('AI 답을 받아 표로 읽었습니다. 확인 후 반영해 주세요.'); },
          { toast: toast, settingsHref: '#/settings', system: '너는 품질 업무 절차를 단계 표로 정리하는 보조야. 주어진 문단 밖의 내용을 만들지 마.' })),
      fld('AI 답 붙여 넣기', ans),
      h('div', { class: 'btn-row', style: 'margin-top:8px' }, h('button', { type: 'button', class: 'btn', onclick: parse }, '표로 읽기')),
      res ? h('div', { id: 'aiParsed' },
        res.warnings.map(function (w) { return h('p', { class: 'alert info' }, w); }),
        res.notes.length ? h('div', { class: 'alert warn' }, h('strong', null, 'AI 가 적은 확인 필요 사항'), h('ul', null, res.notes.map(function (n) { return h('li', null, n); }))) : null,
        res.steps.length ? [table(['순서', '단계명', '담당', '입력 문서', '산출 문서', '판단 질문', '예', '아니오', '다음'], res.steps.map(function (s, i) { return [i + 1, s.name, s.role, s.inputs, s.outputs, s.question, s.yes, s.no, s.next]; }), { num: [1] }),
          L.validateFlow(res.steps).errors.map(function (e) { return h('p', { class: 'alert warn' }, e); }),
          h('div', { class: 'btn-row', style: 'margin-top:8px' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: function () {
            if (f.steps.length && !confirm('지금 단계 표(' + f.steps.length + '단계)를 읽은 표(' + res.steps.length + '단계)로 바꿀까요?')) return;
            f.steps = res.steps.map(L.cleanStep); f.source = src.value; f.updated = today(); ui.aiFlowParsed = null; ui.aiFlowAnswer = ''; save(); render(); toast('단계 표를 바꿨습니다. 흐름도를 확인해 주세요.'); window.scrollTo(0, 0);
          } }, '이 표로 바꾸기 (' + res.steps.length + '단계)'))] : null) : null);
  }

  /* ── ⑤ 신입 교육 자료 만들기 ────────────────────────── */
  function pageEdu() {
    var head = pageHead('⑤', '신입 교육 자료 만들기', '④ 문서로 내보내기에서 보낸 초안의 흐름으로 업무마다 한 장짜리 교육 자료(목적 · 흐름도 · 핵심 포인트 · 자주 하는 실수 · 확인 퀴즈 3문항)를 만들고, 교육에 넣은 업무를 난이도와 순서대로 주차에 배치합니다.');
    if (!db.tasks.length) return [head, h('section', { class: 'card empty' },
      h('p', null, '아직 교육 자료로 보낸 업무가 없습니다.'),
      h('p', null, '③ AI 초안 작성에서 초안을 만들고 담당자 확인을 받은 뒤, ④ 문서로 내보내기의 「⑤ 신입 교육 자료로 보내기」를 눌러 주세요.'),
      h('div', { class: 'btn-row', style: 'justify-content:center' },
        h('a', { class: 'btn btn-primary', href: '#/export' }, '④ 문서로 내보내기로'),
        h('button', { type: 'button', class: 'btn', onclick: function () { loadSample('#/edu'); } }, '샘플로 해 보기')))];
    var cur = L.curriculum(db), s = settings();
    var weeksIn = h('input', { type: 'number', min: 1, max: 26, step: 1, value: s.weeks, inputmode: 'numeric', 'aria-label': '교육 기간(주)' });
    weeksIn.addEventListener('change', function () { db.settings = L.cleanSettings(Object.assign({}, db.settings, { weeks: Number(weeksIn.value) })); save(); render(); });
    var curCard = h('section', { class: 'card', id: 'curCard' }, h('div', { class: 'card-head' }, h('h2', null, '신입사원 교육 커리큘럼 — ' + s.weeks + '주'),
        h('div', { class: 'btn-row no-print' }, h('label', { class: 'field inline' }, h('span', null, '기간(주)'), weeksIn),
          h('button', { type: 'button', class: 'btn', onclick: function () { printSection(document.getElementById('curCard')); } }, '인쇄'),
          h('button', { type: 'button', class: 'btn', onclick: function () { XLSX.writeFile(xlsxBook([['커리큘럼', curriculumAoa(cur)]]), '신입교육_커리큘럼_' + today() + '.xlsx'); } }, '엑셀로'))),
      h('p', { class: 'note' }, '교육에 넣은 업무를 난이도 쉬움 → 보통 → 어려움 순으로, 같은 난이도는 넣은 순서대로 주차에 나눕니다(주당 ' + cur.perWeek + '개). 난이도와 「교육에 넣기」는 아래 「교육 한 장 만들기」에서 바꿉니다.'),
      !db.core.length ? h('p', { class: 'alert warn' }, '교육에 넣은 업무가 없습니다. ④ 문서로 내보내기에서 보내거나, 아래에서 업무를 골라 「교육에 넣기」를 눌러 주세요.') : null,
      h('div', { class: 'weeks' }, cur.weeks.map(function (w) {
        return h('div', { class: 'week' }, h('h3', null, w.week + '주차', h('span', { class: 'sub' }, w.focus)),
          h('ol', null, w.week === 1 ? h('li', { class: 'orient' }, h('strong', null, cur.orientation.title), h('span', { class: 'sub' }, cur.orientation.text)) : null,
            w.items.map(function (it) {
              return h('li', null, h('a', { href: '#/edu', onclick: function () { ui.eduTask = it.taskId; setTimeout(function () { var x = document.getElementById('lessonCard'); if (x) x.scrollIntoView(); }, 30); } }, it.name),
                h('span', { class: 'meta' }, diffTag(it.difficulty), it.hasFlow ? h('span', { class: 'tag ok' }, '흐름도') : h('span', { class: 'tag' }, '흐름도 없음'), it.hasLesson ? h('span', { class: 'tag ok' }, '교육 한 장') : h('span', { class: 'tag' }, '교육 한 장 없음')));
            })));
      })));
    ui.eduTask = pickDefaultLesson();
    var t = taskById(ui.eduTask);
    return [head, curCard, lessonEditor(t), lessonPaperCard(t), aiLessonCard(t)];
  }
  function pickDefaultLesson() {
    if (ui.eduTask && taskById(ui.eduTask)) return ui.eduTask;
    var core = coreTasks();
    return ((core.filter(function (t) { return db.lessons[t.id]; })[0]) || core[0] || db.tasks[0]).id;
  }
  function curriculumAoa(cur) {
    var a = [['주차', '순서', '업무', '담당 직책', '난이도', '흐름도', '교육 한 장']];
    cur.weeks.forEach(function (w) {
      if (w.week === 1) a.push([1, 0, cur.orientation.title, '', '', '', '']);
      w.items.forEach(function (it, i) { a.push([w.week, i + 1, it.name, it.role, L.DIFF_LABEL[it.difficulty], it.hasFlow ? '있음' : '없음', it.hasLesson ? '있음' : '없음']); });
    });
    return a;
  }
  function lessonEditor(t) {
    var l = db.lessons[t.id], f = db.flows[t.id];
    var picker = fld('업무', taskPicker(t.id, function (v) { ui.eduTask = v; ui.aiLessonAnswer = ''; render(); setTimeout(function () { var x = document.getElementById('lessonCard'); if (x) x.scrollIntoView(); }, 30); }, '교육 한 장 업무'));
    var diffSel = h('select', { 'aria-label': '난이도' }, [1, 2, 3].map(function (k) { var o = h('option', { value: String(k) }, L.DIFF_LABEL[k]); if ((t.difficulty || 2) === k) o.selected = true; return o; }));
    diffSel.addEventListener('change', function () { t.difficulty = Number(diffSel.value); save(); render(); });
    var inCore = db.core.indexOf(t.id) >= 0;
    var coreBtn = h('button', { type: 'button', class: 'btn btn-sm' + (inCore ? '' : ' btn-primary'), id: 'coreToggle', onclick: function () {
      if (inCore) db.core = db.core.filter(function (x) { return x !== t.id; }); else db.core.push(t.id);
      save(); render(); toast(inCore ? '「' + t.name + '」을(를) 커리큘럼에서 뺐습니다.' : '「' + t.name + '」을(를) 커리큘럼에 넣었습니다.');
    } }, inCore ? '커리큘럼에서 빼기' : '교육에 넣기');
    var card = h('section', { class: 'card no-print', id: 'lessonCard' }, h('h2', null, '교육 한 장 만들기'), h('div', { class: 'filters' }, picker, fld('난이도', diffSel), h('div', { class: 'field' }, h('span', null, '커리큘럼'), coreBtn)));
    if (!l) {
      add(card, [h('p', null, '「' + t.name + '」의 교육 한 장이 아직 없습니다.'),
        !(f && f.steps.length) ? h('p', { class: 'alert info' }, '흐름도가 있으면 판단 갈림 · 산출 문서 · 담당 같은 사실로 핵심 포인트와 확인 퀴즈 초안을 만듭니다. ④ 문서로 내보내기에서 이 업무의 초안 흐름을 먼저 보내면 좋습니다.') : null,
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn btn-primary', onclick: function () { var d = L.draftLesson(t, f, db.docs); d.updated = today(); db.lessons[t.id] = L.cleanLesson(d); save(); render(); toast('흐름도 사실로 초안을 만들었습니다. 「자주 하는 실수」는 현장 경험으로 채워 주세요.'); } }, f && f.steps.length ? '흐름도로 초안 만들기' : '빈 양식으로 시작'),
          f && f.steps.length ? null : h('a', { class: 'btn', href: '#/export' }, '④ 문서로 내보내기에서 흐름 보내기'))]);
      return card;
    }
    function saveL() { l.updated = today(); db.lessons[t.id] = L.cleanLesson(l); l = db.lessons[t.id]; save(); refreshPaper(); }
    var purpose = h('textarea', { rows: 2 }); purpose.value = l.purpose;
    purpose.addEventListener('change', function () { l.purpose = purpose.value; saveL(); });
    var points = h('textarea', { rows: 5 }); points.value = l.points.join('\n');
    points.addEventListener('change', function () { l.points = points.value.split('\n'); saveL(); });
    var mistakes = h('textarea', { rows: 4, placeholder: '한 줄에 하나씩. 예: 불합격품에 식별 표시를 늦게 붙여 합격품과 섞인다.' }); mistakes.value = l.mistakes.join('\n');
    mistakes.addEventListener('change', function () { l.mistakes = mistakes.value.split('\n'); saveL(); });
    var quiz = [0, 1, 2].map(function (qi) {
      var q = l.quiz[qi] || { q: '', options: ['', '', '', ''], answer: 0, explain: '' };
      while (q.options.length < 4) q.options.push('');
      function setQ() { var arr = l.quiz.slice(); arr[qi] = q; l.quiz = arr.filter(Boolean); saveL(); }
      var qIn = h('input', { value: q.q, placeholder: '질문' }); qIn.addEventListener('change', function () { q.q = qIn.value; setQ(); });
      var ansSel = h('select', { 'aria-label': (qi + 1) + '번 정답' });
      var opts = q.options.map(function (o, oi) {
        var e = h('input', { value: o, placeholder: '보기 ' + (oi + 1), 'aria-label': (qi + 1) + '번 보기 ' + (oi + 1) });
        e.addEventListener('change', function () { q.options[oi] = e.value; setQ(); });
        var opt = h('option', { value: String(oi) }, '①②③④'.charAt(oi)); if (q.answer === oi) opt.selected = true; ansSel.appendChild(opt);
        return e;
      });
      ansSel.addEventListener('change', function () { q.answer = Number(ansSel.value); setQ(); });
      var ex = h('input', { value: q.explain, placeholder: '해설(한 문장)' }); ex.addEventListener('change', function () { q.explain = ex.value; setQ(); });
      return h('fieldset', { class: 'step' }, h('legend', null, '확인 퀴즈 ' + (qi + 1)), fld('질문', qIn), h('div', { class: 'opt-grid' }, opts), h('div', { class: 'step-grid' }, fld('정답', ansSel), fld('해설', ex)));
    });
    var linked = (l.docIds || []).map(docById).filter(Boolean);
    add(card, [h('div', { class: 'form-grid one' }, fld('목적', purpose), fld('핵심 포인트 (한 줄에 하나)', points, l.auto ? '흐름도 사실로 만든 초안입니다. 쉬운 말로 고쳐 주세요.' : null), fld('자주 하는 실수 (한 줄에 하나)', mistakes, '현장 경험이 필요한 칸이라 초안에서는 비워 둡니다(AI 초안을 쓸 수도 있음).')),
      h('p', { class: 'note' }, '관련 문서: ' + (linked.map(function (d) { return d.name; }).join(', ') || '없음') + ' — 흐름도의 입력 · 산출 문서에서 가져옵니다.'),
      quiz,
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn', onclick: function () { if (!confirm('퀴즈 3문항을 흐름도 사실로 다시 만들까요? 지금 퀴즈는 바뀝니다.')) return; l.quiz = L.buildQuiz(t, (f && f.steps) || [], db.docs); saveL(); render(); } }, '퀴즈를 흐름도로 다시 만들기'),
        h('button', { type: 'button', class: 'btn', onclick: function () { l.docIds = L.flowDocRefs(f || { steps: [] }, db.docs).ids; saveL(); render(); } }, '관련 문서 다시 읽기'),
        h('button', { type: 'button', class: 'btn btn-danger', onclick: function () { if (confirm('「' + t.name + '」 교육 한 장을 지울까요?')) { delete db.lessons[t.id]; save(); render(); } } }, '교육 한 장 지우기'))]);
    return card;
  }
  function lessonPaper(t) {
    var l = db.lessons[t.id], f = db.flows[t.id];
    if (!l) return h('p', { class: 'note' }, '교육 한 장을 만들면 여기에 인쇄용 한 장이 보입니다.');
    var linked = (l.docIds || []).map(docById).filter(Boolean);
    return h('div', { class: 'rp lesson' },
      h('div', { class: 'lesson-top' }, h('span', { class: 'stage' }, '신입사원 교육 한 장'), h('span', { class: 'note' }, '품질경영팀 · ' + (l.updated || today()))),
      h('h1', null, t.name),
      h('p', { class: 'meta' }, ['주기 ' + (t.cycle || '미상'), '1회 ' + (t.hours || '미상'), '주 담당 ' + (t.role || '미상'), '난이도 ' + L.DIFF_LABEL[t.difficulty || 2]].join(' · ')),
      h('h2', null, '1. 목적'), h('p', null, l.purpose || '(비어 있음)'),
      h('h2', null, '2. 업무 흐름'), f && f.steps.length ? h('div', { class: 'flow-wrap paper-flow' }) : h('p', { class: 'note' }, '흐름도가 아직 없습니다.'),
      h('div', { class: 'two-col' },
        h('div', null, h('h2', null, '3. 핵심 포인트'), l.points.length ? h('ul', null, l.points.map(function (p) { return h('li', null, p); })) : h('p', { class: 'note' }, '(비어 있음)')),
        h('div', null, h('h2', null, '4. 자주 하는 실수'), l.mistakes.length ? h('ul', null, l.mistakes.map(function (p) { return h('li', null, p); })) : h('p', { class: 'note' }, '(현장 경험으로 채워 주세요)'))),
      linked.length ? [h('h2', null, '5. 함께 볼 문서'), h('p', null, linked.map(function (d) { return (d.code ? d.code + ' ' : '') + d.name + (d.version ? '(' + d.version + ')' : ''); }).join(', '))] : null,
      h('h2', null, (linked.length ? '6' : '5') + '. 확인 퀴즈'),
      l.quiz.length ? h('ol', { class: 'quiz' }, l.quiz.map(function (q) {
        return h('li', null, h('p', { class: 'q' }, q.q), h('ul', { class: 'opts' }, q.options.map(function (o, k) { return h('li', null, '①②③④⑤'.charAt(k) + ' ' + o); })));
      })) : h('p', { class: 'note' }, '(퀴즈가 없습니다)'),
      l.quiz.length ? h('p', { class: 'answers' }, '정답: ' + l.quiz.map(function (q, i) { return (i + 1) + '번 ' + '①②③④⑤'.charAt(q.answer) + (q.explain ? '(' + q.explain + ')' : ''); }).join(' · ')) : null);
  }
  function lessonPaperCard(t) {
    var l = db.lessons[t.id];
    return h('section', { class: 'card paper', id: 'paperCard' }, h('div', { class: 'card-head no-print' }, h('h2', null, '인쇄용 한 장 미리 보기'),
      l ? h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: function () { printSection(document.getElementById('paperCard')); } }, '인쇄 / PDF'),
        h('button', { type: 'button', class: 'btn', onclick: function () { exportLessonWord(t); } }, 'Word 로')) : null),
      h('div', { id: 'paperBody' }, lessonPaper(t)));
  }
  function refreshPaper() {
    var b = document.getElementById('paperBody'); if (!b) return;
    var t = taskById(ui.eduTask); b.innerHTML = ''; b.appendChild(lessonPaper(t)); fillPaperFlow(t);
  }
  function fillPaperFlow(t) {
    if (!t) return; // 업무 목록이 비어 ⑤ 화면이 빈 안내만 그린 때
    var pf = document.querySelector('.paper-flow'), f = db.flows[t.id];
    if (pf && f && f.steps.length) pf.innerHTML = L.flowSvg(L.layoutFlow(f.steps), {});
  }
  function exportLessonWord(t) {
    var l = db.lessons[t.id], f = db.flows[t.id];
    var e = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
    var linked = (l.docIds || []).map(docById).filter(Boolean);
    var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>교육 한 장 — ' + e(t.name) + '</title>' +
      '<style>body{font-family:"맑은 고딕",sans-serif;font-size:10.5pt} table{border-collapse:collapse;margin:6px 0;width:100%} th,td{border:1px solid #999;padding:3px 6px;font-size:9.5pt;vertical-align:top} th{background:#eef2f7} h1{font-size:17pt;margin:0 0 4pt} h2{font-size:12.5pt;margin-top:12pt;color:#0f2544} .meta{color:#555}</style></head><body>' +
      '<p class="meta">신입사원 교육 한 장 · 품질경영팀 · ' + e(l.updated || today()) + '</p><h1>' + e(t.name) + '</h1>' +
      '<p class="meta">주기 ' + e(t.cycle || '미상') + ' · 1회 ' + e(t.hours || '미상') + ' · 주 담당 ' + e(t.role || '미상') + ' · 난이도 ' + L.DIFF_LABEL[t.difficulty || 2] + '</p>' +
      '<h2>1. 목적</h2><p>' + e(l.purpose) + '</p><h2>2. 업무 흐름</h2>' +
      (f && f.steps.length ? '<table><tr><th>순서</th><th>단계</th><th>담당</th><th>입력 문서</th><th>산출 문서</th><th>갈림</th></tr>' + f.steps.map(function (s, i) {
        var tg = L.stepTargets(f.steps, i), br = s.question ? '예 → ' + L.stepName(f.steps, tg[0].to) + ' / 아니오 → ' + (tg[1].to == null ? '-' : L.stepName(f.steps, tg[1].to)) : (tg[0].to === 'end' ? '끝' : tg[0].to !== i + 2 ? '→ ' + L.stepName(f.steps, tg[0].to) : '');
        return '<tr><td>' + (i + 1) + '</td><td>' + e(s.question ? '[판단] ' + s.question : s.name) + '</td><td>' + e(s.role) + '</td><td>' + e(s.inputs) + '</td><td>' + e(s.outputs) + '</td><td>' + e(br) + '</td></tr>';
      }).join('') + '</table><p class="meta">흐름도 그림은 ④ 문서로 내보내기 화면의 「흐름도 PNG」로 받아 이 자리에 붙일 수 있습니다.</p>' : '<p>(흐름도 없음)</p>') +
      '<h2>3. 핵심 포인트</h2><ul>' + l.points.map(function (p) { return '<li>' + e(p) + '</li>'; }).join('') + '</ul>' +
      '<h2>4. 자주 하는 실수</h2><ul>' + l.mistakes.map(function (p) { return '<li>' + e(p) + '</li>'; }).join('') + '</ul>' +
      (linked.length ? '<h2>5. 함께 볼 문서</h2><p>' + linked.map(function (d) { return e((d.code ? d.code + ' ' : '') + d.name); }).join(', ') + '</p>' : '') +
      '<h2>' + (linked.length ? 6 : 5) + '. 확인 퀴즈</h2>' + l.quiz.map(function (q, i) { return '<p><b>' + (i + 1) + '. ' + e(q.q) + '</b><br>' + q.options.map(function (o, k) { return '①②③④⑤'.charAt(k) + ' ' + e(o); }).join('&nbsp;&nbsp; ') + '</p>'; }).join('') +
      '<p class="meta">정답: ' + l.quiz.map(function (q, i) { return (i + 1) + '번 ' + '①②③④⑤'.charAt(q.answer); }).join(' · ') + '</p></body></html>';
    download('교육한장_' + safe(t.name) + '.doc', new Blob(['﻿' + html], { type: 'application/msword' }));
  }
  function aiLessonCard(t) {
    var f = db.flows[t.id], l = db.lessons[t.id];
    var prompt = L.lessonPrompt(t, f, db.docs, l);
    var box = h('textarea', { rows: 8, readonly: true, class: 'mono' }); box.value = prompt;
    var ans = h('textarea', { rows: 8, placeholder: '「목적: / 핵심 포인트: / 자주 하는 실수: / 퀴즈:」 형식의 AI 답을 붙여 넣어 주세요.' }); ans.value = ui.aiLessonAnswer;
    ans.addEventListener('input', function () { ui.aiLessonAnswer = ans.value; });
    function apply(text) {
      var r = L.parseLessonAnswer(text);
      var cur = db.lessons[t.id] || { purpose: '', points: [], mistakes: [], quiz: [], docIds: f ? L.flowDocRefs(f, db.docs).ids : [] };
      var n = r.lesson, changed = [];
      if (n.purpose) { cur.purpose = n.purpose; changed.push('목적'); }
      if (n.points.length) { cur.points = n.points; changed.push('핵심 포인트'); }
      if (n.mistakes.length) { cur.mistakes = n.mistakes; changed.push('자주 하는 실수'); }
      if (n.quiz.length) { cur.quiz = n.quiz.slice(0, 3); changed.push('퀴즈 ' + Math.min(3, n.quiz.length) + '문항'); }
      if (!changed.length) { toast(r.warnings[0] || '읽을 내용이 없습니다.', true); return; }
      cur.auto = false; cur.updated = today(); db.lessons[t.id] = L.cleanLesson(cur); ui.aiLessonAnswer = ''; save(); render();
      toast('반영: ' + changed.join(' · ') + (r.warnings.length ? ' — ' + r.warnings.join(' ') : '') + ' 사실과 맞는지 꼭 검토해 주세요.', !!r.warnings.length);
    }
    return h('section', { class: 'card no-print' }, h('h2', null, 'AI 로 교육 한 장 초안 (반자동)'),
      h('p', { class: 'note' }, '단계 표와 관련 문서 이름만 담은 프롬프트입니다. AI 답의 목적 · 핵심 포인트 · 자주 하는 실수 · 퀴즈를 읽어 위 칸에 넣습니다(빈 칸은 그대로 둠). 숫자 · 기준값 · 조항 번호는 반드시 원문 문서와 대조해 주세요.'),
      !(f && f.steps.length) ? h('p', { class: 'alert info' }, '흐름도가 없으면 AI 에 줄 사실이 업무명 · 주기뿐입니다. ④ 문서로 내보내기에서 이 업무의 초안 흐름을 먼저 보내는 것을 권합니다.') : null,
      h('details', null, h('summary', null, '프롬프트 보기'), box),
      h('div', { class: 'btn-row', style: 'margin:10px 0' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: function () { copyText(prompt); } }, '프롬프트 복사'),
        AIP.sendButton('설정한 AI 서버로 보내기(선택)', function () { return prompt; }, function (text) { ans.value = text; ui.aiLessonAnswer = text; toast('AI 답을 받았습니다. 「읽어서 반영」을 눌러 주세요.'); },
          { toast: toast, settingsHref: '#/settings', system: '너는 제조업 품질 신입사원 교육 자료를 쓰는 보조야. 주어진 단계 표 밖의 숫자·조항을 만들지 마.' })),
      fld('AI 답 붙여 넣기', ans),
      h('div', { class: 'btn-row', style: 'margin-top:8px' }, h('button', { type: 'button', class: 'btn', onclick: function () { apply(ans.value); } }, '읽어서 반영')));
  }

  /* ══ 업무 경험 수집 · AI 업무 자료화 (2026-10-28 방향 수정) ═══════════
     ① 자료 등록하기 → ② 담당자에게 질문하기 → ③ AI 초안 작성 → ④ 문서로 내보내기 → ⑤ 신입 교육 자료 만들기.
     계산 · 검사는 js/capture.js(QWCapture), 사진은 js/store.js 의 QWImages(IndexedDB).
     2026-11-10 요청으로 1단계 화면 4개(업무 목록 가져오기 · 핵심 업무 선정 · 문서 맵 · 업무 흐름도)는 메뉴에서 뺐습니다(신규 기능과 겹침).
     화면 코드와 저장된 자료는 그대로 두고, 주소(#/import 등)로만 열립니다. */
  var C = window.QWCapture, IMG = window.QWImages;
  function curWork() {
    var w = db.works.filter(function (x) { return x.id === db.curWork; })[0] || db.works[0] || null;
    if (w) db.curWork = w.id;
    return w;
  }
  function workTask(w) { return w && w.taskId ? taskById(w.taskId) : null; }
  function basisTag(b) { return h('span', { class: 'tag basis basis-' + b }, C.BASIS_LABEL[b]); }
  function refChip(w, id) { return h('span', { class: 'ref-chip ref-' + id.charAt(0), title: C.refLabel(w, id) }, id); }
  function goTo(hash, id) { if (location.hash === hash) render(); else location.hash = hash; if (id) setTimeout(function () { var x = document.getElementById(id); if (x) x.scrollIntoView(); }, 40); }
  function noWork() {
    return h('section', { class: 'card empty' }, h('p', null, '아직 자료화할 업무가 없습니다.'),
      h('div', { class: 'btn-row', style: 'justify-content:center' },
        h('a', { class: 'btn btn-primary', href: '#/work' }, '① 업무 고르기로'),
        h('button', { type: 'button', class: 'btn', onclick: function () { loadSample('#/work'); } }, '샘플로 해 보기')));
  }
  /* 화면 맨 위 — 지금 업무 고르기 + 진행 표시 */
  function workBar(w) {
    var sel = h('select', { 'aria-label': '자료화할 업무' }, db.works.map(function (x) { var o = h('option', { value: x.id }, x.name); if (x.id === w.id) o.selected = true; return o; }));
    sel.addEventListener('change', function () { db.curWork = sel.value; ui.draftParsed = null; ui.draftAnswer = ''; ui.qParsed = null; save(); render(); });
    var p = C.progress(w), t = workTask(w);
    return h('section', { class: 'card work-bar no-print' },
      h('div', { class: 'filters' }, fld('자료화할 업무', sel),
        h('div', { class: 'field' }, h('span', null, '진행'), h('div', { class: 'prog-tags' },
          h('span', { class: 'tag' + (p.materials ? ' ok' : '') }, '자료 ' + p.materials + (p.images ? ' · 사진 ' + p.images : '')),
          h('span', { class: 'tag' + (p.answered ? ' ok' : '') }, '답변 ' + p.answered + '/' + p.questions + (p.transcripts ? ' · 설명 ' + p.transcripts : '')),
          h('span', { class: 'tag' + (p.versions ? ' ok' : '') }, p.versions ? '초안 v' + w.current + ' · 단계 ' + p.steps : '초안 없음'),
          p.steps ? h('span', { class: 'tag' + (p.confirmed === p.steps ? ' ok' : '') }, '담당자 확인 ' + p.confirmed + '/' + p.steps) : null)),
        t ? h('div', { class: 'field' }, h('span', null, '업무 목록'), h('div', null, (t.cycle || '주기 미상') + ' · 1회 ' + (t.hours || '미상') + ' · ' + (t.role || '직책 미상'))) : null));
  }
  function nextLink(href, label) { return h('div', { class: 'btn-row next-row no-print' }, h('a', { class: 'btn btn-primary btn-big', href: href }, label)); }

  /* ── ① 자료 등록하기 ─────────── */
  function loadNotice() {
    var n = S.loadNotice();
    if (!n || ui.noticeClosed) return null;
    var close = h('button', { type: 'button', class: 'btn btn-sm', onclick: function () { ui.noticeClosed = true; render(); } }, '닫기');
    if (n === 'upgraded') return h('section', { class: 'card notice', id: 'upgradeNotice' }, h('h2', null, '도구가 새 방향으로 바뀌었습니다 (2026-10-28)'),
      h('p', null, '과제 방향이 「업무 경험 수집 및 AI 기반 디지털 업무 자료화」로 바뀌어, 첫 화면이 「자료 등록하기 → 담당자에게 질문하기 → AI 초안 작성 → 문서로 내보내기」 순서가 되었습니다.'),
      h('p', null, '전에 넣은 업무 목록 · 문서 목록 · 흐름도 · 교육 자료는 지우지 않았습니다. 업무 목록은 아래에서 골라 자료화를 시작할 수 있고, 흐름도 · 교육 자료는 왼쪽 메뉴 「⑤ 신입 교육 자료 만들기」에서 이어 씁니다.'), close);
    if (n === 'broken') return h('section', { class: 'card notice warn', id: 'brokenNotice' }, h('h2', null, '저장된 자료를 읽지 못해 새로 시작했습니다'),
      h('p', null, '이 브라우저에 저장된 자료가 망가져 있어(저장 중 끊김 등) 열 수 없었습니다. 옛 자료는 지우지 않고 따로 남겨 두었습니다.'),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn', onclick: function () { var r = S.brokenRaw(); if (r) download('품질업무_읽지못한자료_' + today() + '.json', new Blob([r], { type: 'application/json' })); } }, '읽지 못한 자료 내려받기'),
        h('button', { type: 'button', class: 'btn btn-danger', onclick: function () { if (confirm('따로 남겨 둔 옛 자료를 지울까요?')) { S.clearBroken(); ui.noticeClosed = true; render(); } } }, '옛 자료 지우기'), close));
    return null;
  }
  function pageWork() {
    var out = [pageHead('①', '자료 등록하기', '자료화할 업무 하나를 고르고, 지금 있는 업무 자료와 화면 캡처 · 사진을 넣습니다. 파일은 서버로 보내지 않고 이 브라우저 안에서만 읽고 저장합니다.'), loadNotice()];
    out.push(h('section', { class: 'card' }, h('h2', null, '일하는 순서'),
      h('ol', { class: 'steps' },
        h('li', null, h('strong', null, '자료 등록하기'), ' — 업무 하나를 고르고 절차서 · 지침서 · 체크리스트 · 기록 양식 · 시스템 입력 항목 · 업무 순서 자료(붙여 넣기 · txt · docx · xlsx), 캡처 · 사진'),
        h('li', null, h('a', { href: '#/interview' }, '② 담당자에게 질문하기'), ' — 기본 질문지 + 자료를 읽고 AI 가 뽑은 질문(문서와 실제가 다른 곳)에 담당자가 답하기, 말로 한 설명 붙여 넣기. 여러 번에 나눠 채워도 됩니다'),
        h('li', null, h('a', { href: '#/draft' }, '③ AI 초안 작성'), ' — 자료 + 답변을 묶은 프롬프트를 회사가 허용한 AI 에 넣고, 답(JSON)을 붙여 넣으면 흐름도와 단계별 업무 방법서가 됩니다. 단계마다 근거(문서 · 담당자 답변 · AI 추정)와 「담당자 확인」 표시'),
        h('li', null, h('a', { href: '#/export' }, '④ 문서로 내보내기'), ' — Word 업무 방법서 · Excel 단계표 · 인수인계 체크리스트 · 1장 요약 · 인쇄'),
        h('li', null, h('a', { href: '#/edu' }, '⑤ 신입 교육 자료 만들기'), ' — 확인한 초안의 흐름으로 업무마다 교육 한 장(목적 · 흐름도 · 핵심 포인트 · 자주 하는 실수 · 확인 퀴즈)과 주차별 커리큘럼')),
      h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: function () { loadSample('#/work'); } }, '샘플로 해 보기(가상 「수입검사 부적합품 처리」)'))));
    out.push(newWorkCard());
    if (ui.pend.task && ui.pend.task.from === 'work') out.push(pendingCard(ui.pend.task));
    var w = curWork();
    if (!w) return out;
    out.push(workBar(w), materialsCard(w), imagesCard(w), nextLink('#/interview', '② 담당자에게 질문하기로'));
    return out;
  }
  function newWorkCard() {
    var name = h('input', { placeholder: '예: 수입검사 부적합품 처리', list: 'taskNames', autocomplete: 'off' });
    var owner = h('input', { placeholder: '예: 검사원 ○○○ (선택)', autocomplete: 'off' });
    var taskSel = null;
    if (db.tasks.length) {
      taskSel = h('select', { 'aria-label': '업무 목록에서 고르기' }, h('option', { value: '' }, '— 업무 목록에서 고르기 —'), db.tasks.map(function (t) { return h('option', { value: t.id }, t.name + (t.role ? ' · ' + t.role : '')); }));
      taskSel.addEventListener('change', function () { var t = taskById(taskSel.value); if (t) { name.value = t.name; if (!owner.value) owner.value = t.role || ''; } });
    }
    var fileIn = h('input', { type: 'file', accept: '.xlsx,.xlsm,.xls,.csv', 'aria-label': '업무 목록 파일로 바꾸기' });
    fileIn.addEventListener('change', function () { handleFile(fileIn.files, 'task', 'work'); fileIn.value = ''; });
    var listTools = h('div', { class: 'btn-row task-tools' },
      h('label', { class: 'btn btn-sm', id: 'taskFileBtn' }, fileIn, db.tasks.length ? '업무 목록 파일로 바꾸기' : '업무 목록 파일 넣기'),
      db.tasks.length ? h('button', { type: 'button', class: 'btn btn-sm btn-danger', id: 'taskClearBtn', onclick: function () { confirmTaskReplace(null); } }, '업무 목록 비우기') : null,
      h('span', { class: 'note' }, 'xlsx · xls · csv — 업무명 열만 있으면 됩니다(지금 목록에 합치지 않고 바꿈)'));
    var selHint = db.taskSource ? '「' + db.taskSource.name + '」에서 넣은 업무 ' + db.tasks.length + '가지'
      : db.sample ? '가상 샘플 업무 목록 ' + db.tasks.length + '가지 — 내 업무 목록은 아래 「업무 목록 파일로 바꾸기」'
      : '전에 넣은 업무 목록 ' + db.tasks.length + '가지';
    function create() {
      var n = name.value.trim();
      if (!n) { toast('업무 이름을 적어 주세요.', true); name.focus(); return; }
      var t = taskSel && taskSel.value ? taskById(taskSel.value) : db.tasks.filter(function (x) { return x.name === n; })[0];
      var w = C.emptyWork(n, { id: C.nextNo('W', db.works), taskId: t ? t.id : '', owner: owner.value, today: today() });
      w.questions = C.templateQuestions([]);
      db.works.push(w); db.curWork = w.id; save(); render(); toast('「' + n + '」을(를) 시작했습니다. 아래에 자료를 넣어 주세요.');
    }
    var list = db.works.length ? h('div', { class: 'work-list' }, db.works.map(function (x) {
      var p = C.progress(x), on = x.id === db.curWork;
      return h('div', { class: 'work-item' + (on ? ' on' : '') },
        h('button', { type: 'button', class: 'btn btn-sm' + (on ? ' btn-primary' : ''), 'aria-pressed': on ? 'true' : 'false', onclick: function () { db.curWork = x.id; ui.draftParsed = null; save(); render(); } }, x.name),
        h('span', { class: 'note' }, '자료 ' + p.materials + ' · 답변 ' + p.answered + '/' + p.questions + ' · ' + (p.versions ? '초안 v' + x.current : '초안 없음') + (x.updated ? ' · ' + x.updated : '')),
        h('button', { type: 'button', class: 'btn btn-sm btn-danger', 'aria-label': x.name + ' 지우기', onclick: function () {
          if (!confirm('「' + x.name + '」의 자료 · 답변 · 초안을 모두 지울까요?')) return;
          x.images.forEach(function (p2) { IMG.del(p2.key); });
          db.works = db.works.filter(function (y) { return y !== x; }); db.curWork = db.works[0] ? db.works[0].id : ''; save(); render();
        } }, '지우기'));
    })) : null;
    return h('section', { class: 'card' }, h('h2', null, db.works.length ? '업무 (' + db.works.length + '개) · 새 업무' : '업무 하나 만들기'),
      list,
      h('datalist', { id: 'taskNames' }, db.tasks.map(function (t) { return h('option', { value: t.name }); })),
      h('div', { class: 'form-grid', style: 'margin-top:12px' },
        taskSel ? h('div', { class: 'field' }, fld('업무 목록에서 고르기', taskSel, selHint), listTools) : h('div', { class: 'field' }, h('span', null, '업무 목록(선택)'), listTools),
        fld('업무 이름', name), fld('담당자(선택)', owner, '질문할 사람 · 직책')),
      h('div', { class: 'btn-row', style: 'margin-top:10px' }, h('button', { type: 'button', class: 'btn' + (db.works.length ? '' : ' btn-primary'), onclick: create }, '이 업무로 시작')));
  }
  /* txt 는 UTF-8 이 아니면 EUC-KR(한글 윈도 메모장)로 읽음 */
  function decodeText(buf) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch (e) { try { return new TextDecoder('euc-kr').decode(buf); } catch (e2) { return new TextDecoder('utf-8').decode(buf); } }
  }
  function readMaterialFiles(files, w) {
    Array.prototype.forEach.call(files || [], function (f) {
      var k = C.fileKind(f.name);
      if (k === 'image') { addImageFile(f, w); return; }
      if (k === 'pdf') { toast(f.name + ': PDF 는 이 도구에서 글자를 꺼내지 못합니다. PDF 를 열어 글자를 복사(Ctrl+A → Ctrl+C)해 「붙여 넣기」 칸에 넣어 주세요.', true); return; }
      if (k !== 'text' && k !== 'docx' && k !== 'xlsx') { toast(f.name + ': 이 형식은 읽지 못합니다. txt · docx · xlsx 로 저장하거나 글자를 복사해 붙여 넣어 주세요.', true); return; }
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var u8 = new Uint8Array(fr.result), text;
          if (k === 'text') text = decodeText(u8);
          else if (k === 'docx') text = C.docxText(u8, XLSX.CFB);
          else text = C.xlsxText(XLSX.read(u8, { type: 'array' }), XLSX);
          if (!String(text).trim()) throw new Error('꺼낸 글자가 없습니다(그림만 있는 문서일 수 있습니다). 글자를 복사해 붙여 넣어 주세요.');
          var m = C.addMaterial(w, { name: f.name.replace(/\.[^.]+$/, ''), text: text, from: f.name }, today());
          save(); render(); toast(m.id + ' 「' + m.name + '」 ' + text.length.toLocaleString('ko-KR') + '자를 넣었습니다. 종류(' + m.kind + ')가 맞는지 확인해 주세요.');
        } catch (e) { toast(f.name + ': ' + e.message, true); }
      };
      fr.onerror = function () { toast(f.name + ': 파일을 읽지 못했습니다.', true); };
      fr.readAsArrayBuffer(f);
    });
  }
  function materialsCard(w) {
    var nameIn = h('input', { placeholder: '예: 부적합품 처리 절차서 4장', autocomplete: 'off' });
    var kindSel = h('select', { 'aria-label': '자료 종류' }, h('option', { value: '' }, '종류 — 이름으로 짐작'), C.MATERIAL_KINDS.map(function (k) { return h('option', { value: k }, k); }));
    var text = h('textarea', { rows: 6, placeholder: '절차서 · 지침서 문단, 체크리스트, 양식 항목, 시스템 입력 항목, 업무 순서 메모를 그대로 붙여 넣어 주세요.' });
    function addPaste() {
      if (!text.value.trim()) { toast('붙여 넣을 글이 비어 있습니다.', true); text.focus(); return; }
      var m = C.addMaterial(w, { name: nameIn.value.trim() || '붙여 넣은 자료 ' + (w.materials.length + 1), kind: kindSel.value, text: text.value, from: '붙여 넣기' }, today());
      save(); render(); toast(m.id + ' 「' + m.name + '」을(를) 넣었습니다.');
    }
    var input = h('input', { type: 'file', multiple: true, accept: '.txt,.md,.csv,.docx,.xlsx,.xlsm,.xls,.pdf,image/*' });
    input.addEventListener('change', function () { readMaterialFiles(input.files, w); input.value = ''; });
    var drop = h('div', { class: 'drop' }, h('label', { class: 'btn btn-primary' }, input, '자료 파일 고르기'), h('span', { class: 'note' }, 'txt · docx · xlsx (여러 개 가능) — 또는 여기로 끌어다 놓아 주세요. PDF · 한글(hwp)은 글자를 복사해 붙여 넣어 주세요.'));
    drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
    drop.addEventListener('drop', function (e) { e.preventDefault(); drop.classList.remove('over'); readMaterialFiles(e.dataTransfer.files, w); });
    var t = workTask(w), f = t && db.flows[t.id];
    var fromFlow = f && f.steps.length ? h('button', { type: 'button', class: 'btn', onclick: function () {
      var m = C.addMaterial(w, { name: '전에 만든 흐름도 단계 표 — ' + t.name, kind: '업무 순서 자료', text: C.flowToMaterialText(t, f), from: '전에 만든 업무 흐름도' }, today());
      save(); render(); toast(m.id + ' 로 전에 만든 흐름도를 넣었습니다.');
    } }, '전에 만든 흐름도를 자료로 넣기') : null;
    var items = w.materials.map(function (m) {
      var ta = h('textarea', { rows: 8, 'aria-label': m.id + ' 내용' }); ta.value = m.text;
      ta.addEventListener('change', function () { m.text = ta.value; w.updated = today(); save(); toast(m.id + ' 내용을 고쳤습니다.'); });
      var ks = h('select', { 'aria-label': m.id + ' 종류' }, C.MATERIAL_KINDS.map(function (k) { var o = h('option', { value: k }, k); if (k === m.kind) o.selected = true; return o; }));
      ks.addEventListener('change', function () { m.kind = ks.value; save(); render(); });
      var nm = h('input', { value: m.name, 'aria-label': m.id + ' 이름' });
      nm.addEventListener('change', function () { m.name = nm.value.trim() || m.name; save(); render(); });
      return h('details', { class: 'mat' }, h('summary', null, h('span', { class: 'ref-chip ref-M' }, m.id), ' ', h('strong', null, m.name), h('span', { class: 'note' }, ' · ' + m.kind + ' · ' + m.text.length.toLocaleString('ko-KR') + '자' + (m.from && m.from !== '붙여 넣기' ? ' · ' + m.from : ''))),
        h('div', { class: 'form-grid' }, fld('이름', nm), fld('종류', ks)), fld('내용(고치면 저장)', ta),
        h('div', { class: 'btn-row', style: 'margin-top:6px' }, h('button', { type: 'button', class: 'btn btn-sm btn-danger', onclick: function () { if (confirm(m.id + ' 「' + m.name + '」을(를) 뺄까요? 이 자료를 근거로 든 초안의 표시는 다음 판부터 빠집니다.')) { w.materials = w.materials.filter(function (x) { return x !== m; }); save(); render(); } } }, '빼기')));
    });
    return h('section', { class: 'card', id: 'materials' }, h('h2', null, '업무 자료 (' + w.materials.length + '개)'),
      h('p', { class: 'note' }, '정형 자료(절차서 · 지침서 · 체크리스트 · 기록 양식 · 시스템 입력 항목 · 업무 순서 자료)를 넣습니다. 넣은 순서대로 M1 · M2 … 번호가 붙고, 초안의 단계마다 어느 자료를 근거로 했는지 이 번호로 보입니다. 회사 문서를 외부 AI 에 넣어도 되는지는 회사 보안 기준을 먼저 확인해 주세요.'),
      drop, fromFlow ? h('div', { class: 'btn-row', style: 'margin-bottom:12px' }, fromFlow) : null,
      h('details', { class: 'paste-box', open: w.materials.length ? null : true }, h('summary', null, '글로 붙여 넣기'),
        h('div', { class: 'form-grid' }, fld('자료 이름', nameIn), fld('종류', kindSel)), fld('내용', text),
        h('div', { class: 'btn-row', style: 'margin-top:8px' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: addPaste }, '자료로 넣기'))),
      items.length ? h('div', { class: 'mat-list' }, items) : h('p', { class: 'note' }, '아직 자료가 없습니다. 자료 없이 담당자 답변만으로도 초안을 만들 수 있습니다.'));
  }
  /* 사진 · 캡처 — 큰 사진은 긴 변 1600px JPEG 로 줄여 IndexedDB 에 둡니다 */
  function addImageFile(f, w) {
    var fr = new FileReader();
    fr.onload = function () {
      var url = fr.result, img = new Image();
      img.onload = function () {
        var W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
        if (f.size > 400 * 1024 && !/svg|gif/i.test(f.type)) {
          var sc = Math.min(1, 1600 / Math.max(W, H)), c = document.createElement('canvas');
          c.width = Math.round(W * sc); c.height = Math.round(H * sc);
          var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
          url = c.toDataURL('image/jpeg', 0.85); W = c.width; H = c.height;
        }
        var key = 'img-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        IMG.put(key, url).then(function () {
          var p = { id: C.nextNo('P', w.images), key: key, name: f.name, caption: '', w: W, h: H, at: today() };
          w.images.push(p); w.updated = today(); save(); render(); toast(p.id + ' 「' + f.name + '」을(를) 넣었습니다. 설명(무슨 화면인지)을 적어 주세요 — AI 에는 그림이 아니라 설명이 들어갑니다.');
        });
      };
      img.onerror = function () { toast(f.name + ': 그림을 읽지 못했습니다.', true); };
      img.src = url;
    };
    fr.readAsDataURL(f);
  }
  function thumb(p, cls) {
    var im = h('img', { alt: p.id + ' ' + (p.caption || p.name), class: cls || 'thumb', loading: 'lazy' });
    var c = IMG.cached(p.key);
    if (c) im.src = c; else IMG.get(p.key).then(function (u) { if (u) im.src = u; else im.alt = p.id + ' (이 브라우저에 그림이 없음 — 백업을 불러오면 돌아옵니다)'; });
    return im;
  }
  function imagesCard(w) {
    var input = h('input', { type: 'file', multiple: true, accept: 'image/*' });
    input.addEventListener('change', function () { Array.prototype.forEach.call(input.files, function (f) { addImageFile(f, w); }); input.value = ''; });
    return h('section', { class: 'card', id: 'images' }, h('h2', null, '화면 캡처 · 사진 (' + w.images.length + '개)'),
      h('p', { class: 'note' }, '시스템 화면 · 양식 · 현장 사진을 넣으면 P1 · P2 … 번호가 붙습니다. 그림은 이 브라우저에만 저장되고 AI 에는 보내지 않습니다 — 아래 설명이 프롬프트에 들어가니 「무슨 화면 · 어디를 보는지」를 적어 주세요. 초안이 근거로 든 그림은 업무 방법서의 그 단계 아래에 붙습니다.'),
      h('div', { class: 'btn-row', style: 'margin-bottom:10px' }, h('label', { class: 'btn' }, input, '캡처 · 사진 고르기')),
      w.images.length ? h('div', { class: 'img-grid' }, w.images.map(function (p) {
        var cap = h('input', { value: p.caption, placeholder: '예: 부적합 등록 화면 — 불량 유형 코드 칸', 'aria-label': p.id + ' 설명' });
        cap.addEventListener('change', function () { p.caption = cap.value.trim(); w.updated = today(); save(); });
        return h('figure', { class: 'img-item' }, thumb(p), h('figcaption', null, h('span', { class: 'ref-chip ref-P' }, p.id), ' ', h('span', { class: 'note' }, p.name)), cap,
          h('button', { type: 'button', class: 'btn btn-sm btn-danger', onclick: function () { if (confirm(p.id + ' 를 뺄까요?')) { IMG.del(p.key); w.images = w.images.filter(function (x) { return x !== p; }); save(); render(); } } }, '빼기'));
      })) : null);
  }

  /* ── ② 담당자에게 질문하기 ─────────────────── */
  function pageInterview() {
    var head = pageHead('②', '담당자에게 질문하기', '문서에 없는 경험 · 판단 기준을 담당자에게 묻고 답을 적습니다. 한 번에 다 채우지 않아도 됩니다 — 답은 질문마다 저장되고, 다음에 이어서 채웁니다.');
    var w = curWork();
    if (!w) return [head, noWork()];
    if (!w.questions.length) w.questions = C.templateQuestions([]);
    return [head, workBar(w), answersCard(w), aiQuestionsCard(w), transcriptCard(w), questionSheet(w), nextLink('#/draft', '③ AI 초안 작성으로')];
  }
  function answersCard(w) {
    var p = C.progress(w), only = h('input', { type: 'checkbox' }); only.checked = !!ui.onlyOpen;
    only.addEventListener('change', function () { ui.onlyOpen = only.checked; render(); });
    var newQ = h('input', { placeholder: '직접 질문 더하기 — 예: 협력사 회신은 며칠 안에 받나요?', autocomplete: 'off' });
    var newCat = h('select', { 'aria-label': '질문 분류' }, C.CATS.map(function (c) { return h('option', { value: c.id }, c.label); }));
    function addQ() { if (!newQ.value.trim()) return; C.addQuestions(w, [{ text: newQ.value.trim(), cat: newCat.value }], '직접'); save(); render(); }
    var groups = C.CATS.map(function (c) {
      var qs = w.questions.filter(function (q) { return q.cat === c.id && (!ui.onlyOpen || !w.answers[q.id]); });
      if (!qs.length) return null;
      return h('div', { class: 'qa-group' }, h('h3', null, c.label), qs.map(function (q) {
        var a = w.answers[q.id];
        var ta = h('textarea', { rows: 3, placeholder: '담당자 답을 적어 주세요(말한 그대로 · 수치 · 예시 · 위치).', 'aria-label': q.id + ' 답' }); ta.value = a ? a.text : '';
        ta.addEventListener('change', function () { C.setAnswer(w, q.id, ta.value, today()); save(); var st = document.getElementById('qst-' + q.id); if (st) { st.textContent = ta.value.trim() ? '저장됨 · ' + today() : '답 없음'; st.className = 'tag' + (ta.value.trim() ? ' ok' : ''); } updateProg(); });
        return h('div', { class: 'qa' + (a ? ' done' : '') },
          h('div', { class: 'qa-top' }, h('span', { class: 'ref-chip ref-Q' }, q.id), h('span', { class: 'qa-q' }, q.text),
            h('span', { class: 'tag' + (a ? ' ok' : ''), id: 'qst-' + q.id }, a ? '저장됨 · ' + (a.at || '') : '답 없음'),
            q.src !== '기본' ? h('span', { class: 'tag' }, q.src) : null),
          q.why ? h('p', { class: 'note' }, '묻는 이유: ' + q.why) : null, ta,
          h('div', { class: 'btn-row tight' }, h('button', { type: 'button', class: 'btn btn-sm btn-danger', 'aria-label': q.id + ' 질문 빼기', onclick: function () {
            if (a && !confirm(q.id + ' 에는 답이 있습니다. 질문과 답을 뺄까요?')) return;
            w.questions = w.questions.filter(function (x) { return x !== q; }); delete w.answers[q.id]; save(); render();
          } }, '질문 빼기')));
      }));
    }).filter(Boolean);
    var bar = h('div', { class: 'prog' }, h('div', { class: 'prog-fill', style: 'width:' + (p.questions ? Math.round(p.answered / p.questions * 100) : 0) + '%' }));
    function updateProg() { var q = C.progress(w); var t = document.getElementById('qProg'); if (t) t.textContent = '답 ' + q.answered + ' / 질문 ' + q.questions; bar.firstChild.style.width = (q.questions ? Math.round(q.answered / q.questions * 100) : 0) + '%'; }
    return h('section', { class: 'card', id: 'answers' }, h('div', { class: 'card-head' }, h('h2', null, '질문과 답'), h('strong', { id: 'qProg' }, '답 ' + p.answered + ' / 질문 ' + p.questions)), bar,
      h('p', { class: 'note' }, '기본 질문 ' + C.TEMPLATE.length + '개(순서 · 판단 기준 · 예외 · 실수 · 주의 · 양식 · 시스템 화면 · 소요시간 · 넘기는 곳)로 시작합니다. 칸을 벗어나면 저장됩니다. 모르는 것은 비워 두면 초안에서 「더 확인할 것」으로 남습니다.'),
      h('div', { class: 'btn-row no-print', style: 'margin:8px 0 12px' },
        h('label', { class: 'opt inline-opt' }, only, h('span', null, '답 없는 질문만 보기')),
        h('button', { type: 'button', class: 'btn btn-sm', onclick: function () { var n = w.questions.length; w.questions = C.templateQuestions(w.questions); save(); render(); toast(w.questions.length - n ? '빠진 기본 질문 ' + (w.questions.length - n) + '개를 더했습니다.' : '기본 질문이 모두 있습니다.'); } }, '빠진 기본 질문 채우기'),
        h('button', { type: 'button', class: 'btn btn-sm', onclick: function () { printSection(document.getElementById('qSheet')); } }, '질문지 인쇄(담당자에게 건네기)')),
      groups.length ? groups : h('p', { class: 'note' }, ui.onlyOpen ? '답 없는 질문이 없습니다.' : '질문이 없습니다.'),
      h('div', { class: 'inline-form no-print', style: 'margin-top:12px' }, fld('새 질문', newQ), fld('분류', newCat), h('button', { type: 'button', class: 'btn', onclick: addQ }, '질문 더하기')));
  }
  function aiQuestionsCard(w) {
    var prompt = C.questionPrompt(w, workTask(w));
    var box = h('textarea', { rows: 8, readonly: true, class: 'mono', 'aria-label': '질문 뽑기 프롬프트' }); box.value = prompt;
    var ans = h('textarea', { rows: 6, placeholder: 'AI 답({"questions":[…]} 또는 번호 줄)을 그대로 붙여 넣어 주세요.', 'aria-label': 'AI 질문 답' }); ans.value = ui.qAnswer || '';
    ans.addEventListener('input', function () { ui.qAnswer = ans.value; });
    function parse(text) { ui.qAnswer = text; ui.qParsed = C.parseQuestionsAnswer(text); ui.qPick = ui.qParsed.questions.map(function () { return true; }); render(); goTo('#/interview', 'aiQ'); }
    var res = ui.qParsed;
    return h('section', { class: 'card no-print', id: 'aiQ' }, h('h2', null, 'AI 로 질문 뽑기 — 자료와 실제가 다른 곳'),
      h('p', { class: 'note' }, '넣은 자료를 읽고 「문서만 보고는 일을 할 수 없는 곳」(빠진 수치 · 애매한 순서 · 예외 · 양식 위치)을 질문으로 뽑아 달라는 프롬프트입니다. 이미 있는 질문과 겹치지 않게 요청합니다.'),
      !w.materials.length ? h('p', { class: 'alert info' }, '아직 자료가 없어 업무 이름만으로 일반 질문을 뽑습니다. ① 에서 자료를 넣으면 더 구체적인 질문이 나옵니다.') : null,
      h('details', null, h('summary', null, '프롬프트 보기 (' + prompt.length.toLocaleString('ko-KR') + '자)'), box),
      h('div', { class: 'btn-row', style: 'margin:10px 0' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: function () { copyText(prompt); } }, '프롬프트 복사'),
        AIP.sendButton('설정한 AI 서버로 보내기(선택)', function () { return prompt; }, function (t) { ans.value = t; parse(t); toast('AI 답을 받아 질문으로 읽었습니다.'); },
          { toast: toast, settingsHref: '#/settings', system: '너는 품질보증팀 업무 자료를 정리하는 보조야. JSON 하나만 답해.' })),
      fld('AI 답 붙여 넣기', ans),
      h('div', { class: 'btn-row', style: 'margin-top:8px' }, h('button', { type: 'button', class: 'btn', onclick: function () { parse(ans.value); } }, '질문으로 읽기')),
      res ? h('div', { id: 'aiQParsed' }, res.warnings.map(function (x) { return h('p', { class: 'alert info' }, x); }),
        res.questions.length ? [h('ul', { class: 'pick-list' }, res.questions.map(function (q, i) {
          var cb = h('input', { type: 'checkbox' }); cb.checked = ui.qPick[i] !== false;
          cb.addEventListener('change', function () { ui.qPick[i] = cb.checked; });
          return h('li', null, h('label', { class: 'opt' }, cb, h('span', null, h('span', { class: 'tag' }, C.catLabel(q.cat)), ' ', q.text, q.why ? h('small', { class: 'note' }, ' — ' + q.why) : null)));
        })), h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: function () {
          var add = C.addQuestions(w, res.questions.filter(function (q, i) { return ui.qPick[i] !== false; }), 'AI');
          ui.qParsed = null; ui.qAnswer = ''; save(); render(); toast('질문 ' + add.length + '개를 더했습니다(겹치는 질문은 뺌).');
        } }, '고른 질문 더하기'))] : null) : null);
  }
  function transcriptCard(w) {
    var who = h('input', { placeholder: '예: 검사원 ○○○, 10/27 통화', autocomplete: 'off' });
    var text = h('textarea', { rows: 6, placeholder: '담당자가 말로 한 설명을 받아 적은 글 · 녹취를 글로 바꾼 것을 그대로 붙여 넣어 주세요. 질문에 맞춰 나누지 않아도 됩니다.' });
    return h('section', { class: 'card', id: 'transcripts' }, h('h2', null, '말로 한 설명 붙여 넣기 (' + w.transcripts.length + '개)'),
      h('p', { class: 'note' }, '질문지 대신 담당자가 일하며 설명한 것을 통째로 넣는 칸입니다. T1 · T2 … 번호로 초안의 근거(담당자)가 됩니다.'),
      h('div', { class: 'form-grid' }, fld('누가 · 언제(선택)', who)), fld('설명', text),
      h('div', { class: 'btn-row', style: 'margin-top:8px' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: function () {
        var t = C.addTranscript(w, text.value, who.value, today()); if (!t) { toast('설명이 비어 있습니다.', true); return; }
        save(); render(); toast(t.id + ' 로 넣었습니다.');
      } }, '설명으로 넣기')),
      w.transcripts.length ? h('div', { class: 'mat-list', style: 'margin-top:12px' }, w.transcripts.map(function (t) {
        return h('details', { class: 'mat' }, h('summary', null, h('span', { class: 'ref-chip ref-T' }, t.id), ' ', h('strong', null, t.who || '담당자 설명'), h('span', { class: 'note' }, ' · ' + t.text.length.toLocaleString('ko-KR') + '자 · ' + t.at)),
          h('p', { class: 'pre' }, t.text),
          h('button', { type: 'button', class: 'btn btn-sm btn-danger', onclick: function () { if (confirm(t.id + ' 를 뺄까요?')) { w.transcripts = w.transcripts.filter(function (x) { return x !== t; }); save(); render(); } } }, '빼기'));
      })) : null);
  }
  /* 인쇄용 질문지 — 화면에는 숨기고 「질문지 인쇄」 때만 보입니다 */
  function questionSheet(w) {
    return h('section', { class: 'card print-sheet', id: 'qSheet', hidden: true }, h('h1', null, '담당자 질문지 — ' + w.name),
      h('p', { class: 'note' }, (w.owner ? '담당자: ' + w.owner + ' · ' : '') + '날짜: ' + today() + ' · 아는 만큼만 적어 주세요. 수치 · 예시 · 양식 위치가 있으면 함께 적어 주세요.'),
      C.CATS.map(function (c) {
        var qs = w.questions.filter(function (q) { return q.cat === c.id; }); if (!qs.length) return null;
        return [h('h2', null, c.label), h('ol', { class: 'sheet-list' }, qs.map(function (q) { var a = w.answers[q.id]; return h('li', null, h('p', null, h('strong', null, q.id + ' '), q.text), h('div', { class: 'answer-space' }, a ? a.text : '')); }))];
      }));
  }

  /* ── ③ AI 초안 작성 ─────────────────── */
  function pageDraft() {
    var head = pageHead('③', 'AI 초안 작성', '업무 자료와 담당자 답변을 묶어 AI 에 넣고, 돌아온 답으로 업무 흐름도와 단계별 업무 방법서 초안을 만듭니다. 단계마다 근거(문서 · 담당자 답변 · AI 추정)가 보이고, 담당자가 확인한 단계에 표시합니다.');
    var w = curWork();
    if (!w) return [head, noWork()];
    var out = [head, workBar(w), draftPromptCard(w)];
    var v = C.currentVersion(w);
    if (v) out.push(draftView(w, v), versionsCard(w));
    else out.push(h('section', { class: 'card empty' }, h('p', null, '아직 초안이 없습니다. 위에서 프롬프트를 복사해 AI 에 넣고, 답을 붙여 넣어 주세요.')));
    return out;
  }
  function draftPromptCard(w) {
    var p = C.progress(w), prompt = C.draftPrompt(w, workTask(w));
    var box = h('textarea', { rows: 10, readonly: true, class: 'mono', 'aria-label': '초안 프롬프트' }); box.value = prompt;
    var ans = h('textarea', { rows: 8, placeholder: 'AI 답(JSON)을 그대로 붙여 넣어 주세요. 앞뒤 설명 · ``` 묶음이 있어도 됩니다.', 'aria-label': 'AI 초안 답' }); ans.value = ui.draftAnswer || '';
    ans.addEventListener('input', function () { ui.draftAnswer = ans.value; });
    function parse(text) { ui.draftAnswer = text; ui.draftParsed = C.parseDraftAnswer(text, w); render(); goTo('#/draft', 'draftParsed'); }
    var isSample = window.QWSampleCapture && w.name === window.QWSampleCapture.NAME;
    var res = ui.draftParsed, note = h('input', { placeholder: '예: 10/28 담당자 답변 2차 반영', 'aria-label': '판 메모' });
    return h('section', { class: 'card no-print', id: 'draftPrompt' }, h('h2', null, 'AI 에 넣을 프롬프트 → 답 붙여 넣기'),
      h('ol', { class: 'steps' }, h('li', null, '프롬프트를 복사해 회사가 허용한 AI 에 붙여 넣습니다(회사 자료를 외부 AI 에 넣어도 되는지 먼저 확인해 주세요).'),
        h('li', null, 'AI 답(JSON)을 아래에 붙여 넣고 「읽어서 확인」을 누릅니다.'), h('li', null, '확인 결과를 보고 「새 판으로 저장」 — 이전 판은 기록에 남습니다.')),
      h('div', { class: 'prog-tags', style: 'margin-bottom:8px' }, h('span', { class: 'tag' + (p.materials ? ' ok' : '') }, '자료 ' + p.materials), h('span', { class: 'tag' + (p.images ? ' ok' : '') }, '사진 설명 ' + p.images),
        h('span', { class: 'tag' + (p.answered ? ' ok' : '') }, '답변 ' + p.answered + '/' + p.questions), h('span', { class: 'tag' + (p.transcripts ? ' ok' : '') }, '말로 한 설명 ' + p.transcripts)),
      !p.materials && !p.answered && !p.transcripts ? h('p', { class: 'alert warn' }, '자료도 답변도 없습니다. AI 가 근거 없이 지어내게 되니 ① 자료나 ② 답변을 먼저 넣어 주세요.') : null,
      p.questions - p.answered ? h('p', { class: 'alert info' }, '답 없는 질문 ' + (p.questions - p.answered) + '개는 「지어내지 말고 더 확인할 것에 남겨줘」로 프롬프트에 들어갑니다.') : null,
      h('details', null, h('summary', null, '프롬프트 보기 (' + prompt.length.toLocaleString('ko-KR') + '자)'), box),
      h('div', { class: 'btn-row', style: 'margin:10px 0' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: function () { copyText(prompt); } }, '프롬프트 복사'),
        AIP.sendButton('설정한 AI 서버로 보내기(선택)', function () { return prompt; }, function (t) { ans.value = t; parse(t); toast('AI 답을 받아 읽었습니다. 확인 후 저장해 주세요.'); },
          { toast: toast, settingsHref: '#/settings', system: '너는 제조업 품질보증팀 업무 자료를 정리하는 보조야. 주어진 자료와 답변 밖의 숫자 · 기준 · 문서 번호를 지어내지 마. JSON 하나만 답해.' }),
        isSample ? h('button', { type: 'button', class: 'btn', onclick: function () { ans.value = window.QWSampleCapture.SAMPLE_ANSWER; parse(ans.value); } }, '샘플 AI 답 넣기') : null),
      fld('AI 답 붙여 넣기', ans),
      h('div', { class: 'btn-row', style: 'margin-top:8px' }, h('button', { type: 'button', class: 'btn', onclick: function () { parse(ans.value); } }, '읽어서 확인')),
      res ? h('div', { id: 'draftParsed', class: 'parsed' },
        res.errors.map(function (e) { return h('p', { class: 'alert warn' }, e); }),
        res.warnings.map(function (e) { return h('p', { class: 'alert info' }, e); }),
        res.draft ? [table(['순서', '단계명', '누가', '근거', '근거 id', 'AI 추정 칸'], res.draft.steps.map(function (s) {
          return { cls: s.basis === 'guess' ? 'row-guess' : null, cells: [s.no, s.title, s.who, basisTag(s.basis), s.refs.map(function (r) { return refChip(w, r); }), s.guess.map(function (k) { return C.FIELD_LABEL[k]; }).join(', ')] };
        }), { num: [1] }),
          h('p', { class: 'note' }, '흐름도 ' + res.draft.flow.length + '칸' + (res.draft.flowFallback ? '(단계 순서대로)' : '(AI 의 판단 갈림 포함)') + ' · 용어 ' + res.draft.glossary.length + ' · 더 확인할 것 ' + res.draft.open_questions.length),
          h('div', { class: 'inline-form' }, fld('판 메모(선택)', note), h('button', { type: 'button', class: 'btn btn-primary', onclick: function () {
            var r = C.addVersion(w, res.draft, note.value.trim() || 'AI 초안', today());
            ui.draftParsed = null; ui.draftAnswer = ''; save(); render(); goTo('#/draft', 'draftCard');
            toast('v' + r.version.v + ' 로 저장했습니다.' + (r.keptConfirm ? ' 바뀌지 않은 단계 ' + r.keptConfirm + '개의 담당자 확인을 이어받았습니다.' : ''));
          } }, '새 판으로 저장 (v' + (w.versions.reduce(function (m, x) { return Math.max(m, x.v); }, 0) + 1) + ')'))] : null) : null);
  }
  function capFlowSvg(w, v) { return L.flowSvg(L.layoutFlow(v.draft.flow), { title: (v.draft.title || w.name) + ' — 업무 프로세스 (v' + v.v + ')' }); }
  function draftView(w, v) {
    var d = v.draft, c = C.basisCount(d), lay = L.layoutFlow(d.flow), vf = L.validateFlow(d.flow), probs = L.checkFlowLayout(lay);
    var stepsEl = d.steps.map(function (s, i) {
      var cb = h('input', { type: 'checkbox', 'aria-label': s.no + '단계 담당자 확인' }); cb.checked = s.confirmed;
      cb.addEventListener('change', function () { C.setConfirmed(w, i, cb.checked, today()); save(); render(); });
      var rows = C.STEP_FIELDS.slice(1).filter(function (k) { return s[k]; }).map(function (k) {
        return h('div', { class: 'mrow' }, h('dt', null, C.FIELD_LABEL[k]), h('dd', null, h('span', { class: 'pre' }, s[k]), s.guess.indexOf(k) >= 0 ? h('span', { class: 'tag basis-guess' }, 'AI 추정') : null));
      });
      var pics = s.refs.filter(function (r) { return /^P\d+$/.test(r); }).map(function (r) { return w.images.filter(function (p) { return p.id === r; })[0]; }).filter(Boolean);
      var edit = {}, form = h('div', { class: 'step-grid' }, C.STEP_FIELDS.map(function (k) {
        var e = k === 'how' || k === 'criteria' || k === 'exceptions' || k === 'cautions' ? h('textarea', { rows: 3 }) : h('input', {}); e.value = s[k]; edit[k] = e; return fld(C.FIELD_LABEL[k], e);
      }));
      return h('article', { class: 'mstep basis-b-' + s.basis + (s.confirmed ? ' confirmed' : '') },
        h('div', { class: 'mstep-head' }, h('h3', null, s.no + '. ' + s.title), s.who ? h('span', { class: 'tag' }, s.who) : null, basisTag(s.basis), s.edited ? h('span', { class: 'tag' }, '직접 고침') : null,
          h('label', { class: 'confirm' }, cb, h('span', null, s.confirmed ? '담당자 확인 · ' + s.confirmedAt : '담당자 확인'))),
        rows.length ? h('dl', { class: 'mfields' }, rows) : null,
        h('div', { class: 'mrefs' }, h('span', { class: 'note' }, '근거 '), s.refs.length ? s.refs.map(function (r) { return refChip(w, r); }) : h('span', { class: 'note' }, '없음 — 자료나 답변에 없는 내용입니다. 담당자에게 확인해 주세요.')),
        pics.length ? h('div', { class: 'mpics' }, pics.map(function (p) { return h('figure', null, thumb(p, 'pic'), h('figcaption', { class: 'note' }, p.id + ' ' + (p.caption || p.name))); })) : null,
        h('details', { class: 'no-print' }, h('summary', null, '이 단계 고치기'), form,
          h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: function () {
            var patch = {}; C.STEP_FIELDS.forEach(function (k) { patch[k] = edit[k].value; });
            var nv = C.editStep(w, i, patch, today()); if (!nv) { toast('바뀐 칸이 없습니다.'); return; }
            save(); render(); toast('v' + nv.v + ' 로 저장했습니다. 고친 칸의 「AI 추정」 표시는 지웠고, 이 단계는 다시 확인을 받아 주세요.');
          } }, '고쳐서 새 판으로')));
    });
    return h('section', { class: 'card draft-card', id: 'draftCard' },
      h('div', { class: 'card-head' }, h('h2', null, (d.title || w.name) + ' — 업무 방법서 초안 v' + v.v),
        h('div', { class: 'btn-row no-print' }, h('button', { type: 'button', class: 'btn', onclick: function () { printSection(document.getElementById('draftCard')); } }, '인쇄 / PDF'), h('a', { class: 'btn', href: '#/export' }, '④ 문서로 내보내기'))),
      h('p', { class: 'note' }, (v.at ? v.at + ' · ' : '') + (v.note ? v.note + ' · ' : '') + '단계 ' + d.steps.length + '개 · 담당자 확인 ' + d.steps.filter(function (s) { return s.confirmed; }).length + '개'),
      h('div', { class: 'legend basis-legend' }, basisTag('doc'), ' ' + c.doc, basisTag('person'), ' ' + c.person, basisTag('both'), ' ' + c.both, basisTag('guess'), ' ' + c.guess, c.guessFields ? h('span', null, ' · 칸 단위 AI 추정 ' + c.guessFields) : null),
      d.summary ? h('p', { class: 'summary' }, d.summary) : null,
      h('h3', null, '업무 프로세스 흐름도'),
      vf.errors.concat(vf.warnings).map(function (e) { return h('p', { class: 'alert info' }, '흐름 점검: ' + e); }),
      probs.map(function (e) { return h('p', { class: 'alert info' }, '그림 점검: ' + e); }),
      h('div', { class: 'flow-wrap', id: 'capFlow' }),
      h('p', { class: 'note' }, '칸 = 담당(처음 나온 순서) · 마름모 = 판단 · 초록 선 = 예 · 빨간 선 = 아니오' + (d.flowFallback ? ' · AI 답에 흐름(flow)이 없거나 고칠 곳이 있어 단계 순서대로 그렸습니다.' : '')),
      h('h3', null, '단계별 업무 방법'), h('div', { class: 'msteps' }, stepsEl),
      d.glossary.length ? [h('h3', null, '용어'), h('dl', { class: 'gloss' }, d.glossary.map(function (g) { return h('div', null, h('dt', null, g.term), h('dd', null, g.meaning)); }))] : null,
      d.open_questions.length ? [h('h3', null, '더 확인할 것 (' + d.open_questions.length + ')'), h('ul', { class: 'open-q' }, d.open_questions.map(function (q) { return h('li', null, q); })),
        h('div', { class: 'btn-row no-print' }, h('button', { type: 'button', class: 'btn', onclick: function () {
          var add = C.addQuestions(w, d.open_questions.map(function (q) { return { text: q, cat: C.catId(q), why: 'v' + v.v + ' 초안의 「더 확인할 것」' }; }), '초안 v' + v.v);
          save(); toast(add.length ? '담당자 질문 ' + add.length + '개로 보냈습니다. ② 에서 답을 받은 뒤 초안을 다시 만들어 주세요.' : '이미 질문에 있습니다.'); if (add.length) location.hash = '#/interview';
        } }, '② 담당자 질문으로 보내기'))] : null);
  }
  function versionsCard(w) {
    return h('section', { class: 'card no-print', id: 'versions' }, h('h2', null, '판 기록 (' + w.versions.length + ')'),
      h('p', { class: 'note' }, '초안을 다시 만들거나 단계를 고칠 때마다 새 판이 쌓입니다. 바뀌지 않은 단계(단계명 · 방법 · 기준 · 담당이 같음)는 담당자 확인을 이어받습니다.'),
      table(['판', '날짜', '메모', '단계', '담당자 확인', 'AI 추정 단계', ''], w.versions.slice().reverse().map(function (v) {
        var cnt = C.basisCount(v.draft);
        return { cls: v.v === w.current ? 'picked' : null, cells: ['v' + v.v, v.at, v.note, v.draft.steps.length, v.draft.steps.filter(function (s) { return s.confirmed; }).length, cnt.guess,
          v.v === w.current ? h('span', { class: 'tag ok' }, '보는 중') : h('button', { type: 'button', class: 'btn btn-sm', onclick: function () { w.current = v.v; save(); render(); goTo('#/draft', 'draftCard'); } }, '이 판 보기')] };
      }), { num: [0, 0, 0, 1, 1, 1] }));
  }
  function fillCapFlow() {
    var el = document.getElementById('capFlow'); if (!el) return;
    var w = curWork(), v = w && C.currentVersion(w); if (!v) return;
    el.innerHTML = capFlowSvg(w, v);
  }

  /* ── ④ 문서로 내보내기 ─────────────────────── */
  function imagesFor(w, ids) {
    var o = {};
    return Promise.all(ids.map(function (id) { var p = w.images.filter(function (x) { return x.id === id; })[0]; return p ? IMG.get(p.key).then(function (u) { if (u) o[id] = u; }) : null; })).then(function () { return o; });
  }
  function svgToDataUrl(svg) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { try { var c = document.createElement('canvas'); c.width = img.width * 2; c.height = img.height * 2; var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.scale(2, 2); g.drawImage(img, 0, 0); resolve(c.toDataURL('image/png')); } catch (e) { resolve(''); } };
      img.onerror = function () { resolve(''); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }
  function wordDoc(name, html) { download(name, new Blob(['﻿' + html], { type: 'application/msword' })); }
  function pageExport() {
    var head = pageHead('④', '문서로 내보내기', '확인한 초안을 신규 담당자 · 업무 대체자 · 관련 담당자에게 건넬 모양으로 받습니다.');
    var w = curWork();
    if (!w) return [head, noWork()];
    var v = C.currentVersion(w);
    if (!v) return [head, workBar(w), h('section', { class: 'card empty' }, h('p', null, '아직 초안이 없습니다.'), h('a', { class: 'btn btn-primary', href: '#/draft' }, '③ AI 초안 작성으로'))];
    var d = v.draft, base = safe(w.name) + '_v' + v.v, items = C.handoverChecklist(w, v), one = C.onePage(w, v), t = workTask(w);
    var unconfirmed = d.steps.filter(function (s) { return !s.confirmed; }).length;
    var buttons = h('section', { class: 'card no-print' }, h('h2', null, '받기 — v' + v.v + (v.at ? ' (' + v.at + ')' : '')),
      unconfirmed ? h('p', { class: 'alert info' }, '담당자 확인 전 단계가 ' + unconfirmed + '개 있습니다. 내보낸 자료에도 「확인 전」 · 「AI 추정」이 그대로 표시됩니다.') : h('p', { class: 'alert ok' }, '모든 단계를 담당자가 확인했습니다.'),
      h('div', { class: 'export-grid' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: function () {
          var pids = []; d.steps.forEach(function (s) { s.refs.forEach(function (r) { if (/^P/.test(r) && pids.indexOf(r) < 0) pids.push(r); }); });
          Promise.all([imagesFor(w, pids), svgToDataUrl(capFlowSvg(w, v))]).then(function (r) { wordDoc('업무방법서_' + base + '.doc', C.methodDocHtml(w, v, { images: r[0], flowImg: r[1] })); toast('Word 업무 방법서를 받았습니다. 그림이 안 보이면 흐름도 PNG 를 받아 붙여 주세요.'); });
        } }, 'Word 업무 방법서'),
        h('button', { type: 'button', class: 'btn', onclick: function () {
          XLSX.writeFile(xlsxBook([['단계표', C.stepsAoa(w, v)], ['근거 자료', C.refsAoa(w)], ['용어', [['용어', '뜻']].concat(d.glossary.map(function (g) { return [g.term, g.meaning]; }))],
            ['더 확인할 것', [['번호', '내용']].concat(d.open_questions.map(function (q, i) { return [i + 1, q]; }))], ['인수인계 체크리스트', C.checklistAoa(items)]]), '단계표_' + base + '.xlsx');
        } }, 'Excel 단계표'),
        h('button', { type: 'button', class: 'btn', onclick: function () { printSection(document.getElementById('handover')); } }, '인수인계 체크리스트 인쇄'),
        h('button', { type: 'button', class: 'btn', onclick: function () { XLSX.writeFile(xlsxBook([['인수인계 체크리스트', C.checklistAoa(items)]]), '인수인계체크리스트_' + base + '.xlsx'); } }, '체크리스트 Excel'),
        h('button', { type: 'button', class: 'btn', onclick: function () { printSection(document.getElementById('onePage')); } }, '1장 요약 인쇄 / PDF'),
        h('button', { type: 'button', class: 'btn', onclick: function () { wordDoc('1장요약_' + base + '.doc', onePageHtml(one)); } }, '1장 요약 Word'),
        h('button', { type: 'button', class: 'btn', onclick: function () { download('업무흐름도_' + base + '.svg', new Blob([capFlowSvg(w, v)], { type: 'image/svg+xml' })); } }, '흐름도 SVG'),
        h('button', { type: 'button', class: 'btn', onclick: function () { svgToPng(capFlowSvg(w, v), '업무흐름도_' + base + '.png'); } }, '흐름도 PNG')),

      h('div', { class: 'btn-row', style: 'margin-top:12px' }, h('button', { type: 'button', class: 'btn', id: 'toEduBtn', onclick: function () { sendToEdu(w, v); } }, '⑤ 신입 교육 자료로 보내기'),
        h('span', { class: 'note' }, t ? '업무 목록의 「' + t.name + '」과 이어져 있습니다. 이 초안의 흐름이 교육 한 장의 흐름도가 됩니다.' : '이 초안의 흐름이 교육 한 장의 흐름도가 됩니다(업무 목록에 「' + w.name + '」을 더해 이어 줍니다).')));
    var onePageEl = h('section', { class: 'card paper', id: 'onePage' }, h('div', { class: 'lesson-top' }, h('h1', null, one.title + ' — 1장 요약'), h('span', { class: 'note' }, one.meta)),
      one.summary ? h('p', null, one.summary) : null,
      h('div', { class: 'two-col' },
        h('div', null, h('h2', null, '업무 순서'), h('ol', { class: 'one-steps' }, one.steps.map(function (s) { return h('li', null, h('strong', null, s.title), s.who ? ' — ' + s.who : '', s.time ? h('span', { class: 'note' }, ' · ' + s.time) : null, s.basis === 'guess' ? h('span', { class: 'tag basis-guess' }, 'AI 추정') : null, s.confirmed ? null : h('span', { class: 'tag' }, '확인 전')); }))),
        h('div', null,
          one.criteria.length ? [h('h2', null, '판단 기준'), h('ul', null, one.criteria.map(function (x) { return h('li', null, x); }))] : null,
          one.cautions.length ? [h('h2', null, '주의 · 자주 하는 실수'), h('ul', null, one.cautions.map(function (x) { return h('li', null, x); }))] : null,
          one.handover.length ? [h('h2', null, '넘기는 곳'), h('ul', null, one.handover.map(function (x) { return h('li', null, x); }))] : null)),
      h('p', { class: 'note' }, '근거: 문서 ' + one.basis.doc + ' · 담당자 ' + one.basis.person + ' · 둘 다 ' + one.basis.both + ' · AI 추정 ' + one.basis.guess + (one.open ? ' · 더 확인할 것 ' + one.open + '개' : '')));
    var groups = []; items.forEach(function (i) { if (groups.indexOf(i.group) < 0) groups.push(i.group); });
    var handoverEl = h('section', { class: 'card paper', id: 'handover' }, h('div', { class: 'lesson-top' }, h('h1', null, '인수인계 체크리스트 — ' + w.name), h('span', { class: 'note' }, '판 v' + v.v + ' · 받는 사람: ________ · 넘기는 사람: ________')),
      groups.map(function (g) { return [h('h2', null, g), h('ul', { class: 'ho-list' }, items.filter(function (i) { return i.group === g; }).map(function (i) { return h('li', null, h('span', { class: 'box', 'aria-hidden': 'true' }, '☐'), ' ', i.text); }))]; }));
    return [head, workBar(w), buttons, onePageEl, handoverEl];
  }
  /* ④ → ⑤ — 확인한 초안의 흐름을 신입 교육 자료의 흐름도로 보냅니다. 업무 목록과 이어지지 않은 업무는 같은 이름의 업무를 찾거나 새로 더해 잇고, 커리큘럼에 넣습니다. */
  function sendToEdu(w, v) {
    var d = v.draft, t = workTask(w) || db.tasks.filter(function (x) { return x.name === w.name; })[0];
    if (!t) {
      var nums = db.tasks.map(function (x) { var m = /^T(\d+)$/.exec(x.id); return m ? Number(m[1]) : 0; });
      var n = (nums.length ? Math.max.apply(null, nums) : 0) + 1;
      t = { id: 'T' + ('00' + n).slice(-3), no: '', category: '', name: w.name, cycle: '', hours: '', role: w.owner || '', docsText: '', newbie: null, customer: null, difficulty: null, missing: false };
      db.tasks.push(t);
    }
    var f = db.flows[t.id];
    if (f && f.steps.length && f.source !== '업무 자료화 v' + v.v + ' 초안에서' && !confirm('「' + t.name + '」의 교육용 흐름도(' + f.steps.length + '단계)를 이 초안의 흐름(' + d.flow.length + '칸)으로 바꿀까요?')) return;
    w.taskId = t.id;
    db.flows[t.id] = { steps: d.flow.map(L.cleanStep), source: '업무 자료화 v' + v.v + ' 초안에서', updated: today() };
    if (db.core.indexOf(t.id) < 0) db.core.push(t.id);
    ui.eduTask = t.id; save();
    toast('「' + t.name + '」의 흐름을 신입 교육 자료로 보냈습니다. 교육 한 장 초안을 만들어 주세요.');
    location.hash = '#/edu';
  }
  function onePageHtml(one) {
    var e = C.esc;
    function list(t, a) { return a.length ? '<h2>' + t + '</h2><ul>' + a.map(function (x) { return '<li>' + e(x) + '</li>'; }).join('') + '</ul>' : ''; }
    return '<html><head><meta charset="utf-8"><style>body{font-family:"Malgun Gothic",sans-serif;font-size:10.5pt}h1{font-size:15pt}h2{font-size:11.5pt;color:#0f2544}.meta{color:#56616f}</style></head><body>' +
      '<h1>' + e(one.title) + ' — 1장 요약</h1><p class="meta">' + e(one.meta) + '</p>' + (one.summary ? '<p>' + e(one.summary) + '</p>' : '') +
      '<h2>업무 순서</h2><ol>' + one.steps.map(function (s) { return '<li><b>' + e(s.title) + '</b>' + (s.who ? ' — ' + e(s.who) : '') + (s.time ? ' · ' + e(s.time) : '') + (s.basis === 'guess' ? ' (AI 추정)' : '') + (s.confirmed ? '' : ' (확인 전)') + '</li>'; }).join('') + '</ol>' +
      list('판단 기준', one.criteria) + list('주의 · 자주 하는 실수', one.cautions) + list('넘기는 곳', one.handover) +
      '<p class="meta">근거: 문서 ' + one.basis.doc + ' · 담당자 ' + one.basis.person + ' · 둘 다 ' + one.basis.both + ' · AI 추정 ' + one.basis.guess + '</p></body></html>';
  }

  /* ── 설정 ───────────────────────────────── */
  function pageSettings() {
    var s = settings();
    function num(v, step) { return h('input', { type: 'number', min: 0, step: step || 1, inputmode: 'decimal', value: v }); }
    var inp = { irregularPerYear: num(s.irregularPerYear), workDays: num(s.workDays), dayHours: num(s.dayHours, 0.5), staleMonths: num(s.staleMonths), weeks: num(s.weeks), coreMin: num(s.coreMin), coreMax: num(s.coreMax), coreTarget: num(s.coreTarget) };
    function saveS() {
      var p = Object.assign({}, db.settings); Object.keys(inp).forEach(function (k) { p[k] = inp[k].value === '' ? null : Number(inp[k].value); });
      db.settings = L.cleanSettings(p); save(); toast('설정을 저장했습니다.'); render();
    }
    var backup = h('input', { type: 'file', accept: '.json' });
    backup.addEventListener('change', function () {
      var f = backup.files[0]; if (!f) return;
      f.text().then(function (t) {
        var o = JSON.parse(t); if (!o || typeof o !== 'object' || (!Array.isArray(o.tasks) && !Array.isArray(o.works))) throw new Error('이 도구의 백업 파일이 아닙니다.');
        var imgs = o.images && typeof o.images === 'object' ? o.images : {};
        db = CQ.migrate(o).db;
        Object.keys(imgs).forEach(function (k) { if (typeof imgs[k] === 'string' && /^data:image\//.test(imgs[k])) window.QWImages.put(k, imgs[k]); });
        save(); toast('백업을 불러왔습니다(업무 자료화 ' + db.works.length + ' · 업무 목록 ' + db.tasks.length + ' · 문서 ' + db.docs.length + ' · 사진 ' + Object.keys(imgs).length + ').'); render();
      }).catch(function (e) { toast('불러오지 못했습니다: ' + e.message, true); });
    });
    /* 2026-11-10 — 메뉴에서 뺀 1단계 화면(핵심 업무 점수 · 문서 맵)의 기준값은 화면에서 감추고 저장된 값은 그대로 둡니다 */
    return [pageHead('설정', '교육 기간 · AI 연결 · 백업'),
      h('section', { class: 'card' }, h('h2', null, '신입 교육 기준'),
        h('div', { class: 'form-grid' },
          fld('신입 교육 기간(주)', inp.weeks, '⑤ 신입 교육 자료 만들기의 커리큘럼 주차 수')),
        h('div', { class: 'btn-row', style: 'margin-top:12px' },
          h('button', { type: 'button', class: 'btn btn-primary', onclick: saveS }, '저장'),
          h('button', { type: 'button', class: 'btn', onclick: function () { db.settings = L.cleanSettings({}); save(); render(); } }, '기본값으로'))),
      AIP.settingsCard({ toast: toast, onChange: render }),
      h('section', { class: 'card' }, h('h2', null, '백업'),
        h('p', { class: 'note' }, '업무 자료화(자료 · 답변 · 초안 · 사진)와 업무 목록 · 문서 · 흐름도 · 교육 자료는 이 브라우저에만 있습니다. 다른 PC 로 옮기거나 브라우저 정리 전에 JSON 으로 받아 두세요(사진도 함께 들어갑니다). 팀원에게 넘길 때도 이 파일을 주고받으면 됩니다.'),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn', onclick: function () {
            var keys = []; db.works.forEach(function (w) { w.images.forEach(function (p) { keys.push(p.key); }); });
            var imgs = {};
            Promise.all(keys.map(function (k) { return window.QWImages.get(k).then(function (u) { if (u) imgs[k] = u; }); })).then(function () {
              download('품질업무자료도우미_백업_' + today() + '.json', new Blob([JSON.stringify(Object.assign({}, db, { images: imgs }))], { type: 'application/json' }));
            });
          } }, 'JSON 백업 내려받기'),
          h('label', { class: 'btn' }, backup, 'JSON 백업 불러오기')))];
  }

  /* ── 라우터 ─────────────────────────────── */
  var PAGES = [
    { id: 'work', no: '①', t: '자료 등록하기', s: '자료 · 캡처 · 사진', fn: pageWork },
    { id: 'interview', no: '②', t: '담당자에게 질문하기', s: '질문 · 답 · 말로 한 설명', fn: pageInterview },
    { id: 'draft', no: '③', t: 'AI 초안 작성', s: 'AI 초안 · 근거 · 담당자 확인', fn: pageDraft },
    { id: 'export', no: '④', t: '문서로 내보내기', s: '업무 방법서 · 단계표 · 체크리스트', fn: pageExport },
    { id: 'edu', no: '⑤', t: '신입 교육 자료 만들기', s: '교육 한 장 · 커리큘럼', fn: pageEdu },
    { id: 'settings', no: '설', t: '설정', s: '교육 기간 · AI · 백업', fn: pageSettings, group: '' },
    /* 2026-11-10 메뉴에서 뺀 1단계 화면 — 메뉴에는 없고 주소로만 열립니다(저장된 업무 목록 · 문서 · 흐름도는 그대로) */
    { id: 'import', no: '·', t: '업무 목록 가져오기', s: '', fn: pageImport, hidden: true },
    { id: 'core', no: '·', t: '핵심 업무 선정', s: '', fn: pageCore, hidden: true },
    { id: 'docs', no: '·', t: '문서 맵', s: '', fn: pageDocs, hidden: true },
    { id: 'flow', no: '·', t: '업무 흐름도', s: '', fn: pageFlow, hidden: true }
  ];
  function route() { var id = (location.hash || '').replace(/^#\//, '').split('?')[0]; return PAGES.filter(function (p) { return p.id === id; })[0] || PAGES[0]; }
  function render() {
    var p = route();
    var nav = document.getElementById('nav'); nav.innerHTML = '';
    PAGES.forEach(function (x) {
      if (x.hidden) return;
      if (x.group != null) nav.appendChild(h('div', { class: 'nav-group' + (x.group ? '' : ' empty') }, x.group));
      nav.appendChild(h('a', { href: '#/' + x.id, 'aria-current': x === p ? 'page' : null }, h('span', { class: 'no' }, x.no), h('span', { class: 't' }, x.t), h('span', { class: 's' }, x.s)));
    });
    var w = curWork(), flows = Object.keys(db.flows).filter(function (k) { return db.flows[k].steps.length; }).length;
    var chip = document.getElementById('dataChip');
    chip.textContent = w ? '자료화: ' + w.name + (db.works.length > 1 ? ' 외 ' + (db.works.length - 1) : '') : '자료화할 업무 없음';
    chip.setAttribute('href', '#/work');
    if (db.tasks.length) add(chip, h('span', { class: 'dim' }, '업무 목록 ' + db.tasks.length + (db.taskSource ? ' · 내 파일 ' + db.taskSource.name : db.sample ? '(샘플)' : '') + (flows ? ' · 흐름도 ' + flows : '')));
    var b = document.getElementById('sampleBanner'), SCn = window.QWSampleCapture && window.QWSampleCapture.NAME;
    var sw = !db.sample && db.sampleWorks && db.works.some(function (x) { return x.name === SCn; });
    b.hidden = !db.sample && !sw;
    b.textContent = db.sample ? '지금 보시는 것은 가상 샘플입니다 — 「수입검사 부적합품 처리」의 절차서 · 체크리스트 · 시스템 입력 항목 · 화면 그림 · 담당자 답변 · AI 답은 모두 지어낸 예시이고, 업무 목록 52개 · 문서 24개 · 흐름도 3개도 가상입니다. 내 업무 목록은 ① 화면의 「업무 목록 파일로 바꾸기」로 넣어 주세요.'
      : '업무 목록은 내 것으로 바꿨습니다. 업무 자료화의 「' + SCn + '」는 아직 가상 샘플(지어낸 자료 · 답변 · 초안)입니다 — 필요 없으면 ① 화면에서 그 업무를 지워 주세요.';
    main.innerHTML = '';
    add(main, p.fn());
    if (p.id === 'edu') fillPaperFlow(taskById(ui.eduTask));
    if (p.id === 'draft') fillCapFlow();
    document.title = p.t + ' — 품질 업무 자료 도우미';
    save();
  }
  window.addEventListener('hashchange', function () { render(); main.focus(); window.scrollTo(0, 0); });
  render();
})();
