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
  return { provider, recognition, mic, controller, emit: (status: VoiceStatus) => statusCallback(status) };
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
