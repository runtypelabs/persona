import "@runtypelabs/persona/widget.css";
import {
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetConfig,
  type AgentWidgetController,
} from "@runtypelabs/persona";

import { createDemoConfigInspector } from "./demo-config-inspector";
import { createDemoEchoFetch } from "./demo-echo-fetch";
import { renderDemoScaffold } from "./demo-scaffold";
import type { Mode } from "./examples-nav";
import { runWidgetMountWithInspector, setupMountMode } from "./mount-mode";
import {
  createPreChatPlugin,
  type PreChatField,
  type PreChatPlugin,
} from "./plugins/pre-chat-plugin";

type FieldPreset = "standard" | "email-only";

let fieldPreset: FieldPreset = "standard";
let persistIdentity = true;
let activeMode: Mode = "inline";
let activeStage: HTMLElement | null = null;
let activeController: AgentWidgetController | null = null;
let activePlugin: PreChatPlugin | null = null;
let teardownActive: (() => void) | null = null;

const scaffold = renderDemoScaffold({
  slug: "pre-chat-demo",
  title: "Pre-chat form",
  blurb:
    "Gate the first turn behind a short identity form, built entirely on the renderWelcome and renderComposer hooks.",
});

const configInspector = createDemoConfigInspector({
  title: "Pre-chat form",
});

const FIELD_PRESETS: Record<FieldPreset, PreChatField[]> = {
  standard: [
    { name: "name", label: "Name", type: "text", required: true },
    { name: "email", label: "Email", type: "email", required: true },
    {
      name: "topic",
      label: "Topic",
      type: "select",
      options: ["Billing", "Technical help", "Something else"],
    },
  ],
  "email-only": [
    { name: "email", label: "Email", type: "email", required: true },
  ],
};

// Echoes what actually reached the request path, so the `contextProviders`
// entry is visible without a backend.
const preChatFetch = createDemoEchoFetch({
  chunkSize: 6,
  delayMs: 22,
  reply: (userText, payload) => {
    const context = (payload as { context?: Record<string, unknown> }).context;
    const visitor = context?.visitor as Record<string, string> | undefined;
    const identity = visitor
      ? Object.entries(visitor)
          .map(([key, value]) => `${key}: ${value}`)
          .join(", ")
      : "nothing yet";
    return [
      `You asked “${userText}”.`,
      "",
      `Every dispatch from this page carries the captured identity in \`context.visitor\`. This turn carried ${identity}.`,
    ].join("\n");
  },
});

const buildConfig = (mode: Mode): AgentWidgetConfig => {
  // One plugin instance per mount.
  const plugin = createPreChatPlugin({
    fields: FIELD_PRESETS[fieldPreset],
    title: "Before we start",
    description:
      "Share a few details so the assistant can pick up where you left off.",
    submitLabel: "Start chatting",
  });
  activePlugin = plugin;

  return {
    ...DEFAULT_WIDGET_CONFIG,
    // The kill switch downgrades `ctx.storage` to memory, so the form re-asks
    // on every load: the correct privacy-mode behavior.
    persistState: persistIdentity
      ? { keyPrefix: "persona-pre-chat-demo-" }
      : false,
    plugins: [plugin],
    contextProviders: [plugin.contextProvider],
    customFetch: preChatFetch,
    welcome: {
      title: "How can we help?",
      subtitle:
        "I can answer product questions and hand off to a person when you need one.",
    },
    suggestions: {
      starters: {
        items: [
          "Check the status of my order",
          "Update my billing details",
          "Talk to a person",
        ],
        variant: "card",
        placement: "welcome",
        behavior: "send",
        maxItems: 3,
      },
    },
    launcher: {
      ...DEFAULT_WIDGET_CONFIG.launcher,
      enabled: mode === "launcher",
      width: mode === "launcher" ? "min(420px, 94vw)" : "100%",
      title: mode === "launcher" ? "Support" : undefined,
    },
    copy: {
      ...DEFAULT_WIDGET_CONFIG.copy,
      inputPlaceholder: "Ask a question…",
    },
  };
};

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
  slug: "pre-chat-demo",
  modes: ["inline", "launcher"],
  mount: (mode, { stage }) => {
    activeMode = mode;
    activeStage = stage;
    remount();
    return () => {
      teardownActive?.();
      teardownActive = null;
      activeController = null;
      activePlugin = null;
      activeStage = null;
    };
  },
});

const syncPressed = (selector: string, dataKey: string, value: string) => {
  document
    .querySelectorAll<HTMLButtonElement>(selector)
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        button.dataset[dataKey] === value ? "true" : "false",
      ),
    );
};

document
  .querySelectorAll<HTMLButtonElement>(".pre-chat-fields-button")
  .forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.fields as FieldPreset | undefined;
      if (!next || next === fieldPreset) return;
      fieldPreset = next;
      syncPressed(".pre-chat-fields-button", "fields", fieldPreset);
      remount();
    });
  });

document
  .querySelectorAll<HTMLButtonElement>(".pre-chat-persist-button")
  .forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.persist === "on";
      if (next === persistIdentity) return;
      persistIdentity = next;
      syncPressed(".pre-chat-persist-button", "persist", next ? "on" : "off");
      remount();
    });
  });

// Re-gates in place: both hooks re-run through their own `requestRender()`, no
// remount involved. The transcript clears too, so this is a returning-visitor
// reset rather than a mid-conversation re-gate.
document
  .querySelector<HTMLButtonElement>(".pre-chat-reset-button")
  ?.addEventListener("click", () => {
    activeController?.clearChat();
    activePlugin?.reset();
  });

// Live config update: the welcome copy changes under an active plugin surface,
// proving the gate survives `controller.update()`.
document
  .querySelector<HTMLButtonElement>(".pre-chat-update-button")
  ?.addEventListener("click", () => {
    activeController?.update({
      welcome: {
        title: "Support desk",
        subtitle: "Answers on orders, billing, and returns.",
      },
    });
  });

// Keep the value live for the browser console while exploring the demo.
Object.defineProperty(window, "preChatDemoController", {
  configurable: true,
  get: () => activeController,
});

Object.defineProperty(window, "preChatDemoIdentity", {
  configurable: true,
  get: () => activePlugin?.getIdentity() ?? null,
});

void scaffold;
