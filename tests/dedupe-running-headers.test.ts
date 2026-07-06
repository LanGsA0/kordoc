import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { dedupeRunningHeaders } from "../src/table/builder.js"
import type { IRBlock } from "../src/types.js"

describe("dedupeRunningHeaders", () => {
  it("4회 반복 러닝 헤더는 최초 1회만 남고 본문은 순서대로 모두 보존", () => {
    const blocks: IRBlock[] = [
      { type: "paragraph", text: "2. 과제 구축 내용" },
      { type: "paragraph", text: "본문 문단 A" },
      { type: "paragraph", text: "2. 과제 구축 내용" },
      { type: "paragraph", text: "본문 문단 B" },
      { type: "paragraph", text: "2. 과제 구축 내용" },
      { type: "paragraph", text: "본문 문단 C" },
      { type: "paragraph", text: "2. 과제 구축 내용" },
      { type: "paragraph", text: "본문 문단 D" },
    ]

    const result = dedupeRunningHeaders(blocks)
    const texts = result.map(b => b.text)

    // 러닝 헤더는 정확히 1회
    assert.equal(texts.filter(t => t === "2. 과제 구축 내용").length, 1)
    // 본문 문단은 개수·순서 그대로 보존
    assert.deepEqual(
      texts.filter(t => t?.startsWith("본문")),
      ["본문 문단 A", "본문 문단 B", "본문 문단 C", "본문 문단 D"]
    )
    // 전체 결과 순서: 최초 헤더 → 본문 A~D
    assert.deepEqual(texts, [
      "2. 과제 구축 내용",
      "본문 문단 A",
      "본문 문단 B",
      "본문 문단 C",
      "본문 문단 D",
    ])
  })

  it("2회만 반복되는 헤더는 임계값 미만이라 제거하지 않음", () => {
    const blocks: IRBlock[] = [
      { type: "paragraph", text: "1. 과제 개요" },
      { type: "paragraph", text: "본문" },
      { type: "paragraph", text: "1. 과제 개요" },
    ]

    const result = dedupeRunningHeaders(blocks)
    assert.equal(result.length, 3)
    assert.equal(result.filter(b => b.text === "1. 과제 개요").length, 2)
  })

  it("번호매김이 아닌 짧은 반복 문단은 후보가 아니므로 보존 (보수적 판정)", () => {
    const blocks: IRBlock[] = [
      { type: "paragraph", text: "개요" },
      { type: "paragraph", text: "본문 1" },
      { type: "paragraph", text: "개요" },
      { type: "paragraph", text: "본문 2" },
      { type: "paragraph", text: "개요" },
    ]

    const result = dedupeRunningHeaders(blocks)
    // "개요"는 번호매김 시그니처가 없어 후보가 아님 → 3회 모두 유지
    assert.equal(result.filter(b => b.text === "개요").length, 3)
    assert.equal(result.length, 5)
  })

  it("입력 배열과 블록을 변형하지 않고 새 배열을 반환", () => {
    const blocks: IRBlock[] = [
      { type: "paragraph", text: "3. 과제 추진전략" },
      { type: "paragraph", text: "본문" },
      { type: "paragraph", text: "3. 과제 추진전략" },
      { type: "paragraph", text: "3. 과제 추진전략" },
    ]
    const before = JSON.stringify(blocks)

    const result = dedupeRunningHeaders(blocks)

    // 새 배열 (참조 다름)
    assert.notEqual(result, blocks)
    // 입력 배열 원형 유지 (길이·내용 불변)
    assert.equal(blocks.length, 4)
    assert.equal(JSON.stringify(blocks), before)
    // 결과는 헤더 1회 + 본문 = 2개
    assert.equal(result.length, 2)
  })
})
