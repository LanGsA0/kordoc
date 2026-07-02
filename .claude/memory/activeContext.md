# Active Context — kordoc 본체

**마지막 업데이트**: 2026-07-02 (갭 소탕 2차 P5·P6 + 성능분석 — **커밋 완료** `5837374`(feat)·`18fe5d9`(perf), 미푸시)
**상태**: 테스트 618/618. registry는 3.7.0 (이번 분은 v3.8.0 릴리스 예정).
**다음 세션 = `.claude/plans/next-session-perf-debt.md` 읽고 시작** — A.HWPX 이미지 dedupe → B.docx 무경고 catch → C.v3.8.0 릴리스 → D.(여력)pdf/parser 분리

## 성능 버그 픽스 — HWP5 이미지 dedupe (미커밋)
- `hwp5/images.ts` resolveImageBlocks: 같은 BinData 참조 개체마다 `new Uint8Array` 2벌 복사+중복 추출
  → gso 12,822개×3.7MB 파일(hwplib big_file.hwp)에서 **17GB OOM 완주 불가**
- 픽스 = storageId당 1회 변환 캐시(`resolved` Map, 실패도 캐시) + 데이터 버퍼 공유
  → **197ms / 피크 445MB 완주** (블록 11.5만, md 192만자). 유닛테스트 1건 추가
- ⚠️ **HWPX 이미지도 동일 계열**(hwpx/parser.ts:571 — ref당 zip 재해제+중복 저장, dedupe 없음).
  실측 폭발 사례 없어 미수정 — 다음 후보

## 성능 수치 기준선 (2026-07-02, bench/perf.mjs 신설)
- 정확도(score.mjs): review 45건 recallMicro 99.9911%·phantom 0.0112%·표 217/217·전게이트 PASS / hwp5 30건(2016) recall 100%
- 줄바꿈 오라클: 굴림체 56/57=98% (charAll+push)
- 속도: hwpx median 7.8ms·11.8MB/s / hwp median 0.2ms / 10.1MB 대형 192ms·52.7MB/s
- 강건성: 실파일 88건 실패 0 · no-op 바이트동일 hwpx 75/75 + hwp 13/13(big_file 포함)
- 폼 인식: hwpx 74건 819필드

## P5 완료 — HWP5 빈 셀 채우기 + 빈 문단 텍스트 삽입 (미커밋)
- `splitParaText`: 일반 텍스트 0인 문단도 전 토큰 비가시(개체/문단끝)면 빈 코어 분해 —
  문단끝(0x0d)부터 suffix, 새 텍스트가 [선두 개체 뒤, 문단끝 앞]에 들어감. 가시 control(탭 등)은 null 유지
- `stageParaPatch` textIdx===-1(PARA_TEXT 생략형): 레코드 신규 삽입. `SectionScan5.inserts`
  (Map<recordIdx, RawRecord[]> — 해당 인덱스 앞 삽입) + `serializeRecords(recs, repl, inserts)` 확장.
  nChars 하위비트 1→0x0d 포함/0→미포함, >1은 비정형 skip. CHAR_SHAPE는 rebuildCharShape(0)로 단일화
- `applyCellEdit5`: 빈 셀(전 문단 빈)이면 targets=cell.paras로 분배. "줄 삭제 잔존" partial 보고는
  nonEmpty 기준 유지(빈 셀 경로 오보고 방지)
- **실측(hwplib 실파일 12건)**: 한컴 빈 문단 = **PARA_TEXT 생략형(nChars=1)이 지배적**(57/66),
  나머지는 개체(0xb)/구역정의(0x2) 컨트롤 문단. `[0x0d]` 단독형은 실파일 0건(패치로 셀 비우면 생김)
- 실파일 검증: no-op 12/12 바이트동일, merging-cell.hwp 비우기→재채움 왕복 OK, rhwp 렌더 육안 OK
- 테스트 +13: splitParaText 5, 빈 셀 채우기 4(GFM 치환/삽입·HTML·nChars 정합·no-op), 실파일 e2e 2 (hwp5-patch.test.ts)

## P6 완료 — 공문 리스트 사이 표 run 지속 (미커밋)
- `precomputeGongmunList` run 수집: list_item 사이 table/html_table은 run 안 끊음
  (표 뒤 항목 있을 때만 지속, 문단은 여전히 끊음). generator.ts:892
- 이미지: 블록 타입 자체가 없음(인라인) — 스코프 아웃 확인
- 테스트 +3 (gongmun.test.ts). rhwp 렌더 육안: 1.2.→표→3. 지속 확인

## 코퍼스/도구 메모
- **정보소통광장은 구형(2014~2016) 문서도 hwpx로 변환 제공** → .hwp 수집 불가.
  날짜 필터는 `rangeDate=custom&startDate=…&endDate=…` (rangeDate 없으면 무시됨)
- 실.hwp 픽스처 = hwplib(neolord0) sample_hwp 12건 → `bench/corpus/hwp5/` (gitignore).
  같은 디렉토리에 2016년 hwpx 30건도 있음(재수집 부산물, 무해)
- hwp5-patch.test.ts에 실파일 스윕 describe 추가 — 코퍼스 없으면 skip

## 남은 백로그 (전부 저순위)
- 표 열/병합 변경, 1x1·1열 표 행 연산, HWP5 행 추가/삭제 (P1 스코프 제외분)
- HWP5 중첩표 셀 수정 — ScanCell5에 tables 없음, 스캔 구조부터 필요 (최후순위)
- IR filler 전략2: 데이터 행 병합 시 hwpx tc 서수 페어링 열 어긋남 가능 (기록만)
- GFM 경로 다문단 빈 셀(빈 문단 2+)은 "셀 문단 수 변경" skip (정직 보고 — HTML 경로는 지원)
- 본문(비셀) 빈 문단 채우기 — 마크다운에 유닛이 없어 설계상 불가 (기록만)

## 재론 금지 (기존 결정 유지)
- LINE_SEG 원본 유지 (한컴이 재배치, 단일화하면 글자 겹침 — 실측)
- 공문서 전역 장평 95%, 굴림체=1.0em 고정폭, 함초롬 한글=0.97em, 공백=0.5em
- session changes vs patchHwpx verification 의미 차이 — 의도됨
- 빈 문자열 블록 비우기 = skip (블록 핸들 소실 방지)
