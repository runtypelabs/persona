import "@runtypelabs/persona/widget.css";
import { renderDemoScaffold } from "./demo-scaffold";
import {
  createLocalStorageAdapter,
  createStaticMentionSource,
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetConfig,
  type AgentWidgetContextMentionItem,
  type AgentWidgetContextMentionTokenRenderContext,
  type AgentWidgetController,
} from "@runtypelabs/persona";
import { setupMountMode, runWidgetMount } from "./mount-mode";
import { createDemoEchoFetch } from "./demo-echo-fetch";
import type { Mode } from "./examples-nav";

// Inline-mention showcase: one static file source, `display: "inline"`, mounted
// through the shared demo scaffold (top nav + Preview|Code + inline/launcher
// pills) so it reads as a sibling of the chip-mode context-mentions demo. The
// per-demo control is a "Token styling" toggle exercising the three levels of
// control over the inline token's look.

// --- Variants ----------------------------------------------------------------
// One inline engine, three previewable token treatments. Switching re-mounts the
// widget with the selected variant's config.
type VariantId = "colored" | "monochrome" | "custom";
const VARIANTS: Array<{ id: VariantId; label: string; description: string }> = [
  {
    id: "colored",
    label: "Colored",
    description: "Per-type `color` tints the whole pill (icon + text)",
  },
  {
    id: "monochrome",
    label: "Monochrome",
    description: "No `color` — tokens fall back to the theme accent",
  },
  {
    id: "custom",
    label: "Custom",
    description: "`renderMentionToken` replaces the token DOM entirely",
  },
];
let selectedVariant: VariantId = "colored";

renderDemoScaffold({
  slug: "context-mentions-inline-demo",
  variants: {
    label: "Token styling",
    initial: selectedVariant,
    options: VARIANTS.map(({ id, label, description }) => ({
      id,
      label,
      description,
    })),
    onSelect: (id) => selectVariant(id as VariantId),
  },
});

const logEl = document.getElementById("log");
function log(msg: string) {
  if (!logEl) return;
  const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
  const line = document.createElement("div");
  line.textContent = `[${ts}] ${msg}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}
function logVariant(id: VariantId) {
  const v = VARIANTS.find((x) => x.id === id);
  if (v) log(`Token styling → ${v.label}: ${v.description}`);
}

// --- Source: static files, resolved on select ------------------------------
// `color` sets each token's accent (tints the whole pill + icon, Slack/Linear
// style). Varying it by file type shows the pluggable "color per type" knob; the
// Monochrome variant drops it so tokens use the theme accent instead.
const FILE_ITEMS: AgentWidgetContextMentionItem[] = [
  { id: "app-tsx", label: "App.tsx", description: "React entry component", iconName: "file-code", color: "#2563eb" },
  { id: "readme-md", label: "README.md", description: "Project overview", iconName: "file-text", color: "#64748b" },
  { id: "client-ts", label: "client.ts", description: "SSE streaming client", iconName: "file-code", color: "#7c3aed" },
  { id: "theme-css", label: "theme.css", description: "Design tokens", iconName: "file-text", color: "#db2777" },
];

const FILE_BODIES: Record<string, string> = {
  "app-tsx": "export default function App() { return <Chat /> }",
  "readme-md": "# Persona\nThemeable streaming chat UI in plain JS.",
  "client-ts": "export class AgentWidgetClient { /* SSE dispatch */ }",
  "theme-css": ":root { --persona-accent: #4338ca }",
};

// Strip the per-item accent for the Monochrome variant.
const itemsForVariant = (id: VariantId): AgentWidgetContextMentionItem[] =>
  id === "monochrome"
    ? FILE_ITEMS.map(({ color: _color, ...rest }) => rest)
    : FILE_ITEMS;

const buildSource = (id: VariantId) =>
  createStaticMentionSource({
    id: "files",
    label: "Files",
    items: itemsForVariant(id),
    resolve: (item) => {
      log(`Resolved file on select: ${item.label}`);
      return { llmAppend: `Contents of ${item.label}:\n${FILE_BODIES[item.id] ?? ""}` };
    },
  });

// Page-scoped styles for the Custom variant token. The widget mounts without
// Shadow DOM here, so demo-page CSS reaches tokens in both the composer and the
// sent bubble. Injected once, guarded by id.
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

// Custom variant: a full `renderMentionToken` override — a bordered, monospace,
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

// --- Config -----------------------------------------------------------------
const buildConfig = (mode: Mode): AgentWidgetConfig => {
  const isLauncher = mode === "launcher";
  return {
    ...DEFAULT_WIDGET_CONFIG,
    apiUrl: "https://noop.test/chat",
    customFetch: createDemoEchoFetch({
      reply: (userText) =>
        "Here's what reached the model (mention bodies are merged into the LLM " +
        // Four backticks: the payload itself contains ``` fenced mention blocks
        // (contextMentions.llmFormat), so the display wrapper must out-fence them.
        "content; the inline token is display-only):\n\n````\n" + userText + "\n````",
    }),
    storageAdapter: createLocalStorageAdapter(
      `persona-state-context-mentions-inline-demo-${mode}`,
    ),
    launcher: {
      ...DEFAULT_WIDGET_CONFIG.launcher,
      enabled: isLauncher,
      width: isLauncher ? "min(420px, 95vw)" : "100%",
    },
    copy: {
      ...DEFAULT_WIDGET_CONFIG.copy,
      welcomeTitle: "Inline Context Mentions",
      welcomeSubtitle: "Type @ to drop a file token right into your sentence.",
      inputPlaceholder: "Ask about a file… (try @App)",
    },
    suggestionChips: ["Summarize @App.tsx", "Compare client.ts and theme.css"],
    contextMentions: {
      enabled: true,
      display: "inline",
      sources: [buildSource(selectedVariant)],
      renderMentionToken:
        selectedVariant === "custom" ? renderCodeRefToken : undefined,
      onMentionRejected: (item, reason) =>
        log(`Rejected ${item.label} (${reason})`),
      onMentionResolveError: (item, error) =>
        log(`Resolve failed for ${item.label}: ${String(error)}`),
    },
    postprocessMessage: ({ text }) => markdownPostprocessor(text),
  };
};

// --- Mount + live variant switching -----------------------------------------
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

function selectVariant(id: VariantId): void {
  if (id === selectedVariant) return;
  selectedVariant = id;
  logVariant(id);
  remount();
}

setupMountMode({
  slug: "context-mentions-inline-demo",
  modes: ["inline", "launcher"],
  mount: (mode, { stage }) => {
    activeMode = mode;
    activeStage = stage;
    log(`Mounted (${mode})`);
    logVariant(selectedVariant);
    const { controller } = runWidgetMount(mode, stage, buildConfig(mode));
    activeController = controller;
    return () => {
      activeController?.destroy();
      activeController = null;
    };
  },
});
