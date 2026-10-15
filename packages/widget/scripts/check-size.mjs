import { readFileSync } from "node:fs";
import { brotliCompressSync, constants } from "node:zlib";

// Binary KiB, measured with Brotli quality 11. V5 composer, rendering and
// conversation lifecycle additions bring the merged core to ~149.1 KiB;
// retain upstream lazy chunks and keep a narrow 150 KiB regression ceiling.
const budgets = [
  { file: "index.global.js", bytes: 150 * 1024, exclusive: false },
  { file: "launcher.global.js", bytes: 20 * 1024, exclusive: true },
  // Menu row tokens and descriptions: ~22.04 KiB (previous budget 21.9).
  { file: "widget.css", bytes: 22.1 * 1024, exclusive: false },
];

for (const { file, bytes, exclusive } of budgets) {
  const content = readFileSync(new URL(`../dist/${file}`, import.meta.url));
  const size = brotliCompressSync(content, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  }).byteLength;
  const exceeded = exclusive ? size >= bytes : size > bytes;
  console.log(`${file}: ${(size / 1024).toFixed(2)} KiB brotli (${exclusive ? "<" : "<="} ${bytes / 1024} KiB)${exceeded ? " — OVER BUDGET" : ""}`);
  if (exceeded) process.exitCode = 1;
}

// Approval UI is lazy-loaded separately from the core. Report its cost without
// folding it into the critical-path budgets above.
const approvalSize = brotliCompressSync(
  readFileSync(new URL("../dist/approval-ui.js", import.meta.url)),
  { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } },
).byteLength;
console.log(`approval-ui.js: ${(approvalSize / 1024).toFixed(2)} KiB brotli (lazy chunk)`);
