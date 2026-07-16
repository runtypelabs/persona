import "@runtypelabs/persona/widget.css";

import {
  initAgentWidget,
  componentRegistry,
  markdownPostprocessor,
  createRovingTablist,
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetConfig,
  type ComponentRenderer,
  type AgentWidgetInitHandle,
  type PersonaArtifactRecord,
  type PersonaArtifactStatusLabelContext,
} from "@runtypelabs/persona";
import {
  createDemoConfigInspector,
  reportDemoConfig,
} from "./demo-config-inspector";
import { renderDemoScaffold } from "./demo-scaffold";
import {
  setupMountMode,
  renderInlineMount,
  renderLauncherScene,
  squareInlinePanel,
  type Mode,
} from "./mount-mode";
import { createArtifactDemoStream, type ArtifactDemoButton } from "./artifact-demo-sse";

renderDemoScaffold({ slug: "artifact-demo" });

const ArtifactDemoPill: ComponentRenderer = (props) => {
  const el = document.createElement("div");
  el.textContent = String(props.label ?? "Demo pill");
  el.style.cssText =
    "display:inline-block;padding:0.35rem 0.75rem;border-radius:999px;background:#0ea5e9;color:#0c1222;font-weight:600;font-size:0.9rem;";
  return el;
};

componentRegistry.register("ArtifactDemoPill", ArtifactDemoPill);

const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const proxyUrl =
  import.meta.env.VITE_PROXY_URL
    ? `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch`
    : `http://localhost:${proxyPort}/api/chat/dispatch`;

const artifactDemoConfigBase: Partial<AgentWidgetConfig> = {
  ...DEFAULT_WIDGET_CONFIG,
  apiUrl: proxyUrl,
  postprocessMessage: ({ text }) => markdownPostprocessor(text),
  features: {
    showEventStreamToggle: true,
    artifacts: {
      enabled: true,
      allowedTypes: ["markdown", "component"],
    },
  },
  copy: {
    ...DEFAULT_WIDGET_CONFIG.copy,
    welcomeTitle: "Artifacts demo",
    welcomeSubtitle:
      "Use the artifact buttons to replay a scripted agent turn. Each button streams the real artifact wire frames, rendered per the selected display mode (panel, card, or inline).",
    inputPlaceholder: "Message the model…",
  },
  suggestionChips: [],
};

const configInspector = createDemoConfigInspector({
  title: "Artifact Sidebar",
  root: "[data-config-inspector]",
});

// ── Card loading animation controls ─────────────────────────────────────
// The rail lets visitors pick the animation for the reference card's
// "Generating…" status (features.artifacts.loadingAnimation & friends). The
// values live in the DOM controls, and buildArtifactsFeature() reads them each
// time a config is built, so both the initial mount, a mode re-mount, and a
// live handle.update() all see the current selection.
type ArtifactAnimationMode =
  | "none"
  | "pulse"
  | "shimmer"
  | "shimmer-color"
  | "rainbow";

const ANIMATION_DEFAULTS = {
  mode: "shimmer" as ArtifactAnimationMode,
  duration: 2000,
  primary: "#0ea5e9",
  secondary: "#3b82f6",
};

const getEl = <T extends HTMLElement>(id: string): T | null =>
  document.getElementById(id) as T | null;

// ── Display mode control ────────────────────────────────────────────────
// Same DOM-is-the-source-of-truth pattern as the animation controls: the
// active pill in #artifact-display-mode is read on every config build, so the
// selection survives mount-mode re-mounts and applies via handle.update().
type ArtifactDisplayMode = "panel" | "card" | "inline";

const DISPLAY_DEFAULT: ArtifactDisplayMode = "panel";

const readDisplayMode = (): ArtifactDisplayMode => {
  const activeBtn = document.querySelector<HTMLButtonElement>(
    "#artifact-display-mode .mode-btn.active",
  );
  return (activeBtn?.dataset.mode ?? DISPLAY_DEFAULT) as ArtifactDisplayMode;
};

// Same DOM-is-the-source-of-truth pattern: the active pill in
// #artifact-expand-toggle is read on every config build. Off (the default)
// omits showExpandToggle from the layout block; On sends it as true.
const readExpandToggle = (): boolean => {
  const activeBtn = document.querySelector<HTMLButtonElement>(
    "#artifact-expand-toggle .mode-btn.active",
  );
  return activeBtn?.dataset.mode === "on";
};

// Same DOM-is-the-source-of-truth pattern: the active pill in
// #artifact-resizable is read on every config build. Off (the default)
// omits resizable from the layout block; On sends it as true.
const readResizable = (): boolean => {
  const activeBtn = document.querySelector<HTMLButtonElement>(
    "#artifact-resizable .mode-btn.active",
  );
  return activeBtn?.dataset.mode === "on";
};

// Same DOM-is-the-source-of-truth pattern: the active pill in
// #artifact-pane-appearance is read on every config build. Panel (the default)
// omits paneAppearance from the layout block; Seamless sends the flush recipe.
const readPaneAppearance = (): "panel" | "seamless" => {
  const activeBtn = document.querySelector<HTMLButtonElement>(
    "#artifact-pane-appearance .mode-btn.active",
  );
  return activeBtn?.dataset.mode === "seamless" ? "seamless" : "panel";
};

// Same DOM-is-the-source-of-truth pattern: the active pill in
// #artifact-tab-overflow selects which tab bar the pane renders. Scroll (the
// default) leaves renderTabBar unset so the built-in strip renders; Buttons and
// Menu each swap in a custom bar via features.artifacts.renderTabBar.
const readTabOverflow = (): "scroll" | "buttons" | "menu" => {
  const activeBtn = document.querySelector<HTMLButtonElement>(
    "#artifact-tab-overflow .mode-btn.active",
  );
  return (activeBtn?.dataset.mode ?? "scroll") as "scroll" | "buttons" | "menu";
};

// Same DOM-is-the-source-of-truth pattern: the active pill in #artifact-tab-fade
// is read on every config build. On (the default) omits tabFade; Off sends false.
const readTabFade = (): boolean => {
  const activeBtn = document.querySelector<HTMLButtonElement>(
    "#artifact-tab-fade .mode-btn.active",
  );
  return activeBtn?.dataset.mode !== "off";
};

// ── Custom tab bars (features.artifacts.renderTabBar) ────────────────────
// Reference implementations hosts copy. renderTabBar is re-invoked whenever the
// records or selection change and must return a FRESH element each time; the
// pane replaces the previous bar wholesale, so per-invocation listeners never
// leak. createRovingTablist supplies the WAI-ARIA tablist behavior (roles,
// aria-selected, roving tabindex, Arrow/Home/End, focus survives rebuild) so we
// do not re-implement keyboard accessibility. The bars mount inside the pane, so
// persona- utility classes and theme variables apply; controls align to the
// pane's ~8px toolbar inset.
type TabBarContext = {
  records: PersonaArtifactRecord[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};
type TabBarRenderer = (ctx: TabBarContext) => HTMLElement;

// Basename for file tabs (title stays the full path); mirrors the built-in strip.
const tabLabelOf = (
  r: PersonaArtifactRecord,
): { label: string; tooltip: string } => {
  const fileMeta = r.artifactType === "markdown" ? r.file : undefined;
  const label = fileMeta
    ? fileMeta.path.split("/").pop() || fileMeta.path
    : r.title || r.id.slice(0, 8);
  const tooltip = fileMeta?.path || r.title || label;
  return { label, tooltip };
};

// One tab <button> per record, styled with the same persona- utility classes as
// the built-in strip so the custom bars match the pane theme.
const buildTabButton = (
  r: PersonaArtifactRecord,
  active: boolean,
): HTMLButtonElement => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className =
    "persona-artifact-tab persona-shrink-0 persona-rounded-lg persona-px-2 persona-py-1 persona-text-xs persona-border persona-border-transparent persona-text-persona-primary";
  const { label, tooltip } = tabLabelOf(r);
  btn.textContent = label;
  btn.title = tooltip;
  btn.setAttribute("aria-label", tooltip);
  if (active) {
    btn.classList.add("persona-bg-persona-container", "persona-border-persona-border");
  }
  return btn;
};

// Build a scrollable strip filled with tab buttons and wire the roving tablist.
const buildTabStrip = (ctx: TabBarContext): HTMLElement => {
  const strip = document.createElement("div");
  // Own layout: horizontal scroll, no wrap, hidden native scrollbar (the bar
  // provides its own overflow affordance).
  strip.style.cssText =
    "display:flex;gap:4px;overflow-x:auto;flex:1;min-width:0;scrollbar-width:none;scroll-behavior:smooth;";
  const tablist = createRovingTablist(strip, {
    onSelect: (i) => ctx.onSelect(ctx.records[i].id),
  });
  // beforeRender() snapshots focus so the controller restores the roving stop
  // after we replace the tab DOM (keyboard nav dies otherwise).
  tablist.beforeRender();
  const tabEls: HTMLElement[] = [];
  let selectedIndex = -1;
  ctx.records.forEach((r, index) => {
    const active = r.id === ctx.selectedId;
    if (active) selectedIndex = index;
    const btn = buildTabButton(r, active);
    // The controller handles keyboard selection; pointer selection is ours.
    btn.addEventListener("click", () => ctx.onSelect(r.id));
    strip.appendChild(btn);
    tabEls.push(btn);
  });
  tablist.render(tabEls, selectedIndex);
  return strip;
};

// A chevron scroll button; hidden until its edge overflows.
const createChevron = (dir: "left" | "right"): HTMLButtonElement => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute(
    "aria-label",
    dir === "left" ? "Scroll tabs left" : "Scroll tabs right",
  );
  btn.textContent = dir === "left" ? "‹" : "›";
  btn.style.cssText =
    "display:none;align-items:center;justify-content:center;flex:0 0 auto;width:24px;height:24px;font-size:18px;line-height:1;border:none;border-radius:6px;background:transparent;color:var(--persona-primary,inherit);cursor:pointer;";
  return btn;
};

// Buttons bar: [chevron-left][scrollable strip][chevron-right]. The chevrons
// scroll the strip by ~80% of its visible width and only appear when that edge
// has hidden tabs.
const createButtonsTabBar: TabBarRenderer = (ctx) => {
  const bar = document.createElement("div");
  // Match the built-in strip's persona-p-2 (8px all sides) so tabs and chevrons
  // align with the toolbar controls above.
  bar.style.cssText =
    "display:flex;align-items:center;gap:4px;padding:8px;min-width:0;";

  const leftBtn = createChevron("left");
  const rightBtn = createChevron("right");
  const strip = buildTabStrip(ctx);

  const updateChevrons = (): void => {
    const maxScroll = strip.scrollWidth - strip.clientWidth;
    const overflowing = maxScroll > 1;
    const atStart = strip.scrollLeft <= 1;
    const atEnd = strip.scrollLeft >= maxScroll - 1;
    leftBtn.style.display = overflowing && !atStart ? "flex" : "none";
    rightBtn.style.display = overflowing && !atEnd ? "flex" : "none";
    // Optional edge fade: mask whichever side still has hidden tabs.
    const left = overflowing && !atStart ? "transparent" : "#000";
    const right = overflowing && !atEnd ? "transparent" : "#000";
    strip.style.maskImage = `linear-gradient(to right, ${left} 0, #000 16px, #000 calc(100% - 16px), ${right} 100%)`;
  };
  const scrollStep = (dir: number): void => {
    strip.scrollBy({ left: dir * strip.clientWidth * 0.8, behavior: "smooth" });
  };
  leftBtn.addEventListener("click", () => scrollStep(-1));
  rightBtn.addEventListener("click", () => scrollStep(1));
  strip.addEventListener("scroll", updateChevrons);
  // Measure after the bar is in the DOM.
  requestAnimationFrame(updateChevrons);

  bar.append(leftBtn, strip, rightBtn);
  return bar;
};

// Menu item styles. Hover/focus need real CSS pseudo-classes (inline styles
// cannot express :hover, and a JS mouseenter approach misses keyboard focus), so
// the bar carries its own scoped <style>. Co-located in the bar so it resolves
// even when the widget renders inside a shadow root.
const MENU_ITEM_CSS = `
.demo-tab-menu-item {
  display:block; width:100%; text-align:left; padding:6px 8px;
  border:none; border-radius:6px; font-size:12px; background:transparent;
  color:var(--persona-primary, inherit); cursor:pointer;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  transition:background 0.12s ease;
}
.demo-tab-menu-item:hover,
.demo-tab-menu-item:focus-visible {
  background:var(--persona-artifact-tab-hover-bg, #f3f4f6); outline:none;
}
.demo-tab-menu-item[aria-current="true"] {
  background:var(--persona-artifact-tab-hover-bg, #f3f4f6); font-weight:600;
}`;

// Menu bar: the scrollable strip plus a trailing "more" button that opens a
// dropdown listing every artifact by basename. Kept intentionally simple: a
// jump-list of ALL artifacts. A host could instead show only the overflowing
// tabs with a "+N" count.
const createMenuTabBar: TabBarRenderer = (ctx) => {
  const bar = document.createElement("div");
  // Match the built-in strip's persona-p-2 (8px all sides) so tabs and the menu
  // button align with the toolbar controls above.
  bar.style.cssText =
    "display:flex;align-items:center;gap:4px;padding:8px;min-width:0;position:relative;";

  const strip = buildTabStrip(ctx);

  // Icon-only "more" button; aria-label carries the accessible name since the
  // glyph alone conveys nothing to a screen reader.
  const menuBtn = document.createElement("button");
  menuBtn.type = "button";
  menuBtn.setAttribute("aria-haspopup", "true");
  menuBtn.setAttribute("aria-expanded", "false");
  menuBtn.setAttribute("aria-label", "All artifacts");
  menuBtn.textContent = "⋯";
  menuBtn.style.cssText =
    "display:flex;align-items:center;justify-content:center;flex:0 0 auto;width:24px;height:24px;font-size:18px;line-height:1;border:none;border-radius:6px;background:transparent;color:var(--persona-primary,inherit);cursor:pointer;";

  const menu = document.createElement("div");
  menu.setAttribute("role", "menu");
  menu.style.cssText =
    "position:absolute;top:100%;right:8px;z-index:20;display:none;flex-direction:column;min-width:180px;max-height:280px;overflow-y:auto;padding:4px;background:var(--persona-surface,#fff);border:1px solid var(--persona-border,#e5e7eb);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.12);";

  const onDocClick = (e: MouseEvent): void => {
    if (!bar.contains(e.target as Node)) closeMenu();
  };
  // The artifact preview is a sandboxed iframe: clicks inside it never reach the
  // parent document, so a document click listener alone can't dismiss the menu
  // when the user clicks the preview. Focus moving into the iframe blurs the top
  // window, so close on window blur too. Escape closes and restores focus.
  const onWinBlur = (): void => closeMenu();
  const onKeydown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      closeMenu();
      menuBtn.focus();
    }
  };
  const closeMenu = (): void => {
    menu.style.display = "none";
    menuBtn.setAttribute("aria-expanded", "false");
    document.removeEventListener("click", onDocClick, true);
    window.removeEventListener("blur", onWinBlur);
    document.removeEventListener("keydown", onKeydown);
  };
  const openMenu = (): void => {
    menu.style.display = "flex";
    menuBtn.setAttribute("aria-expanded", "true");
    document.addEventListener("click", onDocClick, true);
    window.addEventListener("blur", onWinBlur);
    document.addEventListener("keydown", onKeydown);
  };
  menuBtn.addEventListener("click", () => {
    if (menu.style.display === "none") openMenu();
    else closeMenu();
  });

  ctx.records.forEach((r) => {
    const active = r.id === ctx.selectedId;
    const item = document.createElement("button");
    item.type = "button";
    item.setAttribute("role", "menuitem");
    item.className = "demo-tab-menu-item";
    if (active) item.setAttribute("aria-current", "true");
    const { label, tooltip } = tabLabelOf(r);
    item.textContent = label;
    item.title = tooltip;
    item.addEventListener("click", () => {
      ctx.onSelect(r.id);
      closeMenu();
    });
    menu.appendChild(item);
  });

  const style = document.createElement("style");
  style.textContent = MENU_ITEM_CSS;
  bar.append(strip, menuBtn, menu, style);
  return bar;
};

// Select the custom bar for the current overflow mode; Scroll returns undefined
// so the pane keeps its built-in strip.
const buildTabBar = (): TabBarRenderer | undefined => {
  const mode = readTabOverflow();
  if (mode === "buttons") return createButtonsTabBar;
  if (mode === "menu") return createMenuTabBar;
  return undefined;
};

// Same DOM-is-the-source-of-truth pattern: the active pill in
// #artifact-custom-actions is read on every config build. Off (the default)
// omits the actions entirely; On spreads in the sample toolbar/card/inline actions.
const readCustomActions = (): boolean => {
  const activeBtn = document.querySelector<HTMLButtonElement>(
    "#artifact-custom-actions .mode-btn.active",
  );
  return activeBtn?.dataset.mode === "on";
};

// Same DOM-is-the-source-of-truth pattern: the active pill in
// #artifact-inline-chrome is read on every config build. On (the default) keeps
// the inline file-preview chrome; Off sends inlineChrome: false for a bare body.
const readInlineChrome = (): boolean => {
  const activeBtn = document.querySelector<HTMLButtonElement>(
    "#artifact-inline-chrome .mode-btn.active",
  );
  return activeBtn?.dataset.mode !== "off";
};

// ── Streaming body controls (inline display mode only) ───────────────────
// Same DOM-is-the-source-of-truth pattern as the other rail controls: the
// active pill in each #artifact-* group is read on every config build, so the
// selection survives mount-mode re-mounts and applies via handle.update().
// Together they populate features.artifacts.inlineBody, which only affects
// display: "inline".
const readStreamingView = (): "source" | "status" => {
  const activeBtn = document.querySelector<HTMLButtonElement>(
    "#artifact-streaming-view .mode-btn.active",
  );
  return (activeBtn?.dataset.mode ?? "source") as "source" | "status";
};

// 320 (default) reserves a fixed-height scroll window; "auto" grows with
// content; "split" pins a fixed streaming height then lets the completed
// iframe grow (streaming 320 / complete auto).
const readBodyHeight = ():
  | number
  | "auto"
  | { streaming: number; complete: "auto" } => {
  const activeBtn = document.querySelector<HTMLButtonElement>(
    "#artifact-body-height .mode-btn.active",
  );
  const mode = activeBtn?.dataset.mode ?? "320";
  if (mode === "auto") return "auto";
  if (mode === "split") return { streaming: 320, complete: "auto" };
  return 320;
};

// both (default) → true (top and bottom); top → { top: true }; off → false.
const readFadeMask = (): boolean | { top: boolean } => {
  const activeBtn = document.querySelector<HTMLButtonElement>(
    "#artifact-fade-mask .mode-btn.active",
  );
  const mode = activeBtn?.dataset.mode ?? "both";
  if (mode === "top") return { top: true };
  if (mode === "off") return false;
  return true;
};

const readFollowOutput = (): boolean => {
  const activeBtn = document.querySelector<HTMLButtonElement>(
    "#artifact-follow-output .mode-btn.active",
  );
  return activeBtn?.dataset.mode !== "off";
};

// scroll (default) → tail-following scroll window; clip → fixed top-of-document
// window with no internal scroll (inlineBody.overflow).
const readOverflow = (): "scroll" | "clip" => {
  const activeBtn = document.querySelector<HTMLButtonElement>(
    "#artifact-overflow .mode-btn.active",
  );
  return (activeBtn?.dataset.mode ?? "scroll") as "scroll" | "clip";
};

const readBodyTransition = (): "auto" | "none" => {
  const activeBtn = document.querySelector<HTMLButtonElement>(
    "#artifact-body-transition .mode-btn.active",
  );
  return (activeBtn?.dataset.mode ?? "auto") as "auto" | "none";
};

// inline (default) keeps the streamed body in place; card collapses the block
// to the compact reference card once the artifact completes
// (inlineBody.completeDisplay).
const readCompleteDisplay = (): "inline" | "card" => {
  const activeBtn = document.querySelector<HTMLButtonElement>(
    "#artifact-complete-display .mode-btn.active",
  );
  return (activeBtn?.dataset.mode ?? "inline") as "inline" | "card";
};

// rendered (default) previews files in an iframe; source always shows raw
// highlighted source, the no-preview mode for code editor style hosts.
const readViewMode = (): "rendered" | "source" => {
  const activeBtn = document.querySelector<HTMLButtonElement>(
    "#artifact-view-mode .mode-btn.active",
  );
  return (activeBtn?.dataset.mode ?? "rendered") as "rendered" | "source";
};

// On (default) adds the inline chrome rendered/source toggle button via
// inlineChrome.showViewToggle; Off omits it. The widget auto-hides the button
// where only one view exists (streaming, plain markdown, source-only), so it
// only surfaces when a rendered preview is available.
const readViewToggle = (): boolean => {
  const activeBtn = document.querySelector<HTMLButtonElement>(
    "#artifact-view-toggle .mode-btn.active",
  );
  return activeBtn?.dataset.mode !== "off";
};

// On (the default) keeps the default themed spinner for slow file previews via
// filePreview.loading; Custom swaps in a renderIndicator escape hatch (pulsing
// dots); Off sends filePreview: { loading: false } to disable the overlay and
// its ready-signal injection. The overlay only appears when a preview takes a
// moment to become ready, so fast artifacts never flash it.
type PreviewLoadingMode = "on" | "custom" | "off";

const readPreviewLoadingMode = (): PreviewLoadingMode => {
  const activeBtn = document.querySelector<HTMLButtonElement>(
    "#artifact-preview-loading .mode-btn.active",
  );
  return (activeBtn?.dataset.mode ?? "on") as PreviewLoadingMode;
};

// Custom preview-loading indicator: three pulsing dots in the demo accent, built
// with plain DOM + inline styles. The keyframe is injected once (no <style> per
// render), keeping the renderer self-contained like the ArtifactDemoPill above.
// This is the filePreview.loading.renderIndicator escape hatch, a full swap for
// the default spinner.
let dotsKeyframeInjected = false;
const createPulsingDots = (): HTMLElement => {
  if (!dotsKeyframeInjected) {
    const style = document.createElement("style");
    style.textContent =
      "@keyframes personaArtifactDotPulse{0%,80%,100%{opacity:.25;transform:scale(.7)}40%{opacity:1;transform:scale(1)}}";
    document.head.appendChild(style);
    dotsKeyframeInjected = true;
  }
  const wrap = document.createElement("div");
  wrap.style.cssText = "display:flex;gap:6px;align-items:center;padding:8px;";
  for (let i = 0; i < 3; i += 1) {
    const dot = document.createElement("span");
    dot.style.cssText = `width:8px;height:8px;border-radius:999px;background:${ANIMATION_DEFAULTS.primary};animation:personaArtifactDotPulse 1.2s ${i * 0.16}s ease-in-out infinite;`;
    wrap.appendChild(dot);
  }
  return wrap;
};

// on → loading: true; off → loading: false; custom → the renderIndicator swap.
const buildPreviewLoading = ():
  | boolean
  | { renderIndicator: () => HTMLElement } => {
  const mode = readPreviewLoadingMode();
  if (mode === "off") return false;
  if (mode === "custom") return { renderIndicator: () => createPulsingDots() };
  return true;
};

const buildInlineBody = () => ({
  streamingView: readStreamingView(),
  viewMode: readViewMode(),
  height: readBodyHeight(),
  fadeMask: readFadeMask(),
  followOutput: readFollowOutput(),
  overflow: readOverflow(),
  transition: readBodyTransition(),
  completeDisplay: readCompleteDisplay(),
});

// ── Status label control ─────────────────────────────────────────────────
// Same DOM-is-the-source-of-truth pattern: the active pill in
// #artifact-status-label is read on every config build and populates
// features.artifacts.statusLabel, which replaces the default "Generating
// <type>..." label on ALL three surfaces (the reference card status line, the
// inline chrome meta, and the inline status body). It is independent of
// inlineBody, so it shows up on the card in card/panel display too, not just
// inline. Default leaves the key unset (current behavior); the other modes
// exercise the string and function forms.
type StatusLabelMode = "default" | "custom" | "progress" | "phase";

const readStatusLabelMode = (): StatusLabelMode => {
  const activeBtn = document.querySelector<HTMLButtonElement>(
    "#artifact-status-label .mode-btn.active",
  );
  return (activeBtn?.dataset.mode ?? "default") as StatusLabelMode;
};

// default → undefined (unset); custom → the string form; progress/phase → the
// function form. A function runs once per surface per streaming delta and must
// stay pure and fast. Returning { label, detail } gives an animated label
// (stable unless its text changes) plus a plain detail span updated per delta.
const buildStatusLabel = ():
  | string
  | ((
      ctx: PersonaArtifactStatusLabelContext,
    ) => string | { label: string; detail?: string })
  | undefined => {
  const mode = readStatusLabelMode();
  if (mode === "custom") {
    // String form: one fixed label across every surface, the localization /
    // brand-voice case.
    return "Writing your draft...";
  }
  if (mode === "progress") {
    // Live counters in the detail; the label stays stable so it keeps
    // animating. The inline chrome is cramped, so return a shorter,
    // line-only detail there to show surface awareness.
    return (ctx) => {
      const label = `Writing ${ctx.typeLabel.toLowerCase()}...`;
      const seconds = Math.round(ctx.elapsedMs / 1000);
      const detail =
        ctx.surface === "inline-chrome"
          ? `${ctx.lines} lines`
          : `${ctx.lines} lines, ${seconds}s`;
      return { label, detail };
    };
  }
  if (mode === "phase") {
    // Content-driven phase narration: find the last markdown heading in the
    // accumulated source and name it. The label re-animates only when the
    // phase actually changes; before any heading arrives it falls back to the
    // generic label.
    return (ctx) => {
      const matches = ctx.content().match(/^#{1,3}\s+(.+)$/gm);
      const lastHeading = matches
        ? matches[matches.length - 1].replace(/^#{1,3}\s+/, "").trim()
        : "";
      const label = lastHeading
        ? `Writing: ${lastHeading}`
        : `Writing ${ctx.typeLabel.toLowerCase()}...`;
      return { label, detail: `${ctx.chars} chars` };
    };
  }
  return undefined;
};

// ── Custom artifact actions (toolbar + card) ─────────────────────────────
// Demos features.artifacts.toolbarActions and .cardActions: host-defined
// buttons that receive the artifact context on click. Here they mimic a
// "Save to Drive" integration: report to the status line and console, never
// alert(). Each action carries a custom colorful icon to exercise the
// icon-factory path.
type ArtifactActionContext = {
  artifactId: string;
  title: string;
  artifactType: string;
  markdown?: string;
  file?: unknown;
  jsonPayload?: unknown;
};

let actionStatusTimeout: ReturnType<typeof setTimeout> | null = null;

const reportArtifactAction = (ctx: ArtifactActionContext): void => {
  // Full context to the console so the whole payload is inspectable.
  console.log("[artifact custom action]", ctx);
  const statusEl = document.getElementById("artifact-action-status");
  if (statusEl) {
    statusEl.textContent = `Saved "${ctx.title}" to Drive (demo)`;
    if (actionStatusTimeout) clearTimeout(actionStatusTimeout);
    actionStatusTimeout = setTimeout(() => {
      statusEl.textContent = "";
      actionStatusTimeout = null;
    }, 4000);
  }
};

// A recognizable colorful Drive-ish mark, built as an inline SVG so it
// exercises the custom-icon path (icon can be a () => SVGElement factory).
const createDriveIcon = (): SVGElement => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 87 78");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("aria-hidden", "true");
  const paths: Array<[string, string]> = [
    ["M6.6 66.85 10.45 73.5c.8 1.4 1.95 2.5 3.3 3.3L27.5 53.5H0c0 1.55.4 3.1 1.2 4.5z", "#0066da"],
    ["M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3L1.2 48c-.8 1.4-1.2 2.95-1.2 4.5h27.5z", "#00ac47"],
    ["M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75L86.2 57.5c.8-1.4 1.2-2.95 1.2-4.5H59.9l5.85 11.5z", "#ea4335"],
    ["M43.65 25 57.4 1.2c-1.35-.8-2.9-1.2-4.5-1.2H34.4c-1.6 0-3.15.45-4.5 1.2z", "#00832d"],
    ["M59.9 53.5H27.5L13.75 77.3c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z", "#2684fc"],
    ["M73.4 26.5 60.75 4.5c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.9 53.5h27.45c0-1.55-.4-3.1-1.2-4.5z", "#ffba00"],
  ];
  for (const [d, fill] of paths) {
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", d);
    p.setAttribute("fill", fill);
    svg.appendChild(p);
  }
  return svg;
};

const buildCustomActions = () => ({
  toolbarActions: [
    {
      id: "drive-toolbar",
      label: "Save to Drive",
      icon: createDriveIcon,
      onClick: reportArtifactAction,
    },
  ],
  cardActions: [
    {
      id: "drive-card",
      label: "Save to Drive",
      icon: createDriveIcon,
      showLabel: true,
      onClick: reportArtifactAction,
    },
  ],
  inlineActions: [
    {
      id: "log-inline",
      label: "Log",
      icon: createDriveIcon,
      onClick: reportArtifactAction,
    },
  ],
});

const readAnimationControls = () => {
  const activeModeBtn = document.querySelector<HTMLButtonElement>(
    "#artifact-anim-mode .mode-btn.active",
  );
  const mode = (activeModeBtn?.dataset.mode ??
    ANIMATION_DEFAULTS.mode) as ArtifactAnimationMode;
  const durationEl = getEl<HTMLInputElement>("artifact-anim-duration");
  const duration = durationEl
    ? parseInt(durationEl.value, 10)
    : ANIMATION_DEFAULTS.duration;
  const primary =
    getEl<HTMLInputElement>("artifact-color-primary")?.value ??
    ANIMATION_DEFAULTS.primary;
  const secondary =
    getEl<HTMLInputElement>("artifact-color-secondary")?.value ??
    ANIMATION_DEFAULTS.secondary;
  return { mode, duration, primary, secondary };
};

// Build the features.artifacts block from the base config plus the current
// display-mode and animation control selections. Color options are only sent
// for shimmer-color.
const buildArtifactsFeature = () => {
  const { mode, duration, primary, secondary } = readAnimationControls();
  // Only send statusLabel when a non-default mode is picked; Default leaves the
  // key unset so the widget keeps its built-in "Generating <type>..." label.
  const statusLabel = buildStatusLabel();
  // Custom tab bar for Buttons/Menu; undefined in Scroll mode leaves the
  // built-in strip in place.
  const tabBar = buildTabBar();
  return {
    ...artifactDemoConfigBase.features?.artifacts,
    display: readDisplayMode(),
    ...(statusLabel !== undefined ? { statusLabel } : {}),
    ...(tabBar ? { renderTabBar: tabBar } : {}),
    loadingAnimation: mode,
    loadingAnimationDuration: duration,
    ...(mode === "shimmer-color"
      ? {
          loadingAnimationColor: primary,
          loadingAnimationSecondaryColor: secondary,
        }
      : {}),
    // Copy is always on in the demo so the default pane toolbar shows it;
    // the expand toggle stays behind its control pill. White pane surface so
    // the source view reads like a document sheet against this page's warm
    // cream background.
    layout: {
      showCopyButton: true,
      paneBackground: "#ffffff",
      ...(readExpandToggle() ? { showExpandToggle: true } : {}),
      ...(readResizable() ? { resizable: true } : {}),
      // Edge fade for the built-in Scroll strip; send only when turned Off.
      // The custom Buttons/Menu bars (renderTabBar) own their own affordances.
      ...(readTabFade() ? {} : { tabFade: false }),
      ...(readPaneAppearance() === "seamless"
        ? {
            paneAppearance: "seamless" as const,
            splitGap: "0",
            paneShadow: "none",
          }
        : {}),
    },
    ...(readCustomActions() ? buildCustomActions() : {}),
    // Inline chrome On sends the object form so showViewToggle can ride along;
    // showCopy/showExpand default to true when unspecified in the object form.
    // Off sends inlineChrome: false for a bare inline body. showViewToggle is a
    // recent key: if the widget types don't yet carry it (concurrent work), TS
    // treats it as an extra property, which stays assignable to the feature type.
    ...(readInlineChrome()
      ? { inlineChrome: { showViewToggle: readViewToggle() } }
      : { inlineChrome: false }),
    // Only affects display: "inline". If the widget package types don't yet
    // carry the inlineBody key (concurrent work), TS treats it as an extra
    // property, which stays assignable to the artifacts feature type.
    inlineBody: buildInlineBody(),
    // Themed loading indicator for slow file previews. Merge onto any filePreview
    // keys from the base config rather than clobber. loading (and its object form
    // with renderIndicator) is a recent key: if the widget types don't yet carry
    // it (concurrent work), TS treats it as an extra property, which stays
    // assignable to the artifacts feature type.
    filePreview: {
      ...artifactDemoConfigBase.features?.artifacts?.filePreview,
      loading: buildPreviewLoading(),
    },
  };
};

const buildConfig = (mode: Mode): AgentWidgetConfig =>
  ({
    ...artifactDemoConfigBase,
    features: {
      ...artifactDemoConfigBase.features,
      artifacts: buildArtifactsFeature(),
    },
    launcher:
      mode === "launcher"
        ? {
            ...DEFAULT_WIDGET_CONFIG.launcher,
            enabled: true,
            autoExpand: true,
            width: "480px",
            position: "bottom-right",
          }
        : {
            ...DEFAULT_WIDGET_CONFIG.launcher,
            enabled: false,
            autoExpand: true,
            width: "100%",
            fullHeight: true,
          },
    layout: { showHeader: false },
  }) as AgentWidgetConfig;

// Reassigned on every mode switch; the artifact toolbar buttons below read it
// lazily so they always target the current widget.
let handle: AgentWidgetInitHandle | null = null;
// Tracks the current mount mode so live animation-control updates rebuild the
// config with the right launcher/inline chrome.
let activeMountMode: Mode = "inline";

setupMountMode({
  slug: "artifact-demo",
  modes: ["inline", "launcher"],
  mount: (mode, { stage }) => {
    activeMountMode = mode;
    const config = buildConfig(mode);
    reportDemoConfig(configInspector, { config, mode });
    // Both modes use initAgentWidget so the handle (connectStream / clearChat /
    // open) is identical; only the mount target and launcher chrome differ.
    const target =
      mode === "launcher"
        ? renderLauncherScene(stage).mountEl
        : renderInlineMount(stage);
    if (mode !== "launcher") target.style.height = "100%";
    handle = initAgentWidget({
      target,
      useShadowDom: false,
      windowKey: "personaArtifactDemo",
      config: mode === "launcher" ? config : squareInlinePanel(config),
    });
    handle.open();
    return () => {
      handle?.destroy();
      handle = null;
    };
  },
});

// The artifact buttons drive MOCK SSE STREAMING through the widget's real
// pipeline (see artifact-demo-sse.ts), not the programmatic upsertArtifact() API.
// Each click replays the wire frames a real agent emits, so the in-chat
// reference card streams from "Generating\u2026" to done with a Download button, the
// side pane fills from artifact_delta chunks, and the status dot animates.
//
// `connectStream` no-ops if a stream is already running, so we serialize clicks
// through a promise chain: overlapping clicks queue instead of getting dropped.
// A per-click counter keeps every stream's execution/artifact ids unique, so
// repeated clicks create separate cards.
let clickSeq = 0;
let streamQueue: Promise<void> = Promise.resolve();

const runArtifactStream = (button: ArtifactDemoButton): void => {
  streamQueue = streamQueue.then(() => {
    if (!handle) return;
    clickSeq += 1;
    return handle.connectStream(createArtifactDemoStream(button, clickSeq));
  });
};

const wireButton = (id: string, button: ArtifactDemoButton): void => {
  document.getElementById(id)?.addEventListener("click", () => runArtifactStream(button));
};

wireButton("btn-md", "md");
wireButton("btn-html-file", "html-file");
wireButton("btn-react-file", "react-file");
wireButton("btn-slow-file", "slow-file");
wireButton("btn-comp", "comp");
wireButton("btn-unknown", "unknown");

document.getElementById("btn-clear")?.addEventListener("click", () => {
  // clearChat() only wipes the transcript, so also clear the artifact registry
  // and pane for a full reset.
  handle?.clearChat();
  handle?.clearArtifacts();
});

// ── Wire the rail controls (display mode + loading animation) ─────────────
// Every control applies live via handle.update(): the widget re-applies
// features + re-renders the transcript in place (no messages lost), so the
// change lands on the NEXT streamed card and, because cards read their config
// at render time and re-render on each artifact_delta, on any in-flight card
// too. No re-mount: the widget is only re-created on a mount-mode switch.
const colorSection = document.getElementById("artifact-color-section");
const syncColorSectionVisibility = (mode: ArtifactAnimationMode): void => {
  if (colorSection) {
    colorSection.style.display = mode === "shimmer-color" ? "" : "none";
  }
};

const applyControlConfig = (): void => {
  const config = buildConfig(activeMountMode);
  handle?.update(
    activeMountMode === "launcher" ? config : squareInlinePanel(config),
  );
  reportDemoConfig(configInspector, { config, mode: activeMountMode });
};

const displayModeGroup = document.getElementById("artifact-display-mode");
displayModeGroup?.addEventListener("click", (event) => {
  const btn = (event.target as HTMLElement).closest<HTMLButtonElement>(".mode-btn");
  if (!btn) return;
  displayModeGroup
    .querySelectorAll(".mode-btn")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  applyControlConfig();
});

const expandToggleGroup = document.getElementById("artifact-expand-toggle");
expandToggleGroup?.addEventListener("click", (event) => {
  const btn = (event.target as HTMLElement).closest<HTMLButtonElement>(".mode-btn");
  if (!btn) return;
  expandToggleGroup
    .querySelectorAll(".mode-btn")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  applyControlConfig();
});

const resizableGroup = document.getElementById("artifact-resizable");
resizableGroup?.addEventListener("click", (event) => {
  const btn = (event.target as HTMLElement).closest<HTMLButtonElement>(".mode-btn");
  if (!btn) return;
  resizableGroup
    .querySelectorAll(".mode-btn")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  applyControlConfig();
});

const paneAppearanceGroup = document.getElementById("artifact-pane-appearance");
paneAppearanceGroup?.addEventListener("click", (event) => {
  const btn = (event.target as HTMLElement).closest<HTMLButtonElement>(".mode-btn");
  if (!btn) return;
  paneAppearanceGroup
    .querySelectorAll(".mode-btn")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  applyControlConfig();
});

const customActionsGroup = document.getElementById("artifact-custom-actions");
customActionsGroup?.addEventListener("click", (event) => {
  const btn = (event.target as HTMLElement).closest<HTMLButtonElement>(".mode-btn");
  if (!btn) return;
  customActionsGroup
    .querySelectorAll(".mode-btn")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  applyControlConfig();
});

const inlineChromeGroup = document.getElementById("artifact-inline-chrome");
inlineChromeGroup?.addEventListener("click", (event) => {
  const btn = (event.target as HTMLElement).closest<HTMLButtonElement>(".mode-btn");
  if (!btn) return;
  inlineChromeGroup
    .querySelectorAll(".mode-btn")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  applyControlConfig();
});

// Streaming body groups all share the plain segmented-control behavior: swap
// the active pill, then rebuild + apply the config live.
for (const groupId of [
  "artifact-tab-overflow",
  "artifact-tab-fade",
  "artifact-streaming-view",
  "artifact-view-mode",
  "artifact-view-toggle",
  "artifact-preview-loading",
  "artifact-body-height",
  "artifact-fade-mask",
  "artifact-follow-output",
  "artifact-overflow",
  "artifact-body-transition",
  "artifact-complete-display",
  "artifact-status-label",
]) {
  const group = document.getElementById(groupId);
  group?.addEventListener("click", (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>(".mode-btn");
    if (!btn) return;
    group
      .querySelectorAll(".mode-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    applyControlConfig();
  });
}

const modeGroup = document.getElementById("artifact-anim-mode");
modeGroup?.addEventListener("click", (event) => {
  const btn = (event.target as HTMLElement).closest<HTMLButtonElement>(".mode-btn");
  if (!btn) return;
  modeGroup
    .querySelectorAll(".mode-btn")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  syncColorSectionVisibility(btn.dataset.mode as ArtifactAnimationMode);
  applyControlConfig();
});
// Default mode is shimmer, so the color options start hidden.
syncColorSectionVisibility(ANIMATION_DEFAULTS.mode);

const durationSlider = getEl<HTMLInputElement>("artifact-anim-duration");
const durationLabel = document.getElementById("artifact-anim-duration-label");
durationSlider?.addEventListener("input", () => {
  if (durationLabel) durationLabel.textContent = `${durationSlider.value}ms`;
  applyControlConfig();
});

getEl<HTMLInputElement>("artifact-color-primary")?.addEventListener(
  "input",
  applyControlConfig,
);
getEl<HTMLInputElement>("artifact-color-secondary")?.addEventListener(
  "input",
  applyControlConfig,
);

document.getElementById("btn-anim-reset")?.addEventListener("click", () => {
  modeGroup
    ?.querySelectorAll(".mode-btn")
    .forEach((b) =>
      b.classList.toggle(
        "active",
        (b as HTMLButtonElement).dataset.mode === ANIMATION_DEFAULTS.mode,
      ),
    );
  if (durationSlider) durationSlider.value = String(ANIMATION_DEFAULTS.duration);
  if (durationLabel) durationLabel.textContent = `${ANIMATION_DEFAULTS.duration}ms`;
  const primaryEl = getEl<HTMLInputElement>("artifact-color-primary");
  const secondaryEl = getEl<HTMLInputElement>("artifact-color-secondary");
  if (primaryEl) primaryEl.value = ANIMATION_DEFAULTS.primary;
  if (secondaryEl) secondaryEl.value = ANIMATION_DEFAULTS.secondary;
  syncColorSectionVisibility(ANIMATION_DEFAULTS.mode);
  applyControlConfig();
});
