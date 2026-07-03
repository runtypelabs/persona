import "@runtypelabs/persona/widget.css";
import { renderDemoScaffold } from "./demo-scaffold";
import {
  createLocalStorageAdapter,
  createStaticMentionSource,
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetConfig,
  type AgentWidgetContextMentionConfig,
  type AgentWidgetContextMentionItemRenderContext,
  type AgentWidgetController,
  type AgentWidgetRequestPayload,
  type SlashCommandDefinition,
} from "@runtypelabs/persona";
import { createSlashCommandsExperience } from "./commands/slash-commands-experience";
import { setupMountMode, runWidgetMount } from "./mount-mode";
import { createDemoEchoFetch } from "./demo-echo-fetch";
import type { Mode } from "./examples-nav";

// --- Variants ----------------------------------------------------------------
// One `/` engine, six previewable configs — each highlights a different skill
// flavor. Switching re-mounts the widget with the selected variant's config.
type VariantId = "prompt" | "actions" | "args" | "dual" | "custom" | "server";
const VARIANTS: Array<{ id: VariantId; label: string; description: string }> = [
  {
    id: "prompt",
    label: "Prompt macros",
    description: "/ commands that write a prompt into the composer (some auto-send)",
  },
  {
    id: "actions",
    label: "Client actions",
    description: "/clear, /help, /echo — run in the browser, no message sent",
  },
  {
    id: "args",
    label: "Args",
    description: "/deploy staging — text after the command name arrives as args",
  },
  {
    id: "dual",
    label: "@ + /",
    description: "Context mentions (@) and slash-commands (/) side by side",
  },
  {
    id: "custom",
    label: "Custom render",
    description: "Command rows styled via renderMentionItem (kbd badge)",
  },
  {
    id: "server",
    label: "Server skill",
    description: "/lookup 1042 — structured data sent to the backend via context.mentions",
  },
];
let selectedVariant: VariantId = "dual";

renderDemoScaffold({
  slug: "slash-commands-demo",
  variants: {
    label: "Skill flavor",
    initial: selectedVariant,
    options: VARIANTS.map(({ id, label, description }) => ({ id, label, description })),
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

// --- @ mentions source (for the "@ + /" variant) ----------------------------
const filesSource = createStaticMentionSource({
  id: "files",
  label: "Files",
  items: [
    { id: "app-tsx", label: "App.tsx", description: "React entry component", iconName: "file-code" },
    { id: "readme-md", label: "README.md", description: "Project overview", iconName: "file-text" },
    { id: "client-ts", label: "client.ts", description: "SSE streaming client", iconName: "file-code" },
  ],
  resolve: (item) => {
    log(`@ resolved: ${item.label}`);
    return { llmAppend: `Contents of ${item.label}: (demo stub)` };
  },
});

// --- Command sets, one per flavor -------------------------------------------
const promptCommands: SlashCommandDefinition[] = [
  {
    name: "summarize",
    description: "Summarize the conversation (auto-sends)",
    iconName: "text",
    kind: "prompt",
    prompt: "Please summarize our conversation so far.",
    submitOnSelect: true,
  },
  {
    name: "rewrite",
    description: "Insert a rewrite scaffold — edit, then send",
    iconName: "pencil",
    kind: "prompt",
    prompt: "Rewrite the following to be clearer and more concise:\n\n",
  },
  {
    name: "formal",
    description: "Ask for a more formal tone (auto-sends)",
    iconName: "briefcase",
    kind: "prompt",
    prompt: "Please rephrase your previous message in a more formal tone.",
    submitOnSelect: true,
  },
];

const actionCommands: SlashCommandDefinition[] = [
  {
    name: "clear",
    description: "Clear the conversation",
    iconName: "trash-2",
    kind: "action",
    action: () => {
      activeController?.clearChat();
      log("Action: /clear → cleared the transcript");
    },
  },
  {
    name: "help",
    description: "List the available commands",
    iconName: "help-circle",
    kind: "action",
    action: () => {
      activeController?.injectAssistantMessage({
        content:
          "**Commands**\n- `/clear` — clear the chat\n- `/help` — this list\n- `/echo <text>` — echo text back",
      });
      log("Action: /help → injected a help message");
    },
  },
  {
    name: "echo",
    description: "Echo the text typed after the command",
    iconName: "megaphone",
    kind: "action",
    action: ({ args }) => {
      activeController?.injectAssistantMessage({ content: args || "_(nothing to echo)_" });
      log(`Action: /echo → args "${args}"`);
    },
  },
];

const argsCommands: SlashCommandDefinition[] = [
  {
    name: "deploy",
    description: "Deploy to an environment — try: /deploy staging",
    iconName: "rocket",
    kind: "action",
    action: ({ args }) => {
      const env = args.trim();
      activeController?.injectAssistantMessage({
        content: env
          ? `🚀 Deploying to **${env}**… (demo action: the text after the command name arrived as \`args\`)`
          : "Usage: `/deploy <environment>`, e.g. `/deploy staging`.",
      });
      log(`Action: /deploy → env "${env || "(none)"}"`);
    },
  },
  {
    name: "greet",
    description: "Prompt macro built from args — try: /greet Ada",
    iconName: "hand",
    kind: "prompt",
    prompt: (args) => `Write a short, friendly greeting for ${args || "a new user"}.`,
    submitOnSelect: true,
  },
];

const serverCommands: SlashCommandDefinition[] = [
  {
    name: "lookup",
    description: "Look up an order — try: /lookup 1042",
    iconName: "search",
    kind: "server",
    data: (args) => ({ intent: "lookup-order", orderId: args }),
  },
];

// --- Custom command-row renderer (Custom render variant) --------------------
function renderCommandRow(
  ctx: AgentWidgetContextMentionItemRenderContext
): HTMLElement {
  const row = document.createElement("div");
  row.style.cssText = "display:flex;align-items:center;gap:10px;width:100%";
  const kbd = document.createElement("kbd");
  kbd.textContent = `/${ctx.item.label}`;
  kbd.style.cssText =
    "flex:0 0 auto;font:600 12px/1.4 ui-monospace,SFMono-Regular,monospace;" +
    "background:#111827;color:#fff;border-radius:6px;padding:2px 7px";
  const text = document.createElement("div");
  text.style.cssText = "min-width:0";
  const desc = document.createElement("div");
  desc.textContent = ctx.item.description ?? ctx.item.label;
  desc.style.cssText = "font-size:14px;color:var(--persona-text,#111827)";
  text.appendChild(desc);
  row.append(kbd, text);
  return row;
}

// --- Per-variant contextMentions config -------------------------------------
function buildContextMentions(variant: VariantId): AgentWidgetContextMentionConfig {
  const onError = (item: { label: string }, err: unknown) =>
    log(`Resolve failed for ${item.label}: ${String(err)}`);

  const commandsFor: Record<VariantId, SlashCommandDefinition[]> = {
    prompt: promptCommands,
    actions: actionCommands,
    args: argsCommands,
    dual: [...promptCommands.slice(0, 1), ...actionCommands.slice(0, 2)],
    custom: [...promptCommands, ...actionCommands],
    server: serverCommands,
  };

  return {
    enabled: true,
    // Only the "@ + /" variant registers an @ context source.
    sources: variant === "dual" ? [filesSource] : [],
    ...createSlashCommandsExperience({
      commands: commandsFor[variant],
      label: "Commands",
    }),
    ...(variant === "custom" ? { renderMentionItem: renderCommandRow } : {}),
    onMentionResolveError: onError,
  };
}

// --- Echo backend: prints context.mentions when a server command rode along --
const echoFetch = createDemoEchoFetch({
  reply: (userText: string, payload: AgentWidgetRequestPayload) => {
    const mentions = (payload.context as { mentions?: unknown } | undefined)?.mentions;
    if (mentions && Object.keys(mentions as object).length > 0) {
      log("Server: received context.mentions");
      return (
        "A server command reached the backend via `context.mentions`:\n\n```json\n" +
        JSON.stringify(mentions, null, 2) +
        "\n```"
      );
    }
    return userText
      ? `You said "${userText}". Type \`/\` at the start of a line for commands.`
      : "Type `/` at the start of a line to open the command menu.";
  },
});

const buildConfig = (mode: Mode): AgentWidgetConfig => {
  const isLauncher = mode === "launcher";
  return {
    ...DEFAULT_WIDGET_CONFIG,
    apiUrl: "https://noop.test/chat",
    customFetch: echoFetch,
    storageAdapter: createLocalStorageAdapter(`persona-state-slash-commands-demo-${mode}`),
    launcher: {
      ...DEFAULT_WIDGET_CONFIG.launcher,
      enabled: isLauncher,
      width: isLauncher ? "min(420px, 95vw)" : "100%",
    },
    copy: {
      ...DEFAULT_WIDGET_CONFIG.copy,
      welcomeTitle: "Slash Commands Demo",
      welcomeSubtitle: "Type / at the start of a line for commands (or @ for context).",
      inputPlaceholder: "Type / for commands…",
    },
    contextMentions: buildContextMentions(selectedVariant),
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
  const { controller } = runWidgetMount(activeMode, activeStage, buildConfig(activeMode));
  activeController = controller;
}

function selectVariant(id: VariantId): void {
  if (id === selectedVariant) return;
  selectedVariant = id;
  logVariant(id);
  remount();
}

setupMountMode({
  slug: "slash-commands-demo",
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
