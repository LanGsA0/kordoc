# Active Context — kordoc 본체

**마지막 업데이트**: 2026-07-02 (갭 소탕 세션 — P1 표 행 추가/삭제 구현 완료, **미커밋**)
**상태**: 테스트 591/591 (14개 신규). v3.6.0 = main `50bf9bf`(푸시 안 함), **npm publish 미실행**(registry 3.0.1).
**다음**: 커밋(P1~P4 미커밋) → 남은 갭 = **P5**(HWP5 격차: 빈 셀/빈 문단 삽입, patchHwp 픽스처) + **P6 나머지**(공문 리스트 사이 표 run 지속, README 현행화, npm publish)

## P3 완료 — 라벨 인식 확장 (미커밋)
- `recognize.ts` isLabelCell: 숫자 낀 라벨(연번1·제1항목·1차소속)·9~12자 한글(제1소위원회위원장)·콜론 없는 영문(관행 단어 목록) 인식. 가드 = 수량/단위값(6개월·1억원·5백만원), 서술형 어미(해당없음·~바랍니다), 법인명((주)·주식회사), 9자+ 구간 3어절 이상 제목 컷
- ⚠️ 자간 공백 라벨("업 체 명") 함정: 어절 제한을 8자 이하 구간에 걸면 대량 회귀 — 9자+ 구간에만 적용
- 코퍼스 정량: 380→386 필드. +8 전부 목표 케이스, −2 순수 오탐(해당없음·(주)인트윈). isLabelCell 유닛테스트 6건 신설

## P4 완료 — 조용한 실패 제거 (미커밋)
- `PatchSkip.partial?: boolean` 신설 — 적용됐지만 원형 그대로 아닌 것(줄 병합/이미지 혼재/줄 삭제 빈 문단 잔존) 표시. HWPX·HWP5 양쪽
- 셀 줄 삭제 시 "빈 문단 잔존(뷰어 빈 줄)" 보고 신설 (기존엔 무보고)
- `buildTableWithCellMeta` 서수(3차) 폴백 — 동일 텍스트/스팬 불일치로 못 찾은 셀 blocks 유실 방지, 소스 tc 수=앵커 수일 때만 발동. 코퍼스 45건 markdown 해시 전/후 동일(무회귀 검증)
- P4-4(수식+병합 GFM 강등): 코퍼스 실측 표 217개 중 수식 0건 → **현행 유지 결정** (완화 근거 없음)
- P6 일부: flattenLayoutTables hwp5-only 호출 정책 주석화, 깊이 상수(200/8/16) 좌표계 차이 문서화 — 통일 금지 명시

테스트 603/603 (세션 시작 577 → +26)

## P2 완료 — IR filler ↔ fillHwpx 정합 (미커밋)
- `filler.ts`: ①전략1 값 셀 = 라벨 colSpan 뒤 같은 행 다음 앵커(covered 스킵 — 병합 플레이스홀더 silent 유실 제거, hwpx '다음 tc'와 동일) ②중첩표 재귀 collectIRTables depth16 ③전략2 covered 칸 값 소진 차단 ④patternFilledCells "r,c"키→Set<IRCell>(다중 표 키 충돌 해소)
- `tests/filler-parity.test.ts` 신설 4건 — 두 경로 filled/unmatched 동등성. ⚠️픽스처 함정: 값 열이 전부 비면 trimAndReturn이 열을 날려 IR엔 값 셀이 없어짐 → 플레이스홀더 텍스트 필요
- 잔존 divergence(기록만): 전략2에서 데이터 행에 병합 있으면 hwpx는 tc 서수 페어링이라 열 어긋남 가능(P4급)

## P1 완료 — HWPX 표 행 추가/삭제 (v3.7 예정분, 미커밋)
- `source-map.ts`: ScanTable.rowRanges(<hp:tr> 범위) + ScanCell.addrTagRange 추적
- `table-rows.ts`(신규): alignUnits 행 정렬 → 템플릿 tr 복제 삽입/삭제 splice, rowCnt·rowAddr·sz height 갱신. 게이트 = rowspan 교차/개체 포함 행/주소 혼재/렌더 불안정(gfmRenderStable 시뮬)
- `table-patch.ts`: GFM/HTML 행 수 불일치 → 엔진 위임, 행별 셀 패치는 patchGfm/HtmlRowPair로 추출 공용
- `patcher.ts`: alignUnits → markdown-units.ts로 이동(re-export 유지), lineseg 제거 splice가 삭제 tr에 포함될 때 겹침 필터
- 검증: 코퍼스 45건 행 추가 스윕 — GFM 6/9 클린, HTML 34/45 클린, 나머지 정직 skip, 손상/예외 0. rhwp 렌더 육안 OK. e2e 무변경 바이트동일 유지
- 스코프 제외(다음): 열/병합 변경, 1x1·1열 표 행 연산, HWP5 행 연산(hwp5-patch 게이트 유지)

## v3.6.0 이번 세션 요약 (2026-07-02)

### 신규 핵심: 텍스트 메트릭 엔진 (src/hwpx/text-metrics.ts)
- 함초롬바탕 정품 TTF advance 전수 추출: 한글 11,172자 균일 970/1000em, 숫자 550, 온점·괄호 320, **Bold=Regular 폭 동일**
- 줄바꿈 시뮬레이션: keep(어절)/charAll(글자) + 금칙(시작=직전 1글자 동반 밀어내기, 끝=여는괄호 내리기)
- **오라클 검증**: bench/verify-linebreak.mjs — 실제 결재문서 linesegarray 대조, 고정폭 버킷 98%(56/57)
- 확정 규칙: 공백 0.5em 고정(useFontSpace=0), 장평·자간 공백에도 적용, 자간=폭×(1+sp/100)
- ⚠️ 전자결재 변환기·macOS한컴·rhwp는 KEEP_WORD 무시하고 글자단위 조판 (Windows 한컴만 어절)

### 수정 (프로덕션 버그)
1. **fillHwpx/HwpxSession linesegarray 미제거** → 한컴 변조경고/줄배치 틀어짐. patcher처럼 수정 섹션 lineseg 전부 제거
2. **생성 표 테두리 안 보임** — borderFill id 0-시작이 원인. **1-based 규약**(1=무테두리, 2=SOLID) + centerLine="NONE"(enum). 실전 파일에 id=0 없음
3. markerWidth 실측화 (괄호 0.45→0.32em 등) — 내어쓰기 정렬 오차 제거

### 신규 기능
- **autoFit(문단별 자동 장평)**: orphan 문단만 95→90 축소, 변형 charPr(id 11+) 발급. GongmunOptions.autoFit
- **HTML 표(colspan/rowspan/중첩) → HWPX 생성**: generateHtmlTableXml — parse↔generate 표 라운드트립 완성
- **다중값 채우기**: values에 string[] — 반복 라벨 순서 소진 + 명부형 표 행별 채움 (ValueCursor, match.ts)

### 도구/인프라
- bench/collect-opengov.mjs 사이트 개편 대응 재작성 (title-down에서 파일명, 제목 필터 인자)
- bench/corpus/review/ 실문서 45건 (gitignore) — e2e DIRS에 "review" 추가로 실파일 스윕 활성화
- 검증 하네스(로컬 스크래치): @rhwp/core 렌더 → Chrome headless SVG→PNG로 육안 확인 가능

### 남은 백로그 (이번 리뷰에서 확인된 갭 — 미착수)
- 표 구조 변경(행/열 추가·삭제, 병합 변경) 전 경로 미지원 — 최상위 갭
- HWP5: 중첩표 셀 수정·빈 셀 채우기·빈 문단 삽입·문단→표 미지원 (HWPX만 지원)
- IR filler: 병합 라벨셀 값 유실(silent), 중첩표 라벨 미재귀 — hwpx-preserve 경로와 불일치
- 라벨 인식: 숫자 낀 라벨(연번1 등)·9자↑ 한글·콜론 없는 영문 미인식
- 셀 줄 병합 시 applied+skip 이중 보고 (silent 손실 가능)
- buildTableWithCellMeta 재부착 실패 시 중첩표 blocks 유실 (hwpx/parser.ts:864)
- 수식+병합/중첩 → GFM 강등으로 구조 소실 (builder.ts:430)
- HWP5 patchHwp 전용 테스트 부재
- 리스트 사이 표가 끼면 공문서 번호 run이 끊겨 재시작 (마크다운 표현 한계)

### 함정 메모
- verify-linebreak 오라클: textpos가 텍스트 길이 초과하는 파일 있음(원본 hwp 컨트롤 좌표 승계) — coordShift로 제외
- 굴림체=고정폭 1.0em 확정 (970 아님). 한컴돋움은 비례폭이라 HCR 근사 부정확
- dist 스테일 함정 여전 — src 수정 후 npm run build 필수
