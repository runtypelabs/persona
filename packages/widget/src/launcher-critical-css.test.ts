// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error -- build script, no declarations
import { extractLauncherCss, LAUNCHER_CSS_PLACEHOLDER } from "../scripts/launcher-critical-css.mjs";
import { CRITICAL_STYLE_ATTR, installCriticalStyles, removeCriticalStyles } from "./launcher-critical-css";

const extract = extractLauncherCss as (css: string, vocabulary: string) => string;

describe("extractLauncherCss", () => {
  const VOCABULARY = `class="persona-a persona-c" data-persona-root el.dataset.fooBar = 1; id="persona-id-yes"`;

  it("keeps rules the launcher can match and drops those it cannot", () => {
    const css = extract(`
      .persona-a{color:red}
      .persona-nope{color:blue}
      [data-persona-root] .persona-a{top:1px}
      [data-persona-root] .persona-nope{top:2px}
      #persona-id-yes{top:3px}
      #persona-id-no{top:4px}
    `, VOCABULARY);
    expect(css).toBe(".persona-a{color:red}[data-persona-root] .persona-a{top:1px}#persona-id-yes{top:3px}");
  });

  it("keeps a whole rule when any selector in its list can match", () => {
    expect(extract(".persona-nope,.persona-a:hover{color:red}", VOCABULARY))
      .toBe(".persona-nope,.persona-a:hover{color:red}");
  });

  it("matches data attributes set through dataset", () => {
    const css = extract(`[data-foo-bar="1"]>button{top:1px}[data-nope-attr]>button{top:2px}`, VOCABULARY);
    expect(css).toBe(`[data-foo-bar="1"]>button{top:1px}`);
  });

  it("never rules a selector out for what it negates, or for element and state selectors", () => {
    const css = extract(`
      .persona-a:not(.persona-nope){top:1px}
      button[disabled]{opacity:.5}
      [data-persona-root] svg:focus-visible{outline:none}
      :root{--x:1}
    `, VOCABULARY);
    expect(css).toBe(
      ".persona-a:not(.persona-nope){top:1px}button[disabled]{opacity:.5}" +
        "[data-persona-root] svg:focus-visible{outline:none}:root{--x:1}");
  });

  it("requires one possible branch of :is(), :where() and :has()", () => {
    const css = extract(`
      .persona-c:is(.persona-nope,.persona-a){top:1px}
      .persona-c:is(.persona-nope){top:2px}
      .persona-c:where(.persona-a){top:3px}
      .persona-c:has(.persona-nope){top:4px}
      .persona-c:has(>.persona-a){top:5px}
    `, VOCABULARY);
    expect(css).toBe(
      ".persona-c:is(.persona-nope,.persona-a){top:1px}.persona-c:where(.persona-a){top:3px}" +
        ".persona-c:has(>.persona-a){top:5px}");
  });

  it("filters inside conditional rules and drops the ones left empty", () => {
    const css = extract(`
      @media (max-width:600px){.persona-a{top:1px}.persona-nope{top:2px}}
      @media (min-width:900px){.persona-nope{top:3px}}
      @supports (display:grid){.persona-nope{top:4px}}
      @media (prefers-reduced-motion:reduce){[data-persona-root] *{animation:none!important}}
    `, VOCABULARY);
    expect(css).toBe(
      "@media (max-width:600px){.persona-a{top:1px}}" +
        "@media (prefers-reduced-motion:reduce){[data-persona-root] *{animation:none!important}}");
  });

  it("keeps only the keyframes a kept rule refers to", () => {
    const css = extract(`
      @keyframes persona-spin{to{transform:rotate(360deg)}}
      @keyframes persona-unused{to{opacity:0}}
      .persona-a{animation:persona-spin 1s linear infinite}
      .persona-nope{animation:persona-unused 1s}
    `, VOCABULARY);
    expect(css).toContain("@keyframes persona-spin");
    expect(css).not.toContain("persona-unused");
  });

  it("keeps global at-rules", () => {
    const css = extract(`
      @font-face{font-family:x;src:url(x.woff2)}
      @property --persona-x{syntax:"<length>";inherits:false;initial-value:0px}
    `, VOCABULARY);
    expect(css).toContain("@font-face");
    expect(css).toContain("@property --persona-x");
  });
});

describe("the built launcher's critical styles", () => {
  const dist = (file: string) => resolve(__dirname, "..", "dist", file);
  const built = existsSync(dist("launcher.global.js")) && existsSync(dist("widget.css"));

  it.runIf(built)("replaces the placeholder with rules taken from widget.css", () => {
    const launcher = readFileSync(dist("launcher.global.js"), "utf8");
    expect(launcher).not.toContain(LAUNCHER_CSS_PLACEHOLDER);
    // Markup the launcher renders, and the installer's loading ring over it.
    for (const marker of [
      ".persona-launcher-surface", ".persona-launcher-teaser", "data-persona-launcher-variant=circle",
      "persona-install-spin", "[data-persona-root]{all:initial",
    ]) {
      expect(launcher, marker).toContain(marker);
    }
  });

  it.runIf(built)("embeds a small share of the stylesheet, none of it the panel's", () => {
    const launcher = readFileSync(dist("launcher.global.js"), "utf8");
    const stylesheet = readFileSync(dist("widget.css"), "utf8");
    const vocabulary = `${launcher.replace(/\[data-persona-root\]\{all:initial[^"'`]*/, "")}\ndata-persona-loading`;
    const critical = extract(readFileSync(resolve(__dirname, "styles", "widget.css"), "utf8"), vocabulary);
    expect(critical.length).toBeGreaterThan(2_000);
    expect(critical.length).toBeLessThan(stylesheet.length / 8);
    for (const panelOnly of [".persona-widget-composer", ".persona-message-bubble", ".persona-widget-header"]) {
      expect(critical, panelOnly).not.toContain(panelOnly);
    }
  });
});

describe("installCriticalStyles", () => {
  const fullStylesheet = (loaded: boolean) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.setAttribute("data-persona", "true");
    Object.defineProperty(link, "sheet", { value: loaded ? {} : null });
    document.head.appendChild(link);
    return link;
  };
  const criticalStyle = () => document.head.querySelector(`style[${CRITICAL_STYLE_ATTR}]`);

  beforeEach(() => {
    document.head.innerHTML = "";
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Stands in for the rules the build embeds in place of the placeholder. */
  const CSS = ".persona-fixed{position:fixed}";

  it("reports unstyled from unbundled source, so callers wait for widget.css", () => {
    expect(installCriticalStyles()).toBe(false);
    expect(criticalStyle()).toBeNull();
  });

  it("needs nothing when the full stylesheet is already applied", () => {
    fullStylesheet(true);
    expect(installCriticalStyles(document, CSS)).toBe(true);
    expect(criticalStyle()).toBeNull();
  });

  it("injects the rules once, even while the full stylesheet is still loading", () => {
    fullStylesheet(false);
    expect(installCriticalStyles(document, CSS)).toBe(true);
    expect(installCriticalStyles(document, CSS)).toBe(true);
    expect(document.head.querySelectorAll(`style[${CRITICAL_STYLE_ATTR}]`)).toHaveLength(1);
    expect(criticalStyle()?.textContent).toBe(CSS);
  });

  it("reports unstyled, leaving nothing behind, when the page blocks inline styles", () => {
    // A blocked <style> is attached but never parsed.
    vi.spyOn(HTMLStyleElement.prototype, "sheet", "get").mockReturnValue(null);
    expect(installCriticalStyles(document, CSS)).toBe(false);
    expect(criticalStyle()).toBeNull();
  });

  it("removes the rules only once the full stylesheet has taken over", () => {
    installCriticalStyles(document, CSS);
    removeCriticalStyles();
    expect(criticalStyle()).not.toBeNull(); // no stylesheet: the launcher keeps its styling

    const link = fullStylesheet(false);
    removeCriticalStyles();
    expect(criticalStyle()).not.toBeNull(); // still loading

    link.remove();
    fullStylesheet(true);
    removeCriticalStyles();
    expect(criticalStyle()).toBeNull();
  });
});
