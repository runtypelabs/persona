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
 * The pane now shares the centralized `onMarkdownParsersReady` registry (same
 * hook chat messages use). These tests spy on the loader module to (a) simulate
 * the degraded "parsers not loaded" first paint via `getMarkdownParsersSync`,
 * and (b) capture the subscription callback the pane registers, then invoke it
 * to prove the pane self-heals when the chunk lands. `vitest.setup.ts`
 * eager-provides parsers, so the un-spied `getMarkdownParsersSync()` returns the
 * real bundle — that's the "loaded" path.
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
  it("renders the escaped fallback once, then self-heals to markdown when the registry fires", async () => {
    const syncSpy = vi
      .spyOn(parsersLoader, "getMarkdownParsersSync")
      .mockReturnValue(null);
    // Capture the callback the pane registers with the shared registry.
    let readyCb: (() => void) | undefined;
    const readySpy = vi
      .spyOn(parsersLoader, "onMarkdownParsersReady")
      .mockImplementation((cb) => {
        readyCb = cb;
        return () => {};
      });

    const { pane, content } = createPane();
    // The pane must subscribe exactly once, at creation.
    expect(readySpy).toHaveBeenCalledTimes(1);

    pane.update({ artifacts: [artifact(MARKDOWN)], selectedId: "a1" });

    // Degraded first paint: escaped plain text, no markdown elements.
    expect(content.querySelector("h1")).toBeNull();
    expect(content.textContent).toContain("# Welcome");
    expect(content.textContent).toContain("**bold**");
    // Escaped exactly once: a double escape would leave a literal `&quot;`
    // in the visible text instead of the quote character.
    expect(content.textContent).toContain('"quoted"');
    expect(content.textContent).not.toContain("&quot;");

    // Chunk lands: parsers become available and the registry fires the pane's
    // subscription — no `update()`/user interaction.
    syncSpy.mockRestore();
    readyCb?.();
    await Promise.resolve();

    expect(content.querySelector("h1")?.textContent).toBe("Welcome");
    expect(content.querySelector("strong")?.textContent).toBe("bold");
    expect(content.textContent).not.toContain("**bold**");
  });

  it("destroy() unsubscribes so a late chunk resolution can't re-render the torn-down pane", () => {
    vi.spyOn(parsersLoader, "getMarkdownParsersSync").mockReturnValue(null);
    let readyCb: (() => void) | undefined;
    const unsubscribe = vi.fn();
    vi.spyOn(parsersLoader, "onMarkdownParsersReady").mockImplementation((cb) => {
      readyCb = cb;
      return unsubscribe;
    });

    const { pane, content } = createPane();
    pane.update({ artifacts: [artifact(MARKDOWN)], selectedId: "a1" });

    pane.destroy();
    expect(unsubscribe).toHaveBeenCalledTimes(1);

    // Even if a stale event still fires the captured callback, the escaped
    // fallback stands — nothing re-renders into the detached pane as markdown.
    readyCb?.();
    expect(content.querySelector("h1")).toBeNull();
    expect(content.textContent).toContain("# Welcome");
  });

  it("renders markdown directly when parsers are already loaded", () => {
    // No getMarkdownParsersSync spy: the eager-provided bundle is live.
    const { pane, content } = createPane();
    pane.update({ artifacts: [artifact(MARKDOWN)], selectedId: "a1" });

    expect(content.querySelector("h1")?.textContent).toBe("Welcome");
    expect(content.querySelector("strong")?.textContent).toBe("bold");
    // Single-escaped, sanitized real markdown — no literal entities.
    expect(content.textContent).not.toContain("&quot;");
  });
});
