import { describe, expect, it } from "vitest";

import {
  appendPreviewTranscriptEntry,
  buildPreviewConfig,
  buildTranscriptStreamFrames,
  createPreviewTranscriptEntry,
  presetStreamsText,
} from "./preview-utils";

describe("theme editor preview demo data", () => {
  it("seeds tool call preview messages when advanced tool display modes are enabled", () => {
    const config = buildPreviewConfig({
      scene: "conversation",
      config: {
        features: {
          toolCallDisplay: {
            activePreview: true,
          },
        },
      },
    });

    expect(config.initialMessages?.some((message) => message.variant === "tool")).toBe(true);
  });

  it("seeds reasoning preview messages when advanced reasoning display modes are enabled", () => {
    const config = buildPreviewConfig({
      scene: "conversation",
      config: {
        features: {
          reasoningDisplay: {
            activePreview: true,
          },
        },
      },
    });

    expect(config.initialMessages?.some((message) => message.variant === "reasoning")).toBe(true);
  });

  it("creates public preview transcript entries for tool and reasoning presets", () => {
    const toolMessage = createPreviewTranscriptEntry("tool-running", 1);
    const reasoningMessage = createPreviewTranscriptEntry("reasoning-streaming", 2);

    expect(toolMessage.variant).toBe("tool");
    expect(toolMessage.toolCall?.status).toBe("running");
    expect(reasoningMessage.variant).toBe("reasoning");
    expect(reasoningMessage.reasoning?.status).toBe("streaming");
  });

  it("appends public preview transcript entries to an existing conversation", () => {
    const messages = appendPreviewTranscriptEntry([], "tool-running");
    const updated = appendPreviewTranscriptEntry(messages, "reasoning-complete");

    expect(updated).toHaveLength(2);
    expect(updated[0].variant).toBe("tool");
    expect(updated[1].variant).toBe("reasoning");
  });

  it("creates assistant code-block, table, and image presets with markdown content", () => {
    const code = createPreviewTranscriptEntry("assistant-code-block", 1);
    const table = createPreviewTranscriptEntry("assistant-markdown-table", 2);
    const image = createPreviewTranscriptEntry("assistant-image", 3);

    for (const message of [code, table, image]) {
      expect(message.role).toBe("assistant");
      expect(message.variant).toBeUndefined();
      expect(typeof message.content).toBe("string");
    }

    expect(code.content).toContain("```ts");
    expect(table.content).toContain("| Preset");
    expect(image.content).toContain("![");
  });

  it("flags assistant text presets as streaming and non-text presets as not", () => {
    expect(presetStreamsText("assistant-message")).toBe(true);
    expect(presetStreamsText("assistant-code-block")).toBe(true);
    expect(presetStreamsText("assistant-markdown-table")).toBe(true);
    expect(presetStreamsText("assistant-image")).toBe(true);
    expect(presetStreamsText("user-message")).toBe(false);
    expect(presetStreamsText("reasoning-streaming")).toBe(false);
    expect(presetStreamsText("tool-running")).toBe(false);
  });

  it("builds a single done frame for non-streaming presets", () => {
    const frames = buildTranscriptStreamFrames("user-message", 0);
    expect(frames).toHaveLength(1);
    expect(frames[0].done).toBe(true);
    expect(frames[0].delayMs).toBe(0);
    expect(frames[0].message.role).toBe("user");
  });

  it("builds progressive snapshots for assistant text presets ending with streaming:false", () => {
    const frames = buildTranscriptStreamFrames("assistant-message", 0, { chunkSize: 10, delayMs: 5 });
    expect(frames.length).toBeGreaterThan(1);

    const first = frames[0];
    expect(first.message.content).toBe("");
    expect(first.message.streaming).toBe(true);
    expect(first.delayMs).toBe(0);
    expect(first.done).toBe(false);

    for (let i = 1; i < frames.length - 1; i += 1) {
      expect(frames[i].message.streaming).toBe(true);
      expect(frames[i].done).toBe(false);
      expect(frames[i].delayMs).toBe(5);
    }

    const last = frames[frames.length - 1];
    expect(last.message.streaming).toBe(false);
    expect(last.done).toBe(true);
    const completed = createPreviewTranscriptEntry("assistant-message", 0);
    expect(last.message.content).toBe(completed.content);
    expect(last.message.id).toBe(completed.id);
  });
});
