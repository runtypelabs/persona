import type { FlueClient, FlueConversationMessage } from "@flue/sdk";
import {
  createPersonaSSEStream,
  type PersonaStreamEmitter,
} from "./persona-wire";

/** Project supported, materialized Flue parts; never interpret private stream chunks. */
export function createConversationProjector(
  emit: PersonaStreamEmitter,
  submissionId: string
) {
  const textByPart = new Map<string, string>();
  const reasoningByPart = new Map<string, string>();
  const completedReasoning = new Set<string>();
  const startedTools = new Set<string>();
  const completedTools = new Set<string>();
  let emittedText = false;
  return {
    get emittedText() {
      return emittedText;
    },
    project(messages: FlueConversationMessage[]) {
      for (const message of messages) {
        if (
          message.role !== "assistant" ||
          message.display !== "visible" ||
          message.submissionId !== submissionId
        )
          continue;
        for (const [index, part] of message.parts.entries()) {
          if (part.type === "text") {
            const key = `${message.id}:${index}`;
            const previous = textByPart.get(key) ?? "";
            // Materialized snapshots can repeat after a reconnect. Only append new text.
            if (
              part.text.startsWith(previous) &&
              part.text.length > previous.length
            ) {
              emit.textDelta(part.text.slice(previous.length));
              emittedText = true;
              textByPart.set(key, part.text);
            }
          } else if (part.type === "reasoning") {
            const id = `reasoning_${message.id}_${index}`;
            if (!reasoningByPart.has(id)) {
              reasoningByPart.set(id, "");
              emit.reasoningStart(id);
            }
            const previous = reasoningByPart.get(id)!;
            if (
              !completedReasoning.has(id) &&
              part.text.startsWith(previous) &&
              part.text.length > previous.length
            ) {
              emit.reasoningDelta(id, part.text.slice(previous.length));
              reasoningByPart.set(id, part.text);
            }
            if (part.state === "done" && !completedReasoning.has(id)) {
              completedReasoning.add(id);
              emit.reasoningComplete(id);
            }
          } else if (part.type === "dynamic-tool") {
            if (!startedTools.has(part.toolCallId)) {
              startedTools.add(part.toolCallId);
              emit.toolStart(part.toolName, part.input, part.toolCallId);
            }
            if (
              !completedTools.has(part.toolCallId) &&
              part.state !== "input-available"
            ) {
              completedTools.add(part.toolCallId);
              emit.toolComplete(
                part.toolCallId,
                part.state === "output-available"
                  ? part.output
                  : { error: part.errorText },
                part.state === "output-available"
              );
            }
          }
        }
      }
    },
  };
}

export function streamFlueConversation(
  client: Pick<FlueClient, "send" | "read" | "observe" | "history">,
  prompt: string,
  signal?: AbortSignal
) {
  return createPersonaSSEStream(async ({ emit, signal: streamSignal }) => {
    const workSignal = signal
      ? AbortSignal.any([signal, streamSignal])
      : streamSignal;
    // A request cancellation stops observing; Flue work remains durable. See README.
    let observation: ReturnType<FlueClient["observe"]> | undefined;
    let unsubscribe: (() => void) | undefined;
    try {
      const admission = await client.send({
        message: { kind: "user", body: prompt },
        signal: workSignal,
      });
      const projector = createConversationProjector(
        emit,
        admission.submissionId
      );
      observation = client.observe({ live: "sse", signal: workSignal });
      unsubscribe = observation.subscribe(() => {
        const snapshot = observation?.getSnapshot();
        if (snapshot?.conversation)
          projector.project(snapshot.conversation.messages);
      });
      const reply = await client.read(admission, { signal: workSignal });
      // The observer can lag the settlement reader; flush the authoritative final snapshot.
      projector.project(
        (await client.history({ signal: workSignal })).messages
      );
      // Flue may coalesce a submission into a busy response with a different submission id.
      if (!projector.emittedText && reply.text) emit.textDelta(reply.text);
      emit.complete();
    } catch {
      // Do not expose upstream URLs, bearer tokens, provider responses, or stack traces.
      emit.error(
        "The release assistant could not finish this request. Check the Flue service and try again."
      );
    } finally {
      unsubscribe?.();
      observation?.close();
    }
  });
}
