/**
 * Client-tool pair replay for the proxy and agent payload builders.
 *
 * In proxy and agent mode the widget holds the only copy of a client-tool
 * result, so it owns replaying it. Each call the browser answered through
 * `/resume` is sent to later turns as an assistant `toolCalls` message plus a
 * `tool` message with the matching `toolResults`, the `/v1/dispatch` shape.
 * The policy mirrors the server's client-token replay: only answered calls,
 * only while this turn still offers the tool (a tool-less request carrying
 * tool history is a provider 400), and the full result (no truncation).
 */

import type {
  AgentWidgetMessage,
  AgentWidgetReplayedToolCall,
  AgentWidgetReplayedToolResult,
  AgentWidgetRequestPayloadMessage,
  ClientToolDefinition,
} from "../types";

/**
 * The name a tool reaches the model as (`webmcp:get_schema` ->
 * `webmcp_get_schema`). Mirrors core's `sanitizeToolNameForAiSdk`.
 */
export const modelFacingToolName = (name: string): string =>
  name
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .toLowerCase()
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

/** Internal names (`webmcp:<name>` or bare built-ins) of the tools this turn offers. */
export const offeredClientToolNames = (
  clientTools: readonly ClientToolDefinition[] | undefined,
): Set<string> =>
  new Set(
    (clientTools ?? []).map((tool) =>
      tool.origin === "webmcp" ? `webmcp:${tool.name}` : tool.name,
    ),
  );

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const replayablePair = (
  message: AgentWidgetMessage,
  offered: ReadonlySet<string>,
): { call: AgentWidgetReplayedToolCall; result: AgentWidgetReplayedToolResult } | null => {
  if (message.variant !== "tool") return null;
  const answer = message.agentMetadata?.clientToolAnswer;
  if (!answer || !answer.toolCallId || answer.result === undefined) return null;
  if (!offered.has(answer.toolName)) return null;
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
  offered: ReadonlySet<string>,
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
    const pair = replayablePair(message, offered);
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

/**
 * Drop replayed pairs whose tool the final request no longer offers, e.g.
 * after `requestMiddleware` removed or replaced `clientTools`. Only the
 * `replayedIds` this module emitted are touched; other messages pass through.
 */
export const dropUnofferedReplayedPairs = (
  messages: AgentWidgetRequestPayloadMessage[],
  clientTools: readonly ClientToolDefinition[] | undefined,
  replayedIds: ReadonlySet<string>,
): AgentWidgetRequestPayloadMessage[] => {
  if (replayedIds.size === 0) return messages;
  const offered = new Set(
    [...offeredClientToolNames(clientTools)].map(modelFacingToolName),
  );
  const keep = (entry: { toolCallId: string; toolName: string }) =>
    !replayedIds.has(entry.toolCallId) || offered.has(entry.toolName);
  return messages.flatMap((message) => {
    if (message.toolCalls) {
      const toolCalls = message.toolCalls.filter(keep);
      if (toolCalls.length === message.toolCalls.length) return [message];
      return toolCalls.length > 0 ? [{ ...message, toolCalls }] : [];
    }
    if (message.role === "tool" && message.toolResults) {
      const toolResults = message.toolResults.filter(keep);
      if (toolResults.length === message.toolResults.length) return [message];
      return toolResults.length > 0 ? [{ ...message, toolResults }] : [];
    }
    return [message];
  });
};

/** The tool-call ids of the pairs in `messages`. */
export const replayedToolCallIds = (
  messages: readonly AgentWidgetRequestPayloadMessage[],
): Set<string> =>
  new Set(messages.flatMap((m) => (m.toolCalls ?? []).map((c) => c.toolCallId)));
