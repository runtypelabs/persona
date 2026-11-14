import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentWidgetConfig } from "./types";
import { RENDERER_CHUNKS, selectRendererChunks } from "./utils/renderer-chunks";

/**
 * `prepareRendererModules` pairs `rendererChunkNeeds` with its loaders by
 * position, and the installer preloads `RENDERER_CHUNKS` by name from the same
 * flags. Each loader below records the published chunk it stands for, so a
 * loader listed out of order shows up as a preload of the wrong file.
 */
const { loaded } = vi.hoisted(() => ({ loaded: [] as string[] }));
const chunk = (name: string) => ({
  cached: () => null,
  load: () => {
    loaded.push(name);
    return Promise.resolve({});
  },
});

vi.mock("./composer-actions-loader", () => {
  const { cached, load } = chunk("composer-actions-runtime");
  return { getComposerActionsSync: cached, loadComposerActions: load };
});
vi.mock("./markdown-parsers-loader", () => {
  const { cached, load } = chunk("markdown-parsers");
  return { getMarkdownParsersSync: cached, loadMarkdownParsers: load };
});
vi.mock("./turn-activity-ui-loader", () => {
  const { cached, load } = chunk("turn-activity-ui");
  return { getTurnActivityUiSync: cached, loadTurnActivityUi: load };
});
vi.mock("./activity-ui-loader", () => {
  const { cached, load } = chunk("activity-ui");
  return { getActivityUiSync: cached, loadActivityUi: load };
});
vi.mock("./loading-label-runtime-loader", () => {
  const { cached, load } = chunk("loading-label-runtime");
  return { getLoadingLabelRuntimeSync: cached, loadLoadingLabelRuntime: load };
});
vi.mock("./dictation-runtime-loader", () => {
  const { cached, load } = chunk("dictation-runtime");
  return { getDictationRuntimeSync: cached, loadDictationRuntime: load };
});
vi.mock("./voice-runtime-loader", () => {
  const { cached, load } = chunk("voice-runtime");
  return { getVoiceRuntimeSync: cached, loadVoiceRuntime: load };
});
vi.mock("./artifacts-ui-loader", () => {
  const { cached, load } = chunk("artifacts-ui");
  return { getArtifactsUiSync: cached, loadArtifactsUi: load };
});
vi.mock("./ui-extras-loader", () => {
  const { cached, load } = chunk("ui-extras");
  return { getUiExtrasSync: cached, loadUiExtras: load };
});
vi.mock("./utils/icons", () => ({ prepareIconRegistry: () => null }));

const { prepareRendererModules } = await import("./renderer-preparation");

const QUIET: AgentWidgetConfig = {
  features: { showToolCalls: false, showReasoning: false },
  voiceRecognition: { enabled: false },
};
const RUNTYPE_VOICE = {
  enabled: true, provider: { type: "runtype" as const, runtype: { agentId: "agent_1" } },
};

const CONFIGS: Array<[name: string, config: AgentWidgetConfig]> = [
  ["defaults", {}],
  ["nothing optional", QUIET],
  ["turn activity", { ...QUIET, turnActivity: { enabled: true } }],
  ["tools only", { ...QUIET, features: { showToolCalls: true, showReasoning: false } }],
  ["label indicator only", { ...QUIET, loadingIndicator: { variant: "label" } }],
  ["dictation only", { ...QUIET, voiceRecognition: { enabled: true } }],
  ["session voice", { ...QUIET, voiceRecognition: RUNTYPE_VOICE }],
  ["artifacts only", { ...QUIET, features: { ...QUIET.features, artifacts: { enabled: true } } }],
  ["mentions only", { ...QUIET, contextMentions: { enabled: true, sources: [] } }],
  ["everything", {
    future: { v5Defaults: true }, turnActivity: { enabled: true },
    contextMentions: { enabled: true, sources: [] }, voiceRecognition: RUNTYPE_VOICE,
  }],
];

describe("prepareRendererModules", () => {
  beforeEach(() => {
    loaded.length = 0;
  });

  it.each(CONFIGS)("loads exactly the chunks the installer preloads: %s", (_name, config) => {
    const pending = prepareRendererModules(config);
    expect(loaded).toEqual(selectRendererChunks(config));
    expect(pending).toHaveLength(loaded.length);
  });

  it("covers every renderer chunk between these configs", () => {
    const seen = new Set(CONFIGS.flatMap(([, config]) => selectRendererChunks(config)));
    expect([...seen].sort()).toEqual([...RENDERER_CHUNKS].sort());
  });
});
