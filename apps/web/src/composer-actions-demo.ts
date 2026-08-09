import "@runtypelabs/persona/widget.css";
import {
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetConfig,
  type AgentWidgetController,
  type ComposerAction,
} from "@runtypelabs/persona";

import { createDemoConfigInspector } from "./demo-config-inspector";
import { createDemoEchoFetch } from "./demo-echo-fetch";
import { renderDemoScaffold } from "./demo-scaffold";
import type { Mode } from "./examples-nav";
import { runWidgetMountWithInspector, setupMountMode } from "./mount-mode";
import { createEmojiQuickInsertPlugin } from "./plugins/emoji-quick-insert-plugin";
import { createPromptTemplatesPlugin } from "./plugins/prompt-templates-plugin";

let activeMode: Mode = "inline";
let activeStage: HTMLElement | null = null;
let activeController: AgentWidgetController | null = null;
let teardownActive: (() => void) | null = null;
let hostActionEnabled = true;

const scaffold = renderDemoScaffold({
  slug: "composer-actions-demo",
  title: "Composer actions",
  blurb:
    "One action registry feeding the composer from three sources at once: core built-ins, host config, and two independent plugins.",
});

const configInspector = createDemoConfigInspector({
  title: "Composer actions",
});

const composerFetch = createDemoEchoFetch({
  chunkSize: 6,
  delayMs: 22,
  reply: (userText) =>
    [
      `You sent “${userText}”.`,
      "",
      "Every control beside this composer came from the same registry: the paperclip is a core built-in, the clear-draft button is host config, and the emoji and template controls are two separate plugins.",
    ].join("\n"),
});

/** Host-config contributor: visible only while there is something to clear. */
const clearDraftAction: ComposerAction = {
  id: "clear-draft",
  placement: "start",
  order: 150,
  label: "Clear the draft",
  tooltipText: "Clear the draft",
  iconName: "x",
  visible: (state) => state.text.length > 0,
  disableWhenStreaming: true,
  onSelect: (ctx) => ctx.setValue(""),
};

const buildConfig = (mode: Mode): AgentWidgetConfig => ({
  ...DEFAULT_WIDGET_CONFIG,
  persistState: false,
  customFetch: composerFetch,
  attachments: { enabled: true },
  // Two plugins, both contributing, neither replacing the composer.
  plugins: [createEmojiQuickInsertPlugin(), createPromptTemplatesPlugin()],
  composer: {
    actions: hostActionEnabled ? [clearDraftAction] : [],
  },
  welcome: {
    title: "Composer actions",
    subtitle:
      "Try the emoji button, pick a template, then expand the draft to watch the busy state.",
  },
  suggestions: {
    starters: {
      items: [
        "Where is my order?",
        "How do returns work?",
        "Explain my last invoice",
      ],
      variant: "card",
      placement: "welcome",
      behavior: "fill",
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
    inputPlaceholder: "Type, or start from a template…",
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
  slug: "composer-actions-demo",
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

// Live config update: the host action is added and removed through
// controller.update(), with no remount and no effect on the plugin actions.
document
  .querySelector<HTMLButtonElement>(".composer-actions-host-button")
  ?.addEventListener("click", (event) => {
    hostActionEnabled = !hostActionEnabled;
    const button = event.currentTarget as HTMLButtonElement;
    button.textContent = hostActionEnabled
      ? "Remove the host action"
      : "Add the host action";
    activeController?.update({
      composer: { actions: hostActionEnabled ? [clearDraftAction] : [] },
    });
  });

// A second host action arrives live, ordered into the end cluster ahead of the
// mic and send built-ins.
document
  .querySelector<HTMLButtonElement>(".composer-actions-extra-button")
  ?.addEventListener("click", () => {
    activeController?.update({
      composer: {
        actions: [
          ...(hostActionEnabled ? [clearDraftAction] : []),
          {
            id: "shout",
            placement: "end",
            order: 650,
            label: "Add urgency to the draft",
            shortLabel: "Urgent",
            onSelect: (ctx) =>
              ctx.setValue(`${ctx.getValue()} (this is time sensitive)`.trim()),
          } satisfies ComposerAction,
        ],
      },
    });
  });

Object.defineProperty(window, "composerActionsDemoController", {
  configurable: true,
  get: () => activeController,
});

void scaffold;
