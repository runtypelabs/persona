import type {
  AgentWidgetMessage,
  VoiceDelegationRequest,
  VoiceDelegationResult,
  VoiceSessionBridge,
} from "../types";

/** What a delegated turn streamed: its assistant messages, and whether it failed. */
export type VoiceDelegationCapture = { ids: string[]; failed: boolean };

/** The session internals the delegation bridge drives. */
export interface VoiceDelegationHost {
  messages(): AgentWidgetMessage[];
  /** A chat turn is streaming, resuming, or running local (WebMCP) tools. */
  busy(): boolean;
  /** A local (WebMCP) tool is waiting on the visitor's approval. */
  parked(): boolean;
  /** The transcript bubble the request came from (see KeyedVoiceTranscript.claimUserTurn). */
  claim(userText: string, userTurnId?: string): string | null;
  /** sendMessage as a voice turn, submitting `userMessageId`'s bubble when given. */
  send(userText: string, userMessageId: string | undefined): Promise<void>;
  /** Route the chat stream's assistant messages and failures into `capture` (or stop). */
  track(capture: VoiceDelegationCapture | null): void;
}

const SETTLE_POLL_MS = 50;
const WAITING_FOR_INPUT = "I need your answer in the chat before I can continue.";

/**
 * Builds the {@link VoiceSessionBridge} a full-duplex provider uses to run
 * delegated turns through the widget's chat pipeline. Ships in the lazy
 * voice-runtime chunk.
 */
export function createVoiceSessionBridge(host: VoiceDelegationHost): VoiceSessionBridge {
  // Turns end on many paths (stream end, WebMCP resumes, reconnects): poll.
  // A turn parked on the visitor stays busy, and a replaced one is done.
  const settled = async (capture?: VoiceDelegationCapture) => {
    do {
      await new Promise((resolve) => setTimeout(resolve, SETTLE_POLL_MS));
    } while (host.busy() && !(capture && (host.parked() || capture.failed)));
  };

  return {
    getHistory: () =>
      host.messages().flatMap((m) =>
        (m.role === "user" || m.role === "assistant") && !m.variant && !m.voiceProcessing && m.content
          ? [{ role: m.role, content: m.content }]
          : [],
      ),

    async runDelegatedTurn({ userText, userTurnId }: VoiceDelegationRequest): Promise<VoiceDelegationResult> {
      // Queue behind a turn already in flight rather than aborting it.
      if (host.busy()) await settled();
      const capture: VoiceDelegationCapture = { ids: [], failed: false };
      host.track(capture);
      try {
        await host.send(userText, host.claim(userText, userTurnId) ?? undefined);
        // Local tools and approvals may continue the turn past the first stream.
        await settled(capture);
      } catch {
        capture.failed = true;
      } finally {
        host.track(null);
      }
      const replies = capture.ids.flatMap((id) => host.messages().find((m) => m.id === id) ?? []);
      let text = replies
        .filter((m) => !m.variant && m.content.trim())
        .map((m) => m.content.trim())
        .join("\n\n");
      // A turn parked on the visitor (any approval, a question) still answers
      // now, so the voice model can tell them to finish it in the chat.
      if (
        (!capture.failed && host.parked()) ||
        replies.some(
          (m) =>
            (m.variant === "approval" && m.approval?.status === "pending") ||
            (m.agentMetadata?.awaitingLocalTool &&
              !m.agentMetadata.askUserQuestionAnswered &&
              !m.toolCall?.name?.startsWith("webmcp:")),
        )
      ) {
        text = `${text}\n\n${WAITING_FOR_INPUT}`.trim();
      }
      return { ok: !capture.failed && !!text, text };
    },
  };
}
