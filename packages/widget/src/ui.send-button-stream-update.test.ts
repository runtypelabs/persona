// @vitest-environment jsdom

// An update() that lands during an active stream must not clobber the stop
// icon back to the send icon: the button holds the stop glyph (owned by
// setSendButtonMode) and the aria-label still reads "stop", so re-rendering
// the send icon here produced a mid-stream icon/label mismatch.

import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import { buildAssistantTurnFrames, createMockSSEStream } from "./testing/mock-stream";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const createMount = () => {
  const m = document.createElement("div");
  document.body.appendChild(m);
  return m;
};

describe("send button icon stability across a mid-stream update", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("keeps the stop icon after update() while streaming, and heals to send on completion", async () => {
    window.scrollTo = vi.fn();
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      sendButton: { useIcon: true, iconName: "arrow-up", stopIconName: "square" },
    });

    // The send button element is mutated in place by update(); hold the ref.
    const btn = Array.from(mount.querySelectorAll("button")).find(
      (b) => b.getAttribute("aria-label") === "Send message"
    )!;
    // Both glyphs stay mounted and stacked; the live mode is the attribute, and
    // it is what a rebuild of the stack has to preserve.
    const stack = () => btn.querySelector("[data-persona-glyph-stack]");
    const glyph = () => stack()?.getAttribute("data-mode") ?? null;
    const mountedGlyphs = () =>
      Array.from(stack()?.querySelectorAll("svg") ?? []).map(
        (svg) => svg.getAttribute("data-glyph")
      );

    expect(glyph()).toBe("send");
    expect(mountedGlyphs()).toEqual(["send", "stop"]);

    const frames = buildAssistantTurnFrames({
      executionId: "e1",
      text: "a reasonably long streamed reply to keep the stream open",
      chunkSize: 4,
    });
    const done = controller.connectStream(createMockSSEStream(frames, { delayMs: 40 }));

    await sleep(80); // stop mode engages
    expect(btn.getAttribute("aria-label")).toBe("Stop generating");
    expect(glyph()).toBe("stop");

    // Unrelated update mid-stream must not revert the stop icon.
    controller.update({ attachments: { enabled: true } });
    expect(btn.getAttribute("aria-label")).toBe("Stop generating");
    expect(glyph()).toBe("stop");
    expect(mountedGlyphs()).toEqual(["send", "stop"]);

    await done;
    await sleep(20);
    // Completion returns the button to send mode.
    expect(btn.getAttribute("aria-label")).toBe("Send message");
    expect(glyph()).toBe("send");
    // The completion path rebuilt the stack; both glyphs are still stacked, so
    // the next stop has something to reveal.
    expect(mountedGlyphs()).toEqual(["send", "stop"]);

    controller.destroy();
  });
});
