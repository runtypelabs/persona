import { prepareIconRegistry } from "./utils/icons";
import type { AgentWidgetConfig } from "./types";
import { getComposerActionsSync, loadComposerActions } from "./composer-actions-loader";
import { getActivityUiSync, loadActivityUi } from "./activity-ui-loader";
import { getDictationRuntimeSync, loadDictationRuntime } from "./dictation-runtime-loader";
import { getMarkdownParsersSync, loadMarkdownParsers } from "./markdown-parsers-loader";
import { getArtifactsUiSync, loadArtifactsUi } from "./artifacts-ui-loader";
import { getUiExtrasSync, loadUiExtras } from "./ui-extras-loader";
import { getVoiceRuntimeSync, loadVoiceRuntime } from "./voice-runtime-loader";
import { usesSessionVoiceForConfig } from "./utils/voice-support";

/** Select modules, without constructing UI or starting microphone/providers.
 * Each loader owns its cache and retry policy; this only selects requirements. */
export const prepareRendererModules = (config: AgentWidgetConfig): Promise<unknown>[] => {
  const pending: Promise<unknown>[] = [];
  const require = (enabled: boolean, cached: unknown, load: () => Promise<unknown>) => {
    if (enabled && !cached) pending.push(load());
  };
  require(true, getComposerActionsSync(), loadComposerActions);
  require(true, getMarkdownParsersSync(), loadMarkdownParsers);
  require(config.features?.showToolCalls !== false || config.features?.showReasoning !== false, getActivityUiSync(), loadActivityUi);
  require(config.voiceRecognition?.enabled !== false, getDictationRuntimeSync(), loadDictationRuntime);
  require(config.voiceRecognition?.enabled !== false && usesSessionVoiceForConfig(config), getVoiceRuntimeSync(), loadVoiceRuntime);
  require(config.features?.artifacts?.enabled === true, getArtifactsUiSync(), loadArtifactsUi);
  require(config.contextMentions?.enabled === true, getUiExtrasSync(), loadUiExtras);
  const icons = prepareIconRegistry();
  if (icons) pending.push(icons);
  return pending;
};
