/* 업무 경험 수집 · AI 기반 디지털 업무 자료화 — 순수 로직 (화면 · 저장소와 무관, 2026-10-28 방향 수정)
   브라우저에서는 window.QWCapture, node 에서는 require('./capture.js') 로 씁니다.
   기준 문서: docs/01_프로젝트_기획서.md 「방향 수정(2026-10-27)」

   흐름: 업무 하나(work) 고르기/만들기
        → 자료 넣기(materials: 붙여 넣기 · txt · docx · xlsx, 사진 · 캡처 images)   — id M1 · M2 … / P1 · P2 …
        → 담당자에게 질문하기(questions · answers, 말로 한 설명 transcripts)           — id Q1 … / T1 …
        → 초안 프롬프트(draftPrompt) → 회사가 허용한 AI → 답(JSON) 붙여 넣기 → parseDraftAnswer(검사 · 근거 표시)
        → 판(versions) 저장 · 단계마다 「담당자 확인」 → 내보내기(Word 업무 방법서 · Excel 단계표 · 인수인계 체크리스트 · 1장 요약)
   근거 표시: 단계마다 AI 가 적은 refs(M · P = 문서, Q · T = 담당자 답변)를 실제 있는 id 로만 인정하고,
             인정되는 근거가 없으면 「AI 추정」. AI 가 「추정」이라 적은 칸(guess)도 따로 보입니다. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./logic.js'));
  else root.QWCapture = factory(root.QWLogic);
})(typeof self !== 'undefined' ? self : this, function (L) {
  'use strict';
  /* 판 — logic.js · app.js 와 같아야 합니다(scripts/bump-version.mjs 가 함께 올림) */
  var VERSION = '2026-11-11.6';
  var SCHEMA = 2;

  function str(v) { return v == null ? '' : String(v).trim(); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  function uniq(a) { var o = []; a.forEach(function (x) { if (o.indexOf(x) < 0) o.push(x); }); return o; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function nextNo(prefix, list) {
    var n = 0; list.forEach(function (x) { var m = new RegExp('^' + prefix + '(\\d+)$').exec(x.id || ''); if (m) n = Math.max(n, Number(m[1])); });
    return prefix + (n + 1);
  }

  /* ── 1. 자료 종류 · 질문 분류 ───────────────────────────── */
  var MATERIAL_KINDS = ['절차서', '지침서', '체크리스트', '기록 양식', '시스템 입력 항목', '업무 순서 자료', '기타'];
  var CATS = [
    { id: 'order', label: '순서 확인' },
    { id: 'criteria', label: '판단 기준 · 수치' },
    { id: 'exception', label: '예외 상황' },
    { id: 'mistake', label: '자주 하는 실수' },
    { id: 'caution', label: '주의사항' },
    { id: 'forms', label: '양식 · 시스템 화면' },
    { id: 'time', label: '소요시간' },
    { id: 'handover', label: '넘기는 곳' },
    { id: 'other', label: '기타' }
  ];
  function catLabel(id) { var c = CATS.filter(function (x) { return x.id === id; })[0]; return c ? c.label : '기타'; }
  /* 「판단기준」「수치」「예외」「실수」 같은 글로 분류 찾기 */
  function catId(text) {
    var s = str(text).replace(/\s/g, '');
    if (!s) return 'other';
    var direct = CATS.filter(function (c) { return c.id === s || c.label.replace(/\s/g, '') === s; })[0];
    if (direct) return direct.id;
    if (/순서|절차|흐름|시작/.test(s)) return 'order';
    if (/기준|수치|판단|한도|판정/.test(s)) return 'criteria';
    if (/예외|이상|특수|비상/.test(s)) return 'exception';
    if (/실수|오류|착오/.test(s)) return 'mistake';
    if (/주의|유의|안전|금지/.test(s)) return 'caution';
    if (/양식|시스템|화면|서식|프로그램|기록/.test(s)) return 'forms';
    if (/시간|소요|기간|기한/.test(s)) return 'time';
    if (/넘기|인계|전달|보고|다음부서|누구/.test(s)) return 'handover';
    return 'other';
  }
  /* 기본 질문지 — 담당자에게 그대로 읽어 주거나 인쇄해 건넬 수 있게 존댓말로 */
  var TEMPLATE = [
    ['order', '이 업무는 무엇을 보고 시작하나요? 시작 신호(요청 · 알림 · 시스템 화면 · 검사 결과 등)를 알려 주세요.'],
    ['order', '처음부터 끝까지 실제로 하는 순서를 단계별로 말씀해 주세요. 문서에 적힌 순서와 다르게 하는 부분이 있으면 함께 알려 주세요.'],
    ['criteria', '단계마다 「된다 / 안 된다」를 무엇으로 판단하나요? 기준 수치 · 한도 · 등급이 있으면 알려 주세요.'],
    ['criteria', '문서에는 없지만 실제로 보는 기준(눈으로 비교하는 것 · 경험으로 아는 것)이 있나요?'],
    ['exception', '평소와 다르게 처리하는 예외 상황은 언제인가요? 그때는 어떻게 하나요?'],
    ['exception', '판단이 애매할 때는 누구에게 묻거나 무엇을 확인하나요?'],
    ['mistake', '신규 담당자가 자주 하는 실수는 무엇이고, 미리 막으려면 어떻게 하면 되나요?'],
    ['caution', '꼭 지켜야 하는 주의사항(고객 · 안전 · 기록 보관 · 승인 등)은 무엇인가요?'],
    ['forms', '쓰는 양식 · 체크리스트 · 기록 파일의 이름과 어디에 있는지 알려 주세요.'],
    ['forms', '입력하는 시스템 화면과 항목(메뉴 위치 · 꼭 채우는 칸 · 헷갈리는 코드)을 알려 주세요. 캡처가 있으면 함께 붙여 주세요.'],
    ['time', '한 번 하는 데 보통 얼마나 걸리나요? 오래 걸리거나 기다리는 단계는 어디인가요?'],
    ['handover', '결과를 누구(부서 · 직책)에게, 어떤 방법으로 넘기나요? 넘기기 전에 확인할 것은 무엇인가요?'],
    ['handover', '이 업무를 대신 맡을 사람이 첫 주에 꼭 알아야 할 한 가지는 무엇인가요?']
  ];
  function templateQuestions(existing) {
    var list = arr(existing).slice(), have = list.map(function (q) { return q.text; });
    TEMPLATE.forEach(function (t) {
      if (have.indexOf(t[1]) >= 0) return;
      list.push({ id: nextNo('Q', list), cat: t[0], text: t[1], src: '기본', why: '' });
    });
    return list;
  }

  /* ── 2. 업무(work) 저장 형식 · 옛 자료 옮기기 ───────────────── */
  function emptyWork(name, opts) {
    opts = opts || {};
    return { id: opts.id || 'W1', name: str(name), taskId: str(opts.taskId), owner: str(opts.owner), created: str(opts.today), updated: str(opts.today),
      materials: [], images: [], questions: [], answers: {}, transcripts: [], versions: [], current: 0 };
  }
  function cleanMaterial(m) {
    m = obj(m);
    var kind = MATERIAL_KINDS.indexOf(str(m.kind)) >= 0 ? str(m.kind) : '기타';
    var text = m.text == null ? '' : String(m.text).replace(/\r\n?/g, '\n');
    return { id: str(m.id), name: str(m.name) || '이름 없는 자료', kind: kind, text: text, from: str(m.from), at: str(m.at) };
  }
  function cleanImage(p) {
    p = obj(p);
    return { id: str(p.id), key: str(p.key), name: str(p.name), caption: str(p.caption), w: Number(p.w) || 0, h: Number(p.h) || 0, at: str(p.at) };
  }
  var STEP_FIELDS = ['title', 'who', 'input', 'how', 'criteria', 'exceptions', 'cautions', 'forms', 'time'];
  var FIELD_LABEL = { title: '단계명', who: '누가', input: '받는 것 · 입력', how: '하는 방법', criteria: '판단 기준 · 수치', exceptions: '예외 상황', cautions: '주의사항 · 자주 하는 실수', forms: '양식 · 시스템 화면', time: '소요시간' };
  function cleanDraftStep(s, i) {
    s = obj(s);
    var o = { no: i + 1 };
    STEP_FIELDS.forEach(function (k) { o[k] = str(s[k]); });
    o.refs = uniq(arr(s.refs).map(str).filter(Boolean));
    o.guess = uniq(arr(s.guess).map(str).filter(function (k) { return STEP_FIELDS.indexOf(k) >= 0; }));
    o.basis = ['doc', 'person', 'both', 'guess'].indexOf(s.basis) >= 0 ? s.basis : 'guess';
    o.aiGuess = !!s.aiGuess;
    o.edited = !!s.edited;
    o.confirmed = !!s.confirmed;
    o.confirmedAt = o.confirmed ? str(s.confirmedAt) : '';
    return o;
  }
  function cleanDraft(d) {
    d = obj(d);
    var steps = arr(d.steps).map(cleanDraftStep).filter(function (s) { return s.title; });
    steps.forEach(function (s, i) { s.no = i + 1; });
    var flow = arr(d.flow).map(function (f) { return L.cleanStep(f); }).filter(function (f) { return f.name || f.question; });
    return { title: str(d.title), summary: str(d.summary), steps: steps, flow: flow, flowFallback: !!d.flowFallback,
      glossary: arr(d.glossary).map(function (g) { g = obj(g); return { term: str(g.term), meaning: str(g.meaning) }; }).filter(function (g) { return g.term; }),
      open_questions: arr(d.open_questions).map(str).filter(Boolean) };
  }
  function cleanWork(w, i) {
    w = obj(w);
    var o = emptyWork(w.name, { id: str(w.id) || 'W' + (i + 1), taskId: w.taskId, owner: w.owner, today: w.created });
    o.updated = str(w.updated) || o.created;
    o.materials = arr(w.materials).map(cleanMaterial).filter(function (m) { return m.id; });
    o.images = arr(w.images).map(cleanImage).filter(function (p) { return p.id && p.key; });
    o.questions = arr(w.questions).map(function (q) { q = obj(q); return { id: str(q.id), cat: CATS.some(function (c) { return c.id === q.cat; }) ? q.cat : catId(q.cat), text: str(q.text), src: str(q.src) || '직접', why: str(q.why) }; })
      .filter(function (q) { return q.id && q.text; });
    var qids = o.questions.map(function (q) { return q.id; });
    Object.keys(obj(w.answers)).forEach(function (k) {
      var a = w.answers[k];
      if (qids.indexOf(k) < 0) return;
      if (typeof a === 'string') a = { text: a };
      a = obj(a);
      if (str(a.text)) o.answers[k] = { text: String(a.text).replace(/\r\n?/g, '\n').trim(), at: str(a.at) };
    });
    o.transcripts = arr(w.transcripts).map(function (t) { t = obj(t); return { id: str(t.id), who: str(t.who), text: String(t.text == null ? '' : t.text).trim(), at: str(t.at) }; })
      .filter(function (t) { return t.id && t.text; });
    o.versions = arr(w.versions).map(function (v, k) { v = obj(v); return { v: Number(v.v) || k + 1, at: str(v.at), note: str(v.note), draft: cleanDraft(v.draft) }; })
      .filter(function (v) { return v.draft.steps.length; });
    var cur = Number(w.current);
    o.current = o.versions.some(function (v) { return v.v === cur; }) ? cur : (o.versions.length ? o.versions[o.versions.length - 1].v : 0);
    return o.name ? o : null;
  }
  function cleanWorks(list) {
    var out = [], ids = [];
    arr(list).forEach(function (w, i) {
      var c = cleanWork(w, i); if (!c) return;
      if (ids.indexOf(c.id) >= 0) c.id = nextNo('W', out);
      ids.push(c.id); out.push(c);
    });
    return out;
  }
  /* 저장된 자료(옛 판 포함) → 지금 판. 옛 판(schema 1)의 업무 목록 · 문서 · 흐름도 · 교육 자료는 그대로 두고 works 를 더합니다.
     notice: '' | 'upgraded'(옛 판 자료를 옮김) — 화면이 한 번 안내합니다. 망가진 값은 버리고 앱은 계속 돕니다. */
  function migrate(raw) {
    var had = raw && typeof raw === 'object' && !Array.isArray(raw);
    var db = L.restoreDb(had ? raw : null);
    db.schema = SCHEMA;
    db.works = cleanWorks(had ? raw.works : []);
    db.curWork = had && db.works.some(function (w) { return w.id === raw.curWork; }) ? raw.curWork : (db.works[0] ? db.works[0].id : '');
    db.sampleWorks = !!(had && raw.sampleWorks) && !db.sample; // 업무 목록은 바꿨지만 업무 자료화에 가상 샘플이 남아 있음
    var old = had ? Number(raw.schema) || 1 : SCHEMA;
    var hadData = had && (arr(raw.tasks).length || arr(raw.docs).length || Object.keys(obj(raw.flows)).length);
    return { db: db, notice: had && old < SCHEMA && hadData ? 'upgraded' : '' };
  }
  function emptyDb() { var d = L.emptyDb(); d.schema = SCHEMA; d.works = []; d.curWork = ''; d.sampleWorks = false; return d; }

  /* ── 3. 파일에서 글자 꺼내기 ─────────────────────────────── */
  function fileKind(name) {
    var n = str(name).toLowerCase();
    if (/\.(txt|md|csv|tsv|log)$/.test(n)) return 'text';
    if (/\.docx$/.test(n)) return 'docx';
    if (/\.(xlsx|xlsm|xls)$/.test(n)) return 'xlsx';
    if (/\.pdf$/.test(n)) return 'pdf';
    if (/\.(png|jpe?g|gif|webp|bmp)$/.test(n)) return 'image';
    if (/\.(hwp|hwpx|doc|ppt|pptx)$/.test(n)) return 'unsupported';
    return 'unknown';
  }
  function decodeXml(s) {
    return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(Number(n)); })
      .replace(/&#x([0-9a-f]+);/gi, function (_, n) { return String.fromCharCode(parseInt(n, 16)); }).replace(/&amp;/g, '&');
  }
  /* word/document.xml → 글. 문단마다 줄, 표 칸은 「 | 」로 잇고 표 줄마다 줄 바꿈 */
  function docxXmlToText(xml) {
    var body = String(xml || '');
    var lines = [];
    body.replace(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g, function (blk) {
      if (/^<w:tbl>/.test(blk)) {
        blk.replace(/<w:tr[ >][\s\S]*?<\/w:tr>/g, function (tr) {
          var cells = [];
          tr.replace(/<w:tc[ >][\s\S]*?<\/w:tc>/g, function (tc) { cells.push(paraText(tc).join(' ').trim()); return ''; });
          if (cells.some(Boolean)) lines.push(cells.join(' | '));
          return '';
        });
      } else lines.push(paraText(blk).join(''));
      return '';
    });
    function paraText(x) {
      var out = [];
      x.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, function (p) {
        var t = '';
        p.replace(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g, function (m, tx) { t += tx != null ? decodeXml(tx) : m === '<w:tab/>' ? '\t' : '\n'; return ''; });
        out.push(t);
        return '';
      });
      if (!out.length) { var t2 = ''; x.replace(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g, function (m, tx) { t2 += decodeXml(tx); return ''; }); out.push(t2); }
      return out;
    }
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  /* docx(zip) 바이트 → 글. CFB = SheetJS 안에 든 zip 읽개(XLSX.CFB) */
  function docxText(bytes, CFB) {
    var cfb = CFB.read(bytes, { type: 'array' });
    var e = CFB.find(cfb, 'word/document.xml') || CFB.find(cfb, '/word/document.xml');
    if (!e || !e.content) throw new Error('Word 문서 안에서 본문(word/document.xml)을 찾지 못했습니다.');
    var c = e.content, xml;
    if (typeof c === 'string') xml = c;
    else xml = new TextDecoder('utf-8').decode(c instanceof Uint8Array ? c : new Uint8Array(c));
    return docxXmlToText(xml);
  }
  /* 엑셀 → 글. 시트마다 「[시트: 이름]」 다음에 줄마다 칸을 「 | 」로 */
  function xlsxText(wb, XLSX) {
    return wb.SheetNames.map(function (n) {
      var aoa = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '' });
      var rows = aoa.map(function (r) { return r.map(function (c) { return str(c); }); }).filter(function (r) { return r.some(Boolean); })
        .map(function (r) { while (r.length && !r[r.length - 1]) r.pop(); return r.join(' | '); });
      return rows.length ? '[시트: ' + n + ']\n' + rows.join('\n') : '';
    }).filter(Boolean).join('\n\n');
  }
  function guessMaterialKind(name, text) {
    var s = str(name) + ' ' + str(text).slice(0, 300);
    if (/체크\s*리스트|점검표|확인표/.test(s)) return '체크리스트';
    if (/시스템|입력\s*항목|화면|메뉴/.test(s)) return '시스템 입력 항목';
    if (/양식|서식|대장|보고서\s*양식/.test(s)) return '기록 양식';
    if (/절차서|규정|매뉴얼/.test(s)) return '절차서';
    if (/지침|가이드|업무\s*방법/.test(s)) return '지침서';
    if (/순서|흐름|플로우|flow/i.test(s)) return '업무 순서 자료';
    return '기타';
  }
  function addMaterial(work, m, today) {
    var c = cleanMaterial(Object.assign({}, m, { id: nextNo('M', work.materials), at: today }));
    if (!m.kind) c.kind = guessMaterialKind(c.name, c.text);
    work.materials.push(c); work.updated = str(today) || work.updated;
    return c;
  }
  /* 전에 만든 흐름도(단계 표) → 「업무 순서 자료」 글 — 이미 만든 흐름도를 자료로 다시 씁니다 */
  function flowToMaterialText(task, flow) {
    var steps = arr(flow && flow.steps);
    var lines = ['[전에 만든 흐름도 단계 표] ' + str(task && task.name)];
    steps.forEach(function (s, i) {
      var t = (i + 1) + '. ' + (s.name || s.question) + (s.role ? ' (담당: ' + s.role + ')' : '');
      if (s.inputs) t += ' · 입력: ' + s.inputs;
      if (s.outputs) t += ' · 산출: ' + s.outputs;
      if (s.question) t += ' · 판단: ' + s.question + ' 예→' + (s.yes || '다음') + ' / 아니오→' + (s.no || '?');
      lines.push(t);
    });
    if (flow && flow.source) lines.push('', '[근거 문단]', flow.source);
    return lines.join('\n');
  }

  /* ── 4. 인터뷰 ───────────────────────────────────────────── */
  function answered(work) { return work.questions.filter(function (q) { return work.answers[q.id] && str(work.answers[q.id].text); }); }
  function progress(work) {
    var a = answered(work).length, v = currentVersion(work), d = v && v.draft;
    return { materials: work.materials.length, images: work.images.length, questions: work.questions.length, answered: a,
      transcripts: work.transcripts.length, versions: work.versions.length, steps: d ? d.steps.length : 0,
      confirmed: d ? d.steps.filter(function (s) { return s.confirmed; }).length : 0,
      guess: d ? d.steps.filter(function (s) { return s.basis === 'guess'; }).length : 0 };
  }
  function setAnswer(work, qid, text, today) {
    var t = String(text == null ? '' : text).replace(/\r\n?/g, '\n').trim();
    if (!t) delete work.answers[qid]; else work.answers[qid] = { text: t, at: str(today) };
    work.updated = str(today) || work.updated;
  }
  function addTranscript(work, text, who, today) {
    var t = { id: nextNo('T', work.transcripts), who: str(who), text: String(text == null ? '' : text).trim(), at: str(today) };
    if (!t.text) return null;
    work.transcripts.push(t); work.updated = str(today) || work.updated;
    return t;
  }
  function addQuestions(work, list, src) {
    var have = work.questions.map(function (q) { return q.text.replace(/\s/g, ''); }), added = [];
    arr(list).forEach(function (q) {
      var text = str(q.text || q.q || q);
      if (!text || have.indexOf(text.replace(/\s/g, '')) >= 0) return;
      var n = { id: nextNo('Q', work.questions), cat: q.cat && CATS.some(function (c) { return c.id === q.cat; }) ? q.cat : catId(q.cat || q.category || text), text: text, src: src || '직접', why: str(q.why) };
      work.questions.push(n); have.push(text.replace(/\s/g, '')); added.push(n);
    });
    return added;
  }

  /* ── 5. 프롬프트 ─────────────────────────────────────────── */
  var LIMIT = { perMaterial: 6000, materials: 24000, perAnswer: 2000, transcripts: 8000 };
  function clip(text, n) { text = String(text || ''); return text.length > n ? text.slice(0, n) + '\n…(이하 ' + (text.length - n) + '자 생략 — 필요한 부분만 남겨 다시 넣어 주세요)' : text; }
  function materialsBlock(work) {
    var used = 0, out = [];
    work.materials.forEach(function (m) {
      var room = Math.max(0, Math.min(LIMIT.perMaterial, LIMIT.materials - used));
      var body = room ? clip(m.text, room) : '(길이 한도로 생략)';
      used += Math.min(m.text.length, room);
      out.push('[' + m.id + '] ' + m.kind + ' · ' + m.name + '\n' + body);
    });
    work.images.forEach(function (p) { out.push('[' + p.id + '] 사진 · 캡처 · ' + (p.caption || p.name) + ' (그림 자체는 보내지 않음 — 설명만)'); });
    return out.join('\n\n');
  }
  function questionPrompt(work, task) {
    var p = [];
    p.push('너는 제조업 품질보증팀의 업무 자료를 정리하는 보조야.');
    p.push('아래 [업무 자료]를 읽고, 담당자에게 직접 물어야 할 질문을 10~15개 뽑아줘.');
    p.push('');
    p.push('[업무] ' + work.name + (task ? ' · 주기 ' + (task.cycle || '미상') + ' · 직책 ' + (task.role || '미상') : '') + (work.owner ? ' · 담당자 ' + work.owner : ''));
    p.push('');
    p.push('[질문을 뽑는 기준]');
    p.push('- 자료에 없거나 애매해서 문서만 보고는 일을 할 수 없는 곳을 먼저 골라줘.');
    p.push('- 문서와 실제 업무가 다를 수 있는 곳: 실제 순서, 판단 기준 · 수치, 예외 상황, 자주 하는 실수, 주의사항, 양식 · 시스템 화면, 소요시간, 넘기는 곳.');
    p.push('- 질문은 담당자에게 그대로 읽어 줄 수 있게 존댓말 한 문장으로 써줘(예: 「합격 판정은 어떤 수치로 하나요?」).');
    p.push('- why 에는 그 질문이 필요한 이유를 자료 id(M1 등)와 함께 짧게 적어줘.');
    if (work.questions.length) {
      p.push('- 아래 [이미 있는 질문]과 겹치는 질문은 빼줘.');
      p.push('');
      p.push('[이미 있는 질문]');
      work.questions.forEach(function (q) { p.push('- ' + q.text); });
    }
    p.push('');
    p.push('[답 형식] 다른 말 없이 JSON 하나만:');
    p.push('{"questions":[{"cat":"순서 확인|판단 기준 · 수치|예외 상황|자주 하는 실수|주의사항|양식 · 시스템 화면|소요시간|넘기는 곳","q":"질문","why":"M1 의 4.3 에 기준 수치가 없음"}]}');
    p.push('');
    p.push('[업무 자료]');
    p.push(work.materials.length || work.images.length ? materialsBlock(work) : '(아직 자료가 없습니다 — 업무 이름만으로 일반적인 질문을 뽑아줘)');
    return p.join('\n');
  }
  var DRAFT_SCHEMA = '{"title":"업무 이름","summary":"이 업무가 무엇인지 두 문장",\n' +
    ' "steps":[{"no":1,"title":"단계명(20자 이내)","who":"담당 직책","input":"받는 것 · 시작 신호","how":"하는 방법(순서대로)","criteria":"판단 기준 · 수치","exceptions":"예외 상황과 처리","cautions":"주의사항 · 자주 하는 실수","forms":"양식 · 시스템 화면(메뉴 위치)","time":"소요시간","refs":["M1","Q3"],"guess":["time"]}],\n' +
    ' "flow":[{"step":1,"name":"흐름도 칸 이름","who":"담당","question":"판단이면 ~인가?","yes":"예일 때 갈 번호","no":"아니오일 때 갈 번호 또는 끝","next":"다음 번호(비우면 다음 순서)"}],\n' +
    ' "glossary":[{"term":"용어","meaning":"뜻"}],\n' +
    ' "open_questions":["담당자에게 더 물어야 할 것"]}';
  function draftPrompt(work, task) {
    var p = [];
    p.push('너는 제조업 품질보증팀의 업무 경험을 신규 담당자 · 업무 대체자가 읽을 「업무 프로세스와 단계별 업무 방법」 자료 초안으로 정리하는 보조야.');
    p.push('아래 [업무 자료]와 [담당자 답변] · [담당자 설명]만 써서 초안을 만들어줘.');
    p.push('');
    p.push('[업무] ' + work.name + (task ? ' · 주기 ' + (task.cycle || '미상') + ' · 직책 ' + (task.role || '미상') : '') + (work.owner ? ' · 담당자 ' + work.owner : ''));
    p.push('');
    p.push('[규칙]');
    p.push('- 단계마다 refs 에 근거 id 를 적어줘: 자료는 M1 · P1, 담당자 답변은 Q1, 담당자 설명은 T1. 근거가 된 것만 적어줘.');
    p.push('- 근거 없이 일반 지식으로 채운 칸은 그 칸 이름(time 등)을 guess 에 넣어줘. 근거가 하나도 없는 단계는 refs 를 빈 배열로 둬.');
    p.push('- 숫자 · 기준값 · 조항 번호 · 문서 번호 · 시스템 메뉴는 자료나 답변에 있는 것만 써줘. 없으면 지어내지 말고 open_questions 에 적어줘.');
    p.push('- 문서와 담당자 답변이 다르면 실제로 하는 쪽(담당자 답변)을 단계에 쓰고, 다른 점을 open_questions 에 「문서 M1 은 …, 담당자는 …」으로 적어줘.');
    p.push('- how 는 처음 하는 사람이 따라 할 수 있게 짧은 문장 여러 개로, 요청형이 아닌 설명형(「~합니다」)으로 써줘.');
    p.push('- flow 는 흐름도용이야. 판단(예/아니오로 갈리는 곳)은 question 에 「~인가?」로 쓰고 yes · no 에 갈 flow 번호(step)나 「끝」을 적어줘. 판단이 없으면 steps 순서 그대로 써도 돼.');
    p.push('- 다른 말 없이 아래 형식의 JSON 하나만 답해줘(코드 블록 없이).');
    p.push('');
    p.push('[답 형식]');
    p.push(DRAFT_SCHEMA);
    p.push('');
    p.push('[업무 자료]');
    p.push(work.materials.length || work.images.length ? materialsBlock(work) : '(자료 없음)');
    p.push('');
    p.push('[담당자 답변]');
    var qa = answered(work);
    p.push(qa.length ? qa.map(function (q) { return '[' + q.id + '] (' + catLabel(q.cat) + ') ' + q.text + '\n답: ' + clip(work.answers[q.id].text, LIMIT.perAnswer); }).join('\n\n') : '(아직 답변 없음)');
    var open = work.questions.filter(function (q) { return !(work.answers[q.id] && work.answers[q.id].text); });
    if (open.length) {
      p.push('');
      p.push('[아직 답을 못 받은 질문 — 이 내용은 지어내지 말고 open_questions 에 남겨줘]');
      open.forEach(function (q) { p.push('[' + q.id + '] ' + q.text); });
    }
    if (work.transcripts.length) {
      p.push('');
      p.push('[담당자 설명 — 말로 한 것을 받아 적음]');
      var used = 0;
      work.transcripts.forEach(function (t) { var room = Math.max(0, LIMIT.transcripts - used); p.push('[' + t.id + ']' + (t.who ? ' ' + t.who : '') + '\n' + (room ? clip(t.text, room) : '(길이 한도로 생략)')); used += Math.min(t.text.length, room); });
    }
    return p.join('\n');
  }

  /* ── 6. AI 답 읽기 · 검사 · 근거 표시 ─────────────────────── */
  /* 답 글에서 JSON 꺼내기 — 코드 블록 · 앞뒤 설명 · 끝 쉼표 · 둥근 따옴표를 견딤 */
  function extractJson(text) {
    var s = str(text);
    if (!s) return { error: '붙여 넣은 답이 비어 있습니다.' };
    var fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
    if (fence) s = fence[1].trim();
    var a = s.search(/[{[]/);
    if (a < 0) return { error: 'JSON({ … })을 찾지 못했습니다. AI 에게 「JSON 하나만 답해줘」라고 다시 요청해 주세요.' };
    var open = s[a], close = open === '{' ? '}' : ']', b = s.lastIndexOf(close);
    if (b <= a) return { error: 'JSON 이 중간에 끊겼습니다(닫는 ' + close + ' 가 없음). 답이 길어 잘렸으면 「이어서 써줘」로 나머지를 받아 붙여 주세요.' };
    var body = s.slice(a, b + 1);
    var tries = [body, body.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/,\s*([}\]])/g, '$1')];
    for (var i = 0; i < tries.length; i++) {
      try { return { value: JSON.parse(tries[i]), repaired: i > 0 }; } catch (e) { if (i === tries.length - 1) return { error: 'JSON 으로 읽지 못했습니다: ' + e.message + ' — 답 전체를 빠짐없이 붙여 넣었는지 확인해 주세요.' }; }
    }
  }
  function asText(v) {
    if (v == null) return '';
    if (Array.isArray(v)) return v.map(asText).filter(Boolean).join('\n');
    if (typeof v === 'object') return Object.keys(v).map(function (k) { return k + ': ' + asText(v[k]); }).join('\n');
    return String(v).trim();
  }
  var FIELD_ALIAS = { title: ['title', 'name', 'step_name', '단계명'], who: ['who', 'role', 'owner', '담당'], input: ['input', 'inputs', 'trigger', '입력'], how: ['how', 'method', 'detail', 'details', '방법'],
    criteria: ['criteria', 'criterion', '기준'], exceptions: ['exceptions', 'exception', '예외'], cautions: ['cautions', 'caution', 'notes', 'mistakes', '주의'], forms: ['forms', 'form', 'system', '양식'], time: ['time', 'duration', '소요시간'] };
  function pick(o, k) { var a = FIELD_ALIAS[k]; for (var i = 0; i < a.length; i++) if (o[a[i]] != null) return asText(o[a[i]]); return ''; }
  function validIds(work) {
    return work.materials.map(function (m) { return m.id; }).concat(work.images.map(function (p) { return p.id; }), work.questions.map(function (q) { return q.id; }), work.transcripts.map(function (t) { return t.id; }));
  }
  /* 근거 종류: M · P = 문서(자료), Q · T = 담당자. 실제 있는 id 만 셈 */
  function basisOf(refs) {
    var doc = refs.some(function (r) { return /^[MP]\d+$/.test(r); }), person = refs.some(function (r) { return /^[QT]\d+$/.test(r); });
    return doc && person ? 'both' : doc ? 'doc' : person ? 'person' : 'guess';
  }
  function flowFromSteps(steps) { return steps.map(function (s) { return L.cleanStep({ name: s.title, role: s.who }); }); }
  /* AI 가 뽑은 질문 — {"questions":[{cat,q,why}]} 또는 「1. [예외 상황] 질문」 줄 */
  function parseQuestionsAnswer(text) {
    var out = [], warnings = [], j = extractJson(text);
    if (!j.error) {
      var list = Array.isArray(j.value) ? j.value : arr(obj(j.value).questions);
      list.forEach(function (q) {
        if (typeof q === 'string') q = { q: q };
        q = obj(q);
        var t = asText(q.q || q.question || q.text || q['질문']);
        if (t) out.push({ cat: catId(q.cat || q.category || q['분류'] || t), text: t, why: asText(q.why || q.reason || q['이유']) });
      });
    }
    if (!out.length) {
      str(text).split(/\r?\n/).forEach(function (ln) {
        var m = /^\s*(?:\d+[.)]|[-*•])\s*(?:\[([^\]]+)\]|\(([^)]+)\))?\s*(.+?)\s*$/.exec(ln);
        if (!m || m[3].length < 6) return;
        out.push({ cat: catId(m[1] || m[2] || m[3]), text: m[3].replace(/\*\*/g, ''), why: '' });
      });
      if (out.length) warnings.push('JSON 이 아니어서 번호 줄로 읽었습니다.');
    }
    if (!out.length) warnings.push('읽을 질문이 없습니다. AI 답이 {"questions":[…]} 모양인지 확인해 주세요.');
    return { questions: out, warnings: warnings };
  }
  var BASIS_LABEL = { doc: '문서', person: '담당자 답변', both: '문서 + 담당자', guess: 'AI 추정' };
  function parseDraftAnswer(text, work) {
    var errors = [], warnings = [];
    var j = extractJson(text);
    if (j.error) return { ok: false, errors: [j.error], warnings: [], draft: null };
    if (j.repaired) warnings.push('JSON 의 끝 쉼표 · 둥근 따옴표를 고쳐 읽었습니다.');
    var o = Array.isArray(j.value) ? { steps: j.value } : obj(j.value);
    var rawSteps = arr(o.steps || o['단계'] || o.process);
    if (!rawSteps.length) return { ok: false, errors: ['steps(단계 목록)가 없습니다. 답이 {"steps":[…]} 모양인지 확인해 주세요.'], warnings: warnings, draft: null };
    var ids = validIds(work), steps = [], numMap = {};
    rawSteps.forEach(function (rs, i) {
      if (typeof rs === 'string') rs = { title: rs };
      rs = obj(rs);
      var s = {};
      STEP_FIELDS.forEach(function (k) { s[k] = pick(rs, k); });
      if (!s.title) { warnings.push((i + 1) + '번째 단계에 단계명(title)이 없어 뺐습니다.'); return; }
      var given = Number(rs.no);
      if (given) numMap[given] = steps.length + 1;
      if (given && given !== steps.length + 1) warnings.push('단계 번호 ' + given + ' → ' + (steps.length + 1) + ' (순서대로 다시 매김)');
      var refsRaw = Array.isArray(rs.refs) ? rs.refs.map(str) : str(rs.refs || rs.sources || rs['근거']).split(/[\s,·/]+/);
      // 글 속 「(근거: M1, Q3)」도 줍기
      STEP_FIELDS.forEach(function (k) { (s[k].match(/\b[MPQT]\d{1,3}\b/g) || []).forEach(function (x) { refsRaw.push(x); }); });
      refsRaw = uniq(refsRaw.map(function (r) { return r.toUpperCase().replace(/[^A-Z0-9]/g, ''); }).filter(Boolean));
      var good = refsRaw.filter(function (r) { return ids.indexOf(r) >= 0; }), bad = refsRaw.filter(function (r) { return ids.indexOf(r) < 0 && /^[MPQT]\d+$/.test(r); });
      if (bad.length) warnings.push((steps.length + 1) + '단계 「' + s.title + '」 근거 ' + bad.join(', ') + ' 은(는) 없는 자료 · 질문이라 뺐습니다.');
      s.refs = good;
      s.guess = uniq(arr(rs.guess).map(str).map(function (k) { var hit = STEP_FIELDS.filter(function (f) { return FIELD_ALIAS[f].indexOf(k) >= 0; })[0]; return hit || k; }).filter(function (k) { return STEP_FIELDS.indexOf(k) >= 0 && s[k]; }));
      s.basis = basisOf(good);
      s.aiGuess = /추정|guess/i.test(str(rs.basis));
      if (s.basis !== 'guess' && s.aiGuess && !s.guess.length) warnings.push((steps.length + 1) + '단계 「' + s.title + '」 — AI 가 「추정」이라 적었습니다. 근거와 함께 확인해 주세요.');
      steps.push(cleanDraftStep(s, steps.length));
    });
    if (!steps.length) errors.push('단계명이 있는 단계가 하나도 없습니다.');
    // 흐름도 — AI 의 flow 가 있으면 그것을, 없거나 고리 · 없는 번호가 있으면 단계 순서대로
    var flow = [], flowFallback = false, rawFlow = arr(o.flow);
    if (rawFlow.length) {
      var fmap = {};
      rawFlow.forEach(function (f, i) { f = obj(f); var n = Number(f.step || f.no_ || f.order || (typeof f.no === 'number' && !f.question ? f.no : 0)); if (n) fmap[n] = i + 1; });
      flow = rawFlow.map(function (f) {
        f = obj(f);
        var q = asText(f.question || f.decision);
        var o2 = { name: asText(f.name || f.title || (q ? '' : '')), role: asText(f.who || f.role), inputs: '', outputs: '', question: q,
          yes: asText(f.yes != null ? f.yes : f.if_yes), no: asText(f.if_no != null ? f.if_no : (q ? f.no : '')), next: asText(f.next) };
        ['yes', 'no', 'next'].forEach(function (k) { var r = L.refValue(o2[k]); if (typeof r === 'number' && fmap[r]) o2[k] = String(fmap[r]); });
        return L.cleanStep(o2);
      }).filter(function (f) { return f.name || f.question; });
      var vf = L.validateFlow(flow);
      if (vf.errors.length) { warnings.push('흐름도(flow)에 고칠 곳이 있어 단계 순서대로 그렸습니다: ' + vf.errors.slice(0, 2).join(' ')); flow = []; }
    }
    if (!flow.length) { flowFallback = true; flow = flowFromSteps(steps); }
    var glossary = [];
    if (Array.isArray(o.glossary)) glossary = o.glossary.map(function (g) { return typeof g === 'string' ? { term: g.split(/[:：]/)[0], meaning: g.split(/[:：]/).slice(1).join(':') } : { term: asText(g.term || g['용어']), meaning: asText(g.meaning || g['뜻']) }; });
    else if (o.glossary && typeof o.glossary === 'object') glossary = Object.keys(o.glossary).map(function (k) { return { term: k, meaning: asText(o.glossary[k]) }; });
    var oq = Array.isArray(o.open_questions) ? o.open_questions.map(asText) : asText(o.open_questions).split('\n');
    var draft = cleanDraft({ title: asText(o.title) || work.name, summary: asText(o.summary), steps: steps, flow: flow, flowFallback: flowFallback, glossary: glossary, open_questions: oq });
    var g = steps.filter(function (s) { return s.basis === 'guess'; }).length;
    if (g) warnings.push('근거가 없는 단계 ' + g + '개는 「AI 추정」으로 표시합니다. 담당자에게 확인해 주세요.');
    return { ok: !errors.length, errors: errors, warnings: warnings, draft: errors.length ? null : draft };
  }

  /* ── 7. 판(버전) · 담당자 확인 ────────────────────────────── */
  function currentVersion(work) { return work.versions.filter(function (v) { return v.v === work.current; })[0] || work.versions[work.versions.length - 1] || null; }
  function sameStep(a, b) { return a.title === b.title && a.how === b.how && a.criteria === b.criteria && a.who === b.who; }
  /* 새 판 저장 — 바뀌지 않은 단계(단계명 · 방법 · 기준 · 담당이 같음)는 담당자 확인을 이어받습니다 */
  function addVersion(work, draft, note, today) {
    var prev = currentVersion(work), d = cleanDraft(draft), kept = 0;
    if (prev) d.steps.forEach(function (s) {
      var old = prev.draft.steps.filter(function (x) { return sameStep(x, s); })[0];
      if (old && old.confirmed) { s.confirmed = true; s.confirmedAt = old.confirmedAt; kept++; }
    });
    var v = { v: work.versions.reduce(function (m, x) { return Math.max(m, x.v); }, 0) + 1, at: str(today), note: str(note), draft: d };
    work.versions.push(v); work.current = v.v; work.updated = str(today) || work.updated;
    return { version: v, keptConfirm: kept };
  }
  function setConfirmed(work, stepIndex, on, today) {
    var v = currentVersion(work); if (!v || !v.draft.steps[stepIndex]) return;
    var s = v.draft.steps[stepIndex]; s.confirmed = !!on; s.confirmedAt = on ? str(today) : '';
  }
  /* 사람이 단계를 고침 → 새 판. 고친 칸은 더 이상 AI 추정이 아니고, 그 단계 확인은 다시 받습니다 */
  function editStep(work, stepIndex, patch, today) {
    var v = currentVersion(work); if (!v) return null;
    var d = JSON.parse(JSON.stringify(v.draft)), s = d.steps[stepIndex]; if (!s) return null;
    var changed = [];
    STEP_FIELDS.forEach(function (k) { if (patch[k] != null && str(patch[k]) !== s[k]) { s[k] = str(patch[k]); changed.push(k); } });
    if (!changed.length) return null;
    s.guess = s.guess.filter(function (k) { return changed.indexOf(k) < 0; });
    s.edited = true; s.confirmed = false; s.confirmedAt = '';
    if (d.flowFallback) d.flow = flowFromSteps(d.steps);
    var r = addVersion(work, d, '직접 고침: ' + (stepIndex + 1) + '단계 ' + changed.map(function (k) { return FIELD_LABEL[k]; }).join(' · '), today);
    var ns = r.version.draft.steps[stepIndex]; ns.confirmed = false; ns.confirmedAt = '';
    return r.version;
  }
  function basisCount(draft) {
    var c = { doc: 0, person: 0, both: 0, guess: 0, guessFields: 0 };
    arr(draft && draft.steps).forEach(function (s) { c[s.basis]++; c.guessFields += s.guess.length; });
    return c;
  }
  function refLabel(work, id) {
    var m = work.materials.filter(function (x) { return x.id === id; })[0]; if (m) return id + ' ' + m.kind + ' · ' + m.name;
    var p = work.images.filter(function (x) { return x.id === id; })[0]; if (p) return id + ' 사진 · ' + (p.caption || p.name);
    var q = work.questions.filter(function (x) { return x.id === id; })[0]; if (q) return id + ' 담당자 답변 · ' + q.text;
    var t = work.transcripts.filter(function (x) { return x.id === id; })[0]; if (t) return id + ' 담당자 설명' + (t.who ? ' · ' + t.who : '');
    return id;
  }

  /* ── 8. 내보내기 ─────────────────────────────────────────── */
  function stepsAoa(work, ver) {
    var d = ver.draft, a = [['순서', '단계명', '누가', '받는 것 · 입력', '하는 방법', '판단 기준 · 수치', '예외 상황', '주의사항 · 자주 하는 실수', '양식 · 시스템 화면', '소요시간', '근거', '근거 id', 'AI 추정 칸', '담당자 확인', '확인일']];
    d.steps.forEach(function (s) {
      a.push([s.no, s.title, s.who, s.input, s.how, s.criteria, s.exceptions, s.cautions, s.forms, s.time, BASIS_LABEL[s.basis], s.refs.join(', '), s.guess.map(function (k) { return FIELD_LABEL[k]; }).join(', '), s.confirmed ? '확인' : '', s.confirmedAt]);
    });
    return a;
  }
  function refsAoa(work) {
    var a = [['id', '종류', '이름 · 질문', '내용(앞부분)']];
    work.materials.forEach(function (m) { a.push([m.id, m.kind, m.name, m.text.slice(0, 300)]); });
    work.images.forEach(function (p) { a.push([p.id, '사진 · 캡처', p.caption || p.name, '']); });
    work.questions.forEach(function (q) { var x = work.answers[q.id]; a.push([q.id, '담당자 답변 · ' + catLabel(q.cat), q.text, x ? x.text.slice(0, 300) : '(답 없음)']); });
    work.transcripts.forEach(function (t) { a.push([t.id, '담당자 설명', t.who, t.text.slice(0, 300)]); });
    return a;
  }
  /* 인수인계 체크리스트 — 받는 사람이 하나씩 표시하며 익히도록 */
  function handoverChecklist(work, ver) {
    var d = ver.draft, items = [];
    d.steps.forEach(function (s) { items.push({ group: '단계 익히기', text: s.no + '. ' + s.title + (s.who ? ' (' + s.who + ')' : '') + ' — 설명을 듣고 한 번 함께 해 보기' }); });
    d.steps.forEach(function (s) { if (s.criteria) items.push({ group: '판단 기준', text: s.no + '단계 기준을 말로 설명할 수 있음: ' + s.criteria.split('\n')[0] }); });
    var forms = [];
    d.steps.forEach(function (s) { if (s.forms) s.forms.split(/\n|,\s*(?![^()]*\))/).map(str).filter(Boolean).forEach(function (f) { if (forms.indexOf(f) < 0) forms.push(f); }); });
    forms.forEach(function (f) { items.push({ group: '양식 · 시스템', text: '위치를 찾아 열어 보기: ' + f }); });
    d.steps.forEach(function (s) { if (s.exceptions) items.push({ group: '예외 · 주의', text: s.no + '단계 예외 처리 이해: ' + s.exceptions.split('\n')[0] }); if (s.cautions) items.push({ group: '예외 · 주의', text: s.no + '단계 주의: ' + s.cautions.split('\n')[0] }); });
    d.steps.filter(function (s) { return !s.confirmed; }).forEach(function (s) { items.push({ group: '인계 전에 확인', text: s.no + '단계 「' + s.title + '」 담당자 확인 받기' + (s.basis === 'guess' ? ' (AI 추정)' : '') }); });
    d.open_questions.forEach(function (q) { items.push({ group: '인계 전에 확인', text: '답 받기: ' + q }); });
    items.push({ group: '마무리', text: '혼자서 처음부터 끝까지 한 번 해 보고 담당자에게 결과 확인 받기' });
    return items;
  }
  function checklistAoa(items) { return [['구분', '항목', '확인', '날짜 · 메모']].concat(items.map(function (i) { return [i.group, i.text, '', '']; })); }
  /* 1장 요약 — 단계 한 줄씩 + 기준 · 주의 · 넘기는 곳 */
  function onePage(work, ver) {
    var d = ver.draft, c = basisCount(d);
    return {
      title: d.title || work.name, summary: d.summary,
      meta: [work.owner ? '담당 ' + work.owner : '', '판 v' + ver.v + (ver.at ? ' (' + ver.at + ')' : ''), '단계 ' + d.steps.length + '개 · 담당자 확인 ' + d.steps.filter(function (s) { return s.confirmed; }).length + '개'].filter(Boolean).join(' · '),
      steps: d.steps.map(function (s) { return { no: s.no, title: s.title, who: s.who, time: s.time, basis: s.basis, confirmed: s.confirmed }; }),
      criteria: d.steps.filter(function (s) { return s.criteria; }).map(function (s) { return s.no + '. ' + s.criteria.split('\n')[0]; }).slice(0, 5),
      cautions: d.steps.filter(function (s) { return s.cautions; }).map(function (s) { return s.no + '. ' + s.cautions.split('\n')[0]; }).slice(0, 5),
      handover: d.steps.filter(function (s) { return /넘기|전달|보고|요청|통보|메일/.test(s.how + s.title); }).map(function (s) { return s.no + '. ' + s.title + (s.who ? ' (' + s.who + ')' : ''); }).slice(0, 4),
      basis: c, open: d.open_questions.length
    };
  }
  /* Word(.doc, HTML) 업무 방법서. opts.images = { P1: dataUrl } 이면 근거 사진을 단계 아래에 넣습니다 */
  function methodDocHtml(work, ver, opts) {
    opts = opts || {};
    var d = ver.draft, e = esc, imgs = obj(opts.images), c = basisCount(d);
    var css = 'body{font-family:"Malgun Gothic","맑은 고딕",sans-serif;font-size:10.5pt;line-height:1.55}h1{font-size:17pt;margin:0}h2{font-size:13pt;color:#0f2544;border-left:4px solid #2f73d9;padding-left:6px;margin-top:18px}h3{font-size:11.5pt;margin:14px 0 4px}' +
      'table{border-collapse:collapse;width:100%}td,th{border:1px solid #9aa7b8;padding:4px 6px;vertical-align:top;font-size:10pt}th{background:#eef2f7;text-align:left;width:22%}.meta{color:#56616f}.guess{color:#8a4b00;font-weight:bold}.b-guess{background:#fff4d6}.ok{color:#1b6e3a;font-weight:bold}';
    var h = ['<html><head><meta charset="utf-8"><title>' + e(d.title || work.name) + '</title><style>' + css + '</style></head><body>'];
    h.push('<h1>' + e(d.title || work.name) + ' — 업무 방법서</h1>');
    h.push('<p class="meta">' + e(['판 v' + ver.v + (ver.at ? ' · ' + ver.at : ''), work.owner ? '담당자 ' + work.owner : '', '단계 ' + d.steps.length + '개', '담당자 확인 ' + d.steps.filter(function (s) { return s.confirmed; }).length + '개',
      '근거: 문서 ' + c.doc + ' · 담당자 ' + c.person + ' · 둘 다 ' + c.both + ' · AI 추정 ' + c.guess].filter(Boolean).join(' · ')) + '</p>');
    if (d.summary) h.push('<p>' + e(d.summary) + '</p>');
    h.push('<p class="meta">AI 가 자료와 담당자 답변으로 만든 초안입니다. 「AI 추정」 표시는 근거 자료가 없는 내용이라 담당자 확인 전에는 그대로 따르지 마세요.</p>');
    h.push('<h2>1. 업무 흐름</h2><table><tr><th style="width:8%">순서</th><th>단계</th><th>누가</th><th>소요시간</th><th>근거 · 확인</th></tr>');
    d.steps.forEach(function (s) { h.push('<tr' + (s.basis === 'guess' ? ' class="b-guess"' : '') + '><td>' + s.no + '</td><td>' + e(s.title) + '</td><td>' + e(s.who) + '</td><td>' + e(s.time) + (s.guess.indexOf('time') >= 0 ? ' <span class="guess">(추정)</span>' : '') + '</td><td>' + e(BASIS_LABEL[s.basis]) + (s.confirmed ? ' · <span class="ok">담당자 확인</span>' : '') + '</td></tr>'); });
    h.push('</table>');
    if (opts.flowImg) h.push('<p><img src="' + opts.flowImg + '" style="max-width:100%"></p>');
    h.push('<h2>2. 단계별 업무 방법</h2>');
    d.steps.forEach(function (s) {
      h.push('<h3>' + s.no + '. ' + e(s.title) + '</h3><table>');
      STEP_FIELDS.slice(1).forEach(function (k) { if (s[k]) h.push('<tr><th>' + FIELD_LABEL[k] + '</th><td>' + e(s[k]).replace(/\n/g, '<br>') + (s.guess.indexOf(k) >= 0 ? ' <span class="guess">(AI 추정)</span>' : '') + '</td></tr>'); });
      h.push('<tr><th>근거</th><td>' + e(BASIS_LABEL[s.basis]) + (s.refs.length ? ' — ' + s.refs.map(function (r) { return e(refLabel(work, r)); }).join('<br>') : '') + '</td></tr>');
      h.push('<tr><th>담당자 확인</th><td>' + (s.confirmed ? '<span class="ok">확인</span> ' + e(s.confirmedAt) : '확인 전') + '</td></tr></table>');
      s.refs.filter(function (r) { return /^P\d+$/.test(r) && imgs[r]; }).forEach(function (r) {
        var p = work.images.filter(function (x) { return x.id === r; })[0];
        h.push('<p><img src="' + imgs[r] + '" style="max-width:420px"><br><span class="meta">' + e(r + ' ' + (p ? p.caption || p.name : '')) + '</span></p>');
      });
    });
    if (d.glossary.length) { h.push('<h2>3. 용어</h2><table>'); d.glossary.forEach(function (g) { h.push('<tr><th>' + e(g.term) + '</th><td>' + e(g.meaning) + '</td></tr>'); }); h.push('</table>'); }
    if (d.open_questions.length) { h.push('<h2>' + (d.glossary.length ? 4 : 3) + '. 더 확인할 것</h2><ul>'); d.open_questions.forEach(function (q) { h.push('<li>' + e(q) + '</li>'); }); h.push('</ul>'); }
    h.push('<h2>근거 자료</h2><ul>');
    refsAoa(work).slice(1).forEach(function (r) { h.push('<li>' + e(r[0] + ' · ' + r[1] + ' · ' + r[2]) + '</li>'); });
    h.push('</ul></body></html>');
    return h.join('');
  }

  return {
    VERSION: VERSION, SCHEMA: SCHEMA, MATERIAL_KINDS: MATERIAL_KINDS, CATS: CATS, TEMPLATE: TEMPLATE, STEP_FIELDS: STEP_FIELDS, FIELD_LABEL: FIELD_LABEL, BASIS_LABEL: BASIS_LABEL, LIMIT: LIMIT,
    catLabel: catLabel, catId: catId, templateQuestions: templateQuestions,
    emptyWork: emptyWork, cleanWork: cleanWork, cleanWorks: cleanWorks, cleanDraft: cleanDraft, migrate: migrate, emptyDb: emptyDb, nextNo: nextNo,
    fileKind: fileKind, docxXmlToText: docxXmlToText, docxText: docxText, xlsxText: xlsxText, guessMaterialKind: guessMaterialKind, addMaterial: addMaterial, flowToMaterialText: flowToMaterialText,
    answered: answered, progress: progress, setAnswer: setAnswer, addTranscript: addTranscript, addQuestions: addQuestions,
    questionPrompt: questionPrompt, draftPrompt: draftPrompt, extractJson: extractJson, parseQuestionsAnswer: parseQuestionsAnswer, flowFromSteps: flowFromSteps, parseDraftAnswer: parseDraftAnswer, basisOf: basisOf,
    currentVersion: currentVersion, addVersion: addVersion, setConfirmed: setConfirmed, editStep: editStep, basisCount: basisCount, refLabel: refLabel,
    stepsAoa: stepsAoa, refsAoa: refsAoa, handoverChecklist: handoverChecklist, checklistAoa: checklistAoa, onePage: onePage, methodDocHtml: methodDocHtml, esc: esc
  };
});
