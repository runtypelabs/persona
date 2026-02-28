import "@runtypelabs/persona/widget.css";

import {
  createAgentExperience,
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetController,
} from "@runtypelabs/persona";

// ── Simulated SSE stream helper ──────────────────────────────
function createSSEStream(events: Array<{ type: string; [key: string]: unknown }>, delayMs = 300): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;

  return new ReadableStream({
    async pull(controller) {
      if (index >= events.length) {
        controller.close();
        return;
      }

      await new Promise(resolve => setTimeout(resolve, delayMs));

      const event = events[index++];
      const data = JSON.stringify(event);
      controller.enqueue(encoder.encode(`data: ${data}\n\n`));
    }
  });
}

// ── Mount ──────────────────────────────────────────────────────
const mount = document.getElementById("approval-widget");
if (!mount) throw new Error("Approval widget mount node missing");

let controller: AgentWidgetController | null = null;

// Track approval decisions for the simulated flow
let lastApprovalDecision: 'approved' | 'denied' | null = null;

function createWidget() {
  mount!.innerHTML = "";

  const handle = createAgentExperience(mount!, {
    ...DEFAULT_WIDGET_CONFIG,

    // Use customFetch to simulate the entire flow
    customFetch: async (_url, init, _payload) => {
      // Simulate: assistant starts typing, then pauses for approval
      const events = [
        { type: "agent_start", executionId: "exec-demo-1", agentId: "demo-agent", agentName: "Demo Agent", maxIterations: 3, startedAt: Date.now() },
        { type: "agent_iteration_start", executionId: "exec-demo-1", iteration: 1 },
        { type: "agent_turn_start", executionId: "exec-demo-1", turnId: "turn-1" },
        { type: "agent_turn_delta", executionId: "exec-demo-1", turnId: "turn-1", delta: "Let me search for that information using Exa..." },
        { type: "agent_turn_complete", executionId: "exec-demo-1", turnId: "turn-1" },
        // Tool approval event
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

      const stream = createSSEStream(events, 200);

      return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    },

    // Custom approval handler that simulates the approve/deny response
    approval: {
      onDecision: async (data, decision) => {
        lastApprovalDecision = decision;
        updateLog(`Decision: ${decision} for tool "${data.toolName}" (approval: ${data.approvalId})`);

        if (decision === 'denied') {
          // Simulate a denial response
          const events = [
            { type: "agent_turn_start", executionId: data.executionId, turnId: "turn-denied" },
            { type: "agent_turn_delta", executionId: data.executionId, turnId: "turn-denied", delta: "The tool execution was denied. I'll try to help without using that tool." },
            { type: "agent_turn_complete", executionId: data.executionId, turnId: "turn-denied" },
            { type: "agent_complete", executionId: data.executionId, success: true, stopReason: "complete" },
          ];
          return createSSEStream(events, 150);
        }

        // Simulate an approval response with tool execution
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
        return createSSEStream(events, 150);
      },
    },

    // Widget chrome
    launcher: {
      ...DEFAULT_WIDGET_CONFIG.launcher,
      width: "100%",
      enabled: false,
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
    features: {
      showToolCalls: true,
      showReasoning: true,
    },
    suggestionChips: [
      "Search for AI news",
      "Find recent papers",
      "Look up documentation",
    ],
    postprocessMessage: ({ text }) => markdownPostprocessor(text),
  });

  controller = handle;

  // Listen for approval events
  controller.on("approval:requested", (event) => {
    updateLog(`Approval requested: "${event.approval.toolName}" - ${event.approval.description}`);
  });

  controller.on("approval:resolved", (event) => {
    updateLog(`Approval resolved: ${event.decision}`);
  });
}

// ── Event Log ──────────────────────────────────────────────────
const logContainer = document.getElementById("event-log");

function updateLog(message: string) {
  if (!logContainer) return;
  const entry = document.createElement("div");
  entry.style.cssText = "padding: 0.25rem 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 0.8rem;";
  const time = new Date().toLocaleTimeString();
  entry.innerHTML = `<span style="color: #64748b;">[${time}]</span> ${message}`;
  logContainer.prepend(entry);
}

// ── Programmatic Buttons ──────────────────────────────────────
const approveBtn = document.getElementById("btn-approve");
const denyBtn = document.getElementById("btn-deny");

approveBtn?.addEventListener("click", () => {
  if (!controller) return;
  const messages = controller.getMessages();
  const pending = messages.find(m => m.variant === "approval" && m.approval?.status === "pending");
  if (pending?.approval) {
    controller.resolveApproval(pending.approval.id, "approved");
    updateLog("Programmatic approve triggered");
  } else {
    updateLog("No pending approval found");
  }
});

denyBtn?.addEventListener("click", () => {
  if (!controller) return;
  const messages = controller.getMessages();
  const pending = messages.find(m => m.variant === "approval" && m.approval?.status === "pending");
  if (pending?.approval) {
    controller.resolveApproval(pending.approval.id, "denied");
    updateLog("Programmatic deny triggered");
  } else {
    updateLog("No pending approval found");
  }
});

// Initial render
createWidget();
updateLog("Widget initialized - send a message to trigger approval flow");
