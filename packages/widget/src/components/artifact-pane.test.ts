// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createArtifactPane } from "./artifact-pane";
import * as parsersLoader from "../markdown-parsers-loader";
import type { AgentWidgetConfig, PersonaArtifactRecord } from "../types";

/**
 * Regression tests for the parser-ready race in the artifact pane.
 *
 * In the IIFE/CDN build, `marked` + `DOMPurify` load lazily. An artifact
 * upserted right after `initAgentWidget()` used to render as escaped plain
 * text (literal `# Welcome`, `**bold**`) — and stayed that way until a tab
 * switch forced a re-render, because unlike chat messages (which self-heal via
 * the parser-ready re-render in `createAgentExperience`), the pane only
 * re-renders on `update()`. Worse, the default sanitizer's own degraded
 * fallback is `escapeHtml`, so the old blanket `sanitize(md(text))` escaped
 * twice and displayed literal entities (`&quot;`).
 *
 * `vitest.setup.ts` eager-provides parsers, so `getMarkdownParsersSync()` is
 * non-null by default -> that's the "loaded" path. The degraded path is
 * simulated by spying on the loader module (same approach as
 * ui.postprocess.test.ts).
 */

const MARKDOWN = '# Welcome\n\n**bold** "quoted"';

const artifact = (markdown: string): PersonaArtifactRecord => ({
  id: "a1",
  artifactType: "markdown",
  title: "Doc",
  status: "complete",
  markdown,
});

const createPane = () => {
  const config: AgentWidgetConfig = { markdown: {} };
  const pane = createArtifactPane(config, { onSelect: () => {} });
  const content = pane.element.querySelector(".persona-artifact-content") as HTMLElement;
  return { pane, content };
};

beforeAll(() => {
  // jsdom has no matchMedia; the pane's mobile-drawer layout check needs it.
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query }) as MediaQueryList;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("artifact pane parser-ready self-heal (parsers not loaded at first render)", () => {
  it("renders the escaped fallback exactly once, then re-renders as markdown when the chunk lands", async () => {
    let resolveLoad!: (mod: parsersLoader.MarkdownParsersModule) => void;
    const loadPromise = new Promise<parsersLoader.MarkdownParsersModule>((resolve) => {
      resolveLoad = resolve;
    });
    const syncSpy = vi
      .spyOn(parsersLoader, "getMarkdownParsersSync")
      .mockReturnValue(null);
    const loadSpy = vi
      .spyOn(parsersLoader, "loadMarkdownParsers")
      .mockReturnValue(loadPromise);

    const { pane, content } = createPane();
    pane.update({ artifacts: [artifact(MARKDOWN)], selectedId: "a1" });

    // Degraded first paint: escaped plain text, no markdown elements.
    expect(content.querySelector("h1")).toBeNull();
    expect(content.textContent).toContain("# Welcome");
    expect(content.textContent).toContain("**bold**");
    // Escaped exactly once: a double escape would leave a literal `&quot;`
    // in the visible text instead of the quote character.
    expect(content.textContent).toContain('"quoted"');
    expect(content.textContent).not.toContain("&quot;");

    // A second render while the chunk is still loading must not re-schedule.
    pane.update({ artifacts: [artifact(MARKDOWN)], selectedId: "a1" });
    expect(loadSpy).toHaveBeenCalledTimes(1);

    // Chunk lands: the real getMarkdownParsersSync now returns the parsers
    // eager-provided by vitest.setup.ts.
    syncSpy.mockRestore();
    resolveLoad(parsersLoader.getMarkdownParsersSync()!);
    await loadPromise;
    await Promise.resolve(); // let the scheduled .then(render) run

    // Self-healed: real markdown without any user interaction.
    expect(content.querySelector("h1")?.textContent).toBe("Welcome");
    expect(content.querySelector("strong")?.textContent).toBe("bold");
    expect(content.textContent).not.toContain("**bold**");
  });

  it("does not schedule a re-render when parsers are already loaded", () => {
    const loadSpy = vi.spyOn(parsersLoader, "loadMarkdownParsers");

    const { pane, content } = createPane();
    pane.update({ artifacts: [artifact(MARKDOWN)], selectedId: "a1" });

    expect(content.querySelector("h1")?.textContent).toBe("Welcome");
    expect(loadSpy).not.toHaveBeenCalled();
  });
});
