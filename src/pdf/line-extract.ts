/**
 * PDF 그래픽 명령에서 수평/수직 선을 추출하는 모듈 (line-detector.ts에서 분리).
 *
 * 선 전처리 파이프라인은 OpenDataLoader PDF의 LinesPreprocessingConsumer를
 * 참고하여 TypeScript로 clean-room 재구현한 것입니다.
 * Original algorithm: Copyright 2025-2026 Hancom, Inc. (Apache 2.0)
 * https://github.com/opendataloader-project/opendataloader-pdf
 */

import { OPS } from "pdfjs-dist/legacy/build/pdf.mjs"
import type { LineSegment } from "./line-types.js"

// ─── pdfjs-dist v5 DrawOPS ──
const enum DrawOPS {
  moveTo = 0,
  lineTo = 1,
  curveTo = 2,
  quadraticCurveTo = 3,
  closePath = 4,
}

/** 수평/수직 판별 허용 오차 (pt) */
const ORIENTATION_TOL = 2
/** 최소 선 길이 — 짧은 장식선(체크박스 테두리 등) 무시 */
const MIN_LINE_LENGTH = 15
/** 굵은 선 필터 — ODL: MAX_LINE_WIDTH = 5.0 (배경 채움/장식 사각형 제외) */
const MAX_LINE_WIDTH = 5.0

// ─── 선 추출 ──────────────────────────────────────────

/**
 * pdfjs operatorList에서 수평/수직 선을 추출.
 * constructPath(91) 내의 moveTo→lineTo, rectangle 패턴을 인식.
 */
export function extractLines(
  fnArray: Uint32Array | number[],
  argsArray: unknown[][],
): { horizontals: LineSegment[]; verticals: LineSegment[] } {
  const horizontals: LineSegment[] = []
  const verticals: LineSegment[] = []
  let lineWidth = 1

  let currentPath: Array<{ x1: number; y1: number; x2: number; y2: number }> = []
  let pathStartX = 0, pathStartY = 0
  let curX = 0, curY = 0

  function pushRectangle(
    path: Array<{ x1: number; y1: number; x2: number; y2: number }>,
    rx: number, ry: number, rw: number, rh: number,
  ) {
    if (Math.abs(rh) < ORIENTATION_TOL * 2) {
      path.push({ x1: rx, y1: ry + rh / 2, x2: rx + rw, y2: ry + rh / 2 })
    } else if (Math.abs(rw) < ORIENTATION_TOL * 2) {
      path.push({ x1: rx + rw / 2, y1: ry, x2: rx + rw / 2, y2: ry + rh })
    } else {
      path.push(
        { x1: rx, y1: ry, x2: rx + rw, y2: ry },
        { x1: rx + rw, y1: ry, x2: rx + rw, y2: ry + rh },
        { x1: rx + rw, y1: ry + rh, x2: rx, y2: ry + rh },
        { x1: rx, y1: ry + rh, x2: rx, y2: ry },
      )
    }
  }

  function flushPath(isStroke: boolean) {
    if (!isStroke) { currentPath = []; return }
    for (const seg of currentPath) {
      classifyAndAdd(seg, lineWidth, horizontals, verticals)
    }
    currentPath = []
  }

  for (let i = 0; i < fnArray.length; i++) {
    const op = fnArray[i]
    const args = argsArray[i]

    switch (op) {
      case OPS.setLineWidth:
        lineWidth = (args as number[])[0] || 1
        break

      case OPS.constructPath: {
        const arg0 = args[0]

        if (Array.isArray(arg0)) {
          // ── pdfjs-dist v4 형식 ──
          const subOps = arg0 as number[]
          const coords = (args as [number[], number[]])[1]
          let ci = 0

          for (const subOp of subOps) {
            if (subOp === OPS.moveTo) {
              curX = coords[ci++]; curY = coords[ci++]
              pathStartX = curX; pathStartY = curY
            } else if (subOp === OPS.lineTo) {
              const x2 = coords[ci++], y2 = coords[ci++]
              currentPath.push({ x1: curX, y1: curY, x2, y2 })
              curX = x2; curY = y2
            } else if (subOp === OPS.rectangle) {
              const rx = coords[ci++], ry = coords[ci++]
              const rw = coords[ci++], rh = coords[ci++]
              pushRectangle(currentPath, rx, ry, rw, rh)
            } else if (subOp === OPS.closePath) {
              if (curX !== pathStartX || curY !== pathStartY) {
                currentPath.push({ x1: curX, y1: curY, x2: pathStartX, y2: pathStartY })
              }
              curX = pathStartX; curY = pathStartY
            } else if (subOp === OPS.curveTo) {
              ci += 6
            } else if (subOp === OPS.curveTo2 || subOp === OPS.curveTo3) {
              ci += 4
            }
          }
        } else {
          // ── pdfjs-dist v5 형식 ──
          const afterOp = arg0 as number
          const dataArr = args[1] as unknown[]
          const pathData = dataArr?.[0] as Record<number, number> | undefined
          if (pathData && typeof pathData === "object") {
            const len = Object.keys(pathData).length
            let di = 0
            while (di < len) {
              const drawOp = pathData[di++]
              if (drawOp === DrawOPS.moveTo) {
                curX = pathData[di++]; curY = pathData[di++]
                pathStartX = curX; pathStartY = curY
              } else if (drawOp === DrawOPS.lineTo) {
                const x2 = pathData[di++], y2 = pathData[di++]
                currentPath.push({ x1: curX, y1: curY, x2, y2 })
                curX = x2; curY = y2
              } else if (drawOp === DrawOPS.curveTo) {
                di += 6
              } else if (drawOp === DrawOPS.quadraticCurveTo) {
                di += 4
              } else if (drawOp === DrawOPS.closePath) {
                if (curX !== pathStartX || curY !== pathStartY) {
                  currentPath.push({ x1: curX, y1: curY, x2: pathStartX, y2: pathStartY })
                }
                curX = pathStartX; curY = pathStartY
              } else {
                break
              }
            }
          }

          if (afterOp === OPS.stroke || afterOp === OPS.closeStroke) {
            flushPath(true)
          } else if (afterOp === OPS.fill || afterOp === OPS.eoFill ||
                     afterOp === OPS.fillStroke || afterOp === OPS.eoFillStroke ||
                     afterOp === OPS.closeFillStroke || afterOp === OPS.closeEOFillStroke) {
            flushPath(true)
          } else if (afterOp === OPS.endPath) {
            flushPath(false)
          }
        }
        break
      }

      case OPS.stroke:
      case OPS.closeStroke:
        flushPath(true)
        break

      case OPS.fill:
      case OPS.eoFill:
      case OPS.fillStroke:
      case OPS.eoFillStroke:
      case OPS.closeFillStroke:
      case OPS.closeEOFillStroke:
        flushPath(true)
        break

      case OPS.endPath:
        flushPath(false)
        break
    }
  }

  return { horizontals, verticals }
}


function classifyAndAdd(
  seg: { x1: number; y1: number; x2: number; y2: number },
  lineWidth: number,
  horizontals: LineSegment[],
  verticals: LineSegment[],
) {
  const dx = Math.abs(seg.x2 - seg.x1)
  const dy = Math.abs(seg.y2 - seg.y1)
  const length = Math.sqrt(dx * dx + dy * dy)

  if (length < MIN_LINE_LENGTH) return

  if (dy <= ORIENTATION_TOL) {
    const y = (seg.y1 + seg.y2) / 2
    const x1 = Math.min(seg.x1, seg.x2)
    const x2 = Math.max(seg.x1, seg.x2)
    horizontals.push({ x1, y1: y, x2, y2: y, lineWidth })
  } else if (dx <= ORIENTATION_TOL) {
    const x = (seg.x1 + seg.x2) / 2
    const y1 = Math.min(seg.y1, seg.y2)
    const y2 = Math.max(seg.y1, seg.y2)
    verticals.push({ x1: x, y1, x2: x, y2, lineWidth })
  }
}

// ─── 선 전처리 파이프라인 (ODL LinesPreprocessingConsumer 포팅) ──

/**
 * 선 전처리: 굵은 선 필터 → 근접 선 병합 → 장식선 필터링
 * ODL의 LinesPreprocessingConsumer가 하는 핵심 로직.
 */
export function preprocessLines(
  horizontals: LineSegment[],
  verticals: LineSegment[],
): { horizontals: LineSegment[]; verticals: LineSegment[] } {
  // 1. 굵은 선 필터링 (배경 채움 사각형, 장식 테두리 등)
  let h = horizontals.filter(l => l.lineWidth <= MAX_LINE_WIDTH)
  let v = verticals.filter(l => l.lineWidth <= MAX_LINE_WIDTH)

  // 2. 근접 평행 선 병합 (인쇄 잔상, 이중선)
  h = mergeParallelLines(h, "h")
  v = mergeParallelLines(v, "v")

  return { horizontals: h, verticals: v }
}

/**
 * 근접 평행 선 병합 — 같은 방향의 가까운 선을 하나로 합침.
 * 이중선, 인쇄 잔상, PDF 렌더링 미세 차이로 인한 중복 선 제거.
 */
function mergeParallelLines(lines: LineSegment[], dir: "h" | "v"): LineSegment[] {
  if (lines.length <= 1) return lines

  // 수평선: y로 정렬, 수직선: x로 정렬
  const sorted = [...lines].sort((a, b) => {
    const posA = dir === "h" ? a.y1 : a.x1
    const posB = dir === "h" ? b.y1 : b.x1
    if (Math.abs(posA - posB) > 0.1) return posA - posB
    // 같은 위치면 시작 좌표로
    return dir === "h" ? (a.x1 - b.x1) : (a.y1 - b.y1)
  })

  const MERGE_TOL = 3 // 3pt 이내 평행 선 병합

  const result: LineSegment[] = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    const prev = result[result.length - 1]
    const curr = sorted[i]

    const prevPos = dir === "h" ? prev.y1 : prev.x1
    const currPos = dir === "h" ? curr.y1 : curr.x1

    if (Math.abs(prevPos - currPos) <= MERGE_TOL) {
      // 범위가 겹치는지 확인
      const prevStart = dir === "h" ? prev.x1 : prev.y1
      const prevEnd = dir === "h" ? prev.x2 : prev.y2
      const currStart = dir === "h" ? curr.x1 : curr.y1
      const currEnd = dir === "h" ? curr.x2 : curr.y2

      const overlap = Math.min(prevEnd, currEnd) - Math.max(prevStart, currStart)
      const minLen = Math.min(prevEnd - prevStart, currEnd - currStart)

      if (overlap > minLen * 0.3) {
        // 병합: 범위 확장, lineWidth는 최대값 유지
        if (dir === "h") {
          prev.x1 = Math.min(prev.x1, curr.x1)
          prev.x2 = Math.max(prev.x2, curr.x2)
          prev.y1 = (prev.y1 + curr.y1) / 2
          prev.y2 = prev.y1
        } else {
          prev.y1 = Math.min(prev.y1, curr.y1)
          prev.y2 = Math.max(prev.y2, curr.y2)
          prev.x1 = (prev.x1 + curr.x1) / 2
          prev.x2 = prev.x1
        }
        prev.lineWidth = Math.max(prev.lineWidth, curr.lineWidth)
        continue
      }
    }
    result.push(curr)
  }
  return result
}

// ─── 페이지 경계(클립) 선 필터링 ──────────────────────

export function filterPageBorderLines(
  horizontals: LineSegment[],
  verticals: LineSegment[],
  pageWidth: number,
  pageHeight: number,
): { horizontals: LineSegment[]; verticals: LineSegment[] } {
  const margin = 5
  return {
    horizontals: horizontals.filter(l =>
      !(Math.abs(l.y1) < margin || Math.abs(l.y1 - pageHeight) < margin) ||
      (l.x2 - l.x1) < pageWidth * 0.9
    ),
    verticals: verticals.filter(l =>
      !(Math.abs(l.x1) < margin || Math.abs(l.x1 - pageWidth) < margin) ||
      (l.y2 - l.y1) < pageHeight * 0.9
    ),
  }
}

