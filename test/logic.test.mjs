// 실행: node test/logic.test.mjs   (의존성 없음 — vendor 의 SheetJS 만 씀)
// 실제 업무 목록(52개 엑셀)은 아직 받지 않았습니다(기획서 10장 ①). 여기서는 작은 가상 표와 가상 샘플(업무 52 · 문서 24 · 흐름도 3)로 검사합니다.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const L = require('../js/logic.js');
const Sample = require('../js/sample-data.js');
const XLSX = require('../vendor/xlsx.full.min.js');
const E = require('../js/ai-endpoint.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
}
const TODAY = '2026-10-20';
const DB = Sample.buildDb(L);
const byName = n => DB.tasks.find(t => t.name === n);

console.log('주기 · 소요 시간 읽기');
test('주기 → 1년 횟수 (매일·주·격주·월 2~3회·분기·반기·연·수시·「2회/월」)', () => {
  const c = t => L.parseCycle(t).perYear;
  assert.equal(c('매일'), 250); assert.equal(c('일 2회'), 500); assert.equal(c('주 1회'), 52); assert.equal(c('주2회'), 104);
  assert.equal(c('격주'), 26); assert.equal(c('월 1회'), 12); assert.equal(c('월 2~3회'), 30); assert.equal(c('2회/월'), 24);
  assert.equal(c('분기 1회'), 4); assert.equal(c('반기'), 2); assert.equal(c('연 1회'), 1); assert.equal(c('년 2회'), 2);
  assert.equal(c('수시(발생 시)'), 12, '수시는 설정값(기본 12)');
  assert.equal(L.parseCycle('수시', { irregularPerYear: 30 }).perYear, 30);
  assert.equal(L.parseCycle('').ok, false); assert.equal(L.parseCycle('그때그때').ok, false);
});
test('소요 시간 → 시간 (30분·1시간 30분·1~2시간·1일·0.5일·4H·숫자만)', () => {
  const h = t => L.parseHours(t);
  assert.equal(h('2시간'), 2); assert.equal(h('30분'), 0.5); assert.equal(h('1시간 30분'), 1.5); assert.equal(h('1~2시간'), 1.5);
  assert.equal(h('1일'), 8); assert.equal(h('0.5일'), 4); assert.equal(h('4H'), 4); assert.equal(h('2'), 2); assert.equal(h(1.5), 1.5);
  assert.equal(L.parseHours('1일', { dayHours: 9 }), 9);
  assert.equal(h(''), null); assert.equal(h('반나절쯤'), null);
});

console.log('업무 목록 가져오기');
test('제목·빈 줄 아래 머리행을 찾고 「담당 직책」「소요 시간」도 연결, 구분은 묶음 첫 줄 값으로 채움', () => {
  const p = L.parseTaskSheet(Sample.taskAoa());
  assert.equal(p.det.headerRow, 2);
  assert.deepEqual(p.det.missing, []);
  assert.equal(p.det.map.role, 5); assert.equal(p.det.map.hours, 4); assert.equal(p.det.map.docs, 6);
  assert.equal(p.tasks.length, 52);
  assert.equal(p.tasks[1].category, '수입검사', '두 번째 줄은 구분이 비어 있어도 위 값');
  assert.equal(p.warnings.length, 0, p.warnings.join(' / '));
});
test('다른 열 이름(업무 항목·빈도·공수·담당자)도 찾고, 합계 줄·같은 업무명은 건너뜀', () => {
  const aoa = [['세부업무', '빈도', '공수', '담당자'], ['검사 실시', '매일', '2h', '검사원'], ['검사 실시', '매일', '2h', '검사원'], ['합계', null, null, null], ['보고', '그때그때', '많이', '']];
  const p = L.parseTaskSheet(aoa);
  assert.equal(p.det.headerRow, 0);
  assert.equal(p.tasks.length, 2);
  assert.ok(p.warnings.some(w => /같은 업무명/.test(w)));
  assert.ok(p.warnings.some(w => /주기 「그때그때」/.test(w)));
  assert.ok(p.warnings.some(w => /소요 시간 「많이」/.test(w)));
  assert.ok(!p.warnings.some(w => /직책이 비어/.test(w)), '직책은 이제 선택 — 비어도 알리지 않음');
});
test('필수는 업무명뿐 — 직책 열이 없어도 읽고, 열 연결로 직책을 더 이을 수 있음', () => {
  const aoa = [['업무명', '주기', '소요시간', '수행 인원'], ['검사', '매일', '1시간', '검사원']];
  const d = L.detectColumns(aoa, L.TASK_FIELDS);
  assert.deepEqual(d.missing, []);
  assert.deepEqual(L.TASK_FIELDS.filter(f => f.req).map(f => f.id), ['name']);
  assert.equal(L.parseTaskSheet(aoa).tasks[0].role, '');
  const p = L.parseTaskSheet(aoa, { overrides: { role: 3 } });
  assert.deepEqual(p.det.missing, []); assert.equal(p.tasks[0].role, '검사원');
});
test('제목 줄은 있는데 업무명 열을 못 찾으면 → 열 연결 화면(업무 0), 업무명 열을 고르면 그 제목 줄 아래부터 읽음', () => {
  const aoa = [['품질팀 업무 정리'], ['작업 내용', '주기', '직책'], ['수입검사', '매일', '검사원'], ['출하검사', '매일', '검사원']];
  const p = L.parseTaskSheet(aoa);
  assert.equal(p.tasks.length, 0); assert.deepEqual(p.det.missing, ['name']); assert.equal(p.det.guessRow, 1);
  assert.ok(p.det.warnings.some(w => /업무명/.test(w)));
  const q = L.parseTaskSheet(aoa, { overrides: { name: 0 } });
  assert.equal(q.det.headerRow, 1); assert.deepEqual(q.tasks.map(t => t.name), ['수입검사', '출하검사']);
});
test('「업무명」 한 열만 있는 파일 — 그대로 읽고 알림 없음', () => {
  const p = L.parseTaskSheet([['업무명'], ['수입검사'], ['출하검사'], [null], ['공정 순회 점검']]);
  assert.equal(p.det.headerRow, 0); assert.ok(!p.det.simple);
  assert.deepEqual(p.tasks.map(t => t.name), ['수입검사', '출하검사', '공정 순회 점검']);
  assert.equal(p.warnings.length, 0, p.warnings.join(' / '));
  assert.equal(p.tasks[0].cycle, ''); assert.equal(p.tasks[0].role, '');
});
test('제목 줄 없는 한 열 목록 — 글자가 든 첫 열(번호 열은 건너뜀)을 업무명으로, 「업무 목록」 제목은 뺌, 안내 문구', () => {
  const a = L.parseTaskSheet([['수입검사 실시'], ['출하검사'], [''], ['공정 순회 점검']]);
  assert.ok(a.det.simple); assert.deepEqual(a.det.missing, []);
  assert.deepEqual(a.tasks.map(t => t.name), ['수입검사 실시', '출하검사', '공정 순회 점검']);
  assert.ok(a.det.warnings.some(w => /A열의 글자를 업무명으로/.test(w)));
  const b = L.parseTaskSheet([[null, '업무 목록'], [1, '고객 불만 접수'], [2, '협력사 감사'], [3, 45]]);
  assert.deepEqual(b.tasks.map(t => t.name), ['고객 불만 접수', '협력사 감사', '45'], 'B열 · 제목 「업무 목록」 뺌');
  assert.ok(b.det.warnings.some(w => /B열/.test(w)));
  const c = L.parseTaskSheet([[null, '업무 목록'], [1, '고객 불만 접수']], { overrides: { name: 0 } });
  assert.deepEqual(c.tasks.map(t => t.name), ['1'], '열 연결로 다른 열을 고르면 그 열');
});
test('같은 업무명은 처음 것만(순서 유지) — 시트 읽기와 바꾸기 둘 다', () => {
  const p = L.parseTaskSheet([['업무명'], ['A 검사'], ['B 보고'], ['A검사'], ['C 점검'], ['B 보고']]);
  assert.deepEqual(p.tasks.map(t => t.name), ['A 검사', 'B 보고', 'C 점검']);
  assert.equal(p.warnings.filter(w => /같은 업무명/.test(w)).length, 2);
  const r = L.replaceTasks({ tasks: [] }, [{ name: 'X' }, { name: 'Y' }, { name: 'X' }]);
  assert.deepEqual(r.tasks.map(t => t.name + t.id), ['XT001', 'YT002']); assert.equal(r.stat.dup, 1);
});
test('업무 목록 바꾸기 — 샘플 52개(흐름도 있는 것 포함)를 모두 빼고 새 목록만, 업무 자료화는 남기고 잇기만 풂', () => {
  const C = require('../js/capture.js'), SC = require('../js/sample-capture.js');
  const db = Sample.buildDb(L);
  const flowIds = Object.keys(db.flows).filter(k => db.flows[k].steps.length);
  assert.ok(flowIds.length >= 3 && db.core.length && Object.keys(db.links).length);
  const pick = db.tasks.find(t => t.name === '부적합품 처리'), other = db.tasks.find(t => t.name === '수입검사 실시');
  db.works = [SC.buildWork(C, { id: 'W1', taskId: pick.id }), C.emptyWork('수입검사 실시', { id: 'W2', taskId: other.id })];
  // 실제 파일과 같은 길 — 한 열짜리 엑셀을 만들었다가 다시 읽음
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['업무명'], ['고객 불만 접수'], ['부적합품 처리'], ['협력사 감사']]), '내 업무');
  const back = XLSX.read(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }), { type: 'array' });
  const p = L.parseTaskSheet(XLSX.utils.sheet_to_json(back.Sheets['내 업무'], { header: 1, raw: true, defval: null }));
  const r = L.replaceTasks(db, p.tasks, { dropDocs: true });
  assert.deepEqual(r.tasks.map(t => t.name), ['고객 불만 접수', '부적합품 처리', '협력사 감사']);
  assert.ok(!r.tasks.some(t => t.missing), '「최근 목록에 없음」으로 남는 업무 없음');
  assert.deepEqual([r.flows, r.lessons, r.links, r.core, r.docs], [{}, {}, {}, [], []]);
  assert.equal(r.stat.removed, 52); assert.equal(r.stat.flows, flowIds.length); assert.equal(r.stat.docs, 24);
  assert.equal(r.works.length, 2, '업무 자료화 2개 그대로');
  assert.equal(r.works[0].materials.length, 3); assert.equal(r.works[0].versions.length, 1);
  assert.equal(r.works[0].taskId, 'T002', '새 목록에 같은 이름이 있으면 다시 이음');
  assert.equal(r.works[1].taskId, '', '없으면 잇기만 풂'); assert.equal(r.works[1].name, '수입검사 실시');
  assert.deepEqual([r.stat.relinked, r.stat.unlinked], [1, 1]);
  assert.equal(db.tasks.length, 52, '원본 db 는 건드리지 않음(미리 보기용)');
  const keep = L.replaceTasks(db, p.tasks);
  assert.equal(keep.docs.length, 24, 'dropDocs 없으면 문서 목록은 남김');
});
test('업무 목록 출처(taskSource)는 저장 · 복원됨', () => {
  const d = L.restoreDb({ tasks: [{ id: 'T001', name: 'A' }], taskSource: { name: '품질업무.xlsx', rows: 1, at: '2026-10-28' } });
  assert.deepEqual(d.taskSource, { name: '품질업무.xlsx', rows: 1, at: '2026-10-28' });
  assert.equal(L.restoreDb({}).taskSource, null);
});
test('여러 시트 중 업무 목록 시트를 고름', () => {
  const s = L.pickSheet([{ name: '표지', aoa: [['품질 업무 정리']] }, { name: '업무', aoa: Sample.taskAoa() }], L.TASK_FIELDS);
  assert.equal(s.name, '업무');
});
test('다시 가져오기 — 같은 업무명은 id·점수·핵심 선택 유지, 빠진 업무는 지우되 흐름도 있는 것은 남김', () => {
  const db = Sample.buildDb(L);
  const t1 = byName('수입검사 실시'), t2 = db.tasks.find(t => t.name === '검사실 5S 점검');
  const next = L.parseTaskSheet(Sample.taskAoa()).tasks.filter(t => t.name !== '수입검사 실시' && t.name !== '검사실 5S 점검');
  next.push({ name: '새 업무', cycle: '월 1회', hours: '1시간', role: '팀장', docsText: '' });
  const m = L.mergeTasks(db, next);
  assert.equal(m.stat.added, 1); assert.equal(m.stat.removed, 1); assert.equal(m.stat.keptForFlow, 1);
  const kept = m.tasks.find(t => t.id === t1.id);
  assert.ok(kept && kept.missing, '흐름도가 있는 수입검사 실시는 「최근 목록에 없음」으로 남음');
  assert.ok(!m.tasks.some(t => t.id === t2.id));
  const ins = m.tasks.find(t => t.name === '출하검사 실시');
  assert.equal(ins.id, db.tasks.find(t => t.name === '출하검사 실시').id);
  assert.equal(ins.newbie, 5, '점수 유지');
  assert.equal(m.tasks.find(t => t.name === '새 업무').id, 'T053');
  assert.ok(m.core.indexOf(t1.id) >= 0, '핵심 선택도 유지');
});

console.log('핵심 업무 점수');
test('점수 = 빈도×소요 시간(연간 시간, 로그) · 신입 관련성 · 고객 영향의 가중 평균, 가장 큰 업무가 빈도 만점', () => {
  const tasks = [
    { id: 'A', name: 'A', cycle: '매일', hours: '2시간', newbie: 5, customer: 5 },
    { id: 'B', name: 'B', cycle: '연 1회', hours: '1시간', newbie: 1, customer: 1 },
    { id: 'C', name: 'C', cycle: '월 1회', hours: '1시간' }
  ];
  const s = L.scoreTasks(tasks, {});
  assert.equal(s[0].task.id, 'A'); assert.equal(s[0].score, 100); assert.equal(s[0].annual, 500);
  const b = s.find(r => r.task.id === 'B');
  assert.ok(Math.abs(b.score - 40 * Math.log(2) / Math.log(501)) < 0.1, String(b.score));
  const c = s.find(r => r.task.id === 'C');
  assert.equal(c.newbie, 3, '비면 보통(3)');
  // 가중치를 고객 영향만 남기면 순서가 고객 영향 순
  const s2 = L.scoreTasks(tasks, { wFreq: 0, wNewbie: 0, wCustomer: 100 });
  assert.equal(s2.find(r => r.task.id === 'C').score, 50);
});
test('샘플 — 추천 12개에 흐름도를 그린 3개(수입검사·부적합품·고객 클레임)가 들어 있고, 범위 점검 문구', () => {
  assert.equal(DB.core.length, 12);
  Sample.WORKED.forEach(n => assert.ok(DB.core.indexOf(byName(n).id) >= 0, n));
  assert.ok(L.coreStatus(DB.core, DB.settings).ok);
  assert.ok(/2개 더/.test(L.coreStatus(DB.core.slice(0, 8), DB.settings).text));
  assert.ok(/1개 빼기/.test(L.coreStatus(DB.tasks.slice(0, 16).map(t => t.id), DB.settings).text));
});

console.log('문서 목록 · 연결');
test('문서 목록 — 「구분」「개정」「최종 개정일」「관리 담당」 연결, 종류 정리, 「2021-02」도 날짜로', () => {
  const p = L.parseDocSheet(Sample.docAoa());
  assert.deepEqual(p.det.missing, []); assert.equal(p.docs.length, 24);
  const wi = p.docs.find(d => d.code === 'WI-01');
  assert.equal(wi.kind, '비정형'); assert.equal(wi.revised, '2021-02-01');
  assert.equal(L.normalizeKind('', '관리계획서'), '형식'); assert.equal(L.normalizeKind('', '수입검사 절차서'), '정형'); assert.equal(L.normalizeKind('', '교육자료(PPT)'), '비정형');
  assert.equal(L.normalizeKind('비정형 문서', '절차서'), '비정형', '적힌 종류가 먼저');
});
test('업무 「관련 문서」 글 → 문서 연결 (이름·문서번호·포함, 「및」이 든 이름은 자르지 않음, 없는 문서는 따로)', () => {
  const docs = DB.docs;
  const m = L.matchDocRefs('문서 및 기록 관리 절차서, QP-02 / 검사기준서; 포장 사양서', docs);
  const names = m.ids.map(id => docs.find(d => d.id === id).name);
  assert.deepEqual(names, ['문서 및 기록 관리 절차서', '수입검사 절차서', '검사기준서']);
  assert.deepEqual(m.unmatched, ['포장 사양서']);
  assert.equal(L.findDoc('8D', docs), null, '두 글자 조각으로는 연결하지 않음');
  assert.equal(L.findDoc('관리계획서 Rev.3', docs).name, '관리계획서');
});
test('연결 토글·자동 연결은 손으로 넣은 연결을 지우지 않음', () => {
  const t = byName('검사실 5S 점검'), d = DB.docs[0];
  const l1 = L.toggleLink(DB.links, t.id, d.id);
  assert.deepEqual(l1[t.id], [d.id]);
  const l2 = L.autoLink(DB.tasks, DB.docs, l1).links;
  assert.deepEqual(l2[t.id], [d.id]);
  assert.deepEqual(L.toggleLink(l1, t.id, d.id)[t.id], []);
  assert.equal(DB.links[t.id], undefined, '원본은 그대로');
});
test('체크리스트 — 샘플에 심은 것을 모두 찾음(없는 문서 3 · 고아 1 · 오래된 버전 · 빈 버전 · 연결표 누락 · 흐름도 없음)', () => {
  const cl = L.checklist(DB, TODAY);
  const of = k => cl.items.filter(i => i.kindOf === k);
  assert.deepEqual(of('listUnknown').map(i => i.name), ['포장 사양서']);
  assert.deepEqual(of('flowUnknown').map(i => i.name).sort(), ['거래명세서', '작업표준서']);
  assert.deepEqual(of('orphan').map(i => DB.docs.find(d => d.id === i.docId).name), ['신뢰성 시험 지침']);
  assert.equal(of('stale').length, 8);
  assert.ok(of('stale').some(i => /계측기 관리 절차서/.test(i.text)));
  assert.ok(of('noVersion').some(i => /부적합품 관리대장/.test(i.text)));
  const cc = byName('고객 클레임 대응').id;
  assert.equal(of('flowNotLinked').filter(i => i.taskId === cc).length, 3);
  assert.equal(of('noFlow').length, 9, '핵심 12 − 흐름도 3');
  assert.equal(of('noDoc').length, 1); assert.equal(cl.items[0].level, 'bad', '꼭 고칠 것이 맨 위');
  // 개정 기준을 늘리면 오래된 버전이 줄어듦
  const db2 = Object.assign({}, DB, { settings: L.cleanSettings({ staleMonths: 84 }) });
  assert.equal(L.checklist(db2, TODAY).items.filter(i => i.kindOf === 'stale').length, 2);
});

console.log('업무 흐름도 — 단계 표');
test('점검 — 아니오 갈 곳 없음 · 없는 단계 · 자기 자신 · 닿지 않는 단계 · 끝으로 못 가는 고리', () => {
  const s = (o) => Object.assign(L.emptyStep(), o);
  assert.ok(L.validateFlow([s({ name: 'a', role: 'x', question: '맞나?' })]).errors.some(e => /아니오/.test(e)));
  assert.ok(L.validateFlow([s({ name: 'a', role: 'x', next: '7' })]).errors.some(e => /없는 단계/.test(e)));
  assert.ok(L.validateFlow([s({ name: 'a', role: 'x', next: '1' })]).errors.some(e => /자기 자신/.test(e)));
  const v = L.validateFlow([s({ name: 'a', role: 'x', next: '끝' }), s({ name: 'b', role: 'x' })]);
  assert.ok(v.warnings.some(w => /2번.*닿지 않는/.test(w)));
  const loop = L.validateFlow([s({ name: 'a', role: 'x' }), s({ name: 'b', role: 'x', next: '1' })]);
  assert.ok(loop.warnings.some(w => /끝으로 가는 길이 없/.test(w)));
  assert.ok(L.validateFlow([s({ name: 'a' })]).warnings.some(w => /담당 직책/.test(w)));
  Sample.WORKED.forEach(n => { const r = L.validateFlow(Sample.flowSteps(n)); assert.deepEqual(r.errors.concat(r.warnings), [], n); });
});
test('단계 넣기·빼기·옮기기 — 다른 단계의 예·아니오·다음 번호가 따라 바뀜', () => {
  const st = Sample.flowSteps('수입검사 실시').map(L.cleanStep); // 4번: 예→5 아니오→6
  const ins = L.insertStep(st, 2, { name: '새 단계', role: '검사원' });
  assert.equal(ins[2].name, '새 단계'); assert.equal(ins[4].yes, '6'); assert.equal(ins[4].no, '7'); assert.equal(ins[7].question, st[7 - 1].question);
  const del = L.deleteStep(st, 5); // 6번(부적합 식별) 빼기 → 4번 아니오가 비고, 8번 판단은 7번이 됨
  assert.equal(del[3].no, ''); assert.equal(del[6].yes, '8'); assert.equal(del[6].no, '9');
  const mv = L.moveStep(st, 4, 5); // 5번과 6번 자리 바꿈
  assert.equal(mv[3].yes, '6'); assert.equal(mv[3].no, '5'); assert.equal(mv[5].name, '합격 표시 후 입고 처리'); assert.equal(mv[5].next, '끝');
  assert.equal(L.refValue('→ 5번'), 5); assert.equal(L.refValue('종료'), 'end'); assert.equal(L.refValue(''), null);
});

console.log('업무 흐름도 — 그림');
test('샘플 3개 — 직책별 칸, 노드 겹침 · 글자 넘침 · 꼬리표 가림 · 선이 남의 노드 지나감 0', () => {
  Sample.WORKED.forEach(n => {
    const lay = L.layoutFlow(Sample.flowSteps(n));
    assert.deepEqual(L.checkFlowLayout(lay), [], n);
    assert.ok(lay.roles.length >= 3, n);
    lay.nodes.forEach(nd => assert.equal(nd.lane, lay.roles.indexOf(Sample.flowSteps(n)[nd.i].role)));
  });
  const lay = L.layoutFlow(Sample.flowSteps('고객 클레임 대응'));
  assert.deepEqual(lay.roles, ['영업팀', '품질 엔지니어', '검사원', '생산팀', '품질경영팀장']);
  assert.equal(lay.edges.filter(e => !e.down).length, 2, '3→11(아니오) · 8→5(되돌아가기)만 오른쪽 통로');
});
test('긴 글자·많은 갈림에서도 겹침 0 (판단 6개 · 한 어절이 아주 긴 이름 · 같은 칸에 여러 선)', () => {
  const st = [];
  for (let i = 0; i < 14; i++) {
    const dec = i % 2 === 1;
    st.push({ name: dec ? '' : '아주긴단계이름이띄어쓰기없이길게이어지는경우' + i + ' 그리고 뒤에 설명이 더 붙음', role: ['검사원', '품질 엔지니어', '생산팀 현장 반장 및 작업자', '품질경영팀장'][i % 4],
      inputs: i % 3 === 0 ? '검사기준서, 수입검사 성적서, 부적합 보고서' : '', outputs: i % 4 === 0 ? '부적합품 관리대장(엑셀)' : '',
      question: dec ? '측정값이 관리 한계 안에 있고 외관 기준도 만족하는가?' : '', yes: '', no: dec ? String(Math.max(1, i - 2)) : '', next: i === 12 ? '끝' : '' });
  }
  const lay = L.layoutFlow(st);
  assert.deepEqual(L.checkFlowLayout(lay), []);
  assert.deepEqual(L.validateFlow(st).errors, []);
});
test('점검기 자체 확인 — 일부러 상자를 좁히거나 겹치게 하면 잡아냄', () => {
  const lay = L.layoutFlow(Sample.flowSteps('부적합품 처리'));
  lay.nodes[2].w = 60;
  assert.ok(L.checkFlowLayout(lay).some(p => /3번 글자가 상자를 넘음/.test(p)));
  const lay2 = L.layoutFlow(Sample.flowSteps('부적합품 처리'));
  lay2.nodes[4].y = lay2.nodes[3].y + 5; lay2.nodes[4].x = lay2.nodes[3].x;
  assert.ok(L.checkFlowLayout(lay2).some(p => /노드 겹침/.test(p)));
  const lay3 = L.layoutFlow(Sample.flowSteps('부적합품 처리'));
  lay3.nodes[3].h = 40;
  assert.ok(L.checkFlowLayout(lay3).some(p => /마름모를 넘음/.test(p)));
});
test('SVG — 노드 수만큼 글자, 특수문자 이스케이프, 화살표, 칸 머리', () => {
  const st = [{ name: '<입고> & 확인', role: '검사원' }, { name: '판정', role: '검사원', question: 'A<B 인가?', yes: '', no: '끝' }];
  const svg = L.flowSvg(L.layoutFlow(st), { title: '시험' });
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(svg.includes('&lt;입고&gt; &amp; 확인')); assert.ok(!svg.includes('<입고>'));
  assert.equal((svg.match(/class="node-text"/g) || []).length, 4, '시작 · 2단계 · 끝');
  assert.ok(svg.includes('marker-end="url(#qwArrow)"')); assert.ok(svg.includes('class="lane-head"'));
  assert.ok(svg.includes('>아니오</text>'));
});
test('줄 바꿈은 어절 단위 — 한 어절이 넘칠 때만 글자로 자르고, 물음표는 떼지 않음', () => {
  assert.deepEqual(L.wrapText('수입검사 성적서 작성', 13 * 5, 13), ['수입검사', '성적서', '작성']);
  assert.deepEqual(L.wrapText('수입검사 성적서 작성', 13 * 9, 13), ['수입검사 성적서', '작성']);
  const w = L.wrapText('확인되었는가?', 13 * 6, 13);
  assert.equal(w[w.length - 1].endsWith('?') && w[w.length - 1] !== '?', true, JSON.stringify(w));
});

console.log('AI (반자동) — 절차서 문단 → 단계 표');
test('프롬프트 — 업무·담당 이름·문서 이름·문단을 담고, 지어내지 말라는 규칙과 답 형식', () => {
  const t = byName('수입검사 실시');
  const p = L.flowPrompt(t, '입고된 자재는 …', ['자재창고', '검사원'], ['검사기준서']);
  assert.ok(p.includes('[업무] 수입검사 실시')); assert.ok(p.includes('자재창고, 검사원')); assert.ok(p.includes('검사기준서'));
  assert.ok(p.includes('지어내지 마')); assert.ok(p.includes('| 순서 | 단계명 | 담당 | 입력 문서 | 산출 문서 | 판단 질문 | 예 | 아니오 | 다음 |'));
  assert.ok(p.includes('입고된 자재는 …'));
});
test('답 읽기 — 마크다운 표(번호가 10부터라도 표 순서로), 「없음」 지우기, 「끝」, 확인 필요 메모', () => {
  const ans = ['좋아요. 아래와 같습니다.', '',
    '| 순서 | 단계명 | 담당 | 입력 문서 | 산출 문서 | 판단 질문 | 예 | 아니오 | 다음 |',
    '|---|---|---|---|---|---|---|---|---|',
    '| 10 | 검사 의뢰 | 자재창고 | 없음 | - |  |  |  |  |',
    '| 11 | **검사 실시** | 검사원 | 검사기준서 | 수입검사 성적서 |  |  |  |  |',
    '| 12 | 합격 판정 | 검사원 |  |  | 합격 기준을 만족하는가? | 13 | 14번 |  |',
    '| 13 | 입고 처리 | 자재창고 |  |  |  |  |  | 끝 |',
    '| 14 | 격리 | 검사원 |  | 부적합 보고서 |  |  |  |  |',
    '', '확인 필요: 샘플링 수량 기준이 문단에 없습니다.'].join('\n');
  const r = L.parseStepsAnswer(ans);
  assert.equal(r.steps.length, 5);
  assert.equal(r.steps[0].inputs, ''); assert.equal(r.steps[0].outputs, '');
  assert.equal(r.steps[2].yes, '4'); assert.equal(r.steps[2].no, '5'); assert.equal(r.steps[3].next, '끝');
  assert.equal(r.steps[1].name, '검사 실시', '굵게 표시(**) 지움');
  assert.deepEqual(r.notes, ['샘플링 수량 기준이 문단에 없습니다.']);
  assert.deepEqual(L.validateFlow(r.steps).errors, []);
});
test('답 읽기 — 탭으로 나뉜 표(엑셀 붙여 넣기), 표가 없으면 「1. 단계명 (담당)」 줄', () => {
  const tab = '순서\t단계\t담당 부서\t산출\n1\t접수\t영업팀\t\n2\t확인\t품질 엔지니어\t8D 보고서';
  const r = L.parseStepsAnswer(tab);
  assert.equal(r.steps.length, 2); assert.equal(r.steps[1].role, '품질 엔지니어'); assert.equal(r.steps[1].outputs, '8D 보고서');
  const r2 = L.parseStepsAnswer('1. 클레임 접수 (영업팀)\n2) 현품 확인 — 담당: 품질 엔지니어\n3. 회신');
  assert.equal(r2.steps.length, 3); assert.equal(r2.steps[0].role, '영업팀'); assert.equal(r2.steps[1].role, '품질 엔지니어'); assert.equal(r2.steps[1].name, '현품 확인');
  assert.ok(r2.warnings.length >= 1);
  assert.equal(L.parseStepsAnswer('모르겠어요').steps.length, 0);
});

console.log('신입 교육');
test('커리큘럼 — 난이도 낮은 것부터, 같은 난이도는 핵심 업무 순서, 4주에 고르게', () => {
  const c = L.curriculum(DB);
  assert.equal(c.weeks.length, 4);
  const flat = c.weeks.flatMap(w => w.items);
  assert.equal(flat.length, 12);
  for (let i = 1; i < flat.length; i++) assert.ok(flat[i - 1].difficulty <= flat[i].difficulty);
  assert.ok(c.weeks.every(w => w.items.length === 3));
  assert.equal(c.weeks[0].items[0].name, byName(c.weeks[0].items[0].name).name);
  const c2 = L.curriculum(Object.assign({}, DB, { settings: L.cleanSettings({ weeks: 5 }) }));
  assert.equal(c2.weeks.length, 5); assert.equal(c2.weeks.flatMap(w => w.items).length, 12);
  assert.ok(flat.find(x => x.name === '수입검사 실시').hasLesson);
});
test('교육 한 장 초안 — 흐름도 사실(판단 갈림 · 산출 문서 · 담당)만, 실수는 비워 둠', () => {
  const t = byName('부적합품 처리');
  const d = L.draftLesson(t, DB.flows[t.id], DB.docs);
  assert.ok(d.purpose.includes('부적합품 처리')); assert.ok(d.purpose.includes('수시(발생 시)'));
  assert.ok(d.points.some(p => p.includes('재작업으로 기준을 만족시킬 수 있는가?') && p.includes('예: 5. 재작업 실시') && p.includes('아니오: 7. 폐기 또는 특채 승인 요청')));
  assert.deepEqual(d.mistakes, []);
  assert.ok(d.docIds.length >= 3);
});
test('확인 퀴즈 3문항 — 정답이 흐름도 사실과 맞고, 보기 4개 · 정답 위치는 고정되지 않음 · 같은 입력이면 같은 문제', () => {
  Sample.WORKED.forEach(n => {
    const t = byName(n), st = DB.flows[t.id].steps;
    const q = L.buildQuiz(t, st, DB.docs);
    assert.equal(q.length, 3, n);
    q.forEach(x => { assert.ok(x.options.length >= 3 && x.options.length <= 4); assert.equal(new Set(x.options).size, x.options.length); });
    const who = q.find(x => /누가 합니까/.test(x.q));
    const stepN = /「(.+)」 단계는/.exec(who.q)[1];
    assert.equal(who.options[who.answer], st.find(s => s.name === stepN).role, n + ' 담당 정답');
    assert.deepEqual(L.buildQuiz(t, st, DB.docs), q, '결정적');
  });
  const all = Sample.WORKED.flatMap(n => L.buildQuiz(byName(n), DB.flows[byName(n).id].steps, DB.docs).map(x => x.answer));
  assert.ok(new Set(all).size >= 2, '정답이 늘 같은 자리에 있지 않음');
  const t = byName('부적합품 처리'), q = L.buildQuiz(t, DB.flows[t.id].steps, DB.docs);
  const br = q.find(x => /아니오/.test(x.q));
  assert.equal(br.options[br.answer], '7. 폐기 또는 특채 승인 요청');
});
test('AI 답 읽기 — 목적·핵심 포인트·실수·퀴즈(한 줄 보기 ①②③④ / 줄마다 보기 / 정답 글자)', () => {
  const ans = ['## 목적: 부적합품을 바르게 처리합니다.', '', '**핵심 포인트:**', '- 식별 표시 먼저', '- 재작업품은 재검사', '자주 하는 실수:', '1. 재검사 생략', '2. 승인 전 폐기',
    '퀴즈:', '1. 재작업이 끝나면?', '① 출하 ② 재검사 ③ 폐기 ④ 보관', '정답: ②', '해설: 재검사합니다.',
    'Q2. 승인은 누가?', 'a) 검사원', 'b) 생산팀', 'c) 품질경영팀장', 'd) 영업팀', '정답: c', '3. 반복되면?', '1) 시정조치', '2) 끝', '정답: 1'].join('\n');
  const r = L.parseLessonAnswer(ans);
  assert.equal(r.lesson.purpose, '부적합품을 바르게 처리합니다.');
  assert.deepEqual(r.lesson.points, ['식별 표시 먼저', '재작업품은 재검사']);
  assert.deepEqual(r.lesson.mistakes, ['재검사 생략', '승인 전 폐기']);
  assert.equal(r.lesson.quiz.length, 3);
  assert.deepEqual(r.lesson.quiz[0].options, ['출하', '재검사', '폐기', '보관']); assert.equal(r.lesson.quiz[0].answer, 1); assert.equal(r.lesson.quiz[0].explain, '재검사합니다.');
  assert.equal(r.lesson.quiz[1].answer, 2); assert.equal(r.lesson.quiz[1].options.length, 4);
  assert.equal(r.lesson.quiz[2].answer, 0); assert.equal(r.lesson.quiz[2].options.length, 2);
  assert.deepEqual(r.warnings, []);
  assert.ok(L.parseLessonAnswer('그냥 글').warnings.length);
});
test('교육 프롬프트 — 단계 표·관련 문서를 담고, 지어내지 말라는 규칙과 답 형식', () => {
  const t = byName('고객 클레임 대응');
  const p = L.lessonPrompt(t, DB.flows[t.id], DB.docs, DB.lessons[t.id]);
  assert.ok(p.includes('3 | 책임 판단 | 품질 엔지니어 |  |  | 당사 책임 클레임인가? | 4 | 11 |'));
  assert.ok(p.includes('[관련 문서]') && p.includes('8D 보고서(QF-07)'));
  assert.ok(p.includes('지어내지 마')); assert.ok(p.includes('정답: ②'));
});

console.log('내보내기 · 저장 · 샘플 파일');
test('엑셀 표 — 업무(점수 순)·문서·연결표·단계 표·체크리스트', () => {
  const s = L.scoreTasks(DB.tasks, DB.settings);
  const a = L.tasksToAoa(s); assert.equal(a.length, 53); assert.equal(a[1][0], 1);
  assert.equal(L.docsToAoa(DB.docs).length, 25);
  const core = DB.core.map(id => DB.tasks.find(t => t.id === id));
  const mx = L.matrixToAoa(core, DB.docs, DB.links); assert.equal(mx.length, 13); assert.equal(mx[0].length, 25);
  assert.ok(mx.slice(1).some(r => r.includes('●')));
  assert.equal(L.stepsToAoa(DB.flows[byName('수입검사 실시').id].steps)[4][5], '합격 기준을 모두 만족하는가?');
  assert.equal(L.checklistToAoa(L.checklist(DB, TODAY))[0][2], '내용');
});
test('저장 형식 — 되살리기, 없는 id 를 가리키는 연결·핵심·흐름도 버림, 설정 정리', () => {
  const raw = JSON.parse(JSON.stringify(DB));
  raw.links.T999 = ['D001']; raw.links[raw.tasks[0].id].push('D999'); raw.core.push('T999'); raw.flows.T999 = { steps: [] };
  raw.settings.coreMin = 20; raw.settings.coreMax = 5; raw.settings.wFreq = -3;
  const db = L.restoreDb(raw);
  assert.equal(db.tasks.length, 52); assert.equal(db.links.T999, undefined); assert.ok(db.links[raw.tasks[0].id].indexOf('D999') < 0);
  assert.equal(db.core.length, 12); assert.equal(db.flows.T999, undefined); assert.equal(Object.keys(db.flows).length, 3);
  assert.equal(db.settings.coreMin, 5); assert.equal(db.settings.coreMax, 20); assert.equal(db.settings.wFreq, 40);
  assert.equal(Object.keys(db.lessons).length, 3); assert.equal(db.lessons[byName('수입검사 실시').id].quiz.length, 3);
  assert.deepEqual(L.restoreDb(null).tasks, []);
});
test('샘플 엑셀 — 쓰고 다시 읽어도 업무 52 · 문서 24, 샘플 db 와 같음', () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(Sample.taskAoa()), '업무 목록');
  const back = XLSX.read(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }), { type: 'array', cellDates: true });
  const aoa = XLSX.utils.sheet_to_json(back.Sheets[back.SheetNames[0]], { header: 1, raw: true, defval: null });
  const wb2 = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet(Sample.docAoa()), '문서 목록');
  const back2 = XLSX.read(XLSX.write(wb2, { bookType: 'xlsx', type: 'array' }), { type: 'array', cellDates: true });
  const aoa2 = XLSX.utils.sheet_to_json(back2.Sheets[back2.SheetNames[0]], { header: 1, raw: true, defval: null });
  const db = Sample.buildDb(L, { taskAoa: aoa, docAoa: aoa2 });
  assert.equal(db.tasks.length, 52); assert.equal(db.docs.length, 24);
  assert.deepEqual(db.core, DB.core); assert.deepEqual(db.links, DB.links);
});

console.log('AI 연결 설정 (선택 기능)');
test('주소 정리·점검·요청 — 키는 넣을 때만 머리글, https 페이지에서 http 주소 막음, 저장 칸 이름', () => {
  assert.equal(E.STORE_KEY, 'data10-09.ai');
  assert.equal(E.normalizeBaseUrl('https://x.example/v1/chat/completions/'), 'https://x.example/v1');
  assert.ok(E.validateConfig({ baseUrl: 'http://10.0.0.5/v1', model: 'm' }, 'https:').errors.length);
  assert.equal(E.validateConfig({ baseUrl: 'http://10.0.0.5/v1', model: 'm' }, 'file:').errors.length, 0);
  const req = E.buildChatRequest({ baseUrl: 'https://x/v1', model: 'm' }, E.promptMessages('hi'));
  assert.equal(req.init.headers.Authorization, undefined);
  assert.equal(E.buildChatRequest({ baseUrl: 'https://x/v1', model: 'm', apiKey: 'k' }, []).init.headers.Authorization, 'Bearer k');
  assert.equal(E.toStored({ baseUrl: 'https://x/v1', model: 'm', apiKey: 'k', remember: false }).apiKey, '', '기억 끄면 키 저장 안 함');
  assert.equal(E.parseChatResponse({ choices: [{ message: { content: '답' } }] }), '답');
});

const { versions } = await import('../scripts/bump-version.mjs');
test('판 맞추기 — index.html ?v= · logic.js · capture.js · app.js 가 같은 판 (scripts/bump-version.mjs)', () => {
  const v = versions();
  assert.equal(v.logic, L.VERSION, 'logic.js VERSION'); assert.equal(v.app, L.VERSION, 'app.js APP_VERSION'); assert.equal(v.capture, L.VERSION, 'capture.js VERSION');
  assert.ok(v.html.length >= 8 && v.html.every(x => x === L.VERSION), 'index.html 의 모든 js·css 에 ?v=' + L.VERSION + ' — ' + JSON.stringify(v.html));
});

console.log('\n' + passed + '개 통과' + (process.exitCode ? ' — 실패 있음' : ''));
