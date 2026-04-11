import { describe, expect, it } from "vitest";

import {
  appendPreviewTranscriptEntry,
  buildPreviewConfig,
  createPreviewTranscriptEntry,
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
});
