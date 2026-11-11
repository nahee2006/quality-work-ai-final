// 실행: node test/capture.test.mjs   (의존성 없음 — vendor 의 SheetJS 만 씀)
// 업무 경험 수집 · AI 업무 자료화(2026-10-28 방향 수정) 로직 검사. 자료 · 답변 · AI 답은 모두 가상 샘플(js/sample-capture.js)입니다.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const L = require('../js/logic.js');
const C = require('../js/capture.js');
const SC = require('../js/sample-capture.js');
const Sample = require('../js/sample-data.js');
const XLSX = require('../vendor/xlsx.full.min.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
}
const fresh = (o) => SC.buildWork(C, Object.assign({ withDraft: false }, o));
const clone = (x) => JSON.parse(JSON.stringify(x));

console.log('질문지 · 샘플');
test('기본 질문 13개 — 8가지 분류가 다 있고, 다시 채워도 늘지 않음', () => {
  const q = C.templateQuestions([]);
  assert.equal(q.length, 13);
  assert.deepEqual(q.map(x => x.id), q.map((_, i) => 'Q' + (i + 1)));
  ['order', 'criteria', 'exception', 'mistake', 'caution', 'forms', 'time', 'handover'].forEach(c => assert.ok(q.some(x => x.cat === c), c));
  assert.equal(C.templateQuestions(q).length, 13);
  const less = q.filter(x => x.id !== 'Q5');
  const back = C.templateQuestions(less);
  assert.equal(back.length, 13); assert.equal(back[12].id, 'Q14', '빠진 질문은 새 번호로');
});
test('샘플 업무 — 자료 3 · 사진 1 · 답 11/13 · 설명 1 · 초안 v1(확인 3)', () => {
  const w = SC.buildWork(C);
  const p = C.progress(w);
  assert.deepEqual([p.materials, p.images, p.answered, p.questions, p.transcripts, p.versions, p.steps, p.confirmed, p.guess], [3, 1, 11, 13, 1, 1, 9, 3, 1]);
  assert.deepEqual(w.materials.map(m => m.kind), ['절차서', '체크리스트', '시스템 입력 항목']);
});

console.log('프롬프트');
test('초안 프롬프트에 자료 · 답변 · 말로 한 설명 · 사진 설명 · 못 받은 질문이 id 와 함께 들어감', () => {
  const w = fresh();
  const p = C.draftPrompt(w);
  assert.ok(p.includes('[M1] 절차서 · 수입검사 부적합품 처리 절차서'));
  assert.ok(p.includes('4.4 품질 엔지니어는 반품 · 선별 · 특채'), '자료 본문');
  assert.ok(p.includes('[M3] 시스템 입력 항목'));
  assert.ok(p.includes('[P1] 사진 · 캡처 · 품질시스템 부적합 등록 화면'));
  assert.ok(p.includes('[Q3] (판단 기준 · 수치)') && p.includes('로트 수량의 2% 이하'), '답변 본문');
  assert.ok(/아직 답을 못 받은 질문[\s\S]*\[Q6\][\s\S]*\[Q13\]/.test(p), '못 받은 질문 Q6 · Q13');
  assert.ok(!/\[Q6\] \(/.test(p), 'Q6 은 답변 칸에 없음');
  assert.ok(p.includes('[T1] 검사원') && p.includes('임시 구역'), '말로 한 설명');
  assert.ok(p.includes('"refs":["M1","Q3"]') && p.includes('"guess":["time"]'), '답 형식');
  assert.ok(/지어내지 말고/.test(p) && /해줘/.test(p), '요청형 · 지어내지 말 것');
});
test('자료가 길면 잘라서 넣고 몇 자를 뺐는지 적음(자료 하나 6천 자)', () => {
  const w = fresh(); w.materials[0].text = '가'.repeat(9000);
  const p = C.draftPrompt(w);
  assert.ok(p.includes('이하 3000자 생략'));
  assert.ok(!p.includes('가'.repeat(6001)));
});
test('질문 뽑기 프롬프트 — 자료 본문 · 이미 있는 질문 · 뽑는 기준(문서와 실제가 다른 곳)', () => {
  const w = fresh();
  const p = C.questionPrompt(w);
  assert.ok(p.includes('[M2] 체크리스트') && p.includes('□ 불량 사진 첨부'));
  assert.ok(p.includes('[이미 있는 질문]') && p.includes(w.questions[0].text));
  assert.ok(/문서와 실제 업무가 다를 수 있는 곳/.test(p) && /뽑아줘/.test(p));
  const empty = C.emptyWork('새 업무');
  assert.ok(C.questionPrompt(empty).includes('아직 자료가 없습니다'));
});
test('AI 질문 답 읽기 — JSON · 번호 줄 · 빈 답', () => {
  const r = C.parseQuestionsAnswer('```json\n{"questions":[{"cat":"예외 상황","q":"금요일 입고분은 어떻게 하나요?","why":"M1 에 없음"},{"cat":"소요시간","q":"회신 기한은 며칠인가요?"}]}\n```');
  assert.equal(r.questions.length, 2); assert.equal(r.questions[0].cat, 'exception'); assert.equal(r.questions[1].cat, 'time'); assert.equal(r.questions[0].why, 'M1 에 없음');
  const r2 = C.parseQuestionsAnswer('1. [판단 기준] 한도 견본은 어디에 있나요?\n2. 시스템 메뉴 위치를 알려 주세요');
  assert.equal(r2.questions.length, 2); assert.equal(r2.questions[0].cat, 'criteria'); assert.equal(r2.questions[1].cat, 'forms');
  assert.equal(C.parseQuestionsAnswer('').questions.length, 0);
  const w = fresh(); const before = w.questions.length;
  const added = C.addQuestions(w, r.questions.concat([{ text: w.questions[0].text }]), 'AI');
  assert.equal(added.length, 2, '겹치는 질문은 뺌'); assert.equal(w.questions.length, before + 2); assert.equal(added[0].id, 'Q14');
});

console.log('AI 답 읽기 · 근거 표시');
test('샘플 AI 답 — 앞 설명 · ``` 묶음을 걷고 9단계, 근거(문서 · 담당자 · 둘 다 · AI 추정)를 단계마다', () => {
  const w = fresh();
  const r = C.parseDraftAnswer(SC.SAMPLE_ANSWER, w);
  assert.equal(r.ok, true, r.errors.join(' '));
  const d = r.draft;
  assert.equal(d.steps.length, 9);
  assert.deepEqual(d.steps.map(s => s.basis), ['both', 'both', 'both', 'both', 'both', 'doc', 'both', 'person', 'guess']);
  assert.deepEqual(d.steps[8].refs, []);
  assert.deepEqual(d.steps[6].guess, ['time'], '칸 단위 추정');
  assert.ok(!d.steps[4].refs.includes('M9'), '없는 근거 M9 는 뺌');
  assert.ok(r.warnings.some(x => /M9/.test(x)));
  assert.ok(r.warnings.some(x => /AI 추정/.test(x)));
  assert.equal(d.glossary.length, 4); assert.equal(d.open_questions.length, 4);
});
test('샘플 흐름 — 판단 2개(특채 · 협력사 원인)가 마름모로, 흐름 점검 · 그림 점검 0', () => {
  const w = fresh();
  const d = C.parseDraftAnswer(SC.SAMPLE_ANSWER, w).draft;
  assert.equal(d.flow.length, 11); assert.equal(d.flowFallback, false);
  const decs = d.flow.filter(f => f.question);
  assert.equal(decs.length, 2);
  assert.deepEqual([decs[0].yes, decs[0].no], ['7', '8']); assert.deepEqual([decs[1].yes, decs[1].no], ['10', '끝']);
  assert.deepEqual(L.validateFlow(d.flow), { errors: [], warnings: [] });
  assert.deepEqual(L.checkFlowLayout(L.layoutFlow(d.flow)), []);
  const svg = L.flowSvg(L.layoutFlow(d.flow), { title: 't' });
  assert.equal((svg.match(/class="node dec"/g) || []).length, 2);
});
test('근거 판정 — 실제 있는 id 만 인정: 없는 자료를 들면 AI 추정, 글 속 「(근거: Q2)」도 줍기, 문자열 refs', () => {
  const w = fresh();
  const ans = JSON.stringify({ steps: [
    { title: '가', refs: ['M7', 'Q99'] },
    { title: '나', how: '표찰을 붙인다 (근거: Q2)' },
    { title: '다', refs: 'M1, T1' },
    { title: '라', refs: ['p1'] },
    { title: '마', refs: ['M1'], basis: '추정' }
  ] });
  const r = C.parseDraftAnswer(ans, w);
  assert.deepEqual(r.draft.steps.map(s => s.basis), ['guess', 'person', 'both', 'doc', 'doc']);
  assert.deepEqual(r.draft.steps[2].refs, ['M1', 'T1']);
  assert.deepEqual(r.draft.steps[3].refs, ['P1'], '소문자 p1 도 P1');
  assert.ok(r.draft.steps[4].aiGuess && r.warnings.some(x => /「추정」이라 적었습니다/.test(x)));
  assert.equal(C.basisOf([]), 'guess'); assert.equal(C.basisOf(['Q1']), 'person'); assert.equal(C.basisOf(['P2']), 'doc'); assert.equal(C.basisOf(['M1', 'T1']), 'both');
});
test('망가진 답 — 빈 답 · JSON 없음 · 중간에 끊김 · steps 없음은 오류, 끝 쉼표 · 둥근 따옴표는 고쳐 읽음', () => {
  const w = fresh();
  const err = t => { const r = C.parseDraftAnswer(t, w); assert.equal(r.ok, false, t); assert.equal(r.draft, null); return r.errors[0]; };
  assert.match(err(''), /비어/);
  assert.match(err('죄송합니다. 자료가 부족합니다.'), /JSON/);
  assert.match(err('{"steps":[{"title":"가"'), /끊겼/);
  assert.match(err('{"title":"x"}'), /steps/);
  assert.match(err('{"steps":[{"how":"제목 없음"}]}'), /단계명이 있는 단계가 하나도/);
  assert.match(err('{"steps":[{"title": 가}]}'), /JSON 으로 읽지 못했습니다/);
  const r = C.parseDraftAnswer('{"steps":[{"title":“가”, "who":"검사원",},],}', w);
  assert.equal(r.ok, true); assert.ok(r.warnings.some(x => /고쳐 읽었습니다/.test(x)));
  const braces = C.parseDraftAnswer('요청하신 {steps, flow} 형식으로 썼습니다.\n```json\n{"steps":[{"title":"가","refs":["Q1"]}]}\n```\n빈 칸은 {} 로 두었습니다.', w);
  assert.equal(braces.ok, true, '``` 묶음 밖 설명에 중괄호가 있어도 묶음 안 JSON 을 읽음'); assert.equal(braces.draft.steps[0].basis, 'person');
  const arr = C.parseDraftAnswer('[{"title":"하나"},"둘"]', w);
  assert.equal(arr.draft.steps.length, 2, '배열만 와도 단계로');
  const skip = C.parseDraftAnswer('{"steps":[{"title":"가"},{"how":"x"},{"title":"나","no":7}]}', w);
  assert.equal(skip.draft.steps.length, 2); assert.ok(skip.warnings.some(x => /title\)이 없어 뺐습니다/.test(x))); assert.equal(skip.draft.steps[1].no, 2);
});
test('흐름(flow)에 없는 번호 · 고리가 있으면 단계 순서대로 그리고 알림, 칸이 배열 · 객체여도 글로', () => {
  const w = fresh();
  const r = C.parseDraftAnswer(JSON.stringify({ steps: [{ title: '가', who: 'A', how: ['첫째', '둘째'], criteria: { 합격: '2% 이하' } }, { title: '나', who: 'B' }],
    flow: [{ step: 1, question: '좋은가?', yes: 2, no: 99 }, { step: 2, name: '나' }] }), w);
  assert.equal(r.ok, true);
  assert.equal(r.draft.flowFallback, true); assert.equal(r.draft.flow.length, 2); assert.equal(r.draft.flow[0].name, '가');
  assert.ok(r.warnings.some(x => /단계 순서대로/.test(x)));
  assert.equal(r.draft.steps[0].how, '첫째\n둘째'); assert.equal(r.draft.steps[0].criteria, '합격: 2% 이하');
});

console.log('판 · 담당자 확인');
test('새 판 — 바뀌지 않은 단계만 담당자 확인을 이어받음', () => {
  const w = fresh();
  const d1 = C.parseDraftAnswer(SC.SAMPLE_ANSWER, w).draft;
  C.addVersion(w, d1, '첫 판', '2026-10-28');
  [0, 1, 4].forEach(i => C.setConfirmed(w, i, true, '2026-10-28'));
  const d2 = clone(d1); d2.steps[1].how = '바뀐 방법';
  const r = C.addVersion(w, d2, '둘째 판', '2026-10-29');
  assert.equal(r.version.v, 2); assert.equal(w.current, 2); assert.equal(r.keptConfirm, 2);
  assert.deepEqual(C.currentVersion(w).draft.steps.map(s => s.confirmed).slice(0, 5), [true, false, false, false, true]);
  assert.equal(w.versions[0].draft.steps[1].confirmed, true, '옛 판 기록은 그대로');
});
test('단계 고치기 → 새 판, 고친 칸은 AI 추정 표시가 빠지고 그 단계 확인은 다시', () => {
  const w = fresh();
  C.addVersion(w, C.parseDraftAnswer(SC.SAMPLE_ANSWER, w).draft, '첫 판', '2026-10-28');
  C.setConfirmed(w, 6, true, '2026-10-28');
  const v = C.editStep(w, 6, { time: '15분' }, '2026-10-29');
  assert.equal(v.v, 2);
  const s = v.draft.steps[6];
  assert.equal(s.time, '15분'); assert.deepEqual(s.guess, []); assert.equal(s.edited, true); assert.equal(s.confirmed, false);
  assert.match(v.note, /7단계 소요시간/);
  assert.equal(C.editStep(w, 6, { time: '15분' }, '2026-10-29'), null, '바뀐 것 없으면 판을 만들지 않음');
  assert.equal(w.versions.length, 2);
});

console.log('파일에서 글자 꺼내기');
test('docx — zip 을 풀어 word/document.xml 의 문단 · 표 줄 · 특수 문자', () => {
  const xml = '<?xml version="1.0"?><w:document xmlns:w="x"><w:body>' +
    '<w:p><w:r><w:t>4.1 검사원은 </w:t></w:r><w:r><w:t xml:space="preserve">표찰을 붙인다 &amp; 격리한다</w:t></w:r></w:p>' +
    '<w:p/><w:tbl><w:tr><w:tc><w:p><w:r><w:t>항목</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>기준</w:t></w:r></w:p></w:tc></w:tr>' +
    '<w:tr><w:tc><w:p><w:r><w:t>불량률</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>2% 이하 &lt;선별&gt;</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
    '<w:p><w:r><w:t>끝</w:t><w:tab/><w:t>줄</w:t></w:r></w:p></w:body></w:document>';
  const cfb = XLSX.CFB.utils.cfb_new({ fileType: 'zip' });
  XLSX.CFB.utils.cfb_add(cfb, '/[Content_Types].xml', Buffer.from('<Types/>'));
  XLSX.CFB.utils.cfb_add(cfb, '/word/document.xml', Buffer.from(xml, 'utf8'));
  const bytes = new Uint8Array(XLSX.CFB.write(cfb, { fileType: 'zip', type: 'array' }));
  const t = C.docxText(bytes, XLSX.CFB);
  assert.equal(t, '4.1 검사원은 표찰을 붙인다 & 격리한다\n\n항목 | 기준\n불량률 | 2% 이하 <선별>\n끝\t줄');
  const bad = XLSX.CFB.utils.cfb_new({ fileType: 'zip' }); XLSX.CFB.utils.cfb_add(bad, '/a.txt', Buffer.from('x'));
  assert.throws(() => C.docxText(new Uint8Array(XLSX.CFB.write(bad, { fileType: 'zip', type: 'array' })), XLSX.CFB), /본문/);
});
test('xlsx — 시트마다 줄 · 칸을 「 | 」로, 빈 줄 · 빈 시트는 뺌', () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['메뉴', '품질관리 > 부적합'], [], ['품번', '필수', null]]), '부적합 등록');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), '빈 시트');
  const back = XLSX.read(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), { type: 'array' });
  assert.equal(C.xlsxText(back, XLSX), '[시트: 부적합 등록]\n메뉴 | 품질관리 > 부적합\n품번 | 필수');
});
test('파일 종류 · 자료 종류 짐작 · 전에 만든 흐름도 → 업무 순서 자료', () => {
  assert.deepEqual(['a.TXT', 'b.docx', 'c.xlsx', 'd.pdf', 'e.jpg', 'f.hwp', 'g.zip'].map(C.fileKind), ['text', 'docx', 'xlsx', 'pdf', 'image', 'unsupported', 'unknown']);
  assert.equal(C.guessMaterialKind('출하검사 체크리스트', ''), '체크리스트');
  assert.equal(C.guessMaterialKind('부적합품 관리 절차서', ''), '절차서');
  assert.equal(C.guessMaterialKind('메모', '품질시스템 입력 화면 메뉴'), '시스템 입력 항목');
  const db = Sample.buildDb(L), t = db.tasks.find(x => x.name === '부적합품 처리');
  const txt = C.flowToMaterialText(t, db.flows[t.id]);
  assert.ok(txt.startsWith('[전에 만든 흐름도 단계 표] 부적합품 처리'));
  assert.ok(/판단: 재작업이 가능한가\?|판단: .+\?/.test(txt)); assert.ok(txt.includes('[근거 문단]'));
});

console.log('옛 자료 옮기기 (저장 형식 1 → 2)');
test('업무 목록을 바꾼 뒤 — 업무 자료화 샘플 표시(sampleWorks) · 목록 출처가 저장 후 다시 열어도 남음', () => {
  const raw = { schema: 2, tasks: [{ id: 'T001', name: '고객 불만 접수' }], sample: false, sampleWorks: true, taskSource: { name: '품질업무.xlsx', rows: 1, at: '2026-10-28' }, works: [clone(fresh({ id: 'W1', taskId: '' }))], curWork: 'W1' };
  const m = C.migrate(JSON.parse(JSON.stringify(raw)));
  assert.equal(m.db.sampleWorks, true); assert.equal(m.db.taskSource.name, '품질업무.xlsx');
  assert.equal(m.db.works.length, 1); assert.equal(m.db.works[0].materials.length, 3);
  assert.equal(C.migrate(Object.assign({}, raw, { sample: true })).db.sampleWorks, false, '전체 샘플이면 sample 하나로');
  assert.equal(C.emptyDb().sampleWorks, false);
});
test('옛 판(schema 1) — 업무 목록 · 문서 · 흐름도 · 교육 자료 · 핵심 업무는 그대로, works 는 빈 목록, 한 번 안내', () => {
  const old = clone(Sample.buildDb(L)); old.schema = 1; delete old.works;
  const m = C.migrate(old);
  assert.equal(m.notice, 'upgraded');
  assert.equal(m.db.schema, 2);
  assert.equal(m.db.tasks.length, 52); assert.equal(m.db.docs.length, 24); assert.equal(Object.keys(m.db.flows).length, 3); assert.equal(Object.keys(m.db.lessons).length, 3); assert.equal(m.db.core.length, old.core.length);
  assert.deepEqual(m.db.works, []); assert.equal(m.db.curWork, '');
  assert.equal(C.migrate({ schema: 1 }).notice, '', '옛 판이어도 자료가 없으면 안내 안 함');
});
test('지금 판은 그대로 돌아오고(왕복), 망가진 값은 버리고 앱은 계속', () => {
  const db = C.emptyDb(); db.works = [SC.buildWork(C)]; db.curWork = 'W1';
  const back = C.migrate(JSON.parse(JSON.stringify(db)));
  assert.equal(back.notice, '');
  assert.deepEqual(back.db.works, db.works);
  [null, undefined, 42, 'x', [], { works: 'x' }, { works: [null, 1, {}, { name: '' }] }, { tasks: 'x', flows: 7, works: [{ name: '가', materials: 'x', answers: [], versions: [{ draft: { steps: 'x' } }], questions: [{}] }] }]
    .forEach(raw => { const m = C.migrate(raw); assert.ok(Array.isArray(m.db.works) && Array.isArray(m.db.tasks)); });
  const odd = C.migrate({ schema: 2, curWork: 'W9', works: [{ id: 'W1', name: '가', questions: [{ id: 'Q1', text: '물음', cat: '예외' }], answers: { Q1: '문자열 답', Q9: { text: '없는 질문' } },
    versions: [{ v: 3, draft: { steps: [{ title: 't', basis: '이상한 값', refs: 'x' }] } }], current: 8, materials: [{ id: 'M1', kind: '없는 종류', text: 5 }] }, { id: 'W1', name: '나' }] });
  const w = odd.db.works[0];
  assert.equal(odd.db.curWork, 'W1', '없는 curWork 는 첫 업무로');
  assert.equal(odd.db.works[1].id, 'W2', '겹친 id 는 새로');
  assert.deepEqual(Object.keys(w.answers), ['Q1']); assert.equal(w.answers.Q1.text, '문자열 답');
  assert.equal(w.questions[0].cat, 'exception');
  assert.equal(w.current, 3); assert.equal(w.versions[0].draft.steps[0].basis, 'guess'); assert.deepEqual(w.versions[0].draft.steps[0].refs, []);
  assert.equal(w.materials[0].kind, '기타'); assert.equal(w.materials[0].text, '5');
});

console.log('내보내기');
test('Excel 단계표 · 근거 자료 · 인수인계 체크리스트 · 1장 요약', () => {
  const w = SC.buildWork(C), v = C.currentVersion(w);
  const a = C.stepsAoa(w, v);
  assert.equal(a.length, 10); assert.equal(a[0][10], '근거'); assert.equal(a[9][10], 'AI 추정'); assert.equal(a[7][12], '소요시간'); assert.equal(a[1][13], '확인');
  const refs = C.refsAoa(w);
  assert.equal(refs.length, 1 + 3 + 1 + 13 + 1); assert.ok(refs.some(r => r[0] === 'Q6' && r[3] === '(답 없음)'));
  const items = C.handoverChecklist(w, v);
  const g = n => items.filter(i => i.group === n);
  assert.equal(g('단계 익히기').length, 9);
  assert.equal(g('인계 전에 확인').filter(i => /담당자 확인 받기/.test(i.text)).length, 6, '확인 전 6단계');
  assert.ok(g('인계 전에 확인').some(i => /9단계 「협력사 회신 확인」 담당자 확인 받기 \(AI 추정\)/.test(i.text)));
  assert.ok(g('인계 전에 확인').some(i => /답 받기: .*Q6/.test(i.text)));
  assert.ok(g('양식 · 시스템').some(i => /품질관리 > 부적합 > 등록/.test(i.text)));
  assert.equal(C.checklistAoa(items).length, items.length + 1);
  const one = C.onePage(w, v);
  assert.equal(one.steps.length, 9); assert.equal(one.basis.guess, 1); assert.equal(one.open, 4); assert.ok(one.criteria.length >= 2);
});
test('Word 업무 방법서 — 단계 · 근거 · AI 추정 · 확인 표시, 글은 이스케이프, 근거 사진은 그 단계 아래', () => {
  const w = SC.buildWork(C), v = C.currentVersion(w);
  v.draft.steps[0].how = '<script>alert(1)</script>';
  const html = C.methodDocHtml(w, v, { images: { P1: 'data:image/png;base64,AAAA' } });
  assert.ok(!html.includes('<script>') && html.includes('&lt;script&gt;'));
  assert.ok(html.includes('업무 방법서') && html.includes('9. 협력사 회신 확인'));
  assert.ok(html.includes('AI 추정') && html.includes('(AI 추정)'));
  assert.equal((html.match(/<span class="ok">확인<\/span>/g) || []).length, 3);
  const i3 = html.indexOf('3. 품질시스템에 부적합 등록'), i4 = html.indexOf('4. 부적합 보고서 작성'), ip = html.indexOf('data:image/png;base64,AAAA');
  assert.ok(i3 < ip && ip < i4, 'P1 그림은 3단계 아래');
  assert.ok(html.includes('M1 · 절차서'), '근거 자료 목록');
});

console.log('\n' + passed + '개 통과' + (process.exitCode ? ' — 실패 있음' : ''));
