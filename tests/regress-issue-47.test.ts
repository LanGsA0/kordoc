/** #47 — 표 오른쪽 끝 빈 열 삭제로 서식 입력란 소실.
 *  기본값은 종전 트림 유지(마크다운 가독성·벤치 계약) — ParseOptions.keepTrailingEmptyCols
 *  opt-in으로 앵커 있는 빈 입력란 보존, 양식 경로(parse_form·fill)는 내부 상시 ON. */
import { describe, it } from "node:test"
import assert from "node:assert"
import { buildTable } from "../src/table/builder.js"
import { markdownToHwpx, parseHwpx } from "../src/index.js"

describe("#47 후행 빈 열 보존 (keepTrailingEmptyCols)", () => {
  it("기본값: 종전대로 후행 빈 열 트림 (벤치 계약)", async () => {
    const hwpx = await markdownToHwpx("| 성명 |  |\n| --- | --- |\n| 연락처 |  |\n")
    const r = await parseHwpx(hwpx)
    assert.ok(r.success)
    const t = r.blocks.filter(b => b.type === "table")[0].table!
    assert.equal(t.cols, 1)
  })

  it("옵션 ON: 서식 표의 빈 입력란 열이 보존된다 (이슈 재현)", async () => {
    const hwpx = await markdownToHwpx("| 성명 |  |\n| --- | --- |\n| 연락처 |  |\n")
    const r = await parseHwpx(hwpx, { keepTrailingEmptyCols: true })
    assert.ok(r.success)
    const t = r.blocks.filter(b => b.type === "table")[0].table!
    assert.equal(t.cols, 2, "빈 입력란 열이 트림됨")
    assert.equal(t.cells[0].length, 2)
  })

  it("옵션 ON에서도 앵커 없는 유령 열(span 인플레이션)은 트림", () => {
    const phantom = buildTable(
      [
        [{ text: "a", colSpan: 3, rowSpan: 1 }],
        [{ text: "b", colSpan: 1, rowSpan: 1 }],
      ],
      { keepAnchoredEmptyCols: true },
    )
    assert.equal(phantom.cols, 1)

    const anchored = buildTable(
      [
        [{ text: "성명", colSpan: 1, rowSpan: 1 }, { text: "", colSpan: 1, rowSpan: 1 }],
        [{ text: "연락처", colSpan: 1, rowSpan: 1 }, { text: "", colSpan: 1, rowSpan: 1 }],
      ],
      { keepAnchoredEmptyCols: true },
    )
    assert.equal(anchored.cols, 2)
  })

  it("cellAddr 직접 배치 경로도 동일 (HWPX/HWP5)", () => {
    const t = buildTable(
      [
        [
          { text: "성명", colSpan: 1, rowSpan: 1, colAddr: 0, rowAddr: 0 },
          { text: "", colSpan: 1, rowSpan: 1, colAddr: 1, rowAddr: 0 },
        ],
      ],
      { keepAnchoredEmptyCols: true },
    )
    assert.equal(t.cols, 2)
  })

  it("기본(옵션 OFF) buildTable은 텍스트 기준 트림", () => {
    const t = buildTable([
      [{ text: "값", colSpan: 1, rowSpan: 1 }, { text: "", colSpan: 1, rowSpan: 1 }, { text: "", colSpan: 1, rowSpan: 1 }],
    ])
    assert.equal(t.cols, 1)
  })

  it("가운데 빈 열은 어느 모드에서도 보존 (기존 계약)", () => {
    const t = buildTable([
      [{ text: "a", colSpan: 1, rowSpan: 1 }, { text: "", colSpan: 1, rowSpan: 1 }, { text: "c", colSpan: 1, rowSpan: 1 }],
    ])
    assert.equal(t.cols, 3)
  })

  it("fill --dry-run과 동일한 양식 인식 경로에서 입력란 필드가 잡힌다", async () => {
    const { parse, extractFormFields } = await import("../src/index.js")
    const hwpx = await markdownToHwpx("| 성명 |  |\n| --- | --- |\n| 연락처 |  |\n")
    const r = await parse(hwpx, { keepTrailingEmptyCols: true })
    assert.ok(r.success)
    const labels = extractFormFields(r.blocks).fields.map(f => f.label)
    assert.ok(labels.includes("성명"), `성명 필드 누락: ${labels.join(",")}`)
    assert.ok(labels.includes("연락처"), `연락처 필드 누락: ${labels.join(",")}`)
  })

  it("XLSX 경로에도 옵션이 배선된다 (v4.1.0 리뷰 — 배선 누락 회귀)", async () => {
    const { parse } = await import("../src/index.js")
    // 최소 XLSX: A열=라벨, B열=셀 요소는 있지만 빈 값(양식 입력란)
    const { default: JSZip } = await import("jszip")
    const zip = new JSZip()
    zip.file("[Content_Types].xml", `<?xml version="1.0"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`)
    zip.file("_rels/.rels", `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`)
    zip.file("xl/workbook.xml", `<?xml version="1.0"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="양식" sheetId="1" r:id="rId1"/></sheets>
</workbook>`)
    zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`)
    zip.file("xl/sharedStrings.xml", `<?xml version="1.0"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="3" uniqueCount="3"><si><t>성명</t></si><si><t>연락처</t></si><si><t></t></si></sst>`)
    zip.file("xl/worksheets/sheet1.xml", `<?xml version="1.0"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>2</v></c></row>
    <row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2" t="s"><v>2</v></c></row>
  </sheetData>
</worksheet>`)
    const buf = await zip.generateAsync({ type: "arraybuffer" })

    const off = await parse(buf)
    assert.ok(off.success)
    const tOff = off.blocks.filter(b => b.type === "table")[0].table!
    assert.equal(tOff.cols, 1, "기본값은 종전 트림 유지")

    const on = await parse(buf, { keepTrailingEmptyCols: true })
    assert.ok(on.success)
    const tOn = on.blocks.filter(b => b.type === "table")[0].table!
    assert.equal(tOn.cols, 2, "XLSX 양식의 빈 입력란 열이 보존돼야 한다")
  })
})
