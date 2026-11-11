// 헤드리스 브라우저로 주요 흐름 점검 (선택 — playwright-core 가 있는 PC 에서만)
//   PLAYWRIGHT_CORE=/경로/node_modules/playwright-core node scripts/check-browser.mjs
// 2026-11-10 — 이 화면들(핵심 업무 · 문서 맵 · 흐름도 · 가져오기)은 메뉴에서 뺐고 주소(#/core 등)로만 열립니다. 신입 교육은 ⑤ 로 옮김.
// file:// 로 index.html 을 열어 샘플 → ① 핵심 업무 → ② 문서 맵(4개 보기) → ③ 흐름도(3개 + 긴 글자 표) → ④ 신입 교육 → 설정 → 엑셀 가져오기 순서로 누르고,
// JS 오류 · 폭별 가로 넘침 · 흐름도 SVG 의 실제 글자 상자(getBBox)가 도형 밖으로 나가거나 서로 겹치는지 잽니다.
// 점검기 자체 확인: BREAK=font 이면 흐름도 글자를 크게 키워 「넘침」을, BREAK=wide 이면 넓은 상자를 넣어 「가로 넘침」을 잡는지 봅니다.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const url = 'file://' + path.join(root, 'index.html');

const errors = [], problems = [];
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('dialog', d => d.accept());
function ok(cond, msg) { if (!cond) problems.push(msg); else console.log('  ok  ' + msg); }
async function go(hash) { await page.evaluate(h => { location.hash = h; }, hash); await page.waitForTimeout(150); }
async function clickText(sel, text) { await page.locator(sel, { hasText: text }).first().click(); await page.waitForTimeout(150); }
async function dl(fn) { const [d] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }), fn()]); return d.suggestedFilename(); }

/* 흐름도 SVG 실측 — 글자(tspan 묶음)의 실제 상자가 자기 도형 안에 있는지, 글자끼리 · 꼬리표와 도형이 겹치지 않는지 */
async function measureFlow() {
  return page.evaluate(() => {
    const svg = document.querySelector('#flowPreview svg');
    if (!svg) return ['흐름도 없음'];
    const out = [];
    const texts = [...svg.querySelectorAll('text')];
    const box = t => t.getBBox();
    function inRhombus(b, r) {
      const cx = r[0] + r[2] / 2, cy = r[1] + r[3] / 2;
      return [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].every(([x, y]) => Math.abs(x - cx) / (r[2] / 2) + Math.abs(y - cy) / (r[3] / 2) <= 1.02);
    }
    texts.forEach(t => {
      const d = t.getAttribute('data-box'); if (!d) return;
      const r = d.split(',').map(Number), b = box(t), tol = 1;
      if (t.getAttribute('data-shape') === 'diamond') {
        // 줄마다 따로 잼(tspan) — 위아래 여백(leading)을 빼려고 글자 높이의 0.8 만 씀
        [...t.querySelectorAll('tspan')].forEach(sp => {
          const n = sp.getNumberOfChars(); if (!n) return;
          const a = sp.getExtentOfChar(0), z = sp.getExtentOfChar(n - 1);
          const lb = { x: a.x, y: a.y + a.height * 0.1, width: z.x + z.width - a.x, height: a.height * 0.8 };
          if (!inRhombus(lb, r)) out.push('마름모 밖 글자: 「' + sp.textContent + '」');
        });
      } else if (b.x < r[0] - tol || b.y < r[1] - tol || b.x + b.width > r[0] + r[2] + tol || b.y + b.height > r[1] + r[3] + tol) {
        out.push('상자 밖 글자: 「' + t.textContent.slice(0, 30) + '」 ' + [b.x, b.y, b.width, b.height].map(Math.round) + ' / ' + r.map(Math.round));
      }
    });
    // 글자끼리 겹침 — 제목은 칸 묶음(g) 밖이라 좌표계가 달라 화면 좌표(getBoundingClientRect)로 잼
    const bs = texts.map(t => { const r = t.getBoundingClientRect(); return { t, b: { x: r.left, y: r.top, width: r.width, height: r.height } }; });
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i].b, c = bs[j].b;
      if (a.x < c.x + c.width - 1 && c.x < a.x + a.width - 1 && a.y < c.y + c.height - 1 && c.y < a.y + a.height - 1)
        out.push('글자 겹침: 「' + bs[i].t.textContent.slice(0, 16) + '」 · 「' + bs[j].t.textContent.slice(0, 16) + '」');
    }
    // 꼬리표(예 · 아니오) 바탕이 도형을 가리는지
    const shapes = [...svg.querySelectorAll('.node')].map(n => n.getBBox());
    svg.querySelectorAll('.edge-label-bg').forEach(l => {
      const a = l.getBBox();
      shapes.forEach(c => { if (a.x < c.x + c.width - 1 && c.x < a.x + a.width - 1 && a.y < c.y + c.height - 1 && c.y < a.y + a.height - 1) out.push('꼬리표가 도형을 가림'); });
    });
    return out;
  });
}
/* 가로 넘침 — 요소 오른쪽 끝이 화면 폭을 넘는지(안쪽 스크롤 상자 안은 의도된 스크롤이라 뺌) */
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

await page.goto(url);
if (process.env.BREAK === 'wide') await page.addStyleTag({ content: '.page-head { min-width: 900px; }' });
if (process.env.BREAK === 'font') await page.addStyleTag({ content: '#flowPreview svg text { font-size: 19px !important; }' });
ok((await page.textContent('main')).includes('자료 등록하기'), '처음 화면 = ① 자료 등록하기(2026-11-10 이름 변경)');
await go('#/import');
ok((await page.textContent('main')).includes('업무 목록 · 문서 목록 가져오기'), '업무 목록 가져오기(주소로만)');
await clickText('button', '샘플로 시작');
ok(await page.locator('#sampleBanner').isVisible(), '샘플 띠 보임');
ok(page.url().endsWith('#/work'), '샘플 → ① 자료 등록하기로 넘어감');
await go('#/core');
ok(await page.locator('.core-list li').count() === 12, '핵심 업무 12개');
ok((await page.textContent('#dataChip')).includes('업무 목록 52'), '머리 칩: 업무 목록 52');

// ① — 고객 영향 바꾸기 · 체크 빼기 · 상위로 고르기 · 엑셀
for (let k = 0; k < 3; k++) { await page.locator('.core-table tbody tr.picked').first().locator('input[type=checkbox]').click(); await page.waitForTimeout(150); }
ok(await page.locator('.core-list li').count() === 9, '체크 해제로 핵심 9개');
ok((await page.textContent('main')).includes('1개 더'), '범위 밖 경고');
await clickText('button', '점수 상위 12개로 고르기');
ok(await page.locator('.core-list li').count() === 12, '점수 상위 12개로 다시');
ok(/핵심업무_선정_.*\.xlsx/.test(await dl(() => clickText('button', '엑셀로'))), '① 엑셀 내려받기');

// ② 문서 맵
await go('#/docs');
ok(await page.locator('.map-card').count() === 12, '문서 맵 카드 12개');
await clickText('.tabs button', '연결표');
const before = await page.locator('td.mx.on').count();
await page.locator('td.mx button').first().click(); await page.waitForTimeout(150);
ok(await page.locator('td.mx.on').count() !== before, '연결표 칸 누르면 연결 바뀜');
ok(await page.locator('td.mx.flow').count() >= 3, '○ 흐름도에 나오지만 연결 안 됨 표시');
await clickText('.tabs button', '체크리스트');
const ck = await page.textContent('main');
ok(ck.includes('포장 사양서') && ck.includes('거래명세서') && ck.includes('작업표준서') && ck.includes('신뢰성 시험 지침'), '체크리스트에 심어 둔 항목');
const nLink = await page.locator('button', { hasText: '연결표에 넣기' }).count();
await clickText('button', '연결표에 넣기');
ok(await page.locator('button', { hasText: '연결표에 넣기' }).count() === nLink - 1, '「연결표에 넣기」로 항목 하나 줄어듦');
await page.locator('.check-list input[type=checkbox]').first().click(); await page.waitForTimeout(100);
ok(await page.locator('.check-list li.done').count() === 1, '확인 표시');
await clickText('.tabs button', '문서 목록');
await page.locator('label.field', { hasText: '문서명' }).locator('input').fill('거래명세서');
await clickText('button', '넣기');
ok((await page.textContent('main')).includes('문서 목록 25개'), '문서 직접 넣기');

// ③ 흐름도 — 샘플 3개 실측
await go('#/flow');
for (const name of ['수입검사 실시', '부적합품 처리', '고객 클레임 대응']) {
  const opt = await page.locator('select[aria-label="업무 고르기"] option', { hasText: name }).first().getAttribute('value');
  await page.selectOption('select[aria-label="업무 고르기"]', opt); await page.waitForTimeout(200);
  const m = await measureFlow();
  ok(m.length === 0, '흐름도 실측 「' + name + '」 글자 넘침 · 겹침 0' + (m.length ? ' — ' + m.slice(0, 4).join(' / ') : ''));
}
ok(/\.svg$/.test(await dl(() => clickText('button', 'SVG'))), 'SVG 내려받기');
ok(/\.png$/.test(await dl(() => clickText('button', 'PNG'))), 'PNG 내려받기');
// 단계 고치기 → 그림 다시 그림
const firstName = page.locator('fieldset.step').first().locator('input').first();
await firstName.fill('클레임 접수 및 고객 요구 사항 정리'); await firstName.press('Tab'); await page.waitForTimeout(200);
ok((await page.textContent('#flowPreview')).replace(/\s/g, '').includes('고객요구사항정리'), '단계명 고치면 흐름도에 반영');
// AI 답(긴 글자 · 판단 여러 개)을 붙여 넣어 새 업무에 적용 → 실측
const other = await page.locator('select[aria-label="업무 고르기"] option', { hasText: '출하검사 실시' }).first().getAttribute('value');
await page.selectOption('select[aria-label="업무 고르기"]', other); await page.waitForTimeout(200);
const ans = ['| 순서 | 단계명 | 담당 | 입력 문서 | 산출 문서 | 판단 질문 | 예 | 아니오 | 다음 |', '|---|---|---|---|---|---|---|---|---|',
  '| 1 | 출하 대기 제품 로트 확인 및 출하 지시서 대조 | 물류팀 출하 담당 | 출하 지시서 |  |  |  |  |  |',
  '| 2 | 출하검사 기준에 따른 외관·치수 검사 | 검사원 | 검사기준서, 출하검사 절차서 | 출하 성적서 |  |  |  |  |',
  '| 3 | 판정 | 검사원 |  |  | 외관과 치수 기준을 모두 만족하고 포장 상태도 이상이 없는가? | 4 | 5 |  |',
  '| 4 | 출하 승인 및 성적서 발행 | 검사원 |  | 출하 성적서 |  |  |  | 끝 |',
  '| 5 | 출하 보류·부적합 처리 | 품질 엔지니어 |  | 부적합 보고서 |  |  |  |  |',
  '| 6 | 재검사 | 검사원 |  |  | 재검사에 합격했는가? | 4 | 끝 |  |'].join('\n');
await page.locator('#aiFlow textarea').last().fill(ans);
await clickText('#aiFlow button', '표로 읽기');
await clickText('#aiFlow button', '이 표로 바꾸기');
ok(await page.locator('fieldset.step').count() === 6, 'AI 답 → 단계 표 6단계');
const m2 = await measureFlow();
ok(m2.length === 0, '흐름도 실측 「AI 답(긴 글자)」 넘침 · 겹침 0' + (m2.length ? ' — ' + m2.slice(0, 4).join(' / ') : ''));

// ④ 신입 교육
await go('#/edu');
ok(await page.locator('.week').count() === 4, '커리큘럼 4주');
ok(await page.locator('#paperBody .quiz > li').count() === 3, '교육 한 장 퀴즈 3문항');
ok(await page.locator('#paperBody svg').count() === 1, '교육 한 장에 흐름도');
ok(/\.doc$/.test(await dl(() => clickText('button', 'Word 로'))), '교육 한 장 Word');
const ship = await page.locator('select[aria-label="교육 한 장 업무"] option', { hasText: '출하검사 실시' }).first().getAttribute('value');
await page.selectOption('select[aria-label="교육 한 장 업무"]', ship); await page.waitForTimeout(200);
await clickText('button', '흐름도로 초안 만들기');
ok(await page.locator('#paperBody .quiz > li').count() === 3, '출하검사 — 흐름도로 퀴즈 3문항 초안');
await page.locator('textarea[placeholder^="「목적:"]').fill('목적: 출하 전 마지막 확인을 익힙니다.\n자주 하는 실수:\n- 포장 확인 생략\n- 성적서 늦게 발행');
await clickText('button', '읽어서 반영');
ok((await page.textContent('#paperBody')).includes('포장 확인 생략'), 'AI 답 반영(실수 칸)');
ok(/커리큘럼.*\.xlsx/.test(await dl(() => clickText('#curCard button', '엑셀로'))), '커리큘럼 엑셀');

// 설정 · 백업
await go('#/settings');
ok((await page.textContent('main')).includes('AI 연결 설정'), '설정 화면');
ok(/백업.*\.json/.test(await dl(() => clickText('button', 'JSON 백업 내려받기'))), 'JSON 백업');

// 폭별 가로 넘침
for (const w of [360, 390, 768, 1024, 1280, 1440]) {
  await page.setViewportSize({ width: w, height: 900 });
  for (const r of ['#/import', '#/core', '#/docs', '#/flow', '#/edu', '#/settings']) {
    await go(r);
    const o = await overflow();
    if (o.length) problems.push(w + 'px ' + r + ' 가로 넘침: ' + o.join(', '));
  }
  for (const tab of ['문서 맵', '연결표', '문서 목록', '체크리스트']) { await go('#/docs'); await clickText('.tabs button', tab); const o = await overflow(); if (o.length) problems.push(w + 'px 문서 맵(' + tab + ') 가로 넘침: ' + o.join(', ')); }
}
console.log(problems.some(p => /가로 넘침/.test(p)) ? '  !!  가로 넘침 있음' : '  ok  6가지 폭 × 6화면(+문서 맵 4보기) 가로 넘침 0');
await page.setViewportSize({ width: 1280, height: 900 });

// 실제 파일 넣기 — 데이터 지우고 샘플 엑셀 두 개
await go('#/import');
await clickText('button', '모든 데이터 지우기');
await page.locator('.drop input[type=file]').first().setInputFiles(path.join(root, 'samples/품질경영팀_업무목록_가상예시.xlsx'));
await page.waitForTimeout(400);
ok((await page.textContent('main')).includes('머리행 3행 · 업무 52개'), '업무 목록 엑셀 — 「업무 목록」 시트 · 머리행 3행 · 52개');
await clickText('button', '업무 목록 52개 반영');
await page.locator('.drop input[type=file]').nth(1).setInputFiles(path.join(root, 'samples/품질문서_목록_가상예시.xlsx'));
await page.waitForTimeout(400);
await clickText('button', '문서 목록 24개 반영');
const cnt = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('data10-09.db')); return [d.tasks.length, d.core.length, d.docs.length, d.works.length].join(' · '); });
ok(cnt === '52 · 12 · 24 · 0', '엑셀 두 개로 업무 52 · 핵심 12 · 문서 24 (업무 자료화 0) — ' + cnt);

ok(errors.length === 0, 'JS 오류 0' + (errors.length ? ' — ' + errors.slice(0, 3).join(' / ') : ''));
await browser.close();
if (problems.length) { console.error('\n문제 ' + problems.length + '건:\n- ' + problems.join('\n- ')); process.exit(1); }
console.log('\n브라우저 점검 통과');
