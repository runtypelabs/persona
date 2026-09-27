// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import type { AgentWidgetMessage } from "@runtypelabs/persona";

import { createDeepWikiToolPlugin, renderDeepWikiCard } from "./deepwiki-tool-plugin";

type ToolCall = NonNullable<AgentWidgetMessage["toolCall"]>;

const render = (toolCall: Partial<ToolCall>, options?: Parameters<typeof renderDeepWikiCard>[1]) =>
  renderDeepWikiCard({ id: "t1", status: "running", ...toolCall } as ToolCall, options);

const text = (card: HTMLElement, cls: string) =>
  card.querySelector(`.persona-deepwiki-card__${cls}`)?.textContent ?? null;

const renderVia = (plugin: ReturnType<typeof createDeepWikiToolPlugin>, name: string) =>
  plugin.renderToolCall!({
    message: { id: "m", role: "assistant", content: "", variant: "tool", toolCall: { id: "t", name, status: "running" } } as AgentWidgetMessage,
    defaultRenderer: () => document.createElement("div"),
    config: {},
  });

describe("DeepWiki tool card", () => {
  it("claims only DeepWiki tools by default and honors a custom matcher", () => {
    const plugin = createDeepWikiToolPlugin();
    expect(renderVia(plugin, "mcp_custom_deepwiki_ask_wiki_question")).not.toBeNull();
    expect(renderVia(plugin, "get_weather")).toBeNull();

    const custom = createDeepWikiToolPlugin({ match: (name) => name === "wiki_lookup" });
    expect(renderVia(custom, "wiki_lookup")).not.toBeNull();
    expect(renderVia(custom, "mcp_custom_deepwiki_ask_wiki_question")).toBeNull();
  });

  it("shows the in-flight question from partially streamed args", () => {
    const card = render({
      name: "mcp_custom_deepwiki_ask_wiki_question",
      args: '{"repoName":"runtypelabs/persona","question":"How does stream',
    });
    expect(card.dataset.state).toBe("running");
    expect(text(card, "action")).toBe("Asking the wiki");
    expect(text(card, "question")).toBe("How does stream");
    expect(text(card, "repo")).toBe("runtypelabs/persona");
    expect(card.querySelector(".persona-deepwiki-card__clock")).not.toBeNull();
  });

  it("is a labelled group, not a live region, with decorative motion hidden", () => {
    const card = render({ name: "deepwiki_ask_wiki_question" }, { runningPhrases: ["One", "Two"] });
    expect(card.getAttribute("role")).toBe("group");
    expect(card.getAttribute("aria-label")).toBe("DeepWiki: Asking the wiki");
    const ticker = card.querySelector(".persona-deepwiki-card__ticker")!;
    expect(ticker.getAttribute("aria-hidden")).toBe("true");
    expect([...ticker.children].map((span) => span.textContent)).toEqual(["One", "Two"]);
    expect(ticker.lastElementChild?.hasAttribute("data-last")).toBe(true);
  });

  it("links to the answer's DeepWiki permalink when the result carries one", () => {
    const card = render({
      name: "mcp_custom_deepwiki_ask_wiki_question",
      status: "complete",
      args: { question: "How does streaming work?" },
      result: {
        content: [
          {
            type: "text",
            text:
              "## Streaming\n\nPersona parses **SSE** events.\n\nView this search on DeepWiki: https://deepwiki.com/search/how-does-streaming-work_bcbf35f2-3700",
          },
        ],
      },
      durationMs: 2140,
    });
    expect(card.dataset.state).toBe("done");
    expect(text(card, "action")).toBe("Asked the wiki");
    expect(text(card, "status")).toBe("Done · 2.1s");
    expect(text(card, "peek")).toMatch(/^Streaming Persona parses SSE events\./);
    const link = card.querySelector("a")!;
    expect(link.getAttribute("href")).toBe("https://deepwiki.com/search/how-does-streaming-work_bcbf35f2-3700");
    expect(link.textContent).toBe("View this answer on DeepWiki ↗");
  });

  it("falls back to the repo wiki, rejecting malformed repo args", () => {
    const fallback = render(
      { name: "deepwiki_read_wiki_structure", status: "complete", args: { repoName: "javascript:alert(1)" }, result: "ok" },
      { defaultRepo: "runtypelabs/persona" }
    );
    expect(text(fallback, "repo")).toBe("runtypelabs/persona");
    expect(fallback.querySelector("a")?.getAttribute("href")).toBe("https://deepwiki.com/runtypelabs/persona");

    const noRepo = render({ name: "deepwiki_read_wiki_structure", status: "complete", result: "ok" });
    expect(noRepo.querySelector("a")).toBeNull();
  });

  it("flags failures", () => {
    const card = render({ name: "deepwiki_read_wiki_structure", status: "complete", success: false, error: "timeout" });
    expect(card.dataset.state).toBe("error");
    expect(text(card, "status")).toBe("Failed");
  });
});
