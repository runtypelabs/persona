import "@runtypelabs/persona/widget.css";
import { renderDemoScaffold } from "./demo-scaffold";

import {
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetConfig,
  type AgentWidgetController,
} from "@runtypelabs/persona";
import {
  createMockSSEResponse,
  createMockSSEStream,
  type MockSSEFrame,
} from "@runtypelabs/persona/testing";
import { setupMountMode, runWidgetMountWithInspector } from "./mount-mode";
import { createDemoConfigInspector } from "./demo-config-inspector";
// `renderApproval` plugin example: shows an alternative permission prompt
// ("Always allow / Allow once / Deny"). Untyped JS import (mirrors the
// ask-user-question pills plugin); the widget plugin contract is duck-typed.
// The `icons` map gives the "Runtype" source an explicit square icon (served
// from /public); pass `faviconService: true` instead to use Google's favicon
// service, or omit both to fall back to the default tool icon.
import { createApprovalActionsPlugin } from "./plugins/approval-actions-plugin.js";
import type { Mode } from "./examples-nav";

renderDemoScaffold({ slug: "approval-demo" });

const configInspector = createDemoConfigInspector({ title: "Tool Approval" });
let approvalMountMode: Mode = "inline";
type ApprovalVariant = "builtin" | "plugin";
let variant: ApprovalVariant = "builtin";

// Icon source for the plugin renderer's source-icon box. Mirrors the three
// resolution paths in approval-actions-plugin: explicit `icons` map, the
// optional Google favicon service, or the built-in default tool icon.
type IconMode = "map" | "google" | "default";
let iconMode: IconMode = "map";

const buildApprovalPlugin = () => {
  if (iconMode === "google") return createApprovalActionsPlugin({ faviconService: true, faviconSize: 128 });
  if (iconMode === "default") return createApprovalActionsPlugin();
  return createApprovalActionsPlugin({ icons: { Runtype: "/sample-icon.svg" } });
};

let activeController: AgentWidgetController | null = null;
let lastApprovalDecision: "approved" | "denied" | null = null;

// The widget consumes Persona's event vocabulary (`execution_start`,
// `turn_start`, `text_*`, `tool_*`, `approval_*`, …). On a real deployment the
// Runtype API translates the agent runtime's legacy `agent_*` frames into these
// before they reach the browser, so a `customFetch` mock — which bypasses the
// server — must emit wire frames directly. Emitting legacy `agent_*` names
// here is silently dropped by the client and nothing renders.
//
// Builds one assistant turn: turn_start → text_start → text_delta(s) →
// text_complete → turn_complete. `text_complete` seals the bubble so the
// trailing approval/tool bubble renders below it instead of leaving an
// open streaming bubble.
const assistantTurn = (
  executionId: string,
  turnId: string,
  iteration: number,
  deltas: string[],
  stopReason?: string,
): MockSSEFrame[] => {
  const blockId = `${turnId}-text`;
  return [
    { type: "turn_start", executionId, id: turnId, iteration },
    { type: "text_start", executionId, id: blockId },
    ...deltas.map((delta) => ({ type: "text_delta", executionId, id: blockId, delta })),
    { type: "text_complete", executionId, id: blockId },
    { type: "turn_complete", executionId, id: turnId, ...(stopReason ? { stopReason } : {}) },
  ];
};

const buildConfig = (mode: Mode): AgentWidgetConfig => {
  const launcherChrome = mode === "launcher";
  return {
    ...DEFAULT_WIDGET_CONFIG,
    // Ephemeral: this is a canned mock demo (every send replays the same
    // scripted approval flow), so persisting the conversation only leaves stale
    // user bubbles on the next load — which look identical to the dark
    // suggestion chips and suppress the real chips (they hide once any user
    // message exists). `persistState: false` is the kill-switch: no history is
    // read or written (the built-in localStorage adapter isn't even created), so
    // a fresh load always shows the working chips — like the other mock-driven
    // demo (fullscreen-assistant-demo-sse).
    persistState: false,
    plugins: variant === "plugin" ? [buildApprovalPlugin()] : [],
    customFetch: async () => {
      const executionId = "exec-demo-1";
      const events: MockSSEFrame[] = [
        { type: "execution_start", kind: "agent", executionId, agentId: "demo-agent", agentName: "Demo Agent", maxTurns: 3, startedAt: Date.now() },
        ...assistantTurn(executionId, "turn-1", 1, ["Let me look that up in the documentation..."]),
        {
          type: "approval_start",
          executionId,
          approvalId: `approval-${Date.now()}`,
          toolName: "Search documentation",
          // `toolType` is a free-form string; the plugin renders it as the
          // source label ("from Runtype"). The built-in bubble ignores it.
          toolType: "Runtype",
          description: "Search the Runtype documentation for relevant information",
          parameters: { query: "approval theming", numResults: 5 },
        },
      ];
      return createMockSSEResponse(events, { delayMs: 200 });
    },
    approval: {
      onDecision: async (data, decision, options) => {
        lastApprovalDecision = decision;
        const remember = options?.remember ? " (remember)" : "";
        updateLog(`Decision: ${decision}${remember} for tool "${data.toolName}" (approval: ${data.approvalId})`);
        if (decision === "denied") {
          const events: MockSSEFrame[] = [
            ...assistantTurn(data.executionId, "turn-denied", 2, [
              "The tool execution was denied. I'll try to help without using that tool.",
            ]),
            { type: "execution_complete", kind: "agent", executionId: data.executionId, success: true, stopReason: "complete" },
          ];
          return createMockSSEStream(events, { delayMs: 150 });
        }
        const events: MockSSEFrame[] = [
          { type: "approval_complete", executionId: data.executionId, approvalId: data.approvalId, decision: "approved", toolName: data.toolName },
          { type: "tool_start", executionId: data.executionId, toolCallId: "tool-1", toolName: data.toolName, parameters: { query: "latest AI news 2025", numResults: 5 } },
          { type: "tool_output_delta", executionId: data.executionId, toolCallId: "tool-1", delta: "Searching..." },
          { type: "tool_complete", executionId: data.executionId, toolCallId: "tool-1", result: { results: ["Result 1: AI breakthrough", "Result 2: New model released"] }, executionTime: 1200 },
          ...assistantTurn(data.executionId, "turn-2", 2, [
            "Based on the search results, here are the latest AI developments:\n\n",
            "1. **AI Breakthrough** - Major advances in reasoning capabilities\n",
            "2. **New Model Released** - Next-gen models with improved performance\n",
          ]),
          { type: "execution_complete", kind: "agent", executionId: data.executionId, success: true, stopReason: "complete" },
        ];
        return createMockSSEStream(events, { delayMs: 150 });
      },
    },
    launcher: {
      ...DEFAULT_WIDGET_CONFIG.launcher,
      enabled: launcherChrome,
      width: launcherChrome ? "min(420px, 95vw)" : "100%",
      title: launcherChrome ? "Tool Approval" : undefined,
    },
    theme: {
      ...DEFAULT_WIDGET_CONFIG.theme,
      primary: "#0f172a",
      accent: "#d97706",
      surface: "#f8fafc",
      muted: "#64748b",
    },
    copy: {
      ...DEFAULT_WIDGET_CONFIG.copy,
      welcomeTitle: "Approval Demo",
      welcomeSubtitle:
        "This demo simulates tool approval requests. Send any message to trigger an approval flow.",
      inputPlaceholder: "Send a message to trigger approval...",
    },
    features: { showToolCalls: true, showReasoning: true },
    suggestionChips: ["Search for AI news", "Find recent papers", "Look up documentation"],
    postprocessMessage: ({ text }) => markdownPostprocessor(text),
  };
};

const wireApprovalLogging = (controller: AgentWidgetController): void => {
  controller.on("approval:requested", (event) => {
    updateLog(`Approval requested: "${event.approval.toolName}" - ${event.approval.description}`);
  });
  controller.on("approval:resolved", (event) => {
    updateLog(`Approval resolved: ${event.decision}`);
  });
};

let activeStage: HTMLElement | null = null;
let teardownActive: (() => void) | null = null;

// Declared before `setupMountMode` runs: setupMountMode invokes `mount`
// synchronously during module evaluation (via the synchronous portion of its
// `applyMode` before its first `await`), which calls `createWidget()` →
// `updateLog()`. If `logContainer` (a const) were declared below that call it
// would still be in its temporal dead zone, throwing "Cannot access
// 'logContainer' before initialization" and crashing the demo before the widget
// ever mounts (so no dispatch request fires).
const logContainer = document.getElementById("event-log");
function updateLog(message: string): void {
  if (!logContainer) return;
  const entry = document.createElement("div");
  entry.style.cssText = "padding: 0.25rem 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 0.8rem;";
  const time = new Date().toLocaleTimeString();
  entry.innerHTML = `<span style="color: #64748b;">[${time}]</span> ${message}`;
  logContainer.prepend(entry);
}

const createWidget = (): void => {
  if (teardownActive) {
    teardownActive();
    teardownActive = null;
  }
  const stage = activeStage;
  if (!stage) return;
  const { controller, teardown } = runWidgetMountWithInspector(
    configInspector,
    approvalMountMode,
    stage,
    buildConfig,
  );
  activeController = controller;
  teardownActive = () => {
    teardown();
    activeController = null;
  };
  wireApprovalLogging(controller);
  updateLog(`Widget initialized: renderer: ${variant}`);
};

setupMountMode({
  slug: "approval-demo",
  modes: ["inline", "launcher"],
  mount: (mode, { stage }) => {
    approvalMountMode = mode;
    activeStage = stage;
    createWidget();
    return () => {
      if (teardownActive) {
        teardownActive();
        teardownActive = null;
      }
    };
  },
});

// The icon-source toggle only applies to the plugin renderer.
const iconModeRow = document.getElementById("icon-mode-row");
const syncIconRow = (): void => {
  if (iconModeRow) iconModeRow.style.display = variant === "plugin" ? "" : "none";
};
syncIconRow();

// Renderer variant selector (built-in bubble vs. renderApproval plugin).
const variantSelector = document.getElementById("variant-selector");
variantSelector?.addEventListener("click", (event) => {
  const btn = (event.target as HTMLElement).closest<HTMLElement>(".mode-btn");
  if (!btn) return;
  const next = btn.dataset.variant as ApprovalVariant | undefined;
  if (!next || next === variant) return;
  variantSelector
    .querySelectorAll(".mode-btn")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  variant = next;
  syncIconRow();
  createWidget();
});

// Icon-source selector (square map icon vs. Google favicon vs. default tool icon).
const iconSelector = document.getElementById("icon-selector");
iconSelector?.addEventListener("click", (event) => {
  const btn = (event.target as HTMLElement).closest<HTMLElement>(".mode-btn");
  if (!btn) return;
  const next = btn.dataset.icon as IconMode | undefined;
  if (!next || next === iconMode) return;
  iconSelector
    .querySelectorAll(".mode-btn")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  iconMode = next;
  createWidget();
});

document.getElementById("btn-approve")?.addEventListener("click", () => {
  if (!activeController) return;
  const messages = activeController.getMessages();
  const pending = messages.find((m) => m.variant === "approval" && m.approval?.status === "pending");
  if (pending?.approval) {
    activeController.resolveApproval(pending.approval.id, "approved");
    updateLog("Programmatic approve triggered");
  } else {
    updateLog("No pending approval found");
  }
});

document.getElementById("btn-deny")?.addEventListener("click", () => {
  if (!activeController) return;
  const messages = activeController.getMessages();
  const pending = messages.find((m) => m.variant === "approval" && m.approval?.status === "pending");
  if (pending?.approval) {
    activeController.resolveApproval(pending.approval.id, "denied");
    updateLog("Programmatic deny triggered");
  } else {
    updateLog("No pending approval found");
  }
});

updateLog("Widget initialized - send a message to trigger approval flow");
// Silence unused-var lint until we surface lastApprovalDecision in the UI.
void lastApprovalDecision;
