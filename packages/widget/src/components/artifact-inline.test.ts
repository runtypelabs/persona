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
    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts");
    expect(iframe.srcdoc).toBe(HTML_RAW);
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
