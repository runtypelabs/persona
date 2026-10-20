// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as activity from "./activity-ui";
import * as loadingLabels from "./loading-label-runtime";
import * as dictation from "./dictation-runtime";
import type { createAgentExperience } from "./ui";

let controller: ReturnType<typeof createAgentExperience> | undefined;
beforeEach(() => { vi.resetModules(); window.scrollTo = vi.fn(); });
afterEach(() => { controller?.destroy(); controller = undefined; document.body.replaceChildren(); vi.unstubAllGlobals(); });
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const pending = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};

it("renders the latest tool state after activity code arrives", async () => {
  const load = pending<typeof activity>();
  const { setActivityUiLoader } = await import("./activity-ui-loader");
  setActivityUiLoader(() => load.promise);
  const { createAgentExperience } = await import("./ui");
  const mount = document.createElement("div");
  document.body.append(mount);
  controller = createAgentExperience(mount, {
    apiUrl: "/chat", launcher: { enabled: false }, persistState: false,
    features: { toolCallDisplay: { grouped: false, variant: "row" } },
  });
  const message = { id: "tool", role: "assistant" as const, content: "", createdAt: "2026-10-15", variant: "tool" as const };
  controller.injectTestMessage({ type: "message", message: { ...message, toolCall: { id: "tool", name: "Search", status: "running", chunks: ["old"] } } });
  controller.injectTestMessage({ type: "message", message: { ...message, toolCall: { id: "tool", name: "Search", status: "complete", chunks: ["latest"] } } });
  load.resolve(activity);
  await controller.ready;
  const row = mount.querySelector<HTMLElement>('[data-message-id="tool"]')!;
  expect(row.textContent).toContain("latest");
  expect(row.textContent).not.toContain("old");
  expect(row.querySelector("svg")).not.toBeNull();
});

it("keeps the existing UI visible during preparation of a newly enabled renderer", async () => {
  const load = pending<typeof activity>();
  const { setActivityUiLoader } = await import("./activity-ui-loader");
  const fetch = vi.fn(() => load.promise);
  setActivityUiLoader(fetch);
  const { createAgentExperience } = await import("./ui");
  const mount = document.createElement("div"); document.body.append(mount);
  controller = createAgentExperience(mount, {
    apiUrl: "/chat", launcher: { enabled: false }, persistState: false,
    features: { showToolCalls: false, showReasoning: false },
  });
  await controller.ready;
  expect(fetch).not.toHaveBeenCalled();
  controller.update({ features: { showToolCalls: true } });
  expect(fetch).toHaveBeenCalledOnce();
  expect(mount.hasAttribute("data-persona-preparing")).toBe(false);
  expect(mount.inert).not.toBe(true);
  // Cancelling the configuration must not wait on the obsolete download.
  controller.update({ features: { showToolCalls: false } });
  await controller.ready;
  load.resolve(activity);
  await flush();
  expect(mount.hasAttribute("data-persona-preparing")).toBe(false);
});

it("starts browser recognition synchronously and ignores queued results after stop", async () => {
  const load = pending<typeof dictation>();
  const { setDictationRuntimeLoader } = await import("./dictation-runtime-loader");
  setDictationRuntimeLoader(() => load.promise);
  const instances: Recognition[] = [];
  class Recognition {
    onresult?: (event: unknown) => void;
    onend?: () => void;
    start = vi.fn(); stop = vi.fn();
    constructor() { instances.push(this); }
  }
  vi.stubGlobal("SpeechRecognition", Recognition);
  const { createAgentExperience } = await import("./ui");
  const mount = document.createElement("div"); document.body.append(mount);
  controller = createAgentExperience(mount, {
    apiUrl: "/chat", launcher: { enabled: false }, persistState: false,
    voiceRecognition: { enabled: true, completionBehavior: "review" },
  });
  expect(controller.startVoiceRecognition()).toBe(true);
  expect(instances[0].start).toHaveBeenCalledOnce();
  instances[0].onresult?.({ results: [{ isFinal: true, 0: { transcript: "obsolete" } }] });
  controller.stopVoiceRecognition();
  load.resolve(dictation);
  await flush();
  const editor = mount.querySelector<HTMLTextAreaElement>("[data-persona-composer-input]")!;
  expect(editor.value).toBe("");
  expect(controller.startVoiceRecognition()).toBe(true);
  instances[1].onresult?.({ results: [{ isFinal: true, 0: { transcript: "current" } }] });
  expect(editor.value).toBe("current ");
});

it('adopts one lifecycle per widget after activity readiness and ignores a destroyed waiter', async () => {
  const load = pending<typeof activity>();
  const createLifecycle = vi.fn(activity.createActivityLifecycle);
  const { setActivityUiLoader } = await import('./activity-ui-loader');
  setActivityUiLoader(() => load.promise);
  const { createAgentExperience } = await import('./ui');
  const firstMount = document.createElement('div'); document.body.append(firstMount);
  const first = createAgentExperience(firstMount, { apiUrl: '/chat', launcher: { enabled: false }, persistState: false });
  first.destroy();
  const mount = document.createElement('div'); document.body.append(mount);
  controller = createAgentExperience(mount, { apiUrl: '/chat', launcher: { enabled: false }, persistState: false,
    features: { toolCallDisplay: { grouped: false, variant: 'row', autoExpand: true } } });
  const message = { id: 'tool', role: 'assistant' as const, content: '', createdAt: 'now', variant: 'tool' as const,
    toolCall: { id: 'tool', name: 'Search', status: 'running' as const, chunks: ['content'] } };
  controller.injectTestMessage({ type: 'message', message });
  expect(createLifecycle).not.toHaveBeenCalled();
  load.resolve({ ...activity, createActivityLifecycle: createLifecycle });
  await controller.ready; await flush();
  expect(createLifecycle).toHaveBeenCalledTimes(1);
  expect(mount.querySelector('[data-message-id="tool"] button')?.getAttribute('aria-expanded')).toBe('true');
  controller.injectTestMessage({ type: 'message', message: { ...message, toolCall: { ...message.toolCall, chunks: ['new content'] } } });
  expect(createLifecycle).toHaveBeenCalledTimes(1);
});

it.each([undefined, 'none'] as const)('prepares loading-label code only for animated text-only waiting labels (%s)', async animation => {
  const { setLoadingLabelRuntimeLoader } = await import('./loading-label-runtime-loader');
  const { setActivityUiLoader } = await import('./activity-ui-loader');
  const activityLoad = vi.fn(async () => activity); setActivityUiLoader(activityLoad);
  const load = vi.fn(async () => loadingLabels); setLoadingLabelRuntimeLoader(load);
  const { createAgentExperience } = await import('./ui');
  const mount = document.createElement('div'); document.body.append(mount);
  controller = createAgentExperience(mount, { apiUrl: '/chat', launcher: { enabled: false }, persistState: false,
    future: { v5Defaults: true }, features: { showToolCalls: false, showReasoning: false, artifacts: { enabled: false } },
    loadingLabel: { animation, animate: vi.fn() } });
  await controller.ready;
  expect(load).toHaveBeenCalledTimes(animation === 'none' ? 0 : 1);
  expect(activityLoad).not.toHaveBeenCalled();
});

it('prepares the whole-turn renderer before revealing progress-only history', async () => {
  const turn = await import('./turn-activity-ui');
  const load = pending<typeof turn>();
  const { setTurnActivityUiLoader } = await import('./turn-activity-ui-loader');
  const { setActivityUiLoader } = await import('./activity-ui-loader');
  setTurnActivityUiLoader(() => load.promise); setActivityUiLoader(async () => activity);
  const { createAgentExperience } = await import('./ui');
  const mount = document.createElement('div'); document.body.append(mount);
  controller = createAgentExperience(mount, { apiUrl:'/chat', launcher:{enabled:false}, persistState:false,
    voiceRecognition:{enabled:false}, features:{showToolCalls:false,showReasoning:false,artifacts:{enabled:false}},
    turnActivity:{enabled:true}, initialMessages:[{id:'progress',role:'assistant',content:'Historical work',createdAt:'2026-01-01',turnActivity:{id:'history',kind:'progress'}}] });
  expect(mount.hasAttribute('data-persona-preparing')).toBe(true);
  load.resolve(turn); await controller.ready;
  expect(mount.hasAttribute('data-persona-preparing')).toBe(false);
  expect(mount.querySelector('[data-persona-turn-activity]')?.textContent).toContain('Historical work');
});

it('retries turn initialization when the activity dependency fails after the turn module loads', async () => {
  const turn = await import('./turn-activity-ui');
  const { setTurnActivityUiLoader, getTurnActivityUiSync } = await import('./turn-activity-ui-loader');
  const { setActivityUiLoader } = await import('./activity-ui-loader');
  setTurnActivityUiLoader(async () => turn);
  let attempts = 0; setActivityUiLoader(async () => { if (++attempts === 1) throw new Error('Activity unavailable'); return activity; });
  const { createAgentExperience } = await import('./ui');
  const mount = document.createElement('div'); document.body.append(mount);
  controller = createAgentExperience(mount, { apiUrl:'/chat', launcher:{enabled:false}, persistState:false,
    voiceRecognition:{enabled:false}, features:{showToolCalls:false,showReasoning:false,artifacts:{enabled:false}}, turnActivity:{enabled:true} });
  await expect(controller.ready).rejects.toThrow('Activity unavailable');
  expect(getTurnActivityUiSync()).toBeNull();
  controller.update({ turnActivity:{enabled:true} }); await controller.ready;
  controller.injectTestMessage({type:'message',message:{id:'progress',role:'assistant',content:'Ready after retry',createdAt:'2026-01-01',turnActivity:{id:'history',kind:'progress'}}});
  expect(mount.querySelector('[data-persona-turn-activity]')?.textContent).toContain('Ready after retry');
  expect(attempts).toBe(2);
});
