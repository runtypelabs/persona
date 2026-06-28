// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { createPauseBubble, resolveDurablePauseLabel } from "./pause-bubble";
import type {
  AgentWidgetConfig,
  AgentWidgetDurablePause,
  AgentWidgetMessage,
} from "../types";

const makeMessage = (
  durablePause: Partial<AgentWidgetDurablePause> & { awaitReason: string }
): AgentWidgetMessage => ({
  id: "pause-1",
  role: "assistant",
  content: "",
  createdAt: new Date().toISOString(),
  variant: "pause",
  streaming: true,
  durablePause: { resolved: false, ...durablePause },
});

describe("createPauseBubble", () => {
  it("renders a passive, non-interactive indicator while paused", () => {
    const bubble = createPauseBubble(makeMessage({ awaitReason: "crawl_pending" }));
    expect(bubble.style.display).not.toBe("none");
    // Passive: no buttons / inputs / resume affordance of any kind.
    expect(bubble.querySelectorAll("button, input, [role='button']").length).toBe(0);
    // Announces itself as a live status, not an interactive control.
    expect(bubble.getAttribute("role")).toBe("status");
    expect(bubble.getAttribute("data-bubble-type")).toBe("pause");
  });

  it("uses reason-specific default copy", () => {
    const crawl = createPauseBubble(makeMessage({ awaitReason: "crawl_pending" }));
    expect(crawl.textContent).toContain("Fetching pages");
    const poll = createPauseBubble(makeMessage({ awaitReason: "durable_poll" }));
    expect(poll.textContent).toContain("background");
  });

  it("falls back to generic copy for an unknown (forward-compat) reason", () => {
    const bubble = createPauseBubble(makeMessage({ awaitReason: "some_future_kind" }));
    expect(bubble.textContent).toContain("Working");
  });

  it("hides the bubble once the pause is resolved", () => {
    const bubble = createPauseBubble(
      makeMessage({ awaitReason: "crawl_pending", resolved: true })
    );
    expect(bubble.style.display).toBe("none");
    expect(bubble.getAttribute("aria-hidden")).toBe("true");
  });

  it("honors config.copy.durablePauseLabels overrides (per-reason and default)", () => {
    const durablePauseLabels: Record<string, string> = {};
    durablePauseLabels["crawl_pending"] = "Reading the site…";
    durablePauseLabels["default"] = "Hang tight…";
    const config = { copy: { durablePauseLabels } } as AgentWidgetConfig;
    expect(resolveDurablePauseLabel("crawl_pending", config)).toBe("Reading the site…");
    expect(resolveDurablePauseLabel("brand_new_reason", config)).toBe("Hang tight…");
  });
});
