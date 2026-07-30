import "@runtypelabs/persona/widget.css";
import {
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetConfig,
  type AgentWidgetController,
  type AgentWidgetMessage,
  type AgentWidgetPlugin,
} from "@runtypelabs/persona";
import { createMockSSEResponse } from "@runtypelabs/persona/testing";

import { createDemoConfigInspector } from "./demo-config-inspector";
import { renderDemoScaffold } from "./demo-scaffold";
import type { Mode } from "./examples-nav";
import {
  runWidgetMountWithInspector,
  setupMountMode,
} from "./mount-mode";
import {
  createCuratedSuggestionsPlugin,
  createCustomSuggestionsPlugin,
} from "./plugins/suggestion-showcase-plugins";

type DemoVariant = "built-in" | "transform" | "custom";
type PreviewState = "starter" | "follow-up";

let variant: DemoVariant = "built-in";
let previewState: PreviewState = "starter";
let activeMode: Mode = "inline";
let activeStage: HTMLElement | null = null;
let activeController: AgentWidgetController | null = null;
let teardownActive: (() => void) | null = null;

const eventLog = (): HTMLElement | null =>
  document.getElementById("suggestion-event-log");

const logSelection = (message: string): void => {
  const log = eventLog();
  if (!log) return;
  const entry = document.createElement("div");
  entry.textContent = message;
  log.prepend(entry);
  while (log.children.length > 5) log.lastElementChild?.remove();
};

const scaffold = renderDemoScaffold({
  slug: "suggestions-demo",
  variants: {
    label: "Example",
    initial: variant,
    options: [
      {
        id: "built-in",
        label: "Built-in",
        description: "Structured suggestions using Persona's default renderer.",
      },
      {
        id: "transform",
        label: "Transform",
        description: "Enrich and rank data while keeping the default UI.",
      },
      {
        id: "custom",
        label: "Custom UI",
        description: "Replace every suggestion with a plugin-rendered element.",
      },
    ],
    onSelect: (id) => {
      variant = id as DemoVariant;
      remount();
    },
  },
});

const configInspector = createDemoConfigInspector({
  title: "Suggestion Hooks",
});

const starterItems = [
  {
    id: "implementation",
    label: "Show me an implementation",
    prompt: "Show me a complete suggestions implementation",
    description: "See configured starters and agent follow-ups together",
    icon: "code-xml" as const,
    emphasis: "primary" as const,
  },
  {
    id: "theming",
    label: "Explore theming",
    prompt: "How can I theme suggestions?",
    description: "Customize tokens, variants, and responsive behavior",
    icon: "settings" as const,
  },
  {
    id: "events",
    label: "Track selections",
    prompt: "How do suggestion selection events work?",
    description: "Use plugin hooks or cancelable DOM events",
    icon: "activity" as const,
  },
  {
    id: "agent",
    label: "Add agent follow-ups",
    prompt: "How does suggest_replies produce follow-ups?",
    description: "Render contextual next steps after an answer",
    icon: "sparkles" as const,
  },
];

const followUpItems = [
  {
    id: "copy-plugin",
    label: "Copy the plugin example",
    prompt: "Show me the full custom suggestions plugin",
    description: "Start from the implementation used on this page",
  },
  {
    id: "selection-api",
    label: "Review the selection API",
    prompt: "Explain select(), send, fill, and cancellation",
    description: "Keep custom UI inside Persona's interaction lifecycle",
  },
  {
    id: "shadow-dom",
    label: "Make styles Shadow DOM safe",
    prompt: "How should suggestion plugins inject their styles?",
    description: "Use the optional plugin-kit helper",
  },
];

const followUpMessages = (): AgentWidgetMessage[] => [
  {
    id: "demo-user",
    role: "user",
    content: "How customizable are suggestions?",
    createdAt: "2026-07-28T12:00:00.000Z",
    streaming: false,
  },
  {
    id: "demo-assistant",
    role: "assistant",
    content:
      "You can transform the data, replace every suggestion element, and intercept selection while preserving Persona’s lifecycle.",
    createdAt: "2026-07-28T12:00:01.000Z",
    streaming: false,
  },
  {
    id: "demo-suggest-replies",
    role: "assistant",
    content: "",
    createdAt: "2026-07-28T12:00:02.000Z",
    streaming: false,
    variant: "tool",
    toolCall: {
      id: "demo-suggest-replies",
      name: "suggest_replies",
      status: "complete",
      args: { suggestions: followUpItems },
      chunks: [],
    },
  },
];

const pluginsForVariant = (): AgentWidgetPlugin[] => {
  if (variant === "transform") return [createCuratedSuggestionsPlugin()];
  if (variant === "custom") {
    return [createCustomSuggestionsPlugin(logSelection)];
  }
  return [];
};

const buildConfig = (mode: Mode): AgentWidgetConfig => ({
  ...DEFAULT_WIDGET_CONFIG,
  persistState: false,
  plugins: pluginsForVariant(),
  initialMessages:
    previewState === "follow-up" ? followUpMessages() : [],
  suggestions: {
    starters: {
      items: starterItems,
      variant: "card",
      placement: "welcome",
      behavior: variant === "custom" ? "fill" : "send",
      maxItems: 4,
    },
    followUps: {
      variant: variant === "custom" ? "list" : "chip",
      placement: "after-message",
      behavior: variant === "custom" ? "fill" : "send",
      overflow: "scroll",
      maxItems: 4,
    },
  },
  customFetch: async () =>
    createMockSSEResponse([{ type: "done" }], { delayMs: 0 }),
  launcher: {
    ...DEFAULT_WIDGET_CONFIG.launcher,
    enabled: mode === "launcher",
    width: mode === "launcher" ? "min(440px, 94vw)" : "100%",
    title: mode === "launcher" ? "Suggestion Hooks" : undefined,
  },
  copy: {
    ...DEFAULT_WIDGET_CONFIG.copy,
    welcomeTitle: "What should we explore?",
    welcomeSubtitle:
      "These suggestions can stay built-in or be completely replaced by a plugin.",
    inputPlaceholder: "Choose a suggestion or write your own…",
  },
});

function remount(): void {
  if (!activeStage) return;
  teardownActive?.();
  const mounted = runWidgetMountWithInspector(
    configInspector,
    activeMode,
    activeStage,
    buildConfig,
  );
  activeController = mounted.controller;
  teardownActive = mounted.teardown;
}

setupMountMode({
  slug: "suggestions-demo",
  modes: ["inline", "launcher"],
  mount: (mode, { stage }) => {
    activeMode = mode;
    activeStage = stage;
    remount();
    return () => {
      teardownActive?.();
      teardownActive = null;
      activeController = null;
      activeStage = null;
    };
  },
});

document
  .querySelectorAll<HTMLButtonElement>(".suggestion-state-button")
  .forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.state as PreviewState | undefined;
      if (!next || next === previewState) return;
      previewState = next;
      document
        .querySelectorAll<HTMLButtonElement>(".suggestion-state-button")
        .forEach((candidate) =>
          candidate.setAttribute(
            "aria-pressed",
            candidate.dataset.state === previewState ? "true" : "false",
          ),
        );
      logSelection(`Preview state: ${previewState}`);
      remount();
    });
  });

document.addEventListener("persona:suggestion:selected", (event) => {
  if (variant === "custom") return;
  const detail = (event as CustomEvent).detail;
  logSelection(
    `${detail.surface} · ${detail.source} · ${detail.behavior}: “${detail.suggestion.label}”`,
  );
});

// Keep the value live for the browser console while exploring the demo.
Object.defineProperty(window, "suggestionsDemoController", {
  configurable: true,
  get: () => activeController,
});

void scaffold;
