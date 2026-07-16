// @vitest-environment jsdom

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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

    const close = toggleBtn(pane, "Close");
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

const listIn = (pane: ReturnType<typeof createArtifactPane>): HTMLElement =>
  pane.element.querySelector(".persona-artifact-list") as HTMLElement;

const setGeom = (el: HTMLElement, scrollWidth: number, clientWidth: number, scrollLeft: number) => {
  Object.defineProperty(el, "scrollWidth", { configurable: true, value: scrollWidth });
  Object.defineProperty(el, "clientWidth", { configurable: true, value: clientWidth });
  Object.defineProperty(el, "scrollLeft", { configurable: true, writable: true, value: scrollLeft });
};

const twoFileRecords = (): PersonaArtifactRecord[] => [
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
];

describe("artifact-pane tab edge fade", () => {
  beforeEach(() => {
    // Run the rAF-throttled scroll recompute synchronously for determinism.
    vi.stubGlobal("requestAnimationFrame", (cb: (time: number) => void) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the end fade only when scrolled to the start of an overflowing strip", () => {
    const pane = createArtifactPane(makeConfig(), { onSelect: () => {} });
    const list = listIn(pane);
    setGeom(list, 400, 200, 0);
    pane.update({ artifacts: twoFileRecords(), selectedId: "a1" });
    expect(list.classList.contains("persona-artifact-tab-fade-end")).toBe(true);
    expect(list.classList.contains("persona-artifact-tab-fade-start")).toBe(false);
  });

  it("shows both fades mid-scroll", () => {
    const pane = createArtifactPane(makeConfig(), { onSelect: () => {} });
    const list = listIn(pane);
    setGeom(list, 400, 200, 0);
    pane.update({ artifacts: twoFileRecords(), selectedId: "a1" });
    setGeom(list, 400, 200, 100);
    list.dispatchEvent(new Event("scroll"));
    expect(list.classList.contains("persona-artifact-tab-fade-start")).toBe(true);
    expect(list.classList.contains("persona-artifact-tab-fade-end")).toBe(true);
  });

  it("shows the start fade only at the end of the scroll", () => {
    const pane = createArtifactPane(makeConfig(), { onSelect: () => {} });
    const list = listIn(pane);
    setGeom(list, 400, 200, 0);
    pane.update({ artifacts: twoFileRecords(), selectedId: "a1" });
    setGeom(list, 400, 200, 200);
    list.dispatchEvent(new Event("scroll"));
    expect(list.classList.contains("persona-artifact-tab-fade-start")).toBe(true);
    expect(list.classList.contains("persona-artifact-tab-fade-end")).toBe(false);
  });

  it("shows neither fade when the strip does not overflow", () => {
    const pane = createArtifactPane(makeConfig(), { onSelect: () => {} });
    const list = listIn(pane);
    setGeom(list, 200, 200, 0);
    pane.update({ artifacts: twoFileRecords(), selectedId: "a1" });
    expect(list.classList.contains("persona-artifact-tab-fade-start")).toBe(false);
    expect(list.classList.contains("persona-artifact-tab-fade-end")).toBe(false);
  });
});

const fadeConfig = (tabFade: boolean | { start?: boolean; end?: boolean }): AgentWidgetConfig =>
  ({
    sanitize: false,
    features: { artifacts: { enabled: true, layout: { tabFade } } },
  }) as AgentWidgetConfig;

describe("artifact-pane tabFade / tabFadeSize config", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (cb: (time: number) => void) => {
      cb(0);
      return 0;
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("never adds either fade class when tabFade is false", () => {
    const pane = createArtifactPane(fadeConfig(false), { onSelect: () => {} });
    const list = listIn(pane);
    setGeom(list, 400, 200, 0);
    pane.update({ artifacts: twoFileRecords(), selectedId: "a1" });
    expect(list.classList.contains("persona-artifact-tab-fade-start")).toBe(false);
    expect(list.classList.contains("persona-artifact-tab-fade-end")).toBe(false);
    // Still false after a mid-scroll where the default config would show both.
    setGeom(list, 400, 200, 100);
    list.dispatchEvent(new Event("scroll"));
    expect(list.classList.contains("persona-artifact-tab-fade-start")).toBe(false);
    expect(list.classList.contains("persona-artifact-tab-fade-end")).toBe(false);
  });

  it("gates only the start edge when tabFade.start is false", () => {
    const pane = createArtifactPane(fadeConfig({ start: false }), { onSelect: () => {} });
    const list = listIn(pane);
    // Mid-scroll: default would show both, but start is disabled.
    setGeom(list, 400, 200, 100);
    pane.update({ artifacts: twoFileRecords(), selectedId: "a1" });
    list.dispatchEvent(new Event("scroll"));
    expect(list.classList.contains("persona-artifact-tab-fade-start")).toBe(false);
    expect(list.classList.contains("persona-artifact-tab-fade-end")).toBe(true);
    // At the far end the end fade also drops; start stays off.
    setGeom(list, 400, 200, 200);
    list.dispatchEvent(new Event("scroll"));
    expect(list.classList.contains("persona-artifact-tab-fade-start")).toBe(false);
    expect(list.classList.contains("persona-artifact-tab-fade-end")).toBe(false);
  });

  it("sets --persona-artifact-tab-fade-size from tabFadeSize", () => {
    const pane = createArtifactPane(
      {
        sanitize: false,
        features: { artifacts: { enabled: true, layout: { tabFadeSize: "32px" } } },
      } as AgentWidgetConfig,
      { onSelect: () => {} }
    );
    const list = listIn(pane);
    expect(list.style.getPropertyValue("--persona-artifact-tab-fade-size")).toBe("32px");
  });
});

describe("artifact-pane renderTabBar hook", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  const renderBarConfig = (
    renderTabBar: NonNullable<
      NonNullable<AgentWidgetConfig["features"]>["artifacts"]
    >["renderTabBar"]
  ): AgentWidgetConfig =>
    ({
      sanitize: false,
      features: { artifacts: { enabled: true, renderTabBar } },
    }) as AgentWidgetConfig;

  it("hides the built-in list and mounts the custom bar between toolbar and content", () => {
    const bar = document.createElement("nav");
    bar.className = "my-custom-bar";
    const pane = createArtifactPane(renderBarConfig(() => bar), { onSelect: () => {} });
    pane.update({ artifacts: twoFileRecords(), selectedId: "a1" });

    // Built-in strip exists but is hidden; the custom mount is shown.
    const list = pane.element.querySelector(".persona-artifact-list") as HTMLElement;
    expect(list.classList.contains("persona-hidden")).toBe(true);
    // The custom bar is mounted inside the stable host.
    const mount = pane.element.querySelector(".persona-artifact-tab-custom") as HTMLElement;
    expect(mount).toBeTruthy();
    expect(mount.classList.contains("persona-hidden")).toBe(false);
    expect(mount.querySelector(".my-custom-bar")).toBe(bar);
    // Order: toolbar, then the bar mount, then content.
    const toolbar = pane.element.querySelector(".persona-artifact-toolbar");
    const content = pane.element.querySelector(".persona-artifact-content");
    const children = Array.from(pane.element.children);
    expect(children.indexOf(toolbar as Element)).toBeLessThan(children.indexOf(mount));
    expect(children.indexOf(mount)).toBeLessThan(children.indexOf(content as Element));
  });

  it("routes selection from the custom bar through onSelect", () => {
    const selected: string[] = [];
    const pane = createArtifactPane(
      renderBarConfig((ctx) => {
        const bar = document.createElement("div");
        for (const r of ctx.records) {
          const b = document.createElement("button");
          b.textContent = r.id;
          b.addEventListener("click", () => ctx.onSelect(r.id));
          bar.appendChild(b);
        }
        return bar;
      }),
      { onSelect: (id) => selected.push(id) }
    );
    pane.update({ artifacts: twoFileRecords(), selectedId: "a1" });

    const mount = pane.element.querySelector(".persona-artifact-tab-custom") as HTMLElement;
    const btns = Array.from(mount.querySelectorAll("button")) as HTMLButtonElement[];
    btns[1].click();
    expect(selected[selected.length - 1]).toBe("a2");
  });

  it("re-invokes the hook when records change but not on an identical re-render", () => {
    let calls = 0;
    const pane = createArtifactPane(
      renderBarConfig((ctx) => {
        calls += 1;
        const bar = document.createElement("div");
        bar.textContent = ctx.records.map((r) => r.id).join(",");
        return bar;
      }),
      { onSelect: () => {} }
    );

    const [a1, a2] = twoFileRecords();
    pane.update({ artifacts: [a1], selectedId: "a1" });
    expect(calls).toBe(1);

    // Identical re-render: same ids + selection, so the signature gate skips it.
    pane.update({ artifacts: [a1], selectedId: "a1" });
    expect(calls).toBe(1);

    // Records changed: the hook re-runs.
    pane.update({ artifacts: [a1, a2], selectedId: "a2" });
    expect(calls).toBe(2);
  });

  it("swaps between the built-in strip and a custom bar via setRenderTabBar", () => {
    // Starts on the built-in strip (no renderTabBar in config).
    const pane = createArtifactPane(makeConfig(), { onSelect: () => {} });
    pane.update({ artifacts: twoFileRecords(), selectedId: "a1" });
    const list = pane.element.querySelector(".persona-artifact-list") as HTMLElement;
    const mount = pane.element.querySelector(".persona-artifact-tab-custom") as HTMLElement;
    expect(list.classList.contains("persona-hidden")).toBe(false);
    expect(mount.classList.contains("persona-hidden")).toBe(true);

    // Live switch to a custom bar: strip hides, custom mount shows and populates.
    const bar = document.createElement("nav");
    bar.className = "swapped-bar";
    pane.setRenderTabBar(() => bar);
    expect(list.classList.contains("persona-hidden")).toBe(true);
    expect(mount.classList.contains("persona-hidden")).toBe(false);
    expect(mount.querySelector(".swapped-bar")).toBe(bar);

    // Live switch back to the built-in strip.
    pane.setRenderTabBar(undefined);
    expect(list.classList.contains("persona-hidden")).toBe(false);
    expect(mount.classList.contains("persona-hidden")).toBe(true);
  });
});

describe("artifact-pane tablist accessibility", () => {
  it("exposes the strip as a tablist with role=tab and aria-selected per tab", () => {
    const pane = createArtifactPane(makeConfig(), { onSelect: () => {} });
    pane.update({ artifacts: twoFileRecords(), selectedId: "a2" });
    expect(listIn(pane).getAttribute("role")).toBe("tablist");
    const tabs = tabsIn(pane);
    expect(tabs.every((t) => t.getAttribute("role") === "tab")).toBe(true);
    expect(tabs[0].getAttribute("aria-selected")).toBe("false");
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
  });

  it("keeps a single roving tab stop on the selected tab", () => {
    const pane = createArtifactPane(makeConfig(), { onSelect: () => {} });
    pane.update({ artifacts: twoFileRecords(), selectedId: "a2" });
    const tabs = tabsIn(pane);
    expect(tabs.filter((t) => t.tabIndex === 0).length).toBe(1);
    expect(tabs[1].tabIndex).toBe(0);
    expect(tabs[0].tabIndex).toBe(-1);
  });

  it("moves selection with Arrow, Home and End keys via onSelect", () => {
    const selected: string[] = [];
    const pane = createArtifactPane(makeConfig(), {
      onSelect: (id) => selected.push(id),
    });
    pane.update({ artifacts: twoFileRecords(), selectedId: "a1" });
    const tabs = tabsIn(pane);

    tabs[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(selected[selected.length - 1]).toBe("a2");

    tabs[1].dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    expect(selected[selected.length - 1]).toBe("a1");

    tabs[0].dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    expect(selected[selected.length - 1]).toBe("a2");
  });

  it("keeps keyboard focus on the newly selected tab across the selection re-render", () => {
    // The host re-renders the strip on selection (update -> render ->
    // replaceChildren). Focus must land on the new selected tab or arrow nav
    // dies after one press.
    let selectedId = "a1";
    const pane = createArtifactPane(makeConfig(), {
      onSelect: (id) => {
        selectedId = id;
        pane.update({ artifacts: twoFileRecords(), selectedId });
      },
    });
    document.body.appendChild(pane.element);
    pane.update({ artifacts: twoFileRecords(), selectedId });

    const first = tabsIn(pane)[0];
    first.focus();
    expect(document.activeElement).toBe(first);

    first.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));

    const after = tabsIn(pane);
    expect(after[1].getAttribute("aria-selected")).toBe("true");
    // Focus survived the rebuild and moved to the new selected tab, so a second
    // arrow keeps working.
    expect(document.activeElement).toBe(after[1]);
  });
});
