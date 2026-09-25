/**
 * Client-tool pair replay for the proxy and agent payload builders.
 *
 * In proxy and agent mode the widget holds the only copy of a client-tool
 * result, so it owns replaying it. Each call the browser answered through
 * `/resume` is sent to later turns as an assistant `toolCalls` message plus a
 * `tool` message with the matching `toolResults`, with the full result.
 * A pair replays even after the page stops offering its tool: the model
 * already saw that result, and a follow-up about it must not lose it.
 */

import type {
  AgentWidgetMessage,
  AgentWidgetReplayedToolCall,
  AgentWidgetReplayedToolResult,
  AgentWidgetRequestPayloadMessage,
} from "../types";

/**
 * The name a tool reaches the model as (`webmcp:get_schema` ->
 * `webmcp_get_schema`).
 */
export const modelFacingToolName = (name: string): string =>
  name
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .toLowerCase()
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const replayablePair = (
  message: AgentWidgetMessage,
): { call: AgentWidgetReplayedToolCall; result: AgentWidgetReplayedToolResult } | null => {
  if (message.variant !== "tool") return null;
  const answer = message.agentMetadata?.clientToolAnswer;
  if (!answer || !answer.toolCallId || answer.result === undefined) return null;
  const toolName = modelFacingToolName(answer.toolName);
  if (!toolName) return null;
  return {
    call: {
      toolCallId: answer.toolCallId,
      toolName,
      args: isRecord(answer.args) ? answer.args : {},
    },
    result: { toolCallId: answer.toolCallId, toolName, result: answer.result },
  };
};

/**
 * Serialize time-ordered messages, interleaving replayable tool pairs.
 * `toPayload` maps an ordinary message (or returns null to drop it). Answers
 * posted in the same `/resume` batch are one assistant turn's parallel calls,
 * so they group into one call message and one result message; a later batch
 * (a chained call) starts a new pair even with no text between them.
 */
export const serializeWithToolPairs = (
  messages: readonly AgentWidgetMessage[],
  toPayload: (message: AgentWidgetMessage) => AgentWidgetRequestPayloadMessage | null,
): AgentWidgetRequestPayloadMessage[] => {
  const out: AgentWidgetRequestPayloadMessage[] = [];
  let calls: AgentWidgetReplayedToolCall[] = [];
  let results: AgentWidgetReplayedToolResult[] = [];
  let groupCreatedAt = "";
  let groupBatch: string | undefined;

  const flush = () => {
    if (calls.length === 0) return;
    out.push(
      { role: "assistant", content: "", createdAt: groupCreatedAt, toolCalls: calls },
      { role: "tool", content: "", createdAt: groupCreatedAt, toolResults: results },
    );
    calls = [];
    results = [];
  };

  for (const message of messages) {
    const pair = replayablePair(message);
    if (pair) {
      const batch = message.agentMetadata?.clientToolAnswer?.batch;
      if (calls.length > 0 && (batch === undefined || batch !== groupBatch)) flush();
      if (calls.length === 0) {
        groupCreatedAt = message.createdAt;
        groupBatch = batch;
      }
      if (!calls.some((call) => call.toolCallId === pair.call.toolCallId)) {
        calls.push(pair.call);
        results.push(pair.result);
      }
      continue;
    }
    const mapped = toPayload(message);
    if (!mapped) continue;
    flush();
    out.push(mapped);
  }
  flush();
  return out;
};
