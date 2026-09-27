// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import type { AgentWidgetMessage } from "@runtypelabs/persona";

import { createDeepWikiToolPlugin, renderDeepWikiCard } from "./deepwiki-tool-plugin";

type ToolCall = NonNullable<AgentWidgetMessage["toolCall"]>;

const render = (toolCall: Partial<ToolCall>) =>
  renderDeepWikiCard({ id: "t1", status: "running", ...toolCall } as ToolCall);

const text = (card: HTMLElement, cls: string) =>
  card.querySelector(`.persona-deepwiki-card__${cls}`)?.textContent ?? null;

describe("DeepWiki tool card", () => {
  it("claims only DeepWiki tools and falls through for the rest", () => {
    const plugin = createDeepWikiToolPlugin();
    const call = (name: string) =>
      plugin.renderToolCall!({
        message: { id: "m", role: "assistant", content: "", variant: "tool", toolCall: { id: "t", name, status: "running" } } as AgentWidgetMessage,
        defaultRenderer: () => document.createElement("div"),
        config: {},
      });
    expect(call("mcp_custom_deepwiki_ask_question")).not.toBeNull();
    expect(call("get_weather")).toBeNull();
  });

  it("shows the in-flight question from partially streamed args", () => {
    const card = render({
      name: "mcp_custom_deepwiki_ask_question",
      args: '{"repoName":"runtypelabs/persona","question":"How does stream',
    });
    expect(card.dataset.state).toBe("running");
    expect(text(card, "action")).toBe("Asking the wiki");
    expect(text(card, "question")).toBe("How does stream");
    expect(text(card, "repo")).toBe("runtypelabs/persona");
    expect(card.querySelector(".persona-deepwiki-card__clock")).not.toBeNull();
  });

  it("summarizes a completed lookup with timing and an answer peek", () => {
    const card = render({
      name: "mcp_custom_deepwiki_ask_question",
      status: "complete",
      args: { question: "How does streaming work?" },
      result: { content: [{ type: "text", text: "## Streaming\n\nPersona parses **SSE** events." }] },
      durationMs: 2140,
    });
    expect(card.dataset.state).toBe("done");
    expect(text(card, "action")).toBe("Asked the wiki");
    expect(text(card, "status")).toBe("Done · 2.1s");
    expect(text(card, "peek")).toBe("Streaming Persona parses SSE events.");
    expect(card.querySelector("a")?.getAttribute("href")).toBe("https://deepwiki.com/runtypelabs/persona");
  });

  it("flags failures", () => {
    const card = render({ name: "deepwiki_read_wiki_structure", status: "complete", success: false, error: "timeout" });
    expect(card.dataset.state).toBe("error");
    expect(text(card, "status")).toBe("Failed");
  });
});
