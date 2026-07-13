// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import {
  PersonaArtifactInline,
  updateInlineArtifactBlocks
} from "./artifact-inline";
import { componentRegistry } from "./registry";
import type {
  AgentWidgetConfig,
  AgentWidgetMessage,
  PersonaArtifactRecord
} from "../types";
import type { ComponentContext } from "./registry";

const ZWSP = "\u200b";
const HTML_RAW = "<h1>hi</h1>\n";
const wireFor = (raw: string, lang: string): string =>
  "```" + lang + "\n" + raw.split("```").join("`" + ZWSP + "``") + "\n```";

const makeConfig = (
  artifacts: Record<string, unknown> = {}
): AgentWidgetConfig =>
  ({
    sanitize: false,
    features: { artifacts: { enabled: true, ...artifacts } }
  }) as AgentWidgetConfig;

const makeContext = (config: AgentWidgetConfig): ComponentContext => {
  const message: AgentWidgetMessage = {
    id: "artifact-ref-a1",
    role: "assistant",
    content: "",
    createdAt: new Date().toISOString()
  };
  return { message, config, updateProps: () => {} };
};

const streamingProps = (): Record<string, unknown> => ({
  artifactId: "a1",
  title: "Notes",
  artifactType: "markdown",
  status: "streaming"
});

const completeProps = (): Record<string, unknown> => ({
  artifactId: "a1",
  title: "Notes",
  artifactType: "markdown",
  status: "complete",
  markdown: "# Done"
});

describe("PersonaArtifactInline default render", () => {
  it("renders the shared preview body inside a tagged inline block", () => {
    const el = PersonaArtifactInline(streamingProps(), makeContext(makeConfig()));
    expect(el.classList.contains("persona-artifact-inline")).toBe(true);
    expect(el.getAttribute("data-artifact-inline")).toBe("a1");
    expect(el.querySelector(".persona-artifact-preview-body")).toBeTruthy();
  });

  it("applies registry records via updateInlineArtifactBlocks (streaming deltas)", () => {
    const container = document.createElement("div");
    const el = PersonaArtifactInline(streamingProps(), makeContext(makeConfig()));
    container.appendChild(el);

    const record: PersonaArtifactRecord = {
      id: "a1",
      artifactType: "markdown",
      title: "Notes",
      status: "streaming",
      markdown: "# Hello"
    };
    updateInlineArtifactBlocks(container, [record]);
    expect(el.textContent).toContain("Hello");

    updateInlineArtifactBlocks(container, [
      { ...record, markdown: "# Hello world" }
    ]);
    expect(el.textContent).toContain("Hello world");
  });

  it("ignores records for other artifact ids and empty registry states", () => {
    const container = document.createElement("div");
    const el = PersonaArtifactInline(streamingProps(), makeContext(makeConfig()));
    container.appendChild(el);
    const before = el.innerHTML;

    updateInlineArtifactBlocks(container, []);
    updateInlineArtifactBlocks(container, [
      {
        id: "other",
        artifactType: "markdown",
        status: "streaming",
        markdown: "# Nope"
      }
    ]);
    expect(el.innerHTML).toBe(before);
  });
});

describe("PersonaArtifactInline hydration from props", () => {
  it("re-renders a completed markdown artifact from props alone (no registry record)", () => {
    const el = PersonaArtifactInline(
      {
        artifactId: "a1",
        title: "Notes",
        artifactType: "markdown",
        status: "complete",
        markdown: "# Restored"
      },
      makeContext(makeConfig())
    );
    expect(el.textContent).toContain("Restored");
  });

  it("re-invokes the registered renderer with embedded component props", () => {
    const seen: Array<Record<string, unknown>> = [];
    const name = "TestInlineHydrationChart";
    componentRegistry.register(name, (props) => {
      seen.push(props);
      const node = document.createElement("div");
      node.className = "test-inline-chart";
      node.textContent = `series:${JSON.stringify(props.series)}`;
      return node;
    });
    try {
      const el = PersonaArtifactInline(
        {
          artifactId: "a1",
          title: "Chart",
          artifactType: "component",
          status: "complete",
          component: name,
          componentProps: { series: [1, 2, 3] }
        },
        makeContext(makeConfig())
      );
      expect(el.querySelector(".test-inline-chart")).toBeTruthy();
      expect(seen).toHaveLength(1);
      expect(seen[0]).toEqual({ series: [1, 2, 3] });
    } finally {
      componentRegistry.unregister(name);
    }
  });

  it("re-renders a completed file artifact from props as a sandboxed iframe", () => {
    const el = PersonaArtifactInline(
      {
        artifactId: "a1",
        title: "outputs/cat.html",
        artifactType: "markdown",
        status: "complete",
        markdown: wireFor(HTML_RAW, "html"),
        file: { path: "outputs/cat.html", mimeType: "text/html", language: "html" }
      },
      makeContext(makeConfig())
    );
    const iframe = el.querySelector(
      "iframe.persona-artifact-iframe"
    ) as HTMLIFrameElement;
    expect(iframe).toBeTruthy();
    // The iframe is nested in the positioned preview frame (overlay host); the
    // geometry classes detect it through the wrapper via a descendant query.
    expect(iframe.parentElement?.classList.contains("persona-artifact-frame")).toBe(
      true
    );
    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts");
    // Default loading appends the ready reporter, so the raw source is the prefix.
    expect(iframe.srcdoc.startsWith(HTML_RAW)).toBe(true);
  });
});

describe("PersonaArtifactInline renderInline override", () => {
  it("uses the custom element when renderInline returns one", () => {
    const renderInline = vi.fn().mockImplementation(() => {
      const custom = document.createElement("div");
      custom.className = "my-inline";
      return custom;
    });
    const el = PersonaArtifactInline(
      streamingProps(),
      makeContext(makeConfig({ renderInline }))
    );
    expect(el.classList.contains("my-inline")).toBe(true);
    expect(renderInline).toHaveBeenCalledWith(
      expect.objectContaining({
        artifact: {
          artifactId: "a1",
          title: "Notes",
          artifactType: "markdown",
          status: "streaming"
        }
      })
    );
  });

  it("falls back to the default block when renderInline returns null", () => {
    const renderInline = vi.fn().mockReturnValue(null);
    const el = PersonaArtifactInline(
      streamingProps(),
      makeContext(makeConfig({ renderInline }))
    );
    expect(renderInline).toHaveBeenCalled();
    expect(el.classList.contains("persona-artifact-inline")).toBe(true);
  });

  it("exposes a working defaultRenderer to the override", () => {
    let defaultEl: HTMLElement | null = null;
    const renderInline = vi.fn().mockImplementation(
      (ctx: { defaultRenderer: () => HTMLElement }) => {
        defaultEl = ctx.defaultRenderer();
        return null;
      }
    );
    PersonaArtifactInline(streamingProps(), makeContext(makeConfig({ renderInline })));
    expect(defaultEl).not.toBeNull();
    expect(
      (defaultEl as unknown as HTMLElement).classList.contains(
        "persona-artifact-inline"
      )
    ).toBe(true);
  });

  it("wins over inlineChrome / inlineActions config when it returns an element", () => {
    const renderInline = vi.fn().mockImplementation(() => {
      const custom = document.createElement("div");
      custom.className = "my-inline";
      return custom;
    });
    const el = PersonaArtifactInline(
      completeProps(),
      makeContext(
        makeConfig({
          renderInline,
          inlineChrome: true,
          inlineActions: [{ id: "log", label: "Log", onClick: () => {} }]
        })
      )
    );
    // No default chrome / body leaked through; the custom element is all there is.
    expect(el.classList.contains("my-inline")).toBe(true);
    expect(el.querySelector(".persona-artifact-inline-chrome")).toBeNull();
    expect(el.querySelector("[data-artifact-custom-action]")).toBeNull();
  });
});

describe("PersonaArtifactInline file-preview chrome", () => {
  it("renders the chrome bar with title, type label, zones, and body wrapper on complete", () => {
    const el = PersonaArtifactInline(completeProps(), makeContext(makeConfig()));

    // Frame + chrome theme zones.
    expect(el.getAttribute("data-persona-theme-zone")).toBe("artifact-inline");
    const chrome = el.querySelector(
      ".persona-artifact-inline-chrome"
    ) as HTMLElement | null;
    expect(chrome).not.toBeNull();
    expect(chrome!.getAttribute("data-persona-theme-zone")).toBe(
      "artifact-inline-chrome"
    );

    // Title + type label.
    const title = el.querySelector(".persona-artifact-inline-title");
    expect(title?.textContent).toBe("Notes");
    const type = el.querySelector(".persona-artifact-inline-type");
    expect(type?.textContent).toBe("Document");

    // Body wrapper wraps the shared preview body.
    const body = el.querySelector(".persona-artifact-inline-body");
    expect(body).not.toBeNull();
    expect(body!.querySelector(".persona-artifact-preview-body")).toBeTruthy();
  });

  it("shows a streaming status and hides copy + custom actions while streaming", () => {
    const el = PersonaArtifactInline(
      streamingProps(),
      makeContext(
        makeConfig({
          loadingAnimation: "none",
          inlineActions: [{ id: "log", label: "Log", onClick: () => {} }]
        })
      )
    );

    // Streaming status replaces the type label.
    const status = el.querySelector(".persona-artifact-inline-status");
    expect(status).not.toBeNull();
    expect(status!.textContent).toBe("Generating document...");
    expect(el.querySelector(".persona-artifact-inline-type")).toBeNull();

    // Copy exists but is hidden; no custom actions rendered mid-stream.
    const copy = el.querySelector("[data-copy-artifact]") as HTMLElement | null;
    expect(copy).not.toBeNull();
    expect(copy!.classList.contains("persona-hidden")).toBe(true);
    expect(el.querySelector("[data-artifact-custom-action]")).toBeNull();
  });

  it("shows the type label, copy, expand, and custom actions on complete", () => {
    const el = PersonaArtifactInline(
      completeProps(),
      makeContext(
        makeConfig({
          inlineActions: [{ id: "log", label: "Log", onClick: () => {} }]
        })
      )
    );

    const copy = el.querySelector("[data-copy-artifact]") as HTMLElement | null;
    expect(copy).not.toBeNull();
    expect(copy!.classList.contains("persona-hidden")).toBe(false);
    expect(copy!.getAttribute("data-copy-artifact")).toBe("a1");

    const expand = el.querySelector(
      "[data-expand-artifact-inline]"
    ) as HTMLElement | null;
    expect(expand).not.toBeNull();
    expect(expand!.getAttribute("data-expand-artifact-inline")).toBe("a1");

    const custom = el.querySelector(
      '[data-artifact-custom-action="log"]'
    ) as HTMLElement | null;
    expect(custom).not.toBeNull();
    // Custom actions render before copy / expand.
    expect(
      custom!.compareDocumentPosition(copy!) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("flips streaming -> complete in place on the same root element (no remount)", () => {
    const container = document.createElement("div");
    const el = PersonaArtifactInline(
      streamingProps(),
      makeContext(
        makeConfig({
          loadingAnimation: "none",
          inlineActions: [{ id: "log", label: "Log", onClick: () => {} }]
        })
      )
    );
    container.appendChild(el);
    const chromeBefore = el.querySelector(".persona-artifact-inline-chrome");
    expect(el.querySelector("[data-artifact-custom-action]")).toBeNull();

    updateInlineArtifactBlocks(container, [
      {
        id: "a1",
        artifactType: "markdown",
        title: "Notes",
        status: "complete",
        markdown: "# Done"
      }
    ]);

    // Same root + same chrome node: updated in place, not re-rendered.
    expect(container.firstElementChild).toBe(el);
    expect(el.querySelector(".persona-artifact-inline-chrome")).toBe(chromeBefore);
    // Streaming status gave way to the type label and the complete-gated actions.
    expect(el.querySelector(".persona-artifact-inline-status")).toBeNull();
    expect(el.querySelector(".persona-artifact-inline-type")?.textContent).toBe(
      "Document"
    );
    const copy = el.querySelector("[data-copy-artifact]") as HTMLElement | null;
    expect(copy!.classList.contains("persona-hidden")).toBe(false);
    expect(el.querySelector('[data-artifact-custom-action="log"]')).toBeTruthy();
  });

  it("omits the chrome bar but keeps the body wrapper when inlineChrome is false", () => {
    const el = PersonaArtifactInline(
      completeProps(),
      makeContext(makeConfig({ inlineChrome: false }))
    );
    expect(el.querySelector(".persona-artifact-inline-chrome")).toBeNull();
    expect(el.querySelector("[data-copy-artifact]")).toBeNull();
    expect(el.querySelector("[data-expand-artifact-inline]")).toBeNull();
    // The body wrapper is always present (it carries the frame padding).
    const body = el.querySelector(".persona-artifact-inline-body");
    expect(body).not.toBeNull();
    expect(body!.querySelector(".persona-artifact-preview-body")).toBeTruthy();
  });

  it("drops only the copy button for inlineChrome { showCopy: false }", () => {
    const el = PersonaArtifactInline(
      completeProps(),
      makeContext(makeConfig({ inlineChrome: { showCopy: false } }))
    );
    expect(el.querySelector(".persona-artifact-inline-chrome")).not.toBeNull();
    expect(el.querySelector("[data-copy-artifact]")).toBeNull();
    expect(el.querySelector("[data-expand-artifact-inline]")).not.toBeNull();
  });

  it("drops only the expand button for inlineChrome { showExpand: false }", () => {
    const el = PersonaArtifactInline(
      completeProps(),
      makeContext(makeConfig({ inlineChrome: { showExpand: false } }))
    );
    expect(el.querySelector(".persona-artifact-inline-chrome")).not.toBeNull();
    expect(el.querySelector("[data-copy-artifact]")).not.toBeNull();
    expect(el.querySelector("[data-expand-artifact-inline]")).toBeNull();
  });

  it("respects each inline action's visible() gate", () => {
    const el = PersonaArtifactInline(
      completeProps(),
      makeContext(
        makeConfig({
          inlineActions: [
            { id: "shown", label: "Shown", onClick: () => {} },
            {
              id: "hidden",
              label: "Hidden",
              visible: () => false,
              onClick: () => {}
            }
          ]
        })
      )
    );
    expect(el.querySelector('[data-artifact-custom-action="shown"]')).toBeTruthy();
    expect(el.querySelector('[data-artifact-custom-action="hidden"]')).toBeNull();
  });
});

describe("PersonaArtifactInline inlineBody height model", () => {
  const BODY_HEIGHT_VAR = "--persona-artifact-inline-body-height";

  const fileStreamingProps = (): Record<string, unknown> => ({
    artifactId: "f1",
    title: "outputs/cat.html",
    artifactType: "markdown",
    status: "streaming",
    markdown: "```html\n<h1>hi",
    file: { path: "outputs/cat.html", mimeType: "text/html", language: "html" }
  });

  const fileCompleteRecord = (): PersonaArtifactRecord => ({
    id: "f1",
    artifactType: "markdown",
    title: "outputs/cat.html",
    status: "complete",
    markdown: wireFor(HTML_RAW, "html"),
    file: { path: "outputs/cat.html", mimeType: "text/html", language: "html" }
  });

  it("defaults to a fixed 320px streaming source window", () => {
    const el = PersonaArtifactInline(fileStreamingProps(), makeContext(makeConfig()));
    expect(el.style.getPropertyValue(BODY_HEIGHT_VAR)).toBe("320px");
    expect(el.querySelector(".persona-artifact-source-window--fixed")).toBeTruthy();
  });

  it("applies a scalar numeric height to both states", () => {
    const el = PersonaArtifactInline(
      fileStreamingProps(),
      makeContext(makeConfig({ inlineBody: { height: 200 } }))
    );
    expect(el.style.getPropertyValue(BODY_HEIGHT_VAR)).toBe("200px");
  });

  it("applies object heights per state and updates the var on complete", () => {
    const container = document.createElement("div");
    const el = PersonaArtifactInline(
      fileStreamingProps(),
      makeContext(makeConfig({ inlineBody: { height: { streaming: 150, complete: 400 } } }))
    );
    container.appendChild(el);
    expect(el.style.getPropertyValue(BODY_HEIGHT_VAR)).toBe("150px");

    updateInlineArtifactBlocks(container, [fileCompleteRecord()]);
    expect(el.style.getPropertyValue(BODY_HEIGHT_VAR)).toBe("400px");
  });

  it("leaves the height var unset (no fixed window) for height 'auto'", () => {
    const el = PersonaArtifactInline(
      fileStreamingProps(),
      makeContext(makeConfig({ inlineBody: { height: "auto" } }))
    );
    expect(el.style.getPropertyValue(BODY_HEIGHT_VAR)).toBe("");
    expect(el.querySelector(".persona-artifact-source-window--fixed")).toBeNull();
  });

  it("renders the status placeholder while streaming with streamingView 'status'", () => {
    const el = PersonaArtifactInline(
      fileStreamingProps(),
      makeContext(
        makeConfig({ inlineBody: { streamingView: "status" }, loadingAnimation: "none" })
      )
    );
    const status = el.querySelector(".persona-artifact-status-view");
    expect(status).toBeTruthy();
    expect(status!.textContent).toContain("Generating");
    expect(el.querySelector(".persona-artifact-source-window")).toBeNull();
  });

  it("caps a non-iframe complete body and leaves the iframe body uncapped", () => {
    // Non-file markdown complete → capped (no iframe).
    const capped = PersonaArtifactInline(completeProps(), makeContext(makeConfig()));
    expect(capped.querySelector(".persona-artifact-inline-body--cap")).toBeTruthy();

    // File complete → iframe, sized by the var, so not capped.
    const iframeEl = PersonaArtifactInline(
      {
        artifactId: "f1",
        title: "outputs/cat.html",
        artifactType: "markdown",
        status: "complete",
        markdown: wireFor(HTML_RAW, "html"),
        file: { path: "outputs/cat.html", mimeType: "text/html", language: "html" }
      },
      makeContext(makeConfig())
    );
    expect(iframeEl.querySelector("iframe")).toBeTruthy();
    expect(iframeEl.querySelector(".persona-artifact-inline-body--cap")).toBeNull();
  });
});

describe("PersonaArtifactInline inlineBody viewMode", () => {
  const htmlFileProps = (status: "streaming" | "complete"): Record<string, unknown> => ({
    artifactId: "f1",
    title: "outputs/cat.html",
    artifactType: "markdown",
    status,
    markdown: wireFor(HTML_RAW, "html"),
    file: { path: "outputs/cat.html", mimeType: "text/html", language: "html" }
  });

  it("keeps the rendered default: complete html file previews in an iframe", () => {
    const el = PersonaArtifactInline(htmlFileProps("complete"), makeContext(makeConfig()));
    expect(el.querySelector("iframe")).toBeTruthy();
  });

  it("viewMode 'source' shows highlighted source instead of the iframe preview", () => {
    const el = PersonaArtifactInline(
      htmlFileProps("complete"),
      makeContext(makeConfig({ inlineBody: { viewMode: "source" } }))
    );
    expect(el.querySelector("iframe")).toBeNull();
    expect(el.querySelector(".persona-code-pre")).toBeTruthy();
    // The complete source view keeps the same sized wrapper + inner window the
    // streaming state uses (geometry-identical swap): full-bleed like the
    // pane's source view, no padded-wrapper cap.
    expect(el.querySelector(".persona-artifact-source-window--fixed")).toBeTruthy();
    const bodyEl = el.querySelector(".persona-artifact-inline-body")!;
    expect(bodyEl.classList.contains("persona-artifact-content-flush")).toBe(true);
    expect(bodyEl.classList.contains("persona-artifact-inline-body--sized")).toBe(true);
    expect(bodyEl.classList.contains("persona-artifact-inline-body--cap")).toBe(false);
  });

  it("viewMode 'source' covers markdown-kind files (no rendered markdown)", () => {
    const MD_RAW = "# Title\n";
    const el = PersonaArtifactInline(
      {
        artifactId: "m1",
        title: "notes.md",
        artifactType: "markdown",
        status: "complete",
        markdown: wireFor(MD_RAW, "markdown"),
        file: { path: "notes.md", mimeType: "text/markdown", language: "markdown" }
      },
      makeContext(makeConfig({ inlineBody: { viewMode: "source" } }))
    );
    expect(el.querySelector(".persona-markdown-bubble")).toBeNull();
    const pre = el.querySelector(".persona-code-pre");
    expect(pre).toBeTruthy();
    expect(pre!.textContent).toContain("# Title");
  });

  it("viewMode 'source' covers plain markdown artifacts", () => {
    const el = PersonaArtifactInline(
      completeProps(),
      makeContext(makeConfig({ inlineBody: { viewMode: "source" } }))
    );
    expect(el.querySelector(".persona-markdown-bubble")).toBeNull();
    expect(el.querySelector(".persona-code-pre")).toBeTruthy();
  });

  it("viewMode 'source' keeps the streaming source window and swaps nothing on complete", () => {
    const container = document.createElement("div");
    const el = PersonaArtifactInline(
      htmlFileProps("streaming"),
      makeContext(makeConfig({ inlineBody: { viewMode: "source" } }))
    );
    container.appendChild(el);
    const preBefore = el.querySelector(".persona-code-pre");
    expect(preBefore).toBeTruthy();

    updateInlineArtifactBlocks(container, [
      {
        id: "f1",
        artifactType: "markdown",
        title: "outputs/cat.html",
        status: "complete",
        markdown: wireFor(HTML_RAW, "html"),
        file: { path: "outputs/cat.html", mimeType: "text/html", language: "html" }
      }
    ]);
    expect(el.querySelector("iframe")).toBeNull();
    // Same <pre> node survives the streaming→complete boundary (in-place update).
    expect(el.querySelector(".persona-code-pre")).toBe(preBefore);
  });
});

describe("PersonaArtifactInline inlineBody flush and sized wrappers", () => {
  it("streams source full-bleed in a sized wrapper (pane-style flush code)", () => {
    const el = PersonaArtifactInline(
      {
        artifactId: "f1",
        title: "outputs/cat.html",
        artifactType: "markdown",
        status: "streaming",
        markdown: "```html\n<h1>hi",
        file: { path: "outputs/cat.html", mimeType: "text/html", language: "html" }
      },
      makeContext(makeConfig())
    );
    const bodyEl = el.querySelector(".persona-artifact-inline-body")!;
    expect(bodyEl.classList.contains("persona-artifact-content-flush")).toBe(true);
    expect(bodyEl.classList.contains("persona-artifact-inline-body--sized")).toBe(true);
  });

  it("keeps rendered markdown padded (no flush, no sized wrapper)", () => {
    const el = PersonaArtifactInline(completeProps(), makeContext(makeConfig()));
    const bodyEl = el.querySelector(".persona-artifact-inline-body")!;
    expect(bodyEl.classList.contains("persona-artifact-content-flush")).toBe(false);
    expect(bodyEl.classList.contains("persona-artifact-inline-body--sized")).toBe(false);
    expect(bodyEl.classList.contains("persona-artifact-inline-body--cap")).toBe(true);
  });

  it("sizes the wrapper for the complete iframe (padded, same outer box)", () => {
    const el = PersonaArtifactInline(
      {
        artifactId: "f1",
        title: "outputs/cat.html",
        artifactType: "markdown",
        status: "complete",
        markdown: wireFor(HTML_RAW, "html"),
        file: { path: "outputs/cat.html", mimeType: "text/html", language: "html" }
      },
      makeContext(makeConfig())
    );
    const bodyEl = el.querySelector(".persona-artifact-inline-body")!;
    expect(el.querySelector("iframe")).toBeTruthy();
    expect(bodyEl.classList.contains("persona-artifact-inline-body--sized")).toBe(true);
    expect(bodyEl.classList.contains("persona-artifact-content-flush")).toBe(false);
  });
});

describe("PersonaArtifactInline view toggle", () => {
  // The toggle carries no data-attribute; its aria-label flips between the two
  // states, so match either. Returns null only when the button was never built
  // (showViewToggle: false).
  const viewToggleOf = (el: HTMLElement): HTMLElement | null =>
    el.querySelector(
      'button[aria-label="View source"], button[aria-label="View preview"]'
    );
  const isHidden = (node: HTMLElement | null): boolean =>
    !!node && node.classList.contains("persona-hidden");

  const htmlFileProps = (
    status: "streaming" | "complete"
  ): Record<string, unknown> => ({
    artifactId: "f1",
    title: "outputs/cat.html",
    artifactType: "markdown",
    status,
    markdown: status === "streaming" ? "```html\n<h1>hi" : wireFor(HTML_RAW, "html"),
    file: { path: "outputs/cat.html", mimeType: "text/html", language: "html" }
  });

  const htmlCompleteRecord = (): PersonaArtifactRecord => ({
    id: "f1",
    artifactType: "markdown",
    title: "outputs/cat.html",
    status: "complete",
    markdown: wireFor(HTML_RAW, "html"),
    file: { path: "outputs/cat.html", mimeType: "text/html", language: "html" }
  });

  it("shows the toggle on a complete html file artifact", () => {
    const el = PersonaArtifactInline(
      htmlFileProps("complete"),
      makeContext(makeConfig())
    );
    const btn = viewToggleOf(el);
    expect(btn).not.toBeNull();
    expect(isHidden(btn)).toBe(false);
    expect(btn!.getAttribute("aria-label")).toBe("View source");
    expect(btn!.getAttribute("aria-pressed")).toBe("false");
    // Placed between custom actions and the copy button.
    const copy = el.querySelector("[data-copy-artifact]") as HTMLElement;
    expect(
      btn!.compareDocumentPosition(copy) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("hides the toggle while streaming", () => {
    const el = PersonaArtifactInline(
      htmlFileProps("streaming"),
      makeContext(makeConfig({ loadingAnimation: "none" }))
    );
    expect(isHidden(viewToggleOf(el))).toBe(true);
  });

  it("hides the toggle for plain markdown artifacts", () => {
    const el = PersonaArtifactInline(completeProps(), makeContext(makeConfig()));
    expect(isHidden(viewToggleOf(el))).toBe(true);
  });

  it("hides the toggle for component artifacts", () => {
    const name = "TestInlineToggleChart";
    componentRegistry.register(name, () => {
      const node = document.createElement("div");
      node.className = "test-toggle-chart";
      return node;
    });
    try {
      const el = PersonaArtifactInline(
        {
          artifactId: "c1",
          title: "Chart",
          artifactType: "component",
          status: "complete",
          component: name,
          componentProps: {}
        },
        makeContext(makeConfig())
      );
      expect(isHidden(viewToggleOf(el))).toBe(true);
    } finally {
      componentRegistry.unregister(name);
    }
  });

  it("hides the toggle for a source-only (kind 'other') file artifact", () => {
    const el = PersonaArtifactInline(
      {
        artifactId: "o1",
        title: "script.py",
        artifactType: "markdown",
        status: "complete",
        markdown: wireFor("print(1)\n", "python"),
        file: { path: "script.py", mimeType: "text/x-python", language: "python" }
      },
      makeContext(makeConfig())
    );
    expect(isHidden(viewToggleOf(el))).toBe(true);
  });

  it("hides the toggle when filePreview is disabled for an html file", () => {
    const el = PersonaArtifactInline(
      htmlFileProps("complete"),
      makeContext(makeConfig({ filePreview: { enabled: false } }))
    );
    expect(isHidden(viewToggleOf(el))).toBe(true);
  });

  it("hides the toggle when inlineBody.viewMode is 'source'", () => {
    const el = PersonaArtifactInline(
      htmlFileProps("complete"),
      makeContext(makeConfig({ inlineBody: { viewMode: "source" } }))
    );
    expect(isHidden(viewToggleOf(el))).toBe(true);
  });

  it("omits the toggle entirely for inlineChrome { showViewToggle: false }", () => {
    const el = PersonaArtifactInline(
      htmlFileProps("complete"),
      makeContext(makeConfig({ inlineChrome: { showViewToggle: false } }))
    );
    expect(viewToggleOf(el)).toBeNull();
    // Copy + expand remain.
    expect(el.querySelector("[data-copy-artifact]")).not.toBeNull();
    expect(el.querySelector("[data-expand-artifact-inline]")).not.toBeNull();
  });

  it("flips iframe -> source and back on click, flipping aria/label and wrapper classes", () => {
    const el = PersonaArtifactInline(
      htmlFileProps("complete"),
      makeContext(makeConfig())
    );
    expect(el.querySelector("iframe")).toBeTruthy();
    const bodyEl = el.querySelector(".persona-artifact-inline-body")!;

    // rendered -> source
    (viewToggleOf(el) as HTMLElement).click();
    expect(el.querySelector("iframe")).toBeNull();
    expect(el.querySelector(".persona-code-pre")).toBeTruthy();
    const btnSource = viewToggleOf(el)!;
    expect(btnSource.getAttribute("aria-label")).toBe("View preview");
    expect(btnSource.getAttribute("aria-pressed")).toBe("true");
    // Source view recomputes to full-bleed + sized.
    expect(bodyEl.classList.contains("persona-artifact-content-flush")).toBe(true);
    expect(bodyEl.classList.contains("persona-artifact-inline-body--sized")).toBe(true);

    // source -> rendered
    (viewToggleOf(el) as HTMLElement).click();
    expect(el.querySelector("iframe")).toBeTruthy();
    expect(el.querySelector(".persona-code-pre")).toBeNull();
    const btnBack = viewToggleOf(el)!;
    expect(btnBack.getAttribute("aria-label")).toBe("View source");
    expect(btnBack.getAttribute("aria-pressed")).toBe("false");
    // Preview iframe is padded (not flush) but still sized (same outer box).
    expect(bodyEl.classList.contains("persona-artifact-content-flush")).toBe(false);
    expect(bodyEl.classList.contains("persona-artifact-inline-body--sized")).toBe(true);
  });

  it("resets to the configured default view when the block restarts streaming", () => {
    const container = document.createElement("div");
    const el = PersonaArtifactInline(
      htmlFileProps("complete"),
      makeContext(makeConfig({ loadingAnimation: "none" }))
    );
    container.appendChild(el);

    // Toggle to source, then a streaming restart clears the choice.
    (viewToggleOf(el) as HTMLElement).click();
    expect(el.querySelector(".persona-code-pre")).toBeTruthy();

    updateInlineArtifactBlocks(container, [
      { ...htmlCompleteRecord(), status: "streaming", markdown: "```html\n<h1>hi" }
    ]);
    updateInlineArtifactBlocks(container, [htmlCompleteRecord()]);

    // Back on the rendered default (iframe), toggle label reset.
    expect(el.querySelector("iframe")).toBeTruthy();
    expect(viewToggleOf(el)!.getAttribute("aria-label")).toBe("View source");
    expect(viewToggleOf(el)!.getAttribute("aria-pressed")).toBe("false");
  });
});
