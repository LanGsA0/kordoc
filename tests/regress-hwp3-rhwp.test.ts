/**
 * HWP3 rhwp 업스트림 정합 회귀 테스트 (2026-07-17 반영분).
 *
 * 잠근 결함 (rhwp 커밋 → kordoc 반영):
 *  1. d89b689 (#929): 탭(ch=9)은 8 byte 구조 — 2 byte만 소비하면 탭마다 6 byte desync로
 *     이후 텍스트 오염 (업스트림 실측: sample19 파싱 실패 원인)
 *  2. dcf64b4 (#877): ch=5(필드코드)는 헤더 뒤 header_val1 byte, ch=6(책갈피)은 34 byte
 *     추가 소비 — 미소비 시 stream desync (업스트림 실측: sample16 77→1058 문단 복구)
 *  3. e184718~aa8b47c: 사적 graphic char 영역(0x0080~0x7FFF) 매핑 — 로마숫자·원문자·
 *     따옴표·글머리 등이 통째로 증발하던 것 (kordoc은 한컴 표시값 직행 방출)
 */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { parseHwp3Document } from "../src/hwp3/parser.js"

/** 합성 HWP3 파일: 30B 시그니처 + 128B DocInfo + 1008B DocSummary + body (비압축) */
function buildHwp3(body: Buffer): ArrayBuffer {
  const sig = Buffer.alloc(30)
  Buffer.from("HWP Document File V3.00", "ascii").copy(sig)
  const docInfo = Buffer.alloc(128) // encrypted=0, compressed=0, infoBlockLength=0
  const docSummary = Buffer.alloc(1008)
  const file = Buffer.concat([sig, docInfo, docSummary, body])
  return new Uint8Array(file).buffer
}

/** body 선두의 font face(언어 7종 × u16 count=0) + style(u16 count=0) 프리앰블 */
const PREAMBLE = Buffer.alloc(16)

/** 단일 paragraph + 종료 sentinel 로 이루어진 body 구성.
 *  charCount 는 hchar 단위 — 호출자가 스트림 구조에 맞게 계산해서 넘긴다. */
function buildBody(charStream: Buffer, charCount: number): Buffer {
  const header = Buffer.alloc(43)
  header[0] = 1 // followPrev=1 → ParaShape 없음
  header.writeUInt16LE(charCount, 1)
  header.writeUInt16LE(0, 3) // lineCount=0
  header[5] = 0 // includeCharShape=0
  const terminator = Buffer.alloc(43) // followPrev+charCount(0)+잔여 40
  return Buffer.concat([PREAMBLE, header, charStream, terminator])
}

function u16seq(codes: number[]): Buffer {
  const buf = Buffer.alloc(codes.length * 2)
  codes.forEach((c, i) => buf.writeUInt16LE(c, i * 2))
  return buf
}

const A = "A".charCodeAt(0)
const B = "B".charCodeAt(0)

describe("회귀 rhwp-1: 탭(ch=9) 8 byte 구조 정합 (d89b689 #929)", () => {
  it("hchar 9 + 탭폭 + 점끌기 + hchar 9 닫기 소비 후 뒤 텍스트 보존", () => {
    // A, [9, hunit(600), word(0), 9], B — 탭은 4 hchar
    const stream = u16seq([A, 9, 600, 0, 9, B])
    const r = parseHwp3Document(buildHwp3(buildBody(stream, 6)))
    assert.equal(r.markdown, "A\tB")
    assert.ok(!r.warnings?.some(w => w.code === "PARTIAL_PARSE"), "desync 없이 파싱돼야 함")
  })

  it("탭 2개 연속에도 desync 없음 (구현 전: 탭마다 6 byte 어긋남)", () => {
    const stream = u16seq([A, 9, 600, 0, 9, 9, 600, 0, 9, B])
    const r = parseHwp3Document(buildHwp3(buildBody(stream, 10)))
    assert.equal(r.markdown, "A\t\tB")
  })
})

describe("회귀 rhwp-2: ch=5 필드코드 / ch=6 책갈피 스트림 소비 (dcf64b4 #877)", () => {
  it("ch=5: 8 byte 헤더 + header_val1 byte 세부정보 소비", () => {
    // A, [5, len(u32)=10, ch2=5, 세부 10 byte], B — 헤더는 4 hchar
    const head = u16seq([A, 5])
    const lenAndClose = Buffer.alloc(6)
    lenAndClose.writeUInt32LE(10, 0)
    lenAndClose.writeUInt16LE(5, 4)
    const fieldData = Buffer.alloc(10, 0xee) // 소비 안 되면 hchar 로 오독됨
    const tail = u16seq([B])
    const stream = Buffer.concat([head, lenAndClose, fieldData, tail])
    const r = parseHwp3Document(buildHwp3(buildBody(stream, 6)))
    assert.equal(r.markdown, "AB")
  })

  it("ch=6: 8 byte 헤더 + 이름 32 + 종류 2 = 34 byte 추가 소비", () => {
    const head = u16seq([A, 6])
    const lenAndClose = Buffer.alloc(6)
    lenAndClose.writeUInt32LE(34, 0)
    lenAndClose.writeUInt16LE(6, 4)
    const bookmarkExtra = Buffer.alloc(34, 0xee)
    const tail = u16seq([B])
    const stream = Buffer.concat([head, lenAndClose, bookmarkExtra, tail])
    const r = parseHwp3Document(buildHwp3(buildBody(stream, 6)))
    assert.equal(r.markdown, "AB")
  })
})

describe("회귀 rhwp-3: 사적 graphic char 매핑 (e184718~aa8b47c)", () => {
  it("로마숫자 장 제목이 증발하지 않는다 (Ⅰ~Ⅹ)", () => {
    // "Ⅰ. 사업개요"의 로마숫자 부분 — 0x3590~0x3599
    const stream = u16seq([0x3590, ".".charCodeAt(0), " ".charCodeAt(0), 0x3593])
    const r = parseHwp3Document(buildHwp3(buildBody(stream, 4)))
    assert.equal(r.markdown, "Ⅰ. Ⅳ")
  })

  it("원문자·따옴표·화살표·글머리 매핑", () => {
    const stream = u16seq([0x36e7, 0x0081, A, 0x0082, 0x3446, 0x3366, 0x3441])
    const r = parseHwp3Document(buildHwp3(buildBody(stream, 7)))
    assert.equal(r.markdown, "①“A”→□■")
  })

  it("미매핑 사적영역은 종전대로 조용히 skip (? 노이즈 금지)", () => {
    const stream = u16seq([A, 0x0100, B]) // 0x0100: 매핑 없는 사적영역
    const r = parseHwp3Document(buildHwp3(buildBody(stream, 3)))
    assert.equal(r.markdown, "AB")
  })
})
