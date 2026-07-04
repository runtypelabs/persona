import "@runtypelabs/persona/widget.css";
import { renderDemoScaffold } from "./demo-scaffold";
import {
  createLocalStorageAdapter,
  markdownPostprocessor,
  createStaticMentionSource,
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetConfig,
  type AgentWidgetContextMentionItem,
  type AgentWidgetController,
} from "@runtypelabs/persona";
import { createSmartDomMentionsExperience } from "./mentions/smart-dom-mentions-experience";
import { setupMountMode, runWidgetMount } from "./mount-mode";
import { createDemoEchoFetch } from "./demo-echo-fetch";
import type { Mode } from "./examples-nav";

// --- Variants ----------------------------------------------------------------
// One factory, four previewable configs — from the original built-in behavior
// (no smart DOM) up to the fully custom experience. Switching re-mounts the
// widget with the selected variant's config.
type VariantId = "default" | "badges" | "hover" | "preview" | "full";
type VariantFlags = {
  includePageSource: boolean;
  customRows: boolean;
  customChips: boolean;
  chipHover?: "default" | "popover";
};
const VARIANTS: Array<{
  id: VariantId;
  label: string;
  description: string;
  flags: VariantFlags;
}> = [
  {
    id: "default",
    label: "Default",
    description: "Built-in menu + chip, Files only (no smart DOM)",
    flags: { includePageSource: false, customRows: false, customChips: false },
  },
  {
    id: "badges",
    label: "Badges",
    description: "Custom menu rows: source badge + match highlight (smart DOM on)",
    flags: { includePageSource: true, customRows: true, customChips: false },
  },
  {
    id: "hover",
    label: "Hover",
    description:
      "Custom chips: hover a Page chip to highlight its live element (smart DOM on)",
    flags: { includePageSource: true, customRows: false, customChips: true },
  },
  {
    id: "preview",
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
  {
    id: "full",
    label: "Full",
    description: "Badges + hover + smart DOM — the shareable factory",
    flags: { includePageSource: true, customRows: true, customChips: true },
  },
];
let selectedVariant: VariantId = "full";
const variantFlags = (id: VariantId): VariantFlags =>
  VARIANTS.find((v) => v.id === id)?.flags ?? VARIANTS[0].flags;

renderDemoScaffold({
  slug: "context-mentions-demo",
  variants: {
    label: "Rendering",
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
  if (v) log(`Variant → ${v.label}: ${v.description}`);
}

// --- Source 1: static files, resolved on select (eager, cached) -------------
const FILE_BODIES: Record<string, string> = {
  "app-tsx": "export function App() {\n  return <Chat />;\n}",
  "readme-md": "# Persona\nThemeable streaming chat widget for the web.",
  "client-ts": "export class AgentWidgetClient {\n  // SSE dispatch + streaming\n}",
  "theme-css": ":root { --persona-accent: #0f0f0f; }",
};

const FILE_ITEMS: AgentWidgetContextMentionItem[] = [
  { id: "app-tsx", label: "App.tsx", description: "React entry component", iconName: "file-code" },
  { id: "readme-md", label: "README.md", description: "Project overview", iconName: "file-text" },
  { id: "client-ts", label: "client.ts", description: "SSE streaming client", iconName: "file-code" },
  { id: "theme-css", label: "theme.css", description: "Design tokens", iconName: "file-text" },
];

const filesSource = createStaticMentionSource({
  id: "files",
  label: "Files",
  items: FILE_ITEMS,
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

const buildConfig = (mode: Mode): AgentWidgetConfig => {
  const isLauncher = mode === "launcher";
  const flags = variantFlags(selectedVariant);
  return {
    ...DEFAULT_WIDGET_CONFIG,
    apiUrl: "https://noop.test/chat",
    customFetch: createDemoEchoFetch({
      reply: (userText) =>
        "Here's what reached the model (mentions are merged into the LLM content):\n\n" +
        "```\n" +
        userText +
        "\n```",
    }),
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
      welcomeTitle: "Context Mentions Demo",
      welcomeSubtitle: "Type @ or click the @ button to attach context.",
      inputPlaceholder: "Ask about a file or page section… (try @)",
    },
    // Suggestion chips send their text verbatim (they don't attach a mention),
    // so these are plain prompts — use @ or the button to attach real context.
    suggestionChips: ["Summarize the App.tsx file", "What's in the pricing section?"],
    // The factory returns a full `contextMentions` config for the selected
    // variant; we spread it and add this page's own callbacks — showing how a
    // shared experience composes with local config.
    contextMentions: {
      ...createSmartDomMentionsExperience({
        root: pageRoot,
        extraSources: [filesSource],
        log,
        includePageSource: flags.includePageSource,
        customRows: flags.customRows,
        customChips: flags.customChips,
        chipHover: flags.chipHover,
      }),
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
  slug: "context-mentions-demo",
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
