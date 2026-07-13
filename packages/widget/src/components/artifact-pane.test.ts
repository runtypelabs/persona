// @vitest-environment jsdom

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createArtifactPane } from "./artifact-pane";
import type {
  AgentWidgetConfig,
  PersonaArtifactCustomAction,
  PersonaArtifactRecord,
} from "../types";

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
  loading?:
    | boolean
    | {
        delayMs?: number;
        minVisibleMs?: number;
        timeoutMs?: number;
        injectReadySignal?: boolean;
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

const contentEl = (pane: ReturnType<typeof createArtifactPane>): HTMLElement =>
  pane.element.querySelector(".persona-artifact-content") as HTMLElement;

describe("artifact-pane file preview", () => {
  it("renders a sandboxed iframe (allow-scripts, no allow-same-origin) with srcdoc = raw source", () => {
    // loading:false → no injected reporter, so srcdoc is exactly the raw source.
    const pane = createArtifactPane(makeConfig({ loading: false }), { onSelect: () => {} });
    pane.update({ artifacts: [fileRecord()], selectedId: "a1" });

    const iframe = contentEl(pane).querySelector(
      "iframe.persona-artifact-iframe"
    ) as HTMLIFrameElement;
    expect(iframe).toBeTruthy();
    // Pane path also wraps the iframe in the positioned frame.
    expect(iframe.parentElement?.classList.contains("persona-artifact-frame")).toBe(
      true
    );
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

describe("artifact-pane lazy rendering (hidden pane)", () => {
  it("does not build the preview iframe while the pane is hidden", () => {
    // loading:false → an iframe would be built immediately if we rendered.
    const pane = createArtifactPane(makeConfig({ loading: false }), { onSelect: () => {} });
    pane.setVisible(false);
    pane.update({ artifacts: [fileRecord()], selectedId: "a1" });

    const content = contentEl(pane);
    // No preview DOM at all while hidden: no iframe, and not even the source pre.
    expect(content.querySelector("iframe")).toBeNull();
    expect(content.querySelector("pre")).toBeNull();
  });

  it("renders the current recorded state on reveal (after lazy-skipped updates)", () => {
    const pane = createArtifactPane(makeConfig({ loading: false }), { onSelect: () => {} });
    pane.setVisible(false);
    // Two hidden updates; the second one is the state that must render on reveal.
    pane.update({ artifacts: [fileRecord({ id: "a1", title: "outputs/one.html" })], selectedId: "a1" });
    pane.update({
      artifacts: [
        fileRecord({ id: "a1", title: "outputs/one.html" }),
        fileRecord({
          id: "a2",
          title: "outputs/two.html",
          file: { path: "outputs/two.html", mimeType: "text/html", language: "html" },
        }),
      ],
      selectedId: "a2",
    });
    expect(contentEl(pane).querySelector("iframe")).toBeNull();

    pane.setVisible(true);
    const iframe = contentEl(pane).querySelector(
      "iframe.persona-artifact-iframe"
    ) as HTMLIFrameElement;
    expect(iframe).toBeTruthy();
    // Latest state won: the selected artifact is a2, so its id rode onto the iframe.
    expect(iframe.getAttribute("data-artifact-id")).toBe("a2");
  });

  it("renders eagerly by default (visible path) when constructed directly — panel mode is unaffected", () => {
    // No setVisible call: the pane defaults to visible, matching panel display
    // mode where ui.ts drives setVisible(true) whenever records exist.
    const pane = createArtifactPane(makeConfig({ loading: false }), { onSelect: () => {} });
    pane.update({ artifacts: [fileRecord()], selectedId: "a1" });
    expect(contentEl(pane).querySelector("iframe")).toBeTruthy();
  });

  it("keeps the already-rendered preview iframe (same node) across hide/show", () => {
    const pane = createArtifactPane(makeConfig({ loading: false }), { onSelect: () => {} });
    pane.setVisible(true);
    pane.update({ artifacts: [fileRecord()], selectedId: "a1" });
    const first = contentEl(pane).querySelector("iframe") as HTMLIFrameElement;
    expect(first).toBeTruthy();

    // Hide (user collapses): the mounted preview must survive so re-open does
    // not reload the iframe.
    pane.setVisible(false);
    expect(contentEl(pane).querySelector("iframe")).toBe(first);

    // Reveal again with the same artifact: same node, not a rebuild.
    pane.setVisible(true);
    pane.update({ artifacts: [fileRecord()], selectedId: "a1" });
    expect(contentEl(pane).querySelector("iframe")).toBe(first);
  });

  it("does not build a NEW artifact's iframe while hidden, then renders it on reveal", () => {
    const pane = createArtifactPane(makeConfig({ loading: false }), { onSelect: () => {} });
    pane.setVisible(true);
    pane.update({ artifacts: [fileRecord({ id: "a1" })], selectedId: "a1" });
    const first = contentEl(pane).querySelector("iframe") as HTMLIFrameElement;
    expect(first.getAttribute("data-artifact-id")).toBe("a1");

    // Hide, then a NEW artifact arrives while hidden: no iframe rebuild yet.
    pane.setVisible(false);
    pane.update({
      artifacts: [
        fileRecord({ id: "a1" }),
        fileRecord({
          id: "a2",
          title: "outputs/two.html",
          file: { path: "outputs/two.html", mimeType: "text/html", language: "html" },
        }),
      ],
      selectedId: "a2",
    });
    // Still the old node (no render happened while hidden).
    expect(contentEl(pane).querySelector("iframe")).toBe(first);

    pane.setVisible(true);
    const shown = contentEl(pane).querySelector("iframe") as HTMLIFrameElement;
    expect(shown.getAttribute("data-artifact-id")).toBe("a2");
  });

  it("renders a streaming artifact live after reveal (source while streaming, iframe on complete)", () => {
    const pane = createArtifactPane(makeConfig({ loading: false }), { onSelect: () => {} });
    pane.setVisible(false);
    // Still streaming when the pane opens.
    pane.update({
      artifacts: [fileRecord({ status: "streaming", markdown: "```html\n<h1>hi" })],
      selectedId: "a1",
    });
    pane.setVisible(true);
    // Streaming → raw source, no iframe yet.
    expect(contentEl(pane).querySelector("iframe")).toBeNull();
    expect(contentEl(pane).querySelector("pre")?.textContent).toBe("<h1>hi");

    // Continues receiving updates while visible; completion swaps to the iframe.
    pane.update({ artifacts: [fileRecord()], selectedId: "a1" });
    expect(contentEl(pane).querySelector("pre")).toBeNull();
    expect(contentEl(pane).querySelector("iframe.persona-artifact-iframe")).toBeTruthy();
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

  it("drops the content padding (flush class) in source view and restores it when rendered", () => {
    const pane = createArtifactPane(makeConfig(), { onSelect: () => {} });
    pane.update({ artifacts: [fileRecord()], selectedId: "a1" });

    const content = contentEl(pane);
    // Rendered view (iframe): padded as usual.
    expect(content.classList.contains("persona-artifact-content-flush")).toBe(false);

    toggleBtn(pane, "Source").click();
    expect(content.classList.contains("persona-artifact-content-flush")).toBe(true);

    toggleBtn(pane, "Rendered view").click();
    expect(content.classList.contains("persona-artifact-content-flush")).toBe(false);
  });
});

describe("artifact-pane default toolbar", () => {
  it("renders an icon-button Close control labelled for the panel", () => {
    const pane = createArtifactPane(makeConfig(), { onSelect: () => {} });
    pane.update({ artifacts: [fileRecord()], selectedId: "a1" });

    const close = toggleBtn(pane, "Close artifacts panel");
    expect(close).toBeTruthy();
    expect(close.tagName).toBe("BUTTON");
    expect(close.classList.contains("persona-icon-btn")).toBe(true);
    expect(close.querySelector("svg")).toBeTruthy();
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

const makeCopyButtonConfig = (): AgentWidgetConfig =>
  ({
    sanitize: false,
    features: { artifacts: { enabled: true, layout: { showCopyButton: true } } },
  }) as AgentWidgetConfig;

const copyBtnOf = (
  pane: ReturnType<typeof createArtifactPane>
): HTMLButtonElement | null =>
  pane.element.querySelector('[aria-label="Copy"]') as HTMLButtonElement | null;

describe("artifact-pane default-toolbar copy button", () => {
  it("hides the copy button by default", () => {
    // Like the expand toggle, the button is always built (so a live config
    // update can reveal it via setCopyButtonVisible) but starts hidden
    // without layout.showCopyButton.
    const pane = createArtifactPane(makeConfig(), { onSelect: () => {} });
    pane.update({ artifacts: [fileRecord()], selectedId: "a1" });
    expect(copyBtnOf(pane)!.classList.contains("persona-hidden")).toBe(true);
  });

  it("renders the copy button when layout.showCopyButton is true", () => {
    const pane = createArtifactPane(makeCopyButtonConfig(), { onSelect: () => {} });
    pane.update({ artifacts: [fileRecord()], selectedId: "a1" });
    const btn = copyBtnOf(pane);
    expect(btn).toBeTruthy();
    expect(btn!.classList.contains("persona-hidden")).toBe(false);
    expect(btn!.querySelector("svg")).toBeTruthy();
  });

  it("setCopyButtonVisible reveals and re-hides the button", () => {
    const pane = createArtifactPane(makeConfig(), { onSelect: () => {} });
    pane.update({ artifacts: [fileRecord()], selectedId: "a1" });
    pane.setCopyButtonVisible(true);
    expect(copyBtnOf(pane)!.classList.contains("persona-hidden")).toBe(false);
    pane.setCopyButtonVisible(false);
    expect(copyBtnOf(pane)!.classList.contains("persona-hidden")).toBe(true);
  });
});

const makeToolbarActionsConfig = (
  actions: PersonaArtifactCustomAction[]
): AgentWidgetConfig =>
  ({
    sanitize: false,
    features: { artifacts: { enabled: true, toolbarActions: actions } },
  }) as AgentWidgetConfig;

const customActionsContainer = (
  pane: ReturnType<typeof createArtifactPane>
): HTMLElement =>
  pane.element.querySelector(
    ".persona-artifact-toolbar-custom-actions"
  ) as HTMLElement;

const customActionBtns = (
  pane: ReturnType<typeof createArtifactPane>
): HTMLButtonElement[] =>
  Array.from(
    pane.element.querySelectorAll(".persona-artifact-custom-action-btn")
  ) as HTMLButtonElement[];

const markdownRecord = (
  overrides: Partial<PersonaArtifactRecord> = {}
): PersonaArtifactRecord => ({
  id: "a1",
  artifactType: "markdown",
  title: "Doc",
  status: "complete",
  markdown: "# Hi",
  ...overrides,
});

describe("artifact-pane toolbar custom actions", () => {
  it("renders no custom-action buttons by default", () => {
    const pane = createArtifactPane(makeConfig(), { onSelect: () => {} });
    pane.update({ artifacts: [markdownRecord()], selectedId: "a1" });
    // The host container is always built, but stays empty without config.
    expect(customActionsContainer(pane)).toBeTruthy();
    expect(customActionBtns(pane).length).toBe(0);
  });

  it("renders a toolbar action and invokes onClick with the selected record's context", () => {
    const onClick = vi.fn();
    const pane = createArtifactPane(
      makeToolbarActionsConfig([
        { id: "save", label: "Save to Drive", icon: "star", onClick },
      ]),
      { onSelect: () => {} }
    );
    pane.update({
      artifacts: [markdownRecord({ markdown: "# Report" })],
      selectedId: "a1",
    });

    const btn = customActionsContainer(pane).querySelector(
      ".persona-artifact-custom-action-btn"
    ) as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.getAttribute("aria-label")).toBe("Save to Drive");
    expect(btn.querySelector("svg")).toBeTruthy();

    btn.click();
    expect(onClick).toHaveBeenCalledTimes(1);
    const ctx = onClick.mock.calls[0][0];
    expect(ctx.artifactId).toBe("a1");
    expect(ctx.markdown).toBe("# Report");
  });

  it("renders a factory icon element verbatim inside the button", () => {
    const custom = document.createElement("span");
    custom.className = "my-brand-icon";
    const pane = createArtifactPane(
      makeToolbarActionsConfig([
        { id: "brand", label: "Brand", icon: () => custom, onClick: () => {} },
      ]),
      { onSelect: () => {} }
    );
    pane.update({ artifacts: [markdownRecord()], selectedId: "a1" });
    const btn = customActionBtns(pane)[0];
    expect(btn).toBeTruthy();
    // The exact author-provided element is slotted in, not a copy.
    expect(btn.querySelector(".my-brand-icon")).toBe(custom);
  });

  it("gates a button with visible(ctx) on the selected record", () => {
    const action: PersonaArtifactCustomAction = {
      id: "file-only",
      label: "File only",
      icon: "star",
      visible: (ctx) => Boolean(ctx.file),
      onClick: () => {},
    };
    const pane = createArtifactPane(makeToolbarActionsConfig([action]), {
      onSelect: () => {},
    });

    // File artifact: ctx.file is set, so the button renders.
    pane.update({ artifacts: [fileRecord()], selectedId: "a1" });
    expect(customActionBtns(pane).length).toBe(1);

    // Plain markdown artifact: no file, so the gate hides the button.
    pane.update({ artifacts: [markdownRecord({ id: "m1" })], selectedId: "m1" });
    expect(customActionBtns(pane).length).toBe(0);
  });

  it("setCustomActions removes and re-adds buttons (live config update)", () => {
    const action: PersonaArtifactCustomAction = {
      id: "save",
      label: "Save",
      icon: "star",
      onClick: () => {},
    };
    const pane = createArtifactPane(makeToolbarActionsConfig([action]), {
      onSelect: () => {},
    });
    pane.update({ artifacts: [markdownRecord()], selectedId: "a1" });
    expect(customActionBtns(pane).length).toBe(1);

    pane.setCustomActions([]);
    expect(customActionBtns(pane).length).toBe(0);

    pane.setCustomActions([action]);
    expect(customActionBtns(pane).length).toBe(1);
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
