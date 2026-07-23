import "@runtypelabs/persona/widget.css";

import {
  DEFAULT_WIDGET_CONFIG,
  componentRegistry,
  createLocalStorageAdapter,
  initAgentWidget,
  markdownPostprocessor,
  type AgentWidgetInitHandle,
  type WebMcpConfirmInfo,
} from "@runtypelabs/persona";
import { initializeWebMCPPolyfill } from "@mcp-b/webmcp-polyfill";
import { registerOttoCharts } from "./docked-panel-charts";

// Otto renders charts inline (right in the transcript) via
// injectComponentDirective, so its two viz components must be in the registry
// before the widget mounts.
registerOttoCharts(componentRegistry);

// Otto — the docked store copilot — is WebMCP-powered: this page registers
// storefront tools on document.modelContext (see the bottom of the file) and the
// dispatch-docked flow drives them: read the store's KPIs and inventory, chart
// the sales trend and top products inline, switch admin sections, restock a
// product (visible on the page), log activity, and even reposition its own dock.
const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const apiUrl =
  import.meta.env.VITE_PROXY_URL
    ? `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch-docked`
    : `http://localhost:${proxyPort}/api/chat/dispatch-docked`;

/** Minimal structural view of the WebMCP producer surface (see webmcp-demo.ts). */
interface RegisterableModelContext {
  registerTool(
    tool: {
      name: string;
      title?: string;
      description: string;
      inputSchema?: object;
      annotations?: Record<string, unknown>;
      execute: (args: Record<string, unknown>) => unknown;
    },
    options?: { signal?: AbortSignal },
  ): void;
}

/** Read-only tools run without confirmation; mutations get Otto's approval bubble. */
const READ_ONLY_TOOLS = new Set([
  "get_store_overview",
  "switch_section",
  "show_sales_trend",
  "show_top_products",
]);

/** Plain-language [active, done] labels for Otto's grouped tool-call strip. */
const TOOL_LABELS: Record<string, [string, string]> = {
  get_store_overview: ["Reading your store", "Read your store"],
  show_sales_trend: ["Charting sales", "Charted your sales trend"],
  show_top_products: ["Ranking products", "Ranked your top products"],
  switch_section: ["Opening a section", "Opened a section"],
  restock_product: ["Updating inventory", "Updated inventory"],
  log_activity: ["Logging activity", "Logged activity"],
  set_dock_layout: ["Repositioning", "Repositioned my panel"],
  restyle_copilot: ["Restyling", "Gave myself a new look"],
};

// ---------------------------------------------------------------------------
// Appearance knobs (Copilot settings card + the restyle_copilot tool).
//
// The accent presets rewrite the page's --brand* custom properties, which every
// Otto-owned surface (widget seams, launcher on-state, inline charts, gradient
// tool strip) reads live — so one swatch click (or one tool call from Otto)
// recolors the whole copilot without a re-mount.
// ---------------------------------------------------------------------------

const ACCENT_PRESETS = {
  violet: { base: "#5e56e7", hover: "#4f47d6", deep: "#4038c4", mid: "#7c6cf5", bright: "#b7adff", soft: "#efeefe" },
  ocean: { base: "#0f7ac4", hover: "#0d6cae", deep: "#0b5a94", mid: "#2f96dd", bright: "#9fd2f4", soft: "#e9f4fc" },
  forest: { base: "#177a53", hover: "#136a48", deep: "#0f5c3e", mid: "#2f9a6f", bright: "#9fdcc0", soft: "#e8f6ef" },
  ember: { base: "#c2410c", hover: "#ad3a0b", deep: "#993108", mid: "#e05e26", bright: "#f6b795", soft: "#fdeee5" },
} as const;
type AccentName = keyof typeof ACCENT_PRESETS;
type OttoAnimation = "shimmer-color" | "rainbow" | "pulse" | "none";

const appearance: { accent: AccentName; radius: number; animation: OttoAnimation } = {
  accent: "violet",
  radius: 14,
  animation: "shimmer-color",
};

/** Widget theme derived from the active accent (full object: `update` merges shallowly). */
function buildOttoTheme() {
  const p = ACCENT_PRESETS[appearance.accent];
  return {
    semantic: {
      colors: {
        primary: p.base,
        accent: p.base,
        surface: "#ffffff",
        background: "#ffffff",
        textMuted: "#616161",
        interactive: {
          default: p.base,
          hover: p.hover,
          focus: p.hover,
          active: p.deep,
        },
        feedback: {
          info: p.base,
        },
      },
    },
    // panel.borderRadius is always sent so toggling detached clears the flush
    // override under patch-merge update() and the rounded default returns.
    components: detachedCheck.checked
      ? // Detached card: clear the panel override so the theme's rounded default
        // makes the inset card read as elevated; header still squares.
        { panel: { borderRadius: undefined }, header: { borderRadius: "0" } }
      : // Flush dock: zero radius so the panel sits cleanly against the admin edge.
        {
          panel: { borderRadius: "0" },
          header: { borderRadius: "0" },
        },
  };
}

/** Features block derived from the animation knob (grouped steps stay fixed). */
function buildOttoFeatures() {
  return {
    ...DEFAULT_WIDGET_CONFIG.features,
    showReasoning: false,
    toolCallDisplay: {
      ...DEFAULT_WIDGET_CONFIG.features?.toolCallDisplay,
      collapsedMode: "tool-name" as const,
      grouped: true,
      expandable: false,
      loadingAnimation: appearance.animation,
    },
  };
}

/** Tool-call presentation: friendly labels + accent-matched gradient shimmer. */
function buildOttoToolCall() {
  const p = ACCENT_PRESETS[appearance.accent];
  return {
    loadingAnimationColor: p.base,
    loadingAnimationSecondaryColor: p.bright,
    loadingAnimationDuration: 1500,
    renderCollapsedSummary: ({
      toolCall,
      isActive,
    }: {
      toolCall: { name?: string };
      isActive: boolean;
    }) => {
      const label = toolCall.name ? TOOL_LABELS[toolCall.name] : undefined;
      return label ? (isActive ? `${label[0]}…` : label[1]) : null;
    },
    renderGroupedSummary: ({ toolCalls }: { toolCalls: Array<{ status: string }> }) => {
      const active = toolCalls.some((t) => t.status !== "complete");
      const n = toolCalls.length;
      return active ? "Working on your store…" : `Completed ${n} ${n === 1 ? "step" : "steps"}`;
    },
  };
}

const dockSideSelect = document.getElementById("dock-side") as HTMLSelectElement | null;
const dockWidthInput = document.getElementById("dock-width") as HTMLInputElement | null;
const dockRevealSelect = document.getElementById("dock-reveal") as HTMLSelectElement | null;
const dockAnimateCheck = document.getElementById("dock-animate") as HTMLInputElement | null;
const dockDetachedCheck = document.getElementById("dock-detached") as HTMLInputElement | null;
const applyDockBtn = document.getElementById("apply-dock-settings") as HTMLButtonElement | null;
const toggleBtn = document.getElementById("assistant-toggle") as HTMLButtonElement | null;
const dockStatus = document.getElementById("dock-status");
const workspaceMainEl = document.getElementById("workspace-main");

if (
  !dockSideSelect ||
  !dockWidthInput ||
  !dockRevealSelect ||
  !dockAnimateCheck ||
  !dockDetachedCheck ||
  !applyDockBtn ||
  !toggleBtn
) {
  throw new Error("Docked demo controls are missing");
}

const sideSelect = dockSideSelect;
const widthInput = dockWidthInput;
const revealSelect = dockRevealSelect;
const animateCheck = dockAnimateCheck;
const detachedCheck = dockDetachedCheck;
const assistantToggle = toggleBtn;

type DockRevealOption = "resize" | "emerge" | "overlay" | "push";

function parseDockReveal(raw: string): DockRevealOption {
  if (raw === "resize" || raw === "emerge" || raw === "overlay" || raw === "push") return raw;
  return "emerge";
}

let controller: AgentWidgetInitHandle;

function getDockConfig() {
  return {
    side: sideSelect.value as "left" | "right",
    width: widthInput.value.trim() || "420px",
    reveal: parseDockReveal(revealSelect.value),
    animate: animateCheck.checked,
  };
}

/** Full launcher object: use on init and on Apply so shallow inner `controller.update` keeps titles, breakpoint, etc. */
function getDemoLauncher() {
  return {
    ...DEFAULT_WIDGET_CONFIG.launcher,
    mountMode: "docked" as const,
    dock: getDockConfig(),
    detachedPanel: detachedCheck.checked,
    autoExpand: false,
    fullHeight: true,
    // Below the same breakpoint used by the demo chrome, Otto takes over the
    // viewport instead of squeezing a phone-sized dashboard beside a 420px dock.
    mobileFullscreen: true,
    mobileBreakpoint: 1120,
    title: "Otto",
    subtitle: "Store copilot",
  };
}

/** Match workspace chrome layout to dock side (see docked-panel-demo.html). */
function syncWorkspaceMainDockSide(): void {
  workspaceMainEl?.setAttribute("data-dock-side", getDockConfig().side);
}

function formatDockOptionsLine(dock: ReturnType<typeof getDockConfig>): string {
  const revealHint =
    dock.reveal === "resize"
      ? "flex 0↔width, panel stretches"
      : dock.reveal === "emerge"
        ? "flex 0↔width, panel fixed (emerges)"
        : dock.reveal === "overlay"
          ? "overlay transform"
          : "push track transform";
  const animHint = dock.animate ? "transition on" : "transition off (snap)";
  const detachedHint = detachedCheck.checked ? " · detached card" : "";
  return `reveal: ${dock.reveal} (${revealHint}) · animate: ${animHint}${detachedHint}`;
}

function syncToggleUi(): void {
  const open = controller.getState().open;
  assistantToggle.setAttribute("aria-expanded", open ? "true" : "false");
  assistantToggle.setAttribute("aria-label", open ? "Hide Otto" : "Open Otto");
  assistantToggle.classList.toggle("is-active", open);
  assistantToggle.title = open ? "Hide Otto" : "Open Otto";
  if (open) assistantToggle.classList.remove("assistant-toggle--hint");

  const coachEl = document.getElementById("assistant-coachmark");
  if (coachEl) coachEl.toggleAttribute("hidden", open);
  if (open) assistantToggle.removeAttribute("aria-describedby");
  else assistantToggle.setAttribute("aria-describedby", "assistant-coachmark");
}

function updateStatus(label: string): void {
  if (!dockStatus) return;
  const state = controller.getState();
  const dock = getDockConfig();
  dockStatus.textContent = `${label} Dock ${state.open ? "open" : "closed"} · side ${dock.side} · ${dock.width} · ${formatDockOptionsLine(dock)}.`;
}

function createController(): AgentWidgetInitHandle {
  return initAgentWidget({
    target: "#workspace-dock-target",
    windowKey: "ottoDocked",
    config: {
      ...DEFAULT_WIDGET_CONFIG,
      apiUrl,
      storageAdapter: createLocalStorageAdapter("persona-state-docked-panel-demo"),
      launcher: getDemoLauncher(),
      // Accent-preset theme for Otto (violet by default; the Copilot-settings
      // swatches and restyle_copilot swap it live). Rounding/surface details are
      // refined on the CSS seams in docked-panel-demo.html; the panel + header
      // stay flush (radius 0) so the dock sits cleanly against the admin edge.
      theme: buildOttoTheme(),
      copy: {
        ...DEFAULT_WIDGET_CONFIG.copy,
        welcomeTitle: "How can I help?",
        welcomeSubtitle:
          "I can read your store, draft copy, and take action right here — restock a product, log activity, or reorganize this workspace.",
        inputPlaceholder: "Ask anything about your store…",
      },
      // Ordered to walk the tool surface: an inline chart (auto-approved),
      // a ranked bar chart, then two mutations that raise Otto's approval
      // bubble — one restocks a product on the page, one restyles + re-docks
      // Otto itself (two grouped tool calls from one ask).
      suggestionChips: [
        "How are sales trending this month?",
        "Show my top products by revenue",
        "Restock the Ceramic Pour-Over",
        "Go ocean blue and dock on the left",
      ],
      webmcp: {
        enabled: true,
        autoApprove: (info: WebMcpConfirmInfo): boolean => READ_ONLY_TOOLS.has(info.toolName),
      },
      // Group Otto's steps into one compact strip with plain-language labels,
      // and give the running step an accent-matched gradient shimmer.
      features: buildOttoFeatures(),
      toolCall: buildOttoToolCall(),
      postprocessMessage: ({ text }) => markdownPostprocessor(text),
    },
  });
}

function bindControllerEvents(): void {
  controller.on("widget:opened", () => {
    syncToggleUi();
    updateStatus("Panel opened.");
  });
  controller.on("widget:closed", () => {
    syncToggleUi();
    updateStatus("Panel closed.");
  });
}

function applyDockSettings(): void {
  syncWorkspaceMainDockSide();
  // Theme rides along: the detached toggle swaps the panel radius overrides.
  controller.update({ launcher: getDemoLauncher(), theme: buildOttoTheme() });
  updateStatus("Layout updated.");
}

syncWorkspaceMainDockSide();
controller = createController();
bindControllerEvents();
syncToggleUi();
updateStatus("Ready.");

applyDockBtn.addEventListener("click", applyDockSettings);

/** Keep chrome layout in sync with the Side control (widget updates still require Apply). */
sideSelect.addEventListener("change", () => {
  syncWorkspaceMainDockSide();
});

/** Keeps the button from taking focus on mouse click (avoids OS focus-ring flash); keyboard still tabs in. */
assistantToggle.addEventListener("mousedown", (e) => {
  if (e.button === 0) e.preventDefault();
});

assistantToggle.addEventListener("click", () => {
  assistantToggle.classList.remove("assistant-toggle--hint");
  document.getElementById("assistant-coachmark")?.remove();
  controller.toggle();
});

// ---------------------------------------------------------------------------
// Appearance knobs: swatches, corner slider, animation segmented control.
// Live-apply (no button): the page tokens restyle CSS-driven surfaces instantly
// and `controller.update` re-themes the widget's own token-driven bits.
// ---------------------------------------------------------------------------

const swatchButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("#accent-swatches .swatch"),
);
const radiusInput = document.getElementById("otto-radius") as HTMLInputElement | null;
const radiusReadout = document.getElementById("otto-radius-readout");
const animButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("#otto-anim button"),
);

function syncAppearanceUi(): void {
  swatchButtons.forEach((btn) => {
    btn.setAttribute("aria-checked", btn.dataset.accent === appearance.accent ? "true" : "false");
  });
  if (radiusInput) radiusInput.value = String(appearance.radius);
  if (radiusReadout) radiusReadout.textContent = `${appearance.radius}px`;
  animButtons.forEach((btn) => {
    btn.setAttribute("aria-checked", btn.dataset.anim === appearance.animation ? "true" : "false");
  });
}

function applyAppearance(statusLabel = "Appearance updated."): void {
  const p = ACCENT_PRESETS[appearance.accent];
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty("--brand", p.base);
  rootStyle.setProperty("--brand-600", p.hover);
  rootStyle.setProperty("--brand-700", p.deep);
  rootStyle.setProperty("--brand-2", p.mid);
  rootStyle.setProperty("--brand-bright", p.bright);
  rootStyle.setProperty("--brand-soft", p.soft);
  rootStyle.setProperty("--otto-radius", `${appearance.radius}px`);
  rootStyle.setProperty("--otto-radius-sm", `${Math.max(6, appearance.radius - 4)}px`);
  controller.update({
    theme: buildOttoTheme(),
    features: buildOttoFeatures(),
    toolCall: buildOttoToolCall(),
  });
  syncAppearanceUi();
  updateStatus(statusLabel);
}

swatchButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const name = btn.dataset.accent as AccentName | undefined;
    if (!name || !(name in ACCENT_PRESETS)) return;
    appearance.accent = name;
    applyAppearance(`Accent set to ${name}.`);
  });
});

radiusInput?.addEventListener("input", () => {
  appearance.radius = Number(radiusInput.value) || 14;
  applyAppearance(`Corners set to ${appearance.radius}px.`);
});

animButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const anim = btn.dataset.anim as OttoAnimation | undefined;
    if (!anim || !["shimmer-color", "rainbow", "pulse", "none"].includes(anim)) return;
    appearance.animation = anim;
    applyAppearance(`Working animation: ${anim}.`);
  });
});

syncAppearanceUi();

// ---------------------------------------------------------------------------
// WebMCP page tools
//
// Mocked storefront actions in the same spirit as webmcp-demo.ts: the page owns
// the tools, Otto drives them, and every result is visible on the dashboard.
// Read-only tools auto-approve (see READ_ONLY_TOOLS); mutations raise Otto's
// in-panel approval bubble.
// ---------------------------------------------------------------------------

initializeWebMCPPolyfill();

const modelContext = (
  document as Document & { modelContext?: RegisterableModelContext }
).modelContext;

if (modelContext) {
  // Only the primary admin sections are drivable navigation targets (the first
  // nav group); sales channels + settings are chrome, not sections.
  const navItems = (): HTMLElement[] =>
    Array.from(
      document.querySelectorAll<HTMLElement>(".workspace-nav > ul:first-of-type .nav-item"),
    );
  const sectionName = (el: HTMLElement): string => el.textContent?.trim() ?? "";

  type StockStatus = "in" | "low" | "out";
  const stockFor = (count: number): { status: StockStatus; label: string; cls: string } => {
    if (count <= 0) return { status: "out", label: "Sold out", cls: "stock-badge--out" };
    if (count <= 10) return { status: "low", label: "Low stock", cls: "stock-badge--low" };
    return { status: "in", label: "In stock", cls: "stock-badge--in" };
  };
  const productEls = (): HTMLElement[] =>
    Array.from(document.querySelectorAll<HTMLElement>("#product-list .prod"));
  const productName = (el: HTMLElement): string =>
    el.getAttribute("data-product") ?? el.querySelector(".prod__name")?.textContent?.trim() ?? "";

  // -- get_store_overview (read-only) --
  modelContext.registerTool({
    name: "get_store_overview",
    title: "Read the store dashboard",
    description:
      "Read the current admin dashboard: the KPI metrics (with 30-day change), the available admin sections and which is active, the product inventory (name, price, on-hand count and stock status), the recent-activity feed, and Otto's current dock layout.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    execute() {
      const metrics = Array.from(document.querySelectorAll<HTMLElement>(".metric")).map((m) => ({
        label: m.querySelector(".metric__label")?.textContent?.trim() ?? "",
        value: m.querySelector(".metric__value")?.textContent?.trim() ?? "",
        change: m.querySelector(".metric__delta")?.textContent?.trim() ?? "",
      }));
      const products = productEls().map((el) => {
        const count = Number(el.getAttribute("data-inventory") ?? "0");
        return {
          name: productName(el),
          price: el.querySelector(".prod__price")?.textContent?.trim() ?? "",
          inventory: count,
          status: stockFor(count).label,
        };
      });
      const activity = Array.from(document.querySelectorAll("#activity-feed .feed-item")).map(
        (item) => {
          const spans = item.querySelectorAll("span");
          return {
            when: spans[0]?.textContent?.trim() ?? "",
            title: spans[1]?.textContent?.trim() ?? "",
            detail: spans[2]?.textContent?.trim() ?? "",
          };
        },
      );
      return {
        sections: navItems().map((el) => ({
          name: sectionName(el),
          active: el.classList.contains("is-active"),
        })),
        metrics,
        products,
        activity,
        dock: getDockConfig(),
        appearance: { ...appearance },
      };
    },
  });

  // Mock 30-day sales series (trending up) that show_sales_trend visualizes.
  const SALES_SERIES: Array<{ label: string; value: number }> = [
    { label: "Jun 9", value: 410 }, { label: "Jun 12", value: 480 },
    { label: "Jun 15", value: 455 }, { label: "Jun 18", value: 560 },
    { label: "Jun 21", value: 540 }, { label: "Jun 24", value: 690 },
    { label: "Jun 27", value: 720 }, { label: "Jun 30", value: 660 },
    { label: "Jul 3", value: 815 }, { label: "Jul 6", value: 890 },
  ];
  const usd = (n: number): string =>
    "$" + Math.round(n).toLocaleString("en-US");

  // -- show_sales_trend (read-only; renders an inline chart) --
  modelContext.registerTool({
    name: "show_sales_trend",
    title: "Chart the sales trend",
    description:
      "Render an inline area chart of total sales over the last 30 days directly in the conversation, and return the series so you can comment on it. Use this whenever the merchant asks how sales are trending.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    execute() {
      const total = SALES_SERIES.reduce((s, d) => s + d.value, 0);
      controller.injectComponentDirective({
        component: "otto_sales_chart",
        props: {
          title: "Total sales",
          subtitle: "Last 30 days",
          points: SALES_SERIES,
          total: usd(total),
          delta: "8.4%",
          footnote: "Computed from 143 orders · Jun 9 – Jul 6 · excludes refunds.",
        },
        text: "",
        llmContent: "[Rendered the 30-day sales trend chart inline]",
      });
      return {
        ok: true,
        rendered: "otto_sales_chart",
        total_sales: usd(total),
        change_vs_prev_period: "+8.4%",
        peak_day: "Jul 6",
        series: SALES_SERIES,
      };
    },
  });

  // -- show_top_products (read-only; renders an inline bar chart) --
  modelContext.registerTool({
    name: "show_top_products",
    title: "Chart top products",
    description:
      "Render an inline ranked bar chart of the best-selling products by revenue directly in the conversation, and return the rows so you can comment on them. Use this when the merchant asks for top / best-selling products.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    execute() {
      // Revenue = price × mock units sold, so the bars track the visible catalog.
      const units: Record<string, number> = {
        "Aurora Table Lamp": 41,
        "Walnut Desk Shelf": 33,
        "Linen Throw Blanket": 58,
        "Ceramic Pour-Over": 72,
      };
      const rows = productEls()
        .map((p) => {
          const name = productName(p);
          const price = Number(
            (p.querySelector(".prod__price")?.textContent ?? "0").replace(/[^0-9.]/g, ""),
          );
          const sold = units[name] ?? 20;
          return { name, revenue: Math.round(price * sold), units: sold };
        })
        .sort((a, b) => b.revenue - a.revenue);

      controller.injectComponentDirective({
        component: "otto_bar_chart",
        props: {
          title: "Top products by revenue",
          subtitle: "Last 30 days",
          bars: rows.map((r) => ({
            label: r.name,
            value: r.revenue,
            sub: `${r.units} sold`,
            display: usd(r.revenue),
          })),
          footnote: "Revenue = unit price × units sold in the period.",
        },
        text: "",
        llmContent: "[Rendered the top-products bar chart inline]",
      });
      return { ok: true, rendered: "otto_bar_chart", products: rows };
    },
  });

  // -- switch_section (read-only-ish navigation) --
  modelContext.registerTool({
    name: "switch_section",
    title: "Switch admin section",
    description:
      "Highlight a section in the admin navigation. Valid section names come from get_store_overview (e.g. Home, Orders, Products, Customers, Discounts, Analytics).",
    inputSchema: {
      type: "object",
      properties: {
        section: { type: "string", description: "Exact name of the section to activate." },
      },
      required: ["section"],
    },
    annotations: { readOnlyHint: false },
    execute(args) {
      const requested = String(args.section ?? "").trim().toLowerCase();
      const items = navItems();
      const target = items.find((el) => sectionName(el).toLowerCase() === requested);
      if (!target) {
        throw new Error(
          `Unknown section "${args.section}". Available: ${items.map(sectionName).join(", ")}.`,
        );
      }
      items.forEach((el) => {
        el.classList.toggle("is-active", el === target);
        if (el === target) el.setAttribute("aria-current", "page");
        else el.removeAttribute("aria-current");
      });
      if (window.matchMedia("(max-width: 860px)").matches) {
        target.scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        });
      }
      updateStatus(`Switched to ${sectionName(target)}.`);
      return { ok: true, active: sectionName(target) };
    },
  });

  // -- restock_product (mutating: on-page inventory change) --
  modelContext.registerTool({
    name: "restock_product",
    title: "Restock a product",
    description:
      "Set a product's on-hand inventory. Pass the exact product name (from get_store_overview) and either `quantity` to ADD to the current count, or `set_to` to set an absolute count. The product's stock badge updates immediately (Sold out → Low stock → In stock).",
    inputSchema: {
      type: "object",
      properties: {
        product: { type: "string", description: "Exact product name to restock." },
        quantity: { type: "number", description: "Units to ADD to the current on-hand count." },
        set_to: { type: "number", description: "Absolute on-hand count to set (overrides quantity)." },
      },
      required: ["product"],
    },
    annotations: { readOnlyHint: false },
    execute(args) {
      const requested = String(args.product ?? "").trim().toLowerCase();
      const el = productEls().find((p) => productName(p).toLowerCase() === requested);
      if (!el) {
        throw new Error(
          `Unknown product "${args.product}". Available: ${productEls().map(productName).join(", ")}.`,
        );
      }
      const current = Number(el.getAttribute("data-inventory") ?? "0");
      let next: number;
      if (args.set_to !== undefined && Number.isFinite(Number(args.set_to))) {
        next = Math.max(0, Math.round(Number(args.set_to)));
      } else if (args.quantity !== undefined && Number.isFinite(Number(args.quantity))) {
        next = Math.max(0, current + Math.round(Number(args.quantity)));
      } else {
        next = current + 40; // sensible default restock
      }
      const s = stockFor(next);
      el.setAttribute("data-inventory", String(next));
      el.setAttribute("data-status", s.status);
      const countEl = el.querySelector(".prod__count");
      if (countEl) countEl.textContent = String(next);
      const badge = el.querySelector(".stock-badge");
      if (badge) {
        badge.className = `stock-badge ${s.cls}`;
        badge.textContent = s.label;
      }
      updateStatus(`Restocked ${productName(el)} to ${next}.`);
      return { ok: true, product: productName(el), inventory: next, status: s.label };
    },
  });

  // -- log_activity (mutating: visible feed update) --
  modelContext.registerTool({
    name: "log_activity",
    title: "Log activity",
    description:
      "Add an entry to the dashboard's Recent activity feed. Use a short title and put any detail in the body.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short headline for the entry." },
        detail: { type: "string", description: "One-sentence detail shown under the title." },
      },
      required: ["title"],
    },
    annotations: { readOnlyHint: false },
    execute(args) {
      const feed = document.getElementById("activity-feed");
      if (!feed) throw new Error("Activity feed not found on the page.");

      // Built with textContent: agent-supplied strings never touch innerHTML.
      const item = document.createElement("div");
      item.className = "feed-item";
      const meta = document.createElement("span");
      meta.className = "feed-meta";
      meta.textContent = "Just now";
      const title = document.createElement("span");
      title.className = "feed-title";
      title.textContent = String(args.title ?? "").trim() || "Untitled note";
      item.append(meta, title);
      if (args.detail !== undefined && String(args.detail).trim()) {
        const detail = document.createElement("span");
        detail.textContent = String(args.detail).trim();
        item.append(detail);
      }
      feed.prepend(item);
      updateStatus("Activity logged.");
      return { ok: true, logged: title.textContent };
    },
  });

  // -- set_dock_layout (mutating: Otto repositions itself) --
  modelContext.registerTool({
    name: "set_dock_layout",
    title: "Move Otto's dock",
    description:
      "Reposition or resize Otto's own docked panel. All fields optional; omitted ones keep their current value. side: 'left' | 'right'. width: CSS width like '380px'. reveal: 'resize' | 'emerge' | 'overlay' | 'push'. animate: boolean.",
    inputSchema: {
      type: "object",
      properties: {
        side: { type: "string", enum: ["left", "right"] },
        width: { type: "string", description: "CSS width for the open dock, e.g. '380px'." },
        reveal: { type: "string", enum: ["resize", "emerge", "overlay", "push"] },
        animate: { type: "boolean" },
      },
    },
    annotations: { readOnlyHint: false },
    execute(args) {
      if (args.side !== undefined) {
        if (args.side !== "left" && args.side !== "right") {
          throw new Error(`Invalid side "${args.side}": use "left" or "right".`);
        }
        sideSelect.value = args.side;
      }
      if (args.width !== undefined) {
        const raw = String(args.width).trim();
        const width = /^\d+(\.\d+)?$/.test(raw) ? `${raw}px` : raw;
        if (!/^\d+(\.\d+)?(px|rem|em|vw|%)$/.test(width)) {
          throw new Error(`Invalid width "${args.width}": use a CSS length like "380px".`);
        }
        widthInput.value = width;
      }
      if (args.reveal !== undefined) {
        const reveal = String(args.reveal);
        if (!["resize", "emerge", "overlay", "push"].includes(reveal)) {
          throw new Error(`Invalid reveal "${args.reveal}": use resize, emerge, overlay, or push.`);
        }
        revealSelect.value = reveal;
      }
      if (args.animate !== undefined) {
        animateCheck.checked = Boolean(args.animate);
      }
      applyDockSettings();
      return { ok: true, dock: getDockConfig() };
    },
  });

  // -- restyle_copilot (mutating: Otto restyles itself) --
  modelContext.registerTool({
    name: "restyle_copilot",
    title: "Restyle Otto",
    description:
      "Change Otto's own appearance — the same knobs as the Copilot settings card. All fields optional; omitted ones keep their current value. accent: 'violet' | 'ocean' | 'forest' | 'ember' (ocean is the blue one). radius: corner rounding in px, 4–22. animation: 'shimmer-color' | 'rainbow' | 'pulse' | 'none' (the working-step header animation).",
    inputSchema: {
      type: "object",
      properties: {
        accent: { type: "string", enum: ["violet", "ocean", "forest", "ember"] },
        radius: { type: "number", description: "Corner rounding in px (4–22)." },
        animation: { type: "string", enum: ["shimmer-color", "rainbow", "pulse", "none"] },
      },
    },
    annotations: { readOnlyHint: false },
    execute(args) {
      if (args.accent !== undefined) {
        const accent = String(args.accent);
        if (!(accent in ACCENT_PRESETS)) {
          throw new Error(
            `Unknown accent "${args.accent}". Available: ${Object.keys(ACCENT_PRESETS).join(", ")}.`,
          );
        }
        appearance.accent = accent as AccentName;
      }
      if (args.radius !== undefined) {
        const radius = Number(args.radius);
        if (!Number.isFinite(radius)) {
          throw new Error(`Invalid radius "${args.radius}": use a number of pixels (4–22).`);
        }
        appearance.radius = Math.min(22, Math.max(4, Math.round(radius)));
      }
      if (args.animation !== undefined) {
        const animation = String(args.animation);
        if (!["shimmer-color", "rainbow", "pulse", "none"].includes(animation)) {
          throw new Error(
            `Invalid animation "${args.animation}": use shimmer-color, rainbow, pulse, or none.`,
          );
        }
        appearance.animation = animation as OttoAnimation;
      }
      applyAppearance("Otto restyled itself.");
      return { ok: true, appearance: { ...appearance } };
    },
  });
}
