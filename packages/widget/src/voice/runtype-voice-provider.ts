// Runtype Voice Provider
// WebSocket implementation for Runtype's voice service

import type {
  VoiceProvider,
  VoiceResult,
  VoiceStatus,
  VoiceConfig,
} from "../types";
import { AudioPlaybackManager } from "./audio-playback-manager";
import { VoiceActivityDetector } from "./voice-activity-detector";

export class RuntypeVoiceProvider implements VoiceProvider {
  type: "runtype" = "runtype";
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private w: any = typeof window !== "undefined" ? window : undefined;
  private mediaRecorder: MediaRecorder | null = null;
  private resultCallbacks: ((result: VoiceResult) => void)[] = [];
  private errorCallbacks: ((error: Error) => void)[] = [];
  private statusCallbacks: ((status: VoiceStatus) => void)[] = [];
  private processingStartCallbacks: (() => void)[] = [];
  private audioChunks: Blob[] = [];
  private isProcessing = false;
  private isSpeaking = false;

  // Voice activity detection (silence auto-stop + barge-in speech detection)
  private vad = new VoiceActivityDetector();
  private mediaStream: MediaStream | null = null;

  // Cancellation / interruption support
  private currentAudio: HTMLAudioElement | null = null;
  private currentAudioUrl: string | null = null;
  private currentRequestId: string | null = null;
  private interruptionMode: "none" | "cancel" | "barge-in" = "none";

  // Streaming audio playback (PCM chunks)
  private playbackManager: AudioPlaybackManager | null = null;

  constructor(private config: VoiceConfig["runtype"]) {}

  /** Returns the current interruption mode received from the server */
  getInterruptionMode(): "none" | "cancel" | "barge-in" {
    return this.interruptionMode;
  }

  /** Returns true if the barge-in mic stream is alive (hot mic between turns) */
  isBargeInActive(): boolean {
    return this.interruptionMode === "barge-in" && this.mediaStream !== null;
  }

  /** Tear down the barge-in mic pipeline — "hang up" the always-on mic */
  async deactivateBargeIn(): Promise<void> {
    this.vad.stop();
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }
  }

  async connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return; // Already connected
    }
    try {
      // Ensure we're running in a browser environment
      if (!this.w) {
        throw new Error("Window object not available");
      }

      // Temporary workaround for TypeScript issues
      const w: any = this.w;
      if (!w || !w.location) {
        throw new Error("Window object or location not available");
      }
      const protocol = w.location.protocol === "https:" ? "wss:" : "ws:";
      const host = this.config?.host;
      const agentId = this.config?.agentId;
      const clientToken = this.config?.clientToken;
      if (!agentId || !clientToken) {
        throw new Error("agentId and clientToken are required");
      }
      if (!host) {
        throw new Error(
          "host must be provided in Runtype voice provider configuration",
        );
      }
      const wsUrl = `${protocol}//${host}/ws/agents/${agentId}/voice?token=${clientToken}`;

      this.ws = new WebSocket(wsUrl);
      this.setupWebSocketHandlers();

      // Wait for WebSocket to actually open before resolving
      const safeUrl = `${protocol}//${host}/ws/agents/${agentId}/voice?token=...`;
      const hint =
        " Check: API running on port 8787? Valid client token? Agent voice enabled? Token allowedOrigins includes this page?";

      await new Promise<void>((resolve, reject) => {
        if (!this.ws) return reject(new Error("WebSocket not created"));
        let rejected = false;
        const doReject = (msg: string) => {
          if (rejected) return;
          rejected = true;
          clearTimeout(timeout);
          reject(new Error(msg));
        };
        const timeout = setTimeout(
          () => doReject("WebSocket connection timed out." + hint),
          10000
        );
        this.ws!.addEventListener(
          "open",
          () => {
            if (!rejected) {
              rejected = true;
              clearTimeout(timeout);
              resolve();
            }
          },
          { once: true }
        );
        this.ws!.addEventListener(
          "error",
          () => {
            doReject(
              "WebSocket connection failed to " + safeUrl + "." + hint
            );
          },
          { once: true }
        );
        this.ws!.addEventListener(
          "close",
          (evt) => {
            if (!evt.wasClean && !rejected) {
              const codeMsg =
                evt.code !== 1006 ? ` (code ${evt.code})` : "";
              doReject(
                "WebSocket connection failed" + codeMsg + "." + hint
              );
            }
          },
          { once: true }
        );
      });

      // Send a ping immediately so the server replies with session_config
      // (which includes interruptionMode). This ensures the client knows
      // about barge-in mode before the first recording starts.
      this.sendHeartbeat();
    } catch (error) {
      this.ws = null;
      this.errorCallbacks.forEach((cb) => cb(error as Error));
      this.statusCallbacks.forEach((cb) => cb("error"));
      throw error;
    }
  }

  private setupWebSocketHandlers() {
    if (!this.ws) return;

    this.ws.onopen = () => {
      this.statusCallbacks.forEach((cb) => cb("connected"));
    };

    this.ws.onclose = () => {
      this.statusCallbacks.forEach((cb) => cb("disconnected"));
    };

    this.ws.onerror = (_error) => {
      this.errorCallbacks.forEach((cb) => cb(new Error("WebSocket error")));
      this.statusCallbacks.forEach((cb) => cb("error"));
    };

    // Receive binary frames for streaming audio (set binaryType to arraybuffer)
    this.ws.binaryType = "arraybuffer";

    this.ws.onmessage = (event) => {
      // Binary frame = raw PCM audio chunk for streaming playback
      if (event.data instanceof ArrayBuffer) {
        this.handleAudioChunk(new Uint8Array(event.data));
        return;
      }

      // Text frame = JSON control message
      try {
        const message = JSON.parse(event.data);
        this.handleWebSocketMessage(message);
      } catch (error) {
        this.errorCallbacks.forEach((cb) =>
          cb(new Error("Message parsing failed")),
        );
      }
    };
  }

  private handleWebSocketMessage(message: any) {
    switch (message.type) {
      case "session_config":
        // Server sends voice settings on session init
        if (message.interruptionMode) {
          this.interruptionMode = message.interruptionMode;
        }
        break;

      case "voice_response":
        // Deliver text result immediately
        this.isProcessing = false;
        this.resultCallbacks.forEach((cb) =>
          cb({
            text: message.response.agentResponseText || message.response.transcript,
            transcript: message.response.transcript,
            audio: message.response.audio,
            confidence: 0.95,
            provider: "runtype",
          }),
        );

        // Batch path: play TTS audio if present in the response (backward compat)
        if (message.response.audio?.base64) {
          this.isSpeaking = true;
          this.statusCallbacks.forEach((cb) => cb("speaking"));
          this.playAudio(message.response.audio).catch((err) =>
            this.errorCallbacks.forEach((cb) => cb(err instanceof Error ? err : new Error(String(err)))),
          );
        } else if (!message.response.audio?.base64) {
          // Streaming path: text-only voice_response — audio will arrive as
          // binary chunks followed by audio_end. Transition to speaking state
          // once the first audio chunk arrives (see handleAudioChunk).
          // Stay in processing state until then.
        }
        break;

      case "audio_end":
        // Guard: discard late audio_end from a cancelled request
        if (message.requestId && message.requestId !== this.currentRequestId) break;
        // All PCM chunks have been sent — signal the playback manager
        if (this.playbackManager) {
          this.playbackManager.markStreamEnd();
        } else {
          // No audio chunks arrived — go idle
          this.isSpeaking = false;
          this.isProcessing = false;
          this.statusCallbacks.forEach((cb) => cb("idle"));
        }
        break;

      case "cancelled":
        // Server acknowledged cancellation — discard any late-arriving responses
        this.isProcessing = false;
        break;

      case "error":
        this.errorCallbacks.forEach((cb) => cb(new Error(message.error)));
        this.statusCallbacks.forEach((cb) => cb("error"));
        this.isProcessing = false;
        break;

      case "pong":
        // Heartbeat response
        break;
    }
  }

  /**
   * Handle a binary audio chunk (raw PCM 24kHz 16-bit LE) for streaming playback.
   */
  private handleAudioChunk(pcmData: Uint8Array): void {
    if (pcmData.length === 0) return;
    if (!this.currentRequestId) return; // discard late chunks after cancel

    // Lazily create playback manager on first chunk
    if (!this.playbackManager) {
      this.playbackManager = new AudioPlaybackManager(24000);
      this.playbackManager.onFinished(() => {
        this.isSpeaking = false;
        this.playbackManager = null;
        this.vad.stop(); // stop speech monitoring — audio ended naturally
        this.statusCallbacks.forEach((cb) => cb("idle"));
      });
    }

    // Transition to speaking on first chunk
    if (!this.isSpeaking) {
      this.isSpeaking = true;
      this.statusCallbacks.forEach((cb) => cb("speaking"));
      this.startBargeInMonitoring().catch(() => {}); // no-op if not barge-in mode
    }

    this.playbackManager.enqueue(pcmData);
  }

  /**
   * Stop playback / cancel in-flight request and return to idle.
   * This is the public "stop only" action — does NOT start recording.
   */
  stopPlayback(): void {
    if (!this.isProcessing && !this.isSpeaking) return;
    this.cancelCurrentPlayback();
    this.statusCallbacks.forEach((cb) => cb("idle"));
  }

  /**
   * Cancel the current playback and in-flight server request.
   * Internal helper — does NOT fire status callbacks (caller decides next state).
   */
  private cancelCurrentPlayback(): void {
    // Stop batch playback (Audio element)
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.src = "";
      this.currentAudio = null;
    }
    if (this.currentAudioUrl) {
      URL.revokeObjectURL(this.currentAudioUrl);
      this.currentAudioUrl = null;
    }

    // Stop streaming playback (AudioPlaybackManager)
    if (this.playbackManager) {
      this.playbackManager.flush();
      this.playbackManager = null;
    }

    // Tell server to abort the in-flight request
    if (this.currentRequestId && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "cancel",
          requestId: this.currentRequestId,
        }),
      );
    }

    this.currentRequestId = null;
    this.isProcessing = false;
    this.isSpeaking = false;
  }

  async startListening() {
    try {
      if (this.isProcessing || this.isSpeaking) {
        // If interruption is enabled, cancel current playback and proceed
        if (this.interruptionMode !== "none") {
          this.cancelCurrentPlayback();
        } else {
          // Mode is "none" — block mic while processing or speaking
          return;
        }
      }

      // Reuse existing mic stream in barge-in mode (mic stays hot)
      if (!this.mediaStream) {
        const constraints =
          this.interruptionMode === "barge-in"
            ? { audio: { echoCancellation: true, noiseSuppression: true } }
            : { audio: true };
        this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      }
      const w = this.w!;
      if (!this.audioContext) {
        this.audioContext = new (w.AudioContext || w.webkitAudioContext)();
      }

      // VAD-based silence detection — fires once when user stops talking
      const pauseDuration = this.config?.pauseDuration ?? 2000;
      const silenceThreshold = this.config?.silenceThreshold ?? 0.01;
      this.vad.start(
        this.audioContext,
        this.mediaStream,
        "silence",
        { threshold: silenceThreshold, duration: pauseDuration },
        () => this.stopListening(),
      );

      this.mediaRecorder = new MediaRecorder(this.mediaStream);
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        if (this.audioChunks.length > 0) {
          this.isProcessing = true;
          this.statusCallbacks.forEach((cb) => cb("processing"));
          this.processingStartCallbacks.forEach((cb) => cb());

          const mimeType =
            this.mediaRecorder?.mimeType || "audio/webm";
          const audioBlob = new Blob(this.audioChunks, { type: mimeType });
          await this.sendAudio(audioBlob);
          this.audioChunks = [];
        }
      };

      this.mediaRecorder.start(1000);
      this.statusCallbacks.forEach((cb) => cb("listening"));
    } catch (error) {
      this.errorCallbacks.forEach((cb) => cb(error as Error));
      this.statusCallbacks.forEach((cb) => cb("error"));
      throw error;
    }
  }

  async stopListening() {
    this.vad.stop();

    if (this.mediaRecorder) {
      if (this.interruptionMode !== "barge-in") {
        this.mediaRecorder.stream.getTracks().forEach((track) => track.stop());
      }
      this.mediaRecorder.stop();
      this.mediaRecorder = null;
    }

    // Only tear down mic pipeline in non-barge-in modes
    if (this.interruptionMode !== "barge-in") {
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach((track) => track.stop());
        this.mediaStream = null;
      }
      if (this.audioContext) {
        await this.audioContext.close();
        this.audioContext = null;
      }
    }

    this.statusCallbacks.forEach((cb) => cb("idle"));
  }

  /**
   * Start VAD in speech mode during agent playback — detects when the user
   * starts talking so we can interrupt (barge-in). No-op in other modes.
   * Acquires mic if needed (e.g., first response where stopListening tore it down).
   */
  private async startBargeInMonitoring(): Promise<void> {
    if (this.interruptionMode !== "barge-in") return;

    // Acquire mic pipeline if not already available (first response scenario)
    const w = this.w;
    if (!this.mediaStream && w) {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    }
    if (!this.audioContext && w) {
      this.audioContext = new (w.AudioContext || w.webkitAudioContext)();
    }
    if (!this.audioContext || !this.mediaStream) return;

    const speechThreshold = this.config?.silenceThreshold ?? 0.01;
    const speechDebounce = 200; // 200ms sustained sound = real speech, not echo blip

    this.vad.start(
      this.audioContext,
      this.mediaStream,
      "speech",
      { threshold: speechThreshold, duration: speechDebounce },
      () => this.handleBargeIn(),
    );
  }

  /**
   * Handle a barge-in event: cancel playback and immediately start recording.
   */
  private handleBargeIn(): void {
    this.cancelCurrentPlayback();
    this.startListening().catch((err) => {
      this.errorCallbacks.forEach((cb) =>
        cb(err instanceof Error ? err : new Error(String(err))),
      );
    });
  }

  private generateRequestId(): string {
    return "vreq_" + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
  }

  private async sendAudio(audioBlob: Blob) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.errorCallbacks.forEach((cb) =>
        cb(new Error("WebSocket not connected")),
      );
      this.statusCallbacks.forEach((cb) => cb("error"));
      return;
    }

    try {
      const base64Audio = await this.blobToBase64(audioBlob);
      const format = this.getFormatFromMimeType(audioBlob.type);
      const requestId = this.generateRequestId();
      this.currentRequestId = requestId;

      this.ws.send(
        JSON.stringify({
          type: "audio_input",
          audio: base64Audio,
          format,
          sampleRate: 16000,
          voiceId: this.config?.voiceId,
          requestId,
        }),
      );
    } catch (error) {
      this.errorCallbacks.forEach((cb) => cb(error as Error));
      this.statusCallbacks.forEach((cb) => cb("error"));
    }
  }

  private getFormatFromMimeType(mimeType: string): string {
    if (mimeType.includes("wav")) return "wav";
    if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
    return "webm";
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Decode base64 audio and play it through the browser.
   */
  private async playAudio(audio: { base64: string; format?: string }): Promise<void> {
    if (!audio.base64) return;
    const byteString = atob(audio.base64);
    const bytes = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      bytes[i] = byteString.charCodeAt(i);
    }
    const format = audio.format || "mp3";
    const mimeType =
      format === "mp3" ? "audio/mpeg" : `audio/${format}`;
    const blob = new Blob([bytes], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const audioEl = new Audio(url);

    // Store references so playback can be cancelled
    this.currentAudio = audioEl;
    this.currentAudioUrl = url;

    audioEl.onended = () => {
      URL.revokeObjectURL(url);
      if (this.currentAudio === audioEl) {
        this.currentAudio = null;
        this.currentAudioUrl = null;
        this.isSpeaking = false;
        this.statusCallbacks.forEach((cb) => cb("idle"));
      }
    };
    await audioEl.play();
  }

  onResult(callback: (result: VoiceResult) => void): void {
    this.resultCallbacks.push(callback);
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallbacks.push(callback);
  }

  onStatusChange(callback: (status: VoiceStatus) => void): void {
    this.statusCallbacks.push(callback);
  }

  onProcessingStart(callback: () => void): void {
    this.processingStartCallbacks.push(callback);
  }

  async disconnect(): Promise<void> {
    // Stop any playing audio (batch)
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.src = "";
      this.currentAudio = null;
    }
    if (this.currentAudioUrl) {
      URL.revokeObjectURL(this.currentAudioUrl);
      this.currentAudioUrl = null;
    }
    // Stop streaming playback
    if (this.playbackManager) {
      await this.playbackManager.destroy();
      this.playbackManager = null;
    }
    this.currentRequestId = null;
    this.isSpeaking = false;

    this.vad.stop();
    await this.stopListening();

    // Force mic teardown (barge-in mode skips this in stopListening)
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }

    if (this.ws) {
      try {
        this.ws.close();
      } catch (error) {
        // Ignore errors during disconnect
      }
      this.ws = null;
    }

    this.statusCallbacks.forEach((cb) => cb("disconnected"));
  }

  // Heartbeat functionality
  sendHeartbeat() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "ping" }));
    }
  }
}
