/* 가상 샘플 — 「수입검사 부적합품 처리」 업무 자료화 한 바퀴 (전부 지어낸 값, 2026-10-28)
   · 실제 회사의 절차서 · 답변이 아닙니다. 일반적인 제조업 품질보증 업무를 바탕으로 새로 썼고, 문서번호 · 메뉴 · 수치도 가상입니다.
   · 일부러 심어 둔 것 — 도구가 보여 줘야 할 것:
       ① 절차서(M1)는 「보고서 → 처리」 순서인데 담당자(Q2 · T1)는 「격리 → 시스템 등록 → 보고서」 순서로 한다(문서와 실제의 차이)
       ② 절차서에 없는 기준 수치(2% · 한도 견본)는 담당자 답변(Q3 · Q4)에만 있다
       ③ 답을 아직 못 받은 질문 2개(Q6 · Q13) — 여러 번에 나눠 인터뷰하는 모습
       ④ 샘플 AI 답(SAMPLE_ANSWER)에는 근거가 없는 단계 하나(「협력사 회신 확인」 → AI 추정)와 추정 칸(소요시간), 없는 근거 id(M9) 하나
   브라우저에서는 window.QWSampleCapture, node 에서는 require('./sample-capture.js'). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QWSampleCapture = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var TODAY = '2026-10-28';
  var NAME = '수입검사 부적합품 처리';

  var MATERIALS = [
    { name: '수입검사 부적합품 처리 절차서 (가상 예시, QP-05-1 Rev.2)', kind: '절차서', from: '붙여 넣기', text: [
      '1. 목적',
      '수입검사에서 불합격한 자재가 생산에 쓰이지 않도록 식별 · 격리하고 처리 방법을 정한다.',
      '2. 적용 범위',
      '협력사에서 들어온 원자재 · 부품 가운데 수입검사에서 불합격 판정된 로트.',
      '3. 책임',
      '- 검사원: 불합격품 식별 · 격리, 부적합 보고서 작성',
      '- 품질 엔지니어: 처리 방법 결정, 협력사 통보 및 시정조치 요구',
      '- 품질보증팀장: 특채(조건부 사용) 승인',
      '4. 절차',
      '4.1 검사원은 불합격 판정된 로트에 「불합격」 표찰을 붙인다.',
      '4.2 검사원은 부적합 보고서(QF-05)를 작성해 품질 엔지니어에게 넘긴다.',
      '4.3 검사원은 해당 로트를 부적합품 보관 구역으로 옮긴다.',
      '4.4 품질 엔지니어는 반품 · 선별 · 특채 가운데 처리 방법을 정한다.',
      '4.5 특채는 품질보증팀장 승인 후 진행한다.',
      '4.6 처리 결과는 부적합품 관리대장(QF-08)에 기록한다.',
      '4.7 협력사 원인이면 협력사에 시정조치를 요구한다.'
    ].join('\n') },
    { name: '부적합 보고서 작성 체크리스트 (가상)', kind: '체크리스트', from: '붙여 넣기', text: [
      '□ 품번 · 품명 · 로트번호',
      '□ 입고 수량 / 불량 수량',
      '□ 불량 내용(무엇이 · 어디가 · 얼마나)',
      '□ 불량 사진 첨부',
      '□ 검사 기준 항목(검사기준서의 어느 항목에 걸렸는지)',
      '□ 발견 일시 · 작성자'
    ].join('\n') },
    { name: '품질시스템 부적합 등록 화면 항목 (가상, 엑셀에서 옮김)', kind: '시스템 입력 항목', from: '품질시스템_입력항목_가상.xlsx', text: [
      '[시트: 부적합 등록]',
      '메뉴 | 품질관리 > 부적합 > 등록',
      '항목 | 필수 | 설명',
      '품번 | 필수 | 바코드로 읽으면 자동 입력',
      '로트번호 | 필수 |',
      '협력사 | 필수 | 품번을 넣으면 자동 선택',
      '불량 유형 코드 | 필수 | 목록에서 고름',
      '불량 수량 | 필수 |',
      '처리 구분 | 필수 | 반품 / 선별 / 특채 / 검토 중',
      '사진 | 선택 | 여러 장 첨부 가능'
    ].join('\n') }
  ];

  /* 기본 질문지(capture.js TEMPLATE) 순서대로의 답. null = 아직 못 받음 */
  var ANSWERS = [
    '수입검사 성적서에 불합격이 나오면 시작합니다. 협력사 성적서와 우리 검사 결과가 다를 때도 일단 「보류」로 두고 같은 순서로 시작해요.',
    '절차서에는 보고서를 먼저 쓰는 것처럼 되어 있지만, 실제로는 표찰 → 격리 → 시스템 등록을 바로 하고 보고서는 그다음에 씁니다. 창고가 입고 처리하기 전에 막아야 해서요.',
    '불량이 로트 수량의 2% 이하이고 기능에 상관없는 외관 불량이면 선별, 기능 불량이거나 치수가 공차를 넘으면 반품이 기본입니다. 특채는 생산 일정이 급하고 외관 불량일 때만 요청해요.',
    '도금 색이 조금 다른 건 한도 견본과 나란히 놓고 봅니다. 한도 견본은 검사실 2번 캐비닛에 있어요.',
    '생산이 그 자재를 당장 써야 하면 품질 엔지니어가 생산팀장과 통화해서 우리 쪽에서 먼저 선별하고, 협력사에는 선별 비용을 나중에 청구합니다.',
    null,
    '시스템 등록 전에 창고가 입고 처리해 버리는 경우가 제일 많아요. 표찰만 붙이고 등록을 미루면 안 됩니다. 사진을 안 찍어서 협력사가 불량을 인정하지 않는 경우도 있어요.',
    '부적합품을 격리 구역 밖에 두지 않습니다. 사진은 불량 부위 한 장, 라벨(품번 · 로트) 한 장 — 꼭 두 장 찍어요.',
    '부적합 보고서(QF-05)는 팀 공유 폴더 「품질/양식」에, 부적합품 관리대장(QF-08)은 같은 폴더의 엑셀 파일입니다.',
    '품질관리 > 부적합 > 등록 화면입니다. 불량 유형 코드가 헷갈리는데 외관은 A, 치수는 D 로 시작하는 코드를 고르면 됩니다.',
    '표찰부터 시스템 등록까지 30분, 보고서 20분 정도 걸리고, 처리 방법 결정까지는 보통 하루가 걸립니다.',
    '보고서는 품질 엔지니어에게 넘기고, 반품이면 구매팀에 반품 요청 메일을 보냅니다. 협력사에는 품질 엔지니어가 시정조치 요구서를 보내요.',
    null
  ];
  var TRANSCRIPT = { who: '검사원 김○○(가상)', text: '(말로 한 설명을 받아 적음) 불합격 나오면 저는 일단 빨간 표찰부터 붙여요. 그리고 지게차 기사님께 부탁해서 격리 구역으로 옮기고요. ' +
    '옮기고 나서 바로 시스템에 등록해요, 그래야 창고에서 입고를 못 하거든요. 금요일 오후에 들어온 건 처리 결정이 월요일에 나서 격리 구역이 꽉 차는 때가 있는데, 그땐 팀장님께 임시 구역을 받아요.' };
  /* 가상 시스템 화면 「캡처」 — 실제 화면이 아니라 이 샘플용으로 그린 그림 */
  var CAPTURE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360" font-family="Malgun Gothic, Apple SD Gothic Neo, sans-serif">' +
    '<rect width="640" height="360" fill="#f3f6fa"/><rect width="640" height="40" fill="#0f2544"/><text x="16" y="26" fill="#fff" font-size="15" font-weight="700">품질시스템(가상) · 품질관리 &gt; 부적합 &gt; 등록</text>' +
    ['품번', '로트번호', '협력사', '불량 유형 코드', '불량 수량', '처리 구분'].map(function (t, i) {
      var y = 70 + i * 40;
      return '<text x="24" y="' + (y + 18) + '" font-size="14" fill="#16202c">' + t + (i < 6 ? ' *' : '') + '</text><rect x="170" y="' + y + '" width="300" height="28" rx="4" fill="#fff" stroke="#9aa7b8"/>' +
        (i === 3 ? '<text x="180" y="' + (y + 19) + '" font-size="13" fill="#56616f">A12 외관 · 도금 색상 ▾</text>' : i === 5 ? '<text x="180" y="' + (y + 19) + '" font-size="13" fill="#56616f">검토 중 ▾</text>' : '');
    }).join('') +
    '<rect x="490" y="310" width="120" height="34" rx="6" fill="#2f73d9"/><text x="550" y="332" font-size="14" fill="#fff" text-anchor="middle">등록</text>' +
    '<text x="24" y="340" font-size="12" fill="#b3261e">* 필수 · 이 그림은 샘플용 가상 화면입니다</text></svg>';
  var CAPTURE_URL = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(CAPTURE_SVG);

  /* 샘플 AI 답 — 회사가 허용한 AI 에 draftPrompt 를 넣었을 때 돌아올 법한 모양(손으로 지음). 코드 블록 · 앞 설명을 일부러 둠 */
  var SAMPLE_ANSWER = '아래는 요청하신 형식의 초안입니다.\n```json\n' + JSON.stringify({
    title: NAME,
    summary: '수입검사에서 불합격한 로트가 생산에 섞이지 않도록 표찰 · 격리 · 시스템 등록을 먼저 하고, 보고서와 처리 결정으로 이어 가는 업무입니다. 협력사 원인이면 시정조치를 요구합니다.',
    steps: [
      { no: 1, title: '불합격 로트에 표찰 붙이기', who: '검사원', input: '수입검사 성적서의 불합격 판정(협력사 성적서와 다르면 「보류」)', how: '불합격 판정이 나오면 해당 로트에 빨간 「불합격」 표찰을 바로 붙입니다.\n로트 전체에 붙였는지 확인합니다.', criteria: '검사기준서 항목에 맞지 않으면 불합격', exceptions: '', cautions: '', forms: '「불합격」 표찰', time: '', refs: ['M1', 'Q1', 'T1'] },
      { no: 2, title: '격리 구역으로 옮기기', who: '검사원', input: '표찰을 붙인 로트', how: '지게차 기사에게 부탁해 부적합품 보관(격리) 구역으로 옮깁니다.', criteria: '', exceptions: '격리 구역이 꽉 차면(금요일 오후 입고분 등) 팀장에게 임시 구역을 받습니다.', cautions: '격리 구역 밖에 두지 않습니다.', forms: '', time: '', refs: ['M1', 'Q2', 'Q8', 'T1'] },
      { no: 3, title: '품질시스템에 부적합 등록', who: '검사원', input: '품번 · 로트번호 · 불량 수량', how: '품질관리 > 부적합 > 등록 화면에서 필수 항목을 채우고 처리 구분은 「검토 중」으로 둡니다.\n사진을 함께 올립니다.', criteria: '불량 유형 코드: 외관은 A, 치수는 D 로 시작하는 코드', exceptions: '', cautions: '창고가 입고 처리하기 전에 등록합니다. 표찰만 붙이고 등록을 미루는 실수가 가장 많습니다.', forms: '품질관리 > 부적합 > 등록 (사진 첨부)', time: '표찰부터 등록까지 30분', refs: ['M3', 'P1', 'Q2', 'Q7', 'Q10', 'Q11'] },
      { no: 4, title: '부적합 보고서 작성', who: '검사원', input: '시스템 등록 내용, 불량 사진', how: '체크리스트 항목을 빠짐없이 채워 부적합 보고서를 쓰고 품질 엔지니어에게 넘깁니다.', criteria: '', exceptions: '', cautions: '사진은 불량 부위 한 장, 라벨(품번 · 로트) 한 장 — 두 장을 꼭 붙입니다. 사진이 없으면 협력사가 인정하지 않을 수 있습니다.', forms: '부적합 보고서(QF-05), 팀 공유 폴더 「품질/양식」', time: '20분', refs: ['M1', 'M2', 'Q7', 'Q8', 'Q9', 'Q11'] },
      { no: 5, title: '처리 방법 정하기', who: '품질 엔지니어', input: '부적합 보고서', how: '불량 내용과 수량을 보고 반품 · 선별 · 특채 가운데 처리 방법을 정하고 시스템의 처리 구분을 바꿉니다.', criteria: '불량이 로트의 2% 이하이고 외관 불량이면 선별, 기능 불량이거나 치수가 공차를 넘으면 반품. 도금 색은 한도 견본(검사실 2번 캐비닛)과 비교.', exceptions: '생산이 당장 써야 하면 생산팀장과 통화해 우리 쪽에서 먼저 선별하고 협력사에 비용을 나중에 청구합니다.', cautions: '', forms: '', time: '보통 하루', refs: ['M1', 'Q3', 'Q4', 'Q5', 'Q11', 'M9'] },
      { no: 6, title: '특채 승인 받기', who: '품질보증팀장', input: '특채 요청(생산 일정이 급하고 외관 불량일 때만)', how: '품질 엔지니어가 특채를 요청하면 팀장이 승인합니다. 승인 전에는 사용하지 않습니다.', criteria: '', exceptions: '', cautions: '', forms: '', time: '', refs: ['M1'] },
      { no: 7, title: '처리 결과 기록', who: '품질 엔지니어', input: '처리 결정', how: '부적합품 관리대장에 처리 결과를 적습니다. 반품이면 구매팀에 반품 요청 메일을 보냅니다.', criteria: '', exceptions: '', cautions: '', forms: '부적합품 관리대장(QF-08, 공유 폴더 엑셀)', time: '10분', refs: ['M1', 'Q9', 'Q12'], guess: ['time'] },
      { no: 8, title: '협력사에 시정조치 요구', who: '품질 엔지니어', input: '협력사 원인으로 확인된 부적합', how: '협력사에 시정조치 요구서를 보냅니다.', criteria: '', exceptions: '', cautions: '', forms: '시정조치 요구서', time: '', refs: ['Q12'] },
      { no: 9, title: '협력사 회신 확인', who: '품질 엔지니어', input: '시정조치 회신', how: '회신 기한 안에 대책이 왔는지 확인하고, 다음 입고 때 효과를 봅니다.', criteria: '', exceptions: '', cautions: '', forms: '', time: '', refs: [], basis: '추정' }
    ],
    flow: [
      { step: 1, name: '불합격 로트에 표찰', who: '검사원' },
      { step: 2, name: '격리 구역으로 옮기기', who: '검사원' },
      { step: 3, name: '시스템에 부적합 등록', who: '검사원' },
      { step: 4, name: '부적합 보고서 작성', who: '검사원' },
      { step: 5, name: '처리 방법 정하기', who: '품질 엔지니어' },
      { step: 6, question: '특채가 필요한가?', who: '품질 엔지니어', yes: 7, no: 8 },
      { step: 7, name: '특채 승인', who: '품질보증팀장' },
      { step: 8, name: '처리 결과 기록', who: '품질 엔지니어' },
      { step: 9, question: '협력사 원인인가?', who: '품질 엔지니어', yes: 10, no: '끝' },
      { step: 10, name: '시정조치 요구', who: '품질 엔지니어' },
      { step: 11, name: '회신 확인', who: '품질 엔지니어', next: '끝' }
    ],
    glossary: [
      { term: '특채', meaning: '기준에 맞지 않지만 조건을 붙여 쓰기로 승인하는 것(조건부 사용)' },
      { term: '선별', meaning: '로트 안에서 좋은 것과 불량을 하나씩 골라내는 것' },
      { term: '한도 견본', meaning: '합격 · 불합격 경계를 눈으로 비교하려고 보관하는 견본' },
      { term: '표찰', meaning: '불합격 로트에 붙이는 식별 표시' }
    ],
    open_questions: [
      '절차서 M1 은 보고서(4.2) 뒤에 격리(4.3)인데, 담당자는 격리 · 시스템 등록을 먼저 합니다. 절차서 개정이 필요한지 확인해 주세요.',
      '판단이 애매할 때 누구에게 묻는지(Q6) 아직 답이 없습니다.',
      '협력사 시정조치 회신 기한(며칠)이 자료와 답변에 없습니다.',
      '처리 결과 기록 소요시간(10분)은 추정입니다.'
    ]
  }, null, 1) + '\n```\n확인이 필요한 부분은 open_questions 에 적었습니다.';

  /* 샘플 업무 만들기 — 앱과 테스트가 같은 길로. C = QWCapture */
  function buildWork(C, opts) {
    opts = opts || {};
    var w = C.emptyWork(NAME, { id: opts.id || 'W1', taskId: opts.taskId || '', owner: '검사원 김○○ · 품질 엔지니어 이○○ (가상)', today: TODAY });
    MATERIALS.forEach(function (m) { C.addMaterial(w, m, TODAY); });
    w.images.push({ id: 'P1', key: opts.imageKey || 'sample-P1', name: '부적합등록화면_가상.svg', caption: '품질시스템 부적합 등록 화면(가상) — 불량 유형 코드 · 처리 구분', w: 640, h: 360, at: TODAY });
    w.questions = C.templateQuestions([]);
    ANSWERS.forEach(function (a, i) { if (a) C.setAnswer(w, w.questions[i].id, a, i < 6 ? '2026-10-27' : TODAY); });
    C.addTranscript(w, TRANSCRIPT.text, TRANSCRIPT.who, '2026-10-27');
    if (opts.withDraft !== false) {
      var r = C.parseDraftAnswer(SAMPLE_ANSWER, w);
      C.addVersion(w, r.draft, '샘플 AI 답(첫 판)', TODAY);
      [0, 1, 2].forEach(function (i) { C.setConfirmed(w, i, true, TODAY); });
    }
    return w;
  }

  return { NAME: NAME, TODAY: TODAY, MATERIALS: MATERIALS, ANSWERS: ANSWERS, TRANSCRIPT: TRANSCRIPT, CAPTURE_SVG: CAPTURE_SVG, CAPTURE_URL: CAPTURE_URL, SAMPLE_ANSWER: SAMPLE_ANSWER, buildWork: buildWork };
});
