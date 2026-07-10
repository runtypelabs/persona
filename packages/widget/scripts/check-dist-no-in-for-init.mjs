// Regression gate: fail the build if any dist JS bundle (.js/.cjs/.mjs) contains an `in`
// expression inside a `for(init;;)` head — including inside ARROW function
// bodies nested in that head, which is where the minifier actually puts them.
//
// Why this matters (do NOT delete this gate to "fix" a failure here):
// Oxc/Rolldown (Vite 8) has two bugs with this exact trigger:
//   1. Oxc's parser leaks the spec's "no-in" restriction into arrow bodies,
//      rejecting valid JS like `for(x=()=>{"message" in G};;)` with
//      "Expected a semicolon" (acorn and V8 both accept it).
//   2. With the `in` parenthesized (also valid), the parse succeeds but
//      Rolldown SILENTLY emits the entire containing module as an EMPTY
//      (0-byte) chunk — the consumer's build exits 0 and they get
//      "does not provide an export named ..." at runtime. This broke 13
//      routes on the Runtype dashboard's Vite 8 upgrade (runtypelabs/core
//      PR #5309) and hits any customer bundling this package with Vite 8.
//
// esbuild's minifier mints the shape on its own: it merges a preceding
// assignment like `const probe = (e) => "message" in e` into a following
// loop's `for(init;;)` head. So fixing today's source occurrences is not
// enough — any future source change can re-introduce it, and only this
// build-output scan catches that before it ships. The source-level fix is to
// write `Reflect.has(obj, key)` instead of `key in obj` (same [[HasProperty]]
// semantics; note the flipped operand order) in any code that could be
// hoisted into a loop head.
//
// Regular (non-arrow) function bodies reset the restriction and Oxc handles
// them correctly, so the walker stops at FunctionExpression /
// FunctionDeclaration boundaries — mirroring the detection logic of the
// consumer-side `personaOxcNoInWorkaround()` plugin this gate lets core delete.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import * as acorn from "acorn";

const DIST = "dist";

function collectJsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectJsFiles(full));
    else if (entry.endsWith(".js") || entry.endsWith(".cjs") || entry.endsWith(".mjs"))
      out.push(full);
  }
  return out;
}

function findInExprsInForInit(code, file) {
  // .cjs bundles are scripts (top-level `require`/`module`), not ESM.
  const sourceType = file.endsWith(".cjs") ? "script" : "module";
  const ast = acorn.parse(code, { ecmaVersion: "latest", sourceType });
  const hits = [];
  const walk = (node, inForInit) => {
    if (node == null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child, inForInit);
      return;
    }
    if (typeof node.type !== "string") return;
    if (node.type === "BinaryExpression" && node.operator === "in" && inForInit) {
      hits.push(node.start);
    }
    if (node.type === "ForStatement") {
      // Only the init clause carries the no-in restriction. A nested for's
      // test/update/body reset it even inside an outer for-init's arrow body
      // (verified empirically against Vite 8.1.4 / Rolldown 1.1.5: `in` in a
      // nested loop's test clause builds correctly, parenthesized or not).
      walk(node.init, true);
      walk(node.test, false);
      walk(node.update, false);
      walk(node.body, false);
      return;
    }
    if (
      inForInit &&
      (node.type === "FunctionExpression" || node.type === "FunctionDeclaration")
    ) {
      // Regular function bodies reset the no-in restriction and Oxc parses
      // them correctly — only arrow bodies carry the bug, so keep recursing
      // through arrows but reset at real function boundaries.
      for (const key of Object.keys(node)) {
        if (key === "type" || key === "start" || key === "end") continue;
        walk(node[key], false);
      }
      return;
    }
    for (const key of Object.keys(node)) {
      if (key === "type" || key === "start" || key === "end") continue;
      walk(node[key], inForInit);
    }
  };
  walk(ast, false);
  return hits;
}

let failed = false;
let scanned = 0;
for (const file of collectJsFiles(DIST)) {
  const code = readFileSync(file, "utf8");
  scanned++;
  let hits;
  try {
    hits = findInExprsInForInit(code, file);
  } catch (err) {
    console.error(`check-dist-no-in-for-init: acorn failed to parse ${file}: ${err.message}`);
    failed = true;
    continue;
  }
  for (const start of hits) {
    const { line, column } = acorn.getLineInfo(code, start);
    console.error(
      `check-dist-no-in-for-init: ${file}:${line}:${column} — \`in\` expression inside a ` +
        `for(init;;) head. Vite 8 (Rolldown) silently emits the whole module as an empty ` +
        `chunk for this shape (and Oxc rejects the unparenthesized form). Rewrite the ` +
        `source-level \`key in obj\` as \`Reflect.has(obj, key)\`. See the header of ` +
        `scripts/check-dist-no-in-for-init.mjs — do not delete this gate.`,
    );
    failed = true;
  }
}

if (scanned === 0) {
  console.error("check-dist-no-in-for-init: no .js files found under dist/ — run the build first");
  process.exit(1);
}
if (failed) process.exit(1);
console.log(
  `check-dist-no-in-for-init: ${scanned} dist .js files clean (no \`in\` inside for(init;;) heads)`,
);
