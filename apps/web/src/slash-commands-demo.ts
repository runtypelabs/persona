import "@runtypelabs/persona/widget.css";
import { renderDemoScaffold } from "./demo-scaffold";
import {
  createLocalStorageAdapter,
  createStaticMentionSource,
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetConfig,
  type AgentWidgetContextMentionConfig,
  type AgentWidgetController,
  type AgentWidgetRequestPayload,
  type SlashCommandDefinition,
} from "@runtypelabs/persona";
import { createSlashCommandsExperience } from "./commands/slash-commands-experience";
import { setupMountMode, runWidgetMount } from "./mount-mode";
import { createDemoEchoFetch } from "./demo-echo-fetch";
import type { Mode } from "./examples-nav";

// --- Variants ----------------------------------------------------------------
// One `/` engine, three previewable configs — one per dispatch KIND. Args and
// @-coexistence aren't separate kinds: each variant already carries an arg
// example, and the Client actions variant also registers an `@` context source
// so you can see commands and mentions living on one engine. Switching re-mounts
// the widget with the selected variant's config.
type VariantId = "prompt" | "actions" | "server";
const VARIANTS: Array<{ id: VariantId; label: string; description: string }> = [
  {
    id: "prompt",
    label: "Prompt macros",
    description: "/ commands that write a prompt into the composer (some auto-send)",
  },
  {
    id: "actions",
    label: "Client actions",
    description: "/clear, /help, /echo run in the browser — plus @ context mentions",
  },
  {
    id: "server",
    label: "Server skill",
    description: "/lookup 1042 — structured data sent to the backend via context.mentions",
  },
];
let selectedVariant: VariantId = "prompt";

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
  {
    name: "greet",
    description: "Prompt built from an argument — try: /greet Ada",
    iconName: "hand",
    kind: "prompt",
    argsPlaceholder: "name",
    prompt: (args) => `Write a short, friendly greeting for ${args || "a new user"}.`,
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
      // Build the list from the commands actually registered for the current
      // variant, so /help never advertises a command that isn't wired up.
      const list = commandsForVariant(selectedVariant)
        .map((c) => `- \`/${c.name}\` — ${c.description ?? ""}`)
        .join("\n");
      activeController?.injectAssistantMessage({ content: `**Commands**\n${list}` });
      log("Action: /help → injected the registered command list");
    },
  },
  {
    name: "echo",
    description: "Echo the text typed after the command",
    iconName: "megaphone",
    kind: "action",
    argsPlaceholder: "text",
    action: ({ args }) => {
      activeController?.injectAssistantMessage({ content: args || "_(nothing to echo)_" });
      log(`Action: /echo → args "${args}"`);
    },
  },
];

const serverCommands: SlashCommandDefinition[] = [
  {
    name: "lookup",
    description: "Look up an order — try: /lookup 1042",
    iconName: "search",
    kind: "server",
    argsPlaceholder: "order id",
    data: (args) => ({ intent: "lookup-order", orderId: args }),
  },
];

// The commands registered for each variant. Shared by the config builder and
// the /help action so the two never drift.
function commandsForVariant(variant: VariantId): SlashCommandDefinition[] {
  const byVariant: Record<VariantId, SlashCommandDefinition[]> = {
    prompt: promptCommands,
    actions: actionCommands,
    server: serverCommands,
  };
  return byVariant[variant];
}

// --- Per-variant contextMentions config -------------------------------------
function buildContextMentions(variant: VariantId): AgentWidgetContextMentionConfig {
  const onError = (item: { label: string }, err: unknown) =>
    log(`Resolve failed for ${item.label}: ${String(err)}`);

  return {
    enabled: true,
    // Commands and @ mentions share one engine. Only the Client actions variant
    // also registers an @ context source, so the other variants show a pure
    // slash-command composer for contrast.
    sources: variant === "actions" ? [filesSource] : [],
    ...createSlashCommandsExperience({
      commands: commandsForVariant(variant),
      label: "Commands",
    }),
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
