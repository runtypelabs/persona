import "@runtypelabs/persona/widget.css";
import { renderDemoScaffold } from "./demo-scaffold";
import {
  createLocalStorageAdapter,
  createStaticMentionSource,
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetConfig,
  type AgentWidgetContextMentionConfig,
  type AgentWidgetContextMentionItem,
  type AgentWidgetContextMentionTokenRenderContext,
  type AgentWidgetController,
} from "@runtypelabs/persona";
import { createSmartDomMentionsExperience } from "./mentions/smart-dom-mentions-experience";
import { setupMountMode, runWidgetMount } from "./mount-mode";
import { createDemoEchoFetch } from "./demo-echo-fetch";
import type { Mode } from "./examples-nav";

// One page, two displays. The left-rail controls drive the config; every change
// remounts the widget. No scaffold `variants` control — Display / Chip rendering
// / Token styling are HTML-authored `.mode-group` segmented controls (see the
// page), wired below with the DOM as the source of truth.
renderDemoScaffold({ slug: "context-mentions-demo" });

const logEl = document.getElementById("log");
function log(msg: string) {
  if (!logEl) return;
  const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
  const line = document.createElement("div");
  line.textContent = `[${ts}] ${msg}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

// --- Control metadata --------------------------------------------------------
type Display = "chips" | "inline";
const DISPLAY: Record<Display, string> = { chips: "Chips", inline: "Inline" };

// Chip rendering bundles (Display=Chips): one factory, five previewable configs,
// from the built-in behavior (no smart DOM) up to the fully custom experience.
type ChipRendering = "default" | "badges" | "hover" | "preview" | "full";
type ChipFlags = {
  includePageSource: boolean;
  customRows: boolean;
  customChips: boolean;
  chipHover?: "default" | "popover";
};
const CHIP_RENDERING: Record<
  ChipRendering,
  { label: string; description: string; flags: ChipFlags }
> = {
  default: {
    label: "Default",
    description: "Built-in menu + chip, Files only (no smart DOM)",
    flags: { includePageSource: false, customRows: false, customChips: false },
  },
  badges: {
    label: "Badges",
    description: "Custom menu rows: source badge + match highlight (smart DOM on)",
    flags: { includePageSource: true, customRows: true, customChips: false },
  },
  hover: {
    label: "Hover",
    description:
      "Custom chips: hover a Page chip to highlight its live element (smart DOM on)",
    flags: { includePageSource: true, customRows: false, customChips: true },
  },
  preview: {
    label: "Preview",
    description:
      "Custom chips: hover for a content popover; click a Page chip to scroll to its element",
    flags: {
      includePageSource: true,
      customRows: true,
      customChips: true,
      chipHover: "popover",
    },
  },
  full: {
    label: "Full",
    description: "Badges + hover + smart DOM, the shareable factory",
    flags: { includePageSource: true, customRows: true, customChips: true },
  },
};

// Token styling (Display=Inline): three levels of control over the inline token.
type TokenStyling = "colored" | "monochrome" | "custom";
const TOKEN_STYLING: Record<TokenStyling, { label: string; description: string }> = {
  colored: {
    label: "Colored",
    description: "Per-type `color` tints the whole pill (icon + text)",
  },
  monochrome: {
    label: "Monochrome",
    description: "No `color`, tokens fall back to the theme accent",
  },
  custom: {
    label: "Custom",
    description: "`renderMentionToken` replaces the token DOM entirely",
  },
};

// Read the active pill from a `.mode-group` segmented control (DOM is the truth).
function activePill<T extends string>(groupId: string, fallback: T): T {
  const el = document.querySelector<HTMLElement>(`#${groupId} .mode-btn.active`);
  return (el?.dataset.mode as T) ?? fallback;
}

// --- Sources -----------------------------------------------------------------
// `color` sets each token's accent (tints the whole pill + icon, Slack/Linear
// style) in inline mode; chip rendering ignores `color` harmlessly. The inline
// Monochrome variant strips it so tokens use the theme accent instead.
const FILE_ITEMS: AgentWidgetContextMentionItem[] = [
  { id: "app-tsx", label: "App.tsx", description: "React entry component", iconName: "file-code", color: "#2563eb" },
  { id: "readme-md", label: "README.md", description: "Project overview", iconName: "file-text", color: "#64748b" },
  { id: "client-ts", label: "client.ts", description: "SSE streaming client", iconName: "file-code", color: "#7c3aed" },
  { id: "theme-css", label: "theme.css", description: "Design tokens", iconName: "file-text", color: "#db2777" },
];

const FILE_BODIES: Record<string, string> = {
  "app-tsx": "export function App() {\n  return <Chat />;\n}",
  "readme-md": "# Persona\nThemeable streaming chat widget for the web.",
  "client-ts": "export class AgentWidgetClient {\n  // SSE dispatch + streaming\n}",
  "theme-css": ":root { --persona-accent: #0f0f0f; }",
};

// Strip the per-item accent for the inline Monochrome variant only.
const itemsFor = (
  display: Display,
  token: TokenStyling,
): AgentWidgetContextMentionItem[] =>
  display === "inline" && token === "monochrome"
    ? FILE_ITEMS.map(({ color: _color, ...rest }) => rest)
    : FILE_ITEMS;

const buildFilesSource = (display: Display, token: TokenStyling) =>
  createStaticMentionSource({
    id: "files",
    label: "Files",
    items: itemsFor(display, token),
    resolve: (item) => {
      log(`Resolved file on select: ${item.label}`);
      return { llmAppend: `Contents of ${item.label}:\n${FILE_BODIES[item.id] ?? ""}` };
    },
  });

// The smart-dom page source + custom row/chip renderers are packaged in the
// shareable `createSmartDomMentionsExperience` factory (see ./mentions/…). It is
// scoped to the demo's controls panel so the menu stays focused on this page.
const pageRoot =
  document.querySelector<HTMLElement>(".stage-controls") ?? undefined;

// --- Inline custom token -----------------------------------------------------
// Page-scoped styles for the Custom token. The widget mounts without Shadow DOM
// here, so demo-page CSS reaches tokens in both the composer and the sent
// bubble. Injected once, guarded by id.
const CODEREF_STYLE_ID = "inline-demo-coderef-style";
if (typeof document !== "undefined" && !document.getElementById(CODEREF_STYLE_ID)) {
  const style = document.createElement("style");
  style.id = CODEREF_STYLE_ID;
  style.textContent = `
    .inline-demo-coderef {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 1px 8px 1px 6px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: #f8fafc;
      color: #0f172a;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.9em;
      line-height: 1.4;
      vertical-align: baseline;
    }
    .inline-demo-coderef-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #64748b;
      flex: none;
    }
  `;
  document.head.appendChild(style);
}

// Custom token: a full `renderMentionToken` override — a bordered, monospace,
// dot-prefixed chip that shares nothing with the built-in pill DOM. The dot uses
// the item's `color`, showing that custom renderers can still read `ref.color`.
function renderCodeRefToken(
  ctx: AgentWidgetContextMentionTokenRenderContext,
): HTMLElement {
  const { ref } = ctx;
  const el = document.createElement("span");
  el.className = "inline-demo-coderef";
  el.setAttribute("data-mention-source", ref.sourceId);
  el.title = ref.label;
  const dot = document.createElement("span");
  dot.className = "inline-demo-coderef-dot";
  if (ref.color) dot.style.background = ref.color;
  const label = document.createElement("span");
  label.textContent = ref.label;
  el.append(dot, label);
  return el;
}

// --- Per-display copy --------------------------------------------------------
const COPY = {
  chips: {
    welcomeTitle: "Context Mentions Demo",
    welcomeSubtitle: "Type @ or click the @ button to attach context.",
    inputPlaceholder: "Ask about a file or page section… (try @)",
    reply: (userText: string) =>
      "Here's what reached the model (mentions are merged into the LLM content):\n\n" +
      // Four backticks: the payload itself contains ``` fenced mention blocks
      // (contextMentions.llmFormat), so the display wrapper must out-fence them.
      "````\n" +
      userText +
      "\n````",
  },
  inline: {
    welcomeTitle: "Inline Context Mentions",
    welcomeSubtitle: "Type @ to drop a file token right into your sentence.",
    inputPlaceholder: "Ask about a file… (try @App)",
    reply: (userText: string) =>
      "Here's what reached the model (mention bodies are merged into the LLM " +
      // Four backticks: the payload itself contains ``` fenced mention blocks
      // (contextMentions.llmFormat), so the display wrapper must out-fence them.
      "content; the inline token is display-only):\n\n````\n" + userText + "\n````",
  },
} as const;

// --- Config ------------------------------------------------------------------
const buildConfig = (mode: Mode): AgentWidgetConfig => {
  const isLauncher = mode === "launcher";
  const display = activePill<Display>("cm-display", "chips");
  const chipRendering = activePill<ChipRendering>("cm-chip-rendering", "full");
  const tokenStyling = activePill<TokenStyling>("cm-token-styling", "colored");
  const copy = COPY[display];
  const filesSource = buildFilesSource(display, tokenStyling);

  const contextMentions: AgentWidgetContextMentionConfig =
    display === "inline"
      ? {
          enabled: true,
          display: "inline",
          sources: [filesSource],
          renderMentionToken:
            tokenStyling === "custom" ? renderCodeRefToken : undefined,
          onMentionRejected: (item, reason) =>
            log(`Rejected ${item.label} (${reason})`),
          onMentionResolveError: (item, error) =>
            log(`Resolve failed for ${item.label}: ${String(error)}`),
        }
      : {
          // The factory returns a full `contextMentions` config for the selected
          // bundle; we spread it and add this page's own callbacks.
          ...createSmartDomMentionsExperience({
            root: pageRoot,
            extraSources: [filesSource],
            log,
            ...CHIP_RENDERING[chipRendering].flags,
          }),
          onMentionRejected: (item, reason) =>
            log(`Rejected ${item.label} (${reason})`),
          onMentionResolveError: (item, error) =>
            log(`Resolve failed for ${item.label}: ${String(error)}`),
        };

  return {
    ...DEFAULT_WIDGET_CONFIG,
    apiUrl: "https://noop.test/chat",
    customFetch: createDemoEchoFetch({ reply: copy.reply }),
    storageAdapter: createLocalStorageAdapter(
      `persona-state-context-mentions-demo-${mode}`,
    ),
    launcher: {
      ...DEFAULT_WIDGET_CONFIG.launcher,
      enabled: isLauncher,
      width: isLauncher ? "min(420px, 95vw)" : "100%",
    },
    copy: {
      ...DEFAULT_WIDGET_CONFIG.copy,
      welcomeTitle: copy.welcomeTitle,
      welcomeSubtitle: copy.welcomeSubtitle,
      inputPlaceholder: copy.inputPlaceholder,
    },
    // Empty, not omitted: omitting falls through to DEFAULT_WIDGET_CONFIG's
    // chips. Chips send text verbatim and can't attach a mention.
    suggestionChips: [],
    contextMentions,
    postprocessMessage: ({ text }) => markdownPostprocessor(text),
  };
};

// --- Mount + live control switching ------------------------------------------
let activeController: AgentWidgetController | null = null;
let activeMode: Mode = "inline";
let activeStage: HTMLElement | null = null;

function remount(): void {
  if (!activeStage) return;
  activeController?.destroy();
  const { controller } = runWidgetMount(
    activeMode,
    activeStage,
    buildConfig(activeMode),
  );
  activeController = controller;
}

// Chip rendering applies only in Chips mode; Token styling only in Inline mode.
// Hide the section that doesn't apply to the current display.
const chipSection = document.getElementById("cm-chip-rendering-section");
const tokenSection = document.getElementById("cm-token-styling-section");
function syncSectionVisibility(display: Display): void {
  chipSection?.toggleAttribute("hidden", display !== "chips");
  tokenSection?.toggleAttribute("hidden", display !== "inline");
}

// Wire a segmented control: swap the active pill, run `onSelect`, then remount.
function wireGroup(groupId: string, onSelect: (mode: string) => void): void {
  const group = document.getElementById(groupId);
  group?.addEventListener("click", (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>(
      ".mode-btn",
    );
    if (!btn || btn.classList.contains("active")) return;
    group
      .querySelectorAll(".mode-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    onSelect(btn.dataset.mode ?? "");
    remount();
  });
}

wireGroup("cm-display", (mode) => {
  const display = mode as Display;
  syncSectionVisibility(display);
  log(`Display → ${DISPLAY[display]}`);
});
wireGroup("cm-chip-rendering", (mode) => {
  const v = CHIP_RENDERING[mode as ChipRendering];
  log(`Chip rendering → ${v.label}: ${v.description}`);
});
wireGroup("cm-token-styling", (mode) => {
  const v = TOKEN_STYLING[mode as TokenStyling];
  log(`Token styling → ${v.label}: ${v.description}`);
});

// Initial state reflects the DOM's active pills (Display=Chips) before mount.
syncSectionVisibility(activePill<Display>("cm-display", "chips"));

setupMountMode({
  slug: "context-mentions-demo",
  modes: ["inline", "launcher"],
  mount: (mode, { stage }) => {
    activeMode = mode;
    activeStage = stage;
    log(`Mounted (${mode})`);
    log(`Display → ${DISPLAY[activePill<Display>("cm-display", "chips")]}`);
    const { controller } = runWidgetMount(mode, stage, buildConfig(mode));
    activeController = controller;
    return () => {
      activeController?.destroy();
      activeController = null;
    };
  },
});
