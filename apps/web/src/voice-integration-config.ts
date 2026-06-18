import type { AgentWidgetConfig, SpeechEngine } from "@runtypelabs/persona";

export type VoiceIntegrationOutputProvider =
  | "none"
  | "browser"
  | "runtype"
  | "openai";

export type VoiceIntegrationTextToSpeechOptions = {
  voiceOutputProvider: VoiceIntegrationOutputProvider;
  autoSpeakReplies: boolean;
  ttsBrowserFallback: boolean;
  ttsVoice: string;
  ttsRate: number;
  ttsPitch: number;
  agentId?: string;
  openAiVoice: string;
  createOpenAiEngine: () => SpeechEngine | Promise<SpeechEngine>;
};

type VoiceIntegrationTextToSpeechConfig = NonNullable<
  AgentWidgetConfig["textToSpeech"]
>;

type VoiceIntegrationCredentials = {
  clientToken: string;
  agentId: string;
};

type VoiceIntegrationProviderSelection = {
  voiceInputProvider: VoiceIntegrationOutputProvider;
  voiceOutputProvider: VoiceIntegrationOutputProvider;
};

export const VOICE_INTEGRATION_STORAGE_KEYS = [
  "voiceDemoClientToken",
  "voiceDemoAgentId",
  "voiceDemoVoiceInputProvider",
  "voiceDemoVoiceOutputProvider",
  "voiceDemoAutoSpeakReplies",
  "voiceDemoTtsBrowserFallback",
  "voiceDemoTtsVoice",
  "voiceDemoOpenAiVoice",
  "voiceDemoOpenAiModel",
  "voiceDemoTtsRate",
  "voiceDemoTtsPitch",
  "voiceDemoPauseDuration",
  "voiceDemoSilenceThreshold",
  "voiceDemoProcessingText",
  "voiceDemoProcessingErrorText",
  "voiceDemoCustomProcessingUI",
] as const;

type VoiceIntegrationStorage = Pick<Storage, "removeItem">;

export function clearVoiceIntegrationSavedConfig(
  storage: VoiceIntegrationStorage,
): void {
  VOICE_INTEGRATION_STORAGE_KEYS.forEach((key) => storage.removeItem(key));
}

function isMissingCredentialValue(value: string, placeholder: string): boolean {
  const normalized = value.trim();
  return normalized === "" || normalized === placeholder;
}

export function getVoiceIntegrationCredentialMode(
  credentials: VoiceIntegrationCredentials,
): "direct" | "proxy" {
  const missingClientToken = isMissingCredentialValue(
    credentials.clientToken,
    "REPLACE_WITH_YOUR_CLIENT_TOKEN",
  );
  const missingAgentId = isMissingCredentialValue(
    credentials.agentId,
    "REPLACE_WITH_YOUR_AGENT_ID",
  );

  return missingClientToken || missingAgentId ? "proxy" : "direct";
}

export function requiresVoiceIntegrationDirectCredentials(
  selection: VoiceIntegrationProviderSelection,
): boolean {
  return (
    selection.voiceInputProvider === "runtype" ||
    selection.voiceOutputProvider === "runtype"
  );
}

export function getBrowserVoiceClipboardValue(
  voiceName: string,
): string | undefined {
  return voiceName.trim() ? voiceName : undefined;
}

export function getTestVoiceButtonLabel(isPlaying: boolean): string {
  return isPlaying ? "\u25A0 Stop voice" : "\u25B6 Test voice";
}

export function getBrowserVoiceCopyIconName(isCopied: boolean): "copy" | "check" {
  return isCopied ? "check" : "copy";
}

export function createVoiceIntegrationTextToSpeechConfig(
  opts: VoiceIntegrationTextToSpeechOptions,
): VoiceIntegrationTextToSpeechConfig | undefined {
  if (opts.voiceOutputProvider === "none") return undefined;

  if (opts.voiceOutputProvider === "openai") {
    return {
      enabled: opts.autoSpeakReplies,
      createEngine: opts.createOpenAiEngine,
      voice: opts.openAiVoice || undefined,
      rate: opts.ttsRate,
    };
  }

  return {
    enabled: opts.autoSpeakReplies,
    provider: opts.voiceOutputProvider === "runtype" ? "runtype" : "browser",
    browserFallback: opts.ttsBrowserFallback,
    agentId:
      opts.voiceOutputProvider === "runtype" ? opts.agentId || undefined : undefined,
    voice: opts.ttsVoice || undefined,
    rate: opts.ttsRate,
    pitch: opts.ttsPitch,
  };
}
