// Build the published stylesheet: minify the hand-authored utility CSS into
// dist/widget.css. `src/styles/widget.css` stays the commented source of truth;
// the shipped/CDN file is minified (no sourcemap by design) to cut wire bytes.
// esbuild's CSS minifier strips comments/whitespace and shortens values without
// renaming classes, so the output is behaviourally identical to the source.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { transformSync } from "esbuild";

const SRC = "src/styles/widget.css";
const OUT = "dist/widget.css";

const source = readFileSync(SRC, "utf8");
const { code, warnings } = transformSync(source, { loader: "css", minify: true });
for (const w of warnings) console.warn("[build:styles]", w.text);

mkdirSync("dist", { recursive: true });
writeFileSync(OUT, code);

console.log(
  `build:styles: ${SRC} (${source.length} B) -> ${OUT} (${Buffer.byteLength(code)} B) minified`,
);
