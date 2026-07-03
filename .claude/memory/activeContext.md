# Active Context — kordoc 본체

**마지막 업데이트**: 2026-07-03 (연속 세션 8: 렌더 모듈화 → v3.10.0/v3.10.1 릴리스 + 스레드 카드)
**상태**: 테스트 683/683 (렌더 10 신규). `npm run bench:gate` 5체인 전부 PASS. tsc 14(동수 — 기록 13은 구식)

## 이번 세션 완료 (2026-07-03 연속 8차)

- **⓪ 한컴 실물 확인**: 수식검증 hwpx 2개 사용자 확인 — 전부 정상. 픽스 불필요
- **① 렌더 모듈화 → v3.10.0** — PoC(.claude/plans/render-poc)를 src/render/ 3모듈로:
  `layout.ts`(toInt32·열 경계 전파 솔버·행 높이 max+콘텐츠 성장),
  `head-styles.ts`(charPr/paraPr 정렬/borderFill), `svg-render.ts`(본체).
  CLI `kordoc render <hwpx> -o out.svg` + `renderHwpxToSvg` API 노출.
  **잔여 4건 전원 해소 — 오진 2건 정정**: 컨테이너 누락의 진범=uint32 음수
  vertOffset(4294967103=−193)+셀 안 COLUMN 기준계(페이지→셀 영역), 탭 청크
  겹침의 진범=41열 그리드 span-1 부재(경계 전파 솔버로 해결). 인라인=lineseg
  위치+baseline, run별 charPr(크기·굵기·색·밑줄·장평·자간, 자연폭=text-metrics
  hmtx 재사용), horzsize=줄 영역 폭(마지막 줄만 정렬 분기, 중간 줄 textLength
  고정), 연속 공백(2+) 조각 절단(공무원 스페이스 정렬 대응), borderFill
  배경/테두리(직인표 팬텀 제거), 셀 수직정렬, imgClip 크롭, 행 성장(사진 셀
  25251 실측 일치). 검증=결재문서 2종+사진대지 스크린샷, 코퍼스 hwpx 85건
  크래시/NaN 0, tests/render.test.ts 10건
- **② v3.10.1** — SVG width/height **pt 단위 명시** (단위 없는 px는 A4 실물보다
  25% 축소 — 사용자가 "쏠림"으로 발견). npm+태그+gh release 2건 모두 완료
- **③ 문서 현행화** — README(기능 불릿+v3.10 섹션+사용법+CLI+API표+타입),
  CHANGELOG, CLAUDE.md 모듈표(render 3행), findings.md(모듈화 결과+오진 정정 기록)
- **④ 스레드 카드** — threads-post 스킬로 기안문 패러디 카드(1080×1350,
  "딴짓하는 류주임" 발신·주말은없음 도장·결재란 지표 4칸) 제작. 사용자 피드백
  반영(단어 줄바꿈 keep-all·렌더 설명 쉬운말·v3.8.0~3.8.3 항목 4건 추가).
  캡션 컨펌 완료. **발행은 사용자가 직접** (자동 게시 스크립트 없음 — 패키지 전달됨)

## 지표 대시보드 (2026-07-03 연속 8차 종료 — v3.10.1)

| 트랙 | 지표 | 값 | 게이트 | 비고 |
|---|---|---|---|---|
| hwpx(85) | recallMicro / phantom | **1.0** / 0.000054 | 0.999 / 0.005 | |
| hwpx | 표 exact / cellF1 | **611/611** / 1.0 | 0.99 / 0.999 | |
| pdf(48) | coverage(micro) | **0.99609** | 0.985 | 미달 1건 = eval-perf-2024 0.9785 |
| hwp쌍(10) | 유사도 / 커버 | **0.9946 / 0.9929** | 0.99 / 0.99 | |
| formats | docx/xlsxStr/hml | 0.998903/**1.0**/0.995974 | 0.998/0.999/0.995 | |
| roundtrip | fwd / bwd / 헤딩 / 수식 / 줄 | **0.999632 / 0.99915** / 0 / 0 / 0 | 0.999/0.998/0/0/0 | |
| pdf표GT(6쌍) | 매칭/exact/cellF1 | **0.8472/0.5417/0.6324** | 0.845/0.54/0.63 | 분할병합 0 = 차기 메인 |
| fuzz(792런) | crash/hang/noCode/slow/genInvalid | **0/0/0/0/0** | 전부 0 | |
| 렌더 | 코퍼스 hwpx 스모크 | **85/85** 크래시·NaN 0 | 테스트 10/10 | ✨신설 |
| 테스트/tsc | **683/683** / 14(동수) | — | — | |

## 릴리스

- **v3.10.0/v3.10.1 발행됨** (2026-07-03): 레이아웃 보존 렌더 + pt 단위 픽스.
  커밋: 308d0c2(feat) → 625d92d(release 3.10.0) → pt픽스 release 3.10.1
- v3.9.0 (2026-07-03): 수식 생성 (#38, #39 인수)

## 다음 세션 (플랜: .claude/plans/next-session-pdf-gt-leftovers.md 갱신 3차)

- ⓪ 스레드 발행 확인 (사용자 직접 발행 예정이었음)
- ① pdf-table-gt 분할병합 불발 해부 (메인): 머리글 반복 rowsSum 가설 실측 →
  matchTables 관용 → pair10 회복 측정. **채점기 수정은 전 쌍 before/after 대조 필수**
- ② pair05 F1 0.458 오매칭 해부 (ref#2 4×2 vs pdf 14×4)
- ③ 여유: 소액 백로그 / 렌더 차기(다단·2페이지+·도형)는 요청 시만

## 재론 금지 (기존 유지 + 신규)

- LINE_SEG 원본 유지 / 공문서 장평 95%·한컴 빈 문단 생략형 / PDF 머리글 y-클러스터 재도입 금지
- PDF coverage perLine trigram / hidden text 회전 예외 / extractLines CTM 추적 / pdfjs cMap 자산
- findTwoColumnProseCutX fullPage만 + finite 가드·상한 400 / align Pass 1 본문문자 우선
- 셀 장식 관용은 heading paraPr 마킹 줄에만 / changwon 성능 재론 금지
- formats 추출기 = 파서 경계 미러 / xlsx 시트 순서 = workbook 순서 / UNIT_CAP 5만
- pdf-table-gt 모수 = 최상위 2×2+ / docx vMerge val 없음=계속 셀
- **pdf 헤어라인 tolerance 완화 금지** (6차 실험 — GT 양방향 회귀)
- **수식 왕복 정합 유지** (고정점 테스트 잠금, 예약어 따옴표는 변환 전 원문에만)
- **렌더 신규**: SVG width/height pt 단위 유지(px=25% 축소) / horzsize=줄 영역 폭
  (통짜 textLength 금지, 마지막 줄만 정렬 분기) / 렌더는 한컴 저장본 전용
  (markdownToHwpx 산출물 lineseg 없음 → 의도된 에러)
- ⚠ hash-sweep EXTS에 .hml 미포함 — hml 파서 검증은 md 해시 별도 대조

## 코퍼스/도구 메모

- 실파일 코퍼스(gitignore): review/ 45 · hwp5/ 13+30 · pdf/ 42 · pairs/ 26 · formats/ 27
- 게이트 일괄: `npm run bench:gate`(5체인) / PDF표: `node bench/pdf-table-gt.mjs`
- npm publish: `~/.npmrc` bypass 2FA granular 토큰 유효. 릴리스 관례 = release 커밋
  (CHANGELOG+README `## vX.Y.Z 변경사항`+package.json) + 경량 태그 + npm publish + gh release
- 렌더 재현: `node dist/cli.js render <hwpx> -o out.svg` → headless Chrome
  `--window-size=794,1123` 스크린샷. 검증 3파일 = review/36427937·hwp5/10772982_4·10772982_결재문서
- 스레드 카드 원본: 세션 스크래치(휘발). 재제작 시 기안문 패러디 HTML → 1080×1350 스샷
