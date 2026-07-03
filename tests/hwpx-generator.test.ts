/** HWPX 역변환 (generator) 테스트 — 라운드트립 검증 */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { markdownToHwpx } from "../src/hwpx/generator.js"
import { parse } from "../src/index.js"

describe("markdownToHwpx", () => {
  it("단순 텍스트 → HWPX → 라운드트립", async () => {
    const md = "대한민국 헌법 제1조"
    const hwpxBuf = await markdownToHwpx(md)

    assert.ok(hwpxBuf instanceof ArrayBuffer, "ArrayBuffer 반환")
    assert.ok(hwpxBuf.byteLength > 0, "비어있지 않음")

    // 라운드트립: 생성된 HWPX를 다시 파싱
    const result = await parse(hwpxBuf)
    assert.equal(result.success, true, `파싱 실패: ${result.success === false ? result.error : ""}`)
    if (result.success) {
      assert.ok(result.markdown.includes("대한민국 헌법 제1조"), "원본 텍스트 보존")
    }
  })

  it("멀티 단락 → 라운드트립", async () => {
    const md = "첫 번째 단락\n\n두 번째 단락\n\n세 번째 단락"
    const hwpxBuf = await markdownToHwpx(md)
    const result = await parse(hwpxBuf)

    assert.equal(result.success, true)
    if (result.success) {
      assert.ok(result.markdown.includes("첫 번째 단락"))
      assert.ok(result.markdown.includes("두 번째 단락"))
      assert.ok(result.markdown.includes("세 번째 단락"))
    }
  })

  it("테이블 → HWPX → 라운드트립", async () => {
    const md = "| 이름 | 직급 |\n| --- | --- |\n| 홍길동 | 과장 |"
    const hwpxBuf = await markdownToHwpx(md)
    const result = await parse(hwpxBuf)

    assert.equal(result.success, true)
    if (result.success) {
      assert.ok(result.markdown.includes("이름"), "헤더 보존")
      assert.ok(result.markdown.includes("홍길동"), "데이터 보존")
      // table 블록 존재
      assert.ok(result.blocks.some(b => b.type === "table"), "테이블 블록 존재")
    }
  })

  it("헤딩 + 본문 혼합", async () => {
    const md = "# 제1장 총강\n\n대한민국은 민주공화국이다.\n\n# 제2장 권리\n\n모든 국민은 법 앞에 평등하다."
    const hwpxBuf = await markdownToHwpx(md)
    const result = await parse(hwpxBuf)

    assert.equal(result.success, true)
    if (result.success) {
      assert.ok(result.markdown.includes("제1장 총강"))
      assert.ok(result.markdown.includes("민주공화국"))
      assert.ok(result.markdown.includes("제2장 권리"))
    }
  })

  it("헤딩 레벨 왕복 보존 — OUTLINE paraPr 기반 (h5/h6은 h4로 압축)", async () => {
    const md = "# 장제목\n\n## 절제목\n\n### 관제목\n\n#### 항제목\n\n##### 목제목\n\n본문 문단입니다."
    const result = await parse(await markdownToHwpx(md))
    assert.equal(result.success, true)
    if (result.success) {
      const seq = [...result.markdown.matchAll(/^(#{1,6}) (.+)$/gm)].map(m => `${m[1].length}|${m[2].trim()}`)
      assert.deepEqual(seq, ["1|장제목", "2|절제목", "3|관제목", "4|항제목", "4|목제목"], "레벨+텍스트 시퀀스 보존")
      // 번호 서식이 비어 있으므로 "1." 같은 개요 번호 접두가 발명되면 안 됨
      assert.ok(!/# \d+\./.test(result.markdown), "개요 번호 접두 없음")
      const h = result.blocks.filter(b => b.type === "heading")
      assert.equal(h.length, 5, "heading 블록 5개")
    }
  })

  it("공문서 모드 헤딩 왕복 보존", async () => {
    const md = "# 사업계획\n\n1. 관련: 근거 공문\n\n2. 추진 개요입니다.\n\n## 세부 일정"
    const result = await parse(await markdownToHwpx(md, { gongmun: { preset: "기안문" } }))
    assert.equal(result.success, true)
    if (result.success) {
      assert.ok(/^# 사업계획$/m.test(result.markdown), "h1 보존")
      assert.ok(/^## 세부 일정$/m.test(result.markdown), "h2 보존")
      assert.ok(result.markdown.includes("1. 관련: 근거 공문"), "항목부호 유지")
    }
  })

  it("마스킹 별표 런 왕복 보존 — 이스케이프 대칭 (HR/볼드 오독 금지)", async () => {
    // 파서 escapeGfm 출력 형태의 md (개인정보 마스킹 별표)
    const md = "성명: 홍\\*\\*\n\n\\*\\*\\*\\*\\*\\*\n\n| 항목 | 값 |\n| --- | --- |\n| 주민번호 | \\*\\*\\*\\*\\*\\* |"
    const result = await parse(await markdownToHwpx(md))
    assert.equal(result.success, true)
    if (result.success) {
      // hwpx 본문에는 리터럴 별표 (백슬래시 없음, 강조/HR 소비 없음)
      assert.ok(result.blocks.some(b => b.type === "paragraph" && b.text === "******"), "별표 런 리터럴 보존")
      assert.ok(!result.blocks.some(b => b.text?.includes("\\")), "백슬래시 문서 혼입 없음")
      assert.ok(!result.markdown.includes("────"), "HR 오독 없음")
      // md 재출력은 다시 이스케이프 (왕복 고정점)
      assert.ok(result.markdown.includes("홍\\*\\*"), "이름 마스킹 재이스케이프")
      assert.ok(result.markdown.includes("\\*\\*\\*\\*\\*\\* |") || result.markdown.includes("| \\*\\*\\*\\*\\*\\*"), "셀 마스킹 재이스케이프")
    }
  })

  it("리스트 번호·마커 왕복 보존 (재시작·기호 변형 금지)", async () => {
    const md = "2. 위원별 의결서 각 1부.\n3. 안건심의결과 1부.\n\n- 항목 하나\n* 항목 둘"
    const result = await parse(await markdownToHwpx(md))
    assert.equal(result.success, true)
    if (result.success) {
      assert.ok(result.markdown.includes("2. 위원별 의결서"), "시작 번호 보존 (1로 재시작 금지)")
      assert.ok(result.markdown.includes("3. 안건심의결과"), "연번 보존")
      assert.ok(result.markdown.includes("- 항목 하나"), "대시 마커 보존 (· 변형 금지)")
    }
  })

  it("빈 마크다운 → 유효한 HWPX (빈 내용)", async () => {
    const hwpxBuf = await markdownToHwpx("")
    assert.ok(hwpxBuf.byteLength > 0, "ZIP은 생성됨")

    const result = await parse(hwpxBuf)
    // 빈 섹션이면 파싱은 성공하지만 내용 없음
    assert.equal(result.success, true)
  })

  it("특수문자 XML 이스케이프", async () => {
    const md = "A < B & C > D \"E\""
    const hwpxBuf = await markdownToHwpx(md)
    const result = await parse(hwpxBuf)

    assert.equal(result.success, true)
    if (result.success) {
      assert.ok(result.markdown.includes("A < B"), "< 보존")
      assert.ok(result.markdown.includes("& C"), "& 보존")
    }
  })
})
