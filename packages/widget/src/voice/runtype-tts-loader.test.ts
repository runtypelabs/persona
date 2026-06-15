// Tests for the deferred Runtype TTS loader indirection — the seam the IIFE/CDN
// build uses to fetch the standalone `runtype-tts.js` chunk instead of inlining
// the engine. (See runtype-tts-loader.ts / index-global.ts.)
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  setRuntypeTtsLoader,
  loadRuntypeTts,
  type RuntypeTtsModule,
} from "./runtype-tts-loader";

afterEach(() => {
  setRuntypeTtsLoader(null); // restore the default (inlined) import
});

describe("runtype-tts-loader", () => {
  it("uses a registered loader when one is set (the IIFE/CDN path)", async () => {
    const fakeModule = {
      RuntypeSpeechEngine: class {},
      FallbackSpeechEngine: class {},
    } as unknown as RuntypeTtsModule;
    const loader = vi.fn(async () => fakeModule);
    setRuntypeTtsLoader(loader);

    const mod = await loadRuntypeTts();

    expect(loader).toHaveBeenCalledTimes(1);
    expect(mod).toBe(fakeModule);
  });

  it("falls back to the inlined import when no loader is registered", async () => {
    setRuntypeTtsLoader(null);

    // The default path resolves the real chunk entry, which exports both engines.
    const mod = await loadRuntypeTts();

    expect(typeof mod.RuntypeSpeechEngine).toBe("function");
    expect(typeof mod.FallbackSpeechEngine).toBe("function");
  });

  it("setRuntypeTtsLoader(null) restores the default after an override", async () => {
    setRuntypeTtsLoader(vi.fn(async () => ({}) as RuntypeTtsModule));
    setRuntypeTtsLoader(null);

    const mod = await loadRuntypeTts();
    expect(typeof mod.RuntypeSpeechEngine).toBe("function");
  });
});
