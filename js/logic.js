/* 품질 업무 프로세스·신입 교육 — 순수 로직 (화면·저장소와 무관)
   브라우저에서는 window.QWLogic, node 에서는 require('./logic.js') 로 씁니다.
   기준 문서: docs/01_프로젝트_기획서.md (3장 데이터, 5장 기능, 8장 1단계)

   흐름: 업무 목록 엑셀 → detectColumns(머리행·열 찾기) → parseTaskSheet(행 → 업무) → mergeTasks(다시 가져와도 연결 유지)
        → scoreTasks(빈도×소요 시간·신입 관련성·고객 영향) → recommendCore(핵심 업무 10~15개)
        → 문서 목록(parseDocSheet) · matchDocRefs(업무 ↔ 문서 연결) · checklist(누락·고아·오래된 문서)
        → 업무 흐름도: 단계 표(steps) → validateFlow · layoutFlow(직책별 칸) → flowSvg · checkFlowLayout(글자 겹침 점검)
        → 신입 교육: curriculum(주차 배치) · draftLesson(교육 한 장 초안, 사실만) · buildQuiz
        → AI(반자동): flowPrompt / parseStepsAnswer · lessonPrompt / parseLessonAnswer */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QWLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  /* 판(版) — index.html 의 ?v= · app.js 의 APP_VERSION 과 같아야 합니다(scripts/bump-version.mjs 로 함께 올림).
     브라우저가 옛 logic.js 와 새 app.js 를 섞어 쓰면 app.js 가 이 값을 보고 계산을 멈춥니다. */
  var VERSION = '2026-11-11.6';

  var SCHEMA_VERSION = 1;

  /* ── 1. 기본 도구 ─────────────────────────────────────────── */
  function str(v) { return v == null ? '' : String(v).trim(); }
  function norm(s) { return String(s == null ? '' : s).replace(/[\s()（）\[\]·.,:_\/\-~「」『』"'*]/g, '').toLowerCase(); }
  function round(n, d) { var p = Math.pow(10, d == null ? 2 : d); return Math.round(n * p) / p; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtNum(n) { return n == null || !isFinite(n) ? '-' : Number(round(n, 1)).toLocaleString('ko-KR'); }
  function colName(i) {
    var s = ''; i = Number(i);
    do { s = String.fromCharCode(65 + (i % 26)) + s; i = Math.floor(i / 26) - 1; } while (i >= 0);
    return s;
  }
  function toNum(v) {
    if (v == null) return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v).replace(/,/g, '').trim();
    if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
    return Number(s);
  }
  function isoFromUTC(ms) { var d = new Date(ms); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function isoOk(y, m, d) {
    if (!(y >= 1980 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return '';
    var t = Date.UTC(y, m - 1, d), x = new Date(t);
    return x.getUTCMonth() === m - 1 ? isoFromUTC(t) : '';
  }
  /* 엑셀 날짜(일련번호 · Date · 글자) → 'YYYY-MM-DD'. 「2024.3」처럼 일이 없으면 1일. 못 읽으면 '' */
  function toISO(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date || Object.prototype.toString.call(v) === '[object Date]') {
      if (isNaN(v.getTime())) return '';
      var d = new Date(v.getTime() + 12 * 3600 * 1000);
      return isoOk(d.getFullYear(), d.getMonth() + 1, d.getDate());
    }
    if (typeof v === 'number') {
      if (v < 20000 || v > 80000) return '';
      return isoFromUTC(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000);
    }
    var s = String(v).trim();
    var m = /^(\d{4})[-./년\s]+(\d{1,2})[-./월\s]+(\d{1,2})/.exec(s);
    if (m) return isoOk(+m[1], +m[2], +m[3]);
    m = /^(\d{4})[-./년\s]+(\d{1,2})월?\.?$/.exec(s);
    if (m) return isoOk(+m[1], +m[2], 1);
    m = /^(\d{2})[-./](\d{1,2})[-./](\d{1,2})$/.exec(s);
    if (m) return isoOk(2000 + +m[1], +m[2], +m[3]);
    if (/^\d{5}(\.\d+)?$/.test(s)) return toISO(Number(s));
    return '';
  }
  function monthsBetween(a, b) {
    var pa = a.split('-'), pb = b.split('-');
    return (+pb[0] - +pa[0]) * 12 + (+pb[1] - +pa[1]) + ((+pb[2] - +pa[2]) < 0 ? -1 : 0);
  }
  function uniq(a) { var o = []; a.forEach(function (x) { if (o.indexOf(x) < 0) o.push(x); }); return o; }
  /* 정해진 순서로 섞기(같은 글이면 늘 같은 순서) — 퀴즈 보기의 정답 위치가 늘 첫째가 되지 않게 */
  function hash(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function seededShuffle(arr, seed) {
    var a = arr.slice(), x = hash(seed) || 1;
    for (var i = a.length - 1; i > 0; i--) { x = (Math.imul(x, 1103515245) + 12345) >>> 0; var j = x % (i + 1); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  /* ── 2. 설정 ──────────────────────────────────────────────── */
  var DEFAULT_SETTINGS = {
    wFreq: 40,            // 빈도 × 소요 시간(연간 시간) 가중치
    wNewbie: 30,          // 신입 관련성
    wCustomer: 30,        // 고객 영향
    coreMin: 10, coreMax: 15, coreTarget: 12,
    irregularPerYear: 12, // 「수시·발생 시」 업무를 1년에 몇 번으로 칠지
    workDays: 250,        // 「매일」 = 1년 근무일
    dayHours: 8,          // 「1일」 = 몇 시간
    staleMonths: 36,      // 개정한 지 이만큼 지나면 「오래된 버전」
    weeks: 4              // 신입 교육 기간(주)
  };
  function cleanSettings(p) {
    var s = {}, d = DEFAULT_SETTINGS;
    p = p && typeof p === 'object' ? p : {};
    function num(k, min, max, int) {
      var v = Number(p[k]);
      s[k] = (p[k] === '' || p[k] == null || !isFinite(v) || v < min || v > max) ? d[k] : (int ? Math.round(v) : v);
    }
    num('wFreq', 0, 100); num('wNewbie', 0, 100); num('wCustomer', 0, 100);
    if (s.wFreq + s.wNewbie + s.wCustomer === 0) { s.wFreq = d.wFreq; s.wNewbie = d.wNewbie; s.wCustomer = d.wCustomer; }
    num('coreMin', 1, 60, true); num('coreMax', 1, 60, true); num('coreTarget', 1, 60, true);
    if (s.coreMin > s.coreMax) { var t = s.coreMin; s.coreMin = s.coreMax; s.coreMax = t; }
    s.coreTarget = Math.min(s.coreMax, Math.max(s.coreMin, s.coreTarget));
    num('irregularPerYear', 0, 1000); num('workDays', 1, 366, true); num('dayHours', 1, 24);
    num('staleMonths', 1, 240, true); num('weeks', 1, 26, true);
    return s;
  }

  /* ── 3. 주기 · 소요 시간 읽기 ─────────────────────────────── */
  /* 「매일」「주 1회」「월 2~3회」「분기 1회」「반기」「연 1회」「수시(발생 시)」「2회/월」 → 1년에 몇 번 */
  function parseCycle(text, settings) {
    var S = cleanSettings(settings);
    var t = str(text).replace(/\s+/g, '').replace(/^주기[:：]?/, '').toLowerCase();
    if (!t) return { perYear: null, unit: '', irregular: false, ok: false };
    var cm = /(\d+(?:\.\d+)?)(?:~(\d+(?:\.\d+)?))?(?:회|번|times?)/.exec(t);
    var count = cm ? (cm[2] ? (Number(cm[1]) + Number(cm[2])) / 2 : Number(cm[1])) : 1;
    var unit = '', per = null;
    if (/격주/.test(t)) { unit = '격주'; per = 26; }
    else if (/분기|quarter/.test(t)) { unit = '분기'; per = 4; }
    else if (/반기|반년/.test(t)) { unit = '반기'; per = 2; }
    else if (/주|week/.test(t)) { unit = '주'; per = 52; }
    else if (/월|달|month/.test(t)) { unit = '월'; per = 12; }
    else if (/연|년|year|annual/.test(t)) { unit = '연'; per = 1; }
    else if (/매일|일|상시|daily|day/.test(t)) { unit = '일'; per = S.workDays; }
    if (/수시|발생|필요시|요청시|건별|의뢰시|입고시|출하시|부정기/.test(t) && !cm) {
      return { perYear: S.irregularPerYear, unit: '수시', irregular: true, ok: true };
    }
    if (per == null) {
      if (/수시|발생|필요시|요청시|건별|의뢰시|부정기/.test(t)) return { perYear: S.irregularPerYear * count, unit: '수시', irregular: true, ok: true };
      return { perYear: null, unit: '', irregular: false, ok: false };
    }
    return { perYear: per * count, unit: unit, irregular: false, ok: true };
  }
  /* 「2시간」「30분」「1시간 30분」「1~2시간」「0.5일」「4H」「2」(숫자만 = 시간) → 시간 */
  function parseHours(text, settings) {
    var S = cleanSettings(settings);
    if (typeof text === 'number') return isFinite(text) && text >= 0 ? text : null;
    var t = str(text).replace(/\s+/g, '').toLowerCase();
    if (!t) return null;
    if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
    var total = 0, found = false, m;
    var re = /(\d+(?:\.\d+)?)(?:~(\d+(?:\.\d+)?))?(시간|hrs|hr|hours?|h|분|min|m|일|days?|d)/g;
    while ((m = re.exec(t))) {
      var v = m[2] ? (Number(m[1]) + Number(m[2])) / 2 : Number(m[1]);
      var u = m[3];
      if (/^(분|min|m)$/.test(u)) v = v / 60;
      else if (/^(일|days?|d)$/.test(u)) v = v * S.dayHours;
      total += v; found = true;
    }
    return found ? round(total, 3) : null;
  }

  /* ── 4. 엑셀 열 찾기 (업무 목록 · 문서 목록 공용) ─────────── */
  var TASK_FIELDS = [
    { id: 'no', label: '번호', aliases: ['no', '번호', '순번', '연번', 'num'] },
    { id: 'category', label: '구분(업무 분야)', aliases: ['구분', '분류', '업무구분', '대분류', '업무분야', '분야', '카테고리', '프로세스'] },
    { id: 'name', label: '업무명', req: true, aliases: ['업무명', '업무', '업무내용', '업무항목', '세부업무', '단위업무', '업무명칭', 'task'] },
    { id: 'cycle', label: '주기', aliases: ['주기', '업무주기', '빈도', '수행주기', '발생주기', '주기빈도'] },
    { id: 'hours', label: '소요 시간', aliases: ['소요시간', '소요', '시간', '작업시간', '투입시간', '공수', '1회소요시간', '소요시간h'] },
    { id: 'role', label: '직책', aliases: ['직책', '담당', '담당자', '담당직책', '수행자', '직급', '담당직급', '수행직책', '책임자'] },
    { id: 'docs', label: '관련 문서', aliases: ['관련문서', '문서', '근거문서', '근거', '참조문서', '관련양식', '양식', '관련규정'] },
    { id: 'newbie', label: '신입 관련성(1~5)', aliases: ['신입관련성', '신입', '신입중요도'] },
    { id: 'customer', label: '고객 영향(1~5)', aliases: ['고객영향', '고객', '고객영향도'] },
    { id: 'difficulty', label: '난이도(1~3)', aliases: ['난이도', '난도'] }
  ];
  var DOC_FIELDS = [
    { id: 'code', label: '문서번호', aliases: ['문서번호', '문서no', '문서코드', '번호', 'no', '관리번호', '코드'] },
    { id: 'name', label: '문서명', req: true, aliases: ['문서명', '문서', '문서이름', '제목', '명칭', '문서제목'] },
    { id: 'kind', label: '종류(정형·비정형·형식)', aliases: ['종류', '구분', '문서구분', '유형', '분류', '문서종류'] },
    { id: 'version', label: '버전', aliases: ['버전', '개정', '개정번호', 'rev', '개정차수', '판', '버젼', 'version'] },
    { id: 'revised', label: '개정일', aliases: ['개정일', '최종개정일', '개정일자', '제정일', '작성일', '수정일', '최종수정일'] },
    { id: 'owner', label: '담당', aliases: ['담당', '담당자', '관리부서', '작성자', '관리자', '주관', '주관부서', '소유자'] },
    { id: 'note', label: '비고', aliases: ['비고', '메모', '특이사항'] }
  ];
  /* 머리 글자 하나 → 필드 id. 정확히 같은 것 먼저, 그다음 「포함」(긴 별칭부터) */
  function matchField(text, fields) {
    var n = norm(text).replace(/\d+~\d+$/, '');
    if (!n) return null;
    var i, j;
    for (i = 0; i < fields.length; i++) if (fields[i].aliases.indexOf(n) >= 0) return fields[i].id;
    var best = null, bestLen = 0;
    for (i = 0; i < fields.length; i++) for (j = 0; j < fields[i].aliases.length; j++) {
      var a = fields[i].aliases[j];
      if (a.length >= 2 && a.length > bestLen && n.indexOf(a) >= 0) { best = fields[i].id; bestLen = a.length; }
    }
    return best;
  }
  function rowMap(row, fields) {
    var map = {}, used = {};
    // 정확히 같은 것 먼저 자리 잡기
    (row || []).forEach(function (c, i) {
      var n = norm(c);
      fields.forEach(function (f) { if (map[f.id] == null && !used[i] && f.aliases.indexOf(n) >= 0) { map[f.id] = i; used[i] = 1; } });
    });
    (row || []).forEach(function (c, i) {
      if (used[i]) return;
      var id = matchField(c, fields);
      if (id && map[id] == null) { map[id] = i; used[i] = 1; }
    });
    return map;
  }
  /* aoa(행 배열) → { headerRow, map, missing, headers, warnings }. overrides = { 필드id: 열번호(-1 은 없음) } */
  /* 머리 글자가 별칭과 「정확히」 같은 칸이 있는가 — 데이터 줄을 머리행으로 오인하지 않으려고 씁니다 */
  function exactHit(row, fields, id) {
    return (row || []).some(function (c) { var n = norm(c); return n && fields.some(function (f) { return (!id || f.id === id) && f.aliases.indexOf(n) >= 0; }); });
  }
  function detectColumns(aoa, fields, overrides) {
    var best = -1, bestMap = {}, bestScore = 0, guess = -1;
    var nameId = 'name';
    for (var r = 0; r < Math.min(aoa.length, 15); r++) {
      var row = aoa[r] || [];
      var m = rowMap(row, fields), score = Object.keys(m).length;
      // 이름 열 하나뿐인 표(「업무명」 한 칸)도 머리행으로 — 단 머리 글자가 별칭과 정확히 같을 때만
      if (m[nameId] != null && (score >= 2 || exactHit(row, fields, nameId)) && score > bestScore) { best = r; bestMap = m; bestScore = score; }
      if (guess < 0 && exactHit(row, fields)) guess = r;
    }
    if (best >= 0) guess = best;
    var map = {};
    Object.keys(bestMap).forEach(function (k) { map[k] = bestMap[k]; });
    if (overrides) Object.keys(overrides).forEach(function (k) {
      var v = Number(overrides[k]);
      if (v < 0 || !isFinite(v)) delete map[k]; else map[k] = v;
    });
    var headerRow = best;
    if (headerRow < 0 && guess >= 0 && overrides && overrides[nameId] != null && overrides[nameId] >= 0) headerRow = guess;
    var missing = fields.filter(function (f) { return f.req && map[f.id] == null; }).map(function (f) { return f.id; });
    var warnings = [];
    if (headerRow < 0 && guess >= 0) warnings.push((guess + 1) + '행이 제목 줄로 보이는데 「업무명」에 해당하는 열을 찾지 못했습니다. 아래 「열 연결」에서 업무명 열을 골라 주세요.');
    else if (headerRow < 0) warnings.push('머리행(「업무명」 같은 제목 줄)을 찾지 못했습니다. 아래에서 열을 직접 골라 주세요.');
    return { headerRow: headerRow, guessRow: guess, map: map, missing: missing, headers: headerRow >= 0 ? (aoa[headerRow] || []).map(str) : [], warnings: warnings };
  }
  function cell(row, map, id) { var c = map[id]; return c == null ? null : row[c]; }
  function scoreVal(v, max) { var n = toNum(v); return n == null ? null : Math.min(max, Math.max(1, Math.round(n))); }

  /* 업무 목록 시트 → 업무 */
  /* 제목 줄 없이 업무 이름만 죽 적은 파일 — 글자가 든 첫 열을 업무명으로 읽습니다(숫자뿐인 번호 열은 건너뜀).
     첫 값이 「업무명」「업무 목록」 같은 제목이면 그 줄은 빼고 읽습니다. col 을 주면 그 열. */
  function isText(v) { return !(v instanceof Date) && typeof v !== 'number' && str(v) !== '' && !/^[\d\s.,\-]+$/.test(str(v)); }
  function simpleColumn(aoa, col) {
    var width = 0; aoa.forEach(function (r) { width = Math.max(width, (r || []).length); });
    if (col == null) for (var c = 0; c < width; c++) { if (aoa.some(function (r) { return isText((r || [])[c]); })) { col = c; break; } }
    if (col == null || col < 0) return null;
    var start = 0;
    while (start < aoa.length && !str((aoa[start] || [])[col])) start++;
    var first = norm((aoa[start] || [])[col]);
    var head = first && (TASK_FIELDS[2].aliases.indexOf(first) >= 0 || /목록$/.test(first) || exactHit(aoa[start], TASK_FIELDS));
    return { col: col, start: head ? start + 1 : start, headRow: head ? start : -1 };
  }
  function parseTaskSheet(aoa, opts) {
    opts = opts || {};
    aoa = aoa || [];
    var det = detectColumns(aoa, TASK_FIELDS, opts.overrides);
    var tasks = [], warnings = [], skipped = 0, seen = {}, lastCat = '';
    var ov = opts.overrides || {}, from = det.headerRow + 1;
    if (det.headerRow < 0 && det.guessRow < 0) {
      // 제목 줄이 없는 목록 — 한 열짜리 목록으로 읽기
      var sc = simpleColumn(aoa, ov.name != null && ov.name >= 0 ? Number(ov.name) : null);
      if (!sc) return { det: det, tasks: tasks, warnings: warnings, skipped: 0 };
      det.simple = true; det.map = { name: sc.col }; det.missing = []; det.headerRow = sc.headRow; from = sc.start;
      det.warnings = [colName(sc.col) + '열의 글자를 업무명으로 한 줄에 하나씩 읽었습니다(제목 줄이 없는 목록). 주기 · 소요 시간 · 직책은 비워 둡니다. 다른 열이면 아래 「열 연결」에서 업무명 열을 골라 주세요.'];
    }
    if ((det.headerRow < 0 && !det.simple) || det.missing.indexOf('name') >= 0) return { det: det, tasks: tasks, warnings: warnings, skipped: 0 };
    for (var r = from; r < aoa.length; r++) {
      var row = aoa[r] || [];
      var name = str(cell(row, det.map, 'name'));
      var cat = str(cell(row, det.map, 'category'));
      if (cat) lastCat = cat; // 병합 셀처럼 구분이 첫 줄에만 있는 경우
      if (!name) { if (row.some(function (c) { return str(c); })) skipped++; continue; }
      if (/^(합계|소계|총계|계)$/.test(name.replace(/\s/g, ''))) { skipped++; continue; }
      var key = norm(name);
      if (seen[key]) { warnings.push((r + 1) + '행 「' + name + '」 — 같은 업무명이 ' + seen[key] + '행에도 있어 건너뜀'); skipped++; continue; }
      seen[key] = r + 1;
      var cycleText = str(cell(row, det.map, 'cycle')), hoursRaw = cell(row, det.map, 'hours');
      var hoursText = typeof hoursRaw === 'number' ? String(hoursRaw) : str(hoursRaw);
      var t = {
        no: str(cell(row, det.map, 'no')), category: cat || lastCat, name: name,
        cycle: cycleText, hours: hoursText, role: str(cell(row, det.map, 'role')), docsText: str(cell(row, det.map, 'docs')),
        newbie: scoreVal(cell(row, det.map, 'newbie'), 5), customer: scoreVal(cell(row, det.map, 'customer'), 5), difficulty: scoreVal(cell(row, det.map, 'difficulty'), 3)
      };
      if (cycleText && !parseCycle(cycleText).ok) warnings.push((r + 1) + '행 「' + name + '」 — 주기 「' + cycleText + '」를 읽지 못함(점수에서 빈도 0)');
      if (hoursText && parseHours(hoursText) == null) warnings.push((r + 1) + '행 「' + name + '」 — 소요 시간 「' + hoursText + '」를 읽지 못함(점수에서 시간 0)');
      tasks.push(t);
    }
    return { det: det, tasks: tasks, warnings: warnings, skipped: skipped };
  }
  function pickSheet(sheets, fields) {
    var best = null, bestScore = -1;
    (sheets || []).forEach(function (s) {
      var d = detectColumns(s.aoa || [], fields || TASK_FIELDS);
      var sc = d.headerRow < 0 ? 0 : Object.keys(d.map).length * 100 + Math.min(99, (s.aoa || []).length - d.headerRow);
      if (sc > bestScore) { best = s; bestScore = sc; }
    });
    return best;
  }

  /* 다시 가져와도 핵심 업무 선택·흐름도·교육 자료가 끊기지 않게 — 업무명이 같으면 같은 id 를 이어 씁니다.
     새 목록에서 빠진 업무는 지우되, 흐름도나 교육 한 장이 있으면 「최근 목록에 없음」으로 남깁니다. */
  function nextId(prefix, list) {
    var max = 0;
    list.forEach(function (x) { var m = new RegExp('^' + prefix + '(\\d+)$').exec(x.id || ''); if (m) max = Math.max(max, +m[1]); });
    return prefix + pad3(max + 1);
  }
  function pad3(n) { return n < 10 ? '00' + n : n < 100 ? '0' + n : String(n); }
  function mergeTasks(db, incoming) {
    var old = db.tasks || [], byKey = {}, out = [], stat = { added: 0, kept: 0, removed: 0, keptForFlow: 0 };
    old.forEach(function (t) { byKey[norm(t.name)] = t; });
    var seen = {};
    incoming.forEach(function (n) {
      var k = norm(n.name), o = byKey[k];
      var t;
      if (o) {
        t = Object.assign({}, o, { no: n.no, category: n.category, name: n.name, cycle: n.cycle, hours: n.hours, role: n.role, docsText: n.docsText, missing: false });
        ['newbie', 'customer', 'difficulty'].forEach(function (f) { if (n[f] != null) t[f] = n[f]; });
        stat.kept++;
      } else {
        t = Object.assign({ newbie: null, customer: null, difficulty: null }, n, { id: nextId('T', old.concat(out)), missing: false });
        stat.added++;
      }
      seen[k] = 1; out.push(t);
    });
    old.forEach(function (o) {
      if (seen[norm(o.name)]) return;
      if ((db.flows && db.flows[o.id] && db.flows[o.id].steps.length) || (db.lessons && db.lessons[o.id])) { out.push(Object.assign({}, o, { missing: true })); stat.keptForFlow++; }
      else stat.removed++;
    });
    var ids = out.map(function (t) { return t.id; });
    var core = (db.core || []).filter(function (id) { return ids.indexOf(id) >= 0; });
    var links = {};
    Object.keys(db.links || {}).forEach(function (id) { if (ids.indexOf(id) >= 0) links[id] = db.links[id].slice(); });
    return { tasks: out, core: core, links: links, stat: stat };
  }

  /* 업무 목록 바꾸기(합치지 않음) — 새 목록만 남기고, 옛 업무에 걸린 1단계 흐름도 · 교육 한 장 · 핵심 업무 선택 · 문서 연결은 지웁니다.
     업무 자료화(works)는 지우지 않습니다 — 옛 업무와 이어져 있었으면 새 목록에 같은 이름이 있을 때만 다시 잇고, 없으면 잇는 것만 풉니다(업무 이름 · 자료 · 답변 · 초안은 그대로).
     같은 업무명(띄어쓰기 · 문장부호만 다른 것 포함)은 처음 것만, 순서는 파일 그대로. opts.dropDocs: 문서 목록도 비움(가상 샘플 문서일 때). */
  function replaceTasks(db, incoming, opts) {
    opts = opts || {};
    var tasks = [], seen = {}, dup = 0;
    (incoming || []).forEach(function (n) {
      var k = norm(n && n.name);
      if (!k) return;
      if (seen[k]) { dup++; return; }
      seen[k] = 1;
      tasks.push(Object.assign({ no: '', category: '', cycle: '', hours: '', role: '', docsText: '', newbie: null, customer: null, difficulty: null }, n, { name: str(n.name), id: 'T' + pad3(tasks.length + 1), missing: false }));
    });
    var old = db.tasks || [], oldById = {}, newByKey = {};
    old.forEach(function (t) { oldById[t.id] = t; });
    tasks.forEach(function (t) { newByKey[norm(t.name)] = t.id; });
    var flows = db.flows || {}, links = db.links || {};
    var stat = {
      removed: old.length, added: tasks.length, dup: dup,
      flows: Object.keys(flows).filter(function (k) { return oldById[k] && flows[k] && (flows[k].steps || []).length; }).length,
      lessons: Object.keys(db.lessons || {}).filter(function (k) { return oldById[k]; }).length,
      core: (db.core || []).filter(function (id) { return oldById[id]; }).length,
      links: Object.keys(links).reduce(function (a, k) { return a + (oldById[k] ? (links[k] || []).length : 0); }, 0),
      docs: opts.dropDocs ? (db.docs || []).length : 0,
      relinked: 0, unlinked: 0
    };
    var works = (db.works || []).map(function (w) {
      if (!w.taskId) return w;
      var o = oldById[w.taskId], nid = o ? newByKey[norm(o.name)] : null;
      if (!nid && !o) nid = newByKey[norm(w.name)] || null;
      if (nid) stat.relinked++; else stat.unlinked++;
      return Object.assign({}, w, { taskId: nid || '' });
    });
    return { tasks: tasks, core: [], links: {}, flows: {}, lessons: {}, docs: opts.dropDocs ? [] : (db.docs || []).slice(), works: works, stat: stat };
  }

  /* ── 5. 핵심 업무 점수 ────────────────────────────────────── */
  function annualHours(t, settings) {
    var c = parseCycle(t.cycle, settings), h = parseHours(t.hours, settings);
    return c.perYear != null && h != null ? c.perYear * h : null;
  }
  /* 점수 = 가중 평균(0~100). 빈도×소요 시간은 연간 시간을 로그로 눌러 0~1(가장 많은 업무 = 1),
     신입 관련성·고객 영향은 1~5 → 0~1. 비어 있으면 3(보통)으로 셉니다. */
  function scoreTasks(tasks, settings) {
    var S = cleanSettings(settings);
    var ann = tasks.map(function (t) { return annualHours(t, S); });
    var max = Math.max.apply(null, [0].concat(ann.map(function (a) { return a || 0; })));
    var wsum = S.wFreq + S.wNewbie + S.wCustomer;
    var rows = tasks.map(function (t, i) {
      var a = ann[i];
      var f = a && max > 0 ? Math.log(1 + a) / Math.log(1 + max) : 0;
      var nb = t.newbie == null ? 3 : t.newbie, cu = t.customer == null ? 3 : t.customer;
      var n = (nb - 1) / 4, c = (cu - 1) / 4;
      var score = 100 * (S.wFreq * f + S.wNewbie * n + S.wCustomer * c) / wsum;
      return { task: t, annual: a, perYear: parseCycle(t.cycle, S).perYear, hoursEach: parseHours(t.hours, S), fScore: f, newbie: nb, customer: cu, score: round(score, 1),
        parts: { freq: round(100 * S.wFreq * f / wsum, 1), newbie: round(100 * S.wNewbie * n / wsum, 1), customer: round(100 * S.wCustomer * c / wsum, 1) } };
    });
    var sorted = rows.slice().sort(function (a, b) { return b.score - a.score || (b.annual || 0) - (a.annual || 0) || (a.task.name < b.task.name ? -1 : 1); });
    sorted.forEach(function (r, i) { r.rank = i + 1; });
    return sorted;
  }
  function recommendCore(scored, n) { return scored.filter(function (r) { return !r.task.missing; }).slice(0, n).map(function (r) { return r.task.id; }); }
  function coreStatus(core, settings) {
    var S = cleanSettings(settings), n = (core || []).length;
    if (n < S.coreMin) return { ok: false, n: n, text: '핵심 업무가 ' + n + '개입니다. ' + S.coreMin + '~' + S.coreMax + '개를 골라 주세요(' + (S.coreMin - n) + '개 더).' };
    if (n > S.coreMax) return { ok: false, n: n, text: '핵심 업무가 ' + n + '개입니다. ' + S.coreMax + '개 이하로 줄여 주세요(' + (n - S.coreMax) + '개 빼기).' };
    return { ok: true, n: n, text: '핵심 업무 ' + n + '개 — 목표 범위(' + S.coreMin + '~' + S.coreMax + '개) 안입니다.' };
  }

  /* ── 6. 문서 목록 · 연결 ──────────────────────────────────── */
  var KINDS = ['정형', '비정형', '형식'];
  var KIND_HELP = {
    '정형': 'ISO 규정·지침 기반 공식 문서(품질매뉴얼·절차서 등)',
    '비정형': '개인이 만든 PPT·엑셀(업무지침서·교육자료 등)',
    '형식': '양식은 갖췄지만 실제 활용이 적은 문서(Flow Chart·관리계획서·PFMEA·검사기준서 등)'
  };
  function normalizeKind(text, name) {
    var t = str(text);
    if (/비정형/.test(t)) return '비정형';
    if (/형식/.test(t)) return '형식';
    if (/정형/.test(t)) return '정형';
    var n = str(name).toLowerCase();
    if (/매뉴얼|절차서|규정|규격서/.test(n)) return '정형';
    if (/flow|흐름도|관리계획|fmea|검사기준서/.test(n)) return '형식';
    if (/ppt|교육자료|지침서|메모|엑셀|정리본/.test(n)) return '비정형';
    return '';
  }
  function parseDocSheet(aoa, opts) {
    opts = opts || {};
    var det = detectColumns(aoa, DOC_FIELDS, opts.overrides);
    var docs = [], warnings = [], skipped = 0, seen = {};
    if (det.headerRow < 0 || det.missing.length) return { det: det, docs: docs, warnings: warnings, skipped: 0 };
    for (var r = det.headerRow + 1; r < aoa.length; r++) {
      var row = aoa[r] || [];
      var name = str(cell(row, det.map, 'name'));
      if (!name) { if (row.some(function (c) { return str(c); })) skipped++; continue; }
      var k = norm(name);
      if (seen[k]) { warnings.push((r + 1) + '행 「' + name + '」 — 같은 문서명이 ' + seen[k] + '행에도 있어 건너뜀'); skipped++; continue; }
      seen[k] = r + 1;
      var rawRev = cell(row, det.map, 'revised'), rev = toISO(rawRev);
      if (str(rawRev) && !rev) warnings.push((r + 1) + '행 「' + name + '」 — 개정일 「' + str(rawRev) + '」를 날짜로 읽지 못함');
      docs.push({ code: str(cell(row, det.map, 'code')), name: name, kind: normalizeKind(cell(row, det.map, 'kind'), name), version: str(cell(row, det.map, 'version')),
        revised: rev, owner: str(cell(row, det.map, 'owner')), note: str(cell(row, det.map, 'note')) });
    }
    return { det: det, docs: docs, warnings: warnings, skipped: skipped };
  }
  function mergeDocs(old, incoming) {
    var out = (old || []).map(function (d) { return Object.assign({}, d); }), stat = { added: 0, updated: 0 };
    incoming.forEach(function (n) {
      var o = out.filter(function (d) { return norm(d.name) === norm(n.name) || (n.code && d.code && norm(d.code) === norm(n.code)); })[0];
      if (o) { Object.keys(n).forEach(function (k) { if (n[k] !== '' && n[k] != null) o[k] = n[k]; }); stat.updated++; }
      else { out.push(Object.assign({ code: '', kind: '', version: '', revised: '', owner: '', note: '' }, n, { id: nextId('D', out) })); stat.added++; }
    });
    return { docs: out, stat: stat };
  }
  function cleanDoc(d) {
    return { id: str(d.id), code: str(d.code), name: str(d.name), kind: KINDS.indexOf(d.kind) >= 0 ? d.kind : normalizeKind(d.kind, d.name),
      version: str(d.version), revised: toISO(d.revised), owner: str(d.owner), note: str(d.note) };
  }
  /* 「수입검사 절차서, QP-07 / 성적서」 같은 글 → 등록 문서 id. 문서번호·문서명이 같거나, 한쪽이 다른 쪽을 품으면(3글자 이상) 연결 */
  function splitRefs(text) {
    return str(text).split(/[,，、;；\n\/]|\s+\+\s+/).map(function (s) { return s.replace(/^[-•·\s]+|[\s]+$/g, ''); }).filter(Boolean);
  }
  function findDoc(token, docs) {
    var n = norm(token);
    if (!n) return null;
    var hit = docs.filter(function (d) { return (d.code && norm(d.code) === n) || norm(d.name) === n; })[0];
    if (hit) return hit;
    var cands = docs.filter(function (d) {
      var dn = norm(d.name);
      return (n.length >= 3 && dn.indexOf(n) >= 0) || (dn.length >= 3 && n.indexOf(dn) >= 0) || (d.code && norm(d.code).length >= 3 && n.indexOf(norm(d.code)) >= 0);
    });
    cands.sort(function (a, b) { return norm(b.name).length - norm(a.name).length; });
    // 품는 쪽이 여럿이면 길이가 가장 비슷한 것
    cands.sort(function (a, b) { return Math.abs(norm(a.name).length - n.length) - Math.abs(norm(b.name).length - n.length); });
    return cands[0] || null;
  }
  function matchDocRefs(text, docs) {
    var ids = [], unmatched = [];
    splitRefs(text).forEach(function (tok) {
      var d = findDoc(tok, docs || []);
      if (d) { if (ids.indexOf(d.id) < 0) ids.push(d.id); } else unmatched.push(tok);
    });
    return { ids: ids, unmatched: unmatched };
  }
  /* 업무 목록의 「관련 문서」 칸으로 연결표 채우기 — 이미 손으로 넣은 연결은 그대로 두고 더하기만 합니다 */
  function autoLink(tasks, docs, links) {
    var out = {}, added = 0;
    Object.keys(links || {}).forEach(function (k) { out[k] = links[k].slice(); });
    tasks.forEach(function (t) {
      var m = matchDocRefs(t.docsText, docs);
      m.ids.forEach(function (id) { out[t.id] = out[t.id] || []; if (out[t.id].indexOf(id) < 0) { out[t.id].push(id); added++; } });
    });
    return { links: out, added: added };
  }
  function toggleLink(links, taskId, docId) {
    var out = {}; Object.keys(links || {}).forEach(function (k) { out[k] = links[k].slice(); });
    var a = out[taskId] || (out[taskId] = []), i = a.indexOf(docId);
    if (i >= 0) a.splice(i, 1); else a.push(docId);
    return out;
  }
  /* 흐름도의 입력·산출 문서 글 → 등록 문서 / 목록에 없는 이름 */
  function flowDocRefs(flow, docs) {
    var ids = [], unknown = [];
    ((flow && flow.steps) || []).forEach(function (s) {
      [s.inputs, s.outputs].forEach(function (txt) {
        var m = matchDocRefs(txt, docs);
        m.ids.forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); });
        m.unmatched.forEach(function (u) { if (unknown.indexOf(u) < 0) unknown.push(u); });
      });
    });
    return { ids: ids, unknown: unknown };
  }

  /* 연계·누락 확인 체크리스트 — 핵심 업무 우선.
     level: bad(꼭 고칠 것) · warn(확인) · info(참고). action 은 화면이 단추로 바꿉니다 */
  function checklist(db, today) {
    var S = cleanSettings(db.settings), docs = db.docs || [], tasks = db.tasks || [], links = db.links || {};
    var byId = {}; tasks.forEach(function (t) { byId[t.id] = t; });
    var docById = {}; docs.forEach(function (d) { docById[d.id] = d; });
    var items = [];
    function push(level, group, text, extra) { items.push(Object.assign({ level: level, group: group, text: text }, extra || {})); }
    var core = (db.core || []).filter(function (id) { return byId[id]; });
    var usedDoc = {};
    Object.keys(links).forEach(function (tid) { if (byId[tid]) links[tid].forEach(function (d) { usedDoc[d] = 1; }); });
    var flowUsed = {};
    Object.keys(db.flows || {}).forEach(function (tid) { flowDocRefs(db.flows[tid], docs).ids.forEach(function (d) { flowUsed[d] = 1; usedDoc[d] = 1; }); });

    core.forEach(function (id) {
      var t = byId[id], ls = (links[id] || []).filter(function (d) { return docById[d]; });
      var flow = db.flows && db.flows[id], hasFlow = flow && flow.steps && flow.steps.length;
      if (!ls.length) push('bad', '핵심 업무', '「' + t.name + '」 — 연결된 문서가 없습니다. 근거 절차서·양식을 연결해 주세요.', { taskId: id, kindOf: 'noDoc' });
      else if (!ls.some(function (d) { return docById[d].kind === '정형'; })) push('warn', '핵심 업무', '「' + t.name + '」 — 정형 문서(매뉴얼·절차서) 근거가 연결되지 않았습니다.', { taskId: id, kindOf: 'noFormal' });
      if (!hasFlow) push('warn', '핵심 업무', '「' + t.name + '」 — 업무 흐름도가 아직 없습니다.', { taskId: id, kindOf: 'noFlow' });
      else {
        var fr = flowDocRefs(flow, docs);
        fr.unknown.forEach(function (u) { push('warn', '핵심 업무', '「' + t.name + '」 흐름도에 나오는 「' + u + '」가 문서 목록에 없습니다. 목록에 넣거나 이름을 맞춰 주세요.', { taskId: id, kindOf: 'flowUnknown', name: u }); });
        fr.ids.forEach(function (d) { if (ls.indexOf(d) < 0) push('info', '핵심 업무', '「' + t.name + '」 흐름도에 쓰인 「' + docById[d].name + '」가 연결표에는 없습니다.', { taskId: id, docId: d, kindOf: 'flowNotLinked', action: 'link' }); });
        var v = validateFlow(flow.steps);
        v.errors.concat(v.warnings).forEach(function (e) { push('warn', '핵심 업무', '「' + t.name + '」 흐름도 — ' + e, { taskId: id, kindOf: 'flowCheck' }); });
      }
      if (!(db.lessons && db.lessons[id])) push('info', '핵심 업무', '「' + t.name + '」 — 교육 한 장이 아직 없습니다.', { taskId: id, kindOf: 'noLesson' });
    });
    docs.forEach(function (d) {
      if (!usedDoc[d.id]) push('warn', '문서', '「' + d.name + '」 — 어떤 업무에도 연결되지 않은 문서(고아 문서)입니다. 쓰는 업무를 연결하거나 폐기 여부를 확인해 주세요.', { docId: d.id, kindOf: 'orphan' });
      if (d.revised && today && monthsBetween(d.revised, today) >= S.staleMonths)
        push('warn', '문서', '「' + d.name + '」 — 마지막 개정 ' + d.revised + ' (' + Math.floor(monthsBetween(d.revised, today) / 12) + '년 ' + (monthsBetween(d.revised, today) % 12) + '개월 전). 지금 업무와 맞는지 확인해 주세요.', { docId: d.id, kindOf: 'stale' });
      if (!d.version && !d.revised) push('info', '문서', '「' + d.name + '」 — 버전·개정일이 비어 있습니다.', { docId: d.id, kindOf: 'noVersion' });
      if (!d.owner) push('info', '문서', '「' + d.name + '」 — 담당이 비어 있습니다.', { docId: d.id, kindOf: 'noOwner' });
      if (!d.kind) push('info', '문서', '「' + d.name + '」 — 종류(정형·비정형·형식)가 정해지지 않았습니다.', { docId: d.id, kindOf: 'noKind' });
      if (d.kind === '형식' && usedDoc[d.id] && !flowUsed[d.id]) push('info', '문서', '「' + d.name + '」 — 형식 문서인데 어느 흐름도에도 쓰이지 않습니다. 실제로 어느 단계에서 보는지 적어 두면 활용도가 올라갑니다.', { docId: d.id, kindOf: 'formalOnly' });
    });
    var unk = {};
    tasks.forEach(function (t) {
      matchDocRefs(t.docsText, docs).unmatched.forEach(function (u) { (unk[u] = unk[u] || []).push(t.name); });
    });
    Object.keys(unk).forEach(function (u) {
      push('warn', '업무 목록', '업무 목록의 관련 문서 칸에 「' + u + '」가 있지만 문서 목록에 없습니다(' + unk[u].slice(0, 3).join(', ') + (unk[u].length > 3 ? ' 외 ' + (unk[u].length - 3) : '') + ').', { kindOf: 'listUnknown', name: u });
    });
    var order = { bad: 0, warn: 1, info: 2 };
    items.sort(function (a, b) { return order[a.level] - order[b.level]; });
    var count = { bad: 0, warn: 0, info: 0 };
    items.forEach(function (i) { count[i.level]++; });
    return { items: items, count: count };
  }

  /* ── 7. 업무 흐름도 — 단계 표 ─────────────────────────────── */
  /* 단계: { name, role, inputs, outputs, question, yes, no, next }
     · question 이 있으면 판단(마름모) — yes·no 로 갈림. 비우면 「다음 순서」, 「끝」이면 끝으로.
     · 판단이 아니면 next — 비우면 다음 순서(마지막이면 끝). 번호는 표의 순서(1부터)입니다. */
  function emptyStep() { return { name: '', role: '', inputs: '', outputs: '', question: '', yes: '', no: '', next: '' }; }
  function cleanStep(s) {
    var o = emptyStep();
    s = s || {};
    Object.keys(o).forEach(function (k) { o[k] = str(s[k]); });
    ['yes', 'no', 'next'].forEach(function (k) { var r = refValue(o[k]); o[k] = r == null ? '' : r === 'end' ? '끝' : String(r); });
    return o;
  }
  /* 「5」「5번」「→ 5」「단계 5」「끝」「종료」 → 5 · 'end' · null(비움) */
  function refValue(v) {
    var s = str(v).replace(/\s/g, '');
    if (!s || s === '-' || s === '—') return null;
    if (/^(끝|종료|완료|end|stop|finish)/i.test(s.replace(/^[→>\-]+/, ''))) return 'end';
    var m = /(\d+)/.exec(s);
    return m ? Number(m[1]) : null;
  }
  function stepTargets(steps, i) {
    var s = steps[i], n = steps.length, def = i + 1 < n ? i + 2 : 'end';
    function t(v, d) { var r = refValue(v); return r == null ? d : r; }
    if (str(s.question)) return [{ kind: 'yes', to: t(s.yes, def) }, { kind: 'no', to: t(s.no, null) }];
    return [{ kind: 'next', to: t(s.next, def) }];
  }
  function validateFlow(steps) {
    var errors = [], warnings = [], n = (steps || []).length;
    if (!n) return { errors: ['단계가 없습니다.'], warnings: [] };
    steps.forEach(function (s, i) {
      var no = i + 1;
      if (!str(s.name) && !str(s.question)) errors.push(no + '번 단계 이름이 비어 있습니다.');
      if (!str(s.role)) warnings.push(no + '번 「' + (s.name || s.question) + '」 담당 직책이 비어 있습니다.');
      stepTargets(steps, i).forEach(function (e) {
        if (e.to == null) { if (e.kind === 'no') errors.push(no + '번 판단에 「아니오」일 때 갈 단계가 없습니다.'); return; }
        if (e.to !== 'end' && (e.to < 1 || e.to > n)) errors.push(no + '번 단계의 「' + ({ yes: '예', no: '아니오', next: '다음' })[e.kind] + '」 → ' + e.to + ' 은 없는 단계입니다.');
        if (e.to === no) errors.push(no + '번 단계가 자기 자신으로 돌아갑니다.');
      });
    });
    if (errors.length) return { errors: errors, warnings: warnings };
    // 1번에서 닿지 않는 단계 · 끝에 닿지 못하는 단계
    var seen = {}, queue = [1];
    while (queue.length) {
      var k = queue.shift(); if (seen[k]) continue; seen[k] = 1;
      stepTargets(steps, k - 1).forEach(function (e) { if (e.to !== 'end' && e.to != null && !seen[e.to]) queue.push(e.to); });
    }
    for (var i = 1; i <= n; i++) if (!seen[i]) warnings.push(i + '번 「' + (steps[i - 1].name || steps[i - 1].question) + '」 — 1번에서 시작해 닿지 않는 단계입니다.');
    var canEnd = {}, changed = true;
    while (changed) {
      changed = false;
      for (var j = 1; j <= n; j++) {
        if (canEnd[j]) continue;
        if (stepTargets(steps, j - 1).some(function (e) { return e.to === 'end' || canEnd[e.to]; })) { canEnd[j] = 1; changed = true; }
      }
    }
    for (var q = 1; q <= n; q++) if (seen[q] && !canEnd[q]) warnings.push(q + '번 「' + (steps[q - 1].name || steps[q - 1].question) + '」 — 여기서 끝으로 가는 길이 없습니다(되돌아가기만 반복).');
    return { errors: errors, warnings: warnings };
  }
  /* 단계 넣기·빼기·옮기기 — 다른 단계의 예·아니오·다음 번호를 함께 고칩니다 */
  function remapRefs(steps, map) {
    return steps.map(function (s) {
      var o = Object.assign({}, s);
      ['yes', 'no', 'next'].forEach(function (k) {
        var r = refValue(o[k]);
        if (typeof r === 'number') { var nv = map(r); o[k] = nv == null ? '' : String(nv); }
      });
      return o;
    });
  }
  function insertStep(steps, at, step) {
    var out = remapRefs(steps, function (r) { return r >= at + 1 ? r + 1 : r; });
    out.splice(at, 0, cleanStep(step || {}));
    return out;
  }
  function deleteStep(steps, at) {
    var del = at + 1;
    var out = remapRefs(steps, function (r) { return r === del ? null : r > del ? r - 1 : r; });
    out.splice(at, 1);
    return out;
  }
  function moveStep(steps, from, to) {
    if (to < 0 || to >= steps.length || from === to) return steps.slice();
    var order = steps.map(function (_, i) { return i; });
    var x = order.splice(from, 1)[0]; order.splice(to, 0, x);
    var newNo = {}; order.forEach(function (oldIdx, newIdx) { newNo[oldIdx + 1] = newIdx + 1; });
    var re = remapRefs(steps, function (r) { return newNo[r] || r; });
    return order.map(function (oldIdx) { return re[oldIdx]; });
  }
  function flowRoles(steps) { return uniq((steps || []).map(function (s) { return str(s.role) || '(담당 미정)'; })); }

  /* ── 8. 업무 흐름도 — 그림 배치(직책별 칸, 위→아래) ─────────── */
  /* 글자 폭 어림: 한글·한자 1em, 영문·숫자 0.62em, 공백 0.33em(실제보다 조금 넉넉하게 — 넘치지 않게) */
  function textWidth(s, size) {
    var w = 0; s = String(s);
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c === 32) w += 0.33;
      else if (c >= 0x1100 && (c <= 0x11ff || (c >= 0x2e80 && c <= 0xd7af) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xff00 && c <= 0xffef))) w += 1;
      else if (c >= 0x2000 && c <= 0x2bff) w += 0.9;
      else if (/[A-Z]/.test(s[i])) w += 0.68;
      else w += 0.6;
    }
    return w * size;
  }
  /* 어절(띄어쓰기) 단위로 줄 바꾸기 — 한 어절이 한 줄보다 길 때만 글자 단위로 자릅니다 */
  function wrapText(s, maxW, size) {
    var words = str(s).split(/\s+/).filter(Boolean), lines = [], cur = '';
    words.forEach(function (w) {
      var t = cur ? cur + ' ' + w : w;
      if (textWidth(t, size) <= maxW) { cur = t; return; }
      if (cur) lines.push(cur);
      if (textWidth(w, size) <= maxW) { cur = w; return; }
      var piece = '';
      for (var i = 0; i < w.length; i++) {
        // 물음표·마침표·닫는 괄호는 앞 글자와 떨어뜨리지 않음
        if (textWidth(piece + w[i], size) > maxW && piece && !/[?？.,!)\]」』]/.test(w[i])) { lines.push(piece); piece = ''; }
        piece += w[i];
      }
      cur = piece;
    });
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  }
  var FLOW = { laneW: 184, headH: 0, pad: 14, gap: 40, font: 13, small: 11, lineH: 17, smallLineH: 15, termH: 30, corridor: 16, corridorStep: 14, labelPad: 3 };
  function layoutFlow(steps, opts) {
    opts = opts || {};
    var F = Object.assign({}, FLOW, opts);
    steps = (steps || []).map(cleanStep);
    var roles = flowRoles(steps), n = steps.length;
    var laneOf = steps.map(function (s) { return roles.indexOf(str(s.role) || '(담당 미정)'); });
    var lanesW = roles.length * F.laneW;
    // 칸 머리
    var heads = roles.map(function (r) { return wrapText(r, F.laneW - 16, F.font); });
    var headH = Math.max.apply(null, [1].concat(heads.map(function (l) { return l.length; }))) * F.lineH + 16;
    var top = headH + 14;
    // 노드 크기
    var nodes = steps.map(function (s, i) {
      var dec = !!str(s.question);
      var cx = laneOf[i] * F.laneW + F.laneW / 2;
      var node = { i: i, no: i + 1, kind: dec ? 'decision' : 'process', lane: laneOf[i], cx: cx, lines: [], small: [] };
      if (dec) {
        // 마름모 안에 글자 상자(폭 tw, 높이 th)가 들어가려면 tw/W + th/H ≤ 1 → H ≥ th / (1 - tw/W)
        node.w = F.laneW - 8;
        var ratio = 0.58, tw = node.w * ratio - 4;
        node.lines = wrapText((i + 1) + '. ' + s.question, tw, F.font);
        var th = node.lines.length * F.lineH + 4;
        node.h = Math.max(72, Math.ceil(th / (1 - ratio)) + 12);
        node.textW = tw;
      } else {
        node.w = F.laneW - 22;
        var w2 = node.w - 16;
        node.lines = wrapText((i + 1) + '. ' + (s.name || ''), w2, F.font);
        var docs = [];
        if (s.inputs) docs.push('입력: ' + s.inputs);
        if (s.outputs) docs.push('산출: ' + s.outputs);
        docs.forEach(function (d) { node.small = node.small.concat(wrapText(d, w2, F.small)); });
        node.h = Math.max(44, node.lines.length * F.lineH + node.small.length * F.smallLineH + 16);
        node.textW = w2;
      }
      return node;
    });
    // 세로 배치 — 한 줄에 한 단계. 시작 → 단계들 → 끝
    var y = top;
    var start = { kind: 'start', lane: laneOf[0] || 0, w: 88, h: F.termH, label: '시작' };
    start.cx = (start.lane) * F.laneW + F.laneW / 2; start.y = y; y += F.termH + F.gap;
    nodes.forEach(function (nd) { nd.y = y; y += nd.h + F.gap; });
    var endLane = n ? laneOf[n - 1] : 0;
    var end = { kind: 'end', lane: endLane, w: 88, h: F.termH, label: '끝', cx: endLane * F.laneW + F.laneW / 2, y: y };
    y += F.termH + 18;
    var all = [start].concat(nodes, [end]);
    all.forEach(function (nd) { nd.x = nd.cx - nd.w / 2; nd.cy = nd.y + nd.h / 2; });

    // 선 — 바로 아래 줄로 가면 아래로, 아니면 오른쪽 통로로 돌아갑니다
    var edges = [];
    function target(to) { return to === 'end' ? end : nodes[to - 1]; }
    if (n) edges.push({ from: start, to: nodes[0], kind: 'next', label: '' });
    nodes.forEach(function (nd, i) {
      stepTargets(steps, i).forEach(function (e) {
        if (e.to == null) return;
        var t = target(e.to); if (!t || t === nd) return;
        edges.push({ from: nd, to: t, kind: e.kind, label: e.kind === 'yes' ? '예' : e.kind === 'no' ? '아니오' : '' });
      });
    });
    var order = all.indexOf.bind(all);
    var corridorEdges = [];
    edges.forEach(function (e) {
      var fi = order(e.from), ti = order(e.to);
      e.down = ti === fi + 1;
      if (!e.down) corridorEdges.push(e);
    });
    // 같은 노드에서 나가는·들어오는 통로 선의 높이를 나눠 겹치지 않게
    var outs = {}, ins = {};
    corridorEdges.forEach(function (e) { var a = order(e.from), b = order(e.to); (outs[a] = outs[a] || []).push(e); (ins[b] = ins[b] || []).push(e); });
    // 짧은 선이 안쪽 통로 — 교차를 줄임
    corridorEdges.sort(function (a, b) { return Math.abs(order(a.from) - order(a.to)) - Math.abs(order(b.from) - order(b.to)); });
    corridorEdges.forEach(function (e, k) { e.cx = lanesW + F.corridor + k * F.corridorStep; });
    function sideX(nd, yy) {
      if (nd.kind === 'decision') { var dy = Math.abs(yy - nd.cy); return nd.cx + (nd.w / 2) * Math.max(0, 1 - dy / (nd.h / 2)); }
      return nd.x + nd.w;
    }
    function slots(nd, list, isOut) {
      var idx = order(nd), o = outs[idx] || [], inn = ins[idx] || [];
      var tot = o.length + inn.length;
      var span = nd.kind === 'decision' ? Math.min(nd.h * 0.3, 10 * (tot - 1)) : Math.min(nd.h - 14, 12 * (tot - 1));
      var seq = o.concat(inn);
      var k = seq.indexOf(list);
      return tot <= 1 ? nd.cy : nd.cy - span / 2 + (span * k) / (tot - 1);
    }
    edges.forEach(function (e) {
      var a = e.from, b = e.to;
      if (e.down) {
        var y1 = a.y + a.h, y2 = b.y, midY = y1 + F.gap / 2;
        e.points = a.cx === b.cx ? [[a.cx, y1], [b.cx, y2]] : [[a.cx, y1], [a.cx, midY], [b.cx, midY], [b.cx, y2]];
        if (e.label) e.labelAt = { x: a.cx + 6, y: y1 + 4, anchor: 'start' };
      } else {
        var ya = slots(a, e, true), yb = slots(b, e, false);
        var xa = sideX(a, ya), xb = sideX(b, yb);
        e.points = [[xa, ya], [e.cx, ya], [e.cx, yb], [xb, yb]];
        if (e.label) e.labelAt = { x: xa + 5, y: ya - 3 - F.small, anchor: 'start' };
      }
      if (e.labelAt) {
        var lw = textWidth(e.label, F.small) + 2 * F.labelPad;
        e.labelBox = { x: e.labelAt.x - F.labelPad, y: e.labelAt.y, w: lw, h: F.small + 4 };
      }
    });
    var width = lanesW + (corridorEdges.length ? F.corridor + corridorEdges.length * F.corridorStep + 6 : 8);
    edges.forEach(function (e) { if (e.labelBox) width = Math.max(width, e.labelBox.x + e.labelBox.w + 4); });
    return { F: F, roles: roles, heads: heads, headH: headH, lanesW: lanesW, width: Math.ceil(width), height: Math.ceil(y), nodes: nodes, start: start, end: end, edges: edges, steps: steps };
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  var FLOW_COLORS = { laneA: '#f6f8fb', laneB: '#eef3f9', laneLine: '#c9d3df', head: '#0f2544', proc: '#ffffff', procLine: '#2f73d9', dec: '#fff7e0', decLine: '#c98500', term: '#e6f2ea', termLine: '#1b6e3a', text: '#16202c', muted: '#4f5b69', edge: '#3d4a5c', yes: '#1b6e3a', no: '#b3261e' };
  /* 배치 → SVG 글자(그대로 파일로 내려받을 수 있게 색·글꼴을 속성으로 넣습니다) */
  function flowSvg(L, opts) {
    opts = opts || {};
    var F = L.F, C = FLOW_COLORS, o = [];
    var titleH = opts.title ? 30 : 0;
    var W = L.width, H = L.height + titleH;
    o.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" font-family="Pretendard, \'Apple SD Gothic Neo\', \'Malgun Gothic\', \'Noto Sans KR\', sans-serif" role="img" aria-label="' + esc((opts.title || '업무 흐름도') + ' — 단계 ' + L.nodes.length + '개, 담당 ' + L.roles.length + '곳') + '">');
    o.push('<defs><marker id="qwArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="' + C.edge + '"/></marker></defs>');
    o.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#ffffff"/>');
    if (opts.title) o.push('<text x="8" y="21" font-size="15" font-weight="700" fill="' + C.head + '">' + esc(opts.title) + '</text>');
    o.push('<g transform="translate(0,' + titleH + ')">');
    L.roles.forEach(function (r, i) {
      var x = i * F.laneW;
      o.push('<rect class="lane" x="' + x + '" y="0" width="' + F.laneW + '" height="' + L.height + '" fill="' + (i % 2 ? C.laneB : C.laneA) + '" stroke="' + C.laneLine + '"/>');
      o.push('<rect x="' + x + '" y="0" width="' + F.laneW + '" height="' + L.headH + '" fill="' + C.head + '"/>');
      var ly = (L.headH - L.heads[i].length * F.lineH) / 2 + F.font;
      o.push('<text class="lane-head" data-box="' + [x + 4, 0, F.laneW - 8, L.headH].join(',') + '" x="' + (x + F.laneW / 2) + '" y="' + ly + '" font-size="' + F.font + '" font-weight="700" fill="#ffffff" text-anchor="middle">' +
        L.heads[i].map(function (t, k) { return '<tspan x="' + (x + F.laneW / 2) + '" dy="' + (k ? F.lineH : 0) + '">' + esc(t) + '</tspan>'; }).join('') + '</text>');
    });
    // 선 먼저(노드가 위에 오게)
    L.edges.forEach(function (e) {
      var col = e.kind === 'yes' ? C.yes : e.kind === 'no' ? C.no : C.edge;
      o.push('<polyline class="edge" points="' + e.points.map(function (p) { return round(p[0], 1) + ',' + round(p[1], 1); }).join(' ') + '" fill="none" stroke="' + col + '" stroke-width="1.6" marker-end="url(#qwArrow)"/>');
    });
    [L.start].concat(L.nodes, [L.end]).forEach(function (nd) {
      var box = [round(nd.x, 1), round(nd.y, 1), round(nd.w, 1), round(nd.h, 1)].join(',');
      if (nd.kind === 'start' || nd.kind === 'end') {
        o.push('<rect class="node term" x="' + nd.x + '" y="' + nd.y + '" width="' + nd.w + '" height="' + nd.h + '" rx="' + nd.h / 2 + '" fill="' + C.term + '" stroke="' + C.termLine + '" stroke-width="1.5"/>');
        o.push('<text class="node-text" data-shape="rect" data-box="' + box + '" x="' + nd.cx + '" y="' + (nd.cy + F.font * 0.36) + '" font-size="' + F.font + '" font-weight="700" fill="' + C.termLine + '" text-anchor="middle">' + nd.label + '</text>');
        return;
      }
      if (nd.kind === 'decision') {
        o.push('<polygon class="node dec" points="' + [[nd.cx, nd.y], [nd.x + nd.w, nd.cy], [nd.cx, nd.y + nd.h], [nd.x, nd.cy]].map(function (p) { return round(p[0], 1) + ',' + round(p[1], 1); }).join(' ') + '" fill="' + C.dec + '" stroke="' + C.decLine + '" stroke-width="1.5"/>');
        var y0 = nd.cy - (nd.lines.length * F.lineH) / 2 + F.font * 0.95;
        o.push('<text class="node-text" data-shape="diamond" data-box="' + box + '" x="' + nd.cx + '" y="' + round(y0, 1) + '" font-size="' + F.font + '" fill="' + C.text + '" text-anchor="middle">' +
          nd.lines.map(function (t, k) { return '<tspan x="' + nd.cx + '" dy="' + (k ? F.lineH : 0) + '">' + esc(t) + '</tspan>'; }).join('') + '</text>');
        return;
      }
      o.push('<rect class="node proc" x="' + round(nd.x, 1) + '" y="' + nd.y + '" width="' + nd.w + '" height="' + nd.h + '" rx="6" fill="' + C.proc + '" stroke="' + C.procLine + '" stroke-width="1.5"/>');
      var ty = nd.y + 8 + F.font * 0.95;
      var parts = nd.lines.map(function (t, k) { return '<tspan x="' + round(nd.x + 8, 1) + '" dy="' + (k ? F.lineH : 0) + '" font-weight="700">' + esc(t) + '</tspan>'; });
      nd.small.forEach(function (t, k) { parts.push('<tspan x="' + round(nd.x + 8, 1) + '" dy="' + (k === 0 ? F.lineH - 1 : F.smallLineH) + '" font-size="' + F.small + '" fill="' + C.muted + '">' + esc(t) + '</tspan>'); });
      o.push('<text class="node-text" data-shape="rect" data-box="' + box + '" x="' + round(nd.x + 8, 1) + '" y="' + round(ty, 1) + '" font-size="' + F.font + '" fill="' + C.text + '">' + parts.join('') + '</text>');
    });
    L.edges.forEach(function (e) {
      if (!e.labelBox) return;
      var b = e.labelBox, col = e.kind === 'yes' ? C.yes : C.no;
      o.push('<rect class="edge-label-bg" x="' + round(b.x, 1) + '" y="' + round(b.y, 1) + '" width="' + round(b.w, 1) + '" height="' + b.h + '" rx="3" fill="#ffffff" stroke="' + col + '" stroke-width=".8"/>');
      o.push('<text class="edge-label" x="' + round(e.labelAt.x, 1) + '" y="' + round(b.y + F.small + 0.5, 1) + '" font-size="' + F.small + '" font-weight="700" fill="' + col + '">' + e.label + '</text>');
    });
    o.push('</g></svg>');
    return o.join('');
  }
  /* 배치 점검 — 노드끼리 겹침, 글자 줄이 칸을 넘음(어림 폭), 예·아니오 꼬리표가 노드를 가림 */
  function inter(a, b, m) { m = m || 0; return a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m; }
  function inDiamond(nd, px, py) { return Math.abs(px - nd.cx) / (nd.w / 2) + Math.abs(py - nd.cy) / (nd.h / 2) <= 1.0001; }
  function checkFlowLayout(L) {
    var F = L.F, problems = [];
    var all = [L.start].concat(L.nodes, [L.end]);
    for (var i = 0; i < all.length; i++) for (var j = i + 1; j < all.length; j++)
      if (inter(all[i], all[j], 4)) problems.push('노드 겹침: ' + (all[i].no || all[i].kind) + ' · ' + (all[j].no || all[j].kind));
    L.nodes.forEach(function (nd) {
      if (nd.kind === 'decision') {
        var y0 = nd.cy - (nd.lines.length * F.lineH) / 2;
        nd.lines.forEach(function (t, k) {
          var w = textWidth(t, F.font), top = y0 + k * F.lineH + 2, bot = top + F.font;
          var pts = [[nd.cx - w / 2, top], [nd.cx + w / 2, top], [nd.cx - w / 2, bot], [nd.cx + w / 2, bot]];
          if (!pts.every(function (p) { return inDiamond(nd, p[0], p[1]); })) problems.push(nd.no + '번 판단 글자가 마름모를 넘음: 「' + t + '」');
        });
      } else {
        nd.lines.forEach(function (t) { if (textWidth(t, F.font) > nd.w - 12) problems.push(nd.no + '번 글자가 상자를 넘음: 「' + t + '」'); });
        nd.small.forEach(function (t) { if (textWidth(t, F.small) > nd.w - 12) problems.push(nd.no + '번 문서 글자가 상자를 넘음: 「' + t + '」'); });
        var need = nd.lines.length * F.lineH + nd.small.length * F.smallLineH + 12;
        if (need > nd.h) problems.push(nd.no + '번 글자 줄이 상자 높이를 넘음');
      }
    });
    L.edges.forEach(function (e) {
      if (!e.labelBox) return;
      all.forEach(function (nd) { if (inter(e.labelBox, nd, 0)) problems.push('「' + e.label + '」 꼬리표가 ' + (nd.no ? nd.no + '번' : nd.label) + ' 노드를 가림'); });
      if (e.labelBox.x + e.labelBox.w > L.width) problems.push('「' + e.label + '」 꼬리표가 그림 밖으로 나감');
    });
    for (var a = 0; a < L.edges.length; a++) for (var b = a + 1; b < L.edges.length; b++) {
      var la = L.edges[a].labelBox, lb = L.edges[b].labelBox;
      if (la && lb && inter(la, lb, 0)) problems.push('꼬리표끼리 겹침');
    }
    // 선이 남의 노드를 지나지 않는지(선분 ↔ 노드 상자, 자기 양 끝 노드 제외)
    L.edges.forEach(function (e) {
      for (var k = 0; k + 1 < e.points.length; k++) {
        var p = e.points[k], q = e.points[k + 1];
        var seg = { x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), w: Math.abs(p[0] - q[0]) || 0.01, h: Math.abs(p[1] - q[1]) || 0.01 };
        all.forEach(function (nd) { if (nd !== e.from && nd !== e.to && inter(seg, nd, -1)) problems.push('선이 ' + (nd.no ? nd.no + '번' : nd.label) + ' 노드를 지남'); });
      }
    });
    // 서로 다른 선이 같은 줄 위에 포개지는지(세로끼리 같은 x · 가로끼리 같은 y 에서 2px 넘게 겹침) — 포개지면 어느 선인지 못 읽음
    function segs(e) { var o = []; for (var k = 0; k + 1 < e.points.length; k++) o.push([e.points[k], e.points[k + 1]]); return o; }
    for (var p1 = 0; p1 < L.edges.length; p1++) for (var p2 = p1 + 1; p2 < L.edges.length; p2++) {
      segs(L.edges[p1]).forEach(function (s1) {
        segs(L.edges[p2]).forEach(function (s2) {
          var v1 = Math.abs(s1[0][0] - s1[1][0]) < 0.5, v2 = Math.abs(s2[0][0] - s2[1][0]) < 0.5;
          var hz1 = Math.abs(s1[0][1] - s1[1][1]) < 0.5, hz2 = Math.abs(s2[0][1] - s2[1][1]) < 0.5;
          function ov(a1, a2, b1, b2) { return Math.min(Math.max(a1, a2), Math.max(b1, b2)) - Math.max(Math.min(a1, a2), Math.min(b1, b2)); }
          if (v1 && v2 && Math.abs(s1[0][0] - s2[0][0]) < 1 && ov(s1[0][1], s1[1][1], s2[0][1], s2[1][1]) > 2) problems.push('선끼리 포개짐(세로)');
          else if (hz1 && hz2 && Math.abs(s1[0][1] - s2[0][1]) < 1 && ov(s1[0][0], s1[1][0], s2[0][0], s2[1][0]) > 2) problems.push('선끼리 포개짐(가로)');
        });
      });
    }
    return problems;
  }

  /* ── 9. AI (반자동) — 절차서 문단 → 단계 표 ───────────────── */
  function flowPrompt(task, paragraph, roles, docNames) {
    var p = [];
    p.push('너는 제조업 품질경영팀의 업무 프로세스 정리를 돕는 보조야.');
    p.push('아래 「절차서 문단」을 읽고 업무 흐름도용 단계 표로 바꿔줘.');
    p.push('');
    p.push('[업무] ' + task.name + (task.cycle ? ' · 주기 ' + task.cycle : '') + (task.role ? ' · 주 담당 ' + task.role : ''));
    if (roles && roles.length) p.push('[쓸 수 있는 담당 직책·부서 이름] ' + roles.join(', ') + ' (이 이름을 그대로 쓰고, 문단에 다른 담당이 나오면 문단의 이름을 써줘)');
    if (docNames && docNames.length) p.push('[등록된 문서 이름] ' + docNames.join(', ') + ' (문단의 문서가 이 가운데 있으면 이 이름 그대로 써줘)');
    p.push('');
    p.push('[규칙]');
    p.push('- 문단에 있는 내용만 써줘. 문단에 없는 단계·숫자·조항 번호·문서를 지어내지 마.');
    p.push('- 한 줄에 한 단계, 「누가 무엇을 한다」 수준으로 짧게(단계명 20자 이내).');
    p.push('- 판단(예/아니오로 갈리는 곳)은 「판단 질문」 칸에 「~인가?」로 적고, 예·아니오일 때 갈 단계 번호를 적어줘. 끝나면 「끝」.');
    p.push('- 판단이 아닌 단계가 다음 순서가 아닌 곳으로 가면 「다음」 칸에 번호(또는 「끝」), 다음 순서로 가면 비워줘.');
    p.push('- 문단에서 알 수 없는 칸은 비워 두고, 표 아래에 「확인 필요:」로 모르는 점을 적어줘.');
    p.push('');
    p.push('[답 형식] 아래 머리 그대로의 표(| 로 구분) 하나:');
    p.push('| 순서 | 단계명 | 담당 | 입력 문서 | 산출 문서 | 판단 질문 | 예 | 아니오 | 다음 |');
    p.push('');
    p.push('[절차서 문단]');
    p.push(str(paragraph) || '(여기에 절차서 문단을 붙여 넣어 주세요)');
    return p.join('\n');
  }
  var STEP_COLS = [
    { id: 'no', re: /^(순서|번호|no|단계번호|#|순번)$/ },
    { id: 'question', re: /판단|질문|분기|조건/ },
    { id: 'yes', re: /^(예|yes|y|예일때|예→|예->|예이면)/ },
    { id: 'no_', re: /^(아니오|아니요|no|n|아니오일때|아니오이면)/ },
    { id: 'next', re: /^(다음|다음단계|next|→)/ },
    { id: 'inputs', re: /입력/ },
    { id: 'outputs', re: /산출|출력|결과문서|작성문서|기록/ },
    { id: 'role', re: /담당|직책|부서|수행자|주체|누가/ },
    { id: 'name', re: /단계명|단계|활동|업무|내용|작업/ }
  ];
  function splitRow(line) {
    if (line.indexOf('|') >= 0) return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(function (c) { return c.trim(); });
    if (line.indexOf('\t') >= 0) return line.split('\t').map(function (c) { return c.trim(); });
    return null;
  }
  function parseStepsAnswer(text) {
    var lines = str(text).split(/\r?\n/), warnings = [], rows = [], header = null;
    lines.forEach(function (ln) {
      var cells = splitRow(ln);
      if (!cells || cells.length < 3) return;
      if (cells.every(function (c) { return /^:?-{2,}:?$/.test(c) || !c; })) return;
      if (!header) {
        var hm = {};
        cells.forEach(function (c, i) {
          var n = norm(c).replace(/[→>]/g, '');
          for (var k = 0; k < STEP_COLS.length; k++) {
            var id = STEP_COLS[k].id;
            if (hm[id] == null && STEP_COLS[k].re.test(n)) { hm[id] = i; break; }
          }
        });
        if (hm.name != null || hm.question != null) { header = hm; return; }
        header = { no: 0, name: 1, role: 2, inputs: 3, outputs: 4, question: 5, yes: 6, no_: 7, next: 8 };
        warnings.push('표 머리를 못 찾아 「순서 · 단계명 · 담당 · 입력 · 산출 · 판단 · 예 · 아니오 · 다음」 순서로 읽었습니다.');
      }
      rows.push(cells);
    });
    if (!rows.length) {
      // 표가 없으면 「1. 단계명 (담당)」 줄로
      lines.forEach(function (ln) {
        var m = /^\s*(\d+)[.)]\s*(.+)$/.exec(ln);
        if (!m) return;
        var body = m[2], role = '';
        var rm = /[(（]\s*(?:담당[:：]?\s*)?([^)）]+)[)）]\s*$/.exec(body) || /\s[-—–]\s*담당[:：]?\s*(.+)$/.exec(body);
        if (rm) { role = rm[1].trim(); body = body.slice(0, rm.index).trim(); }
        rows.push([m[1], body, role]);
      });
      header = { no: 0, name: 1, role: 2 };
      if (rows.length) warnings.push('표가 없어 번호 줄(「1. 단계명 (담당)」)로 읽었습니다. 판단·문서 칸은 직접 채워 주세요.');
    }
    function g(r, k) { return header[k] == null ? '' : str(r[header[k]]).replace(/\*\*|`/g, '').trim(); }
    var numMap = {};
    var steps = rows.map(function (r, i) {
      var noTxt = g(r, 'no'), nn = refValue(noTxt);
      if (typeof nn === 'number') numMap[nn] = i + 1;
      var s = { name: g(r, 'name'), role: g(r, 'role'), inputs: g(r, 'inputs'), outputs: g(r, 'outputs'), question: g(r, 'question'), yes: g(r, 'yes'), no: g(r, 'no_'), next: g(r, 'next') };
      if (/^(없음|-|—|해당없음|n\/a)$/i.test(s.question)) s.question = '';
      ['inputs', 'outputs'].forEach(function (k) { if (/^(없음|-|—|해당없음)$/.test(s[k])) s[k] = ''; });
      if (!s.name && s.question) s.name = s.question.replace(/[?？]$/, '') + ' 판단';
      return s;
    }).filter(function (s) { return s.name || s.question; });
    // AI 가 번호를 1부터 매기지 않았으면 표 순서로 다시 맞춤
    steps = steps.map(function (s) {
      var o = Object.assign({}, s);
      ['yes', 'no', 'next'].forEach(function (k) {
        var r = refValue(o[k]);
        if (typeof r === 'number' && numMap[r] && numMap[r] !== r) o[k] = String(numMap[r]);
      });
      return cleanStep(o);
    });
    var notes = [];
    lines.forEach(function (ln) { var m = /확인\s*필요[:：]\s*(.+)/.exec(ln); if (m) notes.push(m[1].trim()); });
    if (!steps.length) warnings.push('읽을 단계가 없습니다. 답이 「| 순서 | 단계명 | 담당 | … |」 표인지 확인해 주세요.');
    return { steps: steps, warnings: warnings, notes: notes };
  }

  /* ── 10. 신입 교육 ────────────────────────────────────────── */
  var DIFF_LABEL = { 1: '쉬움', 2: '보통', 3: '어려움' };
  /* 주차 배치 — 난이도 낮은 것부터, 같은 난이도는 핵심 업무 순서대로. 1주차 맨 앞은 문서 체계 오리엔테이션 */
  function curriculum(db) {
    var S = cleanSettings(db.settings), byId = {};
    (db.tasks || []).forEach(function (t) { byId[t.id] = t; });
    var core = (db.core || []).filter(function (id) { return byId[id]; });
    var items = core.map(function (id, i) {
      var t = byId[id];
      return { taskId: id, name: t.name, role: t.role, difficulty: t.difficulty || 2, order: i, hasFlow: !!(db.flows && db.flows[id] && db.flows[id].steps.length), hasLesson: !!(db.lessons && db.lessons[id]) };
    });
    items.sort(function (a, b) { return a.difficulty - b.difficulty || a.order - b.order; });
    var weeks = [], per = Math.max(1, Math.ceil(items.length / S.weeks));
    for (var w = 0; w < S.weeks; w++) weeks.push({ week: w + 1, items: [] });
    items.forEach(function (it, i) { weeks[Math.min(S.weeks - 1, Math.floor(i / per))].items.push(it); });
    weeks.forEach(function (wk) {
      var d = wk.items.map(function (x) { return x.difficulty; });
      wk.focus = !d.length ? '복습·실습' : Math.max.apply(null, d) <= 1 ? '기초 업무' : Math.max.apply(null, d) === 2 ? '일상 핵심 업무' : '판단이 많은 업무';
    });
    return { weeks: weeks, orientation: { title: '오리엔테이션 — 품질 문서 체계', text: '품질매뉴얼 → 절차서 → 지침·양식 순서로 문서가 어떻게 이어지는지, 업무마다 어떤 문서를 보는지 봅니다.' }, perWeek: per };
  }
  function stepName(steps, to) {
    if (to === 'end') return '끝';
    var s = steps[to - 1];
    return s ? (to + '. ' + (s.name || s.question)) : '';
  }
  /* 교육 한 장 초안 — 흐름도·문서 목록에 있는 사실만 씁니다(실수 사례는 현장 경험이 필요해 비워 둠) */
  function draftLesson(task, flow, docs) {
    var steps = ((flow && flow.steps) || []).map(cleanStep);
    var roles = flowRoles(steps);
    var purpose = '「' + task.name + '」을(를) 처음부터 끝까지 순서대로 수행하고, 단계마다 누가 무엇을 보고 어떤 기록을 남기는지 익힙니다.';
    var facts = [];
    if (task.cycle) facts.push('주기 ' + task.cycle);
    if (task.hours) facts.push('1회 ' + task.hours);
    if (task.role) facts.push('주 담당 ' + task.role);
    if (facts.length) purpose += ' (' + facts.join(' · ') + ')';
    var points = [];
    steps.forEach(function (s, i) {
      if (!s.question) return;
      var tg = stepTargets(steps, i);
      points.push('판단 「' + s.question + '」 — 예: ' + stepName(steps, tg[0].to) + ' / 아니오: ' + (tg[1].to == null ? '(정해지지 않음)' : stepName(steps, tg[1].to)));
    });
    steps.forEach(function (s) { if (s.outputs) points.push('「' + s.name + '」 단계에서 ' + s.outputs + '을(를) 남깁니다(담당: ' + (s.role || '미정') + ').'); });
    if (roles.length > 1) points.push('담당이 ' + roles.join(' → ') + ' 사이를 오갑니다. 넘겨줄 때 무엇을 함께 넘기는지 확인합니다.');
    var linked = matchDocRefs(steps.map(function (s) { return [s.inputs, s.outputs].join(','); }).join(','), docs || []).ids;
    return { purpose: purpose, points: points.slice(0, 7), mistakes: [], quiz: buildQuiz(task, steps, docs || []), docIds: linked, auto: true };
  }
  /* 확인 퀴즈 3문항 — 흐름도 사실(담당 · 산출 문서 · 판단 갈림)로 만들고, 모자라면 「바로 다음 단계」 문항으로 채웁니다 */
  function buildQuiz(task, steps, docs) {
    steps = (steps || []).map(cleanStep);
    var roles = flowRoles(steps), quiz = [], seed = task.name;
    var allDocs = uniq(steps.map(function (s) { return s.outputs; }).concat(steps.map(function (s) { return s.inputs; })).join(',').split(/[,，]/).map(str).filter(Boolean)
      .concat((docs || []).map(function (d) { return d.name; })));
    function mk(q, correct, pool, explain) {
      var others = uniq(pool.filter(function (x) { return x && x !== correct; }));
      others = seededShuffle(others, seed + q).slice(0, 3);
      if (others.length < 2) return null;
      var opts = seededShuffle([correct].concat(others), q + correct);
      return { q: q, options: opts, answer: opts.indexOf(correct), explain: explain };
    }
    // 1) 담당
    var roleCount = {}; steps.forEach(function (s) { roleCount[s.role] = (roleCount[s.role] || 0) + 1; });
    var rs = steps.filter(function (s) { return s.role && !s.question; }).sort(function (a, b) { return roleCount[a.role] - roleCount[b.role]; })[0];
    if (rs) { var q1 = mk('「' + rs.name + '」 단계는 누가 합니까?', rs.role, roles.concat(['품질경영팀장', '생산팀', '구매팀', '영업팀', '검사원']), '흐름도에서 「' + rs.name + '」은(는) ' + rs.role + ' 칸에 있습니다.'); if (q1) quiz.push(q1); }
    // 2) 산출 문서
    var os = steps.filter(function (s) { return s.outputs; });
    if (os.length) {
      var s2 = os[hash(seed) % os.length], out = splitRefs(s2.outputs)[0];
      var q2 = mk('「' + s2.name + '」 단계에서 남기는(작성하는) 문서는 무엇입니까?', out, allDocs, '「' + s2.name + '」의 산출 문서는 ' + s2.outputs + '입니다.');
      if (q2) quiz.push(q2);
    }
    // 3) 판단 갈림
    var di = -1; steps.forEach(function (s, i) { if (s.question && di < 0) { var t = stepTargets(steps, i); if (t[1].to != null) di = i; } });
    if (di >= 0) {
      var t3 = stepTargets(steps, di), corr = stepName(steps, t3[1].to);
      var pool = steps.map(function (s, i) { return stepName(steps, i + 1); }).concat(['끝']).filter(function (x) { return x !== stepName(steps, di + 1); });
      var q3 = mk('「' + steps[di].question + '」에서 「아니오」이면 다음은 무엇입니까?', corr, pool, '판단이 「아니오」이면 ' + corr + '(으)로 갑니다.');
      if (q3) quiz.push(q3);
    }
    // 모자라면 순서 문항
    for (var i = 0; quiz.length < 3 && i < steps.length - 1; i++) {
      var k = (hash(seed + i) % (steps.length - 1));
      var s4 = steps[k]; if (s4.question) continue;
      var tg = stepTargets(steps, k)[0].to; if (tg == null) continue;
      var c4 = stepName(steps, tg);
      var q4 = mk('「' + s4.name + '」 바로 다음 단계는 무엇입니까?', c4, steps.map(function (s, j) { return stepName(steps, j + 1); }).filter(function (x) { return x !== stepName(steps, k + 1); }), '흐름도에서 「' + s4.name + '」 다음은 ' + c4 + '입니다.');
      if (q4 && !quiz.some(function (x) { return x.q === q4.q; })) quiz.push(q4);
    }
    return quiz.slice(0, 3);
  }
  function cleanLesson(l) {
    l = l || {};
    var lines = function (a) { return (Array.isArray(a) ? a : str(a).split(/\n/)).map(str).filter(Boolean); };
    return {
      purpose: str(l.purpose), points: lines(l.points), mistakes: lines(l.mistakes),
      quiz: (Array.isArray(l.quiz) ? l.quiz : []).map(function (q) {
        var opts = (q.options || []).map(str).filter(Boolean).slice(0, 5);
        var ans = Number(q.answer); if (!(ans >= 0 && ans < opts.length)) ans = 0;
        return { q: str(q.q), options: opts, answer: ans, explain: str(q.explain) };
      }).filter(function (q) { return q.q && q.options.length >= 2; }).slice(0, 5),
      docIds: Array.isArray(l.docIds) ? l.docIds.map(str) : [], auto: !!l.auto, updated: str(l.updated)
    };
  }
  function lessonPrompt(task, flow, docs, lesson) {
    var steps = ((flow && flow.steps) || []).map(cleanStep), p = [];
    p.push('너는 제조업 품질경영팀의 신입사원 교육 자료를 만드는 보조야.');
    p.push('아래 「단계 표」와 「관련 문서」만 근거로, 신입사원용 「교육 한 장」 내용을 써줘.');
    p.push('');
    p.push('[업무] ' + task.name + (task.cycle ? ' · 주기 ' + task.cycle : '') + (task.hours ? ' · 1회 ' + task.hours : '') + (task.role ? ' · 주 담당 ' + task.role : ''));
    p.push('[단계 표] 순서 | 단계명 | 담당 | 입력 문서 | 산출 문서 | 판단 질문 | 예 | 아니오 | 다음');
    steps.forEach(function (s, i) { p.push((i + 1) + ' | ' + [s.name, s.role, s.inputs, s.outputs, s.question, s.yes, s.no, s.next].join(' | ')); });
    var ds = (lesson && lesson.docIds ? lesson.docIds : []).map(function (id) { return (docs || []).filter(function (d) { return d.id === id; })[0]; }).filter(Boolean);
    if (ds.length) p.push('[관련 문서] ' + ds.map(function (d) { return d.name + (d.code ? '(' + d.code + ')' : '') + (d.kind ? ' · ' + d.kind : ''); }).join(', '));
    p.push('');
    p.push('[규칙]');
    p.push('- 단계 표에 없는 숫자·기준값·조항 번호·문서를 지어내지 마. 일반적인 주의점은 「일반적으로」라고 밝혀줘.');
    p.push('- 중학생도 알아듣게 쉬운 말로, 문장은 짧게.');
    p.push('- 퀴즈 3문항은 4지선다, 정답은 단계 표에서 확인할 수 있는 것으로.');
    p.push('');
    p.push('[답 형식] 아래 머리 그대로:');
    p.push('목적: (한두 문장)');
    p.push('핵심 포인트:');
    p.push('- (3~6개)');
    p.push('자주 하는 실수:');
    p.push('- (3~5개)');
    p.push('퀴즈:');
    p.push('1. (질문)');
    p.push('① (보기) ② (보기) ③ (보기) ④ (보기)');
    p.push('정답: ②');
    p.push('해설: (한 문장)');
    return p.join('\n');
  }
  var CIRCLED = '①②③④⑤';
  function parseLessonAnswer(text) {
    var out = { purpose: '', points: [], mistakes: [], quiz: [] }, warnings = [];
    var sec = '', cur = null;
    function flushQ() { if (cur && cur.q && cur.options.length >= 2) out.quiz.push(cur); cur = null; }
    function addOptions(s) {
      // 한 줄에 「① 가 ② 나 ③ 다 ④ 라」
      var parts = s.split(/(?=[①②③④⑤])/).map(str).filter(Boolean);
      if (parts.length > 1 || /^[①②③④⑤]/.test(s)) { parts.forEach(function (p) { cur.options.push(p.replace(/^[①②③④⑤]\s*/, '')); }); return true; }
      var m = /^\(?([1-5]|[a-eA-E가-마])[).]\s*(.+)$/.exec(s);
      if (m && cur.q) { cur.options.push(m[2].trim()); return true; }
      return false;
    }
    function ansIndex(s) {
      var t = str(s).replace(/[*\s]/g, '');
      var c = CIRCLED.indexOf(t.charAt(0)); if (c >= 0) return c;
      var m = /^\(?([1-5])/.exec(t); if (m) return +m[1] - 1;
      m = /^([a-eA-E])\b|^([a-eA-E])$/.exec(t); if (m) return (m[1] || m[2]).toLowerCase().charCodeAt(0) - 97;
      m = /^([가나다라마])/.exec(t); if (m) return '가나다라마'.indexOf(m[1]);
      return -1;
    }
    str(text).split(/\r?\n/).forEach(function (raw) {
      var ln = raw.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim();
      if (!ln) return;
      var h;
      if ((h = /^(?:\d+[.)]\s*)?(?:학습\s*)?목적\s*[:：]?\s*(.*)$/.exec(ln))) { flushQ(); sec = 'purpose'; if (h[1]) out.purpose += (out.purpose ? ' ' : '') + h[1]; return; }
      if (/^(?:\d+[.)]\s*)?핵심\s*(포인트|요점|정리)\s*[:：]?\s*$/.test(ln)) { flushQ(); sec = 'points'; return; }
      if (/^(?:\d+[.)]\s*)?(자주\s*하는\s*)?실수(\s*사례)?\s*[:：]?\s*$/.test(ln) || /^(?:\d+[.)]\s*)?주의(할\s*점|사항)\s*[:：]?\s*$/.test(ln)) { flushQ(); sec = 'mistakes'; return; }
      if (/^(?:\d+[.)]\s*)?(확인\s*)?(퀴즈|문제|문항)(\s*3\s*문항)?\s*[:：]?\s*$/.test(ln)) { flushQ(); sec = 'quiz'; return; }
      if (sec === 'purpose') { out.purpose += (out.purpose ? ' ' : '') + ln; return; }
      if (sec === 'points' || sec === 'mistakes') { out[sec].push(ln.replace(/^([-•·*]|\d+[.)])\s*/, '')); return; }
      if (sec === 'quiz') {
        var am = /^(정답|답)\s*[:：]\s*(.+)$/.exec(ln);
        if (am && cur) { cur.answer = ansIndex(am[2]); if (cur.answer < 0) warnings.push('정답 「' + am[2] + '」을 읽지 못했습니다(첫 보기로 둠).'); return; }
        var em = /^(해설|설명|풀이)\s*[:：]\s*(.+)$/.exec(ln);
        if (em && cur) { cur.explain = em[2].trim(); return; }
        var qm = /^(?:Q\s*|문제\s*|문항\s*)?(\d+)\s*[.)번:：]\s*(.+)$/i.exec(ln);
        if (qm && (!cur || cur.options.length >= 2 || !cur.q)) {
          if (!(cur && cur.q && cur.options.length < 2 && /^[1-5]$/.test(qm[1]) && cur.options.length)) { flushQ(); cur = { q: qm[2].trim(), options: [], answer: -1, explain: '' }; return; }
        }
        if (cur && addOptions(ln)) return;
        if (cur && !cur.options.length) { cur.q += ' ' + ln; return; }
      }
    });
    flushQ();
    out.quiz.forEach(function (q, i) { if (!(q.answer >= 0 && q.answer < q.options.length)) { warnings.push((i + 1) + '번 퀴즈 정답을 찾지 못해 첫 보기로 두었습니다. 확인해 주세요.'); q.answer = 0; } });
    if (!out.purpose && !out.points.length && !out.quiz.length) warnings.push('읽을 내용이 없습니다. 답이 「목적: / 핵심 포인트: / 자주 하는 실수: / 퀴즈:」 형식인지 확인해 주세요.');
    return { lesson: out, warnings: warnings };
  }

  /* ── 11. 표 내보내기(엑셀 aoa) ────────────────────────────── */
  function tasksToAoa(scored) {
    var a = [['순위', '번호', '구분', '업무명', '주기', '1년 횟수', '소요 시간', '1회 시간(h)', '연간 시간(h)', '직책', '신입 관련성', '고객 영향', '난이도', '점수', '관련 문서']];
    scored.forEach(function (r) { var t = r.task; a.push([r.rank, t.no, t.category, t.name, t.cycle, r.perYear == null ? '' : round(r.perYear, 1), t.hours, r.hoursEach == null ? '' : r.hoursEach, r.annual == null ? '' : round(r.annual, 1), t.role, r.newbie, r.customer, t.difficulty || '', r.score, t.docsText]); });
    return a;
  }
  function docsToAoa(docs) {
    var a = [['문서번호', '문서명', '종류', '버전', '개정일', '담당', '비고']];
    (docs || []).forEach(function (d) { a.push([d.code, d.name, d.kind, d.version, d.revised, d.owner, d.note]); });
    return a;
  }
  function matrixToAoa(tasks, docs, links) {
    var a = [['업무 \\ 문서'].concat(docs.map(function (d) { return d.name; }))];
    tasks.forEach(function (t) { a.push([t.name].concat(docs.map(function (d) { return (links[t.id] || []).indexOf(d.id) >= 0 ? '●' : ''; }))); });
    return a;
  }
  function stepsToAoa(steps) {
    var a = [['순서', '단계명', '담당', '입력 문서', '산출 문서', '판단 질문', '예', '아니오', '다음']];
    (steps || []).forEach(function (s, i) { a.push([i + 1, s.name, s.role, s.inputs, s.outputs, s.question, s.yes, s.no, s.next]); });
    return a;
  }
  function checklistToAoa(cl) {
    var a = [['구분', '수준', '내용', '확인']];
    cl.items.forEach(function (i) { a.push([i.group, ({ bad: '꼭 고칠 것', warn: '확인', info: '참고' })[i.level], i.text, '']); });
    return a;
  }

  /* ── 12. 저장 형식 ────────────────────────────────────────── */
  function emptyDb() { return { schema: SCHEMA_VERSION, tasks: [], docs: [], links: {}, core: [], flows: {}, lessons: {}, settings: cleanSettings({}), sample: false, taskSource: null, files: [], checked: {} }; }
  function restoreDb(o) {
    var db = emptyDb();
    if (!o || typeof o !== 'object') return db;
    db.tasks = (Array.isArray(o.tasks) ? o.tasks : []).filter(function (t) { return t && str(t.id) && str(t.name); }).map(function (t) {
      return { id: str(t.id), no: str(t.no), category: str(t.category), name: str(t.name), cycle: str(t.cycle), hours: str(t.hours), role: str(t.role), docsText: str(t.docsText),
        newbie: scoreVal(t.newbie, 5), customer: scoreVal(t.customer, 5), difficulty: scoreVal(t.difficulty, 3), missing: !!t.missing };
    });
    db.docs = (Array.isArray(o.docs) ? o.docs : []).filter(function (d) { return d && str(d.id) && str(d.name); }).map(cleanDoc);
    var tids = db.tasks.map(function (t) { return t.id; }), dids = db.docs.map(function (d) { return d.id; });
    if (o.links && typeof o.links === 'object') Object.keys(o.links).forEach(function (k) {
      if (tids.indexOf(k) >= 0 && Array.isArray(o.links[k])) db.links[k] = uniq(o.links[k].map(str).filter(function (d) { return dids.indexOf(d) >= 0; }));
    });
    db.core = uniq((Array.isArray(o.core) ? o.core : []).map(str).filter(function (id) { return tids.indexOf(id) >= 0; }));
    if (o.flows && typeof o.flows === 'object') Object.keys(o.flows).forEach(function (k) {
      var f = o.flows[k];
      if (tids.indexOf(k) >= 0 && f && Array.isArray(f.steps)) db.flows[k] = { steps: f.steps.map(cleanStep), source: str(f.source), updated: str(f.updated) };
    });
    if (o.lessons && typeof o.lessons === 'object') Object.keys(o.lessons).forEach(function (k) { if (tids.indexOf(k) >= 0 && o.lessons[k]) db.lessons[k] = cleanLesson(o.lessons[k]); });
    db.settings = cleanSettings(o.settings);
    db.sample = !!o.sample;
    db.taskSource = o.taskSource && typeof o.taskSource === 'object' && str(o.taskSource.name) ? { name: str(o.taskSource.name), rows: Number(o.taskSource.rows) || 0, at: str(o.taskSource.at) } : null;
    db.files = Array.isArray(o.files) ? o.files.slice(-50) : [];
    if (o.checked && typeof o.checked === 'object') Object.keys(o.checked).forEach(function (k) { if (o.checked[k] === true) db.checked[k] = true; });
    return db;
  }

  return {
    VERSION: VERSION,
    SCHEMA_VERSION: SCHEMA_VERSION, DEFAULT_SETTINGS: DEFAULT_SETTINGS, TASK_FIELDS: TASK_FIELDS, DOC_FIELDS: DOC_FIELDS, KINDS: KINDS, KIND_HELP: KIND_HELP, DIFF_LABEL: DIFF_LABEL, FLOW: FLOW,
    str: str, norm: norm, round: round, fmtNum: fmtNum, colName: colName, toISO: toISO, monthsBetween: monthsBetween, hash: hash, seededShuffle: seededShuffle,
    cleanSettings: cleanSettings, parseCycle: parseCycle, parseHours: parseHours,
    matchField: matchField, detectColumns: detectColumns, parseTaskSheet: parseTaskSheet, pickSheet: pickSheet, mergeTasks: mergeTasks, replaceTasks: replaceTasks,
    annualHours: annualHours, scoreTasks: scoreTasks, recommendCore: recommendCore, coreStatus: coreStatus,
    normalizeKind: normalizeKind, parseDocSheet: parseDocSheet, mergeDocs: mergeDocs, cleanDoc: cleanDoc, splitRefs: splitRefs, findDoc: findDoc, matchDocRefs: matchDocRefs,
    autoLink: autoLink, toggleLink: toggleLink, flowDocRefs: flowDocRefs, checklist: checklist,
    emptyStep: emptyStep, cleanStep: cleanStep, refValue: refValue, stepTargets: stepTargets, validateFlow: validateFlow, insertStep: insertStep, deleteStep: deleteStep, moveStep: moveStep, flowRoles: flowRoles,
    textWidth: textWidth, wrapText: wrapText, layoutFlow: layoutFlow, flowSvg: flowSvg, checkFlowLayout: checkFlowLayout,
    flowPrompt: flowPrompt, parseStepsAnswer: parseStepsAnswer,
    curriculum: curriculum, draftLesson: draftLesson, buildQuiz: buildQuiz, cleanLesson: cleanLesson, lessonPrompt: lessonPrompt, parseLessonAnswer: parseLessonAnswer, stepName: stepName,
    tasksToAoa: tasksToAoa, docsToAoa: docsToAoa, matrixToAoa: matrixToAoa, stepsToAoa: stepsToAoa, checklistToAoa: checklistToAoa,
    emptyDb: emptyDb, restoreDb: restoreDb
  };
});
