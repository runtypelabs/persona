// Build the published stylesheet: minify the hand-authored utility CSS into
// dist/widget.css. `src/styles/widget.css` stays the commented source of truth;
// the shipped/CDN file is minified (no sourcemap by design) to cut wire bytes.
// Lightning CSS strips comments/whitespace and shortens values without renaming
// classes, so the output is behaviourally identical to the source.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { transform } from "lightningcss";

const SRC = "src/styles/widget.css";
const OUT = "dist/widget.css";

// Same browser floor as the ES2022 JS bundles. Without targets Lightning CSS
// drops vendor prefixes it considers redundant (e.g. Safari's
// `-webkit-backdrop-filter`, unprefixed only since Safari 18).
const version = (major, minor = 0) => (major << 16) | (minor << 8);
const targets = {
  chrome: version(94),
  edge: version(94),
  firefox: version(93),
  safari: version(15, 4),
  ios_saf: version(15, 4),
};

const source = readFileSync(SRC);
const { code, warnings } = transform({ filename: SRC, code: source, minify: true, targets });
for (const w of warnings) console.warn("[build:styles]", w.message);

mkdirSync("dist", { recursive: true });
writeFileSync(OUT, code);

console.log(
  `build:styles: ${SRC} (${source.length} B) -> ${OUT} (${code.length} B) minified`,
);
