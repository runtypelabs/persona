// @vitest-environment jsdom

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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

const toggleBtn = (
  pane: ReturnType<typeof createArtifactPane>,
  label: string
): HTMLButtonElement =>
  pane.element.querySelector(`[aria-label="${label}"]`) as HTMLButtonElement;

describe("artifact-pane view/source toggle", () => {
  it("renders an inline SVG icon in both toggle buttons (icon-registry guard)", () => {
    const pane = createArtifactPane(makeConfig(), { onSelect: () => {} });
    pane.update({ artifacts: [fileRecord()], selectedId: "a1" });

    const rendered = toggleBtn(pane, "Rendered view");
    const source = toggleBtn(pane, "Source");
    expect(rendered).toBeTruthy();
    expect(source).toBeTruthy();
    // A missing/renamed icon would leave renderLucideIcon returning null and the
    // button rendering empty, so guard that both carry an inline <svg>.
    expect(rendered.querySelector("svg")).toBeTruthy();
    expect(source.querySelector("svg")).toBeTruthy();
  });

  it("flips aria-pressed between the buttons when Source is clicked", () => {
    const pane = createArtifactPane(makeConfig(), { onSelect: () => {} });
    pane.update({ artifacts: [fileRecord()], selectedId: "a1" });

    const rendered = toggleBtn(pane, "Rendered view");
    const source = toggleBtn(pane, "Source");
    expect(rendered.getAttribute("aria-pressed")).toBe("true");
    expect(source.getAttribute("aria-pressed")).toBe("false");

    source.click();
    expect(rendered.getAttribute("aria-pressed")).toBe("false");
    expect(source.getAttribute("aria-pressed")).toBe("true");
  });

  it("switches a previewable file artifact to source view when Source is clicked", () => {
    const pane = createArtifactPane(makeConfig(), { onSelect: () => {} });
    pane.update({ artifacts: [fileRecord()], selectedId: "a1" });

    const content = contentEl(pane);
    // Rendered view: sandboxed iframe.
    expect(content.querySelector("iframe")).toBeTruthy();

    toggleBtn(pane, "Source").click();
    expect(content.querySelector("iframe")).toBeNull();
    const pre = content.querySelector("pre");
    expect(pre).toBeTruthy();
    expect(pre?.textContent).toBe(HTML_RAW);
  });
});

describe("artifact-pane default toolbar", () => {
  it("renders a label-button Close control labelled for the panel", () => {
    const pane = createArtifactPane(makeConfig(), { onSelect: () => {} });
    pane.update({ artifacts: [fileRecord()], selectedId: "a1" });

    const close = toggleBtn(pane, "Close artifacts panel");
    expect(close).toBeTruthy();
    expect(close.tagName).toBe("BUTTON");
    expect(close.classList.contains("persona-label-btn")).toBe(true);
  });
});

const makeExpandConfig = (): AgentWidgetConfig =>
  ({
    sanitize: false,
    features: { artifacts: { enabled: true, layout: { showExpandToggle: true } } },
  }) as AgentWidgetConfig;

const expandBtnOf = (
  pane: ReturnType<typeof createArtifactPane>
): HTMLButtonElement | null =>
  pane.element.querySelector(".persona-artifact-expand-btn") as HTMLButtonElement | null;

describe("artifact-pane expand toggle", () => {
  it("hides the expand button by default", () => {
    // The button is always built (so a live config update can reveal it via
    // setExpandToggleVisible) but starts hidden without showExpandToggle.
    const pane = createArtifactPane(makeConfig(), { onSelect: () => {} });
    pane.update({ artifacts: [fileRecord()], selectedId: "a1" });
    expect(expandBtnOf(pane)!.classList.contains("persona-hidden")).toBe(true);
  });

  it("setExpandToggleVisible reveals and re-hides the button", () => {
    const pane = createArtifactPane(makeConfig(), { onSelect: () => {} });
    pane.update({ artifacts: [fileRecord()], selectedId: "a1" });
    pane.setExpandToggleVisible(true);
    expect(expandBtnOf(pane)!.classList.contains("persona-hidden")).toBe(false);
    pane.setExpandToggleVisible(false);
    expect(expandBtnOf(pane)!.classList.contains("persona-hidden")).toBe(true);
  });

  it("renders the expand button (labelled, with an svg) when layout.showExpandToggle is true", () => {
    const pane = createArtifactPane(makeExpandConfig(), { onSelect: () => {} });
    pane.update({ artifacts: [fileRecord()], selectedId: "a1" });
    const btn = expandBtnOf(pane);
    expect(btn).toBeTruthy();
    expect(btn?.getAttribute("aria-label")).toBe("Expand artifacts panel");
    expect(btn?.querySelector("svg")).toBeTruthy();
  });

  it("invokes the onToggleExpand callback when clicked", () => {
    const onToggleExpand = vi.fn();
    const pane = createArtifactPane(makeExpandConfig(), { onSelect: () => {}, onToggleExpand });
    pane.update({ artifacts: [fileRecord()], selectedId: "a1" });
    expandBtnOf(pane)!.click();
    expect(onToggleExpand).toHaveBeenCalledTimes(1);
  });

  it("setExpanded flips the label/title and keeps an svg icon", () => {
    const pane = createArtifactPane(makeExpandConfig(), { onSelect: () => {} });
    pane.update({ artifacts: [fileRecord()], selectedId: "a1" });
    const btn = expandBtnOf(pane)!;

    pane.setExpanded(true);
    expect(btn.getAttribute("aria-label")).toBe("Collapse artifacts panel");
    expect(btn.title).toBe("Collapse artifacts panel");
    // A missing/renamed "minimize" icon would leave the button empty.
    expect(btn.querySelector("svg")).toBeTruthy();

    pane.setExpanded(false);
    expect(btn.getAttribute("aria-label")).toBe("Expand artifacts panel");
    expect(btn.title).toBe("Expand artifacts panel");
    expect(btn.querySelector("svg")).toBeTruthy();
  });
});

const tabsIn = (pane: ReturnType<typeof createArtifactPane>): HTMLButtonElement[] =>
  Array.from(
    pane.element.querySelectorAll(".persona-artifact-tab")
  ) as HTMLButtonElement[];

describe("artifact-pane tabs", () => {
  it("labels file tabs by basename and keeps the full path in a tooltip", () => {
    const pane = createArtifactPane(makeConfig(), { onSelect: () => {} });
    pane.update({ artifacts: [fileRecord()], selectedId: "a1" });
    const [tab] = tabsIn(pane);
    expect(tab.textContent).toBe("cat.html");
    expect(tab.title).toBe("outputs/cat.html");
    expect(tab.getAttribute("aria-label")).toBe("outputs/cat.html");
  });

  it("falls back to the title for non-file artifacts", () => {
    const pane = createArtifactPane(makeConfig(), { onSelect: () => {} });
    pane.update({
      artifacts: [
        {
          id: "m1",
          artifactType: "markdown",
          title: "Plain",
          status: "complete",
          markdown: "## Plain",
        },
      ],
      selectedId: "m1",
    });
    const [tab] = tabsIn(pane);
    expect(tab.textContent).toBe("Plain");
    expect(tab.title).toBe("Plain");
  });

  it("renders one tab per artifact and marks the selected one active", () => {
    const pane = createArtifactPane(makeConfig(), { onSelect: () => {} });
    pane.update({
      artifacts: [
        fileRecord({
          id: "a1",
          title: "outputs/one.html",
          file: { path: "outputs/one.html", mimeType: "text/html", language: "html" },
        }),
        fileRecord({
          id: "a2",
          title: "outputs/two.html",
          file: { path: "outputs/two.html", mimeType: "text/html", language: "html" },
        }),
      ],
      selectedId: "a2",
    });
    const tabs = tabsIn(pane);
    expect(tabs.map((t) => t.textContent)).toEqual(["one.html", "two.html"]);
    expect(tabs[1].classList.contains("persona-bg-persona-container")).toBe(true);
    expect(tabs[0].classList.contains("persona-bg-persona-container")).toBe(false);
  });

  it("scrolls the selected tab into view only when the selection changes", () => {
    const calls: HTMLElement[] = [];
    const orig = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: HTMLElement) {
      calls.push(this);
    } as typeof Element.prototype.scrollIntoView;
    try {
      const pane = createArtifactPane(makeConfig(), { onSelect: () => {} });
      const a1 = fileRecord({
        id: "a1",
        title: "outputs/one.html",
        file: { path: "outputs/one.html", mimeType: "text/html", language: "html" },
      });
      const a2 = fileRecord({
        id: "a2",
        title: "outputs/two.html",
        file: { path: "outputs/two.html", mimeType: "text/html", language: "html" },
      });

      pane.update({ artifacts: [a1], selectedId: "a1" });
      expect(calls.length).toBeGreaterThan(0);

      const beforeSelect = calls.length;
      pane.update({ artifacts: [a1, a2], selectedId: "a2" });
      expect(calls.length).toBeGreaterThan(beforeSelect);
      expect(calls[calls.length - 1].textContent).toBe("two.html");

      // Re-render with the same selection must not re-scroll (don't fight a
      // user who scrolled the strip manually).
      const beforeIdle = calls.length;
      pane.update({ artifacts: [a1, a2], selectedId: "a2" });
      expect(calls.length).toBe(beforeIdle);
    } finally {
      Element.prototype.scrollIntoView = orig;
    }
  });
});
