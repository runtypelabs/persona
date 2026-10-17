// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as activity from "./activity-ui";
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
