// Throwaway measurement helper for the launcher-critical-bundle Phase 0 spike.
// Reports raw / gzip / brotli sizes for the given files.
import { readFileSync, statSync } from "node:fs";
import { gzipSync, brotliCompressSync, constants } from "node:zlib";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: node measure-size.mjs <file> [file...]");
  process.exit(1);
}

const kb = (n) => (n / 1024).toFixed(1).padStart(7) + " kB";

const rows = [];
for (const f of files) {
  let buf;
  try {
    buf = readFileSync(f);
  } catch {
    rows.push({ f, raw: NaN, gz: NaN, br: NaN });
    continue;
  }
  const raw = statSync(f).size;
  const gz = gzipSync(buf, { level: 9 }).length;
  const br = brotliCompressSync(buf, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  }).length;
  rows.push({ f, raw, gz, br });
}

console.log("");
console.log(
  "file".padEnd(40) + "raw".padStart(10) + "gzip".padStart(10) + "brotli".padStart(10)
);
console.log("-".repeat(70));
for (const r of rows) {
  const name = r.f.split("/").slice(-1)[0];
  if (Number.isNaN(r.raw)) {
    console.log(name.padEnd(40) + "  (missing)".padStart(30));
    continue;
  }
  console.log(name.padEnd(40) + kb(r.raw) + kb(r.gz) + kb(r.br));
}
console.log("");
