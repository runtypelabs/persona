// Runtype Voice Provider
// WebSocket implementation for Runtype's voice service

import type {
  VoiceProvider,
  VoiceResult,
  VoiceStatus,
  VoiceConfig,
} from "../types";

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

  // Silence detection
  private analyserNode: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private silenceCheckInterval: ReturnType<typeof setInterval> | null = null;
  private silenceStart: number | null = null;

  constructor(private config: VoiceConfig["runtype"]) {}

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

    this.ws.onmessage = (event) => {
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
      case "voice_response":
        // Play TTS audio if present
        if (message.response.audio?.base64) {
          this.playAudio(message.response.audio).catch((err) =>
            this.errorCallbacks.forEach((cb) => cb(err instanceof Error ? err : new Error(String(err)))),
          );
        }
        // Use agentResponseText (the agent's reply) as the text result,
        // falling back to transcript (user's STT input) for backwards compat
        this.resultCallbacks.forEach((cb) =>
          cb({
            text: message.response.agentResponseText || message.response.transcript,
            transcript: message.response.transcript,
            audio: message.response.audio,
            confidence: 0.95,
            provider: "runtype",
          }),
        );
        this.isProcessing = false;
        this.statusCallbacks.forEach((cb) => cb("idle"));
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

  async startListening() {
    try {
      if (this.isProcessing) {
        throw new Error("Already processing audio");
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaStream = stream;
      const w = this.w!;
      this.audioContext = new (w.AudioContext || w.webkitAudioContext)();

      // Set up silence detection via AnalyserNode
      const audioCtx = this.audioContext!;
      const source = audioCtx.createMediaStreamSource(stream);
      this.analyserNode = audioCtx.createAnalyser();
      this.analyserNode.fftSize = 2048;
      source.connect(this.analyserNode);

      const pauseDuration = this.config?.pauseDuration ?? 2000;
      const silenceThreshold = this.config?.silenceThreshold ?? 0.01;
      this.silenceStart = null;

      const dataArray = new Float32Array(this.analyserNode.fftSize);
      this.silenceCheckInterval = setInterval(() => {
        if (!this.analyserNode) return;
        this.analyserNode.getFloatTimeDomainData(dataArray);

        // Compute RMS volume
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / dataArray.length);

        if (rms < silenceThreshold) {
          if (this.silenceStart === null) {
            this.silenceStart = Date.now();
          } else if (Date.now() - this.silenceStart >= pauseDuration) {
            // Silence exceeded threshold — auto-stop
            this.stopListening();
          }
        } else {
          // Sound detected — reset silence timer
          this.silenceStart = null;
        }
      }, 100);

      this.mediaRecorder = new MediaRecorder(stream);
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
    // Clean up silence detection
    if (this.silenceCheckInterval) {
      clearInterval(this.silenceCheckInterval);
      this.silenceCheckInterval = null;
    }
    this.analyserNode = null;
    this.silenceStart = null;

    if (this.mediaRecorder) {
      this.mediaRecorder.stop();
      this.mediaRecorder.stream.getTracks().forEach((track) => track.stop());
      this.mediaRecorder = null;
    }

    // Clean up media stream reference
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }

    this.statusCallbacks.forEach((cb) => cb("idle"));
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

      this.ws.send(
        JSON.stringify({
          type: "audio_input",
          audio: base64Audio,
          format,
          sampleRate: 16000,
          voiceId: this.config?.voiceId,
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
    audioEl.onended = () => URL.revokeObjectURL(url);
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
    await this.stopListening();

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
