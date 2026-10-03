// Second minification pass over the CDN IIFE bundles (`dist/*.global.js`).
//
// esbuild produces the bundle; terser then re-minifies esbuild's already-
// minified output. Byte count barely moves, but terser's mangler assigns
// identifiers by character frequency, which Brotli compresses far better:
// ~8 KiB off `index.global.js` (154.95 → 146.6 KiB). Mangling alone is
// ~6.5 KiB of that; the remainder is from `compress`. Only safe compress
// options are used, so behavior is unchanged.
//
// `keep_fargs: false` drops unused trailing parameters; nothing in the bundle
// inspects `Function.length`.
//
// esbuild's legal-comment block lists every bundled lucide icon file above the
// one shared ISC notice; the per-file paths are collapsed to the package name
// (the license text itself is kept verbatim). The block sits at EOF, after all
// mapped code (esbuild's default for bundles), so collapsing it shifts no
// mapped line and the source map stays valid.
//
// Runs on esbuild's minified output rather than replacing it via tsup's
// `minify: "terser"`: terser on esbuild's unminified output measured ~1 KiB
// larger. The existing source map is chained so stack traces still resolve to
// `src/`.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { brotliCompressSync, constants } from "node:zlib";
import { minify } from "terser";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: terser-global.mjs <dist/file.global.js> [...]");
  process.exit(1);
}

const brotliKiB = (code) =>
  (
    brotliCompressSync(Buffer.from(code), {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).byteLength / 1024
  ).toFixed(2);

for (const file of files) {
  const mapFile = `${file}.map`;
  const input = readFileSync(file, "utf8");
  const result = await minify(input, {
    ecma: 2020,
    compress: { passes: 2, keep_fargs: false },
    mangle: true,
    format: { comments: /@license|@preserve|^!/ },
    sourceMap: existsSync(mapFile)
      ? { content: readFileSync(mapFile, "utf8"), url: basename(mapFile) }
      : false,
  });
  const code = result.code.replace(
    /(?:^[\w@.-]+\/[\w./-]+\.m?js:\n)+/gm,
    (run) => {
      // esbuild already strips `node_modules/`; drop it defensively (incl.
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
