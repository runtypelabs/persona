// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mergeWithDefaults } from "../defaults";
import { mergeConfigUpdate } from "../utils/config-merge";
import { applyHeaderControlStyle, createClearChatButton, createCloseButton, createHeaderIconButton } from "./header-parts";
import { applyMicButtonStyle, applySendButtonStyle, createMicButton, createSendButton } from "./composer-parts";
import type { AgentWidgetConfig } from "../types";

const theme: AgentWidgetConfig["theme"] = {
  components: {
    header: {
      close: { size: "28px", iconSize: "14px", foreground: "#aa0000", background: "#ffeeee", padding: "2px 3px", borderWidth: "2px", borderColor: "#aa0000", borderRadius: "5px", iconStrokeWidth: "3" },
      clear: { size: "36px", foreground: "#0000aa", padding: "4px 6px" },
    },
    composer: { send: { size: "44px", iconSize: "19px", foreground: "#00aa00", background: "#eeffee", padding: "3px 5px", borderWidth: "1px", borderRadius: "8px", iconStrokeWidth: "4" } },
    voice: { control: { size: "48px", iconSize: "22px", foreground: "#aa00aa", background: "#ffeeff", borderColor: "#550055", padding: "2px 4px", borderRadius: "10px" }, processing: { icon: "#ffaa00", background: "#000011", border: "#bb0000" }, speaking: { icon: "#00ffff", background: "#222222", border: "#333333" }, recording: { indicator: "#ffffff", background: "#ff0000", border: "#ffaa00" } },
  },
};

const config = (v5Defaults: boolean, patch: Partial<AgentWidgetConfig> = {}) => mergeWithDefaults({ apiUrl: "/api", future: { v5Defaults }, voiceRecognition: { enabled: true, provider: { type: "runtype" } }, theme, ...patch });

describe.each([false, true])("independent controls V5=%s", (v5) => {
  it("scopes theme leaves to each sibling and keeps other header actions untouched", () => {
    const input = config(v5);
    const close = createCloseButton(input).button;
    const clear = createClearChatButton(input).button;
    const messages = createHeaderIconButton({ ariaLabel: "Messages", iconName: "history" }).button;
    const send = createSendButton(input).button;
    const mic = createMicButton(input)!.button;
    expect(close.style.width).toContain("header-close-size");
    expect(clear.style.width).toContain("header-clear-size");
    expect(messages.style.width).toBe("");
    expect(send.style.width).toContain("composer-send-size");
    expect(send.classList.contains("persona-control-size")).toBe(true);
    expect(mic.style.width).toContain("voice-control-size");
    expect(mic.querySelector("svg")!.style.width).toContain("voice-control-iconSize");
    expect(close.style.minWidth).toBe(""); // CSS touch floor remains authoritative.
    expect(close.style.color).toContain("header-close-foreground");
    expect(clear.style.color).toContain("header-clear-foreground");
    expect(close.style.cssText).toContain("header-close-padding");
    expect(send.querySelector("svg")!.getAttribute("stroke")).toBe("currentColor");
    expect(mic.querySelector("svg")!.getAttribute("stroke")).toBe("currentColor");
  });

  it("explicit legacy overrides win per property, and undefined/parent resets reveal theme", () => {
    const input = config(v5, { launcher: { closeButtonSize: "31px", closeButtonColor: "red", closeButtonPaddingX: "9px" }, sendButton: { useIcon: true, iconSize: "17px" }, voiceRecognition: { enabled: true, iconSize: "30px", provider: { type: "runtype" } } });
    const close = createCloseButton(input).button;
    const mic = createMicButton(input)!.button;
    expect(close.style.width).toBe("31px");
    expect(close.style.color).toBe("red");
    expect(close.style.paddingLeft).toBe("9px");
    expect(close.style.cssText).toContain("header-close-padding");
    expect(mic.style.width).toBe("30px");
    expect(mic.querySelector("svg")!.style.width).toBe("30px");
    const updated = mergeConfigUpdate(input, { launcher: { closeButtonSize: undefined, closeButtonColor: undefined, closeButtonPaddingX: undefined }, voiceRecognition: undefined });
    applyHeaderControlStyle(close, updated, "close");
    applyMicButtonStyle(mic, updated);
    expect(close.style.width).toContain("header-close-size");
    expect(close.style.minWidth).toBe("");
    expect(close.style.color).toContain("header-close-foreground");
    expect(close.style.cssText).toContain("header-close-padding");
    expect(mic.querySelector("svg")!.style.width).toContain("voice-control-iconSize");
    const fresh = createCloseButton(updated).button;
    for (const property of Array.from(fresh.style)) {
      expect(close.style.getPropertyValue(property)).toBe(fresh.style.getPropertyValue(property));
    }
  });

  it("send-specific styling survives stop transitions and updates without changing sibling mic", () => {
    const input = config(v5);
    const parts = createSendButton(input);
    parts.setMode("stop");
    expect(parts.button.style.backgroundColor).toContain("persona-button-stop-bg");
    expect(parts.button.querySelector("[data-persona-glyph-stack]")!.getAttribute("data-mode")).toBe("stop");
    const updated = mergeConfigUpdate(input, { sendButton: { textColor: "orange" }, theme: { components: { composer: { send: { padding: "7px" } } } } });
    applySendButtonStyle(parts.button, updated);
    expect(parts.button.style.color).toBe("orange");
    expect(parts.button.querySelector("[data-persona-glyph-stack]")!.getAttribute("data-mode")).toBe("stop");
    parts.setMode("send");
    expect(parts.button.style.color).toBe("orange");
    expect(parts.button.style.backgroundColor).toContain("composer-send-background");
    expect(createMicButton(updated)!.button.style.color).toBe("orange"); // Historical explicit send-to-mic fallback.
    const independent = createMicButton(input)!.button;
    expect(independent.style.color).toContain("voice-control-foreground");
  });

  it("legacy icon padding/text background restrictions also hold on updates", () => {
    const input = config(v5, { theme: undefined, sendButton: { useIcon: true, paddingX: "20px", paddingY: "30px", backgroundColor: "red" } });
    const { button } = createSendButton(input);
    expect(button.style.paddingLeft).toBe("0px");
    applySendButtonStyle(button, mergeConfigUpdate(input, { copy: { sendButtonLabel: "Go" } }));
    expect(button.style.paddingTop).toBe("0px");
    const text = mergeConfigUpdate(input, { sendButton: { useIcon: false } });
    applySendButtonStyle(button, text);
    expect(button.style.backgroundColor).toBe("");
    expect(button.style.paddingLeft).toBe("20px");
    const themedText = mergeConfigUpdate(text, { theme });
    applySendButtonStyle(button, themedText);
    expect(button.style.backgroundColor).toContain("composer-send-background");
    expect(button.style.paddingLeft).toBe("20px");
  });

  it("applies every mic state from current config and restores idle after theme/legacy reset", () => {
    const input = config(v5, { voiceRecognition: { enabled: true, provider: { type: "runtype" }, recordingIconColor: "orange", processingBorderColor: "red" } });
    const mic = createMicButton(input)!.button;
    applyMicButtonStyle(mic, input, "recording");
    expect(mic.style.color).toBe("orange");
    expect(mic.querySelector("svg")!.getAttribute("stroke")).toBe("currentColor");
    applyMicButtonStyle(mic, input, "processing");
    expect(mic.style.color).toContain("consumer-voice-processing-icon");
    expect(mic.style.backgroundColor).toContain("consumer-voice-processing-background");
    expect(mic.style.borderColor).toBe("red");
    applyMicButtonStyle(mic, input, "speaking", "barge-in");
    expect(mic.style.color).toContain("consumer-voice-speaking-icon");
    expect(mic.style.backgroundColor).toContain("components-voice-speaking-background");
    expect(mic.style.backgroundColor).toContain("voice-recording-bg");
    const next = mergeConfigUpdate(input, { voiceRecognition: { recordingIconColor: undefined, processingBorderColor: undefined }, colorScheme: "dark", darkTheme: { components: { voice: { control: { foreground: "yellow" } } } } });
    applyMicButtonStyle(mic, next, "recording");
    expect(mic.style.color).toContain("voice-recording-indicator");
    applyMicButtonStyle(mic, next);
    expect(mic.style.color).toContain("voice-control-foreground");
    expect(mic.style.borderColor).toContain("voice-control-borderColor");
    expect(mic.getAttribute("data-state")).toBe("idle");
  });

  it("removes every owned role style/class when both theme layers reset", () => {
    const input = config(v5);
    const close = createCloseButton(input).button;
    const send = createSendButton(input).button;
    const mic = createMicButton(input)!.button;
    const reset = mergeConfigUpdate(input, { theme: undefined, darkTheme: undefined });
    applyHeaderControlStyle(close, reset, "close");
    applySendButtonStyle(send, reset);
    applyMicButtonStyle(mic, reset);
    for (const button of [close, send, mic]) {
      expect(button.classList.contains("persona-control-size")).toBe(false);
      expect(button.classList.contains("persona-theme-padding")).toBe(false);
      expect(button.style.getPropertyValue("--persona-control-size")).toBe("");
      expect(button.style.getPropertyValue("--persona-theme-padding")).toBe("");
    }
    expect(close.style.width).toBe("");
    expect(send.style.borderRadius).toBe("");
    expect(mic.style.color).toBe("var(--persona-text, #111827)");
  });

  it("treats externally default-filled input as explicit and preserves unconfigured defaults", () => {
    const ordinary = config(v5, { theme: undefined });
    const external = JSON.parse(JSON.stringify(ordinary)) as AgentWidgetConfig;
    external.theme = theme;
    expect(createCloseButton(external).button.style.backgroundColor).toBe("transparent");
    expect(createSendButton(external).button.style.borderWidth).toBe("0px");
    expect(createMicButton(external)!.button.style.backgroundColor).toBe("transparent");
    const mic = createMicButton(ordinary)!.button;
    applyMicButtonStyle(mic, ordinary, "processing");
    expect(mic.style.color).toContain("persona-text");
    expect(mic.style.borderWidth).toBe("0px");
  });
});
