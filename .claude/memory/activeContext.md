# Active Context — kordoc 본체

**마지막 업데이트**: 2026-07-02 (v3.8.0 릴리스 + PDF 코퍼스 42건 수집 + pdf/parser 7모듈 분리 — 계획 A~D 전부 완료)
**상태**: 테스트 621/621. **v3.8.0 npm 게시 + origin/main 동기화** (release `7850c6c`, refactor `3343ca7`)

## 이번 세션 완료 (2026-07-02 저녁)

- **A. HWPX 이미지 ref 단위 dedupe** (`a13fff3`) — extractImagesFromZip ref당 1회 해제·버퍼 공유·실패 캐시(경고 1회). ZIP bomb 가드는 실해제만 가산. perf 회귀 없음, score 전게이트 PASS
- **B. docx 무경고 catch 5개 경고화** (`eabff7b`) — 이미지=SKIPPED_IMAGE, 스타일/번호/각주/메타=PARTIAL_PARSE
- **C. v3.8.0 릴리스** (`7850c6c`) — CHANGELOG·README 현행화, npm publish(bypass 2FA 토큰 유효), registry 3.8.0 확인
- **D-선행. PDF 코퍼스 42건 수집** — korea.kr RSS 폐지로 크롤러가 죽어 있었는데, **검색엔진 `filetype:pdf site:go.kr`로 직링크 수집**(사용자 교정 — lessons.md 기록). 계획·예산명세·회의록·속기록·지침 등 다양성 확보 → `bench/corpus/pdf/` 42건(gitignore). poppler(pdftotext) brew 설치 완료
- **D. pdf/parser.ts 2,417줄 → 7모듈 분리** (`3343ca7`) — parser.ts는 엔트리+메타 317줄만.
  text-line(324) / xy-cut(214) / columns(308) / block-detect(572) / page-blocks(469) / text-clean(104) / formula-ocr(172).
  기존 공개 export는 parser.ts re-export로 외부 소비자 무변경.
  **게이트 전부 통과**: 42건 markdown+blocks sha256 전/후 동일(결정성 2회 실행 검증) + score.mjs pdf coverage 0.95964 소수점 동일 + 621/621

## 기준선 (2026-07-02)

- 테스트 **621/621** (`npm run build` 후 실행 — dist 스테일 함정)
- score.mjs review 45건: recallMicro 0.999911·phantom 0.000112·표 217/217 전게이트 PASS
- **score.mjs pdf 42건: coverage(micro) 0.95964 — 게이트(0.985) 미달** = 파서의 현재 실력 스냅샷(회귀 아님, 신규 코퍼스가 약점 노출). 하위: archives-record-duty 0.850, goe-school-manual 0.903, eval-perf-2024 0.943, cbe-record-guide 0.950
- perf.mjs: hwpx median 7.7~7.8ms / big_file 186ms / no-op 88/88 · verify-linebreak 굴림체 56/57
- 순수 이동 게이트 도구: `node bench/hash-sweep.mjs <corpus하위경로> <출력.json>` (신설, 전/후 diff)

## 다음 후보 (우선순위순)

1. **PDF coverage 개선** — 신규 코퍼스가 드러낸 약점 4건(위 하위 목록)의 손실 유형 분석부터. 게이트 0.985는 구 코퍼스 기준이라 신규 코퍼스 게이트 재조정도 검토
2. **line-detector.ts(1,247줄)·hwpx/parser.ts(1,690줄대) 분리** — hash-sweep 게이트 재사용 (hwpx는 review 코퍼스 45건)
3. 저순위 백로그 (아래)

## 남은 백로그 (전부 저순위)

- 표 열/병합 변경, 1x1·1열 표 행 연산, HWP5 행 추가/삭제 (P1 스코프 제외분)
- HWP5 중첩표 셀 수정 — ScanCell5에 tables 없음, 스캔 구조부터 필요 (최후순위)
- IR filler 전략2: 데이터 행 병합 시 hwpx tc 서수 페어링 열 어긋남 가능 (기록만)
- GFM 경로 다문단 빈 셀은 "셀 문단 수 변경" skip (정직 보고 — HTML 경로는 지원)
- 본문(비셀) 빈 문단 채우기 — 마크다운에 유닛이 없어 설계상 불가 (기록만)
- score.mjs recall 결손 1건: review/36434527 "가." 2자 누락 — 원인 조사 후보

## 재론 금지 (기존 결정 유지)

- LINE_SEG 원본 유지 (한컴이 재배치, 단일화하면 글자 겹침 — 실측), lineseg 제거는 수정 섹션만
- 공문서 전역 장평 95%, 굴림체=1.0em 고정폭, 함초롬 한글=0.97em, 공백=0.5em
- 한컴 빈 문단 = PARA_TEXT 생략형(nChars=1) 지배적 — 재실측 불필요
- 정보소통광장은 구형 문서도 hwpx 변환 제공 — .hwp 수집 불가, hwplib 픽스처 사용
- session changes vs patchHwpx verification 의미 차이 — 의도됨
- 빈 문자열 블록 비우기 = skip (블록 핸들 소실 방지)
- **PDF 머리글/바닥글 y-클러스터 규칙 재도입 금지** (본문 오삭제 사고 이력 — block-detect.ts 주석)

## 코퍼스/도구 메모

- 실파일 코퍼스(gitignore): `bench/corpus/review/` hwpx 45건 · `bench/corpus/hwp5/` .hwp 13건+hwpx 30건 · **`bench/corpus/pdf/` 42건(신규)**
- PDF 수집법: WebSearch `보도자료|시행계획|공고|세입세출|회의록 filetype:pdf site:go.kr` → 직링크 fetch(%PDF 매직+10KB 하한 검증). korea.kr RSS는 폐지됨 — collect-korea-kr.mjs 사장
- score.mjs pdf 트랙은 **pdftotext(poppler) 필수** — 없으면 41/42가 weak로 빠져 채점 0 (brew 설치됨, /opt/homebrew/bin/pdftotext)
- npm publish: `~/.npmrc` bypass 2FA granular 토큰 유효 (2026-07-02 확인)
