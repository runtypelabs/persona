// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  AgentWidgetContextMentionConfig,
  AgentWidgetContextMentionPayload,
  AgentWidgetContextMentionSource,
} from "../types";
import { ContextMentionManager, refFromItem } from "./context-mention-manager";
import { createTextareaComposerInput } from "./composer-input";
import { createContentEditableComposerInput, MENTION_TOKEN_CLASS } from "./composer-contenteditable";

function setup(source: AgentWidgetContextMentionSource, display: "chip" | "inline" = "chip") {
  const contextRow = document.createElement("div");
  const config: AgentWidgetContextMentionConfig = { enabled: true, display, sources: [source] };
  const manager = new ContextMentionManager({
    mentionConfig: config,
    contextRow,
    getMessages: () => [],
    getConfig: () => ({}),
    getComposerText: () => "Review this document",
    announce: vi.fn(),
  });
  const textarea = document.createElement("textarea");
  const input = createTextareaComposerInput(textarea);
  document.body.append(contextRow, textarea);
  return { manager, config, contextRow, input };
}

function fileSource(resolve: AgentWidgetContextMentionSource["resolve"]): AgentWidgetContextMentionSource {
  return { id: "files", label: "Files", search: () => [], resolve };
}

function deferred() {
  let resolve!: (payload: AgentWidgetContextMentionPayload) => void;
  const promise = new Promise<AgentWidgetContextMentionPayload>((settle) => { resolve = settle; });
  return { promise, resolve };
}

afterEach(() => { document.body.replaceChildren(); });

describe("context mention conversation drafts", () => {
  it("restores ready context chips and their resolved content without fetching again", async () => {
    const resolve = vi.fn(async () => ({ llmAppend: "The reviewed project brief" }));
    const source = fileSource(resolve);
    const { manager, contextRow, input } = setup(source);
    manager.add(source, { id: "brief", label: "Project brief" });
    await vi.waitFor(() => expect(contextRow.querySelector("[data-status='ready']")).not.toBeNull());
    const draft = manager.captureDraft();

    manager.clear();
    manager.add(source, { id: "other", label: "Another conversation's file" });
    manager.restoreDraft(draft, input);

    expect(manager.getRefs()).toEqual([{ sourceId: "files", itemId: "brief", label: "Project brief", iconName: undefined, color: undefined }]);
    expect(contextRow.textContent).toContain("Project brief");
    expect(contextRow.textContent).not.toContain("Another conversation");
    expect(contextRow.querySelector("[data-persona-mention-chip]")?.getAttribute("data-status")).toBe("ready");
    expect(resolve).toHaveBeenCalledTimes(2); // One original context and one other conversation's context.
    const bundle = await manager.collectForSubmit().finalize();
    expect(bundle.blocks).toEqual(["```Project brief\nThe reviewed project brief\n```"]);
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it("restarts pending resolution on return and ignores a late result from the abandoned conversation", async () => {
    const original = deferred();
    const restarted = deferred();
    const resolve = vi.fn<AgentWidgetContextMentionSource["resolve"]>()
      .mockReturnValueOnce(original.promise)
      .mockReturnValueOnce(restarted.promise);
    const source = fileSource(resolve);
    const { manager, contextRow, input } = setup(source);
    manager.add(source, { id: "brief", label: "Project brief" }, "selected section");
    const originalSignal = resolve.mock.calls[0][1].signal;
    const draft = manager.captureDraft();
    manager.clear();
    expect(originalSignal.aborted).toBe(true);

    manager.restoreDraft(draft, input);
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(resolve.mock.calls[1][1].signal.aborted).toBe(false);
    expect(resolve.mock.calls[1][1].args).toBe("selected section");
    original.resolve({ llmAppend: "Late stale context" });
    await Promise.resolve();
    await Promise.resolve();
    expect(contextRow.querySelector("[data-persona-mention-chip]")?.getAttribute("data-status")).toBe("resolving");

    restarted.resolve({ llmAppend: "Current context" });
    const bundle = await manager.collectForSubmit().finalize();
    expect(bundle.blocks).toEqual(["```Project brief\nCurrent context\n```"]);
    expect(bundle.blocks.join("\n")).not.toContain("Late stale context");
  });

  it("drops context whose source is no longer configured instead of sending stale context", async () => {
    const resolve = vi.fn(async () => ({ llmAppend: "Removed source's private content" }));
    const source = fileSource(resolve);
    const { manager, config, contextRow, input } = setup(source);
    manager.add(source, { id: "brief", label: "Project brief" });
    await vi.waitFor(() => expect(contextRow.querySelector("[data-status='ready']")).not.toBeNull());
    const draft = manager.captureDraft();
    config.sources = [];
    manager.restoreDraft(draft, input);

    expect(manager.getRefs()).toEqual([]);
    expect(contextRow.querySelector("[data-persona-mention-chip]")).toBeNull();
    expect(contextRow.style.display).toBe("none");
    expect((await manager.collectForSubmit().finalize()).blocks).toEqual([]);
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it("uses the current resolver when a pending context source has been replaced", async () => {
    const original = deferred();
    const originalResolve = vi.fn(() => original.promise);
    const source = fileSource(originalResolve);
    const { manager, config, input } = setup(source);
    manager.add(source, { id: "brief", label: "Project brief" });
    const draft = manager.captureDraft();
    const currentResolve = vi.fn(async () => ({ llmAppend: "Context from the current workspace" }));
    config.sources = [fileSource(currentResolve)];
    manager.restoreDraft(draft, input);
    original.resolve({ llmAppend: "Context from the former workspace" });

    expect((await manager.collectForSubmit().finalize()).blocks).toEqual(["```Project brief\nContext from the current workspace\n```"]);
    expect(originalResolve).toHaveBeenCalledTimes(1);
    expect(currentResolve).toHaveBeenCalledTimes(1);
  });

  it("restores inline prose with stable mention identities and visible resolve errors", async () => {
    const resolve = vi.fn<AgentWidgetContextMentionSource["resolve"]>(async (item) => {
      if (item.id === "missing") throw new Error("Document unavailable");
      return { llmAppend: "The overview body" };
    });
    const source = fileSource(resolve);
    const { manager, contextRow } = setup(source, "inline");
    let sequence = 0;
    const inline = createContentEditableComposerInput({
      generateId: () => `inline-${++sequence}`,
      renderToken: (ref) => {
        const token = document.createElement("span");
        token.className = MENTION_TOKEN_CLASS;
        token.setAttribute("aria-label", `${ref.label} mention`);
        token.setAttribute("title", ref.label);
        token.textContent = `@${ref.label}`;
        return token;
      },
    });
    document.body.append(inline.element);
    inline.setValueWithCaret("Compare ", 8);
    const overview = { id: "overview", label: "Overview" };
    const overviewId = inline.insertMentionAtSelection!(refFromItem(source, overview));
    manager.track(overviewId, source, overview, "", (status) => inline.setMentionStatus!(overviewId, status));
    const end = inline.getLogicalText().length;
    inline.replaceLogicalRange!(end, end, " with ");
    const missing = { id: "missing", label: "Unavailable file" };
    const missingId = inline.insertMentionAtSelection!(refFromItem(source, missing));
    manager.track(missingId, source, missing, "", (status) => inline.setMentionStatus!(missingId, status));
    await vi.waitFor(() => expect(inline.element.querySelector(".persona-mention-token-error")).not.toBeNull());
    const documentDraft = inline.getDocument!();
    const textBefore = inline.getValue();
    const mentionDraft = manager.captureDraft();

    manager.clear();
    inline.setValueWithCaret("A different conversation", 0);
    inline.setDocument!(documentDraft);
    manager.restoreDraft(mentionDraft, inline);

    expect(inline.getValue()).toBe(textBefore);
    expect(inline.getDocument!().blocks.filter(block => block.kind === "mention").map(block => block.id)).toEqual([overviewId, missingId]);
    expect(contextRow.querySelector("[data-persona-mention-chip]")).toBeNull();
    expect(inline.element.querySelector(`[data-mention-id='${overviewId}']`)?.classList.contains("persona-mention-token-error")).toBe(false);
    expect(inline.element.querySelector(`[data-mention-id='${missingId}']`)?.getAttribute("aria-label")).toContain("failed to attach context");
    expect(resolve).toHaveBeenCalledTimes(2);
    expect((await manager.collectForSubmit().finalize()).blocks).toEqual(["```Overview\nThe overview body\n```"]);
  });
});
