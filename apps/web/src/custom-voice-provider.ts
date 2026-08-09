// Example: a bring-your-own (BYO) voice provider.
//
// Persona ships `browser` and `runtype` voice providers, but you can plug in
// any speech engine by implementing the `VoiceProvider` interface and passing
// it through `voiceRecognition.provider`:
//
//   voiceRecognition: {
//     enabled: true,
//     provider: {
//       type: 'custom',
//       // a ready instance, or a `() => VoiceProvider` factory (deferred):
//       custom: () => createWebSpeechVoiceProvider({ language: 'en-US' }),
//     },
//   }
//
// This adapter wraps the browser's Web Speech API as a *speech-to-text only*
// provider. That's the simplest BYO shape: it emits a final transcript via
// `onResult`, and Persona sends it as a normal user message: the assistant
// reply then streams back over the usual chat path. (A full-duplex provider
// that also produces spoken replies would additionally drive `onTranscript`
// and `onMetrics`, like the realtime `runtype` provider.)
//
// Speech OUT is a separate subsystem: voice *input* (this provider) and voice
// *output* (`textToSpeech`) are independent. To hear replies, pair this with
// browser TTS: it works with any input provider, so an STT-only adapter still
// gets a spoken reply for free:
//
//   textToSpeech: { enabled: true, provider: 'browser' }
//
// (The custom-voice-provider demo does exactly this to close the voice loop.)
//
// The contract the widget relies on:
//   • startListening(): begin capturing; resolve once recognition is running.
//   • stopListening(): stop capturing (a final result may still arrive).
//   • onResult(cb): deliver `{ text, provider: 'custom' }` for each final.
//   • onStatusChange(cb): report 'listening' | 'processing' | 'idle' | 'error'
//                         so the mic button reflects the right visual state.
//   • onError(cb): surface failures (permission denied, no-speech, …).
//   • onLevel(cb): OPTIONAL. Report a 0..1 capture amplitude so the widget can
//                  publish `--persona-voice-level` for themes to animate off.
//                  Only providers that own an audio graph can answer this; the
//                  widget falls back to a fixed midpoint when it goes unused.
//
// Everything here is plain DOM/Web Speech, no Persona internals, so it doubles
// as a copy-paste template for wrapping a cloud STT service instead.

import type {
  VoiceProvider,
  VoiceResult,
  VoiceStatus,
} from "@runtypelabs/persona";

/**
 * RMS-to-0..1 gain for the published level. Conversational speech sits around
 * 0.05 to 0.3 RMS, so the raw value would never leave the bottom of the range.
 * Same practical scaling the built-in runtype provider uses.
 */
const LEVEL_RMS_SCALE = 4;
/** Poll cadence. The widget smooths on its own frame loop, so this is plenty. */
const LEVEL_INTERVAL_MS = 60;
/** Small window: we want amplitude, not spectral detail. */
const LEVEL_FFT_SIZE = 256;

// Minimal typings for the (still non-standard) Web Speech API.
interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
  isFinal: boolean;
  length: number;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}
interface SpeechRecognitionErrorEventLike {
  error: string;
  message?: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface WebSpeechVoiceProviderOptions {
  /** BCP-47 language tag for recognition (default: "en-US"). */
  language?: string;
  /**
   * Capture amplitude for `onLevel` alongside recognition (default: true).
   * Opens a second, analysis-only microphone stream. When it fails or is
   * denied, dictation continues and the widget falls back to its midpoint.
   */
  reportLevel?: boolean;
  /** Called once when level capture cannot start, for demo logging. */
  onLevelUnavailable?: (reason: string) => void;
}

/** True when this browser can back the BYO Web Speech adapter. */
export function isWebSpeechSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

class WebSpeechVoiceProvider implements VoiceProvider {
  readonly type = "custom" as const;

  private recognition: SpeechRecognitionLike | null = null;
  private listening = false;
  private readonly language: string;

  private resultCallbacks: Array<(result: VoiceResult) => void> = [];
  private errorCallbacks: Array<(error: Error) => void> = [];
  private statusCallbacks: Array<(status: VoiceStatus) => void> = [];
  private levelCallbacks: Array<(level: number) => void> = [];

  // Level capture: a second, analysis-only stream. Web Speech gives us no
  // access to its own audio, so amplitude has to come from somewhere else.
  private readonly reportLevel: boolean;
  private readonly onLevelUnavailable?: (reason: string) => void;
  private levelStream: MediaStream | null = null;
  private levelContext: AudioContext | null = null;
  private levelSource: MediaStreamAudioSourceNode | null = null;
  private levelAnalyser: AnalyserNode | null = null;
  private levelTimer: ReturnType<typeof setInterval> | null = null;
  private levelBuffer: Float32Array<ArrayBuffer> | null = null;

  constructor(options: WebSpeechVoiceProviderOptions = {}) {
    this.language = options.language ?? "en-US";
    this.reportLevel = options.reportLevel ?? true;
    this.onLevelUnavailable = options.onLevelUnavailable;
  }

  /**
   * Open the analysis stream. An AnalyserNode rather than a ScriptProcessor:
   * it is not deprecated, and polling it on a timer keeps the cadence explicit
   * instead of tied to a buffer size.
   *
   * Failure is never fatal. Dictation is the feature; the level is decoration,
   * so a denied or missing microphone just leaves `onLevel` silent.
   */
  private async startLevelCapture(): Promise<void> {
    if (!this.reportLevel || this.levelContext) return;
    if (this.levelCallbacks.length === 0) return;

    const AudioCtor =
      typeof window !== "undefined"
        ? ((window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
            .AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext)
        : undefined;
    if (!navigator?.mediaDevices?.getUserMedia || !AudioCtor) {
      this.onLevelUnavailable?.("this browser exposes no microphone capture API");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // stopListening() may have run while the permission prompt was open.
      if (!this.listening) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const context = new AudioCtor();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = LEVEL_FFT_SIZE;
      source.connect(analyser);
      // Deliberately NOT connected to context.destination: that would echo the
      // microphone back through the speakers.

      this.levelStream = stream;
      this.levelContext = context;
      this.levelSource = source;
      this.levelAnalyser = analyser;
      this.levelBuffer = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));

      this.levelTimer = setInterval(() => this.publishLevel(), LEVEL_INTERVAL_MS);
    } catch (error) {
      this.stopLevelCapture();
      const reason =
        error instanceof Error && error.name === "NotAllowedError"
          ? "microphone permission was denied for level capture"
          : `level capture failed to start (${(error as Error)?.name ?? "unknown error"})`;
      this.onLevelUnavailable?.(reason);
    }
  }

  /** Time-domain RMS of the current window, scaled into a usable 0..1 range. */
  private publishLevel(): void {
    const analyser = this.levelAnalyser;
    const buffer = this.levelBuffer;
    if (!analyser || !buffer) return;
    analyser.getFloatTimeDomainData(buffer);
    let sumSquares = 0;
    for (let i = 0; i < buffer.length; i += 1) sumSquares += buffer[i] * buffer[i];
    const rms = Math.sqrt(sumSquares / buffer.length);
    const level = Math.max(0, Math.min(1, rms * LEVEL_RMS_SCALE));
    this.levelCallbacks.forEach((cb) => cb(level));
  }

  /** Idempotent teardown: every start path and every stop path calls it. */
  private stopLevelCapture(): void {
    if (this.levelTimer !== null) {
      clearInterval(this.levelTimer);
      this.levelTimer = null;
    }
    this.levelSource?.disconnect();
    this.levelSource = null;
    this.levelAnalyser?.disconnect();
    this.levelAnalyser = null;
    this.levelBuffer = null;
    this.levelStream?.getTracks().forEach((track) => track.stop());
    this.levelStream = null;
    const context = this.levelContext;
    this.levelContext = null;
    // close() rejects if the context is already closed; the level is optional
    // either way, so a failed close must not surface as a voice error.
    void context?.close().catch(() => {});
    // Park the meter at rest so a theme's bars settle instead of freezing.
    this.levelCallbacks.forEach((cb) => cb(0));
  }

  // The Web Speech API has no separate connection step: it spins up on
  // start(). connect()/disconnect() are no-ops here so the lifecycle still
  // matches the interface (a networked provider would open/close a socket).
  async connect(): Promise<void> {}

  async disconnect(): Promise<void> {
    await this.stopListening();
    this.resultCallbacks = [];
    this.errorCallbacks = [];
    this.statusCallbacks = [];
    this.levelCallbacks = [];
  }

  async startListening(): Promise<void> {
    if (this.listening) return; // idempotent

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      this.emitError(new Error("Web Speech API is not available in this browser"));
      return;
    }

    const recognition = new Ctor();
    recognition.lang = this.language;
    recognition.continuous = false;
    recognition.interimResults = false; // STT-only example: finals only

    recognition.onstart = () => {
      this.listening = true;
      this.emitStatus("listening");
      // Started only once recognition is actually live, so a failed start
      // never leaves an orphan microphone stream open.
      void this.startLevelCapture();
    };

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result.isFinal) continue;
        const text = result[0]?.transcript?.trim();
        if (text) {
          this.emitStatus("processing");
          this.emitResult({
            text,
            transcript: text,
            confidence: result[0]?.confidence,
            provider: "custom",
          });
        }
      }
    };

    recognition.onerror = (event) => {
      // Any error path releases the analysis stream too; `onend` may not fire.
      this.stopLevelCapture();
      // "aborted"/"no-speech" are benign end-of-turn signals, not failures.
      if (event.error !== "aborted" && event.error !== "no-speech") {
        this.emitError(new Error(event.message || `Speech recognition error: ${event.error}`));
      }
    };

    recognition.onend = () => {
      this.listening = false;
      this.recognition = null;
      this.stopLevelCapture();
      this.emitStatus("idle");
    };

    this.recognition = recognition;
    recognition.start();
  }

  async stopListening(): Promise<void> {
    // Released here as well as in `onend`: a stop that arrives before
    // recognition ever started has no `onend` to wait for.
    this.listening = false;
    this.stopLevelCapture();
    if (!this.recognition) return;
    // stop() lets a pending final result flush; onend then resets state.
    this.recognition.stop();
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

  /**
   * The opt-in any third-party provider can implement. Persona samples the
   * latest value on its own animation frame and publishes it as
   * `--persona-voice-level`; a provider that omits this gets the midpoint
   * fallback instead.
   */
  onLevel(callback: (level: number) => void): void {
    this.levelCallbacks.push(callback);
  }

  private emitResult(result: VoiceResult): void {
    this.resultCallbacks.forEach((cb) => cb(result));
  }

  private emitError(error: Error): void {
    this.emitStatus("error");
    if (this.errorCallbacks.length === 0) {
      console.error("[WebSpeechVoiceProvider]", error);
      return;
    }
    this.errorCallbacks.forEach((cb) => cb(error));
  }

  private emitStatus(status: VoiceStatus): void {
    this.statusCallbacks.forEach((cb) => cb(status));
  }
}

/** Factory for the BYO Web Speech provider: pass to `provider.custom`. */
export function createWebSpeechVoiceProvider(
  options: WebSpeechVoiceProviderOptions = {},
): VoiceProvider {
  return new WebSpeechVoiceProvider(options);
}
