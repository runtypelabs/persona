// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  createAttachmentControls,
  createComposerTextarea,
  createMicButton,
  createSendButton,
  createStatusText,
  createSuggestionsRow,
} from "./composer-parts";
import type { AgentWidgetConfig } from "../types";

const baseConfig: AgentWidgetConfig = { apiUrl: "/api" };

describe("createComposerTextarea", () => {
  it("returns a textarea with the data attribute and composer-textarea class", () => {
    const { textarea } = createComposerTextarea(baseConfig);
    expect(textarea.tagName).toBe("TEXTAREA");
    expect(textarea.getAttribute("data-persona-composer-input")).toBe("");
    expect(textarea.classList.contains("persona-composer-textarea")).toBe(true);
    expect(textarea.classList.contains("persona-text-persona-text")).toBe(true);
    expect(textarea.classList.contains("persona-text-persona-primary")).toBe(false);
  });

  it("attachAutoResize wires an input listener that grows up to maxHeight", () => {
    const { textarea, attachAutoResize } = createComposerTextarea(baseConfig);
    document.body.appendChild(textarea);
    attachAutoResize();
    Object.defineProperty(textarea, "scrollHeight", { configurable: true, value: 10000 });
    textarea.value = "lots of text";
    textarea.dispatchEvent(new Event("input"));
    // jsdom doesn't compute scrollHeight; we just verify the handler ran by
    // checking that height was set to a numeric px value (not auto).
    expect(textarea.style.height).toMatch(/px$/);
    document.body.removeChild(textarea);
  });

  it("honors maxHeight overrides set after construction", () => {
    const { textarea, attachAutoResize } = createComposerTextarea(baseConfig);
    document.body.appendChild(textarea);
    textarea.style.maxHeight = "200px";
    attachAutoResize();
    Object.defineProperty(textarea, "scrollHeight", { configurable: true, value: 10000 });
    textarea.dispatchEvent(new Event("input"));
    expect(textarea.style.height).toBe("200px");
    // The override keeps winning on later input events (pill composer path).
    textarea.dispatchEvent(new Event("input"));
    expect(textarea.style.height).toBe("200px");
    expect(textarea.style.maxHeight).toBe("200px");
    document.body.removeChild(textarea);
  });

  it("caps at 3 lines of the rendered line height when themed", () => {
    const { textarea, attachAutoResize } = createComposerTextarea(baseConfig);
    textarea.style.lineHeight = "24px";
    document.body.appendChild(textarea);
    attachAutoResize();
    Object.defineProperty(textarea, "scrollHeight", { configurable: true, value: 10000 });
    textarea.dispatchEvent(new Event("input"));
    expect(textarea.style.height).toBe("72px");
    expect(textarea.style.maxHeight).toBe("72px");
    document.body.removeChild(textarea);
  });

  it("defaults to 60px (3 × 20px) before any resize", () => {
    const { textarea } = createComposerTextarea(baseConfig);
    expect(textarea.style.maxHeight).toBe("60px");
    expect(textarea.style.overflowY).toBe("auto");
  });

  it("falls back to 60px when the line height is `normal`", () => {
    const { textarea, attachAutoResize } = createComposerTextarea(baseConfig);
    textarea.style.lineHeight = "normal";
    document.body.appendChild(textarea);
    attachAutoResize();
    Object.defineProperty(textarea, "scrollHeight", { configurable: true, value: 10000 });
    textarea.dispatchEvent(new Event("input"));
    expect(textarea.style.height).toBe("60px");
    document.body.removeChild(textarea);
  });

  it("falls back to 60px for unitless line heights and detached nodes", () => {
    const unitless = createComposerTextarea(baseConfig);
    unitless.textarea.style.lineHeight = "1.5";
    document.body.appendChild(unitless.textarea);
    unitless.attachAutoResize();
    Object.defineProperty(unitless.textarea, "scrollHeight", { configurable: true, value: 10000 });
    unitless.textarea.dispatchEvent(new Event("input"));
    expect(unitless.textarea.style.height).toBe("60px");
    document.body.removeChild(unitless.textarea);

    // Never appended: getComputedStyle still must not throw or produce NaN.
    const detached = createComposerTextarea(baseConfig);
    detached.attachAutoResize();
    Object.defineProperty(detached.textarea, "scrollHeight", { configurable: true, value: 10000 });
    detached.textarea.dispatchEvent(new Event("input"));
    expect(detached.textarea.style.height).toBe("60px");
  });
});

describe("createSendButton", () => {
  it("returns button + wrapper + setMode handle, with submit data attr", () => {
    const send = createSendButton(baseConfig);
    expect(send.button.tagName).toBe("BUTTON");
    expect(send.button.type).toBe("submit");
    expect(send.button.getAttribute("data-persona-composer-submit")).toBe("");
    expect(send.wrapper.contains(send.button)).toBe(true);
    expect(typeof send.setMode).toBe("function");
  });

  it("setMode('stop') updates the aria-label and label text", () => {
    const send = createSendButton({
      ...baseConfig,
      copy: { sendButtonLabel: "Send", stopButtonLabel: "Stop" },
    });
    expect(send.button.textContent).toBe("Send");
    expect(send.button.getAttribute("aria-label")).toBe("Send message");
    send.setMode("stop");
    expect(send.button.textContent).toBe("Stop");
    expect(send.button.getAttribute("aria-label")).toBe("Stop generating");
    send.setMode("send");
    expect(send.button.textContent).toBe("Send");
  });

  it("applies configured icon-button styles and skips the primary-bg fallback class", () => {
    const send = createSendButton({
      ...baseConfig,
      sendButton: {
        useIcon: true,
        iconName: "send",
        size: "48px",
        backgroundColor: "rgb(1, 2, 3)",
        textColor: "rgb(4, 5, 6)",
        borderWidth: "2px",
        borderColor: "rgb(7, 8, 9)",
        paddingX: "6px",
        paddingY: "4px",
      },
    });
    const s = send.button.style;
    expect(s.width).toBe("48px");
    expect(s.height).toBe("48px");
    expect(s.minWidth).toBe("48px");
    expect(s.minHeight).toBe("48px");
    expect(s.color).toBe("rgb(4, 5, 6)");
    expect(s.backgroundColor).toBe("rgb(1, 2, 3)");
    expect(s.borderWidth).toBe("2px");
    expect(s.borderStyle).toBe("solid");
    expect(s.borderColor).toBe("rgb(7, 8, 9)");
    // Icon mode zeroes padding even when configured: the glyph is drawn at
    // the button size, so padding would crush it.
    expect(s.paddingLeft).toBe("0px");
    expect(s.paddingRight).toBe("0px");
    expect(s.paddingTop).toBe("0px");
    expect(s.paddingBottom).toBe("0px");
    // An explicit backgroundColor means the fallback class is not added.
    expect(send.button.classList.contains("persona-bg-persona-primary")).toBe(false);
  });

  it("toggles the white-text fallback class based on textColor (text mode)", () => {
    const plain = createSendButton(baseConfig);
    expect(plain.button.classList.contains("persona-text-white")).toBe(true);
    expect(plain.button.style.color).toBe("");

    const colored = createSendButton({
      ...baseConfig,
      sendButton: { textColor: "rgb(4, 5, 6)" },
    });
    expect(colored.button.classList.contains("persona-text-white")).toBe(false);
    expect(colored.button.style.color).toBe("rgb(4, 5, 6)");
  });

  it("adds the primary-bg fallback class in icon mode without an explicit background", () => {
    const send = createSendButton({
      ...baseConfig,
      sendButton: { useIcon: true, iconName: "send" },
    });
    expect(send.button.classList.contains("persona-bg-persona-primary")).toBe(true);
  });

  describe("icon mode", () => {
    const iconConfig: AgentWidgetConfig = {
      ...baseConfig,
      sendButton: { useIcon: true, iconName: "send", stopIconName: "square" },
    };
    const iconCount = (btn: HTMLElement) => btn.querySelectorAll("svg").length;

    it("keeps exactly one icon across a send→stop→send cycle", () => {
      const send = createSendButton(iconConfig);
      expect(iconCount(send.button)).toBe(1);
      send.setMode("stop");
      expect(iconCount(send.button)).toBe(1);
      send.setMode("send");
      expect(iconCount(send.button)).toBe(1);
    });

    it("zeroes padding so configured padding cannot crush the glyph", () => {
      const send = createSendButton({
        ...baseConfig,
        sendButton: {
          useIcon: true,
          iconName: "send",
          size: "40px",
          paddingX: "12px",
          paddingY: "10px",
        },
      });
      expect(send.button.style.paddingLeft).toBe("0px");
      expect(send.button.style.paddingTop).toBe("0px");
    });

    it("draws the glyph at half the button by default and honors iconSize", () => {
      const send = createSendButton({
        ...baseConfig,
        sendButton: { useIcon: true, iconName: "send", size: "32px" },
      });
      expect(send.button.querySelector("svg")?.getAttribute("width")).toBe("16");

      const sized = createSendButton({
        ...baseConfig,
        sendButton: {
          useIcon: true,
          iconName: "send",
          size: "32px",
          iconSize: "26px",
          iconStrokeWidth: 2.5,
        },
      });
      const svg = sized.button.querySelector("svg");
      expect(svg?.getAttribute("width")).toBe("26");
      expect(svg?.getAttribute("stroke-width")).toBe("2.5");
    });

    it("keeps configured padding in text mode", () => {
      const send = createSendButton({
        ...baseConfig,
        sendButton: { useIcon: false, paddingX: "12px", paddingY: "10px" },
      });
      expect(send.button.style.paddingLeft).toBe("12px");
      expect(send.button.style.paddingTop).toBe("10px");
    });

    it("does not stack a stale icon when an external re-render swapped the live icon node", () => {
      const send = createSendButton(iconConfig);
      // Simulate a DOM morph/re-render (e.g. a host calling controller.update())
      // that replaces the live icon child with a clone. This detaches the
      // captured `sendIcon` reference, so `sendIcon.parentNode !== button`.
      // The old replaceChild/appendChild fallback then left BOTH icons mounted,
      // producing the doubled send-arrow after the first send→stop→send cycle.
      const live = send.button.firstElementChild as SVGElement;
      send.button.replaceChildren(live.cloneNode(true));
      expect(iconCount(send.button)).toBe(1);

      send.setMode("stop");
      expect(iconCount(send.button)).toBe(1);
      send.setMode("send");
      expect(iconCount(send.button)).toBe(1);
    });
  });
});

describe("createMicButton", () => {
  it("returns null when voice recognition is disabled", () => {
    expect(createMicButton(baseConfig)).toBeNull();
  });

  it("returns null when voice recognition is enabled but browser support is missing", () => {
    const config: AgentWidgetConfig = {
      ...baseConfig,
      voiceRecognition: { enabled: true },
    };
    // jsdom has neither webkitSpeechRecognition nor SpeechRecognition by default,
    // and no Runtype provider configured → null.
    expect(createMicButton(config)).toBeNull();
  });

  it("returns a button when a Runtype voice provider is configured", () => {
    const config: AgentWidgetConfig = {
      ...baseConfig,
      voiceRecognition: { enabled: true, provider: { type: "runtype" } },
    };
    const mic = createMicButton(config);
    expect(mic).not.toBeNull();
    expect(mic!.button.getAttribute("data-persona-composer-mic")).toBe("");
    expect(mic!.button.type).toBe("button");
  });
});

describe("createAttachmentControls", () => {
  it("returns null when attachments are disabled", () => {
    expect(createAttachmentControls(baseConfig)).toBeNull();
  });

  it("returns button + wrapper + input + previewsContainer when enabled", () => {
    const config: AgentWidgetConfig = {
      ...baseConfig,
      attachments: { enabled: true },
    };
    const att = createAttachmentControls(config);
    expect(att).not.toBeNull();
    expect(att!.button.classList.contains("persona-attachment-button")).toBe(true);
    expect(att!.input.type).toBe("file");
    expect(att!.input.style.display).toBe("none");
    expect(att!.previewsContainer.classList.contains("persona-attachment-previews")).toBe(true);
    expect(att!.previewsContainer.style.display).toBe("none");
  });
});

describe("createStatusText", () => {
  it("returns a div with the status data attribute and idle text", () => {
    const status = createStatusText({
      ...baseConfig,
      statusIndicator: { idleText: "Online" },
    });
    expect(status.tagName).toBe("DIV");
    expect(status.getAttribute("data-persona-composer-status")).toBe("");
    expect(status.textContent).toBe("Online");
  });

  it("renders an anchor tag when idleLink is configured", () => {
    const status = createStatusText({
      ...baseConfig,
      statusIndicator: { idleText: "Powered by", idleLink: "https://example.com" },
    });
    const link = status.querySelector("a");
    expect(link).not.toBeNull();
    expect(link!.href).toBe("https://example.com/");
  });
});

describe("createSuggestionsRow", () => {
  it("returns a div with the suggestions class chain", () => {
    const row = createSuggestionsRow();
    expect(row.tagName).toBe("DIV");
    expect(row.className).toContain("persona-mb-3");
    expect(row.className).toContain("persona-flex");
    expect(row.className).toContain("persona-flex-wrap");
    expect(row.className).toContain("persona-gap-2");
  });
});
