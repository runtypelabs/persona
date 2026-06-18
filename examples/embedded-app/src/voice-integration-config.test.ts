import { describe, expect, test } from "vitest";

import {
  clearVoiceIntegrationSavedConfig,
  createVoiceIntegrationTextToSpeechConfig,
  getBrowserVoiceClipboardValue,
  getBrowserVoiceCopyIconName,
  getTestVoiceButtonLabel,
  getVoiceIntegrationCredentialMode,
  requiresVoiceIntegrationDirectCredentials,
  VOICE_INTEGRATION_STORAGE_KEYS,
} from "./voice-integration-config";

describe("voice integration TTS config", () => {
  test("copies the selected browser voice name value", () => {
    expect(getBrowserVoiceClipboardValue("Bells")).toBe("Bells");
    expect(getBrowserVoiceClipboardValue("  Bells  ")).toBe("  Bells  ");
    expect(getBrowserVoiceClipboardValue("  ")).toBeUndefined();
  });

  test("labels the test voice button as stoppable while playback is active", () => {
    expect(getTestVoiceButtonLabel(false)).toBe("\u25B6 Test voice");
    expect(getTestVoiceButtonLabel(true)).toBe("\u25A0 Stop voice");
  });

  test("uses a check icon after a browser voice value is copied", () => {
    expect(getBrowserVoiceCopyIconName(false)).toBe("copy");
    expect(getBrowserVoiceCopyIconName(true)).toBe("check");
  });

  test("clears all saved voice demo settings", () => {
    const removedKeys: string[] = [];

    clearVoiceIntegrationSavedConfig({
      removeItem: (key: string) => {
        removedKeys.push(key);
      },
    });

    expect(removedKeys).toEqual(VOICE_INTEGRATION_STORAGE_KEYS);
  });

  test("uses the proxied agent unless both direct credentials are provided", () => {
    expect(
      getVoiceIntegrationCredentialMode({
        clientToken: "",
        agentId: "",
      }),
    ).toBe("proxy");
    expect(
      getVoiceIntegrationCredentialMode({
        clientToken: "REPLACE_WITH_YOUR_CLIENT_TOKEN",
        agentId: "REPLACE_WITH_YOUR_AGENT_ID",
      }),
    ).toBe("proxy");
    expect(
      getVoiceIntegrationCredentialMode({
        clientToken: "token",
        agentId: "agent",
      }),
    ).toBe("direct");
  });

  test("requires direct credentials when a Runtype voice provider is selected", () => {
    expect(
      requiresVoiceIntegrationDirectCredentials({
        voiceInputProvider: "browser",
        voiceOutputProvider: "browser",
      }),
    ).toBe(false);
    expect(
      requiresVoiceIntegrationDirectCredentials({
        voiceInputProvider: "runtype",
        voiceOutputProvider: "browser",
      }),
    ).toBe(true);
    expect(
      requiresVoiceIntegrationDirectCredentials({
        voiceInputProvider: "browser",
        voiceOutputProvider: "runtype",
      }),
    ).toBe(true);
  });

  test("maps OpenAI output to a hosted speech engine", () => {
    const createOpenAiEngine = () => ({
      id: "test-openai",
      supportsPause: true,
      speak: () => {},
      pause: () => {},
      resume: () => {},
      stop: () => {},
    });

    const config = createVoiceIntegrationTextToSpeechConfig({
      voiceOutputProvider: "openai",
      autoSpeakReplies: true,
      ttsBrowserFallback: false,
      ttsVoice: "",
      ttsRate: 1.2,
      ttsPitch: 1,
      openAiVoice: "nova",
      createOpenAiEngine,
    });

    expect(config).toMatchObject({
      enabled: true,
      voice: "nova",
      rate: 1.2,
      createEngine: createOpenAiEngine,
    });
    expect(config).not.toHaveProperty("provider");
  });

  test("keeps the read-aloud engine available when auto-speak is disabled", () => {
    const createOpenAiEngine = () => ({
      id: "test-openai",
      supportsPause: true,
      speak: () => {},
      pause: () => {},
      resume: () => {},
      stop: () => {},
    });

    const config = createVoiceIntegrationTextToSpeechConfig({
      voiceOutputProvider: "openai",
      autoSpeakReplies: false,
      ttsBrowserFallback: false,
      ttsVoice: "",
      ttsRate: 1,
      ttsPitch: 1,
      agentId: "agent-123",
      openAiVoice: "alloy",
      createOpenAiEngine,
    });

    expect(config).toMatchObject({
      enabled: false,
      createEngine: createOpenAiEngine,
    });
  });

  test("passes the direct agent id to Runtype output", () => {
    const config = createVoiceIntegrationTextToSpeechConfig({
      voiceOutputProvider: "runtype",
      autoSpeakReplies: true,
      ttsBrowserFallback: true,
      ttsVoice: "Bells",
      ttsRate: 1,
      ttsPitch: 1,
      agentId: "agent-123",
      openAiVoice: "alloy",
      createOpenAiEngine: () => {
        throw new Error("unused");
      },
    });

    expect(config).toMatchObject({
      provider: "runtype",
      agentId: "agent-123",
      voice: "Bells",
    });
  });
});
