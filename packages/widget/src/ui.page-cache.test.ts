// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createAgentExperience } from "./ui";
import type { AgentWidgetConfig, SpeechEngine, VoiceProvider, VoiceResult, VoiceStatus } from "./types";

const controllers: ReturnType<typeof createAgentExperience>[] = [];
beforeEach(() => { window.scrollTo = vi.fn(); });
afterEach(() => {
  controllers.splice(0).forEach(controller => controller.destroy());
  document.body.replaceChildren();
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function mount(config: AgentWidgetConfig = {}) {
  const element = document.createElement("div");
  document.body.append(element);
  const controller = createAgentExperience(element, {
    apiUrl: "/local-chat", launcher: { enabled: false }, persistState: false,
    suggestionChips: [], ...config,
  });
  controllers.push(controller);
  return { controller, element };
}
const transition = (name: "pagehide" | "pageshow", persisted = true) =>
  window.dispatchEvent(new PageTransitionEvent(name, { persisted }));

function voice() {
  let active = false;
  let status: (status: VoiceStatus) => void = () => {};
  let result: (result: VoiceResult) => void = () => {};
  const provider: VoiceProvider = {
    type: "custom", connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => { active = false; }),
    startListening: vi.fn(async () => { active = true; status("listening"); }),
    stopListening: vi.fn(async () => { active = false; status("idle"); }),
    onStatusChange: callback => { status = callback; },
    onResult: callback => { result = callback; }, onError: () => {},
    isBargeInActive: () => active,
  };
  return { provider, result: (text: string) => result({ text, isFinal: true, provider: "custom" }) };
}

it("aborts an active reply while retaining the same transcript and draft through repeated Back restores", async () => {
  const signals: AbortSignal[] = [];
  const customFetch = vi.fn((_url, init) => {
    const signal = init!.signal!;
    signals.push(signal);
    return new Promise<Response>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("Stopped", "AbortError")), { once: true });
    });
  });
  const { controller, element } = mount({ customFetch });
  for (let cycle = 0; cycle < 3; cycle++) {
    expect(controller.submitMessage(`Question ${cycle}`)).toBe(true);
    await vi.waitFor(() => expect(signals).toHaveLength(cycle + 1));
    const input = element.querySelector<HTMLTextAreaElement>("[data-persona-composer-input]")!;
    input.value = "Keep this draft";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    transition("pagehide");
    expect(signals[cycle].aborted).toBe(true);
    expect(controller.getState().streaming).toBe(false);
    transition("pageshow");
    expect(element.querySelector("[data-persona-composer-input]")).toBe(input);
    expect(controller.getComposerState().text).toBe("Keep this draft");
    expect(controller.getMessages().some(message => message.content === `Question ${cycle}`)).toBe(true);
    await Promise.resolve();
    expect(customFetch).toHaveBeenCalledTimes(cycle + 1);
  }
});

it("disconnects session voice on cached hide and keeps the controls usable without restarting the call", async () => {
  const { provider } = voice();
  const { controller } = mount({ voiceRecognition: { enabled: true, provider: { type: "custom", custom: () => provider } } });
  for (let cycle = 0; cycle < 2; cycle++) {
    controller.startVoiceRecognition();
    await vi.waitFor(() => expect(provider.startListening).toHaveBeenCalledTimes(cycle + 1));
    transition("pagehide");
    expect(provider.disconnect).toHaveBeenCalledTimes(cycle + 1);
    expect(controller.isVoiceActive()).toBe(false);
    transition("pageshow");
    await Promise.resolve();
    expect(provider.startListening).toHaveBeenCalledTimes(cycle + 1);
  }
});

it("does not let a pending microphone start cross a cached navigation", async () => {
  const { provider } = voice();
  const { controller } = mount({ voiceRecognition: { enabled: true, provider: { type: "custom", custom: () => provider } } });
  controller.startVoiceRecognition();
  transition("pagehide");
  transition("pageshow");
  await new Promise(resolve => setTimeout(resolve, 50));
  expect(provider.startListening).not.toHaveBeenCalled();
  controller.startVoiceRecognition();
  await vi.waitFor(() => expect(provider.startListening).toHaveBeenCalledOnce());
});

it("cancels dictation without submitting its final result or losing the previous draft", async () => {
  const { provider, result } = voice();
  const { controller } = mount({ voiceRecognition: { enabled: true, completionBehavior: "review",
    dictation: { provider: { type: "custom", custom: () => provider } } } });
  controller.setMessage("Original draft");
  controller.startDictation();
  await vi.waitFor(() => expect(controller.getDictationState().phase).toBe("recording"));
  transition("pagehide");
  result("Late transcript");
  transition("pageshow");
  await vi.waitFor(() => expect(provider.disconnect).toHaveBeenCalled());
  expect(controller.getDictationState().phase).toBe("idle");
  expect(controller.getComposerState().text).toBe("Original draft");
  expect(controller.getMessages()).toHaveLength(0);
});

it("stops browser recognition without accepting a trailing result and can record again on Back", () => {
  const recordings: Recognition[] = [];
  class Recognition {
    onresult: ((event: unknown) => void) | null = null;
    onend: (() => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    start = vi.fn();
    stop = vi.fn();
    constructor() { recordings.push(this); }
  }
  vi.stubGlobal("SpeechRecognition", Recognition);
  const { controller } = mount({ voiceRecognition: { enabled: true } });
  controller.setMessage("Keep my draft");
  expect(controller.startVoiceRecognition()).toBe(true);
  expect(recordings[0].start).toHaveBeenCalledOnce();
  transition("pagehide");
  expect(recordings[0].stop).toHaveBeenCalledOnce();
  recordings[0].onresult?.({ results: [Object.assign([{ transcript: "Late result" }], { isFinal: true })] });
  transition("pageshow");
  expect(controller.getComposerState().text).toBe("Keep my draft");
  expect(controller.startVoiceRecognition()).toBe(true);
  expect(recordings[1].start).toHaveBeenCalledOnce();
  expect(controller.getMessages()).toHaveLength(0);
});

it("stops read-aloud playback on cached hide and does not resume it on Back", async () => {
  const engine: SpeechEngine = { id: "cache-test", supportsPause: false,
    speak: vi.fn((_request, callbacks) => { callbacks.onStart?.(); }),
    stop: vi.fn(), pause: vi.fn(), resume: vi.fn(),
  };
  const { controller } = mount({ textToSpeech: { enabled: true, createEngine: () => engine } });
  const message = controller.injectAssistantMessage({ content: "Read this reply aloud." });
  controller.toggleReadAloud(message.id);
  await vi.waitFor(() => expect(controller.getReadAloudState(message.id)).toBe("playing"));
  transition("pagehide");
  expect(engine.stop).toHaveBeenCalled();
  expect(controller.getReadAloudState(message.id)).toBe("idle");
  transition("pageshow");
  await Promise.resolve();
  expect(engine.speak).toHaveBeenCalledOnce();
});

it("abandons an asynchronous before-send hook and leaves its draft sendable after Back", async () => {
  let finishHook: () => void = () => {};
  let signal: AbortSignal | undefined;
  const hook = vi.fn((_snapshot, context) => {
    signal = context.signal;
    return new Promise<void>(resolve => { finishHook = resolve; });
  });
  const customFetch = vi.fn(async () => new Response("", { headers: { "content-type": "text/event-stream" } }));
  const { controller, element } = mount({ composer: { onBeforeSend: hook }, customFetch });
  controller.setMessage("Unsent draft");
  element.querySelector<HTMLButtonElement>("[data-persona-composer-submit]")!.click();
  await vi.waitFor(() => expect(hook).toHaveBeenCalledOnce());
  transition("pagehide");
  expect(signal?.aborted).toBe(true);
  transition("pageshow");
  expect(customFetch).not.toHaveBeenCalled();
  expect(controller.getComposerState().text).toBe("Unsent draft");
  let finishNext: () => void = () => {};
  const nextHook = vi.fn(() => new Promise<void>(resolve => { finishNext = resolve; }));
  controller.update({ composer: { onBeforeSend: nextHook } });
  element.querySelector<HTMLButtonElement>("[data-persona-composer-submit]")!.click();
  await vi.waitFor(() => expect(nextHook).toHaveBeenCalledOnce());
  finishHook();
  await Promise.resolve();
  element.querySelector<HTMLButtonElement>("[data-persona-composer-submit]")!.click();
  expect(nextHook).toHaveBeenCalledOnce();
  expect(customFetch).not.toHaveBeenCalled();
  finishNext();
  await vi.waitFor(() => expect(customFetch).toHaveBeenCalledOnce());
});

it("retains the live-call metadata used to redial on a genuine document navigation", async () => {
  const { provider } = voice();
  const { controller } = mount({ voiceRecognition: { enabled: true, provider: { type: "custom", custom: () => provider } } });
  controller.startVoiceRecognition();
  await vi.waitFor(() => expect(provider.startListening).toHaveBeenCalledOnce());
  transition("pagehide", false);
  expect(provider.disconnect).not.toHaveBeenCalled();
  controller.destroy();
  controllers.splice(controllers.indexOf(controller), 1);
  expect(provider.disconnect).toHaveBeenCalledOnce();
  expect(controller.getPersistentMetadata().voiceState).toMatchObject({ active: true });
});
