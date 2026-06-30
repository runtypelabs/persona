import "@runtypelabs/persona/widget.css";
import { renderDemoScaffold } from "./demo-scaffold";
import {
  createLocalStorageAdapter,
  markdownPostprocessor,
  createStaticMentionSource,
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetConfig,
  type AgentWidgetContextMentionItem,
} from "@runtypelabs/persona";
import { createSmartDomMentionSource } from "@runtypelabs/persona/smart-dom-reader";
import { setupMountMode, runWidgetMount } from "./mount-mode";
import { createDemoEchoFetch } from "./demo-echo-fetch";
import type { Mode } from "./examples-nav";

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

// --- Source 2: the supported smart-dom source, resolved at SUBMIT ------------
// `createSmartDomMentionSource` surfaces visible page elements (Shadow-DOM
// piercing) as mentionable items and reads the chosen element's live text at
// send time (`resolveOn: "submit"`), since the page is time-sensitive. Scoped
// to the demo's controls panel so the menu stays focused on this page's content.
const pageRoot =
  document.querySelector<HTMLElement>(".stage-controls") ?? undefined;
const pageSource = createSmartDomMentionSource({
  id: "page",
  label: "Page",
  mode: "full",
  ...(pageRoot ? { root: pageRoot } : {}),
});

const buildConfig = (mode: Mode): AgentWidgetConfig => {
  const isLauncher = mode === "launcher";
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
    suggestionChips: ["Summarize @App.tsx", "What's in the pricing section?"],
    contextMentions: {
      enabled: true,
      sources: [filesSource, pageSource],
      onMentionRejected: (item, reason) =>
        log(`Rejected ${item.label} (${reason})`),
      onMentionResolveError: (item, error) =>
        log(`Resolve failed for ${item.label}: ${String(error)}`),
    },
    postprocessMessage: ({ text }) => markdownPostprocessor(text),
  };
};

setupMountMode({
  slug: "context-mentions-demo",
  modes: ["inline", "launcher"],
  mount: (mode, { stage }) => {
    log(`Mounted (${mode})`);
    const { teardown } = runWidgetMount(mode, stage, buildConfig(mode));
    return teardown;
  },
});
