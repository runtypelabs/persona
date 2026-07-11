// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import {
  PersonaArtifactInline,
  updateInlineArtifactBlocks
} from "./artifact-inline";
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
});
