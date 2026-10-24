// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  createStandardBubble,
  createMessageActions,
  createMessageMeta,
  getBubbleClasses,
  createMessageInlineMentions,
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

describe("createMessageInlineMentions", () => {
  it("walks segments into prose text nodes + read-only token spans", () => {
    const frag = createMessageInlineMentions([
      { kind: "text", text: "Check " },
      { kind: "mention", ref: { sourceId: "files", itemId: "app", label: "App.tsx" } },
      { kind: "text", text: " for errors" },
    ]);
    const host = document.createElement("div");
    host.appendChild(frag);
    expect(host.textContent).toBe("Check @App.tsx for errors");
    const tokens = host.querySelectorAll(".persona-mention-token");
    expect(tokens).toHaveLength(1);
    expect(tokens[0].classList.contains("persona-mention-token-readonly")).toBe(true);
    // Per-type theming hook: the source id is exposed for CSS/data targeting.
    expect(tokens[0].getAttribute("data-mention-source")).toBe("files");
    expect(tokens[0].querySelector(".persona-mention-token-label")?.textContent).toBe(
      "@App.tsx"
    );
  });

  it("applies a per-item color as the token accent and honors renderMentionToken", () => {
    // Custom render hook fully replaces the token DOM.
    const custom = createMessageInlineMentions(
      [{ kind: "mention", ref: { sourceId: "files", itemId: "app", label: "App.tsx" } }],
      ({ ref }) => {
        const el = document.createElement("b");
        el.className = "my-token";
        el.textContent = ref.label;
        return el;
      }
    );
    const host = document.createElement("div");
    host.appendChild(custom);
    expect(host.querySelector(".my-token")?.textContent).toBe("App.tsx");

    // Per-item color sets the accent custom property inline.
    const colored = createMessageInlineMentions([
      { kind: "mention", ref: { sourceId: "files", itemId: "app", label: "App.tsx", color: "#e11d48" } },
    ]);
    const host2 = document.createElement("div");
    host2.appendChild(colored);
    const token = host2.querySelector<HTMLElement>(".persona-mention-token")!;
    expect(token.style.getPropertyValue("--persona-mention-token-accent")).toBe("#e11d48");
  });

  it("renders a segmented user bubble with inline tokens and no chip row", () => {
    const bubble = createStandardBubble(
      makeMessage({
        role: "user",
        content: "Check @App.tsx for errors",
        contextMentions: [{ sourceId: "files", itemId: "app", label: "App.tsx" }],
        contentSegments: [
          { kind: "text", text: "Check " },
          { kind: "mention", ref: { sourceId: "files", itemId: "app", label: "App.tsx" } },
          { kind: "text", text: " for errors" },
        ],
      }),
      ({ text }) => text
    );
    expect(bubble.querySelectorAll(".persona-mention-token")).toHaveLength(1);
    // Inline mode replaces the separate chip row.
    expect(bubble.querySelector("[data-message-mentions]")).toBeNull();
  });

  const segmentedMessage = () =>
    makeMessage({
      role: "user",
      content: "Check @App.tsx for errors",
      contentSegments: [
        { kind: "text", text: "Check " },
        { kind: "mention", ref: { sourceId: "files", itemId: "app", label: "App.tsx" } },
        { kind: "text", text: " for errors" },
      ],
    });

  it("runs segmented prose through the transform so markdown-style output renders", () => {
    const bubble = createStandardBubble(
      makeMessage({
        role: "user",
        content: "see **bold** and @App.tsx",
        contentSegments: [
          { kind: "text", text: "see **bold** and " },
          { kind: "mention", ref: { sourceId: "files", itemId: "app", label: "App.tsx" } },
        ],
      }),
      ({ text }) => `<p>${text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>`
    );
    expect(bubble.querySelector("strong")?.textContent).toBe("bold");
    const token = bubble.querySelector(".persona-mention-token");
    expect(token).not.toBeNull();
    // The token landed inside the transform's block element, in prose order.
    expect(token?.closest("p")).not.toBeNull();
    expect(bubble.querySelector("p")?.textContent).toBe("see bold and @App.tsx");
  });

  it("escapes segment text when the transform escapes (default pipeline shape)", () => {
    const bubble = createStandardBubble(
      makeMessage({
        role: "user",
        contentSegments: [
          { kind: "text", text: "<script>alert(1)</script> " },
          { kind: "mention", ref: { sourceId: "files", itemId: "app", label: "App.tsx" } },
        ],
      }),
      ({ text }) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    );
    expect(bubble.querySelector("script")).toBeNull();
    expect(bubble.textContent).toContain("<script>alert(1)</script>");
    expect(bubble.querySelectorAll(".persona-mention-token")).toHaveLength(1);
  });

  it("falls back to verbatim segment rendering when a transform drops a mention slot", () => {
    const bubble = createStandardBubble(segmentedMessage(), () => "rewritten output");
    // The mention survives via the fallback instead of vanishing with the slot.
    expect(bubble.querySelectorAll(".persona-mention-token")).toHaveLength(1);
    expect(bubble.textContent).toContain("Check @App.tsx for errors");
    expect(bubble.textContent).not.toContain("rewritten output");
  });

  it("does not swap user-typed sentinel lookalikes", () => {
    // Real sentinel chars with a wrong nonce: must never match a slot.
    const lookalike = "\uE000abcdef:0\uE001";
    const bubble = createStandardBubble(
      makeMessage({
        role: "user",
        contentSegments: [
          { kind: "text", text: `pasted ${lookalike} ` },
          { kind: "mention", ref: { sourceId: "files", itemId: "app", label: "App.tsx" } },
        ],
      }),
      ({ text }) => text
    );
    // Only the real slot becomes a token; the lookalike stays literal text.
    expect(bubble.querySelectorAll(".persona-mention-token")).toHaveLength(1);
    expect(bubble.textContent).toContain(lookalike);
  });

  it("keeps mention slots through the real DOMPurify sanitizer", async () => {
    const { createDefaultSanitizer } = await import("../utils/sanitize");
    const sanitize = createDefaultSanitizer();
    const bubble = createStandardBubble(
      segmentedMessage(),
      ({ text }) => sanitize(`<p>${text}</p>`)
    );
    expect(bubble.querySelectorAll(".persona-mention-token")).toHaveLength(1);
    expect(bubble.querySelector("p")?.textContent).toBe("Check @App.tsx for errors");
  });

  it("swaps multiple mentions across transform-created blocks", () => {
    const bubble = createStandardBubble(
      makeMessage({
        role: "user",
        contentSegments: [
          { kind: "text", text: "compare " },
          { kind: "mention", ref: { sourceId: "files", itemId: "a", label: "a.ts" } },
          { kind: "text", text: "\n\nwith " },
          { kind: "mention", ref: { sourceId: "files", itemId: "b", label: "b.ts" } },
        ],
      }),
      ({ text }) =>
        text
          .split("\n\n")
          .map((p) => `<p>${p}</p>`)
          .join("")
    );
    const tokens = bubble.querySelectorAll(".persona-mention-token");
    expect(tokens).toHaveLength(2);
    const paragraphs = bubble.querySelectorAll("p");
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]?.textContent).toBe("compare @a.ts");
    expect(paragraphs[1]?.textContent).toBe("with @b.ts");
  });
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
  it("uses a compact user bubble and borderless assistant response in minimal style", () => {
    const userBubble = createStandardBubble(
      makeMessage({ id: "minimal-user", role: "user", content: "Question" }),
      ({ text }) => text,
      { layout: "minimal" }
    );
    const assistantBubble = createStandardBubble(
      makeMessage({
        id: "minimal-assistant",
        role: "assistant",
        content: "Answer",
      }),
      ({ text }) => text,
      { layout: "minimal" }
    );

    expect(userBubble.classList.contains("persona-bg-persona-accent")).toBe(true);
    expect(userBubble.classList.contains("persona-rounded-lg")).toBe(true);
    expect(userBubble.classList.contains("persona-px-3")).toBe(true);
    expect(assistantBubble.classList.contains("persona-bg-persona-container")).toBe(
      true
    );
    expect(assistantBubble.classList.contains("persona-rounded-lg")).toBe(true);
    expect(assistantBubble.classList.contains("persona-border")).toBe(false);
    expect(assistantBubble.classList.contains("persona-shadow-sm")).toBe(false);
  });

  it("removes role background chrome from flat messages", () => {
    const userMessage = createStandardBubble(
      makeMessage({ id: "flat-user", role: "user", content: "Question" }),
      ({ text }) => text,
      { layout: "flat" }
    );
    const assistantMessage = createStandardBubble(
      makeMessage({
        id: "flat-assistant",
        role: "assistant",
        content: "Answer",
      }),
      ({ text }) => text,
      { layout: "flat" }
    );

    expect(userMessage.style.backgroundColor).toBe("transparent");
    expect(assistantMessage.style.backgroundColor).toBe("transparent");
    expect(assistantMessage.style.color).toBe(
      "var(--persona-message-assistant-text, var(--persona-text))"
    );
    expect(assistantMessage.classList.contains("persona-text-persona-text")).toBe(
      true
    );
    expect(userMessage.classList.contains("persona-px-3")).toBe(false);
    expect(assistantMessage.classList.contains("persona-px-3")).toBe(false);
  });

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

describe("createStandardBubble: message actions", () => {
  const actions = { enabled: true, showCopy: true, visibility: "hover", align: "right", layout: "pill-inside" } as const;

  it("gives a voice caption no message actions", () => {
    const bubble = createStandardBubble(
      makeMessage({ id: "caption", content: "Okay, placing that now.", voiceCaption: true }),
      ({ text }) => text,
      undefined,
      actions
    );
    expect(bubble.querySelector(".persona-message-actions")).toBeNull();
  });

  it("keeps the copy action on an ordinary short reply", () => {
    const bubble = createStandardBubble(makeMessage({ content: "Sure." }), ({ text }) => text, undefined, actions);
    expect(bubble.querySelector('[data-action="copy"]')).not.toBeNull();
  });
});

describe("createStandardBubble: components.message geometry tokens", () => {
  const geometry = (bubble: HTMLElement) => ({
    padding: bubble.style.padding,
    fontSize: bubble.style.fontSize,
    lineHeight: bubble.style.lineHeight,
    fontFamily: bubble.style.fontFamily,
  });

  const geometryConfig = (
    message: Record<string, Record<string, string>>
  ): AgentWidgetConfig =>
    ({ theme: { components: { message } } }) as unknown as AgentWidgetConfig;

  it("leaves geometry unstamped when no tokens are configured", () => {
    const bubble = createStandardBubble(
      makeMessage({ id: "geo-none", role: "user", content: "Hi" }),
      ({ text }) => text
    );
    expect(geometry(bubble)).toEqual({
      padding: "",
      fontSize: "",
      lineHeight: "",
      fontFamily: "",
    });
  });

  it.each([false, true])("consumes selected default geometry with v5Defaults=%s", (v5Defaults) => {
    for (const role of ["user", "assistant"] as const) {
      const bubble = createStandardBubble(
        makeMessage({ id: `default-${role}`, role, content: "Hi" }),
        ({ text }) => text, undefined, undefined, undefined,
        { widgetConfig: { future: { v5Defaults } } as AgentWidgetConfig }
      );
      expect(bubble.style.padding).toBe(v5Defaults
        ? `var(--persona-message-${role}-padding, 0.75rem 1.25rem)` : "");
      expect(bubble.style.lineHeight).toBe(v5Defaults
        ? `var(--persona-message-${role}-line-height, 1.75)` : "");
    }
  });

  it("routes each configured property through its role token with the bubble preset as fallback", () => {
    const bubble = createStandardBubble(
      makeMessage({ id: "geo-user", role: "user", content: "Hi" }),
      ({ text }) => text,
      undefined,
      undefined,
      undefined,
      {
        widgetConfig: geometryConfig({
          user: {
            padding: "1rem",
            fontSize: "16px",
            lineHeight: "1.5",
            fontFamily: "Georgia, serif",
          },
        }),
      }
    );
    expect(geometry(bubble)).toEqual({
      padding: "var(--persona-message-user-padding, 0.75rem 1.25rem)",
      fontSize: "var(--persona-message-user-font-size, 0.875rem)",
      lineHeight: "var(--persona-message-user-line-height, 1.75)",
      fontFamily: "var(--persona-message-user-font-family, inherit)",
    });
  });

  it("stamps only the configured keys", () => {
    const bubble = createStandardBubble(
      makeMessage({ id: "geo-partial", role: "assistant", content: "Hi" }),
      ({ text }) => text,
      undefined,
      undefined,
      undefined,
      { widgetConfig: geometryConfig({ assistant: { fontFamily: "Georgia, serif" } }) }
    );
    expect(geometry(bubble)).toEqual({
      padding: "",
      fontSize: "",
      lineHeight: "",
      fontFamily: "var(--persona-message-assistant-font-family, inherit)",
    });
  });

  it("uses the assistant token namespace for assistant and system bubbles", () => {
    for (const role of ["assistant", "system"] as const) {
      const bubble = createStandardBubble(
        makeMessage({ id: `geo-${role}`, role, content: "Hi" }),
        ({ text }) => text,
        undefined,
        undefined,
        undefined,
        { widgetConfig: geometryConfig({ assistant: { padding: "1rem" } }) }
      );
      expect(bubble.style.padding).toBe(
        "var(--persona-message-assistant-padding, 0.75rem 1.25rem)"
      );
    }
  });

  it("carries the minimal and flat presets in the fallback, not the bubble preset", () => {
    const minimal = createStandardBubble(
      makeMessage({ id: "geo-minimal", role: "user", content: "Hi" }),
      ({ text }) => text,
      { layout: "minimal" },
      undefined,
      undefined,
      { widgetConfig: geometryConfig({ user: { padding: "1rem" } }) }
    );
    expect(minimal.style.padding).toBe(
      "var(--persona-message-user-padding, 0.5rem 0.75rem)"
    );

    const flat = createStandardBubble(
      makeMessage({ id: "geo-flat", role: "assistant", content: "Hi" }),
      ({ text }) => text,
      { layout: "flat" },
      undefined,
      undefined,
      {
        widgetConfig: geometryConfig({
          assistant: { padding: "1rem", fontSize: "17px", lineHeight: "1.4" },
        }),
      }
    );
    expect(flat.style.padding).toBe(
      "var(--persona-message-assistant-padding, 0.5rem 0)"
    );
    expect(flat.style.fontSize).toBe(
      "var(--persona-message-assistant-font-size, inherit)"
    );
    expect(flat.style.lineHeight).toBe(
      "var(--persona-message-assistant-line-height, inherit)"
    );
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

describe("createStandardBubble: stopReason notice", () => {
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

  it("reports the tool limit without claiming the entire run stopped", () => {
    const bubble = renderWithStopReason({
      content: "Used a tool.",
      stopReason: "max_tool_calls",
    });
    const notice = bubble.querySelector(".persona-message-stop-reason");
    expect(notice).not.toBeNull();
    expect(notice?.getAttribute("data-stop-reason")).toBe("max_tool_calls");
    expect(notice?.textContent).toBe("Tool limit reached.");
  });

  it("reports an output token limit without requiring a follow-up", () => {
    const bubble = renderWithStopReason({
      content: "Long answer cut off.",
      stopReason: "length",
    });
    const notice = bubble.querySelector(".persona-message-stop-reason");
    expect(notice?.getAttribute("data-stop-reason")).toBe("length");
    expect(notice?.textContent).toBe("Output token limit reached.");
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

describe("createStandardBubble: audio/video/file content parts", () => {
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

describe("createStandardBubble: timestamp position", () => {
  it("tucks an inline timestamp inside the last content block so it trails the text", () => {
    const bubble = createStandardBubble(
      makeMessage({ content: "Hello there" }),
      ({ text }) => `<p>${text}</p>`,
      { timestamp: { show: true, position: "inline" } }
    );

    // Markdown content is block-wrapped; the inline timestamp must live inside
    // that block (trailing the text), not as a block sibling under the bubble.
    const inline = bubble.querySelector("p .persona-timestamp-inline");
    expect(inline).not.toBeNull();
    expect(inline?.textContent).toMatch(/\d/);
    expect(Array.from(bubble.children)).not.toContain(inline);
    // Must be an inline-level <span>; a <div> here is invalid inside a <p>.
    expect(inline?.tagName).toBe("SPAN");
  });

  it("uses an inline element that survives an innerHTML re-parse (idiomorph round-trip)", () => {
    const bubble = createStandardBubble(
      makeMessage({ content: "Hello there" }),
      ({ text }) => `<p>${text}</p>`,
      { timestamp: { show: true, position: "inline" } }
    );
    const content = bubble.querySelector(".persona-message-content") as HTMLElement;

    // Re-serializing + re-parsing is what the re-render path does. A <div>
    // inside a <p> would be auto-closed out to a sibling (leaving an empty
    // <p>), dropping the timestamp onto its own line; a <span> stays put.
    const serialized = content.innerHTML;
    content.innerHTML = serialized;

    expect(content.querySelector("p .persona-timestamp-inline")).not.toBeNull();
    const emptyParagraphs = Array.from(content.querySelectorAll("p")).filter(
      (p) => p.textContent === ""
    );
    expect(emptyParagraphs.length).toBe(0);
  });

  it("falls back to the content container for plain-text (non-block) content", () => {
    const bubble = createStandardBubble(
      makeMessage({ content: "Hello there" }),
      ({ text }) => text,
      { timestamp: { show: true, position: "inline" } }
    );

    const content = bubble.querySelector(".persona-message-content")!;
    const inline = content.querySelector(".persona-timestamp-inline");
    expect(inline).not.toBeNull();
    expect(content.contains(inline)).toBe(true);
  });

  it("renders a below timestamp as a block under the content (direct bubble child)", () => {
    const bubble = createStandardBubble(
      makeMessage({ content: "Hello there" }),
      ({ text }) => `<p>${text}</p>`,
      { timestamp: { show: true, position: "below" } }
    );

    // "below" must not produce an inline timestamp, and the timestamp block is
    // appended to the bubble (under the content), not nested in the content.
    expect(bubble.querySelector(".persona-timestamp-inline")).toBeNull();
    const below = Array.from(bubble.children).find(
      (el) =>
        el.classList.contains("persona-mt-1") &&
        el.classList.contains("persona-text-xs")
    );
    expect(below).toBeDefined();
    expect(below?.textContent).toMatch(/\d/);
  });
});

describe("createMessageActions: chromeless action buttons", () => {
  const actionButtons = (row: HTMLElement) =>
    Array.from(row.querySelectorAll<HTMLButtonElement>("button[data-action]"));

  it.each([false, true])("hides built-in and custom actions until streaming ends (V5: %s)", (v5Defaults) => {
    const render = (streaming: boolean) => createStandardBubble(
      makeMessage({ content: "Partial answer", streaming }),
      ({ text }) => text,
      undefined,
      { visibility: "always", custom: [{ id: "share", label: "Share", onSelect: () => {} }] },
      undefined,
      { widgetConfig: { future: { v5Defaults } } as AgentWidgetConfig, actionEligibility: { isLastAssistant: true } }
    );
    expect(render(true).querySelector("[data-actions-for]")).toBeNull();
    expect(actionButtons(render(false)).map((button) => button.dataset.action)).toEqual(["copy", "custom:share"]);
  });

  it("keeps voting controls hidden unless explicitly enabled", () => {
    const row = createMessageActions(makeMessage({ id: "actions-default-votes" }), {});

    expect(actionButtons(row).map((btn) => btn.getAttribute("data-action"))).toEqual([
      "copy",
    ]);
  });

  it("styles every built-in action through the message-action class alone", () => {
    const row = createMessageActions(makeMessage({ id: "actions-builtin" }), {
      showCopy: true,
      showReadAloud: true,
      showUpvote: true,
      showDownvote: true,
    });

    const buttons = actionButtons(row);
    expect(buttons.map((btn) => btn.getAttribute("data-action"))).toEqual([
      "copy",
      "read-aloud",
      "upvote",
      "downvote",
    ]);
    for (const btn of buttons) {
      expect(btn.className).toBe("persona-message-action-btn");
    }
  });

  it("gives host-contributed custom actions the same single class", () => {
    const row = createMessageActions(makeMessage({ id: "actions-custom" }), {
      showCopy: false,
      showUpvote: false,
      showDownvote: false,
      custom: [
        { id: "share", label: "Share", iconName: "star", onSelect: () => {} },
      ],
    });

    const buttons = actionButtons(row);
    expect(buttons).toHaveLength(1);
    expect(buttons[0].getAttribute("data-action")).toBe("custom:share");
    expect(buttons[0].className).toBe("persona-message-action-btn");
  });
});

describe("createStandardBubble: operator role", () => {
  const actions = {
    enabled: true,
    showCopy: true,
    showUpvote: true,
    showDownvote: true,
    showReadAloud: true,
    showRegenerate: true,
    visibility: "hover",
    align: "right",
    layout: "pill-inside",
  } as const;

  it.each(["bubble", "minimal", "flat"] as const)(
    "gets its own bubble class, never the assistant's, in the %s layout",
    (layout) => {
      const classes = getBubbleClasses("operator", layout);
      expect(classes).toContain("persona-message-operator-bubble");
      expect(classes).not.toContain("persona-message-assistant-bubble");
      expect(classes).not.toContain("persona-message-user-bubble");
      // Same side as the assistant: never pushed to the user's edge.
      expect(classes).not.toContain("persona-ml-auto");
    }
  );

  it("paints from the operator tokens and marks its own theme zone", () => {
    const bubble = createStandardBubble(
      makeMessage({ id: "op-1", role: "operator", content: "Hi, Sam here." }),
      ({ text }) => text
    );
    expect(bubble.style.backgroundColor).toBe(
      "var(--persona-components-message-operator-background, var(--persona-container))"
    );
    expect(bubble.style.color).toBe(
      "var(--persona-components-message-operator-text, var(--persona-text))"
    );
    expect(bubble.getAttribute("data-persona-theme-zone")).toBe("operator-message");
  });

  it("keeps the existing roles' bubbles unchanged", () => {
    const assistant = createStandardBubble(makeMessage({ id: "a", content: "Answer" }), ({ text }) => text);
    const user = createStandardBubble(makeMessage({ id: "u", role: "user", content: "Q" }), ({ text }) => text);
    expect(assistant.getAttribute("data-persona-theme-zone")).toBe("assistant-message");
    expect(assistant.style.backgroundColor).toBe(
      "var(--persona-message-assistant-bg, var(--persona-container))"
    );
    expect(user.getAttribute("data-persona-theme-zone")).toBe("user-message");
    expect(user.style.backgroundColor).toBe("var(--persona-message-user-bg, var(--persona-accent))");
  });

  it("keeps the operator background in the flat layout, where assistant prose stays transparent", () => {
    const operator = createStandardBubble(
      makeMessage({ id: "flat-op", role: "operator", content: "Sam here." }),
      ({ text }) => text,
      { layout: "flat" }
    );
    const assistant = createStandardBubble(
      makeMessage({ id: "flat-a", content: "Answer" }),
      ({ text }) => text,
      { layout: "flat" }
    );
    expect(operator.style.backgroundColor).toBe(
      "var(--persona-components-message-operator-background, var(--persona-container))"
    );
    expect(operator.style.color).toBe(
      "var(--persona-components-message-operator-text, var(--persona-text))"
    );
    // The fill needs side padding; flat assistant prose has none.
    expect(operator.classList.contains("persona-px-3")).toBe(true);
    expect(assistant.style.backgroundColor).toBe("transparent");
    expect(assistant.classList.contains("persona-px-3")).toBe(false);
  });

  it("uses operator geometry tokens with the v5 defaults, not the flat assistant's", () => {
    const bubble = createStandardBubble(
      makeMessage({ id: "op-geo", role: "operator", content: "Hi" }),
      ({ text }) => text, undefined, undefined, undefined,
      { widgetConfig: { future: { v5Defaults: true } } as AgentWidgetConfig }
    );
    expect(bubble.style.padding).toBe("var(--persona-message-operator-padding, 0.75rem 1.25rem)");
    expect(bubble.style.padding).not.toContain("assistant");
  });

  it("offers copy but no model feedback, read-aloud or regenerate controls", () => {
    const bubble = createStandardBubble(
      makeMessage({ id: "op-actions", role: "operator", content: "I refunded it." }),
      ({ text }) => text,
      undefined,
      actions,
      undefined,
      { actionEligibility: { canRegenerate: true } }
    );
    const rendered = Array.from(bubble.querySelectorAll("[data-action]")).map((button) =>
      button.getAttribute("data-action")
    );
    expect(rendered).toEqual(["copy"]);
  });

  it("shows a custom action only when it opts into the operator role", () => {
    const custom = [
      { id: "assistant-only", label: "Assistant only", onSelect: () => {} },
      { id: "flag", label: "Flag", roles: ["operator" as const], onSelect: () => {} },
    ];
    const bubble = createStandardBubble(
      makeMessage({ id: "op-custom", role: "operator", content: "Hello" }),
      ({ text }) => text,
      undefined,
      { ...actions, showCopy: false, custom }
    );
    const rendered = Array.from(bubble.querySelectorAll("[data-action]")).map((button) =>
      button.getAttribute("data-action")
    );
    expect(rendered).toEqual(["custom:flag"]);
  });

  it("renders an operator avatar on the assistant side", () => {
    const wrapper = createStandardBubble(
      makeMessage({ id: "op-avatar", role: "operator", content: "Hello" }),
      ({ text }) => text,
      { avatar: { show: true, position: "left" } }
    );
    expect(wrapper.classList.contains("persona-message-with-avatar")).toBe(true);
    expect(wrapper.classList.contains("persona-flex-row-reverse")).toBe(false);
    const avatar = wrapper.firstElementChild as HTMLElement;
    expect(avatar.textContent).toBe("O");
    expect(avatar.classList.contains("persona-bg-persona-container")).toBe(true);
    expect(avatar.classList.contains("persona-bg-persona-primary")).toBe(false);

    const custom = createStandardBubble(
      makeMessage({ id: "op-avatar-url", role: "operator", content: "Hello" }),
      ({ text }) => text,
      { avatar: { show: true, operatorAvatar: "https://example.com/sam.png" } }
    );
    const img = custom.querySelector("img");
    expect(img?.getAttribute("src")).toBe("https://example.com/sam.png");
    expect(img?.getAttribute("alt")).toBe("Operator");
  });
});

describe("message meta", () => {
  it("renders nothing and keeps the bubble as the root without meta", () => {
    const bubble = createStandardBubble(makeMessage({ id: "plain", content: "Hi" }), ({ text }) => text);
    expect(bubble.classList.contains("persona-message-bubble")).toBe(true);
    expect(bubble.querySelector(".persona-message-meta")).toBeNull();
    expect(createMessageMeta("plain", undefined)).toBeNull();
    expect(createMessageMeta("plain", {})).toBeNull();
    expect(createMessageMeta("plain", { label: "  ", badges: [{ label: "" }], note: { text: "" } })).toBeNull();
  });

  it.each(["user", "assistant", "system", "operator"] as const)(
    "stacks a label, toned badges and a note under a %s bubble",
    (role) => {
      const root = createStandardBubble(
        makeMessage({
          id: `meta-${role}`,
          role,
          content: "Your order shipped.",
          meta: {
            label: "Agent",
            badges: [
              { label: "delivered", tone: "success" },
              { label: "pending", tone: "warning" },
              { label: "failed", tone: "danger" },
              { label: "2m ago" },
            ],
            note: { text: "Carrier rejected the message", tone: "danger" },
          },
        }),
        ({ text }) => text
      );

      expect(root.classList.contains("persona-message-stack")).toBe(true);
      expect(root.id).toBe(`stack-meta-${role}`);
      // The bubble keeps its own id, so morphs still match it.
      expect(root.firstElementChild?.id).toBe(`bubble-meta-${role}`);

      const row = root.querySelector(`[data-message-meta-for="meta-${role}"]`)!;
      expect(row.querySelector(".persona-message-meta-label")?.textContent).toBe("Agent");
      const badges = Array.from(row.querySelectorAll(".persona-message-meta-badge")).map((badge) => [
        badge.textContent,
        badge.getAttribute("data-tone"),
      ]);
      expect(badges).toEqual([
        ["delivered", "success"],
        ["pending", "warning"],
        ["failed", "danger"],
        ["2m ago", "neutral"],
      ]);
      const note = root.querySelector(".persona-message-meta-note")!;
      expect(note.textContent).toBe("Carrier rejected the message");
      expect(note.getAttribute("data-tone")).toBe("danger");
    }
  );

  it("renders host text as text, never as HTML", () => {
    const payload = '<img src=x onerror="window.__pwned=1"><b>bold</b>';
    const nodes = createMessageMeta("xss", {
      label: payload,
      badges: [{ label: payload }],
      note: { text: payload },
    })!;
    const host = document.createElement("div");
    host.append(...nodes);
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector("b")).toBeNull();
    expect(host.querySelector(".persona-message-meta-label")?.textContent).toBe(payload);
    expect(host.querySelector(".persona-message-meta-badge")?.textContent).toBe(payload);
    expect(host.querySelector(".persona-message-meta-note")?.textContent).toBe(payload);
  });

  it("falls back to neutral for an unknown tone", () => {
    const nodes = createMessageMeta("tone", {
      badges: [{ label: "odd", tone: "loud" as never }],
      note: { text: "odd", tone: '"><script>' as never },
    })!;
    const host = document.createElement("div");
    host.append(...nodes);
    expect(host.querySelector(".persona-message-meta-badge")?.getAttribute("data-tone")).toBe("neutral");
    expect(host.querySelector(".persona-message-meta-note")?.getAttribute("data-tone")).toBe("neutral");
  });

  it("renders a note on its own without an empty row", () => {
    const nodes = createMessageMeta("note-only", { note: { text: "Undelivered" } })!;
    expect(nodes).toHaveLength(1);
    expect(nodes[0].classList.contains("persona-message-meta-note")).toBe(true);
  });

  it("stacks meta under the avatar wrapper when avatars are shown", () => {
    const root = createStandardBubble(
      makeMessage({ id: "meta-avatar", role: "operator", content: "Hi", meta: { label: "Human" } }),
      ({ text }) => text,
      { avatar: { show: true } }
    );
    expect(root.classList.contains("persona-message-stack")).toBe(true);
    expect(root.firstElementChild?.classList.contains("persona-message-with-avatar")).toBe(true);
    expect(root.querySelector(".persona-message-meta-label")?.textContent).toBe("Human");
  });

  it("puts the meta right under the text, before an always-visible action bar", () => {
    const root = createStandardBubble(
      makeMessage({ id: "meta-actions", content: "Refund sent.", meta: { label: "Agent" } }),
      ({ text }) => text,
      undefined,
      { enabled: true, showCopy: true, visibility: "always", align: "right", layout: "pill-inside" }
    );
    const children = Array.from(root.children);
    expect(children.map((child) => child.className.split(" ")[0])).toEqual([
      "persona-message-bubble",
      "persona-message-meta",
      "persona-message-actions",
    ]);
    // Still delegated by message id, so the click handler finds it.
    expect(children[2].getAttribute("data-actions-for")).toBe("meta-actions");
    expect(root.querySelector(".persona-message-bubble .persona-message-actions")).toBeNull();
  });

  it("keeps a hover action bar inside the bubble it overlays", () => {
    const root = createStandardBubble(
      makeMessage({ id: "meta-hover", content: "Refund sent.", meta: { label: "Agent" } }),
      ({ text }) => text,
      undefined,
      { enabled: true, showCopy: true, visibility: "hover", align: "right", layout: "pill-inside" }
    );
    expect(root.lastElementChild?.classList.contains("persona-message-meta")).toBe(true);
    expect(root.querySelector(".persona-message-bubble > .persona-message-actions")).not.toBeNull();
  });

  it("leaves the action bar inside the bubble when there is no meta", () => {
    const bubble = createStandardBubble(
      makeMessage({ id: "no-meta-actions", content: "Refund sent." }),
      ({ text }) => text,
      undefined,
      { enabled: true, showCopy: true, visibility: "always", align: "right", layout: "pill-inside" }
    );
    expect(bubble.classList.contains("persona-message-bubble")).toBe(true);
    expect(bubble.querySelector(":scope > .persona-message-actions")).not.toBeNull();
  });
});
