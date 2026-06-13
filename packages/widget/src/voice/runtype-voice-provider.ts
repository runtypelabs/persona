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
// The server's STT owns turn-taking, so the client streams continuously and
// has no client-side VAD, barge-in monitoring, or batch upload. Auth rides the
// `Sec-WebSocket-Protocol` subprotocol (`['runtype.bearer', clientToken]`),
// never the query string — the token is never placed in a URL or logged.
//
// A continuous always-hot mic is, in UX terms, a permanent barge-in session, so
// `getInterruptionMode()` reports the constant `'barge-in'` and the existing
// mic-button wiring (ui.ts) treats a click as "hang up at any state" unchanged.

import type {
  VoiceProvider,
  VoiceResult,
  VoiceStatus,
  VoiceConfig,
  VoiceMetrics,
  VoicePlaybackEngine,
} from "../types";
import { AudioPlaybackManager } from "./audio-playback-manager";

const CAPTURE_SAMPLE_RATE = 16000;
const PLAYBACK_SAMPLE_RATE = 24000;
const CAPTURE_BUFFER_SIZE = 4096;
const RIFF_MAGIC = 0x52494646; // "RIFF"

/**
 * Strip the canonical 44-byte WAV header (if present) and return the raw PCM16
 * payload. The ElevenLabs realtime path WAV-wraps each frame; the Cloudflare DO
 * path may send raw PCM — detect the RIFF magic and handle both.
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

export class RuntypeVoiceProvider implements VoiceProvider {
  type: "runtype" = "runtype";

  private ws: WebSocket | null = null;
  private captureContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private playback: VoicePlaybackEngine | null = null;

  // True while a call (WS session) is live — drives the idempotent start guard
  // and `isBargeInActive()`.
  private callLive = false;
  private isSpeaking = false;

  // Invalidates in-flight async work (playback-engine creation, late frames,
  // status transitions) after a teardown/restart so a stale callback can't act
  // on a newer call's resources. Bumped on every start and every cleanup.
  private callGeneration = 0;

  // Distinguishes a user-initiated close (code 1000) from a dropped connection.
  private intentionalClose = false;

  private resultCallbacks: ((result: VoiceResult) => void)[] = [];
  private errorCallbacks: ((error: Error) => void)[] = [];
  private statusCallbacks: ((status: VoiceStatus) => void)[] = [];
  private transcriptCallbacks: ((
    role: "user" | "assistant",
    text: string,
    isFinal: boolean,
  ) => void)[] = [];
  private metricsCallbacks: ((metrics: VoiceMetrics) => void)[] = [];

  constructor(private config: VoiceConfig["runtype"]) {}

  // --- VoiceProvider lifecycle ----------------------------------------------

  /** No-op: the WS session opens lazily in `startListening` (the "call"). */
  async connect(): Promise<void> {}

  /** Start the call: acquire mic, open the WS, stream PCM until hang-up. */
  async startListening(): Promise<void> {
    if (this.callLive) return; // idempotent — a call is already live

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
        // Torn down while async work was in flight — free what we acquired.
        void engine.destroy();
        stream.getTracks().forEach((t) => t.stop());
        captureContext.close().catch(() => {});
        return;
      }
      this.playback = engine;
      engine.onFinished(() => {
        if (generation !== this.callGeneration) return;
        this.isSpeaking = false;
        // Reply drained — the call stays open, so return to listening.
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.emitStatus("listening");
        }
      });

      const wsUrl = `${toWsBase(host)}/ws/agents/${encodeURIComponent(agentId)}/voice`;
      // Token rides the subprotocol; `runtype.bearer` is the marker the server
      // echoes as the negotiated subprotocol (browsers fail the handshake if an
      // offered subprotocol goes unanswered).
      const ws = new WebSocket(wsUrl, ["runtype.bearer", token]);
      ws.binaryType = "arraybuffer";
      this.ws = ws;

      ws.onopen = () => {
        if (generation !== this.callGeneration) return;
        this.emitStatus("listening");
        this.startCapture(captureContext, stream, ws, generation);
      };

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
    } catch (error) {
      this.cleanup();
      this.emitError(error as Error);
      this.emitStatus("error");
      throw error;
    }
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

  /** Stop the spoken reply without ending the call. */
  stopPlayback(): void {
    if (this.playback) this.playback.flush();
    this.isSpeaking = false;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
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
  async deactivateBargeIn(): Promise<void> {
    this.cleanup();
    this.emitStatus("idle");
  }

  // --- Capture ---------------------------------------------------------------

  private startCapture(
    context: AudioContext,
    stream: MediaStream,
    ws: WebSocket,
    generation: number,
  ): void {
    const source = context.createMediaStreamSource(stream);
    this.sourceNode = source;
    const processor = context.createScriptProcessor(CAPTURE_BUFFER_SIZE, 1, 1);
    this.processor = processor;

    processor.onaudioprocess = (e) => {
      if (generation !== this.callGeneration) return;
      if (ws.readyState !== WebSocket.OPEN) return;
      const input = e.inputBuffer.getChannelData(0);
      const pcm16 = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      ws.send(pcm16.buffer);
    };

    source.connect(processor);
    // The processor must be connected to the graph to run; it writes no output,
    // so the destination receives silence (no mic echo).
    processor.connect(context.destination);
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
      return; // non-JSON, non-binary frame — ignore
    }

    switch (msg.type) {
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

  private handleAudioFrame(buf: ArrayBuffer, generation: number): void {
    if (generation !== this.callGeneration) return;
    if (!this.playback) return;
    const pcm = stripWavHeader(buf);
    if (pcm.length === 0) return;
    if (!this.isSpeaking) {
      this.isSpeaking = true;
      this.emitStatus("speaking");
    }
    this.playback.enqueue(pcm);
  }

  // --- Teardown --------------------------------------------------------------

  private cleanup(): void {
    // Invalidate any in-flight async continuation / late frames first.
    this.callGeneration += 1;
    this.callLive = false;
    this.isSpeaking = false;

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

  onTranscript(
    callback: (role: "user" | "assistant", text: string, isFinal: boolean) => void,
  ): void {
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
  ): void {
    this.transcriptCallbacks.forEach((cb) => cb(role, text, isFinal));
  }

  private emitMetrics(metrics: VoiceMetrics): void {
    this.metricsCallbacks.forEach((cb) => cb(metrics));
  }
}
