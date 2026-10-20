// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAgentExperience } from "./ui";
import type { AgentWidgetConfig, VoiceProvider, VoiceStatus } from "./types";

const controllers: ReturnType<typeof createAgentExperience>[] = [];
class Recognition {
  start() {}
  stop() {}
}
beforeEach(() => { window.scrollTo = vi.fn(); vi.stubGlobal("SpeechRecognition", Recognition); });
afterEach(() => {
  controllers.splice(0).forEach(controller => controller.destroy());
  document.body.innerHTML = "";
  window.localStorage.clear();
  vi.unstubAllGlobals();
});
const fixture = (patch: Partial<AgentWidgetConfig>) => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  const controller = createAgentExperience(mount, { apiUrl: "/api", launcher: { enabled: false }, persistState: false, suggestionChips: [], ...patch });
  controllers.push(controller);
  const mic = mount.querySelector<HTMLButtonElement>("[data-persona-composer-mic]")!;
  return { controller, mount, mic };
};

describe.each([false, true])("control live updates V5=%s", v5 => {
  it("restores the current custom idle label after browser dictation", () => {
    const { controller, mic } = fixture({ future: { v5Defaults: v5 }, voiceRecognition: { enabled: true, tooltipText: "Dictate" } });
    expect(mic.getAttribute("aria-label")).toBe("Dictate");
    controller.startVoiceRecognition();
    expect(mic.getAttribute("aria-label")).toBe("Stop voice recognition");
    controller.update({ voiceRecognition: { tooltipText: "Record a note" } });
    controller.stopVoiceRecognition();
    expect(mic.getAttribute("aria-label")).toBe("Record a note");
  });

  it("keeps browser recording styles and restores current idle styling after an override reset", () => {
    const { controller, mic, mount } = fixture({ future: { v5Defaults: v5 }, voiceRecognition: { enabled: true, iconColor: "orange", recordingIconColor: "red" }, theme: { components: { voice: { control: { foreground: "green" }, recording: { indicator: "yellow" } } } } });
    controller.startVoiceRecognition();
    expect(mic.style.color).toBe("red");
    expect(mic.querySelector("svg")!.getAttribute("stroke")).toBe("currentColor");
    controller.update({ voiceRecognition: { recordingIconColor: undefined, iconColor: undefined }, colorScheme: "dark", darkTheme: { components: { voice: { recording: { indicator: "blue" }, control: { foreground: "purple" } } } } });
    expect(mic.getAttribute("data-state")).toBe("recording");
    expect(mic.getAttribute("aria-label")).toBe("Stop voice recognition");
    expect(mic.style.color).toContain("voice-recording-indicator");
    expect(mount.style.getPropertyValue("--persona-voice-recording-indicator")).toBe("blue");
    controller.stopVoiceRecognition();
    expect(mic.getAttribute("data-state")).toBe("idle");
    expect(mic.style.color).toContain("voice-control-foreground");
    expect(mount.style.getPropertyValue("--persona-components-voice-control-foreground")).toBe("purple");
  });

  it.each(["none", "cancel", "barge-in"] as const)("styles custom-provider states under %s, preserving labels and current idle theme", async mode => {
    let emit: (status: VoiceStatus) => void = () => {};
    const provider: VoiceProvider = {
      type: "runtype", connect: vi.fn(async () => {}), disconnect: vi.fn(async () => {}), startListening: vi.fn(async () => { emit("listening"); }), stopListening: vi.fn(async () => { emit("idle"); }), onResult: vi.fn(), onError: vi.fn(), onStatusChange: callback => { emit = callback; }, getInterruptionMode: () => mode,
    };
    const { controller, mic, mount } = fixture({ future: { v5Defaults: v5 }, voiceRecognition: { enabled: true, provider: { type: "custom", custom: () => provider } }, theme: { components: { voice: { control: { foreground: "green" }, processing: { icon: "orange", background: "red" }, speaking: { icon: "blue", background: "yellow", border: "pink" } } } } });
    await controller.startVoiceRecognition();
    await vi.waitFor(() => expect(provider.startListening).toHaveBeenCalledOnce());
    emit("processing");
    expect(mic.style.color).toContain("consumer-voice-processing-icon");
    expect(mount.style.getPropertyValue("--persona-consumer-voice-processing-icon")).toBe("orange");
    emit("speaking");
    const label = mic.getAttribute("aria-label");
    expect(mic.style.backgroundColor).toContain("components-voice-speaking-background");
    expect(mic.querySelector("svg")!.getAttribute("stroke")).toBe("currentColor");
    controller.update({ colorScheme: "dark", darkTheme: { components: { voice: { speaking: { icon: "purple" }, control: { foreground: "white" } } } } });
    expect(mic.getAttribute("data-state")).toBe("speaking");
    expect(mic.getAttribute("aria-label")).toBe(label);
    expect(mount.style.getPropertyValue("--persona-consumer-voice-speaking-icon")).toBe("purple");
    controller.update({ voiceRecognition: { tooltipText: "Dictate" } });
    emit("idle");
    expect(mic.style.color).toContain("voice-control-foreground");
    expect(mic.style.cursor).toBe("");
    expect(mic.getAttribute("aria-label")).toBe("Dictate");
  });
});
