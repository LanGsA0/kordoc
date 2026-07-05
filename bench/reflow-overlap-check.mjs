// reflow 렌더 텍스트 겹침 자동감지 — 결재란 등 중첩표 조판 회귀 지표.
// SVG의 <text> bbox(baseline+textLength+font-size)를 쌍별로 교차검사해 겹치는 쌍을 보고한다.
// WebView2/Edge와 동일하게 textLength를 폭으로 신뢰(librsvg/sharp 래스터화와 무관한 순수 좌표 검사).
//
// 사용: node bench/reflow-overlap-check.mjs <svg> [pageIndex=0] [yMax=220]
//   예: node dist/cli.js render tests/fixtures/real/지역아동센터계획.hwpx -o /tmp/out.svg --reflow --silent
//       node bench/reflow-overlap-check.mjs /tmp/out.svg 0 220   → 결재란 겹침쌍 개수(수정 후 0 목표)
//
// 관련: .claude/plans/next-session-gyeoljaeran-overlap.md
import fs from 'node:fs'

const svgPath = process.argv[2]
if (!svgPath) {
  console.error('usage: node bench/reflow-overlap-check.mjs <svg> [pageIndex=0] [yMax=220]')
  process.exit(2)
}
const pageIdx = +(process.argv[3] ?? 0)
const yMax = +(process.argv[4] ?? 220)
const svg = fs.readFileSync(svgPath, 'utf8')

// 페이지 그룹 격리 — 다페이지 SVG는 clip-path="url(#pgclipN)" 사용 지점 ~ 다음 페이지 직전.
const start = svg.indexOf(`url(#pgclip${pageIdx})`)
const next = svg.indexOf(`url(#pgclip${pageIdx + 1})`)
const page = svg.slice(start >= 0 ? start : 0, next > start ? next : svg.length)

const re = /<text x="([\d.]+)" y="([\d.]+)"([^>]*)>([^<]*)<\/text>/g
const boxes = []
let m
while ((m = re.exec(page))) {
  const x = +m[1], y = +m[2], attrs = m[3], t = m[4]
  if (y >= yMax || !t.trim()) continue
  const fs_ = +(attrs.match(/font-size="([\d.]+)"/)?.[1] ?? 10)
  const w = +(attrs.match(/textLength="([\d.]+)"/)?.[1] ?? t.length * fs_ * 0.5)
  // baseline 기준 ascent 0.78·descent 0.18 (실제 잉크 근사, 보수적)
  boxes.push({ t, x0: x, x1: x + w, y0: y - fs_ * 0.78, y1: y + fs_ * 0.18 })
}

const EPS = 1.0 // pt² 이하 접촉(정상 인접 스택)은 무시
const overlaps = []
for (let i = 0; i < boxes.length; i++)
  for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j]
    const ix = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)
    const iy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)
    if (ix > 0.5 && iy > 0.5 && ix * iy > EPS)
      overlaps.push({ area: ix * iy, a: a.t, b: b.t, ix: ix.toFixed(1), iy: iy.toFixed(1) })
  }

overlaps.sort((p, q) => q.area - p.area)
console.log(`page ${pageIdx} (y<${yMax}): ${boxes.length} texts, ${overlaps.length} overlapping pairs`)
for (const o of overlaps.slice(0, 20))
  console.log(`  area=${o.area.toFixed(0).padStart(5)} ix=${o.ix} iy=${o.iy}  ${JSON.stringify(o.a)} ∩ ${JSON.stringify(o.b)}`)
process.exit(overlaps.length > 0 ? 1 : 0)
