// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  renderArtifactPreviewBody,
  runArtifactBodyTransition,
  type ArtifactBodyLayout,
} from "./artifact-preview";
import * as parsersLoader from "../markdown-parsers-loader";
import type { AgentWidgetConfig, PersonaArtifactRecord } from "../types";
import type { ComponentRenderer } from "./registry";

const layout = (o: Partial<ArtifactBodyLayout> = {}): ArtifactBodyLayout => ({
  streamingView: "source",
  viewMode: "rendered",
  streamingHeight: 320,
  completeHeight: 320,
  followOutput: true,
  overflow: "scroll",
  fadeTop: true,
  fadeBottom: false,
  transition: "auto",
  completeDisplay: "inline",
  ...o,
});

const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

const ZWSP = "\u200b";
const HTML_RAW = "<h1>hi</h1>\n<script>window.x = 1;</script>\n";
const wireFor = (raw: string, lang: string): string =>
  "```" + lang + "\n" + raw.split("```").join("`" + ZWSP + "``") + "\n```";

const makeConfig = (filePreview?: {
  enabled?: boolean;
  iframeSandbox?: string;
  loading?:
    | boolean
    | {
        delayMs?: number;
        minVisibleMs?: number;
        timeoutMs?: number;
        injectReadySignal?: boolean;
        label?: string | false;
        labelDelayMs?: number;
        renderIndicator?: (ctx: {
          artifactId: string;
          config: AgentWidgetConfig;
        }) => HTMLElement | null;
      };
}): AgentWidgetConfig =>
  ({
    sanitize: false,
    features: { artifacts: { enabled: true, ...(filePreview ? { filePreview } : {}) } },
  }) as AgentWidgetConfig;

const fileRecord = (
  overrides: Partial<PersonaArtifactRecord> = {}
): PersonaArtifactRecord => ({
  id: "a1",
  artifactType: "markdown",
  title: "outputs/cat.html",
  status: "complete",
  markdown: wireFor(HTML_RAW, "html"),
  file: { path: "outputs/cat.html", mimeType: "text/html", language: "html" },
  ...overrides,
});

const markdownRecord = (
  overrides: Partial<PersonaArtifactRecord> = {}
): PersonaArtifactRecord => ({
  id: "m1",
  artifactType: "markdown",
  title: "Notes",
  status: "streaming",
  markdown: "Hello",
  ...overrides,
});

describe("artifact-preview markdown body", () => {
  it("renders a markdown bubble and applies streaming deltas via update()", () => {
    const handle = renderArtifactPreviewBody(markdownRecord(), {
      config: makeConfig(),
    });
    const bubble = handle.el.querySelector(".persona-markdown-bubble");
    expect(bubble).toBeTruthy();
    expect(bubble?.textContent).toContain("Hello");

    handle.update(markdownRecord({ markdown: "Hello world" }));
    const updated = handle.el.querySelector(".persona-markdown-bubble");
    expect(updated?.textContent).toContain("Hello world");
    // Still exactly one body child (updated in place, not appended).
    expect(handle.el.children.length).toBe(1);
  });

  it("shows raw source when the host resolves 'source' view mode", () => {
    const handle = renderArtifactPreviewBody(markdownRecord({ markdown: "## Raw" }), {
      config: makeConfig(),
      resolveViewMode: () => "source",
    });
    expect(handle.el.querySelector(".persona-markdown-bubble")).toBeNull();
    const pre = handle.el.querySelector("pre");
    expect(pre?.textContent).toBe("## Raw");
  });
});

/**
 * Regression tests for the parser-ready race on the IIFE/CDN build, where
 * `marked` + `DOMPurify` load lazily. An artifact upserted right after
 * `initAgentWidget()` used to render as escaped plain text (literal
 * `# Welcome`, `**bold**`) and stayed that way until the next update() forced
 * a re-render — chat messages self-heal via the parser-ready re-render in
 * `createAgentExperience`, but this body only re-renders on update(). Worse,
 * the default sanitizer's own degraded fallback is `escapeHtml`, so the old
 * blanket `sanitize(md(text))` escaped twice and displayed literal entities
 * (`&quot;`).
 *
 * `vitest.setup.ts` eager-provides parsers, so `getMarkdownParsersSync()` is
 * non-null by default -> that's the "loaded" path. The degraded path is
 * simulated by spying on the loader module (same approach as
 * ui.postprocess.test.ts).
 */
describe("artifact-preview parser-ready self-heal (parsers not loaded at first render)", () => {
  const RAW_MD = '# Welcome\n\n**bold** "quoted"';
  const mdConfig = { markdown: {} } as AgentWidgetConfig;
  const mdArtifact = () =>
    markdownRecord({ markdown: RAW_MD, status: "complete" });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the escaped fallback exactly once, then re-renders as markdown when the chunk lands", async () => {
    // The real `onMarkdownParsersReady` no-ops here (vitest.setup.ts eager-
    // provides parsers into the loader's moduleCache), so spy on the module
    // namespace and capture the callback instead. artifact-preview.ts calls it
    // through the module binding, so the spy intercepts — same mechanism as the
    // getMarkdownParsersSync spy below.
    let readyCb: (() => void) | null = null;
    const readySpy = vi
      .spyOn(parsersLoader, "onMarkdownParsersReady")
      .mockImplementation((cb: () => void) => {
        readyCb = cb;
        return () => {};
      });
    const syncSpy = vi
      .spyOn(parsersLoader, "getMarkdownParsersSync")
      .mockReturnValue(null);

    const handle = renderArtifactPreviewBody(mdArtifact(), { config: mdConfig });

    // Degraded first paint: escaped plain text, no markdown elements.
    expect(handle.el.querySelector("h1")).toBeNull();
    expect(handle.el.textContent).toContain("# Welcome");
    expect(handle.el.textContent).toContain("**bold**");
    // Escaped exactly once: a double escape would leave a literal `&quot;`
    // in the visible text instead of the quote character.
    expect(handle.el.textContent).toContain('"quoted"');
    expect(handle.el.textContent).not.toContain("&quot;");

    // A second render while the chunk is still loading must not re-subscribe.
    handle.update(mdArtifact());
    expect(readySpy).toHaveBeenCalledTimes(1);

    // Chunk lands: the real getMarkdownParsersSync now returns the parsers
    // eager-provided by vitest.setup.ts, and the captured ready callback fires.
    syncSpy.mockRestore();
    expect(readyCb).toBeTypeOf("function");
    readyCb!();

    // Self-healed: real markdown without any user interaction.
    expect(handle.el.querySelector("h1")?.textContent).toBe("Welcome");
    expect(handle.el.querySelector("strong")?.textContent).toBe("bold");
    expect(handle.el.textContent).not.toContain("**bold**");
  });

  it("does not schedule a re-render when parsers are already loaded", () => {
    const readySpy = vi.spyOn(parsersLoader, "onMarkdownParsersReady");

    const handle = renderArtifactPreviewBody(mdArtifact(), { config: mdConfig });

    expect(handle.el.querySelector("h1")?.textContent).toBe("Welcome");
    expect(readySpy).not.toHaveBeenCalled();
  });
});

describe("artifact-preview file body", () => {
  it("renders a sandboxed iframe (allow-scripts, no allow-same-origin) with srcdoc = raw source", () => {
    // loading:false → no injected reporter, so srcdoc is exactly the raw source.
    const handle = renderArtifactPreviewBody(fileRecord(), {
      config: makeConfig({ loading: false }),
    });
    const iframe = handle.el.querySelector(
      "iframe.persona-artifact-iframe"
    ) as HTMLIFrameElement;
    expect(iframe).toBeTruthy();
    // The iframe is wrapped in a positioned frame that hosts the loading overlay.
    expect(iframe.parentElement?.classList.contains("persona-artifact-frame")).toBe(
      true
    );
    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts");
    expect(iframe.getAttribute("sandbox")).not.toContain("allow-same-origin");
    expect(iframe.getAttribute("data-artifact-id")).toBe("a1");
    // srcdoc is the raw, unfenced source assigned as a property.
    expect(iframe.srcdoc).toBe(HTML_RAW);
  });

  it("honors a custom iframeSandbox override", () => {
    const handle = renderArtifactPreviewBody(fileRecord(), {
      config: makeConfig({ iframeSandbox: "allow-scripts allow-forms" }),
    });
    const iframe = handle.el.querySelector("iframe") as HTMLIFrameElement;
    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts allow-forms");
  });

  it("forces source view (no iframe) when filePreview.enabled is false", () => {
    const handle = renderArtifactPreviewBody(fileRecord(), {
      config: makeConfig({ enabled: false }),
    });
    expect(handle.el.querySelector("iframe")).toBeNull();
    const pre = handle.el.querySelector("pre");
    expect(pre?.textContent).toBe(HTML_RAW);
  });

  it("reuses the iframe node when the artifact and source are unchanged", () => {
    const handle = renderArtifactPreviewBody(fileRecord(), { config: makeConfig() });
    const first = handle.el.querySelector("iframe");
    handle.update(fileRecord());
    expect(handle.el.querySelector("iframe")).toBe(first);
  });
});

describe("artifact-preview status transitions", () => {
  it("shows source while streaming, then swaps to the iframe on complete", () => {
    const handle = renderArtifactPreviewBody(
      fileRecord({ status: "streaming", markdown: "```html\n<h1>hi" }),
      { config: makeConfig() }
    );
    expect(handle.el.querySelector("iframe")).toBeNull();
    expect(handle.el.querySelector("pre")?.textContent).toBe("<h1>hi");

    handle.update(fileRecord({ status: "complete" }));
    expect(handle.el.querySelector("pre")).toBeNull();
    const iframe = handle.el.querySelector("iframe") as HTMLIFrameElement;
    expect(iframe).toBeTruthy();
    // Default loading appends the ready reporter, so the raw source is the prefix.
    expect(iframe.srcdoc.startsWith(HTML_RAW)).toBe(true);
  });
});

describe("artifact-preview source highlighting", () => {
  it("renders line spans with token classes for an html file source view", () => {
    const handle = renderArtifactPreviewBody(fileRecord(), {
      config: makeConfig(),
      resolveViewMode: () => "source",
    });
    const pre = handle.el.querySelector("pre");
    expect(pre?.querySelector("code.persona-code")).toBeTruthy();
    // One line span per source line (HTML_RAW ends in "\n" → 2 numbered lines).
    const lines = handle.el.querySelectorAll(".persona-code-line");
    expect(lines.length).toBe(2);
    // Tokenized: at least one tag span for <h1>/<script>.
    expect(handle.el.querySelector(".persona-code-token-tag")).toBeTruthy();
    // Verbatim reconstruction invariant: pre text === original source.
    expect(pre?.textContent).toBe(HTML_RAW);
  });

  it("line-numbers streaming file source too", () => {
    const handle = renderArtifactPreviewBody(
      fileRecord({ status: "streaming", markdown: "```html\n<h1>hi" }),
      { config: makeConfig() }
    );
    expect(handle.el.querySelector(".persona-code-line")).toBeTruthy();
    expect(handle.el.querySelector("pre")?.textContent).toBe("<h1>hi");
  });
});

describe("artifact-preview inline bodyLayout", () => {
  const streamingFile = (markdown = "```html\n<h1>hi") =>
    fileRecord({ status: "streaming", markdown });

  it("reserves a fixed-height scroll window for streaming source (numeric height)", () => {
    const handle = renderArtifactPreviewBody(streamingFile(), {
      config: makeConfig(),
      bodyLayout: layout(),
    });
    const win = handle.el.querySelector(".persona-artifact-source-window");
    expect(win).toBeTruthy();
    expect(win!.classList.contains("persona-artifact-source-window--fixed")).toBe(
      true
    );
    expect(win!.querySelector("pre")).toBeTruthy();
  });

  it("grows (no fixed window) for streamingHeight 'auto'", () => {
    const handle = renderArtifactPreviewBody(streamingFile(), {
      config: makeConfig(),
      bodyLayout: layout({ streamingHeight: "auto" }),
    });
    const win = handle.el.querySelector(".persona-artifact-source-window");
    expect(win).toBeTruthy();
    expect(win!.classList.contains("persona-artifact-source-window--fixed")).toBe(
      false
    );
  });

  it("pane path (no bodyLayout) renders a bare pre with no scroll window", () => {
    const handle = renderArtifactPreviewBody(streamingFile(), {
      config: makeConfig(),
    });
    expect(handle.el.querySelector(".persona-artifact-source-window")).toBeNull();
    expect(handle.el.firstElementChild?.tagName.toLowerCase()).toBe("pre");
  });

  it("keeps the same <pre>/window across streaming deltas (in-place update)", () => {
    // Streaming source recovery drops the still-open last line (assumed fence),
    // so a trailing sentinel line keeps the newest visible line stable.
    const handle = renderArtifactPreviewBody(streamingFile("```html\n<h1>hi\nX"), {
      config: makeConfig(),
      bodyLayout: layout(),
    });
    const pre = handle.el.querySelector("pre");
    const win = handle.el.querySelector(".persona-artifact-source-window");
    handle.update(streamingFile("```html\n<h1>hi\n<p>more\nX"));
    expect(handle.el.querySelector("pre")).toBe(pre);
    expect(handle.el.querySelector(".persona-artifact-source-window")).toBe(win);
    expect(handle.el.querySelector("pre")?.textContent).toContain("more");
  });

  // Stub live scroll metrics jsdom doesn't compute, with a settable scrollTop.
  const stubScroll = (win: HTMLElement, top: number) => {
    let cur = top;
    Object.defineProperty(win, "scrollHeight", { configurable: true, value: 1000 });
    Object.defineProperty(win, "clientHeight", { configurable: true, value: 320 });
    Object.defineProperty(win, "scrollTop", {
      configurable: true,
      get: () => cur,
      set: (v: number) => {
        cur = v;
      },
    });
  };

  it("tail-follows when the viewport is at the bottom", async () => {
    const handle = renderArtifactPreviewBody(streamingFile(), {
      config: makeConfig(),
      bodyLayout: layout(),
    });
    // Drain the construction-time follow before stubbing real metrics.
    await nextFrame();
    const win = handle.el.querySelector(
      ".persona-artifact-source-window"
    ) as HTMLElement;
    stubScroll(win, 680); // dist = 1000 - 320 - 680 = 0 → at the bottom.
    handle.update(streamingFile("```html\n<h1>hi\n<p>more\nX"));
    await nextFrame();
    expect(win.scrollTop).toBe(1000);
  });

  it("does not fight a reader who scrolled up", async () => {
    const handle = renderArtifactPreviewBody(streamingFile(), {
      config: makeConfig(),
      bodyLayout: layout(),
    });
    await nextFrame();
    const win = handle.el.querySelector(
      ".persona-artifact-source-window"
    ) as HTMLElement;
    stubScroll(win, 100); // dist = 1000 - 320 - 100 = 580 → scrolled up.
    handle.update(streamingFile("```html\n<h1>hi\n<p>more\nX"));
    await nextFrame();
    expect(win.scrollTop).toBe(100);
  });

  // Mutable-metric variant: lets a test grow the window and move scrollTop
  // between updates (the plain stubScroll above pins scrollHeight/clientHeight).
  const stubScrollLive = (
    win: HTMLElement,
    init: { scrollHeight: number; clientHeight: number; scrollTop: number }
  ) => {
    const s = { ...init };
    Object.defineProperty(win, "scrollHeight", {
      configurable: true,
      get: () => s.scrollHeight,
    });
    Object.defineProperty(win, "clientHeight", {
      configurable: true,
      get: () => s.clientHeight,
    });
    Object.defineProperty(win, "scrollTop", {
      configurable: true,
      get: () => s.scrollTop,
      set: (v: number) => {
        s.scrollTop = v;
      },
    });
    return s;
  };

  it("stops tail-follow after an upward wheel gesture while overflowing", async () => {
    const handle = renderArtifactPreviewBody(streamingFile(), {
      config: makeConfig(),
      bodyLayout: layout(),
    });
    await nextFrame();
    const win = handle.el.querySelector(
      ".persona-artifact-source-window"
    ) as HTMLElement;
    stubScroll(win, 680); // dist = 0 → at the bottom (would normally pin).
    // Upward wheel over an overflowing window latches "escaped".
    win.dispatchEvent(new WheelEvent("wheel", { deltaY: -20 }));
    handle.update(streamingFile("```html\n<h1>hi\n<p>more\nX"));
    await nextFrame();
    // Latched: the pin is suppressed even though the reader was at the bottom.
    expect(win.scrollTop).toBe(680);
    // A further delta must not re-pin while still latched.
    handle.update(streamingFile("```html\n<h1>hi\n<p>more\n<p>again\nX"));
    await nextFrame();
    expect(win.scrollTop).toBe(680);
  });

  it("re-engages tail-follow when the reader returns within 40px of the bottom", async () => {
    const handle = renderArtifactPreviewBody(streamingFile(), {
      config: makeConfig(),
      bodyLayout: layout(),
    });
    await nextFrame();
    const win = handle.el.querySelector(
      ".persona-artifact-source-window"
    ) as HTMLElement;
    stubScroll(win, 680);
    win.dispatchEvent(new WheelEvent("wheel", { deltaY: -20 })); // escape
    handle.update(streamingFile("```html\n<h1>hi\n<p>more\nX"));
    await nextFrame();
    expect(win.scrollTop).toBe(680); // still latched, no pin.

    // Reader flicks back to the bottom → scroll event clears the latch.
    win.dispatchEvent(new Event("scroll"));
    handle.update(streamingFile("```html\n<h1>hi\n<p>more\n<p>again\nX"));
    await nextFrame();
    expect(win.scrollTop).toBe(1000); // follow resumed.
  });

  it("clears the escaped latch on completion so a reused window follows again", async () => {
    // viewMode "source" keeps the completed record in the source window (no
    // iframe swap), so the same window is reused and we can observe the reset.
    const handle = renderArtifactPreviewBody(streamingFile(), {
      config: makeConfig(),
      bodyLayout: layout({ viewMode: "source" }),
    });
    await nextFrame();
    const win = handle.el.querySelector(
      ".persona-artifact-source-window"
    ) as HTMLElement;
    stubScroll(win, 680);
    win.dispatchEvent(new WheelEvent("wheel", { deltaY: -20 })); // escape

    // Completion clears the latch.
    handle.update(fileRecord({ status: "complete" }));
    await nextFrame();
    expect(handle.el.querySelector(".persona-artifact-source-window")).toBe(win);

    // A later streaming delta at the bottom pins again — the latch was cleared.
    handle.update(streamingFile("```html\n<h1>hi\n<p>more\nX"));
    await nextFrame();
    expect(win.scrollTop).toBe(1000);
  });

  it("does not latch on an upward wheel when the window does not overflow", async () => {
    const handle = renderArtifactPreviewBody(streamingFile(), {
      config: makeConfig(),
      bodyLayout: layout(),
    });
    await nextFrame();
    const win = handle.el.querySelector(
      ".persona-artifact-source-window"
    ) as HTMLElement;
    // No overflow yet (scrollHeight === clientHeight): the gesture is ignored.
    const metrics = stubScrollLive(win, {
      scrollHeight: 320,
      clientHeight: 320,
      scrollTop: 0,
    });
    win.dispatchEvent(new WheelEvent("wheel", { deltaY: -20 }));

    // Content grows to overflow and the reader is at the bottom; because the
    // earlier wheel never latched, follow still pins.
    metrics.scrollHeight = 1000;
    metrics.scrollTop = 680; // dist = 1000 - 320 - 680 = 0.
    handle.update(streamingFile("```html\n<h1>hi\n<p>more\nX"));
    await nextFrame();
    expect(win.scrollTop).toBe(1000);
  });

  it("renders a status placeholder while streaming and the real body on complete", () => {
    const handle = renderArtifactPreviewBody(streamingFile(), {
      config: makeConfig(),
      bodyLayout: layout({ streamingView: "status" }),
    });
    const status = handle.el.querySelector(".persona-artifact-status-view");
    expect(status).toBeTruthy();
    expect(status!.textContent).toContain("Generating");
    expect(handle.el.querySelector(".persona-artifact-source-window")).toBeNull();

    handle.update(fileRecord({ status: "complete" }));
    expect(handle.el.querySelector(".persona-artifact-status-view")).toBeNull();
    expect(handle.el.querySelector("iframe")).toBeTruthy();
  });

  it("adds the --clip class (plus --fixed) for overflow 'clip'", () => {
    const handle = renderArtifactPreviewBody(streamingFile(), {
      config: makeConfig(),
      bodyLayout: layout({ overflow: "clip", followOutput: false, fadeBottom: true }),
    });
    const win = handle.el.querySelector(".persona-artifact-source-window")!;
    expect(win.classList.contains("persona-artifact-source-window--fixed")).toBe(true);
    expect(win.classList.contains("persona-artifact-source-window--clip")).toBe(true);
  });

  it("does not add the --clip class for overflow 'scroll'", () => {
    const handle = renderArtifactPreviewBody(streamingFile(), {
      config: makeConfig(),
      bodyLayout: layout(),
    });
    const win = handle.el.querySelector(".persona-artifact-source-window")!;
    expect(win.classList.contains("persona-artifact-source-window--clip")).toBe(false);
  });

  it("never tail-follows in clip mode even when the reader is at the bottom", async () => {
    const handle = renderArtifactPreviewBody(streamingFile(), {
      config: makeConfig(),
      bodyLayout: layout({ overflow: "clip", followOutput: false, fadeBottom: true }),
    });
    await nextFrame();
    const win = handle.el.querySelector(
      ".persona-artifact-source-window"
    ) as HTMLElement;
    stubScroll(win, 0); // top of the document; dist to bottom = 680.
    handle.update(streamingFile("```html\n<h1>hi\n<p>more\nX"));
    await nextFrame();
    // Clip windows never pin the tail: scrollTop stays at the top.
    expect(win.scrollTop).toBe(0);
  });

  it("shows the bottom fade class when clipped content overflows, never the top fade", () => {
    const handle = renderArtifactPreviewBody(streamingFile(), {
      config: makeConfig(),
      bodyLayout: layout({ overflow: "clip", followOutput: false, fadeBottom: true }),
    });
    const win = handle.el.querySelector(
      ".persona-artifact-source-window"
    ) as HTMLElement;
    stubScroll(win, 0); // overflowing (scrollHeight 1000 > clientHeight 320).
    handle.update(streamingFile("```html\n<h1>hi\n<p>more\nX"));
    expect(win.classList.contains("persona-artifact-fade-bottom")).toBe(true);
    expect(win.classList.contains("persona-artifact-fade-top")).toBe(false);
  });
});

describe("runArtifactBodyTransition", () => {
  it("falls back to an instant swap when startViewTransition is absent", () => {
    const swap = vi.fn();
    runArtifactBodyTransition(document.createElement("div"), "auto", "a/1", swap);
    expect(swap).toHaveBeenCalledTimes(1);
  });

  it("swaps instantly for transition 'none'", () => {
    const swap = vi.fn();
    runArtifactBodyTransition(document.createElement("div"), "none", "a1", swap);
    expect(swap).toHaveBeenCalledTimes(1);
  });
});

describe("artifact-preview loading overlay", () => {
  const DOCTYPE_SRC = "<!doctype html>\n<h1>hi</h1>\n";
  const doctypeFile = (o: Partial<PersonaArtifactRecord> = {}) =>
    fileRecord({ markdown: wireFor(DOCTYPE_SRC, "html"), ...o });
  const frameOf = (h: { el: HTMLElement }) =>
    h.el.querySelector(".persona-artifact-frame") as HTMLElement;
  const overlayOf = (h: { el: HTMLElement }) =>
    frameOf(h).querySelector(".persona-artifact-frame-loading");
  const tokenFromSrcdoc = (srcdoc: string): string => {
    const m = srcdoc.match(/var t=("(?:[^"\\]|\\.)*")/);
    return m ? (JSON.parse(m[1]) as string) : "";
  };

  it("appends the ready reporter by default, keeping the doctype first", () => {
    const handle = renderArtifactPreviewBody(doctypeFile(), { config: makeConfig() });
    const iframe = handle.el.querySelector("iframe") as HTMLIFrameElement;
    expect(iframe.srcdoc.startsWith("<!doctype html>")).toBe(true);
    expect(iframe.srcdoc).toContain("artifact-preview-ready");
    // APPENDED, never prepended: the reporter follows the document body.
    expect(iframe.srcdoc.indexOf("artifact-preview-ready")).toBeGreaterThan(
      iframe.srcdoc.indexOf("<h1>")
    );
  });

  it("omits the reporter entirely for loading:false (raw srcdoc, no overlay)", () => {
    const handle = renderArtifactPreviewBody(doctypeFile(), {
      config: makeConfig({ loading: false }),
    });
    const iframe = handle.el.querySelector("iframe") as HTMLIFrameElement;
    expect(iframe.srcdoc).toBe(DOCTYPE_SRC);
    expect(iframe.srcdoc).not.toContain("artifact-preview-ready");
  });

  it("omits the reporter for injectReadySignal:false but still overlays", () => {
    vi.useFakeTimers();
    try {
      const handle = renderArtifactPreviewBody(doctypeFile(), {
        config: makeConfig({ loading: { injectReadySignal: false, delayMs: 100 } }),
      });
      const iframe = handle.el.querySelector("iframe") as HTMLIFrameElement;
      expect(iframe.srcdoc).toBe(DOCTYPE_SRC);
      expect(overlayOf(handle)).toBeNull();
      vi.advanceTimersByTime(100);
      expect(overlayOf(handle)).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the icon spinner (no text) after delayMs, not before", () => {
    vi.useFakeTimers();
    try {
      const handle = renderArtifactPreviewBody(doctypeFile(), {
        config: makeConfig({ loading: { delayMs: 200 } }),
      });
      expect(overlayOf(handle)).toBeNull();
      vi.advanceTimersByTime(199);
      expect(overlayOf(handle)).toBeNull();
      vi.advanceTimersByTime(1);
      const overlay = overlayOf(handle);
      expect(overlay).toBeTruthy();
      // Icon-first: the default indicator is a pure-CSS spinner...
      expect(overlay!.querySelector(".persona-spinner")).toBeTruthy();
      // ...and the escalation label, though present in the DOM, is hidden (no
      // --visible modifier → opacity: 0) until it fades in after labelDelayMs.
      const label = overlay!.querySelector(".persona-artifact-frame-loading-text");
      expect(
        label!.classList.contains("persona-artifact-frame-loading-text--visible")
      ).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("fades in the default escalation label after labelDelayMs (from overlay-visible)", () => {
    vi.useFakeTimers();
    try {
      // delayMs=100 (overlay show), labelDelayMs=200 → label reveals ~300 from
      // start, i.e. 200 AFTER the overlay becomes visible, not from iframe create.
      const handle = renderArtifactPreviewBody(doctypeFile(), {
        config: makeConfig({
          loading: { delayMs: 100, labelDelayMs: 200, timeoutMs: 100000 },
        }),
      });
      vi.advanceTimersByTime(100);
      const overlay = overlayOf(handle)!;
      const label = overlay.querySelector(".persona-artifact-frame-loading-text")!;
      expect(label.textContent).toBe("Starting preview...");
      expect(
        label.classList.contains("persona-artifact-frame-loading-text--visible")
      ).toBe(false);
      // 199ms after the overlay showed (299 from start): still hidden.
      vi.advanceTimersByTime(199);
      expect(
        label.classList.contains("persona-artifact-frame-loading-text--visible")
      ).toBe(false);
      // 200ms after the overlay showed (300 from start): revealed.
      vi.advanceTimersByTime(1);
      expect(
        label.classList.contains("persona-artifact-frame-loading-text--visible")
      ).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses a custom label string in place of the default", () => {
    vi.useFakeTimers();
    try {
      const handle = renderArtifactPreviewBody(doctypeFile(), {
        config: makeConfig({
          loading: { delayMs: 10, labelDelayMs: 20, label: "Compiling…", timeoutMs: 100000 },
        }),
      });
      vi.advanceTimersByTime(10 + 20);
      const label = overlayOf(handle)!.querySelector(
        ".persona-artifact-frame-loading-text"
      )!;
      expect(label.textContent).toBe("Compiling…");
      expect(
        label.classList.contains("persona-artifact-frame-loading-text--visible")
      ).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("never renders any text for label:false (icon-only forever)", () => {
    vi.useFakeTimers();
    try {
      const handle = renderArtifactPreviewBody(doctypeFile(), {
        config: makeConfig({
          loading: { delayMs: 10, labelDelayMs: 20, label: false, timeoutMs: 100000 },
        }),
      });
      vi.advanceTimersByTime(10);
      const overlay = overlayOf(handle)!;
      expect(overlay.querySelector(".persona-spinner")).toBeTruthy();
      expect(
        overlay.querySelector(".persona-artifact-frame-loading-text")
      ).toBeNull();
      // Even long past labelDelayMs, no text node ever appears.
      vi.advanceTimersByTime(1000);
      expect(
        overlay.querySelector(".persona-artifact-frame-loading-text")
      ).toBeNull();
      expect(overlay.textContent!.trim()).toBe("");
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses a renderIndicator override and suppresses the default spinner/label", () => {
    vi.useFakeTimers();
    try {
      const handle = renderArtifactPreviewBody(doctypeFile(), {
        config: makeConfig({
          loading: {
            delayMs: 10,
            labelDelayMs: 20,
            renderIndicator: ({ artifactId }) => {
              const el = document.createElement("div");
              el.className = "my-brand-loader";
              el.textContent = artifactId;
              return el;
            },
            timeoutMs: 100000,
          },
        }),
      });
      vi.advanceTimersByTime(10);
      const overlay = overlayOf(handle)!;
      const custom = overlay.querySelector(".my-brand-loader");
      expect(custom).toBeTruthy();
      expect(custom!.textContent).toBe("a1"); // artifactId threaded through
      // Default spinner + label are fully suppressed.
      expect(overlay.querySelector(".persona-spinner")).toBeNull();
      expect(
        overlay.querySelector(".persona-artifact-frame-loading-text")
      ).toBeNull();
      // No escalation label ever appears past labelDelayMs (host owns content).
      vi.advanceTimersByTime(1000);
      expect(
        overlay.querySelector(".persona-artifact-frame-loading-text")
      ).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back to the default spinner when renderIndicator returns null", () => {
    vi.useFakeTimers();
    try {
      const handle = renderArtifactPreviewBody(doctypeFile(), {
        config: makeConfig({
          loading: { delayMs: 10, renderIndicator: () => null },
        }),
      });
      vi.advanceTimersByTime(10);
      expect(overlayOf(handle)!.querySelector(".persona-spinner")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back to the default spinner when renderIndicator throws", () => {
    vi.useFakeTimers();
    try {
      const handle = renderArtifactPreviewBody(doctypeFile(), {
        config: makeConfig({
          loading: {
            delayMs: 10,
            renderIndicator: () => {
              throw new Error("boom");
            },
          },
        }),
      });
      vi.advanceTimersByTime(10);
      expect(overlayOf(handle)!.querySelector(".persona-spinner")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the label timer on teardown (no post-teardown DOM mutation)", () => {
    vi.useFakeTimers();
    try {
      let mode: "rendered" | "source" = "rendered";
      const handle = renderArtifactPreviewBody(doctypeFile(), {
        config: makeConfig({
          loading: { delayMs: 10, labelDelayMs: 200, timeoutMs: 100000 },
        }),
        resolveViewMode: () => mode,
      });
      vi.advanceTimersByTime(10);
      const overlay = overlayOf(handle)!;
      const label = overlay.querySelector(".persona-artifact-frame-loading-text")!;
      // Tear the iframe down (switch to source) BEFORE the label timer fires.
      mode = "source";
      handle.update(doctypeFile());
      // The pending label timer must have been cleared: advancing past it must
      // not add the --visible class to the now-detached label.
      vi.advanceTimersByTime(1000);
      expect(
        label.classList.contains("persona-artifact-frame-loading-text--visible")
      ).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("dismisses on a matched postMessage (token + source window)", () => {
    vi.useFakeTimers();
    try {
      const handle = renderArtifactPreviewBody(doctypeFile(), {
        config: makeConfig({ loading: { delayMs: 10, minVisibleMs: 0 } }),
      });
      const iframe = handle.el.querySelector("iframe") as HTMLIFrameElement;
      const fakeWin = {} as Window;
      Object.defineProperty(iframe, "contentWindow", {
        configurable: true,
        value: fakeWin,
      });
      vi.advanceTimersByTime(10);
      expect(overlayOf(handle)).toBeTruthy();

      const token = tokenFromSrcdoc(iframe.srcdoc);
      window.dispatchEvent(
        new MessageEvent("message", {
          source: fakeWin,
          data: { persona: "artifact-preview-ready", token },
        })
      );
      // minVisible 0 → fade immediately; overlay removed after the fade window.
      vi.advanceTimersByTime(300);
      expect(overlayOf(handle)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores a postMessage with the wrong token", () => {
    vi.useFakeTimers();
    try {
      const handle = renderArtifactPreviewBody(doctypeFile(), {
        config: makeConfig({ loading: { delayMs: 10, timeoutMs: 100000 } }),
      });
      const iframe = handle.el.querySelector("iframe") as HTMLIFrameElement;
      const fakeWin = {} as Window;
      Object.defineProperty(iframe, "contentWindow", {
        configurable: true,
        value: fakeWin,
      });
      vi.advanceTimersByTime(10);
      window.dispatchEvent(
        new MessageEvent("message", {
          source: fakeWin,
          data: { persona: "artifact-preview-ready", token: "not-the-token" },
        })
      );
      vi.advanceTimersByTime(1000);
      expect(overlayOf(handle)).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores a matched token from the wrong source window", () => {
    vi.useFakeTimers();
    try {
      const handle = renderArtifactPreviewBody(doctypeFile(), {
        config: makeConfig({ loading: { delayMs: 10, timeoutMs: 100000 } }),
      });
      const iframe = handle.el.querySelector("iframe") as HTMLIFrameElement;
      Object.defineProperty(iframe, "contentWindow", {
        configurable: true,
        value: {} as Window,
      });
      vi.advanceTimersByTime(10);
      const token = tokenFromSrcdoc(iframe.srcdoc);
      window.dispatchEvent(
        new MessageEvent("message", {
          source: {} as Window, // different object identity
          data: { persona: "artifact-preview-ready", token },
        })
      );
      vi.advanceTimersByTime(1000);
      expect(overlayOf(handle)).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reveals on timeout when no ready signal arrives", () => {
    vi.useFakeTimers();
    try {
      const handle = renderArtifactPreviewBody(doctypeFile(), {
        config: makeConfig({
          loading: { delayMs: 10, minVisibleMs: 0, timeoutMs: 500 },
        }),
      });
      vi.advanceTimersByTime(10);
      expect(overlayOf(handle)).toBeTruthy();
      vi.advanceTimersByTime(490); // hard timeout
      vi.advanceTimersByTime(300); // fade window
      expect(overlayOf(handle)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the overlay at least minVisibleMs after a fast ready", () => {
    vi.useFakeTimers();
    try {
      const handle = renderArtifactPreviewBody(doctypeFile(), {
        config: makeConfig({ loading: { delayMs: 10, minVisibleMs: 300 } }),
      });
      const iframe = handle.el.querySelector("iframe") as HTMLIFrameElement;
      const fakeWin = {} as Window;
      Object.defineProperty(iframe, "contentWindow", {
        configurable: true,
        value: fakeWin,
      });
      vi.advanceTimersByTime(10);
      const token = tokenFromSrcdoc(iframe.srcdoc);
      window.dispatchEvent(
        new MessageEvent("message", {
          source: fakeWin,
          data: { persona: "artifact-preview-ready", token },
        })
      );
      // Ready arrived at shownAt, so the fade waits the full minVisibleMs.
      vi.advanceTimersByTime(299);
      expect(overlayOf(handle)).toBeTruthy();
      vi.advanceTimersByTime(1 + 300);
      expect(overlayOf(handle)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not stack message listeners across idle re-renders (reuse path)", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    try {
      const handle = renderArtifactPreviewBody(doctypeFile(), {
        config: makeConfig(),
      });
      const msgCalls = () =>
        addSpy.mock.calls.filter((c) => c[0] === "message").length;
      expect(msgCalls()).toBe(1);
      handle.update(doctypeFile()); // identical id + source → reuse, no rebuild
      expect(msgCalls()).toBe(1);
    } finally {
      addSpy.mockRestore();
    }
  });

  it("tears down the listener when the iframe is replaced (view switches to source)", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    try {
      let mode: "rendered" | "source" = "rendered";
      const handle = renderArtifactPreviewBody(doctypeFile(), {
        config: makeConfig(),
        resolveViewMode: () => mode,
      });
      expect(handle.el.querySelector("iframe")).toBeTruthy();
      mode = "source";
      handle.update(doctypeFile());
      // iframe gone → its loading machine was torn down (listener removed).
      expect(handle.el.querySelector("iframe")).toBeNull();
      expect(
        removeSpy.mock.calls.some((c) => c[0] === "message")
      ).toBe(true);
    } finally {
      removeSpy.mockRestore();
    }
  });
});

describe("artifact-preview component body", () => {
  const componentRecord = (
    overrides: Partial<PersonaArtifactRecord> = {}
  ): PersonaArtifactRecord => ({
    id: "c1",
    artifactType: "component",
    title: "Chart",
    status: "complete",
    component: "MyChart",
    props: { series: [1, 2, 3] },
    ...overrides,
  });

  it("renders through the provided registry", () => {
    const seen: Array<Record<string, unknown>> = [];
    const renderer: ComponentRenderer = (props) => {
      seen.push(props);
      const el = document.createElement("div");
      el.className = "my-chart";
      el.textContent = "chart";
      return el;
    };
    const handle = renderArtifactPreviewBody(componentRecord(), {
      config: makeConfig(),
      registry: { get: (name) => (name === "MyChart" ? renderer : undefined) },
    });
    expect(handle.el.querySelector(".my-chart")?.textContent).toBe("chart");
    expect(seen).toEqual([{ series: [1, 2, 3] }]);
  });

  it("falls back to the inspector card for unknown components", () => {
    const handle = renderArtifactPreviewBody(componentRecord({ component: "Nope" }), {
      config: makeConfig(),
      registry: { get: () => undefined },
    });
    expect(handle.el.textContent).toContain("Component: Nope");
    const pre = handle.el.querySelector("pre");
    expect(pre?.textContent).toContain('"series"');
  });

  it("falls back to the inspector card when the renderer throws", () => {
    const handle = renderArtifactPreviewBody(componentRecord(), {
      config: makeConfig(),
      registry: {
        get: () => () => {
          throw new Error("boom");
        },
      },
    });
    expect(handle.el.textContent).toContain("Component: MyChart");
  });
});
