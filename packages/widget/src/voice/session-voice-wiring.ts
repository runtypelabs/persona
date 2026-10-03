/**
 * Session-side voice wiring: attaches a freshly constructed provider's
 * callbacks (transcripts, status, level, errors) to an `AgentWidgetSession`.
 *
 * Lives in the lazy voice-runtime chunk (exported from `voice-runtime.ts`),
 * not in `session.ts`: it only runs after that chunk resolves in
 * `setupVoice`, so pages without voice never download it. The session hands
 * over its private voice state through a `VoiceWiringHost`.
 */
import type { AgentWidgetSession } from "../session";
import type { AgentWidgetMessage, VoiceProvider, VoiceStatus } from "../types";
import type { KeyedVoiceTranscript } from "./keyed-voice-transcript";
import type { VoiceDelegationCapture, createVoiceSessionBridge } from "./voice-delegation";
import type { VoiceTurnTracker } from "./voice-turn-tracker";

/** The session members the wiring touches (some are TS-private on the class). */
export type VoiceWiringSession = Pick<
  AgentWidgetSession,
  "injectMessage" | "sendMessage" | "resolveWebMcpApproval" | "resolveApproval"
> & {
  messages: AgentWidgetMessage[];
  callbacks: AgentWidgetSession["callbacks"];
  config: AgentWidgetSession["config"];
  streaming: boolean;
  ttsSpokenMessageIds: Set<string>;
  webMcpApprovalResolvers: Map<string, unknown>;
  upsertMessage: (message: AgentWidgetMessage) => void;
  speakLatestAssistantMessage: (only?: string[]) => void;
};

/** Accessors for the session's `#private` voice state. */
export type VoiceWiringHost = {
  session: VoiceWiringSession;
  provider: () => VoiceProvider | null;
  generation: () => number;
  keyed: KeyedVoiceTranscript | null;
  pendingUser: string | null;
  pendingAssistant: string | null;
  turns: () => VoiceTurnTracker;
  busy: () => boolean;
  setStreaming: (streaming: boolean) => void;
  setDelegation: (capture: VoiceDelegationCapture | null) => void;
  setLevel: (level: number) => void;
  setStatus: (status: VoiceStatus) => void;
  settlePending: (final: boolean) => void;
};

/** Wire callbacks onto a freshly constructed provider and connect it. */
export const wireSessionVoice = (
  p: VoiceWiringHost,
  provider: VoiceProvider,
  Keyed?: typeof KeyedVoiceTranscript,
  createBridge?: typeof createVoiceSessionBridge
): void => {
  const s = p.session;
  try {
    p.keyed = Keyed
      ? new Keyed({
          find: (id) => s.messages.find((m) => m.id === id),
          inject: (options) => s.injectMessage(options),
          upsert: (message) => s.upsertMessage(message),
          settle: (ids) => {
            s.messages = s.messages.map((m) =>
              ids.has(m.id) ? { ...m, streaming: false, voiceProcessing: false } : m
            );
            s.callbacks.onMessagesChanged([...s.messages]);
          },
          // A chat turn (e.g. a delegated one) owns the flag while it runs.
          setStreaming: (streaming) => {
            if (streaming || !p.busy()) p.setStreaming(streaming);
          },
          markSpoken: (id) => {
            s.ttsSpokenMessageIds.add(id);
          }
        })
      : null;
    if (createBridge && provider.setSessionBridge) {
      provider.setSessionBridge(
        createBridge({
          messages: () => s.messages,
          busy: () => p.busy(),
          parked: () => s.webMcpApprovalResolvers.size > 0,
          claim: (text, userUtteranceIds) => p.keyed?.claimUserTurn(text, userUtteranceIds) ?? null,
          send: (text, userMessageId) =>
            s.sendMessage(text, { viaVoice: true, voiceTurn: { userMessageId } }),
          track: (capture) => {
            p.setDelegation(capture);
          },
          unspoken: (ids) => {
            for (const id of ids) s.ttsSpokenMessageIds.delete(id);
            // Its stream already ended (browser TTS skipped it then): read it
            // now. A stream still running reads it when it ends, once.
            if (!s.streaming) s.speakLatestAssistantMessage(ids);
          },
          decide: (id) => {
            if (s.webMcpApprovalResolvers.has(id)) return s.resolveWebMcpApproval(id, 'denied');
            const approval = s.messages.find((m) => m.id === id)?.approval;
            if (approval?.status === 'pending') void s.resolveApproval(approval, 'denied');
          }
        })
      );
    }
    const generation = p.generation();
    const isCurrent = () => p.provider() === provider && generation === p.generation();

    // Read configurable text from widget config
    const voiceRecognitionConfig = s.config.voiceRecognition ?? {};
    const processingErrorText = voiceRecognitionConfig.processingErrorText ?? 'Voice processing failed. Please try again.';

    // STT-style providers (browser + bring-your-own `custom`) deliver a final
    // transcript that we send as a normal user message: the agent then runs
    // via the standard SSE chat path. Only the realtime `runtype` provider is
    // excluded here: it owns the whole turn and drives onTranscript below.
    provider.onResult((result) => {
      if (!isCurrent()) return;
      if (result.provider !== 'runtype') {
        if (result.text && result.text.trim()) {
          s.sendMessage(result.text, { viaVoice: true });
        }
      }
    });

    // Realtime (runtype) voice: drive the chat thread from streaming
    // transcript frames. Live interim user text grows in place; the user
    // message finalizes immediately on transcript_final{user}; the assistant
    // reply lands (a single block, synced with audio) on its final frame.
    // In-flight bubbles carry voiceProcessing=true so consumers can style
    // them via messageTransform; it clears once the text is final.
    if (provider.onTranscript) {
      provider.onTranscript((role, text, isFinal, metadata) => {
        if (!isCurrent()) return;
        if (metadata?.turnId) {
          p.keyed?.apply(role, text, isFinal, metadata.turnId, metadata.startMs, metadata.caption);
          return;
        }
        if (role === 'user') {
          if (!p.pendingUser) {
            const msg = s.injectMessage({
              role: 'user',
              content: text,
              streaming: false,
              voiceProcessing: !isFinal
            });
            p.pendingUser = msg.id;
          } else {
            s.upsertMessage({
              id: p.pendingUser,
              role: 'user',
              content: text,
              createdAt: new Date().toISOString(),
              streaming: false,
              voiceProcessing: !isFinal
            });
          }

          if (isFinal) {
            p.turns().start(metadata?.turnId);
            // User finished: the agent is now thinking. Release the user
            // bubble (a new interim starts a fresh turn) and show a typing
            // indicator in a fresh assistant placeholder.
            p.pendingUser = null;
            const assistantMsg = s.injectMessage({
              role: 'assistant',
              content: '',
              streaming: true,
              voiceProcessing: true
            });
            p.pendingAssistant = assistantMsg.id;
            p.setStreaming(true);
          }
        } else {
          if (!p.turns().accepts(metadata?.turnId)) return;
          // assistant: runtype sends a single final; the isFinal=false path
          // is reserved for delta-streaming providers (future BYO).
          if (p.pendingAssistant) {
            s.upsertMessage({
              id: p.pendingAssistant,
              role: 'assistant',
              content: text,
              createdAt: new Date().toISOString(),
              streaming: !isFinal,
              voiceProcessing: !isFinal
            });
          } else {
            const msg = s.injectMessage({
              role: 'assistant',
              content: text,
              streaming: !isFinal,
              voiceProcessing: !isFinal
            });
            p.pendingAssistant = msg.id;
          }

          if (isFinal) {
            // The provider plays this reply's audio: mark it spoken so
            // browser TTS doesn't double-speak when streaming ends. Must run
            // BEFORE setStreaming(false), which triggers the TTS check.
            if (p.pendingAssistant) {
              s.ttsSpokenMessageIds.add(p.pendingAssistant);
            }
            p.setStreaming(false);
            p.pendingAssistant = null;
          }
        }
      });
    }

    // Live capture amplitude, when the provider owns an audio graph. Stored,
    // not forwarded per callback: the UI samples it on its own frame loop.
    if (provider.onLevel) {
      provider.onLevel((level) => {
        if (!isCurrent()) return;
        p.setLevel(
          Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0
        );
      });
    }

    // Surface per-turn latency metrics to the optional config hook.
    if (provider.onMetrics) {
      provider.onMetrics((metrics) => {
        if (!isCurrent()) return;
        s.config.voiceRecognition?.onMetrics?.(metrics);
      });
    }

    provider.onError((error) => {
      if (!isCurrent()) return;
      console.error('Voice error:', error);

      // If error occurs while placeholders are pending, update assistant with error text
      if (p.pendingAssistant) {
        s.upsertMessage({
          id: p.pendingAssistant,
          role: 'assistant',
          content: processingErrorText,
          createdAt: new Date().toISOString(),
          streaming: false,
          voiceProcessing: false
        });
        p.setStreaming(false);
        p.pendingUser = null;
        p.pendingAssistant = null;
      }
      p.keyed?.fail(processingErrorText);
    });

    provider.onStatusChange((status) => {
      if (!isCurrent()) return;
      p.setStatus(status);
      if (status === 'listening' || status === 'idle' || status === 'disconnected') {
        p.settlePending(status !== 'listening');
      }
      // Keyed turns overlap listening (full duplex), so only a call end settles them.
      if (status === 'idle' || status === 'disconnected') {
        p.keyed?.settle();
      }
      s.callbacks.onVoiceStatusChanged?.(status);
    });

    provider.connect();

  } catch (error) {
    console.error('Failed to setup voice:', error);
  }
};
