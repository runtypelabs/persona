// @vitest-environment jsdom

/**
 * Parity contract: the eager construction-free probe must answer exactly what
 * the chunk-shipped factory's `isVoiceSupported` answers for every config
 * shape, since `session.isVoiceSupported()` (mic-button visibility) switched
 * from the factory to the probe when the providers moved to the lazy
 * voice-runtime chunk.
 */
import { describe, expect, it } from "vitest";

import { isVoiceSupportedProbe } from "./voice-support";
import { isVoiceSupported as factoryIsVoiceSupported } from "../voice/voice-factory";
import type { VoiceConfig, VoiceProvider } from "../types";

const fakeProvider = {
  startListening: async () => {},
  stopListening: async () => {},
  connect: async () => {},
  disconnect: () => {},
  onResult: () => {},
  onError: () => {},
  onStatusChange: () => {},
} as unknown as VoiceProvider;

const CASES: Array<[string, Partial<VoiceConfig> | undefined]> = [
  ["undefined config", undefined],
  ["empty config", {}],
  ["runtype with config", { type: "runtype", runtype: { agentId: "a" } as never }],
  ["runtype without config (falls to browser)", { type: "runtype" }],
  ["custom with provider instance", { type: "custom", custom: fakeProvider }],
  ["custom with factory fn", { type: "custom", custom: () => fakeProvider }],
  [
    "custom with invalid shape",
    { type: "custom", custom: {} as unknown as VoiceProvider },
  ],
  [
    "custom with throwing factory",
    {
      type: "custom",
      custom: (() => {
        throw new Error("boom");
      }) as unknown as () => VoiceProvider,
    },
  ],
  ["custom without custom (falls to browser)", { type: "custom" }],
  ["browser type", { type: "browser" }],
];

describe("isVoiceSupportedProbe parity with the factory", () => {
  it.each(CASES)("matches for %s", (_label, config) => {
    expect(isVoiceSupportedProbe(config)).toBe(factoryIsVoiceSupported(config));
  });
});
