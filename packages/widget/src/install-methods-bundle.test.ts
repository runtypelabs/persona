import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { JSDOM } from "jsdom";

/**
 * Consumer-install smoke test for the BUILT package: every way a consumer can
 * load `@runtypelabs/persona` from npm, exercised against `dist/` exactly as
 * published (no vitest aliases: `vitest.config.ts` points several subpaths at
 * `src/`, so every load here happens in a child Node process / tsc run / jsdom
 * window that only sees the real package).
 *
 *  1. every `exports` / `main` / `module` / `types` target exists on disk
 *  2. ESM `import` of `.` and every subpath (real Node resolution, from a
 *     consumer directory with `node_modules/@runtypelabs/persona` symlinked)
 *  3. CJS `require` of `.` and every subpath with a `require` condition, and
 *     its export names match the ESM build's
 *  4. TypeScript resolution of every subpath's types under
 *     `moduleResolution: bundler`, `node16` ESM and `node16` CJS consumers
 *  5. the script-tag IIFEs (`index.global.js` → `window.AgentWidget`,
 *     `launcher.global.js` → `window.AgentWidgetLauncher`, `install.global.js`)
 *     evaluate as classic scripts without throwing
 *  6. `@runtypelabs/persona/widget.css` resolves under both conditions
 *
 * The real-browser half (installer → deferred launcher → sibling chunks →
 * streamed reply) lives in `e2e/specs/23-dist-install-methods.spec.ts`.
 *
 * Skips when `dist/` hasn't been built (e.g. a test-only CI step).
 */

const PKG_DIR = resolve(__dirname, "..");
const dist = (f: string) => join(PKG_DIR, "dist", f);
const pkg = JSON.parse(readFileSync(join(PKG_DIR, "package.json"), "utf8")) as {
  name: string;
  main: string;
  module: string;
  types: string;
  exports: Record<string, string | Record<string, string>>;
};

const built =
  existsSync(dist("index.js")) &&
  existsSync(dist("index.cjs")) &&
  existsSync(dist("index.global.js"));

const subpathSpecifier = (key: string) =>
  key === "." ? pkg.name : `${pkg.name}/${key.slice(2)}`;

/** Code subpaths (object entries), i.e. everything but `./widget.css`. */
const codeEntries = Object.entries(pkg.exports).filter(
  (entry): entry is [string, Record<string, string>] => typeof entry[1] === "object"
);
const esmSpecifiers = codeEntries
  .filter(([, c]) => c.import)
  .map(([key]) => subpathSpecifier(key));
const cjsSpecifiers = codeEntries
  .filter(([, c]) => c.require)
  .map(([key]) => subpathSpecifier(key));
const typedSpecifiers = codeEntries
  .filter(([, c]) => c.types)
  .map(([key]) => subpathSpecifier(key));

type ProbeResult = Record<string, { ok: true; keys: string[] } | { ok: false; error: string }>;

const ESM_PROBE = `
const specs = JSON.parse(process.argv[2]);
const out = {};
for (const s of specs) {
  try {
    const m = await import(s);
    out[s] = { ok: true, keys: Object.keys(m).sort() };
  } catch (e) {
    out[s] = { ok: false, error: String((e && e.stack) || e).split("\\n").slice(0, 4).join("\\n") };
  }
}
process.stdout.write(JSON.stringify(out));
`;

const CJS_PROBE = `
const specs = JSON.parse(process.argv[2]);
const out = {};
for (const s of specs) {
  try {
    const m = require(s);
    out[s] = { ok: true, keys: Object.keys(m).sort() };
  } catch (e) {
    out[s] = { ok: false, error: String((e && e.stack) || e).split("\\n").slice(0, 4).join("\\n") };
  }
}
process.stdout.write(JSON.stringify(out));
`;

/** Interop keys that legitimately differ between the two formats. */
const INTEROP_KEYS = new Set(["default", "__esModule", "module.exports"]);
const publicKeys = (keys: string[]) => keys.filter((k) => !INTEROP_KEYS.has(k));

const failures = (result: ProbeResult) =>
  Object.entries(result)
    .filter(([, r]) => !r.ok)
    .map(([spec, r]) => `${spec}\n    ${(r as { error: string }).error.replace(/\n/g, "\n    ")}`);

describe.runIf(built)("published package install methods (dist/)", () => {
  let consumer: string;

  beforeAll(() => {
    // A throwaway consumer project that depends on the package the way an npm
    // install would lay it out (symlinked, like pnpm/npm link).
    consumer = mkdtempSync(join(tmpdir(), "persona-consumer-"));
    mkdirSync(join(consumer, "node_modules", "@runtypelabs"), { recursive: true });
    symlinkSync(PKG_DIR, join(consumer, "node_modules", "@runtypelabs", "persona"), "dir");
    writeFileSync(join(consumer, "esm-probe.mjs"), ESM_PROBE);
    writeFileSync(join(consumer, "cjs-probe.cjs"), CJS_PROBE);
  });

  afterAll(() => {
    if (consumer) rmSync(consumer, { recursive: true, force: true });
  });

  const runProbe = (file: string, specs: string[]): ProbeResult =>
    JSON.parse(
      execFileSync(process.execPath, [join(consumer, file), JSON.stringify(specs)], {
        cwd: consumer,
        encoding: "utf8",
        timeout: 60_000,
      })
    );

  it("every exports/main/module/types target exists in dist/", () => {
    const targets = new Set<string>([pkg.main, pkg.module, pkg.types]);
    for (const [, conditions] of Object.entries(pkg.exports)) {
      if (typeof conditions === "string") targets.add(conditions);
      else for (const target of Object.values(conditions)) targets.add(target);
    }
    const missing = [...targets].filter((t) => !existsSync(join(PKG_DIR, t)));
    expect(missing, `exports map points at missing files`).toEqual([]);
  });

  it("ships a .d.cts declaration next to every .d.ts export for CJS consumers", () => {
    const missing = codeEntries
      .map(([, c]) => c.types)
      .filter(Boolean)
      .map((t) => t.replace(/\.d\.ts$/, ".d.cts"))
      .filter((t) => !existsSync(join(PKG_DIR, t)));
    expect(missing).toEqual([]);
  });

  let esm: ProbeResult;

  it("ESM: `import` of `.` and every subpath loads in Node", () => {
    esm = runProbe("esm-probe.mjs", esmSpecifiers);
    expect(failures(esm), "ESM imports that failed").toEqual([]);
    for (const spec of esmSpecifiers) {
      const r = esm[spec];
      if (r.ok) expect(publicKeys(r.keys).length, `${spec} has no exports`).toBeGreaterThan(0);
    }
    const root = esm[pkg.name];
    if (root.ok) {
      expect(root.keys).toEqual(
        expect.arrayContaining(["initAgentWidget", "createAgentExperience", "markdownPostprocessor"])
      );
    }
  }, 90_000);

  it("CJS: `require` of `.` and every subpath loads in Node with the same exports as ESM", () => {
    const cjs = runProbe("cjs-probe.cjs", cjsSpecifiers);
    expect(failures(cjs), "CJS requires that failed").toEqual([]);
    esm ??= runProbe("esm-probe.mjs", esmSpecifiers);
    const drift: string[] = [];
    for (const spec of cjsSpecifiers) {
      const c = cjs[spec];
      const e = esm[spec];
      if (!c?.ok || !e?.ok) continue;
      const cKeys = new Set(publicKeys(c.keys));
      const eKeys = new Set(publicKeys(e.keys));
      const onlyEsm = [...eKeys].filter((k) => !cKeys.has(k));
      const onlyCjs = [...cKeys].filter((k) => !eKeys.has(k));
      if (onlyEsm.length || onlyCjs.length) {
        drift.push(`${spec}: only ESM [${onlyEsm.join(", ")}], only CJS [${onlyCjs.join(", ")}]`);
      }
    }
    expect(drift, "ESM/CJS export-name drift").toEqual([]);
  }, 90_000);

  const tsc = join(PKG_DIR, "node_modules", ".bin", "tsc");
  const typeImports = (ext: "ts" | "cts") =>
    typedSpecifiers
      .map((spec, i) =>
        ext === "cts"
          ? `import m${i} = require(${JSON.stringify(spec)});\nvoid m${i};`
          : `import * as m${i} from ${JSON.stringify(spec)};\nvoid m${i};`
      )
      .join("\n") +
    `\nimport type { AgentWidgetConfig } from ${JSON.stringify(pkg.name)};\n` +
    `export const cfg: AgentWidgetConfig = { apiUrl: "/x" };\n`;

  const runTsc = (name: string, compilerOptions: Record<string, unknown>, file: string, source: string) => {
    const dir = join(consumer, name);
    mkdirSync(dir, { recursive: true });
    // Point the project-local node_modules at the consumer's.
    if (!existsSync(join(dir, "node_modules"))) {
      symlinkSync(join(consumer, "node_modules"), join(dir, "node_modules"), "dir");
    }
    writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module" }));
    writeFileSync(join(dir, file), source);
    writeFileSync(
      join(dir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          noEmit: true,
          skipLibCheck: false,
          types: [],
          lib: ["ES2022", "DOM", "DOM.Iterable"],
          ...compilerOptions,
        },
        files: [file],
      })
    );
    try {
      execFileSync(tsc, ["-p", join(dir, "tsconfig.json")], { cwd: dir, encoding: "utf8", timeout: 120_000 });
      return "";
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string; message: string };
      return (err.stdout || err.stderr || err.message).trim();
    }
  };

  it.runIf(existsSync(tsc))("types: every subpath resolves under moduleResolution bundler", () => {
    expect(
      runTsc("ts-bundler", { module: "ESNext", moduleResolution: "bundler", target: "ES2022" }, "index.ts", typeImports("ts"))
    ).toBe("");
  }, 120_000);

  it.runIf(existsSync(tsc))("types: every subpath resolves for a node16 ESM consumer", () => {
    expect(
      runTsc("ts-node16-esm", { module: "node16", moduleResolution: "node16", target: "ES2022" }, "index.ts", typeImports("ts"))
    ).toBe("");
  }, 120_000);

  it.runIf(existsSync(tsc))("types: every subpath resolves for a node20 CJS consumer (.cts)", () => {
    // node20 models Node's require(esm), so a CJS consumer reaches the ESM
    // `.d.ts` the exports map advertises.
    expect(
      runTsc("ts-node20-cjs", { module: "node20", moduleResolution: "node16", target: "ES2022" }, "index.cts", typeImports("cts"))
    ).toBe("");
  }, 120_000);

  // KNOWN GAP (pre-dates the tsdown migration): each export's single top-level
  // `types` condition points at the ESM `.d.ts` ("type": "module"), so a
  // `module: node16` CJS consumer gets TS1471 ("only resolves to an ES
  // module") even though a `.d.cts` ships alongside. Fix by nesting types per
  // condition: `"import": { "types": "./dist/x.d.ts", "default": "./dist/x.js" },
  // "require": { "types": "./dist/x.d.cts", "default": "./dist/x.cjs" }`.
  // `it.fails` flips red once that lands: then turn this into a plain `it`.
  it.runIf(existsSync(tsc)).fails("types: every subpath resolves for a node16 CJS consumer (.cts)", () => {
    expect(
      runTsc("ts-node16-cjs", { module: "node16", moduleResolution: "node16", target: "ES2022" }, "index.cts", typeImports("cts"))
    ).toBe("");
  }, 120_000);

  it.runIf(existsSync(tsc))("types: every shipped .d.cts type-checks as a CJS declaration", () => {
    const dcts = codeEntries
      .map(([, c]) => c.types?.replace(/\.d\.ts$/, ".d.cts"))
      .filter((t): t is string => !!t && existsSync(join(PKG_DIR, t)));
    const source = dcts
      .map((t) => `/// <reference path=${JSON.stringify(join(PKG_DIR, t))} />`)
      .join("\n") + "\nexport {};\n";
    expect(
      runTsc("ts-dcts", { module: "node16", moduleResolution: "node16", target: "ES2022" }, "index.cts", source)
    ).toBe("");
  }, 120_000);

  it("widget.css resolves under both import and require", () => {
    const spec = JSON.stringify(`${pkg.name}/widget.css`);
    writeFileSync(join(consumer, "css-probe.cjs"), `process.stdout.write(require.resolve(${spec}));`);
    writeFileSync(join(consumer, "css-probe.mjs"), `process.stdout.write(import.meta.resolve(${spec}));`);
    const run = (file: string) =>
      execFileSync(process.execPath, [join(consumer, file)], { cwd: consumer, encoding: "utf8" });
    expect(run("css-probe.cjs").endsWith("/dist/widget.css")).toBe(true);
    expect(run("css-probe.mjs").endsWith("/dist/widget.css")).toBe(true);
    const css = readFileSync(dist("widget.css"), "utf8");
    expect(css).toContain(".persona-");
  });

  it("widget.css keeps Safari's backdrop-filter prefix and the no-blur fallback", () => {
    // Lightning CSS drops `-webkit-` prefixes its browser targets don't need,
    // so a targets change could silently strip Safari's frosted surfaces.
    const css = readFileSync(dist("widget.css"), "utf8");
    const source = readFileSync(join(PKG_DIR, "src/styles/widget.css"), "utf8");
    const count = (text: string) => text.match(/-webkit-backdrop-filter\s*:/g)?.length ?? 0;
    expect(count(source)).toBeGreaterThan(0);
    expect(count(css)).toBe(count(source));
    expect(css).toMatch(/@supports not \(\([^)]*backdrop-filter:blur\(1px\)\) or \([^)]*backdrop-filter:blur\(1px\)\)\)/);
  });

  /** Evaluate a dist file as a classic `<script>` in a fresh jsdom window. */
  const evalClassicScript = (file: string, setup?: (w: Window & Record<string, unknown>) => void) => {
    const dom = new JSDOM(`<!doctype html><html><head></head><body></body></html>`, {
      url: "https://example.test/",
      runScripts: "outside-only",
      pretendToBeVisual: true,
    });
    const win = dom.window as unknown as Window & Record<string, unknown>;
    setup?.(win);
    let error: unknown;
    try {
      (win as unknown as { eval: (src: string) => unknown }).eval(readFileSync(dist(file), "utf8"));
    } catch (e) {
      error = e;
    }
    return { dom, win, error };
  };

  it("script tag: dist/index.global.js defines window.AgentWidget", () => {
    const { dom, win, error } = evalClassicScript("index.global.js");
    try {
      expect(error, `index.global.js threw: ${String(error)}`).toBeUndefined();
      const g = win.AgentWidget as Record<string, unknown> | undefined;
      expect(g, "window.AgentWidget").toBeDefined();
      expect(typeof g?.initAgentWidget).toBe("function");
      expect(typeof g?.markdownPostprocessor).toBe("function");
    } finally {
      dom.window.close();
    }
  });

  it.runIf(existsSync(dist("launcher.global.js")))(
    "script tag: dist/launcher.global.js defines window.AgentWidgetLauncher.mount",
    () => {
      const { dom, win, error } = evalClassicScript("launcher.global.js");
      try {
        expect(error, `launcher.global.js threw: ${String(error)}`).toBeUndefined();
        const g = win.AgentWidgetLauncher as { mount?: unknown } | undefined;
        expect(typeof g?.mount).toBe("function");
      } finally {
        dom.window.close();
      }
    }
  );

  it.runIf(existsSync(dist("install.global.js")))(
    "script tag: dist/install.global.js evaluates as a classic script",
    () => {
      const { dom, win, error } = evalClassicScript("install.global.js", (w) => {
        // No auto-init config: the installer just registers itself.
        w.siteAgentConfig = { autoInit: false };
      });
      try {
        expect(error, `install.global.js threw: ${String(error)}`).toBeUndefined();
        expect(win.__siteAgentInstallerLoaded).toBe(true);
      } finally {
        dom.window.close();
      }
    }
  );
});
