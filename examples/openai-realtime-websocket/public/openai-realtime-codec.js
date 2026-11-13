// @ts-check
/**
 * A `WebSocketTransportCodec` for the OpenAI Realtime API (text output), for
 * Persona's generic `createWebSocketTransport`. It is a duplex codec: a chat
 * send becomes `conversation.item.create` + `response.create` on the socket,
 * and the server's `response.*` events become Persona's unified SSE events
 * (`execution_start` ... `text_delta` ... `execution_complete`).
 *
 * The Realtime session keeps the conversation server-side, so only the newest
 * user message is sent per turn. One response runs at a time per session.
 *
 * Plain ESM so the page can load it with no build step; `// @ts-check` plus the
 * JSDoc types keep it checked by `tsc` (see tsconfig `checkJs`).
 *
 * @typedef {import("@runtypelabs/persona/websocket-transport").WebSocketTransportCodec} Codec
 * @typedef {import("@runtypelabs/persona/websocket-transport").WebSocketTransportInbound} Inbound
 * @typedef {import("@runtypelabs/persona/websocket-transport").WebSocketTransportEvent} WireEvent
 */

/** @param {unknown} body */
function lastUserText(body) {
  const messages = /** @type {{ messages?: Array<{ role?: string; content?: unknown }> }} */ (body ?? {}).messages ?? [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role !== "user") continue;
    if (typeof message.content === "string") return message.content;
    if (Array.isArray(message.content)) {
      return message.content
        .filter((part) => part && part.type === "text")
        .map((part) => String(part.text ?? ""))
        .join("");
    }
  }
  return "";
}

/**
 * @param {{ instructions?: string }} [options]
 * @returns {Codec}
 */
export function createOpenAIRealtimeCodec(options = {}) {
  /** @type {{ streamId: string; executionId: string; textId: string; opened: boolean; textOpen: boolean; responseId?: string } | null} */
  let current = null;
  /** Stopped turns whose `response.created` has not arrived yet; the next ones belong to them. */
  let stoppedBeforeCreated = 0;

  /** Events of the response this turn owns; a stopped turn's late events match nothing. @param {unknown} id */
  const owned = (id) => (current?.responseId !== undefined && current.responseId === id ? current : null);

  /** @param {string} type @param {Record<string, unknown>} [data] @returns {WireEvent} */
  const wire = (type, data = {}) => ({ type, executionId: current?.executionId, ...data });

  /** Persona needs the turn opened before the first delta. */
  const opening = () => {
    if (!current || current.opened) return [];
    current.opened = true;
    const now = new Date().toISOString();
    return [
      wire("execution_start", { kind: "agent", agentId: "openai-realtime", agentName: "OpenAI Realtime", startedAt: now }),
      wire("turn_start", { id: "turn_1", role: "assistant", iteration: 1 }),
    ];
  };

  /** @param {WireEvent[]} events @returns {Inbound | null} */
  const emit = (events) => (current && events.length ? { kind: "events", streamId: current.streamId, events } : null);

  return {
    open() {
      // A new socket is a new Realtime session: nothing from the last one can still arrive.
      current = null;
      stoppedBeforeCreated = 0;
      return [
        JSON.stringify({
          type: "session.update",
          session: {
            type: "realtime",
            output_modalities: ["text"],
            ...(options.instructions ? { instructions: options.instructions } : {}),
          },
        }),
      ];
    },

    encode(request, { streamId }) {
      if (request.kind !== "dispatch") return null;
      current = { streamId, executionId: `exec_${streamId}`, textId: `text_${streamId}`, opened: false, textOpen: false };
      return [
        JSON.stringify({
          type: "conversation.item.create",
          item: { type: "message", role: "user", content: [{ type: "input_text", text: lastUserText(request.body) }] },
        }),
        JSON.stringify({ type: "response.create", response: { output_modalities: ["text"] } }),
      ];
    },

    decode(data) {
      if (typeof data !== "string") return null;
      const event = JSON.parse(data);
      switch (event.type) {
        case "session.created":
          return { kind: "ready" };
        case "response.created":
          if (stoppedBeforeCreated > 0) {
            stoppedBeforeCreated -= 1;
            return null;
          }
          if (!current || current.responseId !== undefined) return null;
          current.responseId = event.response?.id;
          return emit(opening());
        case "response.output_text.delta": {
          if (!owned(event.response_id) || !current) return null;
          const events = opening();
          if (!current.textOpen) {
            current.textOpen = true;
            events.push(wire("text_start", { id: current.textId, role: "assistant" }));
          }
          events.push(wire("text_delta", { id: current.textId, delta: String(event.delta ?? "") }));
          return emit(events);
        }
        case "response.output_text.done":
          if (!owned(event.response_id) || !current?.textOpen) return null;
          current.textOpen = false;
          return emit([wire("text_complete", { id: current.textId })]);
        case "response.done": {
          if (!owned(event.response?.id) || !current) return null;
          const status = event.response?.status;
          const now = new Date().toISOString();
          const events = [
            ...opening(),
            wire("turn_complete", { id: "turn_1", role: "assistant", iteration: 1, completedAt: now }),
            wire("execution_complete", {
              kind: "agent",
              success: status === "completed",
              completedAt: now,
              ...(status === "completed" ? {} : { error: `Response ${status ?? "ended"}` }),
            }),
          ];
          const done = current;
          current = null;
          return [
            { kind: "events", streamId: done.streamId, events },
            { kind: "end", streamId: done.streamId, reason: "complete" },
          ];
        }
        case "error":
          return {
            kind: "error",
            ...(current ? { streamId: current.streamId } : {}),
            code: event.error?.code ?? event.error?.type,
            message: event.error?.message ?? "OpenAI Realtime error",
          };
        default:
          return null;
      }
    },

    // A stopped reply: cancel the in-flight response (the socket stays up) and stop routing its events.
    detach(streamId) {
      if (current?.streamId !== streamId) return null;
      if (current.responseId === undefined) stoppedBeforeCreated += 1;
      const responseId = current.responseId;
      current = null;
      return JSON.stringify({ type: "response.cancel", ...(responseId ? { response_id: responseId } : {}) });
    },
  };
}
