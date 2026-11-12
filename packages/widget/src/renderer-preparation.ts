import { getTurnActivityUiSync, loadTurnActivityUi } from "./turn-activity-ui-loader";
import { prepareIconRegistry } from "./utils/icons";
import type { AgentWidgetConfig } from "./types";
import { getComposerActionsSync, loadComposerActions } from "./composer-actions-loader";
import { getActivityUiSync, loadActivityUi } from "./activity-ui-loader";
import { getLoadingLabelRuntimeSync, loadLoadingLabelRuntime } from "./loading-label-runtime-loader";
import { getDictationRuntimeSync, loadDictationRuntime } from "./dictation-runtime-loader";
import { getMarkdownParsersSync, loadMarkdownParsers } from "./markdown-parsers-loader";
import { getArtifactsUiSync, loadArtifactsUi } from "./artifacts-ui-loader";
import { getUiExtrasSync, loadUiExtras } from "./ui-extras-loader";
import { getVoiceRuntimeSync, loadVoiceRuntime } from "./voice-runtime-loader";
import { rendererChunkNeeds } from "./utils/renderer-chunks";

/** Load the modules a config needs, without constructing UI or starting
 * microphone/providers. Each loader owns its cache and retry policy.
 *
 * `rendererChunkNeeds` owns the requirements, shared with the installer's
 * preload so both always name the same files. Its flags are positional: the
 * calls below follow the order of `RENDERER_CHUNKS`, which
 * `renderer-preparation.test.ts` pins. */
export const prepareRendererModules = (config: AgentWidgetConfig): Promise<unknown>[] => {
  const pending: Promise<unknown>[] = [];
  const needs = rendererChunkNeeds(config);
  const require = (cached: unknown, load: () => Promise<unknown>) => {
    if (needs.shift() && !cached) pending.push(load());
  };
  require(getComposerActionsSync(), loadComposerActions);
  require(getMarkdownParsersSync(), loadMarkdownParsers);
  require(getTurnActivityUiSync(), loadTurnActivityUi);
  require(getActivityUiSync(), loadActivityUi);
  require(getLoadingLabelRuntimeSync(), loadLoadingLabelRuntime);
  require(getDictationRuntimeSync(), loadDictationRuntime);
  require(getVoiceRuntimeSync(), loadVoiceRuntime);
  require(getArtifactsUiSync(), loadArtifactsUi);
  require(getUiExtrasSync(), loadUiExtras);
  const icons = prepareIconRegistry();
  if (icons) pending.push(icons);
  return pending;
};
