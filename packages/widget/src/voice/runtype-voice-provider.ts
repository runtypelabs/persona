// Runtype Voice Provider
//
// Real-time streaming voice client for Runtype's `/ws/agents/:agentId/voice`
// endpoint. The "call" is a single WebSocket session:
//
//   - up:   continuous mic audio as raw PCM16 LE mono @ 16kHz (binary frames)
//   - down: WAV-wrapped PCM16 LE mono @ 24kHz audio (binary frames) +
//           JSON control frames (transcript_interim / transcript_final /
//           audio_end / metrics).
//
// Full duplex (speech-to-speech, e.g. GPT-Live): the client always declares
// `voiceCapabilities=full-duplex-v1`; engines that don't speak it ignore the
// param. A full-duplex session announces itself with
// `session_config{speechMode:'speech_to_speech'}` and then sends turn-keyed
// `transcript_update{role,text,turnId,final}` frames (later frames replace the
// text for the same (turnId, role); user and assistant turns can overlap),
// `delegation_started/completed` around agent tool turns, and `audio_clear` on
// barge-in. Reply audio has no per-turn end marker in that mode, so playback is
// treated as continuous: the "speaking" status is released by a timer derived
// from the queued audio duration rather than by the engine's end-of-stream.
//
// The server's STT owns turn-taking, so the client streams continuously and
// has no client-side VAD, barge-in monitoring, or batch upload. Auth rides the
// `Sec-WebSocket-Protocol` subprotocol (`['runtype.bearer', clientToken]`),
// never the query string: the token is never placed in a URL or logged.
//
// A continuous always-hot mic is, in UX terms, a permanent barge-in session, so
// `getInterruptionMode()` reports the constant `'barge-in'` and the existing
// mic-button wiring (ui.ts) treats a click as "hang up at any state" unchanged.
//
// Prewarm (`prewarm()`, called on mic intent): by default a fire-and-forget
// `POST /v1/client/agents/:agentId/voice/prewarm`. With `prewarmMode: 'attach'`
// the WebSocket opens early with `clientCapabilities=attach` and the extra
// `runtype.attach` subprotocol. If the server negotiates `runtype.attach`, the
// socket idles (no call) until `startListening()` sends `{"type":"start"}`; if
// it negotiates plain `runtype.bearer`, it ignored attach and the call is
// already live, so `startListening()` adopts it as is.
//
// Client delegation (full duplex, when the session supplied a bridge and
// `clientDelegation` isn't false): the socket also declares
// `clientCapabilities=client-delegation`. A server that accepts it confirms
// with `session_config{clientDelegation:true}` and then sends
// `delegation_requested{turnId,userText}` instead of running the agent turn
// itself; the bridge runs it through the widget's chat pipeline (one at a
// time) and the provider answers `delegation_result{turnId,text,ok}`. The voice
// model's spoken read-back of a successful result (the first new assistant
// utterance after its `delegation_completed`, unless the visitor speaks first)
// is folded: the rendered chat message already shows it. Transcripts in such a
// call are display-only captions, never sent to the agent as conversation; a
// user bubble becomes conversation only when it is submitted. Separately, a
// server that announces `session_config{contextFrames:true}` gets one
// `context{text}` frame (chat history as of call start plus the host's
// `callContext`), held until the visitor's first final transcript or first
// delegation. Servers that announce neither get neither frame: an unknown
// client frame type ends the call on older servers.

import type {
  VoiceProvider,
  VoiceResult,
  VoiceStatus,
  VoiceConfig,
  VoiceDelegationResult,
  VoiceMetrics,
  VoicePlaybackEngine,
  VoiceSessionBridge,
  VoiceTranscriptMetadata,
} from "../types";
import { AudioPlaybackManager } from "./audio-playback-manager";

const CAPTURE_SAMPLE_RATE = 16000;
const PLAYBACK_SAMPLE_RATE = 24000;
const CAPTURE_BUFFER_SIZE = 4096;
/**
 * Mic audio held while the call socket handshakes (a slow upgrade can take
 * seconds, and the visitor is already talking): 8 s of 16-bit PCM, 256 KB,
 * well under the server's startup queue. Past it the oldest frames go.
 */
const PRE_OPEN_AUDIO_MAX_BYTES = CAPTURE_SAMPLE_RATE * 2 * 8;
/**
 * RMS-to-0..1 gain for the published capture level. Conversational speech sits
 * around 0.05 to 0.3 RMS, so the raw value would never leave the bottom of the
 * range; this maps a normal voice to roughly the middle.
 */
const LEVEL_RMS_SCALE = 4;
const RIFF_MAGIC = 0x52494646; // "RIFF"
/** `prewarm()` warms at most once per this window per provider instance. */
const PREWARM_THROTTLE_MS = 30_000;
/** How long `startListening()` waits on an attach still handshaking. */
const ATTACH_HANDSHAKE_TIMEOUT_MS = 5_000;
/** Attached-socket idle window: server default and clamp range. */
const ATTACH_IDLE_DEFAULT_MS = 30_000;
const ATTACH_IDLE_MIN_MS = 30_000;
const ATTACH_IDLE_MAX_MS = 600_000;

/** A socket opened by an `'attach'` prewarm, waiting for the click. */
type AttachedSocket = {
  ws: WebSocket;
  /**
   * `connecting` until the handshake completes; then `attached` (no call yet,
   * needs `start`) or `live` (the server ignored attach and the call is live).
   */
  state: "connecting" | "attached" | "live";
  /** Settles when the handshake completes, fails, or the socket is released. */
  ready: Promise<void>;
  settle: () => void;
  openedAt: number;
  idleTimer: ReturnType<typeof setTimeout> | undefined;
};
/** Declared on every call; non-full-duplex engines ignore it. */
const FULL_DUPLEX_CAPABILITY = "full-duplex-v1";
/**
 * Slack added to the computed end of queued speech-to-speech audio before the
 * provider reports the reply as drained (covers engine prebuffer + scheduling).
 */
const CONTINUOUS_DRAIN_GRACE_MS = 300;
/**
 * How long a client `cancel` waits for the server's `audio_clear` before audio
 * is accepted again, so a lost acknowledgement can't mute the call for good.
 */
const CANCEL_ACK_TIMEOUT_MS = 2000;
/**
 * How long a `delegation_result` waits for the call context still being built
 * (a slow host `callContext`), so context always precedes the result. Past it,
 * the result goes out and that context is dropped.
 */
const CONTEXT_BEFORE_RESULT_TIMEOUT_MS = 2000;
const CLIENT_DELEGATION_CAPABILITY = "client-delegation";
/** Call-start context frame: total cap, host share, history window, per-message cap. */
const CONTEXT_MAX_CHARS = 8000;
const CONTEXT_HOST_MAX_CHARS = 4000;
const CONTEXT_MESSAGES = 12;
const CONTEXT_MESSAGE_MAX_CHARS = 2000;

type TranscriptCallback = (
  role: "user" | "assistant",
  text: string,
  isFinal: boolean,
  metadata?: VoiceTranscriptMetadata,
) => void;

/**
 * The call-start `context` text: "Conversation so far:" plus the last
 * {@link CONTEXT_MESSAGES} messages (newest kept when over budget), then the
 * host's extra context (at most {@link CONTEXT_HOST_MAX_CHARS}, so history
 * always fits). Capped at {@link CONTEXT_MAX_CHARS}; "" when empty.
 */
export function buildCallContext(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  extra: string,
): string {
  const header = "Conversation so far:";
  const tail = extra.slice(0, CONTEXT_HOST_MAX_CHARS).trim();
  let budget = CONTEXT_MAX_CHARS - (tail ? tail.length + 2 : 0) - header.length;
  const lines: string[] = [];
  for (const message of history.slice(-CONTEXT_MESSAGES).reverse()) {
    let text = message.content.replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (text.length > CONTEXT_MESSAGE_MAX_CHARS) {
      text = `${text.slice(0, CONTEXT_MESSAGE_MAX_CHARS - 1)}…`;
    }
    const line = `${message.role === "user" ? "User" : "Assistant"}: ${text}`;
    if (line.length + 1 > budget) break;
    budget -= line.length + 1;
    lines.unshift(line);
  }
  const parts = lines.length > 0 ? [`${header}\n${lines.join("\n")}`] : [];
  if (tail) parts.push(tail);
  return parts.join("\n\n");
}

/**
 * Strip the canonical 44-byte WAV header (if present) and return the raw PCM16
 * payload. The ElevenLabs realtime path WAV-wraps each frame; the Cloudflare DO
 * path may send raw PCM: detect the RIFF magic and handle both.
 */
function stripWavHeader(buf: ArrayBuffer): Uint8Array {
  if (buf.byteLength >= 44) {
    const view = new DataView(buf);
    if (view.getUint32(0, false) === RIFF_MAGIC) {
      return new Uint8Array(buf, 44);
    }
  }
  return new Uint8Array(buf);
}

/** Derive a ws(s):// base URL from a configured host (full URL or bare host). */
function toWsBase(host: string): string {
  const trimmed = host.replace(/\/+$/, "");
  if (/^wss?:\/\//i.test(trimmed)) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/^http/i, "ws");
  const secure =
    typeof window !== "undefined" && window.location?.protocol === "https:";
  return `${secure ? "wss:" : "ws:"}//${trimmed}`;
}

/** Derive an http(s):// base URL from a configured host (the ws base, reversed). */
function toHttpBase(host: string): string {
  return toWsBase(host).replace(/^ws/i, "http");
}

function clampAttachIdleMs(ms: number | undefined): number {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return ATTACH_IDLE_DEFAULT_MS;
  return Math.min(ATTACH_IDLE_MAX_MS, Math.max(ATTACH_IDLE_MIN_MS, Math.round(ms)));
}

export class RuntypeVoiceProvider implements VoiceProvider {
  type: "runtype" = "runtype";

  private ws: WebSocket | null = null;
  private captureContext: AudioContext | null = null;
  private levelCallbacks: ((level: number) => void)[] = [];
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  // Captured before the call socket opened; flushed in order on open.
  private preOpenAudio: ArrayBuffer[] = [];
  private preOpenBytes = 0;
  private playback: VoicePlaybackEngine | null = null;

  // True while a call (WS session) is live: drives the idempotent start guard
  // and `isBargeInActive()`.
  private callLive = false;
  private isSpeaking = false;

  // Invalidates in-flight async work (playback-engine creation, late frames,
  // status transitions) after a teardown/restart so a stale callback can't act
  // on a newer call's resources. Bumped on every start and every cleanup.
  private callGeneration = 0;

  // Distinguishes a user-initiated close (code 1000) from a dropped connection.
  private intentionalClose = false;

  // Prewarm latch and the (at most one) socket an `'attach'` prewarm opened.
  private lastPrewarmAt = Number.NEGATIVE_INFINITY;
  private attached: AttachedSocket | null = null;
  // Full-duplex (speech-to-speech) session state; reset on every cleanup.
  private speechToSpeech = false;
  private delegating = false;
  // Until this time, audio and assistant text belong to a reply the client cancelled.
  private cancelledUntil = 0;
  private playbackEndsAt = 0;
  private drainTimer: ReturnType<typeof setTimeout> | undefined;
  // Engine `onFinished` callbacks are one-shot (cleared on fire and on flush),
  // so the provider re-registers before each reply that may need it.
  private finishedArmed = false;
  // Client delegation (see header); per-call state reset on every cleanup.
  private bridge: VoiceSessionBridge | null = null;
  private clientDelegation = false;
  // The server accepts `delegation_followup` (session_config.followUpFrames).
  private followUpFrames = false;
  // Aborts pending approval follow-ups when the call ends.
  private followUps: AbortController | null = null;
  // Call-start context, built at session_config and held until the visitor's
  // first final transcript (sent earlier, the voice model tends to answer it).
  private contextSent = false;
  private pendingContext: Promise<string> | null = null;
  // The released context's send; settles once it went out (or never will).
  private contextSend: { done: Promise<void>; drop: () => void } | null = null;
  private delegations: Promise<void> = Promise.resolve();
  // Delegations answered ok: their spoken read-back is folded.
  private answered = new Set<string>();
  private foldReadback = false;
  private assistantTurns = new Set<string>();
  private foldedTurns = new Set<string>();

  private resultCallbacks: ((result: VoiceResult) => void)[] = [];
  private errorCallbacks: ((error: Error) => void)[] = [];
  private statusCallbacks: ((status: VoiceStatus) => void)[] = [];
  private transcriptCallbacks: TranscriptCallback[] = [];
  private metricsCallbacks: ((metrics: VoiceMetrics) => void)[] = [];

  constructor(private config: VoiceConfig["runtype"]) {}

  // --- VoiceProvider lifecycle ----------------------------------------------

  /** No-op: the WS session opens lazily in `startListening` (the "call"). */
  async connect(): Promise<void> {}

  setSessionBridge(bridge: VoiceSessionBridge): void {
    this.bridge = bridge;
  }

  /**
   * Warm the voice path ahead of the click. Fire-and-forget and throttled to
   * once per {@link PREWARM_THROTTLE_MS}; never emits an error or a status.
   */
  prewarm(): void {
    if (this.callLive || this.attached) return;
    const agentId = this.config?.agentId;
    const token = this.config?.clientToken;
    const host = this.config?.host;
    if (!agentId || !token || !host) return;
    const now = Date.now();
    if (now - this.lastPrewarmAt < PREWARM_THROTTLE_MS) return;
    this.lastPrewarmAt = now;
    try {
      if (this.config?.prewarmMode === "attach") {
        this.attach(host, agentId, token);
      } else {
        this.requestPrewarm(host, agentId, token);
      }
    } catch {
      // A prewarm must never surface an error; the click connects normally.
    }
  }

  private requestPrewarm(host: string, agentId: string, token: string): void {
    if (typeof fetch !== "function") return;
    const url = `${toHttpBase(host)}/v1/client/agents/${encodeURIComponent(agentId)}/voice/prewarm`;
    void fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      keepalive: true,
    }).catch(() => {});
  }

  private attach(host: string, agentId: string, token: string): void {
    const params = new URLSearchParams({ clientCapabilities: "attach" });
    const configuredIdleMs = this.config?.attachIdleMs;
    const idleMs = clampAttachIdleMs(configuredIdleMs);
    if (configuredIdleMs !== undefined) params.set("attachIdleMs", String(idleMs));
    const ws = new WebSocket(this.voiceSocketUrl(host, agentId, params), [
      "runtype.bearer",
      "runtype.attach",
      token,
    ]);
    ws.binaryType = "arraybuffer";
    let settle: () => void = () => {};
    const ready = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const entry: AttachedSocket = {
      ws,
      state: "connecting",
      ready,
      settle,
      openedAt: 0,
      idleTimer: undefined,
    };
    this.attached = entry;

    ws.onopen = () => {
      if (this.attached !== entry) return;
      entry.state = ws.protocol === "runtype.attach" ? "attached" : "live";
      entry.openedAt = Date.now();
      this.armAttachIdle(entry, idleMs);
      if (entry.state === "attached") ws.send('{"type":"ping"}');
      entry.settle();
    };
    ws.onmessage = (event) => {
      if (this.attached !== entry || typeof event.data !== "string") return;
      let msg: { type?: unknown; idleMs?: unknown };
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      // The server's idle window is authoritative; close no later than it does.
      if (msg.type === "attached" && typeof msg.idleMs === "number") {
        this.armAttachIdle(entry, msg.idleMs - (Date.now() - entry.openedAt));
      }
    };
    ws.onerror = () => {};
    ws.onclose = () => {
      if (this.attached === entry) this.releaseAttached();
    };
  }

  private armAttachIdle(entry: AttachedSocket, ms: number): void {
    clearTimeout(entry.idleTimer);
    entry.idleTimer = setTimeout(() => {
      if (this.attached === entry) this.releaseAttached();
    }, Math.max(0, ms));
  }

  /** Close and forget the prewarmed socket, if any. Silent by design. */
  private releaseAttached(): void {
    const entry = this.attached;
    if (!entry) return;
    this.attached = null;
    clearTimeout(entry.idleTimer);
    const { ws } = entry;
    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;
    entry.settle();
    if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) {
      try {
        ws.close(1000, "prewarm released");
      } catch {
        // ignore
      }
    }
  }

  /**
   * Hand the prewarmed socket to the call, waiting up to
   * {@link ATTACH_HANDSHAKE_TIMEOUT_MS} for a handshake still in flight.
   * Resolves `null` when there is none, it stalled, or it dropped, so the
   * caller opens a fresh socket.
   */
  private async takeAttachedSocket(): Promise<{ ws: WebSocket; live: boolean } | null> {
    const entry = this.attached;
    if (!entry) return null;
    if (entry.state === "connecting") {
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        entry.ready,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, ATTACH_HANDSHAKE_TIMEOUT_MS);
        }),
      ]);
      clearTimeout(timer);
    }
    if (this.attached !== entry) return null;
    if (entry.state === "connecting" || entry.ws.readyState !== WebSocket.OPEN) {
      this.releaseAttached();
      return null;
    }
    this.attached = null;
    clearTimeout(entry.idleTimer);
    return { ws: entry.ws, live: entry.state === "live" };
  }

  /**
   * The call socket URL. Every socket declares the full-duplex capability;
   * `extra` adds params (e.g. an attach prewarm's). The token never goes in
   * the URL, and these params are not secrets.
   */
  private voiceSocketUrl(host: string, agentId: string, extra?: URLSearchParams): string {
    const params = new URLSearchParams({ voiceCapabilities: FULL_DUPLEX_CAPABILITY });
    extra?.forEach((value, key) => params.set(key, value));
    if (this.bridge && this.config?.clientDelegation !== false) {
      const declared = params.get("clientCapabilities");
      params.set(
        "clientCapabilities",
        declared ? `${declared},${CLIENT_DELEGATION_CAPABILITY}` : CLIENT_DELEGATION_CAPABILITY,
      );
    }
    return `${toWsBase(host)}/ws/agents/${encodeURIComponent(agentId)}/voice?${params}`;
  }

  /** Start the call: acquire mic, open the WS, stream PCM until hang-up. */
  async startListening(): Promise<void> {
    if (this.callLive) return; // idempotent: a call is already live

    const agentId = this.config?.agentId;
    const token = this.config?.clientToken;
    const host = this.config?.host;
    if (!agentId) throw new Error("Runtype voice requires an agentId");
    if (!token) throw new Error("Runtype voice requires a clientToken");
    if (!host) throw new Error("Runtype voice requires a host (or widget apiUrl)");

    const generation = ++this.callGeneration;
    this.intentionalClose = false;
    this.callLive = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: CAPTURE_SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
        },
      });
      if (generation !== this.callGeneration) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.mediaStream = stream;

      // Create + resume both contexts inside the click gesture (iOS autoplay).
      const AudioCtx =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      const captureContext: AudioContext = new AudioCtx({
        sampleRate: CAPTURE_SAMPLE_RATE,
      });
      if (captureContext.state === "suspended") {
        await captureContext.resume().catch(() => {});
      }
      this.captureContext = captureContext;

      const engine = this.config?.createPlaybackEngine
        ? await this.config.createPlaybackEngine()
        : new AudioPlaybackManager(PLAYBACK_SAMPLE_RATE);
      if (generation !== this.callGeneration) {
        // Torn down while async work was in flight: free what we acquired.
        void engine.destroy();
        stream.getTracks().forEach((t) => t.stop());
        captureContext.close().catch(() => {});
        return;
      }
      this.playback = engine;
      this.armPlaybackFinished();
      // Capture from now: frames buffer until the call socket is open.
      this.startCapture(captureContext, stream, generation);

      const adopted = await this.takeAttachedSocket();
      if (generation !== this.callGeneration) {
        adopted?.ws.close(1000, "client ended call");
        return;
      }
      if (adopted) {
        const { ws } = adopted;
        this.ws = ws;
        this.bindCallSocket(ws, generation);
        if (!adopted.live) ws.send('{"type":"start"}');
        this.flushPreOpenAudio(ws);
        this.emitStatus("listening");
        return;
      }

      // Token rides the subprotocol; `runtype.bearer` is the marker the server
      // echoes as the negotiated subprotocol (browsers fail the handshake if an
      // offered subprotocol goes unanswered).
      const ws = new WebSocket(this.voiceSocketUrl(host, agentId), ["runtype.bearer", token]);
      ws.binaryType = "arraybuffer";
      this.ws = ws;

      ws.onopen = () => {
        if (generation !== this.callGeneration) return;
        this.flushPreOpenAudio(ws);
        this.emitStatus("listening");
      };
      this.bindCallSocket(ws, generation);
    } catch (error) {
      this.cleanup();
      this.emitError(error as Error);
      this.emitStatus("error");
      throw error;
    }
  }

  /** Route a call socket's frames, errors, and close into this call. */
  private bindCallSocket(ws: WebSocket, generation: number): void {
    ws.onmessage = (event) => this.handleMessage(event, generation);

    ws.onerror = () => {
      if (generation !== this.callGeneration) return;
      this.emitError(new Error("Voice connection failed"));
      this.emitStatus("error");
      this.cleanup();
    };

    ws.onclose = (evt) => {
      if (this.intentionalClose) {
        this.intentionalClose = false;
        return;
      }
      if (generation !== this.callGeneration) return;
      if (evt.code !== 1000) {
        const codeMsg = evt.code ? ` (code ${evt.code})` : "";
        this.emitError(new Error(`Voice connection closed${codeMsg}`));
        this.emitStatus("error");
      } else {
        this.emitStatus("idle");
      }
      this.cleanup();
    };
  }

  /** End the call (hang up). */
  async stopListening(): Promise<void> {
    this.cleanup();
    this.emitStatus("idle");
  }

  /** Tear down the call and drop all callbacks (used by `cleanupVoice`). */
  async disconnect(): Promise<void> {
    this.cleanup();
    this.emitStatus("disconnected");
    this.resultCallbacks = [];
    this.errorCallbacks = [];
    this.statusCallbacks = [];
    this.transcriptCallbacks = [];
    this.metricsCallbacks = [];
  }

  /**
   * Stop the spoken reply without ending the call. In a speech-to-speech
   * session this also asks the server to cancel the response; audio is dropped
   * until its `audio_clear` acknowledgement arrives.
   */
  stopPlayback(): void {
    this.clearLocalPlayback();
    const ws = this.ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
      if (this.speechToSpeech) {
        this.cancelledUntil = Date.now() + CANCEL_ACK_TIMEOUT_MS;
        ws.send('{"type":"cancel"}');
      }
      this.emitStatus("listening");
    }
  }

  // --- Barge-in surface (constants for the continuous hot-mic model) --------

  /** A continuous call is a permanent barge-in session. */
  getInterruptionMode(): "none" | "cancel" | "barge-in" {
    return "barge-in";
  }

  /** True while the call (hot mic) is live. */
  isBargeInActive(): boolean {
    return this.callLive;
  }

  /** "Hang up" the always-on mic. */
  onLevel(callback: (level: number) => void): void {
    this.levelCallbacks.push(callback);
  }

  async deactivateBargeIn(): Promise<void> {
    this.cleanup();
    this.emitStatus("idle");
  }

  // --- Capture ---------------------------------------------------------------

  private startCapture(context: AudioContext, stream: MediaStream, generation: number): void {
    const source = context.createMediaStreamSource(stream);
    this.sourceNode = source;
    const processor = context.createScriptProcessor(CAPTURE_BUFFER_SIZE, 1, 1);
    this.processor = processor;

    processor.onaudioprocess = (e) => {
      if (generation !== this.callGeneration) return;
      // No socket yet (adopting a prewarm) or still handshaking: buffer.
      const ws = this.ws;
      const open = ws?.readyState === WebSocket.OPEN;
      if (ws && !open && ws.readyState !== WebSocket.CONNECTING) return;
      const input = e.inputBuffer.getChannelData(0);
      const pcm16 = new Int16Array(input.length);
      let sumSquares = 0;
      for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        sumSquares += s * s;
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      if (ws && open) {
        this.flushPreOpenAudio(ws);
        ws.send(pcm16.buffer);
      } else {
        this.preOpenAudio.push(pcm16.buffer);
        this.preOpenBytes += pcm16.byteLength;
        while (this.preOpenBytes > PRE_OPEN_AUDIO_MAX_BYTES) {
          this.preOpenBytes -= this.preOpenAudio.shift()!.byteLength;
        }
      }
      // Amplitude comes free from the buffer we already walked: no analyser
      // node, no second capture. RMS is scaled because speech rarely exceeds
      // ~0.3 RMS, so raw values would sit near the bottom of the 0..1 range.
      if (this.levelCallbacks.length > 0) {
        const rms = Math.sqrt(sumSquares / input.length);
        const level = Math.max(0, Math.min(1, rms * LEVEL_RMS_SCALE));
        for (const cb of this.levelCallbacks) cb(level);
      }
    };

    source.connect(processor);
    // The processor must be connected to the graph to run; it writes no output,
    // so the destination receives silence (no mic echo).
    processor.connect(context.destination);
  }

  private flushPreOpenAudio(ws: WebSocket): void {
    for (const frame of this.preOpenAudio) ws.send(frame);
    this.preOpenAudio = [];
    this.preOpenBytes = 0;
  }

  // --- Downstream ------------------------------------------------------------

  private handleMessage(event: MessageEvent, generation: number): void {
    if (generation !== this.callGeneration) return;

    if (event.data instanceof ArrayBuffer) {
      this.handleAudioFrame(event.data, generation);
      return;
    }

    let msg: any;
    try {
      msg = JSON.parse(event.data as string);
    } catch {
      return; // non-JSON, non-binary frame: ignore
    }

    switch (msg.type) {
      case "session_config":
        // The follow-up session_config carries only interruptionMode: keep the mode.
        if (msg.speechMode) {
          this.speechToSpeech = msg.speechMode === "speech_to_speech";
          this.playback?.setContinuousMode?.(this.speechToSpeech);
          this.clientDelegation =
            this.speechToSpeech && msg.clientDelegation === true && !!this.bridge;
        }
        if (msg.followUpFrames === true) this.followUpFrames = true;
        // Only a server that announces contextFrames accepts `context`.
        if (msg.contextFrames === true && !this.contextSent) {
          this.contextSent = true;
          this.pendingContext = this.buildContextText();
        }
        break;

      case "transcript_update": {
        const role = msg.role === "assistant" ? "assistant" : "user";
        // A reply the client cancelled keeps streaming until the server clears it.
        if (!msg.turnId || (role === "assistant" && this.isCancelling())) break;
        const turnId = String(msg.turnId);
        if (role === "user") {
          // Release on a final user transcript, not a partial: a mid-utterance
          // context append makes the voice model answer early (or not delegate).
          if (msg.final === true) this.flushCallContext(generation);
          this.foldReadback = false;
        } else {
          // Read-back of a delegated result: core rotates the assistant id at
          // completion, so it is the first new id after it. The chat renders it.
          if (this.foldReadback && !this.assistantTurns.has(turnId)) {
            this.foldedTurns.add(turnId);
            this.foldReadback = false;
          }
          this.assistantTurns.add(turnId);
          if (this.foldedTurns.has(turnId)) break;
        }
        this.emitTranscript(role, msg.text ?? "", msg.final === true, {
          turnId,
          ...(typeof msg.startMs === "number" && { startMs: msg.startMs }),
          ...(typeof msg.endMs === "number" && { endMs: msg.endMs }),
          // The chat pipeline owns the conversation: speech is only captioned.
          ...(this.clientDelegation && { caption: true }),
        });
        break;
      }

      case "delegation_requested":
        this.flushCallContext(generation);
        if (this.clientDelegation) {
          this.runDelegation(
            String(msg.turnId),
            String(msg.userText ?? ""),
            typeof msg.userTurnId === "string" ? msg.userTurnId : undefined,
            Array.isArray(msg.userTurnIds)
              ? msg.userTurnIds.filter((id: unknown): id is string => typeof id === "string")
              : undefined,
            generation,
          );
        }
        break;

      case "delegation_started":
      case "delegation_completed":
        if (
          msg.type === "delegation_completed" &&
          msg.speak !== false &&
          this.answered.has(String(msg.turnId))
        ) {
          this.foldReadback = true;
        }
        this.delegating = msg.type === "delegation_started";
        if (!this.isSpeaking && !this.isCancelling()) {
          this.emitStatus(this.delegating ? "processing" : "listening");
        }
        break;

      case "audio_clear":
        // Barge-in (or our own cancel acknowledged): stop playback now.
        this.clearLocalPlayback();
        this.cancelledUntil = 0;
        this.emitStatus("listening");
        break;

      case "transcript_interim":
        this.emitStatus("listening");
        this.emitTranscript("user", msg.text ?? "", false);
        break;

      case "transcript_final": {
        const role = msg.role === "assistant" ? "assistant" : "user";
        // user final → agent is now thinking; assistant final → reply incoming.
        this.emitStatus(role === "user" ? "processing" : "speaking");
        this.emitTranscript(role, msg.text ?? "", true);
        break;
      }

      case "audio_end":
        if (this.playback) {
          this.playback.markStreamEnd();
        } else {
          this.isSpeaking = false;
          this.emitStatus("listening");
        }
        break;

      case "metrics":
        this.emitMetrics({
          llmMs: msg.llm_ms,
          ttsMs: msg.tts_ms,
          firstAudioMs: msg.first_audio_ms,
          totalMs: msg.total_ms,
        });
        break;

      case "error":
        this.emitError(new Error(msg.error || "Voice error"));
        this.emitStatus("error");
        break;
    }
  }

  /** Send the call-start `context` frame (history + host context), if any. */
  /**
   * The call-start `context` text. History is read now, before any of this
   * call's voice bubbles exist, so it never includes the utterance in progress.
   */
  private async buildContextText(): Promise<string> {
    const history = this.bridge?.getHistory() ?? [];
    let extra = "";
    try {
      const source = this.config?.callContext;
      extra = String((typeof source === "function" ? await source() : source) ?? "");
    } catch {
      // A failing host callback only loses its own part of the context.
    }
    return buildCallContext(history, extra);
  }

  /** Send the held call-start context, once: at the first final user transcript or delegation. */
  private flushCallContext(generation: number): void {
    const pending = this.pendingContext;
    if (!pending) return;
    this.pendingContext = null;
    let dropped = false;
    const done = pending.then((text) => {
      const ws = this.ws;
      if (dropped || !text || generation !== this.callGeneration || ws?.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: "context", text }));
    });
    this.contextSend = { done, drop: () => (dropped = true) };
  }

  /** Let a released context go out first; a hung host callback is dropped. */
  private async awaitContextSend(): Promise<void> {
    const send = this.contextSend;
    if (!send) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = await Promise.race([
      send.done.then(() => false),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(true), CONTEXT_BEFORE_RESULT_TIMEOUT_MS);
      }),
    ]);
    clearTimeout(timer);
    if (timedOut) send.drop();
  }

  /** Run a delegated turn through the session bridge (one at a time) and answer it. */
  private runDelegation(
    turnId: string,
    userText: string,
    userTurnId: string | undefined,
    userTurnIds: string[] | undefined,
    generation: number,
  ): void {
    const bridge = this.bridge!;
    this.delegations = this.delegations.then(async () => {
      if (generation !== this.callGeneration) return;
      const result: VoiceDelegationResult = await bridge
        .runDelegatedTurn({
          turnId,
          userText,
          ...(userTurnId && { userTurnId }),
          ...(userTurnIds?.length && { userTurnIds }),
        })
        .catch(() => ({ ok: false, text: "" }));
      await this.awaitContextSend();
      const ws = this.ws;
      if (generation !== this.callGeneration || ws?.readyState !== WebSocket.OPEN) return;
      if (result.ok) this.answered.add(turnId);
      ws.send(JSON.stringify({ type: "delegation_result", turnId, text: result.text, ok: result.ok }));
      // Parked on an approval: read the outcome back once the visitor decides.
      if (!result.followUp || !this.followUpFrames) return;
      void result.followUp((this.followUps ??= new AbortController()).signal).then((text) => {
        const live = this.ws;
        if (!text || generation !== this.callGeneration || live?.readyState !== WebSocket.OPEN) return;
        live.send(JSON.stringify({ type: "delegation_followup", turnId, text }));
      });
    });
  }

  private handleAudioFrame(buf: ArrayBuffer, generation: number): void {
    if (generation !== this.callGeneration) return;
    if (!this.playback) return;
    if (this.isCancelling()) return;
    const pcm = stripWavHeader(buf);
    if (pcm.length === 0) return;
    if (!this.isSpeaking) {
      this.isSpeaking = true;
      this.emitStatus("speaking");
    }
    this.armPlaybackFinished();
    this.playback.enqueue(pcm);
    if (this.speechToSpeech) this.scheduleContinuousDrain(pcm.length);
  }

  private isCancelling(): boolean {
    return Date.now() < this.cancelledUntil;
  }

  /** Register the (one-shot) engine drain callback if none is pending. */
  private armPlaybackFinished(): void {
    if (this.finishedArmed || !this.playback) return;
    this.finishedArmed = true;
    const generation = this.callGeneration;
    this.playback.onFinished(() => {
      if (generation !== this.callGeneration) return;
      this.finishedArmed = false;
      this.handlePlaybackDrained();
    });
  }

  /**
   * Speech-to-speech replies never get an end-of-stream, so estimate when the
   * queued audio finishes from its duration and release "speaking" then. The
   * engine is never marked ended, so the next reply's audio plays through the
   * same stream untouched and an underrun is never mistaken for a reply end.
   */
  private scheduleContinuousDrain(byteLength: number): void {
    const now = Date.now();
    // PCM16 @ 24 kHz: 48 bytes per millisecond.
    this.playbackEndsAt = Math.max(now, this.playbackEndsAt) + byteLength / 48;
    clearTimeout(this.drainTimer);
    this.drainTimer = setTimeout(
      () => this.handlePlaybackDrained(),
      this.playbackEndsAt - now + CONTINUOUS_DRAIN_GRACE_MS,
    );
  }

  private handlePlaybackDrained(): void {
    this.isSpeaking = false;
    this.playbackEndsAt = 0;
    // Reply drained: the call stays open, so return to listening (or to
    // processing while an agent delegation is still running).
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.emitStatus(this.delegating ? "processing" : "listening");
    }
  }

  /** Drop queued audio locally and reset the speaking/drain bookkeeping. */
  private clearLocalPlayback(): void {
    this.playback?.flush();
    // flush() discards registered callbacks: re-arm for the next reply.
    this.finishedArmed = false;
    this.armPlaybackFinished();
    this.isSpeaking = false;
    this.playbackEndsAt = 0;
    clearTimeout(this.drainTimer);
  }

  // --- Teardown --------------------------------------------------------------

  private cleanup(): void {
    // Invalidate any in-flight async continuation / late frames first.
    this.callGeneration += 1;
    this.callLive = false;
    this.isSpeaking = false;
    this.releaseAttached();
    this.speechToSpeech = false;
    this.delegating = false;
    this.clientDelegation = false;
    this.followUpFrames = false;
    this.followUps?.abort();
    this.followUps = null;
    this.contextSent = false;
    this.pendingContext = null;
    this.contextSend = null;
    this.delegations = Promise.resolve();
    this.answered.clear();
    this.foldReadback = false;
    this.assistantTurns.clear();
    this.foldedTurns.clear();
    this.finishedArmed = false;
    this.cancelledUntil = 0;
    this.playbackEndsAt = 0;
    clearTimeout(this.drainTimer);
    this.preOpenAudio = [];
    this.preOpenBytes = 0;

    if (this.processor) {
      this.processor.onaudioprocess = null;
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    if (this.captureContext) {
      this.captureContext.close().catch(() => {});
      this.captureContext = null;
    }
    if (this.playback) {
      void this.playback.destroy();
      this.playback = null;
    }
    if (this.ws) {
      this.intentionalClose = true;
      try {
        this.ws.close(1000, "client ended call");
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }

  // --- Callback registration + emit -----------------------------------------

  onResult(callback: (result: VoiceResult) => void): void {
    this.resultCallbacks.push(callback);
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallbacks.push(callback);
  }

  onStatusChange(callback: (status: VoiceStatus) => void): void {
    this.statusCallbacks.push(callback);
  }

  onTranscript(callback: TranscriptCallback): void {
    this.transcriptCallbacks.push(callback);
  }

  onMetrics(callback: (metrics: VoiceMetrics) => void): void {
    this.metricsCallbacks.push(callback);
  }

  private emitStatus(status: VoiceStatus): void {
    this.statusCallbacks.forEach((cb) => cb(status));
  }

  private emitError(error: Error): void {
    this.errorCallbacks.forEach((cb) => cb(error));
  }

  private emitTranscript(
    role: "user" | "assistant",
    text: string,
    isFinal: boolean,
    metadata?: VoiceTranscriptMetadata,
  ): void {
    this.transcriptCallbacks.forEach((cb) => cb(role, text, isFinal, metadata));
  }

  private emitMetrics(metrics: VoiceMetrics): void {
    this.metricsCallbacks.forEach((cb) => cb(metrics));
  }
}
