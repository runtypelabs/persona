/**
 * Mic-button state styling for session-owned voice providers (Runtype /
 * custom): recording, processing, speaking, and the reset back to idle.
 *
 * Ships in the lazy voice-runtime chunk (exported from `voice-runtime.ts`):
 * these states only arise from a provider, which `setupVoice` constructs from
 * that same chunk, so pages without session voice never download it. The UI
 * passes its live closure state through `MicStateContext`; the icon renderer
 * comes from core so this chunk never carries its own icon registry.
 */
import type { AgentWidgetConfig } from "../types";
import type { AgentWidgetSession } from "../session";

/** Snapshot of the idle mic, shared with the UI's browser-dictation path. */
export type OriginalMicStyles = {
  backgroundColor: string;
  color: string;
  borderColor: string;
  iconName: string;
  iconSize: number;
};

export type MicStateContext = {
  mic: () => HTMLButtonElement | null;
  config: () => AgentWidgetConfig;
  session: () => AgentWidgetSession;
  original: OriginalMicStyles | null;
  setMicState: (state: "idle" | "recording" | "processing" | "speaking") => void;
  renderIcon: (name: string, size: number, color: string, strokeWidth: number) => SVGElement | null;
  iconFallbackPx: number;
};

export type MicStateStyles = {
  recording: () => void;
  processing: () => void;
  speaking: () => void;
  reset: () => void;
};

export const createMicStateStyles = (ctx: MicStateContext): MicStateStyles => {
  const storeOriginalMicStyles = (micButton: HTMLButtonElement) => {
    if (ctx.original) return; // Already stored
    const voiceConfig = ctx.config().voiceRecognition ?? {};
    ctx.original = {
      backgroundColor: micButton.style.backgroundColor,
      color: micButton.style.color,
      borderColor: micButton.style.borderColor,
      iconName: voiceConfig.iconName ?? "mic",
      iconSize: parseFloat(voiceConfig.iconSize ?? "") || ctx.iconFallbackPx,
    };
  };

  /** Swap the mic button's SVG icon */
  const swapMicIcon = (micButton: HTMLButtonElement, iconName: string, color: string) => {
    const existingSvg = micButton.querySelector("svg");
    if (existingSvg) existingSvg.remove();
    const size =
      ctx.original?.iconSize ??
      (parseFloat(ctx.config().voiceRecognition?.iconSize ?? "") || ctx.iconFallbackPx);
    const newSvg = ctx.renderIcon(iconName, size, color, 1.5);
    if (newSvg) micButton.appendChild(newSvg);
  };

  /** Remove all voice state CSS classes */
  const removeAllVoiceStateClasses = (micButton: HTMLButtonElement) => {
    micButton.classList.remove("persona-voice-recording", "persona-voice-processing", "persona-voice-speaking");
  };

  const recording = () => {
    const micButton = ctx.mic();
    if (!micButton) return;
    storeOriginalMicStyles(micButton);
    const voiceConfig = ctx.config().voiceRecognition ?? {};
    const recordingBackgroundColor = voiceConfig.recordingBackgroundColor;
    const recordingIconColor = voiceConfig.recordingIconColor;
    const recordingBorderColor = voiceConfig.recordingBorderColor;
    removeAllVoiceStateClasses(micButton);
    micButton.classList.add("persona-voice-recording");
    ctx.setMicState("recording");
    micButton.style.backgroundColor = recordingBackgroundColor ?? "var(--persona-voice-recording-bg, #ef4444)";
    micButton.style.color = recordingIconColor ?? "var(--persona-voice-recording-indicator, #ffffff)";
    if (recordingIconColor) {
      const svg = micButton.querySelector("svg");
      if (svg) svg.setAttribute("stroke", recordingIconColor);
    }
    if (recordingBorderColor) micButton.style.borderColor = recordingBorderColor;
    micButton.setAttribute("aria-label", "Stop voice recognition");
  };

  const processing = () => {
    const micButton = ctx.mic();
    if (!micButton) return;
    storeOriginalMicStyles(micButton);
    const voiceConfig = ctx.config().voiceRecognition ?? {};
    const interruptionMode = ctx.session().getVoiceInterruptionMode();
    const originalMicStyles = ctx.original;
    const iconName = voiceConfig.processingIconName ?? "loader";
    const iconColor = voiceConfig.processingIconColor ?? originalMicStyles?.color ?? "";
    const bgColor = voiceConfig.processingBackgroundColor ?? originalMicStyles?.backgroundColor ?? "";
    const borderColor = voiceConfig.processingBorderColor ?? originalMicStyles?.borderColor ?? "";

    removeAllVoiceStateClasses(micButton);
    micButton.classList.add("persona-voice-processing");
    ctx.setMicState("processing");
    micButton.style.backgroundColor = bgColor;
    micButton.style.borderColor = borderColor;
    const resolvedColor = iconColor || "currentColor";
    micButton.style.color = resolvedColor;
    swapMicIcon(micButton, iconName, resolvedColor);
    micButton.setAttribute("aria-label", "Processing voice input");
    // In "none" mode the button is not actionable during processing
    if (interruptionMode === "none") {
      micButton.style.cursor = "default";
    }
  };

  const speaking = () => {
    const micButton = ctx.mic();
    if (!micButton) return;
    storeOriginalMicStyles(micButton);
    const voiceConfig = ctx.config().voiceRecognition ?? {};
    const interruptionMode = ctx.session().getVoiceInterruptionMode();
    const originalMicStyles = ctx.original;
    // Default icon depends on interruption mode:
    // "square" for cancel, "mic" for barge-in (hot mic), "volume-2" otherwise
    const defaultSpeakingIcon = interruptionMode === "cancel" ? "square"
      : interruptionMode === "barge-in" ? "mic"
      : "volume-2";
    const iconName = voiceConfig.speakingIconName ?? defaultSpeakingIcon;
    const iconColor = voiceConfig.speakingIconColor
      ?? (interruptionMode === "barge-in" ? (voiceConfig.recordingIconColor ?? originalMicStyles?.color ?? "") : (originalMicStyles?.color ?? ""));
    const bgColor = voiceConfig.speakingBackgroundColor
      ?? (interruptionMode === "barge-in" ? (voiceConfig.recordingBackgroundColor ?? "var(--persona-voice-recording-bg, #ef4444)") : (originalMicStyles?.backgroundColor ?? ""));
    const borderColor = voiceConfig.speakingBorderColor
      ?? (interruptionMode === "barge-in" ? (voiceConfig.recordingBorderColor ?? "") : (originalMicStyles?.borderColor ?? ""));

    removeAllVoiceStateClasses(micButton);
    micButton.classList.add("persona-voice-speaking");
    ctx.setMicState("speaking");
    micButton.style.backgroundColor = bgColor;
    micButton.style.borderColor = borderColor;
    const resolvedColor = iconColor || "currentColor";
    micButton.style.color = resolvedColor;
    swapMicIcon(micButton, iconName, resolvedColor);

    // aria-label varies by interruption mode
    const ariaLabel = interruptionMode === "cancel"
      ? "Stop playback and re-record"
      : interruptionMode === "barge-in"
      ? "Speak to interrupt"
      : "Agent is speaking";
    micButton.setAttribute("aria-label", ariaLabel);
    // In "none" mode the button is not actionable during speaking
    if (interruptionMode === "none") {
      micButton.style.cursor = "default";
    }
    // In "barge-in" mode, add recording class to show mic is hot
    if (interruptionMode === "barge-in") {
      micButton.classList.add("persona-voice-recording");
    }
  };

  /** Restore mic button to idle state (icon, colors, aria-label, cursor) */
  const reset = () => {
    const micButton = ctx.mic();
    if (!micButton) return;
    removeAllVoiceStateClasses(micButton);
    ctx.setMicState("idle");
    const originalMicStyles = ctx.original;
    if (originalMicStyles) {
      micButton.style.backgroundColor = originalMicStyles.backgroundColor ?? "";
      micButton.style.color = originalMicStyles.color ?? "";
      micButton.style.borderColor = originalMicStyles.borderColor ?? "";
      swapMicIcon(micButton, originalMicStyles.iconName, originalMicStyles.color || "currentColor");
      ctx.original = null;
    }
    micButton.style.cursor = "";
    micButton.setAttribute("aria-label", "Start voice recognition");
  };

  return { recording, processing, speaking, reset };
};
