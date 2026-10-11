import type { AgentWidgetMessage } from "../types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Tool rows for the page tools a voice server already ran before handing the
 * turn to the chat (`delegation_started.input.priorToolResults`). Each row is
 * a completed call carrying `clientToolAnswer`, so proxy/agent payloads replay
 * it to the model as an assistant `toolCalls` + `tool` `toolResults` pair under
 * the same `toolCallId`. Nothing marks it awaiting, so it never runs again.
 * Malformed entries are skipped.
 */
export const voicePriorToolRows = (value: unknown, createdAt: string): AgentWidgetMessage[] =>
  (Array.isArray(value) ? value : []).flatMap((entry): AgentWidgetMessage[] => {
    if (!isRecord(entry)) return [];
    const { toolCallId, name } = entry;
    if (typeof toolCallId !== "string" || !toolCallId || typeof name !== "string" || !name) return [];
    const args = isRecord(entry.arguments) ? entry.arguments : {};
    const result = entry.result ?? null;
    return [
      {
        id: `voice-tool-${toolCallId}`,
        role: "assistant",
        variant: "tool",
        content: "",
        createdAt,
        streaming: false,
        toolCall: { id: toolCallId, name, status: "complete", args, result },
        agentMetadata: { clientToolAnswer: { toolCallId, toolName: name, args, result } },
      },
    ];
  });
