#!/usr/bin/env node
// 코퍼스 parse → markdown+blocks sha256 스냅샷 (순수 이동 리팩토링 전/후 동일성 게이트)
// 사용법: node bench/hash-sweep.mjs <corpus하위경로> <출력.json>
//   예:   node bench/hash-sweep.mjs pdf /tmp/before.json   (리팩토링 전)
//         node bench/hash-sweep.mjs pdf /tmp/after.json && diff /tmp/before.json /tmp/after.json
// dist 기준이므로 npm run build 후 실행할 것. 해시 결정성은 같은 입력 2회 실행 diff로 검증.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { parse } from "../dist/index.js";

const [subdir, outPath] = process.argv.slice(2);
if (!subdir || !outPath) {
  console.error("사용법: node bench/hash-sweep.mjs <corpus하위경로> <출력.json>");
  process.exit(1);
}
const dir = new URL(`./corpus/${subdir}/`, import.meta.url).pathname;
const EXTS = /\.(pdf|hwpx?|docx|xlsx)$/i;

const out = {};
for (const f of (await readdir(dir)).filter(f => EXTS.test(f)).sort()) {
  const buf = await readFile(join(dir, f));
  try {
    const r = await parse(buf);
    if (!r.success) { out[f] = `FAIL:${r.error}`; continue; }
    const h = createHash("sha256");
    h.update(r.markdown);
    h.update(JSON.stringify(r.blocks));
    out[f] = h.digest("hex");
  } catch (e) {
    out[f] = `THROW:${e.message}`;
  }
}
await writeFile(outPath, JSON.stringify(out, null, 2));
const bad = Object.entries(out).filter(([, v]) => !/^[0-9a-f]{64}$/.test(v));
console.log(`${Object.keys(out).length}건 해시 → ${outPath}, 실패 ${bad.length}건`);
for (const [f, v] of bad) console.log(`  ! ${f}: ${v.slice(0, 120)}`);
