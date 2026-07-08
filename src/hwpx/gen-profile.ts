/**
 * 서식 프로필(Format Profile) — generate 시각 서식 재현 (이슈 #41 / PR #42).
 *
 * markdownToHwpx가 표의 위상(병합 구조)뿐 아니라 음영·괘선·열 너비·셀 글꼴까지
 * 재현할 수 있도록, 원본 문서 없이 서식만 실어 나르는 프로필의 타입·리맵·XML 빌더.
 *
 * 파서 IR(IRCell/IRTable)에는 서식 필드가 없으므로 프로필은 IR과 독립된 통로다.
 * 프로필의 borderFill/charPr id는 표별 로컬 네임스페이스라, 여기서 문서 전역 id로
 * 재할당(remap)한 뒤 header에 정의를 등록하고 셀에 연결한다.
 */

import { CHAR_VARIANT_BASE } from "./gen-ids.js"

// ─── 스키마 타입 (PR #42 예시 확정본) ────────────────

/** 한 변의 괘선 정의 */
export interface BorderDef {
  /** SOLID | NONE | DASH | DOT ... (HWPX border type) */
  type: string
  /** "0.12 mm" 등 HWPX width 문자열 */
  width: string
  /** "#RRGGBB" */
  color: string
}

/** 셀 테두리+음영 정의 (표별 로컬 id로 참조됨) */
export interface BorderFillDef {
  leftBorder?: BorderDef
  rightBorder?: BorderDef
  topBorder?: BorderDef
  bottomBorder?: BorderDef
  /** 셀 음영 — winBrush faceColor. 채움 없으면 생략 */
  fill?: { faceColor: string }
}

/** 셀 글꼴 정의 (표별 로컬 id로 참조됨) */
export interface CharPrDef {
  /** "1100" (= 11pt × 100) */
  height_hwpunit?: string
  textColor?: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  /** fontfaces HANGUL 순번. render는 이름표로 손실하므로 원본 순번 보존용 */
  fontRef_hangul?: string
}

/** 셀 하나의 서식 참조 (좌표 = 병합 셀 좌상단 앵커) */
export interface CellProfile {
  row: number
  col: number
  rowSpan?: number
  colSpan?: number
  width_hwpunit?: string
  height_hwpunit?: string
  /** used_border_fills 키 */
  borderFillIDRef?: string
  /** used_char_prs 키 */
  charPrIDRef?: string
}

/** 표 하나의 서식 프로필 */
export interface TableProfile {
  /** 문서 내 표 등장 순서 (0-기준) */
  table_index: number
  rows: number
  cols: number
  width_hwpunit?: string
  col_widths_hwpunit?: string[]
  cells: CellProfile[]
  /** 로컬 id → 정의. 표별 독립 네임스페이스 */
  used_border_fills: Record<string, BorderFillDef>
  used_char_prs?: Record<string, CharPrDef>
}

/** 문서 전체 서식 프로필 */
export interface FormatProfile {
  schema_version?: string
  tables: TableProfile[]
}

// ─── 리맵 자료구조 ──────────────────────────────────

/** 표별 셀 서식 조회 테이블 (전역 id로 해석됨) */
export interface TableRemap {
  rows: number
  cols: number
  width?: number
  colWidths?: number[]
  /** "r,c" → 전역 borderFill id */
  cellBf: Map<string, number>
  /** "r,c" → 전역 charPr id */
  cellChar: Map<string, number>
  /** "r,c" → 셀 높이 (HWPUNIT) */
  cellH: Map<string, number>
}

/** 프로필 → 문서 전역 리맵 결과 */
export interface ProfileRemap {
  /** header borderFills에 추가할 XML (인덱스 i → 전역 id borderFillBase+i) */
  borderFillXmls: string[]
  /** header charProperties에 추가할 XML (인덱스 i → 전역 id charPrBase+i) */
  charPrXmls: string[]
  /** table_index → 표별 리맵 */
  tables: Map<number, TableRemap>
}

// ─── 파싱 유틸 ──────────────────────────────────────

/** "12750" / "1500 hwpunit" → 12750. 그 이상 단위변환은 하지 않음(스키마가 hwpunit 확정본). */
export function parseHu(s?: string): number | undefined {
  if (s == null) return undefined
  const n = parseInt(String(s).trim(), 10)
  return Number.isFinite(n) ? n : undefined
}

// ─── XML 빌더 ──────────────────────────────────────

/** 한 변 괘선 → XML. 정의 없으면 NONE (기본 borderFill id=1과 동일 형식). */
function edgeXml(tag: string, d?: BorderDef): string {
  return d
    ? `<hh:${tag} type="${d.type}" width="${d.width}" color="${d.color}"/>`
    : `<hh:${tag} type="NONE" width="0.1 mm" color="#000000"/>`
}

/**
 * BorderFillDef → `<hh:borderFill>` XML. gen-header.ts:198-213 형식 미러.
 * fill(음영)이 있으면 border들 뒤에 fillBrush>winBrush를 붙인다(HWPX 자식 순서).
 */
export function borderFillDefToXml(id: number, def: BorderFillDef): string {
  const fill = def.fill?.faceColor
    ? `<hh:fillBrush><hh:winBrush faceColor="${def.fill.faceColor}" hatchColor="#000000" alpha="0"/></hh:fillBrush>`
    : ""
  return `      <hh:borderFill id="${id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">
        <hh:slash type="NONE" Crooked="0" isCounter="0"/>
        <hh:backSlash type="NONE" Crooked="0" isCounter="0"/>
        ${edgeXml("leftBorder", def.leftBorder)}
        ${edgeXml("rightBorder", def.rightBorder)}
        ${edgeXml("topBorder", def.topBorder)}
        ${edgeXml("bottomBorder", def.bottomBorder)}${fill ? `\n        ${fill}` : ""}
      </hh:borderFill>`
}

/**
 * CharPrDef → `<hh:charPr>` XML. gen-ids.ts:123-129 형식 미러.
 * charPr() 헬퍼와 달리 볼드라도 fontRef를 강제 치환하지 않고(프로필 순번 존중),
 * underline을 지원한다.
 */
export function profileCharPrXml(id: number, def: CharPrDef): string {
  const height = parseHu(def.height_hwpunit) ?? 1000
  const color = def.textColor ?? "#000000"
  const font = def.fontRef_hangul != null ? parseInt(def.fontRef_hangul, 10) || 0 : 0
  const boldAttr = def.bold ? ` bold="1"` : ""
  const italicAttr = def.italic ? ` italic="1"` : ""
  const underline = def.underline
    ? `\n        <hh:underline type="BOTTOM" shape="SOLID" color="${color}"/>`
    : ""
  return `      <hh:charPr id="${id}" height="${height}" textColor="${color}" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1"${boldAttr}${italicAttr}>
        <hh:fontRef hangul="${font}" latin="${font}" hanja="${font}" japanese="${font}" other="${font}" symbol="${font}" user="${font}"/>
        <hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>
        <hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
        <hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>
        <hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>${underline}
      </hh:charPr>`
}

// ─── 리맵 빌더 ──────────────────────────────────────

/**
 * 프로필의 표별 로컬 borderFill/charPr을 문서 전역 id로 재할당한다.
 * 표별 독립 네임스페이스이므로 표마다 새 전역 id를 뽑는다(크로스-테이블 dedup 안 함 — 단순성).
 *
 * @param charPrBase 프로필 charPr 시작 전역 id (기본 charPr 0~10 + gongmun variant 다음)
 * @param borderFillBase 프로필 borderFill 시작 전역 id (기본 1=NONE,2=SOLID 다음)
 */
export function buildProfileRemap(
  profile: FormatProfile,
  charPrBase: number,
  borderFillBase = 3,
): ProfileRemap {
  const remap: ProfileRemap = { borderFillXmls: [], charPrXmls: [], tables: new Map() }
  let bfNext = borderFillBase
  let charNext = charPrBase

  for (const t of profile.tables) {
    // 표별 로컬 키 → 전역 id
    const localBf: Record<string, number> = {}
    for (const [key, def] of Object.entries(t.used_border_fills ?? {})) {
      const gid = bfNext++
      remap.borderFillXmls.push(borderFillDefToXml(gid, def))
      localBf[key] = gid
    }
    const localChar: Record<string, number> = {}
    for (const [key, def] of Object.entries(t.used_char_prs ?? {})) {
      const gid = charNext++
      remap.charPrXmls.push(profileCharPrXml(gid, def))
      localChar[key] = gid
    }

    // col_widths — 전부 유효 숫자이고 길이가 cols와 맞을 때만 채택(부분 데이터 오배치 방지)
    let colWidths: number[] | undefined
    if (t.col_widths_hwpunit && t.col_widths_hwpunit.length === t.cols) {
      const parsed = t.col_widths_hwpunit.map(parseHu)
      if (parsed.every(n => n != null)) colWidths = parsed as number[]
    }
    const tr: TableRemap = {
      rows: t.rows,
      cols: t.cols,
      width: parseHu(t.width_hwpunit),
      colWidths,
      cellBf: new Map(),
      cellChar: new Map(),
      cellH: new Map(),
    }

    for (const cell of t.cells) {
      const k = `${cell.row},${cell.col}`
      if (cell.borderFillIDRef != null && cell.borderFillIDRef in localBf) {
        tr.cellBf.set(k, localBf[cell.borderFillIDRef])
      }
      if (cell.charPrIDRef != null && cell.charPrIDRef in localChar) {
        tr.cellChar.set(k, localChar[cell.charPrIDRef])
      }
      const h = parseHu(cell.height_hwpunit)
      if (h != null) tr.cellH.set(k, h)
    }
    remap.tables.set(t.table_index, tr)
  }
  return remap
}

/**
 * markdownToHwpx가 넘겨줄 charPr 시작 id 계산.
 * 기본 charPr 0~10(11종) + 공문서 자동장평 variant(변형당 4종) 다음.
 */
export function profileCharPrBase(ratioVariantCount: number): number {
  return CHAR_VARIANT_BASE + ratioVariantCount * 4
}
