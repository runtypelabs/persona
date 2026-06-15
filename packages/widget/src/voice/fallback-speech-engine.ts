// Fallback Speech Engine
//
// Composes a primary `SpeechEngine` with a fallback one (typically a hosted
// engine + the browser Web Speech API). If the primary fails *before* any audio
// is audible — a missing/404 endpoint, a network error, an auth failure — the
// fallback transparently takes over for that utterance, so the "Read aloud"
// button is never left broken. A failure that happens *after* playback has
// started (a mid-stream drop) is surfaced as a real error instead of restarting
// from the top.
//
// This is what makes `textToSpeech: { provider: 'runtype' }` safe to ship before
// (or independently of) the Runtype TTS endpoint: it speaks with the browser
// voice today and auto-upgrades to Runtype voices the moment the endpoint
// answers. Set `browserFallback: false` to opt out and surface Runtype errors.

import type { SpeechCallbacks, SpeechEngine, SpeechRequest } from "../types";

export interface FallbackSpeechEngineOptions {
  /**
   * Called once when the primary engine fails before audio starts and the
   * fallback takes over — so a silent downgrade is still observable in dev/
   * telemetry even though the user keeps hearing speech.
   */
  onFallback?: (error: Error) => void;
}

/** A `SpeechEngine` that falls back from `primary` to `fallback` per utterance. */
export class FallbackSpeechEngine implements SpeechEngine {
  readonly id = "fallback";

  // Whichever engine is currently driving playback, so pause/resume/stop route
  // to the right one after a fallback has (or hasn't) kicked in.
  private active: SpeechEngine;

  constructor(
    private readonly primary: SpeechEngine,
    private readonly fallback: SpeechEngine,
    private readonly options: FallbackSpeechEngineOptions = {},
  ) {
    this.active = primary;
  }

  // Pause/resume only matters once something is playing, and both built-in
  // engines support it; report the active engine's capability.
  get supportsPause(): boolean {
    return this.active.supportsPause;
  }

  speak(request: SpeechRequest, callbacks: SpeechCallbacks): void {
    this.active = this.primary;
    let started = false;

    this.primary.speak(request, {
      onStart: () => {
        started = true;
        callbacks.onStart?.();
      },
      onEnd: () => callbacks.onEnd?.(),
      onError: (error) => {
        // A failure once audio is playing is a genuine error — don't restart.
        if (started) {
          callbacks.onError?.(error);
          return;
        }
        // Pre-start failure: silently hand the utterance to the fallback.
        this.options.onFallback?.(error);
        this.active = this.fallback;
        this.fallback.speak(request, callbacks);
      },
    });
  }

  pause(): void {
    this.active.pause();
  }

  resume(): void {
    this.active.resume();
  }

  stop(): void {
    this.active.stop();
  }

  destroy(): void {
    this.primary.destroy?.();
    this.fallback.destroy?.();
  }
}
