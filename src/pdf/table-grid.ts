/**
 * 선 교차점(Vertex) 기반 테이블 그리드 구성 (line-detector.ts에서 분리).
 *
 * OpenDataLoader PDF의 TableBorderBuilder를 참고하여 TypeScript로
 * clean-room 재구현한 것입니다. Vertex 기반 동적 tolerance 포함.
 * Original algorithm: Copyright 2025-2026 Hancom, Inc. (Apache 2.0)
 * https://github.com/opendataloader-project/opendataloader-pdf
 * Core algorithm concepts from veraPDF-wcag-algs (GPLv3+/MPLv2+)
 */

import type { LineSegment, TableGrid } from "./line-types.js"
import { VERTEX_MERGE_FACTOR } from "./line-types.js"

/** 선 교차점 (Vertex) — ODL의 핵심 개념 */
interface Vertex {
  x: number
  y: number
  /** 교차하는 선들의 최대 lineWidth → tolerance 계산에 사용 */
  radius: number
}

/** 두 선이 같은 테이블에 속하는지 판별하는 거리 */
const CONNECT_TOL = 5
/** 최소 열 폭 (pt) — 이보다 좁은 열은 인접 열과 병합 */
const MIN_COL_WIDTH = 15
/** 최소 행 높이 (pt) */
const MIN_ROW_HEIGHT = 6
/** 좌표 병합 최소 tolerance (pt) — vertexRadius가 작아도 이 값 이하로 내려가지 않음 */
const MIN_COORD_MERGE_TOL = 8

// ─── Vertex(교차점) 생성 ─────────────────────────────

/**
 * 수평선과 수직선의 교차점(Vertex)을 생성.
 * ODL의 TableBorderBuilder.addLine()이 교차점을 자동 생성하는 것과 동일.
 * 각 Vertex는 교차하는 선들의 lineWidth로 radius를 계산 → 동적 tolerance.
 */
function buildVertices(horizontals: LineSegment[], verticals: LineSegment[]): Vertex[] {
  const vertices: Vertex[] = []
  const tol = CONNECT_TOL

  for (const h of horizontals) {
    for (const v of verticals) {
      // 수평선의 X범위에 수직선의 X가 포함되고
      // 수직선의 Y범위에 수평선의 Y가 포함되면 → 교차
      if (v.x1 >= h.x1 - tol && v.x1 <= h.x2 + tol &&
          h.y1 >= v.y1 - tol && h.y1 <= v.y2 + tol) {
        const radius = Math.max(h.lineWidth, v.lineWidth, 1)
        vertices.push({ x: v.x1, y: h.y1, radius })
      }
    }
  }

  return vertices
}

/**
 * 근접 Vertex 병합 — 같은 교차점의 미세 위치 차이를 하나로 합침.
 */
function mergeVertices(vertices: Vertex[]): Vertex[] {
  if (vertices.length <= 1) return vertices

  const merged: Vertex[] = []
  const used = new Array(vertices.length).fill(false)

  for (let i = 0; i < vertices.length; i++) {
    if (used[i]) continue
    let sumX = vertices[i].x, sumY = vertices[i].y
    let maxRadius = vertices[i].radius
    let count = 1

    for (let j = i + 1; j < vertices.length; j++) {
      if (used[j]) continue
      const mergeTol = VERTEX_MERGE_FACTOR * Math.max(maxRadius, vertices[j].radius)
      if (Math.abs(vertices[i].x - vertices[j].x) <= mergeTol &&
          Math.abs(vertices[i].y - vertices[j].y) <= mergeTol) {
        sumX += vertices[j].x
        sumY += vertices[j].y
        maxRadius = Math.max(maxRadius, vertices[j].radius)
        count++
        used[j] = true
      }
    }

    merged.push({ x: sumX / count, y: sumY / count, radius: maxRadius })
  }

  return merged
}

// ─── 테이블 그리드 구성 (Vertex 기반) ─────────────────

/**
 * 수평/수직 선에서 테이블 그리드를 추출.
 * ODL과 동일한 흐름:
 * 1. 선 전처리 (preprocessLines — 호출측에서 수행)
 * 2. 교차점(Vertex) 생성 + 병합
 * 3. 교차하는 선들을 그룹화 (연결 컴포넌트)
 * 4. 각 그룹에서 Vertex의 X/Y 좌표를 동적 tolerance로 클러스터링
 * 5. 그리드 검증 (최소 열 폭, 최소 행 높이)
 */
export function buildTableGrids(
  horizontals: LineSegment[],
  verticals: LineSegment[],
): TableGrid[] {
  if (horizontals.length < 2 || verticals.length < 2) return []

  // 1. 교차점 생성
  const allVertices = buildVertices(horizontals, verticals)
  const vertices = mergeVertices(allVertices)

  if (vertices.length < 4) return [] // 최소 4꼭짓점 필요 (사각형)

  // 전체 vertex의 대표 radius (동적 tolerance)
  const globalRadius = vertices.reduce((max, v) => Math.max(max, v.radius), 1)

  // 2. 선들을 교차 관계로 그룹화
  const allLines = [
    ...horizontals.map((l, i) => ({ ...l, type: "h" as const, id: i })),
    ...verticals.map((l, i) => ({ ...l, type: "v" as const, id: i + horizontals.length })),
  ]

  const groups = groupConnectedLines(allLines)
  const grids: TableGrid[] = []

  for (const group of groups) {
    const hLines = group.filter(l => l.type === "h")
    const vLines = group.filter(l => l.type === "v")

    if (hLines.length < 2 || vLines.length < 2) continue

    // 3. 이 그룹의 Vertex만 수집
    let gx1 = Infinity, gy1 = Infinity, gx2 = -Infinity, gy2 = -Infinity
    for (const l of vLines) { if (l.x1 < gx1) gx1 = l.x1; if (l.x1 > gx2) gx2 = l.x1 }
    for (const l of hLines) { if (l.y1 < gy1) gy1 = l.y1; if (l.y1 > gy2) gy2 = l.y1 }
    const groupBbox = {
      x1: gx1 - CONNECT_TOL,
      y1: gy1 - CONNECT_TOL,
      x2: gx2 + CONNECT_TOL,
      y2: gy2 + CONNECT_TOL,
    }

    const groupVertices = vertices.filter(v =>
      v.x >= groupBbox.x1 && v.x <= groupBbox.x2 &&
      v.y >= groupBbox.y1 && v.y <= groupBbox.y2
    )

    // 그룹 vertex의 대표 radius
    const groupRadius = groupVertices.length > 0
      ? groupVertices.reduce((max, v) => Math.max(max, v.radius), 1)
      : globalRadius

    // 4. Vertex 기반 좌표 클러스터링 (동적 tolerance)
    const coordMergeTol = Math.max(VERTEX_MERGE_FACTOR * groupRadius, MIN_COORD_MERGE_TOL)

    // Y좌표: 수평선 y + Vertex y
    const rawYs = [
      ...hLines.map(l => l.y1),
      ...groupVertices.map(v => v.y),
    ]
    const rowYs = clusterCoordinates(rawYs, coordMergeTol).sort((a, b) => b - a)

    // X좌표: 수직선 x + Vertex x
    const rawXs = [
      ...vLines.map(l => l.x1),
      ...groupVertices.map(v => v.x),
    ]
    const colXs = clusterCoordinates(rawXs, coordMergeTol).sort((a, b) => a - b)

    if (rowYs.length < 2 || colXs.length < 2) continue

    // 5. 그리드 검증: 최소 열 폭, 최소 행 높이
    const validColXs = enforceMinWidth(colXs, MIN_COL_WIDTH)
    const validRowYs = enforceMinHeight(rowYs, MIN_ROW_HEIGHT)

    if (validRowYs.length < 2 || validColXs.length < 2) continue

    const bbox = {
      x1: validColXs[0], y1: validRowYs[validRowYs.length - 1],
      x2: validColXs[validColXs.length - 1], y2: validRowYs[0],
    }

    grids.push({ rowYs: validRowYs, colXs: validColXs, bbox, vertexRadius: groupRadius })
  }

  return mergeAdjacentGrids(grids)
}

/** 최소 열 폭 보장 — 너무 좁은 열은 인접 열과 병합 */
function enforceMinWidth(colXs: number[], minWidth: number): number[] {
  if (colXs.length <= 2) return colXs
  const result: number[] = [colXs[0]]
  for (let i = 1; i < colXs.length; i++) {
    const prevX = result[result.length - 1]
    if (colXs[i] - prevX < minWidth && i < colXs.length - 1) {
      // 너무 좁으면 스킵 (다음 열과 병합)
      continue
    }
    result.push(colXs[i])
  }
  return result
}

/** 최소 행 높이 보장 — 너무 낮은 행은 인접 행과 병합 */
function enforceMinHeight(rowYs: number[], minHeight: number): number[] {
  if (rowYs.length <= 2) return rowYs
  // rowYs는 내림차순 (위→아래)
  const result: number[] = [rowYs[0]]
  for (let i = 1; i < rowYs.length; i++) {
    const prevY = result[result.length - 1]
    if (prevY - rowYs[i] < minHeight && i < rowYs.length - 1) {
      continue
    }
    result.push(rowYs[i])
  }
  return result
}

/** 같은 열 구조를 가진 인접 그리드를 병합 */
function mergeAdjacentGrids(grids: TableGrid[]): TableGrid[] {
  if (grids.length <= 1) return grids
  const sorted = [...grids].sort((a, b) => b.bbox.y2 - a.bbox.y2)
  const merged: TableGrid[] = [sorted[0]]

  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1]
    const curr = sorted[i]

    if (prev.colXs.length === curr.colXs.length) {
      const mergeTol = Math.max(VERTEX_MERGE_FACTOR * Math.max(prev.vertexRadius, curr.vertexRadius), 6) * 3
      const colMatch = prev.colXs.every((x, ci) => Math.abs(x - curr.colXs[ci]) <= mergeTol)
      const verticalGap = prev.bbox.y1 - curr.bbox.y2
      if (colMatch && verticalGap >= -CONNECT_TOL && verticalGap <= 20) {
        const allRowYs = [...new Set([...prev.rowYs, ...curr.rowYs])].sort((a, b) => b - a)
        merged[merged.length - 1] = {
          rowYs: allRowYs,
          colXs: prev.colXs,
          bbox: {
            x1: Math.min(prev.bbox.x1, curr.bbox.x1),
            y1: Math.min(prev.bbox.y1, curr.bbox.y1),
            x2: Math.max(prev.bbox.x2, curr.bbox.x2),
            y2: Math.max(prev.bbox.y2, curr.bbox.y2),
          },
          vertexRadius: Math.max(prev.vertexRadius, curr.vertexRadius),
        }
        continue
      }
    }
    merged.push(curr)
  }
  return merged
}

/** 좌표값 클러스터링 — 동적 tolerance 기반 (ODL의 vertex radius 반영) */
function clusterCoordinates(values: number[], tolerance: number): number[] {
  if (values.length === 0) return []
  const sorted = [...values].sort((a, b) => a - b)
  const clusters: { sum: number; count: number }[] = [{ sum: sorted[0], count: 1 }]

  for (let i = 1; i < sorted.length; i++) {
    const last = clusters[clusters.length - 1]
    const avg = last.sum / last.count
    if (Math.abs(sorted[i] - avg) <= tolerance) {
      last.sum += sorted[i]
      last.count++
    } else {
      clusters.push({ sum: sorted[i], count: 1 })
    }
  }

  return clusters.map(c => c.sum / c.count)
}

type TypedLine = LineSegment & { type: "h" | "v"; id: number }

/** 교차하는 선들을 Union-Find로 그룹화 */
function groupConnectedLines(lines: TypedLine[]): TypedLine[][] {
  const parent = lines.map((_, i) => i)

  function find(x: number): number {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x] }
    return x
  }
  function union(a: number, b: number) {
    const ra = find(a), rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }

  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      if (linesIntersect(lines[i], lines[j])) {
        union(i, j)
      }
    }
  }

  const groups = new Map<number, TypedLine[]>()
  for (let i = 0; i < lines.length; i++) {
    const root = find(i)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root)!.push(lines[i])
  }

  return [...groups.values()]
}

/** 수평선과 수직선의 교차 판정 (tolerance 포함) */
function linesIntersect(a: TypedLine, b: TypedLine): boolean {
  if (a.type === b.type) {
    if (a.type === "h") {
      if (Math.abs(a.y1 - b.y1) > CONNECT_TOL) return false
      return Math.min(a.x2, b.x2) >= Math.max(a.x1, b.x1) - CONNECT_TOL
    } else {
      if (Math.abs(a.x1 - b.x1) > CONNECT_TOL) return false
      return Math.min(a.y2, b.y2) >= Math.max(a.y1, b.y1) - CONNECT_TOL
    }
  }

  const h = a.type === "h" ? a : b
  const v = a.type === "h" ? b : a
  const tol = CONNECT_TOL

  return (
    v.x1 >= h.x1 - tol && v.x1 <= h.x2 + tol &&
    h.y1 >= v.y1 - tol && h.y1 <= v.y2 + tol
  )
}

