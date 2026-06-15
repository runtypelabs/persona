// Browser Speech Engine
//
// Default `SpeechEngine` for the per-message "Read aloud" action and the
// auto-speak path, backed by the browser Web Speech API
// (`window.speechSynthesis`). Zero-backend and offline-capable, but limited to
// the OS/browser voice set.
//
// A hosted engine (Runtype TTS, ElevenLabs, a server proxy, …) implements the
// same `SpeechEngine` interface and is supplied via
// `textToSpeech.createEngine`; such an engine can stream PCM into the realtime
// voice `VoicePlaybackEngine` (see `audio-playback-manager.ts`). Nothing in the
// `ReadAloudController` is browser-specific — only this file is.

import type { SpeechCallbacks, SpeechEngine, SpeechRequest } from "../types";

/**
 * Pick the best available English voice from the browser's voice list.
 * Prefers high-quality remote/natural voices, then enhanced local voices,
 * then standard local voices, then any English voice, then the first voice.
 */
export function pickBestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice {
  // Priority list: high-quality voices across browsers/platforms.
  const preferred = [
    // Edge Online Natural (highest quality)
    "Microsoft Jenny Online (Natural) - English (United States)",
    "Microsoft Aria Online (Natural) - English (United States)",
    "Microsoft Guy Online (Natural) - English (United States)",
    // Google remote (good quality, cross-platform in Chrome)
    "Google US English",
    "Google UK English Female",
    // Apple premium/enhanced (macOS)
    "Ava (Premium)",
    "Evan (Enhanced)",
    "Samantha (Enhanced)",
    // Apple standard (macOS/iOS)
    "Samantha",
    "Daniel",
    "Karen",
    // Windows SAPI
    "Microsoft David Desktop - English (United States)",
    "Microsoft Zira Desktop - English (United States)",
  ];

  for (const name of preferred) {
    const match = voices.find((v) => v.name === name);
    if (match) return match;
  }

  // Fallback: any English voice, then first available.
  return voices.find((v) => v.lang.startsWith("en")) ?? voices[0];
}

export interface BrowserSpeechEngineOptions {
  /** Custom voice picker, used when no exact `voice` name is requested. */
  pickVoice?: (voices: SpeechSynthesisVoice[]) => SpeechSynthesisVoice;
}

/** Default `SpeechEngine` backed by the browser Web Speech API. */
export class BrowserSpeechEngine implements SpeechEngine {
  readonly id = "browser";
  // speechSynthesis exposes pause()/resume(); reliable for start/stop and
  // serviceable for pause on most engines (Chrome has known quirks on resume).
  readonly supportsPause = true;

  constructor(private options: BrowserSpeechEngineOptions = {}) {}

  /** Whether the Web Speech API is available in this environment. */
  static isSupported(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  speak(request: SpeechRequest, callbacks: SpeechCallbacks): void {
    if (!BrowserSpeechEngine.isSupported()) {
      callbacks.onError?.(new Error("Web Speech API is unavailable"));
      return;
    }

    const synth = window.speechSynthesis;
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(request.text);
    const voices = synth.getVoices();
    if (request.voice) {
      const match = voices.find((v) => v.name === request.voice);
      if (match) utterance.voice = match;
    } else if (voices.length > 0) {
      utterance.voice = this.options.pickVoice
        ? this.options.pickVoice(voices)
        : pickBestVoice(voices);
    }
    if (request.rate !== undefined) utterance.rate = request.rate;
    if (request.pitch !== undefined) utterance.pitch = request.pitch;

    utterance.onend = () => callbacks.onEnd?.();
    utterance.onerror = (event) => {
      // A stop()/superseding utterance fires "canceled"/"interrupted" — that's
      // a normal end of playback, not an error worth surfacing. `event` is a
      // SpeechSynthesisErrorEvent, so `.error` is the failure reason.
      const reason = event.error;
      if (reason === "canceled" || reason === "interrupted") {
        callbacks.onEnd?.();
      } else {
        callbacks.onError?.(new Error(reason || "Speech synthesis failed"));
      }
    };

    // Chrome bug: cancel() immediately followed by speak() can drop rate/pitch.
    // A short delay lets the engine reset before the new utterance starts.
    setTimeout(() => {
      synth.speak(utterance);
      // `utterance.onstart` is unreliable across browsers — Chrome can leave it
      // unfired even while actively speaking, which would strand the UI in the
      // "loading" state. Browser TTS has no real async prepare phase, so treat
      // scheduling as the start; onend/onerror still drive the return to idle.
      callbacks.onStart?.();
    }, 50);
  }

  pause(): void {
    if (BrowserSpeechEngine.isSupported()) window.speechSynthesis.pause();
  }

  resume(): void {
    if (BrowserSpeechEngine.isSupported()) window.speechSynthesis.resume();
  }

  stop(): void {
    if (BrowserSpeechEngine.isSupported()) window.speechSynthesis.cancel();
  }
}
