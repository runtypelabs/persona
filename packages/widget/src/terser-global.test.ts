import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { runInNewContext } from "node:vm";
import { minify } from "terser";
import { expect, it } from "vitest";

// Use the same source-map implementation as Terser, without adding a dependency.
const { SourceMapConsumer } = createRequire(import.meta.resolve("terser"))("@jridgewell/source-map") as {
  SourceMapConsumer: new (map: string) => {
    originalPositionFor(position: { line: number; column: number }): { source: string | null; line: number | null };
  };
};

it("preserves distinct notices, public behavior and original locations when compacting the core", async () => {
  const directory = mkdtempSync(resolve(tmpdir(), "persona-minify-"));
  const file = resolve(directory, "index.global.js");
  const source = [
    "/** @license Shared notice */",
    "function sum(a, b) { return a + b; }",
    "/** @license Shared notice */",
    "// @preserve Separate notice",
    "function explode() { throw new Error('fixture boom'); }",
    "/*! Another notice */",
    "globalThis.AgentWidget = { sum, explode };",
  ].join("\n");
  try {
    const input = await minify({ "fixture.js": source }, {
      compress: false, mangle: false, format: { comments: "all" },
      sourceMap: { filename: "index.global.js", url: "index.global.js.map", includeSources: true },
    });
    writeFileSync(file, input.code!);
    writeFileSync(`${file}.map`, input.map as string);
    execFileSync(process.execPath, [resolve(__dirname, "../scripts/terser-global.mjs"), file]);
    const output = readFileSync(file, "utf8");
    for (const notice of ["Shared notice", "Separate notice", "Another notice"]) {
      expect(output.split(notice)).toHaveLength(2);
    }
    const sandbox: { AgentWidget?: { sum: (a: number, b: number) => number; explode: () => void } } = {};
    runInNewContext(output, sandbox);
    expect(sandbox.AgentWidget?.sum(2, 3)).toBe(5);
    expect(() => sandbox.AgentWidget?.explode()).toThrow("fixture boom");
    const position = output.slice(0, output.indexOf('"fixture boom"')).split("\n");
    const consumer = new SourceMapConsumer(readFileSync(`${file}.map`, "utf8"));
    expect(consumer.originalPositionFor({ line: position.length, column: position.at(-1)!.length }))
      .toMatchObject({ source: "fixture.js", line: 5 });
    expect(output).toContain("//# sourceMappingURL=index.global.js.map");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
