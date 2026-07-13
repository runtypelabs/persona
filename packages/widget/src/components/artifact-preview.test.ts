// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { renderArtifactPreviewBody } from "./artifact-preview";
import type { AgentWidgetConfig, PersonaArtifactRecord } from "../types";
import type { ComponentRenderer } from "./registry";

const ZWSP = "\u200b";
const HTML_RAW = "<h1>hi</h1>\n<script>window.x = 1;</script>\n";
const wireFor = (raw: string, lang: string): string =>
  "```" + lang + "\n" + raw.split("```").join("`" + ZWSP + "``") + "\n```";

const makeConfig = (filePreview?: {
  enabled?: boolean;
  iframeSandbox?: string;
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

describe("artifact-preview file body", () => {
  it("renders a sandboxed iframe (allow-scripts, no allow-same-origin) with srcdoc = raw source", () => {
    const handle = renderArtifactPreviewBody(fileRecord(), { config: makeConfig() });
    const iframe = handle.el.querySelector(
      "iframe.persona-artifact-iframe"
    ) as HTMLIFrameElement;
    expect(iframe).toBeTruthy();
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
    expect(iframe.srcdoc).toBe(HTML_RAW);
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
