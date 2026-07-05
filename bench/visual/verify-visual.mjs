/**
 * P1 시각 오라클 하네스 — 로컬 한컴(맥) 실렌더 캡처를 지각해시(aHash)로 게이트.
 *
 * 원리: markdownToHwpx 산출물을 실제 한컴이 어떻게 그리는지가 유일한 truth다
 * (XML유효·재파싱일치·kordoc렌더 셋 다 통과해도 한컴이 flat/겹침/변조경고로
 * 그린 전례 다수 — 메모리 project-kordoc-v3). 케이스별 한컴 창 캡처를 32×32
 * aHash로 줄여 baseline과 해밍 거리 비교 — 레이아웃 붕괴·백지·경고 다이얼로그는
 * 해시가 크게 벗어나고, 폰트 힌팅·커서 같은 픽셀 노이즈는 흡수된다.
 *
 * 요구: macOS + Hancom Office HWP.app (GUI 세션). CI 불가 — 발행 전 로컬 실행.
 * 사용:
 *   node bench/visual/verify-visual.mjs            # 관찰 (거리 출력)
 *   node bench/visual/verify-visual.mjs --update   # baseline 해시 갱신
 *   node bench/visual/verify-visual.mjs --gate     # 거리 > 임계 시 exit 1
 *   node bench/visual/verify-visual.mjs --noise    # 같은 케이스 2회 캡처로 노이즈 측정
 */
import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { markdownToHwpx, placeSealHwpx } from "../../dist/index.js"

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, "out")
const baseDir = join(here, "baseline")
const args = process.argv.slice(2)
const UPDATE = args.includes("--update")
const GATE = args.includes("--gate")
const NOISE = args.includes("--noise")
const CASE = (args.find(a => a.startsWith("--case=")) ?? "").split("=")[1] || null

/** 해밍 거리 임계 (1024비트 중) — 동일 파일 2회 캡처 노이즈 실측(0~1)에 맞춰 48→16 인하.
 *  48 은 창 전체 크롭 시절 노이즈 기준의 잔존값이라 소형 개체(도장·수식) 소실을 못 잡았다.
 *  에러 다이얼로그·백지·대형 개체 소실은 수십~수백 비트라 여전히 검출된다 (gate-2).
 *  ※ 소형 도장(≤6비트) 확실 검출은 실측 세션에서 seal 케이스 크기 확대 또는 ROI 해시로 보강. */
const HAMMING_MAX = 16

const APP = "Hancom Office HWP"
const LOAD_WAIT_MS = 12000

// ─── 케이스 (P1이 잡아온 결함 계열 대표) ─────────────────────────
const CASES = [
  {
    name: "table-growth",
    md: [
      "# 표 성장",
      "",
      "| 항목 | 내용 |",
      "| --- | --- |",
      "| 개요 | 서울특별시 도시기반시설 관리 실태 전수조사 결과에 따라 노후 시설물의 안전등급 재산정과 보수보강 우선순위 조정이 필요하며 연차별 투자계획을 수립하여 시행한다. |",
      "",
      "표 뒤 문단은 표 아래에 렌더되어야 한다.",
    ].join("\n"),
  },
  {
    name: "heading-list",
    md: "# 제목\n\n본문 문단입니다.\n\n- 목록 하나\n- 목록 둘\n  - 하위 항목\n\n마지막 문단.",
  },
  {
    name: "equation",
    md: "수식 검증\n\n$$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$\n\n수식 아래 문단.",
  },
  {
    name: "gongmun-report",
    md: "# 추진 계획\n\n- **개요**: 시각 오라클 하네스 검증\n  - 세부 항목 하나\n  - 세부 항목 둘\n- **일정**: 2026년 7월",
    options: { gongmun: { preset: "보고서" } },
  },
  {
    // P6 도장 부유 배치 — 본문·표셀 앵커 각 1개. 검증 포인트: 도장이 "(인)" 옆/위에
    // 붉게 찍히고, 표/페이지가 커지지 않고, 변조 경고가 없어야 한다.
    name: "seal",
    md: "# 참가 신청서\n\n신청인: 홍길동 (인)\n\n| 결재 | 담당자 (인) |\n| --- | --- |\n\n표 아래 문단.",
    post: async (buf) => (await placeSealHwpx(buf, [
      { anchor: "(인)", occurrence: 0, image: new Uint8Array(SEAL_PNG) },
      { anchor: "(인)", occurrence: 1, image: new Uint8Array(SEAL_PNG) },
    ])).buffer,
  },
  {
    // P5 차트 — 막대 2계열. 검증 포인트: 한컴이 차트 개체를 실제로 그려야 한다
    // (chartSpace 파트 오류·미지원 구조면 빈 틀/에러 다이얼로그).
    name: "chart",
    md: "# 분기별 현황\n\n```chart\ntype: column\ncat: 1분기, 2분기, 3분기\n예산: 100, 120, 110\n집행: 80, 95, 105\n```\n\n차트 아래 문단.",
  },
]

/** P6 도장 픽스처 — 100×100 붉은 '인' PNG (투명 배경, base64 내장) */
const SEAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAEK0lEQVR42u2dX4gVVRzHP3daVhBaT/gHVNR9iDZBj/YQjkEp6otE/57aUtQHhQqSrU1ffAnyIZFQX8pSESKinloJIgmJtOAE6uIoKigVtBQUmwNSJirrw52N6+muO3Pv3JlZ+H5gHs65c89czmd/58z5sxwQQogpQy3rF5yxY6q2bIRxVMtdiEQUI6YmEdUSE0hG8dyvXgPJqJaUQDKqJaWr028NqvRsf9y1LAVIRGfENNZroKio1lgkUN9RregJFB3VipJA1VQtJERChIRIiJAQCRESIiGiaLrQtMUD3mj6jiKkPBl9wO3Gyxk7X0KEhKgPydaUdAGPA2uARcAc4EFgFPgTuAicCOPosoR0VsQ84E1gKzAjxf2/APuAw2Ec/aMmKz8RgTN2F/ATMJhGRkIvcAD42Rn7rITkI2MGcBzYDUyb4LY7wPX7FDMHOOaM3eeMrUlI6zKmAceAdd5HY8AQ8DIwH+gO46gH6AYeAV4Bvm9S5ACwV31I63wArPLyhoFNYRxd4P9LoLeAK8n1oTN2LXAUWNBw26Az9lIYR0cUIdmiYyWwxcv+EljZTAbN16hPAI8BkffRu87YhyQkG3u4d19YBPSHcXSTbBsHRoGnk1ficWYBOyUkfXQsAJ70sl9v9dU1jKMR4B0vu19C0vO8lz4TxtHJNsv8CLjR+ErsjF0uIelY3qTvoM09TzeAb73sJRKSjrle+kpO5frlzJOQdMz00nFO5f41yXMkZAJGvfSsDon+Q0LS8VuH2vpHvfTvEpKOc176hRxepXuA1V72WQlJxxfU56vGedgZ+1KbZb5Bfa5rnEtTcb0kKGlb/gjwnZf9XjJgbCU6ljUZmX+igWE2dnhRMhc47oztzShjKfAVML0h+1dgv4Rki5LTwPte9mJg2Bm7zRnbPYmI6c7YQeBHb7wxBmyfqiuIZU+/DwALgWca8kwyDfK2M3YoadpGqC9QmWSVcDXw3ATjjLfCOBoCrYe0EiW3nbEvAoeADU1G2a8lVxpuATvDONoPWjFsaw4qjKONwOY2BnLngSemuoxK7csK4+hj6lt+Xk1WDSf7j+CbwDdJc7cs6ZPQNqB8pfwLHAQOOmNnAk8lkmZT35d1jfq+rMvAD8kML9qXVYyc0WQAibaSCgkREqI+JOVUyGdAX0PW3jCOPpWQ8ujj3jX32WqyhCKkJP4Gvm4y4JSQEtdl1qvJEhIiIUJCJERIiMYh5dPrjF1R8DOvJtP/EkLzjRADBT+zH/hcTZaQEPUhk7Md6Cn5NwxLCP/NL51SkyUkREiIhAgJkRAhIRIiJERChIQICZEQISESIooWojNyKewo70Bn3lKpM3KDTh3ULlqrv1orX1Yk5SfCr8uuTtoWOXXqioDyzlcP1CxV67D7QH1FdWRM2Kmr3yheRGYhEtNZEUKINNwFfT5DTyesQggAAAAASUVORK5CYII=",
  "base64",
)

// ─── 한컴 캡처 ────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const osa = (script) => execFileSync("osascript", ["-e", script], { encoding: "utf8" }).trim()

async function captureHancom(hwpxPath, pngPath) {
  execFileSync("open", ["-a", APP, hwpxPath])
  await sleep(LOAD_WAIT_MS)
  // 콜드 스타트 대비 — 창이 잡힐 때까지 재시도 (최대 +20s)
  let bounds = null
  for (let i = 0; i < 10 && !bounds; i++) {
    try {
      const b = osa(
        `tell application "System Events" to tell process "${APP}"\n` +
        `  set w to window 1\n  return (position of w as list) & (size of w as list)\nend tell`,
      ).split(", ").map(Number)
      if (b.length === 4 && b.every(Number.isFinite)) bounds = b
    } catch { /* 프로세스/창 미준비 */ }
    if (!bounds) await sleep(2000)
  }
  if (!bounds) throw new Error("한컴 창을 못 잡음 — GUI 세션·손상 다이얼로그 확인")
  // -R은 z-order 무관 영역 캡처라, 한컴이 front가 아니면 앞 창(브라우저 등)이 찍힌다
  osa(`tell application "${APP}" to activate`)
  await sleep(700)
  const front = osa('tell application "System Events" to name of first process whose frontmost is true')
  if (front !== APP) throw new Error(`한컴이 front가 아님 (front=${front}) — 다른 창이 캡처를 가림`)
  osa('tell application "System Events" to key code 115 using command down') // Cmd+Home 스크롤 리셋
  await sleep(800)
  // 문서 페이지 영역만 크롭 — 툴바·찾기필드·상태바 등 UI 크롬은 세션마다 미세하게
  // 달라 aHash 노이즈가 된다 (실측: 창 전체 38/1024 → 문서 영역만 하면 근접 0)
  const [wx, wy, ww, wh] = bounds
  const crop = [wx + ww * 0.04, wy + wh * 0.2, ww * 0.92, wh * 0.72].map(Math.round)
  execFileSync("screencapture", ["-x", `-R${crop.join(",")}`, pngPath])
  // quit은 best-effort — 확인 다이얼로그로 -128이 떠도 다음 open이 front 창을 대체한다
  try { osa(`tell application "${APP}" to quit`) } catch { execFileSync("killall", [APP], { stdio: "ignore" }) }
  await sleep(1500)
}

// ─── aHash (sips 32×32 → BMP 파싱, 외부 의존 없음) ────────────────
function aHash(pngPath) {
  const bmpPath = pngPath.replace(/\.png$/, ".bmp")
  execFileSync("sips", ["-z", "32", "32", "-s", "format", "bmp", pngPath, "--out", bmpPath], { stdio: "pipe" })
  const b = readFileSync(bmpPath)
  rmSync(bmpPath)
  const off = b.readUInt32LE(10)
  const w = b.readInt32LE(18)
  const h = Math.abs(b.readInt32LE(22))
  const bpp = b.readUInt16LE(28) / 8
  if (w !== 32 || h !== 32 || bpp < 3) throw new Error(`BMP 파싱 실패 w${w} h${h} bpp${bpp * 8}`)
  const rowSize = Math.ceil((w * bpp) / 4) * 4
  const gray = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = off + y * rowSize + x * bpp
      gray.push((b[p] + b[p + 1] + b[p + 2]) / 3)
    }
  }
  const avg = gray.reduce((s, v) => s + v, 0) / gray.length
  return gray.map((v) => (v >= avg ? "1" : "0")).join("")
}

const hamming = (a, b) => {
  if (a.length !== b.length) return Infinity
  let d = 0
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++
  return d
}

// ─── 메인 ────────────────────────────────────────────
mkdirSync(outDir, { recursive: true })
mkdirSync(baseDir, { recursive: true })

if (NOISE) {
  // 동일 케이스 2회 캡처 → 노이즈 해밍 거리 (임계 산정용)
  const c = CASES[0]
  const hwpx = join(outDir, `${c.name}.hwpx`)
  writeFileSync(hwpx, Buffer.from(await markdownToHwpx(c.md, c.options)))
  const h = []
  for (const k of [1, 2]) {
    const png = join(outDir, `${c.name}.noise${k}.png`)
    await captureHancom(hwpx, png)
    h.push(aHash(png))
  }
  console.log(`노이즈 해밍 거리 (동일 파일 2회): ${hamming(h[0], h[1])} / 1024`)
  process.exit(0)
}

let fail = 0
const targets = CASES.filter(c => !CASE || c.name === CASE)
if (CASE && targets.length === 0) {
  // --case= 오타/무매치 — 0건 통과를 '전체 통과'로 오인시키지 않게 명시 실패 (gate-4)
  console.error(`❌ --case=${CASE} 에 해당하는 케이스가 없습니다 (유효: ${CASES.map(c => c.name).join(", ")})`)
  process.exit(1)
}
for (const c of targets) {
  const hwpx = join(outDir, `${c.name}.hwpx`)
  let buf = await markdownToHwpx(c.md, c.options)
  if (c.post) buf = await c.post(buf)
  writeFileSync(hwpx, Buffer.from(buf))
  const png = join(outDir, `${c.name}.png`)
  await captureHancom(hwpx, png)
  const hash = aHash(png)
  const basePath = join(baseDir, `${c.name}.hash`)

  if (UPDATE) {
    writeFileSync(basePath, hash + "\n")
    console.log(`📌 ${c.name}: baseline 갱신 (out/${c.name}.png 눈으로 확인할 것)`)
    continue
  }
  if (!existsSync(basePath)) {
    // 게이트 모드에서 baseline 부재는 실패 — 깨진 첫 캡처를 truth 로 박제하지 않는다.
    // 신규 케이스는 --update 로 명시 박제 후 눈으로 확인해야 통과한다 (gate-1).
    if (GATE) { fail++; console.error(`❌ ${c.name}: baseline 부재 — --update 로 박제 후 눈으로 확인할 것`); continue }
    writeFileSync(basePath, hash + "\n")
    console.log(`📌 ${c.name}: baseline 신규 생성 (out/${c.name}.png 눈으로 확인할 것)`)
    continue
  }
  const d = hamming(readFileSync(basePath, "utf8").trim(), hash)
  const ok = d <= HAMMING_MAX
  if (!ok) fail++
  console.log(`${ok ? "✅" : "❌"} ${c.name}: 해밍 ${d} (임계 ${HAMMING_MAX}) — out/${c.name}.png`)
}

if (fail) {
  console.error(`\n❌ 시각 게이트: ${fail}건 이탈 — out/*.png를 baseline과 눈으로 대조 후, 의도된 변경이면 --update`)
  if (GATE) process.exit(1)
} else {
  console.log(`\n✅ 시각 게이트 통과 (${targets.length}건)`)
}
