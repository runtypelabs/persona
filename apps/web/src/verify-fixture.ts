import "@runtypelabs/persona/widget.css";
import {
  DEFAULT_WIDGET_CONFIG,
  initAgentWidget,
  markdownPostprocessor,
  type AgentWidgetConfig,
  type AgentWidgetController,
  type AgentWidgetMessage,
  type AgentWidgetRequestPayload,
} from "@runtypelabs/persona";
import {
  buildAssistantTurnFrames,
  createMockSSEResponse,
  createMockSSEStream,
  type MockSSEFrame,
} from "@runtypelabs/persona/testing";
import { createDemoHistoryProvider } from "@runtypelabs/persona/internal/demo-history-provider";

/**
 * Internal, keyless fixture for the agent verification skill
 * (`.claude/skills/verify`, driven by `scripts/verify/control-persona.mjs`).
 *
 * Every chat turn is answered in-page by a scripted `customFetch` that emits
 * Persona's unified SSE vocabulary, so the real client, session, and UI code
 * paths run while the network boundary is the only thing faked. The page
 * records what crossed that boundary (`requests`) and what the controller
 * emitted (`events`) on `window.__personaVerify`, so a proof can check side
 * effects alongside screenshots. Not registered in examples-nav.
 */

type Scenario = "echo" | "markdown" | "tool" | "reasoning" | "approval" | "error" | "internal-error" | "browser-history" | "turn-activity" | "operator";
const SCENARIOS: Scenario[] = ["echo", "markdown", "tool", "reasoning", "approval", "error", "internal-error", "browser-history", "turn-activity", "operator"];

const params = new URLSearchParams(window.location.search);
const scenarioParam = params.get("scenario") ?? "echo";
const scenario: Scenario = SCENARIOS.includes(scenarioParam as Scenario)
  ? (scenarioParam as Scenario)
  : "echo";
const mode = params.get("mode") === "launcher" ? "launcher" : "inline";
const theme = params.get("theme") === "dark" ? "dark" : "light";
const voice = params.get("voice");
const delayMs = Number(params.get("delayMs") ?? 60);

const status = document.getElementById("verify-status") as HTMLElement;
const host = document.getElementById("verify-host") as HTMLElement;
document.body.dataset.mode = mode;
document.body.dataset.colorScheme = theme;

const requests: Array<{ at: number; url: string; body: unknown }> = [];
const events: Array<{ at: number; type: string; detail: unknown }> = [];
const t0 = performance.now();
const now = () => Math.round(performance.now() - t0);

// A custom history backend can return the exact snapshot saved before a browser
// closed, including local approvals whose callbacks no longer exist. Only the
// provider boundary is scripted: opening history and prepending use the real UI.
function browserHistoryProvider() {
  const summary = {
    id: "interrupted-browser-history", title: "Interrupted browser proposal", targetId: null,
    preview: "A saved proposal is on the earlier page.", createdAt: "2026-01-01T10:00:00Z",
    updatedAt: "2026-01-02T10:00:00Z", messageCount: 3,
  };
  const latest: AgentWidgetMessage = {
    id: "newer-reply", role: "assistant", content: summary.preview,
    createdAt: summary.updatedAt,
  };
  const older: AgentWidgetMessage[] = [
    {
      id: "saved-browser-tool", role: "assistant", content: "", variant: "tool",
      streaming: true, createdAt: summary.createdAt,
      agentMetadata: { executionId: "saved-execution", awaitingLocalTool: true, webMcpToolCallId: "saved-call" },
      toolCall: { id: "saved-call", name: "webmcp:purchase", args: { quantity: 2 }, status: "running", startedAt: 1000, approvalStatus: "pending" },
    },
    {
      id: "saved-browser-approval", role: "assistant", content: "", variant: "approval",
      createdAt: "2026-01-01T10:00:01Z",
      approval: { id: "saved-gate", status: "pending", executionId: "", agentId: "", toolName: "purchase", toolType: "webmcp", description: "Purchase two items", parameters: { quantity: 2 } },
    },
  ];
  const provider = createDemoHistoryProvider({ conversations: [{ ...summary, messages: [latest] }] });
  provider.getPage = async (id, options) => {
    requests.push({ at: now(), url: "history:getPage", body: { id, cursor: options?.cursor ?? null } });
    return {
      summary,
      conversationRevision: "r1",
      messages: structuredClone(options?.cursor ? older : [latest]),
      nextCursor: options?.cursor ? null : "older-browser-proposal",
    };
  };
  return provider;
}

const MARKDOWN_REPLY = [
  "## Release checklist",
  "",
  "Here is what ships in **this** build:",
  "",
  "1. Streaming *Markdown* with `inline code`",
  "2. A [link to the docs](https://persona-chat.dev)",
  "3. A table and a code block",
  "",
  "| Package | Bump | Notes |",
  "| --- | --- | --- |",
  "| `@runtypelabs/persona` | patch | widget fix |",
  "| `@runtypelabs/persona-proxy` | none | unchanged |",
  "",
  "```ts",
  "initAgentWidget({ target: '#chat', config: { apiUrl: '/chat' } });",
  "```",
  "",
  "> Block quotes render too.",
].join("\n");

function latestUserText(payload: AgentWidgetRequestPayload): string {
  const messages = payload?.messages ?? [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i] as { role?: string; content?: unknown };
    if (m.role !== "user") continue;
    if (typeof m.content === "string") return m.content;
    if (Array.isArray(m.content)) {
      return m.content
        .map((p) => (p && typeof p === "object" && "text" in p ? String((p as { text: unknown }).text) : ""))
        .join(" ");
    }
  }
  return "";
}

const start = (executionId: string): MockSSEFrame => ({
  type: "execution_start",
  kind: "agent",
  executionId,
  agentId: "agent_verify",
  agentName: "Verify Agent",
  maxTurns: 3,
  startedAt: new Date().toISOString(),
});
const complete = (executionId: string): MockSSEFrame => ({
  type: "execution_complete",
  kind: "agent",
  executionId,
  success: true,
  stopReason: "end_turn",
  completedAt: new Date().toISOString(),
});
const sequenced = (frames: MockSSEFrame[]) => frames.map((frame, seq) => ({ ...frame, seq: seq + 1 }));

function scenarioFrames(kind: Scenario, userText: string, executionId: string): MockSSEFrame[] {
  switch (kind) {
    case "markdown":
      return [start(executionId), ...buildAssistantTurnFrames({ executionId, text: MARKDOWN_REPLY, chunkSize: 12 }), complete(executionId)];
    case "tool":
      return [
        start(executionId),
        { type: "turn_start", executionId, id: "turn-1", role: "assistant", iteration: 1 },
        {
          type: "tool_start",
          executionId,
          toolCallId: "call_weather",
          toolName: "get_weather",
          toolType: "custom",
          parameters: { city: "Lisbon", unit: "celsius" },
          iteration: 1,
        },
        { type: "tool_output_delta", executionId, toolCallId: "call_weather", delta: "Fetching forecast…" },
        {
          type: "tool_complete",
          executionId,
          toolCallId: "call_weather",
          success: true,
          result: { city: "Lisbon", tempC: 22, conditions: "sunny" },
          executionTime: 840,
        },
        { type: "turn_complete", executionId, id: "turn-1", role: "assistant", stopReason: "tool_use" },
        ...buildAssistantTurnFrames({
          executionId,
          turnId: "turn-2",
          text: "It's **22°C and sunny** in Lisbon right now.",
          chunkSize: 8,
        }),
        complete(executionId),
      ];
    case "turn-activity":
      return [
        start(executionId),
        ...buildAssistantTurnFrames({ executionId, turnId: `${executionId}-progress-1`, text: "I will inspect the files and check the result.", chunkSize: 20 }),
        { type: "tool_start", executionId, toolCallId: `${executionId}-read`, toolName: "Read", parameters: { path: "example.ts" }, iteration: 1 },
        { type: "tool_output_delta", executionId, toolCallId: `${executionId}-read`, delta: "Reading the example…" },
        { type: "tool_complete", executionId, toolCallId: `${executionId}-read`, success: true, result: "Found the relevant function", executionTime: 840 },
        { type: "tool_start", executionId, toolCallId: `${executionId}-read-docs`, toolName: "Read", parameters: { path: "README.md" }, iteration: 1 },
        { type: "tool_complete", executionId, toolCallId: `${executionId}-read-docs`, success: true, result: "Confirmed the documented behavior", executionTime: 480 },
        ...buildAssistantTurnFrames({ executionId, turnId: `${executionId}-progress-2`, text: "The implementation is consistent. I am checking the final output.", chunkSize: 20 }),
        { type: "tool_start", executionId, toolCallId: `${executionId}-check`, toolName: "Bash", parameters: { command: "check" }, iteration: 2 },
        { type: "tool_complete", executionId, toolCallId: `${executionId}-check`, success: true, result: "All checks passed", executionTime: 620 },
        ...buildAssistantTurnFrames({ executionId, turnId: `${executionId}-final`, text: "The example works. The final answer stays outside the activity disclosure.", chunkSize: 20 }),
        complete(executionId),
      ];
    case "reasoning":
      return [
        start(executionId),
        { type: "turn_start", executionId, id: "turn-1", role: "assistant", iteration: 1 },
        { type: "reasoning_start", executionId, id: "reason_1" },
        { type: "reasoning_delta", executionId, id: "reason_1", delta: "The user asked a question. " },
        { type: "reasoning_delta", executionId, id: "reason_1", delta: "I should answer briefly and cite the docs." },
        {
          type: "reasoning_complete",
          executionId,
          id: "reason_1",
          text: "The user asked a question. I should answer briefly and cite the docs.",
        },
        { type: "text_start", executionId, id: "text_1", role: "assistant" },
        { type: "text_delta", executionId, id: "text_1", delta: "After thinking it over: " },
        { type: "text_delta", executionId, id: "text_1", delta: "the answer is **42**." },
        { type: "text_complete", executionId, id: "text_1", text: "After thinking it over: the answer is **42**." },
        { type: "turn_complete", executionId, id: "turn-1", role: "assistant", stopReason: "end_turn" },
        complete(executionId),
      ];
    case "approval":
      return [
        start(executionId),
        ...buildAssistantTurnFrames({ executionId, text: "Let me search the documentation for that.", chunkSize: 10 }),
        {
          type: "approval_start",
          executionId,
          approvalId: `approval-${executionId}`,
          toolName: "search_docs",
          toolType: "Runtype",
          description: "Search the Runtype documentation for relevant pages",
          parameters: { query: userText || "approval theming", numResults: 5 },
        },
      ];
    case "error":
      return [];
    case "echo":
    default:
      return [
        start(executionId),
        ...buildAssistantTurnFrames({
          executionId,
          text: `You said: **${userText || "(empty)"}**. This reply is scripted by the verify fixture.`,
          chunkSize: 6,
        }),
        complete(executionId),
      ];
  }
}

let turn = 0;

function deepMerge<T>(base: T, patch: unknown): T {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return (patch as T) ?? base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    const prev = out[key];
    out[key] =
      value && typeof value === "object" && !Array.isArray(value) && prev && typeof prev === "object"
        ? deepMerge(prev, value)
        : value;
  }
  return out as T;
}

let configPatch: unknown = undefined;
const rawConfig = params.get("config");
if (rawConfig) {
  try {
    configPatch = JSON.parse(rawConfig);
  } catch (error) {
    status.textContent = `bad ?config JSON: ${(error as Error).message}`;
    throw error;
  }
}

const baseConfig: AgentWidgetConfig = {
  ...DEFAULT_WIDGET_CONFIG,
  apiUrl: "https://verify.invalid/chat",
  // Every load starts from the empty state the scenario expects.
  persistState: false,
  colorScheme: theme,
  launcher: {
    ...DEFAULT_WIDGET_CONFIG.launcher,
    enabled: mode === "launcher",
    width: mode === "launcher" ? "min(420px, 95vw)" : "100%",
    title: "Verify fixture",
  },
  copy: {
    ...DEFAULT_WIDGET_CONFIG.copy,
    welcomeTitle: "Verify fixture",
    welcomeSubtitle: `Scenario: ${scenario}. Replies are scripted in-page; no backend.`,
    inputPlaceholder: "Send a message…",
  },
  suggestionChips: [],
  features: { showToolCalls: true, showReasoning: true },
  ...(scenario === "browser-history" ? {
    features: { showToolCalls: true, history: { enabled: true, provider: browserHistoryProvider(), presentation: "panel" as const } },
  } : {}),
  ...(scenario === "turn-activity" ? {
    future: { v5Defaults: true },
    expansion: { animation: "height" as const, duration: 160 },
    turnActivity: { enabled: true },
  } : {}),
  ...(scenario === "operator" ? {
    // Restored conversation supplied by the host, including an attachment-only
    // human reply. Subsequent sends and message actions use the real widget UI.
    initialMessages: [
      { id: "operator-user", role: "user" as const, content: "Can you replace my damaged order?", createdAt: "2026-01-01T10:00:00Z" },
      { id: "operator-assistant", role: "assistant" as const, content: "Let me check with support.", createdAt: "2026-01-01T10:00:01Z" },
      { id: "operator-reply", role: "operator" as const, content: "I have approved your replacement.", author: { id: "support-sam", displayName: "Sam", kind: "human" as const }, createdAt: "2026-01-01T10:00:02Z" },
      { id: "operator-file", role: "operator" as const, content: "", contentParts: [{ type: "file" as const, data: "data:text/plain;base64,UmVwbGFjZW1lbnQgYXBwcm92ZWQu", mimeType: "text/plain", filename: "replacement-receipt.txt" }], createdAt: "2026-01-01T10:00:03Z" },
    ],
    messageActions: {
      enabled: true, showRegenerate: true, showEdit: true, visibility: "always" as const,
      custom: [{
        id: "delivery", label: "Delivery details", roles: ["operator" as const],
        onSelect: (message: AgentWidgetMessage) => {
          events.push({ at: now(), type: "fixture:delivery", detail: { messageId: message.id } });
          status.textContent = `Delivery details: ${message.id}`;
        },
      }],
    },
  } : {}),
  postprocessMessage: ({ text }) => markdownPostprocessor(text),
  customFetch: async (url, init, payload) => {
    requests.push({ at: now(), url: String(url), body: payload });
    if (scenario === "internal-error") {
      throw new TypeError("t.streamGeneration is not a function");
    }
    if (scenario === "error") {
      return new Response(JSON.stringify({ error: "Scripted failure from the verify fixture" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    turn += 1;
    const executionId = `exec_verify_${turn}`;
    const frames = scenarioFrames(scenario, latestUserText(payload), executionId).map(frame =>
      scenario === "turn-activity" && frame.type === "text_start"
        ? { ...frame, phase: frame.id === `${executionId}-final-text` ? "final_answer" : "commentary" }
        : frame,
    );
    return createMockSSEResponse(sequenced(frames), { delayMs, signal: init?.signal });
  },
  approval: {
    onDecision: async (data, decision) => {
      requests.push({ at: now(), url: "approval:onDecision", body: { approvalId: data.approvalId, decision } });
      const frames: MockSSEFrame[] =
        decision === "denied"
          ? [
              ...buildAssistantTurnFrames({
                executionId: data.executionId,
                turnId: "turn-denied",
                text: "Understood: I won't search. Here's what I know without it.",
              }),
              complete(data.executionId),
            ]
          : [
              {
                type: "approval_complete",
                executionId: data.executionId,
                approvalId: data.approvalId,
                decision: "approved",
                toolName: data.toolName,
              },
              {
                type: "tool_start",
                executionId: data.executionId,
                toolCallId: "call_search",
                toolName: data.toolName,
                toolType: "builtin",
                parameters: { query: "approval theming", numResults: 5 },
              },
              {
                type: "tool_complete",
                executionId: data.executionId,
                toolCallId: "call_search",
                success: true,
                result: { results: ["Theming approvals", "Approval events"] },
                executionTime: 620,
              },
              ...buildAssistantTurnFrames({
                executionId: data.executionId,
                turnId: "turn-approved",
                text: "Found **2** pages: *Theming approvals* and *Approval events*.",
              }),
              complete(data.executionId),
            ];
      return createMockSSEStream(sequenced(frames), { delayMs });
    },
  },
  ...(voice === "browser"
    ? {
        voiceRecognition: { enabled: true, pauseDuration: 800 },
        textToSpeech: { enabled: true, provider: "browser" as const },
      }
    : {}),
};

const config = configPatch ? deepMerge(baseConfig, configPatch) : baseConfig;

const controller: AgentWidgetController = initAgentWidget({
  target: mode === "launcher" ? document.body : host,
  useShadowDom: false,
  config,
});

const RECORDED_EVENTS = [
  "run:started",
  "run:finished",
  "user:message",
  "assistant:complete",
  "approval:requested",
  "approval:resolved",
  "voice:state",
  "voice:status",
  "widget:opened",
  "widget:closed",
  "message:read-aloud",
] as const;
for (const type of RECORDED_EVENTS) {
  controller.on(type, (detail: unknown) => {
    events.push({ at: now(), type, detail: JSON.parse(JSON.stringify(detail ?? null)) });
  });
}

status.textContent = `ready scenario=${scenario} mode=${mode} theme=${theme}${voice ? ` voice=${voice}` : ""}`;

Object.assign(window as unknown as Record<string, unknown>, {
  __personaVerify: { controller, scenario, mode, theme, voice, requests, events, ready: true },
});
