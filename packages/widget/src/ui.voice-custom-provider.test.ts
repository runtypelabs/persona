// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createAgentExperience } from "./ui";
import type { VoiceProvider, VoiceStatus } from "./types";

const controllers: ReturnType<typeof createAgentExperience>[] = [];
beforeEach(() => { window.scrollTo = vi.fn(); });
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.destroy();
  document.body.innerHTML = "";
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

function fixture(mode: "none" | "cancel" | "barge-in" = "cancel") {
  let statusCallback: (status: VoiceStatus) => void = () => {};
  let transcriptCallback: NonNullable<Parameters<NonNullable<VoiceProvider["onTranscript"]>>[0]> = () => {};
  let active = false;
  const provider: VoiceProvider = {
    type: "runtype",
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => { active = false; }),
    startListening: vi.fn(async () => { active = true; statusCallback("listening"); }),
    stopListening: vi.fn(async () => { active = false; statusCallback("idle"); }),
    onResult: vi.fn(),
    onError: vi.fn(),
    onStatusChange: callback => { statusCallback = callback; },
    onTranscript: callback => { transcriptCallback = callback; },
    getInterruptionMode: () => mode,
    isBargeInActive: () => active,
    stopPlayback: vi.fn(() => { statusCallback("listening"); }),
    deactivateBargeIn: vi.fn(async () => { active = false; statusCallback("idle"); }),
  };
  const recognition = vi.fn();
  vi.stubGlobal("SpeechRecognition", recognition);
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  const controller = createAgentExperience(mount, {
    apiUrl: "https://api.example.test/chat",
    launcher: { enabled: false }, persistState: false, suggestionChips: [],
    voiceRecognition: { enabled: true, provider: { type: "custom", custom: () => provider } },
  });
  controllers.push(controller);
  const mic = () => mount.querySelector<HTMLButtonElement>("[data-persona-composer-mic]")!;
  return { provider, recognition, mic, controller, emit: (status: VoiceStatus) => statusCallback(status),
    transcript: (role: "user" | "assistant", text: string, final = true, turnId?: string) => transcriptCallback(role, text, final, { turnId }) };
}

it("starts the custom provider from the microphone and cancels playback without hanging up", async () => {
  const { provider, recognition, mic, emit } = fixture();
  mic().click();
  await vi.waitFor(() => expect(provider.startListening).toHaveBeenCalledOnce());
  expect(recognition).not.toHaveBeenCalled();
  emit("speaking");
  expect(mic().getAttribute("aria-label")).toBe("Stop playback and re-record");
  mic().click();
  expect(provider.stopPlayback).toHaveBeenCalledOnce();
  expect(provider.stopListening).not.toHaveBeenCalled();
  expect(provider.deactivateBargeIn).not.toHaveBeenCalled();
});

it("respects none mode and cleans up the custom provider on destroy", async () => {
  const { provider, mic, emit, controller } = fixture("none");
  mic().click();
  await vi.waitFor(() => expect(provider.startListening).toHaveBeenCalledOnce());
  emit("speaking");
  mic().click();
  expect(provider.stopPlayback).not.toHaveBeenCalled();
  expect(provider.stopListening).not.toHaveBeenCalled();
  controller.destroy();
  controllers.splice(controllers.indexOf(controller), 1);
  expect(provider.disconnect).toHaveBeenCalled();
});

it("hangs up a barge-in custom call through the microphone control", async () => {
  const { provider, mic, emit } = fixture("barge-in");
  mic().click();
  await vi.waitFor(() => expect(provider.startListening).toHaveBeenCalledOnce());
  emit("speaking");
  mic().click();
  await vi.waitFor(() => expect(provider.deactivateBargeIn).toHaveBeenCalledOnce());
});

it("routes controller start and stop to the custom provider after a composer update", async () => {
  const { provider, recognition, controller, mic, emit } = fixture();
  controller.update({ voiceRecognition: { enabled: false } });
  controller.update({ voiceRecognition: { enabled: true } });
  expect(mic()).not.toBeNull();
  await controller.startVoiceRecognition();
  await vi.waitFor(() => expect(provider.startListening).toHaveBeenCalledOnce());
  emit("speaking");
  await controller.stopVoiceRecognition();
  expect(provider.deactivateBargeIn).toHaveBeenCalledOnce();
  expect(recognition).not.toHaveBeenCalled();
});

it.each(["cancel", "barge-in"] as const)("settles a pending assistant placeholder after %s during thinking", async (mode) => {
  const { provider, mic, emit, transcript, controller } = fixture(mode);
  mic().click();
  await vi.waitFor(() => expect(provider.startListening).toHaveBeenCalledOnce());
  emit("processing");
  transcript("user", "Tell me a story");
  expect(controller.getMessages().some(message => message.streaming)).toBe(true);
  if (mode === "cancel") mic().click();
  else emit("listening");
  expect(controller.getMessages().map(message => message.content)).toEqual(["Tell me a story"]);
  expect(controller.getMessages().some(message => message.streaming || message.voiceProcessing)).toBe(false);
  transcript("user", "Next question");
  transcript("assistant", "Next answer");
  expect(controller.getMessages().map(message => message.content)).toEqual(["Tell me a story", "Next question", "Next answer"]);
});

it("preserves partial voice content while clearing its streaming flags on hangup", async () => {
  const { provider, mic, emit, transcript, controller } = fixture("barge-in");
  mic().click();
  await vi.waitFor(() => expect(provider.startListening).toHaveBeenCalledOnce());
  transcript("user", "Explain");
  transcript("assistant", "A partial answer", false);
  emit("speaking");
  mic().click();
  expect(controller.getMessages().at(-1)).toMatchObject({ content: "A partial answer", streaming: false, voiceProcessing: false });
});

it("keeps the current user partial in one bubble when playback returns to listening", async () => {
  const { provider, mic, emit, transcript, controller } = fixture();
  mic().click();
  await vi.waitFor(() => expect(provider.startListening).toHaveBeenCalledOnce());
  transcript("user", "Hello");
  transcript("assistant", "Hi");
  transcript("user", "Next", false);
  emit("listening");
  transcript("user", "Next question");
  transcript("assistant", "Next answer");
  expect(controller.getMessages().filter(message => message.role === "user").map(message => message.content)).toEqual(["Hello", "Next question"]);
});

it("drops a cancelled reply arriving after a newer identified turn", async () => {
  const { provider, mic, emit, transcript, controller } = fixture();
  mic().click();
  await vi.waitFor(() => expect(provider.startListening).toHaveBeenCalledOnce());
  transcript("user", "Old question", true, "old");
  emit("processing");
  mic().click();
  transcript("assistant", "Old partial", false, "old");
  transcript("user", "New question", true, "new");
  transcript("assistant", "Cancelled old answer", true, "old");
  transcript("assistant", "New answer", true, "new");
  expect(controller.getMessages().map(message => message.content)).toEqual(["Old question", "New question", "New answer"]);
});

it("ignores untagged cancelled output until the next user final without losing that next answer", async () => {
  const { provider, mic, emit, transcript, controller } = fixture();
  mic().click();
  await vi.waitFor(() => expect(provider.startListening).toHaveBeenCalledOnce());
  transcript("user", "Old question");
  emit("processing");
  mic().click();
  transcript("assistant", "Cancelled answer");
  transcript("user", "New question");
  transcript("assistant", "New answer");
  expect(controller.getMessages().map(message => message.content)).toEqual(["Old question", "New question", "New answer"]);
});

it("disconnects the old provider before constructing its replacement and ignores its stale callbacks", async () => {
  const { provider, mic, controller, transcript, emit } = fixture();
  mic().click();
  await vi.waitFor(() => expect(provider.startListening).toHaveBeenCalledOnce());
  let finishDisconnect!: () => void;
  vi.mocked(provider.disconnect).mockImplementation(() => new Promise<void>(resolve => { finishDisconnect = resolve; }));
  const replacement = { ...provider, connect: vi.fn(async () => {}), startListening: vi.fn(async () => {}), disconnect: vi.fn(async () => {}) };
  const factory = vi.fn(() => replacement);
  controller.update({ voiceRecognition: { enabled: true, provider: { type: "custom", custom: factory } } });
  expect(provider.disconnect).toHaveBeenCalledOnce();
  expect(controller.isVoiceActive()).toBe(false);
  expect(factory).not.toHaveBeenCalled();
  transcript("assistant", "Stale reply");
  emit("speaking");
  expect(controller.getMessages()).toEqual([]);
  finishDisconnect();
  await controller.startVoiceRecognition();
  await vi.waitFor(() => expect(replacement.startListening).toHaveBeenCalledOnce());
  expect(factory).toHaveBeenCalledOnce();
});

it("disconnects a live call when disabled and reinstalls the provider on reenable", async () => {
  const { provider, mic, controller } = fixture();
  mic().click();
  await vi.waitFor(() => expect(provider.startListening).toHaveBeenCalledOnce());
  controller.update({ voiceRecognition: { enabled: false } });
  expect(provider.disconnect).toHaveBeenCalledOnce();
  expect(controller.isVoiceActive()).toBe(false);
  controller.update({ voiceRecognition: { enabled: true } });
  await controller.startVoiceRecognition();
  await vi.waitFor(() => expect(provider.startListening).toHaveBeenCalledTimes(2));
});

it("sets up custom voice after starting with browser dictation and preserves it for cosmetic updates", async () => {
  const { provider, controller } = fixture();
  await controller.startVoiceRecognition();
  await vi.waitFor(() => expect(provider.startListening).toHaveBeenCalledOnce());
  controller.update({ voiceRecognition: { provider: { type: "browser" } } });
  expect(provider.disconnect).toHaveBeenCalledOnce();
  expect(controller.isVoiceActive()).toBe(false);
  vi.mocked(provider.startListening).mockClear();
  controller.update({ voiceRecognition: { provider: { type: "custom", custom: () => provider } } });
  await controller.startVoiceRecognition();
  await vi.waitFor(() => expect(provider.startListening).toHaveBeenCalledOnce());
  controller.update({ voiceRecognition: { iconName: "mic" }, colorScheme: "dark" });
  expect(provider.disconnect).toHaveBeenCalledOnce();
});
