/**
 * Mic-button state styling for session-owned voice providers (Runtype /
 * custom): recording, processing, speaking, and the reset back to idle.
 *
 * Ships in the lazy voice-runtime chunk (exported from `voice-runtime.ts`):
 * these states only arise from a provider, which `setupVoice` constructs from
 * that same chunk, so pages without session voice never download it. The UI
 * passes live state through `MicStateContext`; core's control recipe owns
 * icons and colors, including theme changes made while voice is active.
 */
import type { AgentWidgetConfig } from "../types";
import type { AgentWidgetSession } from "../session";

export type MicStateContext = {
  mic: () => HTMLButtonElement | null;
  config: () => AgentWidgetConfig;
  session: () => AgentWidgetSession;
  setMicState: (state: "idle" | "recording" | "processing" | "speaking") => void;
};

export type MicStateStyles = {
  recording: () => void;
  processing: () => void;
  speaking: () => void;
  reset: () => void;
};

export const createMicStateStyles = (ctx: MicStateContext): MicStateStyles => {
  const removeAllVoiceStateClasses = () => {
    const micButton = ctx.mic();
    micButton?.classList.remove("persona-voice-recording", "persona-voice-processing", "persona-voice-speaking");
  };

  const recording = () => {
    const micButton = ctx.mic();
    removeAllVoiceStateClasses();
    micButton?.classList.add("persona-voice-recording");
    ctx.setMicState("recording");
    micButton?.setAttribute("aria-label", "Stop voice recognition");
  };

  const processing = () => {
    const micButton = ctx.mic();
    removeAllVoiceStateClasses();
    micButton?.classList.add("persona-voice-processing");
    ctx.setMicState("processing");
    micButton?.setAttribute("aria-label", "Processing voice input");
    if (micButton && ctx.session().getVoiceInterruptionMode() === "none") micButton.style.cursor = "default";
  };

  const speaking = () => {
    const micButton = ctx.mic();
    const mode = ctx.session().getVoiceInterruptionMode();
    removeAllVoiceStateClasses();
    micButton?.classList.add("persona-voice-speaking");
    if (mode === "barge-in") micButton?.classList.add("persona-voice-recording");
    ctx.setMicState("speaking");
    micButton?.setAttribute("aria-label", mode === "cancel" ? "Stop playback and re-record" : mode === "barge-in" ? "Speak to interrupt" : "Agent is speaking");
    if (micButton && mode === "none") micButton.style.cursor = "default";
  };

  /** Restoration reads current config, so a theme/config change while active survives. */
  const reset = () => {
    const micButton = ctx.mic();
    removeAllVoiceStateClasses();
    ctx.setMicState("idle");
    if (micButton) {
      micButton.style.cursor = "";
      micButton.setAttribute("aria-label", ctx.config().voiceRecognition?.tooltipText ?? "Start voice recognition");
    }
  };

  return { recording, processing, speaking, reset };
};
