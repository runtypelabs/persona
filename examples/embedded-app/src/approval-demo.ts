import "@runtypelabs/persona/widget.css";

import {
  createAgentExperience,
  createLocalStorageAdapter,
  initAgentWidget,
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetConfig,
  type AgentWidgetController,
} from "@runtypelabs/persona";
import { createMockSSEResponse, createMockSSEStream } from "@runtypelabs/persona/testing";
import { setupMountMode, renderInlineMount, renderLauncherScene } from "./mount-mode";
import type { Mode } from "./examples-nav";

let activeController: AgentWidgetController | null = null;
let lastApprovalDecision: "approved" | "denied" | null = null;

const buildConfig = (mode: Mode): AgentWidgetConfig => {
  const launcherChrome = mode === "launcher";
  return {
    ...DEFAULT_WIDGET_CONFIG,
    storageAdapter: createLocalStorageAdapter(
      `persona-state-approval-demo-${mode}`,
    ),
    customFetch: async () => {
      const events = [
        { type: "agent_start", executionId: "exec-demo-1", agentId: "demo-agent", agentName: "Demo Agent", maxTurns: 3, startedAt: Date.now() },
        { type: "agent_iteration_start", executionId: "exec-demo-1", iteration: 1 },
        { type: "agent_turn_start", executionId: "exec-demo-1", turnId: "turn-1" },
        { type: "agent_turn_delta", executionId: "exec-demo-1", turnId: "turn-1", delta: "Let me search for that information using Exa..." },
        { type: "agent_turn_complete", executionId: "exec-demo-1", turnId: "turn-1" },
        {
          type: "agent_approval_start",
          executionId: "exec-demo-1",
          approvalId: `approval-${Date.now()}`,
          toolName: "exa_search",
          toolType: "mcp",
          description: "Search the web using Exa for relevant information",
          parameters: { query: "latest AI news 2025", numResults: 5 },
        },
      ];
      return createMockSSEResponse(events, { delayMs: 200 });
    },
    approval: {
      onDecision: async (data, decision) => {
        lastApprovalDecision = decision;
        updateLog(`Decision: ${decision} for tool "${data.toolName}" (approval: ${data.approvalId})`);
        if (decision === "denied") {
          const events = [
            { type: "agent_turn_start", executionId: data.executionId, turnId: "turn-denied" },
            { type: "agent_turn_delta", executionId: data.executionId, turnId: "turn-denied", delta: "The tool execution was denied. I'll try to help without using that tool." },
            { type: "agent_turn_complete", executionId: data.executionId, turnId: "turn-denied" },
            { type: "agent_complete", executionId: data.executionId, success: true, stopReason: "complete" },
          ];
          return createMockSSEStream(events, { delayMs: 150 });
        }
        const events = [
          { type: "agent_approval_complete", executionId: data.executionId, approvalId: data.approvalId, decision: "approved", toolName: data.toolName },
          { type: "agent_tool_start", executionId: data.executionId, toolCallId: "tool-1", toolName: data.toolName, parameters: { query: "latest AI news 2025", numResults: 5 } },
          { type: "agent_tool_delta", executionId: data.executionId, toolCallId: "tool-1", delta: "Searching..." },
          { type: "agent_tool_complete", executionId: data.executionId, toolCallId: "tool-1", result: { results: ["Result 1: AI breakthrough", "Result 2: New model released"] }, executionTime: 1200 },
          { type: "agent_turn_start", executionId: data.executionId, turnId: "turn-2" },
          { type: "agent_turn_delta", executionId: data.executionId, turnId: "turn-2", delta: "Based on the search results, here are the latest AI developments:\n\n" },
          { type: "agent_turn_delta", executionId: data.executionId, turnId: "turn-2", delta: "1. **AI Breakthrough** - Major advances in reasoning capabilities\n" },
          { type: "agent_turn_delta", executionId: data.executionId, turnId: "turn-2", delta: "2. **New Model Released** - Next-gen models with improved performance\n" },
          { type: "agent_turn_complete", executionId: data.executionId, turnId: "turn-2" },
          { type: "agent_complete", executionId: data.executionId, success: true, stopReason: "complete" },
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

setupMountMode({
  slug: "approval-demo",
  modes: ["inline", "launcher"],
  mount: (mode, { stage }) => {
    if (mode === "launcher") {
      const { mountEl } = renderLauncherScene(stage);
      const handle = initAgentWidget({ target: mountEl, config: buildConfig("launcher") });
      activeController = handle as unknown as AgentWidgetController;
      wireApprovalLogging(activeController);
      return () => {
        handle.destroy();
        activeController = null;
      };
    }
    const mount = renderInlineMount(stage);
    mount.style.height = "100%";
    const controller = createAgentExperience(mount, buildConfig(mode));
    activeController = controller;
    wireApprovalLogging(controller);
    return () => {
      controller.destroy();
      activeController = null;
    };
  },
});

const logContainer = document.getElementById("event-log");
function updateLog(message: string): void {
  if (!logContainer) return;
  const entry = document.createElement("div");
  entry.style.cssText = "padding: 0.25rem 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 0.8rem;";
  const time = new Date().toLocaleTimeString();
  entry.innerHTML = `<span style="color: #64748b;">[${time}]</span> ${message}`;
  logContainer.prepend(entry);
}

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
