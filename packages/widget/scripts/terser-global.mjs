// Second minification pass over the CDN IIFEs and selected standalone ESM entries.
//
// tsdown (Rolldown + the Oxc minifier) produces the bundle; terser then
// re-minifies the already-minified output. ESM mode preserves its exports;
// IIFE mode preserves the browser globals. Byte count barely moves, but
// terser's mangler assigns identifiers by character frequency, which Brotli
// compresses better: ~8 KiB off `index.global.js` when the bundler was esbuild,
// ~1 KiB after Oxc's mangler. Only safe compress options are used, so behavior
// is unchanged.
//
// `keep_fargs: false` drops unused trailing parameters; nothing in the bundle
// inspects `Function.length`.
//
// esbuild emitted a legal-comment block at EOF listing every bundled lucide
// icon file above the one shared ISC notice; the per-file paths are collapsed
// to the package name (the license text itself is kept verbatim). Rolldown keeps
// the notice inline, so this is a no-op today, kept in case the block returns.
// Collapsing EOF-only lines shifts no mapped line, so the source map stays valid.
//
// Runs on the bundler's minified output: terser on esbuild's unminified output
// measured ~1 KiB larger. The existing source map is chained so stack traces still resolve to
// `src/`.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { minify } from "terser";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: terser-global.mjs <dist/file.global.js> [...]");
  process.exit(1);
}

const brotliBytes = (code) => brotliCompressSync(Buffer.from(code), {
  params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
}).byteLength;
const brotliKiB = (code) => (brotliBytes(code) / 1024).toFixed(2);

for (const file of files) {
  const mapFile = `${file}.map`;
  const input = readFileSync(file, "utf8");
  const core = file.endsWith("index.global.js");
  const notices = new Set();
  let result = await minify(input, {
    ecma: 2020,
    module: !file.endsWith(".global.js"),
    compress: {
      passes: 2, keep_fargs: false,
      hoist_funs: file.endsWith("theme-editor.js") || file.endsWith("activity-ui.js"),
      // Keeping repeated expressions and separate statements in this ESM entry
      // compresses better under its gzip budget than folding them further.
      ...(file.endsWith("activity-ui.js") ? { evaluate: false, sequences: false } : {}),
      // Separate conditional branches compress slightly better in the stream parser.
      ...(file.endsWith("client-stream.js") ? { conditionals: false } : {}),
      // Delay expression folding until the second core pass: the resulting
      // repeated structure compresses better under the unchanged Brotli budget.
      ...(core ? { evaluate: false } : {}),
    },
    mangle: true,
    format: { comments: core ? (_node, comment) => {
      if (/@license|@preserve|^!/.test(comment.value)) {
        notices.add(comment.type === "comment2" ? `/*${comment.value}*/` : `//${comment.value}`);
      }
      // The second pass emits every distinct notice in its mapped preamble.
      return false;
    } : /@license|@preserve|^!/ },
    sourceMap: existsSync(mapFile)
      ? { content: readFileSync(mapFile, "utf8"), url: basename(mapFile) }
      : false,
  });
  // The core benefits from one additional safe compression pass after Oxc's
  // and Terser's initial rewrites. Hoisting vars improves Brotli's repeated
  // structure without property mangling or unsafe transformations.
  if (core) {
    result = await minify(result.code, {
      ecma: 2020,
      compress: { passes: 3, keep_fargs: false, hoist_vars: true },
      mangle: true,
      // Lucide repeats the same notice for each icon. Keep one verbatim copy
      // of each distinct notice; let Terser account for it in the source map.
      format: { comments: /@license|@preserve|^!/, preamble: [...notices].join("\n") },
      sourceMap: result.map ? { content: result.map, url: basename(mapFile) } : false,
    });
  }
  if (file.endsWith("activity-ui.js")) {
    // Keep the activity chunk within its gzip budget without changing exports
    // or enabling unsafe transforms. Only retain a smaller result.
    const optimized = await minify(result.code, {
      ecma: 2020, module: true,
      compress: { passes: 3, keep_fargs: false, hoist_vars: true, evaluate: false },
      mangle: true,
      format: { comments: /@license|@preserve|^!/ },
      sourceMap: result.map ? { content: result.map, url: basename(mapFile) } : false,
    });
    if (gzipSync(optimized.code).length < gzipSync(result.code).length) result = optimized;
  }
  const code = result.code.replace(
    /(?:^[\w@.-]+\/[\w./-]+\.m?js:\n)+/gm,
    (run) => {
      // The bundler already strips `node_modules/`; drop it defensively (incl.
      // nested installs) so the name is always the package's.
      const pkg = (line) => {
        const path = line.replace(/^(?:.*\/)?node_modules\//, "");
        return path.split("/").slice(0, path.startsWith("@") ? 2 : 1).join("/");
      };
      return [...new Set(run.trim().split("\n").map((line) => `${pkg(line)}:`))].join("\n") + "\n";
    },
  );
  writeFileSync(file, code);
  if (result.map) writeFileSync(mapFile, result.map);
  console.log(`terser ${file}: ${brotliKiB(input)} → ${brotliKiB(code)} KiB brotli`);
}
