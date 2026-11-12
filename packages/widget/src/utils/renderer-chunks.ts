import type { AgentWidgetConfig } from "../types";
import { usesSessionVoiceForConfig } from "./voice-support";

/**
 * Lazy chunks a configuration needs before the widget is revealed, named by
 * their published file stem (`<name>.js` beside `index.global.js`).
 *
 * This is the single source of truth for two callers:
 *  - `renderer-preparation.ts` loads each needed chunk and holds the reveal
 *    until they resolve;
 *  - `install.ts` preloads the same files in parallel with (or ahead of) the
 *    main bundle, so that barrier resolves without a network round trip.
 *
 * Every predicate must give the same answer for a host's raw config and for the
 * same config after `mergeWithDefaults` (asserted by `renderer-chunks.test.ts`):
 * the installer only ever sees the raw one. So a default that enables a chunk
 * is spelled out here instead of being read from the merged object.
 *
 * IMPORTANT: keep this module free of value imports beyond `voice-support`. It
 * is bundled into the installer, which runs on every page view.
 */
export const RENDERER_CHUNKS = [
  "composer-actions-runtime",
  "markdown-parsers",
  "turn-activity-ui",
  "activity-ui",
  "loading-label-runtime",
  "dictation-runtime",
  "voice-runtime",
  "artifacts-ui",
  "ui-extras",
] as const;

export type RendererChunk = (typeof RENDERER_CHUNKS)[number];

/**
 * Whether a config needs each entry of `RENDERER_CHUNKS`, in that order.
 *
 * The widget pairs these flags with its loaders by position, so its bundle
 * carries no chunk names (`renderer-preparation.test.ts` pins the pairing).
 */
export const rendererChunkNeeds = (config: AgentWidgetConfig): boolean[] => {
  const v5 = config.future?.v5Defaults === true;
  const features = config.features;
  const turn = config.turnActivity?.enabled === true;
  const activity = turn || features?.showToolCalls !== false || features?.showReasoning !== false;
  const voice = config.voiceRecognition?.enabled !== false;
  return [
    true,
    true,
    turn,
    activity,
    activity ||
      (config.loadingLabel?.animation !== "none" &&
        (!!config.loadingLabel?.animate ||
          (config.loadingIndicator?.variant ?? (v5 ? "label" : "dots")) === "label")),
    voice,
    voice && usesSessionVoiceForConfig(config),
    (features?.artifacts?.enabled ?? v5) === true,
    config.contextMentions?.enabled === true,
  ];
};

/** The chunks a config needs before reveal, by published file stem. */
export const selectRendererChunks = (config: AgentWidgetConfig): RendererChunk[] => {
  const needs = rendererChunkNeeds(config);
  return RENDERER_CHUNKS.filter((_, index) => needs[index]);
};

/**
 * The icon registry's tail, which the reveal barrier loads for every config
 * (`prepareIconRegistry`) alongside the renderer chunks.
 */
export const REVEAL_CHUNK = "icons-extra";

/**
 * Chunks the first turn needs after reveal: request construction and the SSE
 * stream parser. Worth having in cache before the first send, but never at the
 * expense of the reveal, so they are only ever fetched speculatively.
 */
export const FIRST_TURN_CHUNKS = ["client-dispatch", "client-stream"] as const;
