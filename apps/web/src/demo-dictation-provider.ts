import type { VoiceProvider, VoiceResult, VoiceStatus } from "@runtypelabs/persona";

/** Silent STT sample. Finish captures the current phrase; disconnect cancels it. */
export function createDemoDictationProvider(): VoiceProvider {
  let status: (value: VoiceStatus) => void = () => {};
  let result: (value: VoiceResult) => void = () => {};
  let transcript: Parameters<NonNullable<VoiceProvider["onTranscript"]>>[0] = () => {};
  let level: (value: number) => void = () => {};
  let recording = false;
  let processing = false;
  let current = "";
  let interval: ReturnType<typeof setInterval> | undefined;
  let finalTimer: ReturnType<typeof setTimeout> | undefined;
  let tick = 0;
  const words = ["Okay, I want", "Okay, I want something different", "Okay, I want something different to be done.", "Okay, I want something different to be done. And it should be simple."];
  const clearCapture = () => {
    clearInterval(interval);
    interval = undefined;
    recording = false;
    level(0);
  };
  return {
    type: "custom",
    connect: async () => { status("connected"); },
    startListening: async () => {
      if (recording || processing) return;
      recording = true;
      current = "";
      tick = 0;
      status("listening");
      interval = setInterval(() => {
        tick++;
        level(0.15 + Math.abs(Math.sin(tick * 0.65)) * 0.8);
        if (tick % 10 === 0 && tick <= words.length * 10) {
          current = words[tick / 10 - 1];
          transcript("user", current, false);
        }
      }, 100);
    },
    stopListening: async () => {
      if (!recording) return;
      clearCapture();
      processing = true;
      status("processing");
      finalTimer = setTimeout(() => {
        finalTimer = undefined;
        processing = false;
        result({ text: current, provider: "custom" });
        status("idle");
      }, 1200);
    },
    disconnect: async () => {
      clearCapture();
      clearTimeout(finalTimer);
      finalTimer = undefined;
      processing = false;
      status("disconnected");
    },
    onResult: callback => { result = callback; },
    onStatusChange: callback => { status = callback; },
    onTranscript: callback => { transcript = callback; },
    onLevel: callback => { level = callback; },
    onError: () => {},
  };
}
