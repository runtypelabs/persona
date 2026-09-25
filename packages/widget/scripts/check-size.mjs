import { readFileSync } from "node:fs";
import { brotliCompressSync, constants } from "node:zlib";

// Binary KB, matching the established 148 / 14.4 / 17.8 KB baselines.
const budgets = [
  { file: "index.global.js", bytes: 158 * 1024, exclusive: false },
  { file: "launcher.global.js", bytes: 20 * 1024, exclusive: true },
  { file: "widget.css", bytes: 20 * 1024, exclusive: false },
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
