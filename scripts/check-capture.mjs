// 헤드리스 브라우저로 업무 자료화 흐름 점검 (선택 — playwright-core 가 있는 PC 에서만, 2026-10-28)
//   PLAYWRIGHT_CORE=/경로/node_modules/playwright-core node scripts/check-capture.mjs
// file:// 로 index.html 을 열어:
//   옛 판 자료(schema 1) → 안내 · 옛 자료 유지(1단계 화면은 2026-11-10 메뉴에서 뺌, 주소로만) / 망가진 저장 자료 → 안내 · 앱 계속
//   → 샘플 → ① 자료 등록하기(txt EUC-KR · docx · xlsx · pdf 거절 · 사진) → ② 담당자에게 질문하기(답 · 설명 · AI 질문) → ③ AI 초안 작성(근거 · 흐름도 실측 · 확인 · 새 판 · 고치기)
//   → ④ 문서로 내보내기(Word · Excel · 체크리스트 · 1장 요약 · SVG · PNG) → ⑤ 신입 교육 자료로 보내기 → 백업(사진 포함) → 다시 열기
//   → 폭별 가로 넘침(360 · 390 · 768 · 1280) · JS 오류 0
// 점검기 자체 확인: BREAK=wide 이면 넓은 상자를 넣어 가로 넘침을 잡는지, BREAK=font 이면 흐름도 글자를 키워 넘침을 잡는지 봅니다.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const L = require('../js/logic.js');
const Sample = require('../js/sample-data.js');
const XLSX = require('../vendor/xlsx.full.min.js');
const url = 'file://' + path.join(root, 'index.html');
const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'd1009-'));

// 넣어 볼 파일들 — 모두 가상 내용
const files = {};
files.txt = path.join(tmp, '출하검사_메모.txt');
fs.writeFileSync(files.txt, Buffer.from([0xc3, 0xe2, 0xc7, 0xcf, 0x20, 0xb0, 0xcb, 0xbb, 0xe7])); // EUC-KR 「출하 검사」
files.docx = path.join(tmp, '부적합품_처리_지침서.docx');
{ const cfb = XLSX.CFB.utils.cfb_new({ fileType: 'zip' });
  XLSX.CFB.utils.cfb_add(cfb, '/[Content_Types].xml', Buffer.from('<Types/>'));
  XLSX.CFB.utils.cfb_add(cfb, '/word/document.xml', Buffer.from('<w:document xmlns:w="x"><w:body><w:p><w:r><w:t>지침 1. 표찰을 붙인다</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>항목</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>기준</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>', 'utf8'));
  fs.writeFileSync(files.docx, Buffer.from(XLSX.CFB.write(cfb, { fileType: 'zip', type: 'array' }))); }
files.xlsx = path.join(tmp, '시스템_입력항목.xlsx');
{ const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['항목', '필수'], ['품번', '예']]), '입력'); fs.writeFileSync(files.xlsx, Buffer.from(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))); }
files.pdf = path.join(tmp, '절차서.pdf'); fs.writeFileSync(files.pdf, '%PDF-1.4\n');
files.png = path.join(tmp, '현장사진.png');
fs.writeFileSync(files.png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDK+mmyAAAAABJRU5ErkJggg==', 'base64'));

const errors = [], problems = [];
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('dialog', d => d.accept());
function ok(cond, msg) { if (!cond) problems.push(msg); else console.log('  ok  ' + msg); }
async function go(hash) { await page.evaluate(h => { location.hash = h; }, hash); await page.waitForTimeout(200); }
async function clickText(sel, text) { await page.locator(sel, { hasText: text }).first().click(); await page.waitForTimeout(200); }
async function dl(fn) { const [d] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), fn()]); return d; }
async function text(sel) { return (await page.textContent(sel || 'main')) || ''; }
async function overflow() {
  return page.evaluate(() => {
    const W = document.documentElement.clientWidth, bad = [];
    document.querySelectorAll('body *').forEach(el => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.right <= W + 1) return;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const ox = getComputedStyle(p).overflowX; if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return; }
      bad.push((el.className && el.className.baseVal == null ? el.tagName.toLowerCase() + '.' + el.className : el.tagName.toLowerCase()) + ' → ' + Math.round(r.right));
    });
    return bad.slice(0, 5);
  });
}
/* 흐름도 글자 실측(getBBox) — scripts/check-browser.mjs 와 같은 방법 */
async function measureFlow(sel) {
  return page.evaluate(sel => {
    const svg = document.querySelector(sel + ' svg'); if (!svg) return ['흐름도 없음'];
    const out = [];
    function inRh(b, r) { const cx = r[0] + r[2] / 2, cy = r[1] + r[3] / 2; return [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].every(([x, y]) => Math.abs(x - cx) / (r[2] / 2) + Math.abs(y - cy) / (r[3] / 2) <= 1.02); }
    const texts = [...svg.querySelectorAll('text')];
    texts.forEach(t => {
      const d = t.getAttribute('data-box'); if (!d) return;
      const r = d.split(',').map(Number), b = t.getBBox();
      if (t.getAttribute('data-shape') === 'diamond') {
        [...t.querySelectorAll('tspan')].forEach(sp => { const n = sp.getNumberOfChars(); if (!n) return; const a = sp.getExtentOfChar(0), z = sp.getExtentOfChar(n - 1);
          if (!inRh({ x: a.x, y: a.y + a.height * 0.1, width: z.x + z.width - a.x, height: a.height * 0.8 }, r)) out.push('마름모 밖 글자: ' + sp.textContent); });
      } else if (b.x < r[0] - 1 || b.y < r[1] - 1 || b.x + b.width > r[0] + r[2] + 1 || b.y + b.height > r[1] + r[3] + 1) out.push('상자 밖 글자: ' + t.textContent.slice(0, 20));
    });
    const bs = texts.map(t => { const r = t.getBoundingClientRect(); return { t, b: r }; });
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) { const a = bs[i].b, c = bs[j].b; if (a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1) out.push('글자 겹침: ' + bs[i].t.textContent.slice(0, 12) + ' · ' + bs[j].t.textContent.slice(0, 12)); }
    return out;
  }, sel);
}

// 1) 옛 판(schema 1) 자료가 있는 브라우저
const oldDb = Sample.buildDb(L); oldDb.schema = 1; delete oldDb.works;
await page.goto(url);
await page.evaluate(v => { localStorage.clear(); localStorage.setItem('data10-09.db', v); }, JSON.stringify(oldDb));
await page.reload(); await page.waitForTimeout(300);
ok(await page.locator('#upgradeNotice').isVisible(), '옛 판 자료 → 「새 방향으로 바뀌었습니다」 안내');
const navT = await text('#nav');
ok(['자료 등록하기', '담당자에게 질문하기', 'AI 초안 작성', '문서로 내보내기', '신입 교육 자료 만들기'].every(x => navT.includes(x)), '메뉴 — 새 이름 ①~⑤');
ok(!['업무 목록 가져오기', '핵심 업무 선정', '문서 맵', '업무 흐름도', '기존 도구'].some(x => navT.includes(x)), '메뉴 — 1단계 화면 4개 · 「기존 도구」 없음(11-10 요청)');
ok((await text('#dataChip')).includes('업무 목록 52'), '옛 업무 목록 52개 그대로');
ok(await page.locator('select[aria-label="업무 목록에서 고르기"] option').count() === 53, '새 업무를 업무 목록(52)에서 고를 수 있음');
await go('#/core');
ok(await page.locator('.core-list li').count() === 12, '메뉴에서 뺀 핵심 업무 선정 — 주소로 열면 12개 그대로');
await go('#/flow');
ok(await page.locator('#flowPreview svg').count() === 1, '메뉴에서 뺀 업무 흐름도 — 주소로 열면 그대로');
await go('#/work');
await page.selectOption('select[aria-label="업무 목록에서 고르기"]', { label: '부적합품 처리 · 품질 엔지니어' });
await clickText('button', '이 업무로 시작');
ok(await page.locator('.work-item').count() === 1, '업무 목록의 업무로 자료화 시작');
await clickText('button', '전에 만든 흐름도를 자료로 넣기');
ok((await text()).includes('전에 만든 흐름도 단계 표 — 부적합품 처리'), '전에 만든 흐름도를 자료(M1)로');

// 2) 망가진 저장 자료
await page.evaluate(() => localStorage.setItem('data10-09.db', '{"tasks":[{"id":'));
await page.reload(); await page.waitForTimeout(300);
ok(await page.locator('#brokenNotice').isVisible(), '망가진 자료 → 안내, 앱은 열림');
ok(await page.evaluate(() => !!localStorage.getItem('data10-09.db.broken')), '읽지 못한 자료를 따로 남김');
ok((await dl(() => clickText('button', '읽지 못한 자료 내려받기'))).suggestedFilename().endsWith('.json'), '읽지 못한 자료 내려받기');

// 3) 샘플 한 바퀴
await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(300);
ok((await text()).includes('일하는 순서') && (await text()).includes('자료 등록하기'), '처음 화면 = ① 자료 등록하기');
await clickText('button', '샘플로 해 보기');
ok(await page.locator('#sampleBanner').isVisible(), '샘플 띠');
ok(await page.locator('.mat').count() === 3 && await page.locator('.img-item').count() === 1, '샘플 자료 3 · 사진 1');
ok(await page.evaluate(() => { const i = document.querySelector('.img-item img'); return new Promise(r => setTimeout(() => r(i && i.naturalWidth > 0), 300)); }), '사진(IndexedDB) 보임');
// 파일 넣기
await page.locator('#materials .drop input[type=file]').setInputFiles([files.txt, files.docx, files.xlsx]);
await page.waitForTimeout(800);
ok(await page.locator('.mat').count() === 6, 'txt · docx · xlsx 3개 → 자료 6개');
const mats = await text('#materials');
ok(mats.includes('출하검사_메모') && mats.includes('부적합품_처리_지침서') && mats.includes('시스템_입력항목'), '파일 이름으로 자료 이름');
ok(await page.evaluate(() => [...document.querySelectorAll('.mat textarea')].some(t => t.value.includes('출하 검사'))), 'EUC-KR txt 를 한글로 읽음');
ok(await page.evaluate(() => [...document.querySelectorAll('.mat textarea')].some(t => t.value.includes('항목 | 기준'))), 'docx 표 → 「항목 | 기준」');
await page.locator('#materials .drop input[type=file]').setInputFiles([files.pdf]); await page.waitForTimeout(300);
ok((await text('#toast')).includes('PDF'), 'PDF 는 붙여 넣기 안내');
await page.locator('#images input[type=file]').setInputFiles([files.png]); await page.waitForTimeout(600);
ok(await page.locator('.img-item').count() === 2, '사진 넣기 → P2');
await page.locator('.img-item input').nth(1).fill('현장 격리 구역 사진'); await page.locator('.img-item input').nth(1).press('Tab');
await page.locator('.paste-box summary').click();
await page.locator('.paste-box textarea').fill('주간 회의에서 부적합 현황을 공유한다.');
await clickText('.paste-box button', '자료로 넣기');
ok(await page.locator('.mat').count() === 7, '글로 붙여 넣기 → M7');

// ② 인터뷰
await go('#/interview');
ok(await page.locator('.qa').count() === 13 && await page.locator('.qa.done').count() === 11, '질문 13 · 답 11');
await page.locator('textarea[aria-label="Q6 답"]').fill('품질 엔지니어 선임에게 먼저 묻고, 그래도 애매하면 한도 견본을 봅니다.');
await page.locator('textarea[aria-label="Q6 답"]').press('Tab'); await page.waitForTimeout(150);
ok((await text('#qProg')).includes('답 12 / 질문 13'), '답 적으면 바로 저장 · 진행 12/13');
await page.locator('#transcripts textarea').fill('출하 전날에는 부적합 처리를 서둘러 끝내야 합니다.'); await clickText('#transcripts button', '설명으로 넣기');
ok((await text('#transcripts')).includes('T2'), '말로 한 설명 → T2');
await page.locator('#aiQ textarea[aria-label="AI 질문 답"]').fill('{"questions":[{"cat":"소요시간","q":"협력사 회신은 며칠 안에 받나요?","why":"M1 에 기한 없음"}]}');
await clickText('#aiQ button', '질문으로 읽기');
await clickText('#aiQ button', '고른 질문 더하기');
ok(await page.locator('.qa').count() === 14, 'AI 질문 더하기 → 14');
ok((await page.locator('#aiQ textarea[aria-label="질문 뽑기 프롬프트"]').inputValue()).includes('[M7]'), '질문 프롬프트에 새 자료 M7');

// ③ 초안
await go('#/draft');
ok((await page.locator('textarea[aria-label="초안 프롬프트"]').inputValue()).includes('[Q6] (예외 상황)'), '초안 프롬프트에 방금 답한 Q6');
ok(await page.locator('.mstep').count() === 9 && await page.locator('.mstep.basis-b-guess').count() === 1, '샘플 초안 v1 — 9단계 · AI 추정 1');
ok(await page.locator('#capFlow svg .node.dec').count() === 2, '흐름도 마름모 2');
if (process.env.BREAK === 'font') await page.addStyleTag({ content: '#capFlow svg text { font-size: 19px !important; }' });
const m1 = await measureFlow('#capFlow');
ok(m1.length === 0, '흐름도 글자 실측 넘침 · 겹침 0' + (m1.length ? ' — ' + m1.slice(0, 3).join(' / ') : ''));
ok(await page.locator('.mstep .mpics img').count() === 1, '3단계 아래 근거 사진 P1');
await page.locator('.mstep').nth(3).locator('.confirm input').check(); await page.waitForTimeout(150);
ok(await page.locator('.mstep.confirmed').count() === 4, '담당자 확인 4');
await clickText('button', '샘플 AI 답 넣기');
ok(await page.locator('#draftParsed tbody tr').count() === 9 && (await text('#draftParsed')).includes('M9'), '답 읽기 — 9단계 · 없는 근거 M9 알림');
await clickText('#draftParsed button', '새 판으로 저장');
ok((await text('#draftCard')).includes('v2') && await page.locator('.mstep.confirmed').count() === 4, '새 판 v2 — 확인 4개 이어받음');
await page.locator('.mstep').nth(6).locator('details summary').click();
const tIn = page.locator('.mstep').nth(6).locator('label.field', { hasText: '소요시간' }).locator('input');
await tIn.fill('15분'); await clickText('.mstep >> nth=6 >> button', '고쳐서 새 판으로');
ok((await text('#draftCard')).includes('v3') && (await text('#versions')).includes('7단계 소요시간'), '단계 고치기 → v3');
await page.locator('textarea[aria-label="AI 초안 답"]').fill('{"steps":[{"title":"가"'); await clickText('#draftPrompt button', '읽어서 확인');
ok((await text('#draftParsed')).includes('끊겼'), '끊긴 답 → 오류 안내, 저장 단추 없음');
ok(await page.locator('#draftParsed button', { hasText: '새 판으로 저장' }).count() === 0, '망가진 답은 저장 못 함');
await clickText('button', '② 담당자 질문으로 보내기');
ok(page.url().endsWith('#/interview') && await page.locator('.qa').count() > 14, '더 확인할 것 → 담당자 질문');

// ④ 내보내기
await go('#/export');
const names = [];
for (const b of ['Word 업무 방법서', 'Excel 단계표', '체크리스트 Excel', '1장 요약 Word', '흐름도 SVG', '흐름도 PNG']) names.push((await dl(() => clickText('button', b))).suggestedFilename());
ok(/^업무방법서_.*_v3\.doc$/.test(names[0]) && /\.xlsx$/.test(names[1]) && /인수인계체크리스트.*\.xlsx$/.test(names[2]) && /^1장요약.*\.doc$/.test(names[3]) && /\.svg$/.test(names[4]) && /\.png$/.test(names[5]), '내보내기 6가지: ' + names.join(', '));
const wd = await dl(() => clickText('button', 'Word 업무 방법서'));
const wordHtml = fs.readFileSync(await wd.path(), 'utf8');
ok(wordHtml.includes('AI 추정') && wordHtml.includes('data:image/') && wordHtml.includes('15분'), 'Word 에 AI 추정 · 그림 · 고친 값');
const xd = await dl(() => clickText('button', 'Excel 단계표'));
const xb = XLSX.read(fs.readFileSync(await xd.path()), { type: 'buffer' });
ok(xb.SheetNames.join(',') === '단계표,근거 자료,용어,더 확인할 것,인수인계 체크리스트' && XLSX.utils.sheet_to_json(xb.Sheets['단계표'], { header: 1 }).length === 10, 'Excel 5시트 · 단계표 9줄');
ok(await page.locator('#onePage').isVisible() && await page.locator('#handover .ho-list li').count() > 20, '1장 요약 · 인수인계 체크리스트 미리 보기');
await clickText('button', '⑤ 신입 교육 자료로 보내기'); await page.waitForTimeout(300);
const sent = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('data10-09.db')); const w = d.works[0], f = d.flows[w.taskId]; return f ? [f.steps.length, f.source, f.steps.filter(x => x.question).length] : null; });
ok(sent && sent[0] === 11 && sent[2] === 2 && /업무 자료화 v3/.test(sent[1]), '초안 흐름(11칸 · 판단 2) → 신입 교육 「부적합품 처리」 흐름도' + (sent ? '' : ' — 없음'));
ok(page.url().endsWith('#/edu') && (await text()).includes('신입 교육 자료 만들기') && await page.locator('#coreToggle').count() === 1, '보내면 ⑤ 신입 교육 자료 만들기로 넘어감 · 커리큘럼 넣기/빼기 단추');
if (await page.locator('#lessonCard button', { hasText: '흐름도로 초안 만들기' }).count()) await clickText('#lessonCard button', '흐름도로 초안 만들기');
ok(await page.locator('#paperBody .paper-flow svg').count() === 1 && (await text('#paperBody')).includes('부적합품 처리'), '⑤ — 보낸 흐름으로 교육 한 장 · 흐름도 그림');

// 백업(사진 포함) · 다시 열기
await go('#/settings');
const bk = await dl(() => clickText('button', 'JSON 백업 내려받기'));
const bj = JSON.parse(fs.readFileSync(await bk.path(), 'utf8'));
ok(bj.schema === 2 && bj.works.length === 1 && Object.keys(bj.images).length === 2, '백업 — 업무 1 · 사진 2 포함');
await page.reload(); await page.waitForTimeout(400);
await go('#/draft');
ok((await text('#draftCard')).includes('v3') && await page.locator('.mstep.confirmed').count() === 4, '다시 열어도 v3 · 확인 그대로');

// 업무 목록 바꾸기 · 비우기 (10-28 학생 요청 — 샘플 52개를 내 파일 목록으로)
files.tasks = path.join(tmp, '품질업무.xlsx');
{ const rows = [['업무명', '주기']]; for (let i = 1; i <= 37; i++) rows.push(['내 업무 ' + i, i % 2 ? '매일' : '']); rows.splice(5, 0, ['내 업무 3', '']); // 같은 이름 하나
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), '업무'); fs.writeFileSync(files.tasks, Buffer.from(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))); }
files.oneCol = path.join(tmp, '업무만.xlsx');
{ const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['고객 불만 접수'], ['협력사 감사']]), 'Sheet1'); fs.writeFileSync(files.oneCol, Buffer.from(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))); }
const dbNow = () => page.evaluate(() => JSON.parse(localStorage.getItem('data10-09.db')));
ok((await text('#dataChip')).includes('업무 목록 52(샘플)'), '머리 칩 — 업무 목록 52(샘플)');
await go('#/import');
ok(await page.locator('input[name=taskMode][value=replace]').isChecked(), '가져오기 화면 — 지금 목록이 샘플이면 「바꾸기」가 기본');
await page.locator('.drop input[type=file]').first().setInputFiles([files.tasks]); await page.waitForTimeout(600);
ok(await page.locator('#pendCard button', { hasText: '업무 목록 37개로 바꾸기' }).count() === 1, '가져오기 화면 바꾸기 — 「업무 목록 37개로 바꾸기」(같은 이름 1개 뺌)');
await clickText('#pendCard button', '업무 목록 37개로 바꾸기');
ok(await page.locator('#replaceDialog').isVisible(), '→ 화면 안 확인 창');
await clickText('#replaceDialog button', '취소');
ok(await page.locator('#replaceDialog').count() === 0 && (await dbNow()).tasks.length === 52, '취소하면 그대로 52');
await clickText('#pendCard button', '취소');
await go('#/work');
ok((await text('main')).includes('가상 샘플 업무 목록 52가지'), '고르기 안내 — 가상 샘플 52가지');
await page.locator('#taskFileBtn input').setInputFiles([files.tasks]); await page.waitForTimeout(600);
const dlgT = await text('#replaceDialog');
ok(dlgT.includes('업무 목록 52개 (가상 샘플)') && /업무 흐름도 [1-9]/.test(dlgT) && dlgT.includes('가상 문서 목록 24개') && dlgT.includes('업무 자료화 1개') && dlgT.includes('연결만 풀림 1개'), '① 「업무 목록 파일로 바꾸기」 → 확인 창: 지워지는 것(52 · 흐름도 · 문서 24) · 남는 것(업무 자료화 1, 연결만 풀림)');
await page.setViewportSize({ width: 360, height: 800 });
ok(await page.evaluate(() => { const r = document.querySelector('#replaceDialog').getBoundingClientRect(); return r.left >= 0 && r.right <= document.documentElement.clientWidth; }), '확인 창 360px 안에 들어옴');
await page.setViewportSize({ width: 1280, height: 900 });
await page.locator('#replaceOk').click(); await page.waitForTimeout(300);
let d1 = await dbNow();
ok(d1.tasks.length === 37 && !d1.tasks.some(t => /검사|부적합/.test(t.name)) && Object.keys(d1.flows).length === 0 && Object.keys(d1.lessons).length === 0 && d1.docs.length === 0 && d1.core.length > 0, '바꾸기 — 업무 37개만(샘플 · 흐름도 있는 업무도 빠짐) · 흐름도 · 문서 0 · 핵심 추천 다시');
ok(d1.works.length === 1 && d1.works[0].name === '수입검사 부적합품 처리' && d1.works[0].taskId === '' && d1.works[0].materials.length === 7 && d1.works[0].versions.length === 3, '업무 자료화는 그대로(자료 7 · 판 3), 잇기만 풂');
ok(d1.sample === false && d1.sampleWorks === true && d1.taskSource.name === '품질업무.xlsx', '샘플 표시 내림 · 출처 기록');
ok((await text('#dataChip')).includes('업무 목록 37 · 내 파일 품질업무.xlsx'), '머리 칩 — 업무 목록 37 · 내 파일 품질업무.xlsx');
ok((await text('main')).includes('「품질업무.xlsx」에서 넣은 업무 37가지') && await page.locator('select[aria-label="업무 목록에서 고르기"] option').count() === 38, '고르기 안내 · 목록 37가지');
ok((await text('#sampleBanner')).includes('업무 목록은 내 것으로'), '띠 — 업무 자료화 샘플만 남았다고');
await page.reload(); await page.waitForTimeout(400);
ok((await text('#dataChip')).includes('내 파일 품질업무.xlsx') && await page.locator('#sampleBanner').isVisible(), '다시 열어도 출처 · 띠 그대로');
// 제목 줄 없는 한 열 목록 → 열 연결 확인 → 바꾸기
await page.locator('#taskFileBtn input').setInputFiles([files.oneCol]); await page.waitForTimeout(600);
ok((await text('#pendCard')).includes('A열의 글자를 업무명으로'), '한 열 목록 — 안내 문구와 열 연결 화면');
await clickText('#pendCard button', '업무 목록 2개로 바꾸기'); await page.locator('#replaceOk').click(); await page.waitForTimeout(300);
ok((await dbNow()).tasks.map(t => t.name).join(',') === '고객 불만 접수,협력사 감사', '한 열 목록으로 바꿈');
// 비우기
await page.locator('#taskClearBtn').click();
ok((await text('#replaceDialog')).includes('업무 목록을 비울까요'), '비우기 확인 창');
await page.locator('#replaceOk').click(); await page.waitForTimeout(300);
d1 = await dbNow();
ok(d1.tasks.length === 0 && d1.works.length === 1 && d1.taskSource === null && !(await text('#dataChip')).includes('업무 목록'), '비우기 — 업무 0, 업무 자료화 1 그대로');

// 폭별 가로 넘침 (BREAK=wide: 점검기 자체 확인 — hash 이동은 다시 읽지 않으므로 넣은 스타일이 남음)
if (process.env.BREAK === 'wide') await page.addStyleTag({ content: '.page-head { min-width: 900px; }' });
for (const w of [360, 390, 768, 1280]) {
  await page.setViewportSize({ width: w, height: 900 });
  for (const r of ['#/work', '#/interview', '#/draft', '#/export', '#/edu', '#/settings']) {
    await go(r);
    const o = await overflow();
    if (o.length) problems.push(w + 'px ' + r + ' 가로 넘침: ' + o.join(', '));
  }
}
console.log(problems.some(p => /가로 넘침/.test(p)) ? '  !!  가로 넘침 있음' : '  ok  4가지 폭 × 6화면 가로 넘침 0');

ok(errors.length === 0, 'JS 오류 0 (file:// 에서 fresh-guard 조용함)' + (errors.length ? ' — ' + errors.slice(0, 3).join(' / ') : ''));
await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });
if (problems.length) { console.error('\n문제 ' + problems.length + '건:\n- ' + problems.join('\n- ')); process.exit(1); }
console.log('\n업무 자료화 브라우저 점검 통과');
