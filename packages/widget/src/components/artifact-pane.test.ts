// @vitest-environment jsdom

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createArtifactPane } from "./artifact-pane";
import type { AgentWidgetConfig, PersonaArtifactRecord } from "../types";

beforeAll(() => {
  // jsdom does not implement matchMedia; the pane's layout code touches it.
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
});

describe("createArtifactPane toolbar copy", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("uses configurable product-facing toolbar labels", () => {
    const pane = createArtifactPane(
      {
        apiUrl: "/api/chat",
        features: {
          artifacts: {
            enabled: true,
            layout: {
              toolbarTitle: "Analysis",
              closeButtonLabel: "Back to chat",
            },
          },
        },
      },
      { onSelect: () => undefined },
    );

    document.body.appendChild(pane.element);

    expect(pane.element.textContent).toContain("Analysis");
    expect(pane.element.querySelector('[aria-label="Back to chat"]')).not.toBeNull();
  });
});

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

const contentEl = (pane: ReturnType<typeof createArtifactPane>): HTMLElement =>
  pane.element.querySelector(".persona-artifact-content") as HTMLElement;

describe("artifact-pane file preview", () => {
  it("renders a sandboxed iframe (allow-scripts, no allow-same-origin) with srcdoc = raw source", () => {
    const pane = createArtifactPane(makeConfig(), { onSelect: () => {} });
    pane.update({ artifacts: [fileRecord()], selectedId: "a1" });

    const iframe = contentEl(pane).querySelector(
      "iframe.persona-artifact-iframe"
    ) as HTMLIFrameElement;
    expect(iframe).toBeTruthy();
    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts");
    expect(iframe.getAttribute("sandbox")).not.toContain("allow-same-origin");
    // srcdoc is the raw, unfenced source assigned as a property.
    expect(iframe.srcdoc).toBe(HTML_RAW);
  });

  it("honors a custom iframeSandbox override", () => {
    const pane = createArtifactPane(makeConfig({ iframeSandbox: "allow-scripts allow-forms" }), {
      onSelect: () => {},
    });
    pane.update({ artifacts: [fileRecord()], selectedId: "a1" });
    const iframe = contentEl(pane).querySelector("iframe") as HTMLIFrameElement;
    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts allow-forms");
  });

  it("shows source (no iframe) while streaming", () => {
    const pane = createArtifactPane(makeConfig(), { onSelect: () => {} });
    pane.update({
      artifacts: [fileRecord({ status: "streaming", markdown: "```html\n<h1>hi" })],
      selectedId: "a1",
    });
    const content = contentEl(pane);
    expect(content.querySelector("iframe")).toBeNull();
    const pre = content.querySelector("pre");
    expect(pre).toBeTruthy();
    expect(pre?.textContent).toBe("<h1>hi");
  });

  it("renders a markdown file through the markdown pipeline (no iframe)", () => {
    const pane = createArtifactPane(makeConfig(), { onSelect: () => {} });
    pane.update({
      artifacts: [
        fileRecord({
          title: "notes.md",
          markdown: wireFor("# Hello\n", "md"),
          file: { path: "notes.md", mimeType: "text/markdown", language: "md" },
        }),
      ],
      selectedId: "a1",
    });
    const content = contentEl(pane);
    expect(content.querySelector("iframe")).toBeNull();
    expect(content.querySelector("pre")).toBeNull();
    expect(content.querySelector(".persona-markdown-bubble")).toBeTruthy();
  });

  it("forces source view (no iframe) when filePreview.enabled is false", () => {
    const pane = createArtifactPane(makeConfig({ enabled: false }), { onSelect: () => {} });
    pane.update({ artifacts: [fileRecord()], selectedId: "a1" });
    const content = contentEl(pane);
    expect(content.querySelector("iframe")).toBeNull();
    const pre = content.querySelector("pre");
    expect(pre).toBeTruthy();
    expect(pre?.textContent).toBe(HTML_RAW);
  });

  it("renders non-file markdown artifacts unchanged (markdown bubble, no iframe)", () => {
    const pane = createArtifactPane(makeConfig(), { onSelect: () => {} });
    pane.update({
      artifacts: [
        {
          id: "m1",
          artifactType: "markdown",
          title: "Plain",
          status: "complete",
          markdown: "## Plain doc",
        },
      ],
      selectedId: "m1",
    });
    const content = contentEl(pane);
    expect(content.querySelector("iframe")).toBeNull();
    expect(content.querySelector(".persona-markdown-bubble")).toBeTruthy();
  });
});
