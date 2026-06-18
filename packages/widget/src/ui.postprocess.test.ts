// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { buildPostprocessor } from "./ui";
import { escapeHtml } from "./postprocessors";
import * as parsersLoader from "./markdown-parsers-loader";
import type { AgentWidgetConfig, AgentWidgetMessage } from "./types";

/**
 * Regression tests for the degraded (parsers-not-loaded) render path.
 *
 * In the IIFE/CDN build, `marked` + `DOMPurify` load lazily. Until they resolve
 * (or permanently, if the chunk 404s), both the markdown processor and the
 * sanitizer fall back to `escapeHtml`. The old blanket `sanitize(html)` composed
 * the two fallbacks and escaped twice ("I'll" -> "I&amp;#39;"). The bug lives in
 * the COMPOSITION inside `buildPostprocessor`, so these tests drive the transform
 * end-to-end rather than testing the primitives in isolation.
 *
 * `vitest.setup.ts` eager-provides parsers, so `getMarkdownParsersSync()` is
 * non-null by default -> that's the "loaded" path. The degraded path is simulated
 * by spying on the loader and returning null. Each consuming module
 * (`ui.ts`, `sanitize.ts`, `postprocessors.ts`) calls the imported binding
 * directly per invocation, so the spy propagates.
 */

const SAMPLE = "a & b < c, I'll go";

const callTransform = (
  cfg: AgentWidgetConfig | undefined,
  text: string
): string => {
  const transform = buildPostprocessor(cfg, undefined, undefined);
  const message: AgentWidgetMessage = {
    id: "1",
    role: "assistant",
    content: text,
    createdAt: "2026-06-17T00:00:00.000Z",
  };
  return transform({ text, message, streaming: false });
};

const simulateParsersNotLoaded = () => {
  vi.spyOn(parsersLoader, "getMarkdownParsersSync").mockReturnValue(null);
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildPostprocessor degraded path (parsers not loaded)", () => {
  it("escapes plain text exactly once (no markdown config, default sanitize)", () => {
    simulateParsersNotLoaded();
    const out = callTransform(undefined, SAMPLE);

    expect(out).toContain("I&#39;ll");
    expect(out).toContain("a &amp; b");
    expect(out).not.toContain("&amp;#39;");
    expect(out).not.toContain("&amp;amp;");
  });

  it("escapes exactly once when a markdown config is set", () => {
    simulateParsersNotLoaded();
    const out = callTransform({ markdown: {} }, SAMPLE);

    // Markdown processor falls back to escapeHtml while parsers are not loaded,
    // and the sanitizer is skipped (parsersReady === false) so it stays single.
    expect(out).toBe(escapeHtml(SAMPLE));
    expect(out).not.toContain("&amp;#39;");
    expect(out).not.toContain("&amp;amp;");
  });

  it("escapes custom postprocessMessage HTML exactly once (default sanitize)", () => {
    simulateParsersNotLoaded();
    const cfg: AgentWidgetConfig = {
      postprocessMessage: () => "<b>I'll</b>",
    };
    const out = callTransform(cfg, SAMPLE);

    // The sanitizer's degraded fallback escapes the raw custom HTML — but only
    // once, because custom HTML is NOT pre-escaped.
    expect(out).toBe("&lt;b&gt;I&#39;ll&lt;/b&gt;");
    expect(out).not.toContain("&amp;#39;");
  });

  it("regression: degraded plain text is single-escaped, never double-applied", () => {
    simulateParsersNotLoaded();
    const out = callTransform(undefined, SAMPLE);

    expect(out).toBe(escapeHtml(SAMPLE));
    expect(out).not.toBe(escapeHtml(escapeHtml(SAMPLE)));
  });
});

describe("buildPostprocessor loaded path (parsers available)", () => {
  it("renders markdown to real HTML, normalizes apostrophes, strips scripts", () => {
    // No spy: vitest.setup.ts eager-provides parsers, so this is the loaded path.
    const text = "**bold** I'll go\n\n<script>alert(1)</script>";
    const out = callTransform({ markdown: {} }, text);

    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain("<p>");
    expect(out).toContain("I'll");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("&amp;#39;");
  });
});
