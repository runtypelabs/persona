// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  createStandardBubble,
  isSafeImageSrc,
  isSafeMediaSrc,
  resolveStopReasonNoticeText,
  getDefaultStopReasonNoticeCopy,
} from "./message-bubble";
import type { AgentWidgetConfig, AgentWidgetMessage } from "../types";

const makeMessage = (overrides: Partial<AgentWidgetMessage> = {}): AgentWidgetMessage => ({
  id: "msg-1",
  role: "assistant",
  content: "",
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe("isSafeImageSrc", () => {
  it("allows https URLs", () => {
    expect(isSafeImageSrc("https://example.com/img.png")).toBe(true);
  });

  it("allows http URLs", () => {
    expect(isSafeImageSrc("http://example.com/img.png")).toBe(true);
  });

  it("allows blob URLs", () => {
    expect(isSafeImageSrc("blob:http://example.com/abc-123")).toBe(true);
  });

  it("allows data:image/png URIs", () => {
    expect(isSafeImageSrc("data:image/png;base64,abc123")).toBe(true);
  });

  it("allows data:image/jpeg URIs", () => {
    expect(isSafeImageSrc("data:image/jpeg;base64,abc123")).toBe(true);
  });

  it("allows data:image/gif URIs", () => {
    expect(isSafeImageSrc("data:image/gif;base64,abc123")).toBe(true);
  });

  it("allows data:image/webp URIs", () => {
    expect(isSafeImageSrc("data:image/webp;base64,abc123")).toBe(true);
  });

  it("blocks data:image/svg+xml URIs", () => {
    expect(isSafeImageSrc("data:image/svg+xml,<svg onload=alert(1)>")).toBe(false);
  });

  it("blocks data:image/svg+xml with base64", () => {
    expect(isSafeImageSrc("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
  });

  it("blocks mixed-case SVG data URIs", () => {
    expect(isSafeImageSrc("data:image/Svg+xml,<svg onload=alert(1)>")).toBe(false);
    expect(isSafeImageSrc("data:image/SVG+XML,<svg>")).toBe(false);
    expect(isSafeImageSrc("data:Image/SVG+XML;base64,abc")).toBe(false);
  });

  it("blocks javascript: URIs", () => {
    expect(isSafeImageSrc("javascript:alert(1)")).toBe(false);
  });

  it("blocks data:text/html URIs", () => {
    expect(isSafeImageSrc("data:text/html,<script>alert(1)</script>")).toBe(false);
  });

  it("allows relative paths (no colon)", () => {
    expect(isSafeImageSrc("relative/path.png")).toBe(true);
  });

  it("allows dot-relative paths", () => {
    expect(isSafeImageSrc("./image.png")).toBe(true);
  });

  it("allows empty string", () => {
    expect(isSafeImageSrc("")).toBe(true);
  });
});

describe("createStandardBubble", () => {
  it("skips rendering blocked image previews while keeping safe ones", () => {
    const bubble = createStandardBubble(
      makeMessage({
        content: "Image attachments",
        contentParts: [
          { type: "image", image: "https://example.com/safe.png", alt: "Safe image" },
          { type: "image", image: "data:image/svg+xml,<svg onload=alert(1)>", alt: "Blocked image" },
        ],
      }),
      ({ text }) => text
    );

    const previewImages = bubble.querySelectorAll('[data-message-attachments="images"] img');

    expect(previewImages).toHaveLength(1);
    expect(previewImages[0]?.getAttribute("src")).toBe("https://example.com/safe.png");
    expect(previewImages[0]?.getAttribute("alt")).toBe("Safe image");
  });
});

describe("resolveStopReasonNoticeText", () => {
  it("returns null for natural completions", () => {
    expect(resolveStopReasonNoticeText("end_turn")).toBeNull();
  });

  it("returns null for unknown reasons", () => {
    expect(resolveStopReasonNoticeText("unknown")).toBeNull();
  });

  it("returns null when stopReason is undefined", () => {
    expect(resolveStopReasonNoticeText(undefined)).toBeNull();
  });

  it("returns the default copy for actionable reasons", () => {
    expect(resolveStopReasonNoticeText("max_tool_calls")).toBe(
      getDefaultStopReasonNoticeCopy("max_tool_calls")
    );
    expect(resolveStopReasonNoticeText("length")).toBe(
      getDefaultStopReasonNoticeCopy("length")
    );
    expect(resolveStopReasonNoticeText("content_filter")).toBe(
      getDefaultStopReasonNoticeCopy("content_filter")
    );
    expect(resolveStopReasonNoticeText("error")).toBe(
      getDefaultStopReasonNoticeCopy("error")
    );
  });

  it("applies overrides on a per-key basis", () => {
    expect(
      resolveStopReasonNoticeText("max_tool_calls", {
        ["max_tool_calls" as const]: "Custom override.",
      })
    ).toBe("Custom override.");
  });

  it("falls back to defaults for keys not overridden", () => {
    expect(
      resolveStopReasonNoticeText("length", {
        ["max_tool_calls" as const]: "Custom.",
      })
    ).toBe(getDefaultStopReasonNoticeCopy("length"));
  });

  it("suppresses the notice when override is an empty string", () => {
    expect(
      resolveStopReasonNoticeText("max_tool_calls", {
        ["max_tool_calls" as const]: "",
      })
    ).toBeNull();
  });
});

describe("createStandardBubble — stopReason notice", () => {
  const renderWithStopReason = (
    overrides: Partial<AgentWidgetMessage>,
    widgetConfig?: Partial<AgentWidgetConfig>
  ) =>
    createStandardBubble(
      makeMessage(overrides),
      ({ text }) => text,
      undefined,
      undefined,
      undefined,
      { widgetConfig: widgetConfig as AgentWidgetConfig | undefined }
    );

  it("renders no notice for end_turn (natural completion)", () => {
    const bubble = renderWithStopReason({
      content: "All done.",
      stopReason: "end_turn",
    });
    expect(bubble.querySelector(".persona-message-stop-reason")).toBeNull();
  });

  it("renders no notice when stopReason is absent (backcompat)", () => {
    const bubble = renderWithStopReason({ content: "Hello." });
    expect(bubble.querySelector(".persona-message-stop-reason")).toBeNull();
  });

  it("renders no notice for unknown reasons", () => {
    const bubble = renderWithStopReason({
      content: "Hello.",
      stopReason: "unknown",
    });
    expect(bubble.querySelector(".persona-message-stop-reason")).toBeNull();
  });

  it("renders the default notice for max_tool_calls", () => {
    const bubble = renderWithStopReason({
      content: "Used a tool.",
      stopReason: "max_tool_calls",
    });
    const notice = bubble.querySelector(".persona-message-stop-reason");
    expect(notice).not.toBeNull();
    expect(notice?.getAttribute("data-stop-reason")).toBe("max_tool_calls");
    expect(notice?.textContent).toBe(getDefaultStopReasonNoticeCopy("max_tool_calls"));
  });

  it("renders the default notice for length", () => {
    const bubble = renderWithStopReason({
      content: "Long answer cut off.",
      stopReason: "length",
    });
    const notice = bubble.querySelector(".persona-message-stop-reason");
    expect(notice?.getAttribute("data-stop-reason")).toBe("length");
    expect(notice?.textContent).toBe(getDefaultStopReasonNoticeCopy("length"));
  });

  it("renders the default notice for content_filter", () => {
    const bubble = renderWithStopReason({
      content: "Filtered.",
      stopReason: "content_filter",
    });
    const notice = bubble.querySelector(".persona-message-stop-reason");
    expect(notice?.getAttribute("data-stop-reason")).toBe("content_filter");
  });

  it("renders the default notice for error", () => {
    const bubble = renderWithStopReason({
      content: "Provider blew up.",
      stopReason: "error",
    });
    const notice = bubble.querySelector(".persona-message-stop-reason");
    expect(notice?.getAttribute("data-stop-reason")).toBe("error");
  });

  it("applies copy overrides from widgetConfig.copy.stopReasonNotice", () => {
    const bubble = renderWithStopReason(
      { content: "x", stopReason: "max_tool_calls" },
      { copy: { stopReasonNotice: { ["max_tool_calls" as const]: "Custom copy." } } }
    );
    expect(bubble.querySelector(".persona-message-stop-reason")?.textContent).toBe(
      "Custom copy."
    );
  });

  it("hides the empty content div when content is empty + max_tool_calls", () => {
    // Regression: the empty-bubble symptom the upstream Runtype fix targets.
    // With no content and max_tool_calls, the notice carries the bubble alone;
    // the empty content div must be hidden so we don't render whitespace
    // above the notice.
    const bubble = renderWithStopReason({
      content: "",
      stopReason: "max_tool_calls",
    });
    const contentDiv = bubble.querySelector(".persona-message-content") as HTMLElement | null;
    expect(contentDiv).not.toBeNull();
    expect(contentDiv!.style.display).toBe("none");
    const notice = bubble.querySelector(".persona-message-stop-reason");
    expect(notice).not.toBeNull();
    expect(notice?.getAttribute("data-stop-reason")).toBe("max_tool_calls");
  });

  it("does not render notice while message is still streaming", () => {
    const bubble = renderWithStopReason({
      content: "partial",
      stopReason: "max_tool_calls",
      streaming: true,
    });
    expect(bubble.querySelector(".persona-message-stop-reason")).toBeNull();
  });

  it("does not render notice on user messages", () => {
    const bubble = renderWithStopReason({
      role: "user",
      content: "user msg",
      // stopReason on a user message is nonsense, but guard against it
      stopReason: "max_tool_calls",
    });
    expect(bubble.querySelector(".persona-message-stop-reason")).toBeNull();
  });
});

describe("isSafeMediaSrc", () => {
  it("allows https URLs", () => {
    expect(isSafeMediaSrc("https://example.com/audio.mp3")).toBe(true);
  });

  it("allows http URLs", () => {
    expect(isSafeMediaSrc("http://example.com/audio.mp3")).toBe(true);
  });

  it("allows blob URLs", () => {
    expect(isSafeMediaSrc("blob:http://example.com/abc-123")).toBe(true);
  });

  it("allows audio data URIs", () => {
    expect(isSafeMediaSrc("data:audio/mpeg;base64,AAAA")).toBe(true);
  });

  it("allows video data URIs", () => {
    expect(isSafeMediaSrc("data:video/mp4;base64,AAAA")).toBe(true);
  });

  it("allows binary file data URIs", () => {
    expect(isSafeMediaSrc("data:application/pdf;base64,AAAA")).toBe(true);
  });

  it("blocks javascript: URIs", () => {
    expect(isSafeMediaSrc("javascript:alert(1)")).toBe(false);
  });

  it("blocks data:text/html URIs", () => {
    expect(isSafeMediaSrc("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeMediaSrc("data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==")).toBe(false);
  });

  it("blocks other executable data: types", () => {
    expect(isSafeMediaSrc("data:text/javascript,alert(1)")).toBe(false);
    expect(isSafeMediaSrc("data:text/xml,<svg onload=alert(1)/>")).toBe(false);
    expect(isSafeMediaSrc("data:application/xhtml+xml,<html>")).toBe(false);
  });

  it("blocks data:image/svg+xml URIs (XSS via right-click open in new tab)", () => {
    expect(isSafeMediaSrc("data:image/svg+xml,<svg onload=alert(1)>")).toBe(false);
    expect(isSafeMediaSrc("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
    expect(isSafeMediaSrc("data:image/SVG+XML;base64,PHN2Zz4=")).toBe(false);
  });

  it("allows inert data:text/* payloads (plain, csv, markdown)", () => {
    expect(isSafeMediaSrc("data:text/plain;base64,SGVsbG8=")).toBe(true);
    expect(isSafeMediaSrc("data:text/csv;base64,YSxiCjEsMg==")).toBe(true);
    expect(isSafeMediaSrc("data:text/markdown;base64,IyBIaQ==")).toBe(true);
  });

  it("allows relative paths", () => {
    expect(isSafeMediaSrc("relative/file.mp3")).toBe(true);
  });
});

describe("createStandardBubble — audio/video/file content parts", () => {
  it("renders an <audio> element with controls for an audio content part", () => {
    const bubble = createStandardBubble(
      makeMessage({
        contentParts: [
          {
            type: "audio",
            audio: "data:audio/mpeg;base64,AAAA",
            mimeType: "audio/mpeg",
          },
        ],
      }),
      ({ text }) => text
    );

    const container = bubble.querySelector('[data-message-attachments="audio"]');
    expect(container).not.toBeNull();
    const audio = container?.querySelector("audio") as HTMLAudioElement | null;
    expect(audio).not.toBeNull();
    expect(audio?.controls).toBe(true);
    expect(audio?.getAttribute("src")).toBe("data:audio/mpeg;base64,AAAA");
  });

  it("renders an <audio> element for a URL-based audio part", () => {
    const bubble = createStandardBubble(
      makeMessage({
        contentParts: [
          {
            type: "audio",
            audio: "https://example.com/clip.mp3",
            mimeType: "audio/mpeg",
          },
        ],
      }),
      ({ text }) => text
    );

    const audio = bubble.querySelector(
      '[data-message-attachments="audio"] audio'
    ) as HTMLAudioElement | null;
    expect(audio?.getAttribute("src")).toBe("https://example.com/clip.mp3");
  });

  it("skips audio parts with unsafe schemes", () => {
    const bubble = createStandardBubble(
      makeMessage({
        contentParts: [
          {
            type: "audio",
            audio: "javascript:alert(1)",
            mimeType: "audio/mpeg",
          },
        ],
      }),
      ({ text }) => text
    );

    expect(
      bubble.querySelector('[data-message-attachments="audio"]')
    ).toBeNull();
  });

  it("renders a <video> element with controls for a video content part", () => {
    const bubble = createStandardBubble(
      makeMessage({
        contentParts: [
          {
            type: "video",
            video: "https://example.com/clip.mp4",
            mimeType: "video/mp4",
          },
        ],
      }),
      ({ text }) => text
    );

    const video = bubble.querySelector(
      '[data-message-attachments="video"] video'
    ) as HTMLVideoElement | null;
    expect(video).not.toBeNull();
    expect(video?.controls).toBe(true);
    expect(video?.getAttribute("src")).toBe("https://example.com/clip.mp4");
  });

  it("renders a download link for a file content part", () => {
    const bubble = createStandardBubble(
      makeMessage({
        contentParts: [
          {
            type: "file",
            data: "data:application/pdf;base64,AAAA",
            mimeType: "application/pdf",
            filename: "report.pdf",
          },
        ],
      }),
      ({ text }) => text
    );

    const link = bubble.querySelector(
      '[data-message-attachments="files"] a'
    ) as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe("data:application/pdf;base64,AAAA");
    expect(link?.getAttribute("download")).toBe("report.pdf");
    expect(link?.textContent).toBe("report.pdf");
    // Cross-origin URLs ignore `download`, so we open in a new tab to avoid
    // navigating the chat page away from the conversation.
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("renders a download link for a URL-hosted file", () => {
    const bubble = createStandardBubble(
      makeMessage({
        contentParts: [
          {
            type: "file",
            data: "https://example.com/report.pdf",
            mimeType: "application/pdf",
            filename: "report.pdf",
          },
        ],
      }),
      ({ text }) => text
    );

    const link = bubble.querySelector(
      '[data-message-attachments="files"] a'
    ) as HTMLAnchorElement | null;
    expect(link?.getAttribute("href")).toBe("https://example.com/report.pdf");
  });
});
