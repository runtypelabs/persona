import "@runtypelabs/persona/widget.css";
import {
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetConfig,
  type AgentWidgetController,
  type AgentWidgetMessage,
  type AgentWidgetPlugin,
} from "@runtypelabs/persona";

import { createDemoConfigInspector } from "./demo-config-inspector";
import { createDemoEchoFetch } from "./demo-echo-fetch";
import { renderDemoScaffold } from "./demo-scaffold";
import type { Mode } from "./examples-nav";
import {
  runWidgetMountWithInspector,
  setupMountMode,
} from "./mount-mode";
import {
  createCuratedSuggestionsPlugin,
  createCustomSuggestionsPlugin,
  createWelcomeHomePlugin,
} from "./plugins/suggestion-showcase-plugins";

type DemoVariant = "built-in" | "transform" | "custom" | "welcome";
type PreviewState = "starter" | "follow-up";
type WelcomeMode = "card" | "hero" | "greeting";

let variant: DemoVariant = "built-in";
let previewState: PreviewState = "starter";
let welcomeMode: WelcomeMode = "card";
let activeMode: Mode = "inline";
let activeStage: HTMLElement | null = null;
let activeController: AgentWidgetController | null = null;
let teardownActive: (() => void) | null = null;

const scaffold = renderDemoScaffold({
  slug: "suggestions-demo",
});

const configInspector = createDemoConfigInspector({
  title: "Suggestion Hooks",
});

// Single-line-first starters: verb-first, user-voice sentences of roughly 25 to
// 45 characters, each sampling a different capability. No `prompt` field, so
// with `behavior: "send"` the label is literally the message that gets sent.
// One item keeps a `description` to show it stays supported as additive
// context: it names the API the label does not carry.
const starterItems = [
  {
    id: "write-starters",
    label: "Write starter prompts for my app",
    icon: "sparkles" as const,
    emphasis: "primary" as const,
  },
  {
    id: "theming",
    label: "Theme suggestions to match my brand",
    icon: "settings" as const,
  },
  {
    id: "events",
    label: "Track which suggestions get clicked",
    icon: "activity" as const,
  },
  {
    id: "custom-ui",
    label: "Replace the cards with my own UI",
    description: "Uses the renderSuggestion plugin hook",
    icon: "code-xml" as const,
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

const suggestionsDemoFetch = createDemoEchoFetch({
  chunkSize: 7,
  delayMs: 24,
  reply: (userText) =>
    `You chose “${userText}”. This mock reply streams through Persona’s normal text pipeline so the starter and follow-up selection states are easy to verify.`,
});

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

// Config only: the same welcome namespace expresses the transient centered
// hero and the conversation-first greeting bubble.
// Voice layering: the subtitle states scope in the assistant's voice, the
// starter labels state tasks in the user's voice.
const welcomeForMode = (): AgentWidgetConfig["welcome"] => {
  const base = {
    title: "What should we explore?",
    subtitle:
      "I can help you configure, theme, and extend Persona's suggestion surfaces.",
  };
  if (welcomeMode === "hero") {
    return {
      ...base,
      variant: "hero",
      icon: { type: "lucide", name: "sparkles" },
    };
  }
  if (welcomeMode === "greeting") {
    return {
      ...base,
      message:
        "Hi, I'm the suggestions demo. Pick a starter below or ask your own question.",
    };
  }
  return base;
};

// Rebuilt per mount so the home plugin's `showHome` closure belongs to the
// widget instance the header action is wired to.
let welcomeHomePlugin: ReturnType<typeof createWelcomeHomePlugin> | null = null;

const pluginsForVariant = (): AgentWidgetPlugin[] => {
  if (variant === "transform") return [createCuratedSuggestionsPlugin()];
  if (variant === "custom") return [createCustomSuggestionsPlugin()];
  if (variant === "welcome") {
    welcomeHomePlugin = createWelcomeHomePlugin();
    return [welcomeHomePlugin];
  }
  welcomeHomePlugin = null;
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
  customFetch: suggestionsDemoFetch,
  launcher: {
    ...DEFAULT_WIDGET_CONFIG.launcher,
    enabled: mode === "launcher",
    width: mode === "launcher" ? "min(440px, 94vw)" : "100%",
    title: mode === "launcher" ? "Suggestion Hooks" : undefined,
  },
  welcome: welcomeForMode(),
  layout:
    variant === "welcome"
      ? {
          header: {
            trailingActions: [
              { id: "home", icon: "house", ariaLabel: "Back to home" },
            ],
            // The home stack overlays the transcript: plugin content renders
            // regardless of derived welcome visibility.
            onAction: (actionId: string) => {
              if (actionId === "home") welcomeHomePlugin?.showHome();
            },
          },
        }
      : undefined,
  copy: {
    ...DEFAULT_WIDGET_CONFIG.copy,
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
      remount();
    });
  });

document
  .querySelectorAll<HTMLButtonElement>(".suggestion-welcome-button")
  .forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.welcome as WelcomeMode | undefined;
      if (!next || next === welcomeMode) return;
      welcomeMode = next;
      document
        .querySelectorAll<HTMLButtonElement>(".suggestion-welcome-button")
        .forEach((candidate) =>
          candidate.setAttribute(
            "aria-pressed",
            candidate.dataset.welcome === welcomeMode ? "true" : "false",
          ),
        );
      remount();
    });
  });

document
  .querySelectorAll<HTMLButtonElement>(".suggestion-example-button")
  .forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.variant as DemoVariant | undefined;
      if (!next || next === variant) return;
      variant = next;
      document
        .querySelectorAll<HTMLButtonElement>(".suggestion-example-button")
        .forEach((candidate) =>
          candidate.setAttribute(
            "aria-pressed",
            candidate.dataset.variant === variant ? "true" : "false",
          ),
        );
      remount();
    });
  });

// Keep the value live for the browser console while exploring the demo.
Object.defineProperty(window, "suggestionsDemoController", {
  configurable: true,
  get: () => activeController,
});

void scaffold;
