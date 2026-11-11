// 가상 샘플 파일 만들기: node scripts/make-samples.js
// js/sample-data.js 의 업무 52개 · 문서 24개를 엑셀 두 개로 씁니다(전부 지어낸 값).
//   samples/품질경영팀_업무목록_가상예시.xlsx — 「업무 목록」 시트(제목 · 빈 줄 · 머리행 · 52행, 구분은 묶음 첫 줄에만) + 「표지」 시트(시트 고르기 확인용)
//   samples/품질문서_목록_가상예시.xlsx    — 「문서 목록」 시트(개정일은 엑셀 날짜, 「2021-02」 같은 글자도 섞음)
// 방금 쓴 파일을 앱과 같은 방식으로 다시 읽어 개수 · 값이 원본과 같은지 확인합니다.
const fs = require('fs');
const path = require('path');
const XLSX = require('../vendor/xlsx.full.min.js');
const L = require('../js/logic.js');
const Sample = require('../js/sample-data.js');

const out = path.join(__dirname, '..', 'samples');
fs.mkdirSync(out, { recursive: true });
function readBack(file) {
  const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer', cellDates: true });
  return wb.SheetNames.map(n => ({ name: n, aoa: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null }) }));
}

// 업무 목록
const tFile = path.join(out, '품질경영팀_업무목록_가상예시.xlsx');
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['품질경영팀 업무 목록 (가상 예시)'], [], ['작성 목적', '업무 프로세스 정리 · 신입사원 교육 자료용'], ['비고', '업무명 · 주기 · 소요 시간 · 직책은 팀에서 정리한 엑셀과 같은 항목입니다. 값은 모두 지어낸 예시입니다.']]), '표지');
const ws = XLSX.utils.aoa_to_sheet(Sample.taskAoa());
ws['!cols'] = [{ wch: 5 }, { wch: 13 }, { wch: 26 }, { wch: 13 }, { wch: 11 }, { wch: 13 }, { wch: 46 }];
XLSX.utils.book_append_sheet(wb, ws, '업무 목록');
fs.writeFileSync(tFile, XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }));
const tSheets = readBack(tFile);
const tPick = L.pickSheet(tSheets, L.TASK_FIELDS);
const tp = L.parseTaskSheet(tPick.aoa);
if (tPick.name !== '업무 목록' || tp.tasks.length !== Sample.TASKS.length || tp.warnings.length) throw new Error('업무 목록 다시 읽기 실패: ' + tPick.name + ' ' + tp.tasks.length + ' ' + tp.warnings.join(' / '));
tp.tasks.forEach((t, i) => { const s = Sample.TASKS[i]; if (t.name !== s[1] || t.category !== s[0] || t.cycle !== s[2] || t.hours !== s[3] || t.role !== s[4] || t.docsText !== s[5]) throw new Error('값이 다름: ' + (i + 1) + '행 ' + t.name); });
console.log(path.basename(tFile), '업무', tp.tasks.length, '· 고른 시트', tPick.name);

// 문서 목록 — 개정일은 엑셀 날짜로(「2021-02」처럼 일이 없는 것은 글자 그대로)
const dFile = path.join(out, '품질문서_목록_가상예시.xlsx');
const daoa = Sample.docAoa().map((row, i) => i < 2 ? row : row.map((v, c) => (c === 4 && typeof v === 'string' && /^\d{4}-\d\d-\d\d$/.test(v)) ? new Date(v + 'T00:00:00') : v));
const wb2 = XLSX.utils.book_new();
const ws2 = XLSX.utils.aoa_to_sheet(daoa, { cellDates: true, dateNF: 'yyyy-mm-dd' });
ws2['!cols'] = [{ wch: 9 }, { wch: 24 }, { wch: 7 }, { wch: 7 }, { wch: 12 }, { wch: 13 }, { wch: 20 }];
XLSX.utils.book_append_sheet(wb2, ws2, '문서 목록');
fs.writeFileSync(dFile, XLSX.write(wb2, { bookType: 'xlsx', type: 'buffer', cellDates: true }));
const dp = L.parseDocSheet(readBack(dFile)[0].aoa);
if (dp.docs.length !== Sample.DOCS.length || dp.warnings.length) throw new Error('문서 목록 다시 읽기 실패: ' + dp.docs.length + ' ' + dp.warnings.join(' / '));
dp.docs.forEach((d, i) => {
  const s = Sample.DOCS[i], want = s[4] ? L.toISO(s[4]) : '';
  if (d.code !== s[0] || d.name !== s[1] || d.kind !== s[2] || d.revised !== want) throw new Error('값이 다름: ' + d.name + ' ' + d.revised + ' ≠ ' + want);
});
console.log(path.basename(dFile), '문서', dp.docs.length);
