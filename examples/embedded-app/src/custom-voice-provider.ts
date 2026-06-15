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
//
// Everything here is plain DOM/Web Speech, no Persona internals, so it doubles
// as a copy-paste template for wrapping a cloud STT service instead.

import type {
  VoiceProvider,
  VoiceResult,
  VoiceStatus,
} from "@runtypelabs/persona";

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

  constructor(options: WebSpeechVoiceProviderOptions = {}) {
    this.language = options.language ?? "en-US";
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
      // "aborted"/"no-speech" are benign end-of-turn signals, not failures.
      if (event.error !== "aborted" && event.error !== "no-speech") {
        this.emitError(new Error(event.message || `Speech recognition error: ${event.error}`));
      }
    };

    recognition.onend = () => {
      this.listening = false;
      this.recognition = null;
      this.emitStatus("idle");
    };

    this.recognition = recognition;
    recognition.start();
  }

  async stopListening(): Promise<void> {
    if (!this.recognition) return;
    // stop() lets a pending final result flush; onend then resets state.
    this.recognition.stop();
    this.listening = false;
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
