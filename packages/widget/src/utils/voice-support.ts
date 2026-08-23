import type { VoiceConfig } from "../types";

/**
 * Eager, construction-free replica of the voice factory's `isVoiceSupported`
 * (`voice/voice-factory.ts`, which ships in the lazy voice-runtime chunk).
 * Drives mic-button visibility on first paint, so it must stay synchronous
 * and in the core bundle without dragging the providers in.
 *
 * Parity contract (asserted by `voice-support.test.ts`): returns exactly what
 * `isVoiceSupported` in the factory returns for every config shape —
 *  - `custom` with a provider/factory: resolve + shape-check (invoking a
 *    factory, as the factory version does via construction);
 *  - `runtype` with config: supported (the provider constructor only stores
 *    config; the WebSocket opens lazily);
 *  - otherwise: browser SpeechRecognition presence.
 */
export const isBrowserSpeechRecognitionSupported = (): boolean =>
  typeof window !== "undefined" &&
  ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

export function isVoiceSupportedProbe(config?: Partial<VoiceConfig>): boolean {
  try {
    if (config?.type === "custom" && config.custom) {
      const custom = config.custom;
      const provider = typeof custom === "function" ? custom() : custom;
      return !!provider && typeof provider.startListening === "function";
    }
    if (config?.type === "runtype" && config.runtype) return true;
    return isBrowserSpeechRecognitionSupported();
  } catch {
    return false;
  }
}
