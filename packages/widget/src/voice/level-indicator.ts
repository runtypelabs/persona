/** Live amplitude styling, loaded with the optional dictation UI. */
export function createVoiceLevelIndicator(options: {
  targets: () => HTMLElement[];
  sample: () => { level: number | null; fallback: boolean };
}) {
  // --- Live voice level (`--persona-voice-level`) ----------------------------
  // One rAF loop, alive only while the mic is recording. It publishes a 0..1
  // amplitude so a theme can drive waveforms and pulse intensity in pure CSS.
  //
  // The variable is DATA, not motion, so it keeps updating under
  // prefers-reduced-motion; only the default visual that consumes it is gated.
  const VOICE_LEVEL_PROPERTY = "--persona-voice-level";
  /** Providers with no audio graph report nothing; assume a steady midpoint. */
  const VOICE_LEVEL_FALLBACK = 0.5;
  let voiceLevelFrame: number | null = null;
  let voiceLevelPublished = -1;
  let voiceLevelSmoothed = 0;

  const writeVoiceLevel = (value: number): void => {
    // Quantized to 0.01 and skipped when unchanged: at 60fps this turns a
    // continuous signal into at most a handful of style writes per second.
    const quantized = Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
    if (quantized === voiceLevelPublished) return;
    voiceLevelPublished = quantized;
    for (const target of options.targets()) {
      target.style.setProperty(VOICE_LEVEL_PROPERTY, String(quantized));
    }
  };

  const clearVoiceLevel = (): void => {
    voiceLevelPublished = -1;
    voiceLevelSmoothed = 0;
    for (const target of options.targets()) {
      target.style.removeProperty(VOICE_LEVEL_PROPERTY);
    }
  };

  function startVoiceLevelLoop(): void {
    if (voiceLevelFrame !== null) return;
    if (typeof requestAnimationFrame !== "function") {
      // No frame loop available: publish once so the property still exists.
      writeVoiceLevel(options.sample().level ?? VOICE_LEVEL_FALLBACK);
      return;
    }
    const tick = (): void => {
      voiceLevelFrame = requestAnimationFrame(tick);
      const { level: raw, fallback } = options.sample();
      if (raw === null && !fallback) { clearVoiceLevel(); return; }
      if (raw === null) {
        writeVoiceLevel(VOICE_LEVEL_FALLBACK);
        return;
      }
      // Providers report at their capture cadence (~85ms), far slower than a
      // frame, so the published value eases toward the latest sample.
      voiceLevelSmoothed += (raw - voiceLevelSmoothed) * 0.3;
      writeVoiceLevel(voiceLevelSmoothed);
    };
    voiceLevelFrame = requestAnimationFrame(tick);
  }

  function stopVoiceLevelLoop(): void {
    if (voiceLevelFrame !== null) {
      cancelAnimationFrame(voiceLevelFrame);
      voiceLevelFrame = null;
    }
    clearVoiceLevel();
  }

  return { start: startVoiceLevelLoop, stop: stopVoiceLevelLoop };
}
