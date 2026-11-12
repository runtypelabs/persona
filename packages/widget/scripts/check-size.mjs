import { readFileSync } from "node:fs";
import { brotliCompressSync, constants } from "node:zlib";

const brotli = (file) => brotliCompressSync(readFileSync(new URL(`../dist/${file}`, import.meta.url)), {
  params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
}).byteLength;

// Regression ceilings, in binary KiB at Brotli quality 11.
const budgets = [
  { file: "index.global.js", bytes: 137.1 * 1024, exclusive: false },
  { file: "launcher.global.js", bytes: 20 * 1024, exclusive: true },
  { file: "widget.css", bytes: 20.45 * 1024, exclusive: false },
];

for (const { file, bytes, exclusive } of budgets) {
  const size = brotli(file);
  const exceeded = exclusive ? size >= bytes : size > bytes;
  console.log(`${file}: ${(size / 1024).toFixed(2)} KiB brotli (${exclusive ? "<" : "<="} ${bytes / 1024} KiB)${exceeded ? " — OVER BUDGET" : ""}`);
  if (exceeded) process.exitCode = 1;
}

// Everything a deferred install downloads before the launcher paints. The
// launcher carries its own share of widget.css, so the stylesheet is no longer
// part of this; before that it was, and the same sum was 37.7 KiB.
const LAUNCHER_PAINT = ["install.global.js", "launcher.global.js"];
const LAUNCHER_PAINT_BUDGET = 20.5 * 1024;
const launcherPaint = LAUNCHER_PAINT.reduce((sum, file) => sum + brotli(file), 0);
const launcherPaintExceeded = launcherPaint > LAUNCHER_PAINT_BUDGET;
console.log(`launcher paint (${LAUNCHER_PAINT.join(" + ")}): ${(launcherPaint / 1024).toFixed(2)} KiB brotli (<= ${LAUNCHER_PAINT_BUDGET / 1024} KiB)${launcherPaintExceeded ? " — OVER BUDGET" : ""}`);
if (launcherPaintExceeded) process.exitCode = 1;

// Approval UI is lazy-loaded separately from the core. Report its cost without
// folding it into the critical-path budgets above.
const approvalSize = brotli("approval-ui.js");
console.log(`approval-ui.js: ${(approvalSize / 1024).toFixed(2)} KiB brotli (lazy chunk)`);
