// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { ContextMentionManager } from "./context-mention-manager";
import type {
  AgentWidgetConfig,
  AgentWidgetContextMentionConfig,
  AgentWidgetContextMentionItem,
  AgentWidgetContextMentionSource,
} from "../types";

const tick = () => new Promise((r) => setTimeout(r, 0));

const item = (id: string, label = id): AgentWidgetContextMentionItem => ({ id, label });

function makeManager(
  overrides: Partial<AgentWidgetContextMentionConfig> = {},
  sourceResolve?: AgentWidgetContextMentionSource["resolve"]
) {
  const contextRow = document.createElement("div");
  const mentionConfig: AgentWidgetContextMentionConfig = {
    enabled: true,
    sources: [],
    ...overrides,
  };
  const manager = new ContextMentionManager({
    mentionConfig,
    contextRow,
    getMessages: () => [],
    getConfig: () => ({}) as AgentWidgetConfig,
    getComposerText: () => "hello",
    announce: vi.fn(),
  });
  const source: AgentWidgetContextMentionSource = {
    id: "files",
    label: "Files",
    search: () => [],
    resolve: sourceResolve ?? (async () => ({ llmAppend: "CONTENT" })),
  };
  return { manager, contextRow, mentionConfig, source };
}

describe("ContextMentionManager", () => {
  it("adds a chip and eagerly resolves on select (cached)", async () => {
    const resolve = vi.fn(async () => ({ llmAppend: "FILE BODY" }));
    const { manager, contextRow, source } = makeManager({}, resolve);
    expect(manager.add(source, item("App.tsx"))).toBe(true);
    expect(contextRow.querySelectorAll("[data-persona-mention-chip]")).toHaveLength(1);
    await tick();
    expect(resolve).toHaveBeenCalledTimes(1);

    const bundle = await manager.collectForSubmit().finalize();
    expect(resolve).toHaveBeenCalledTimes(1); // re-used the cached payload
    expect(bundle.llmEntries).toEqual([{ label: "App.tsx", text: "FILE BODY" }]);
  });

  it("rejects duplicates", () => {
    const onMentionRejected = vi.fn();
    const { manager, source } = makeManager({ onMentionRejected });
    manager.add(source, item("a"));
    expect(manager.add(source, item("a"))).toBe(false);
    expect(onMentionRejected).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }), "duplicate");
  });

  it("enforces maxMentions", () => {
    const onMentionRejected = vi.fn();
    const { manager, source } = makeManager({ maxMentions: 1, onMentionRejected });
    expect(manager.add(source, item("a"))).toBe(true);
    expect(manager.add(source, item("b"))).toBe(false);
    expect(onMentionRejected).toHaveBeenCalledWith(expect.objectContaining({ id: "b" }), "limit");
  });

  it("aborts an in-flight resolve when the chip is removed", async () => {
    let captured: AbortSignal | undefined;
    const resolve = vi.fn(
      (_i, ctx) =>
        new Promise<never>(() => {
          captured = ctx.signal;
        })
    );
    const { manager, contextRow, source } = makeManager({}, resolve as never);
    manager.add(source, item("App.tsx"));
    await tick();
    expect(captured?.aborted).toBe(false);
    (contextRow.querySelector(".persona-mention-chip-remove") as HTMLButtonElement).click();
    expect(captured?.aborted).toBe(true);
    expect(manager.hasMentions()).toBe(false);
  });

  it("removeLast pops the most recent chip", () => {
    const { manager, source } = makeManager();
    manager.add(source, item("a"));
    manager.add(source, item("b"));
    expect(manager.count()).toBe(2);
    expect(manager.removeLast()).toBe(true);
    expect(manager.getRefs().map((r) => r.itemId)).toEqual(["a"]);
  });

  it("defers resolve to submit for resolveOn:'submit' sources", async () => {
    const resolve = vi.fn(async () => ({ llmAppend: "LIVE PAGE" }));
    const { manager } = makeManager();
    const source: AgentWidgetContextMentionSource = {
      id: "page",
      label: "Page",
      search: () => [],
      resolve,
      resolveOn: "submit",
    };
    manager.add(source, item("hero"));
    await tick();
    expect(resolve).not.toHaveBeenCalled(); // deferred
    const bundle = await manager.collectForSubmit().finalize();
    expect(resolve).toHaveBeenCalledTimes(1); // resolved at submit
    expect(bundle.llmEntries).toEqual([{ label: "hero", text: "LIVE PAGE" }]);
  });

  it("drops a failed select-resolve and fires onMentionResolveError; still sends", async () => {
    const onMentionResolveError = vi.fn();
    const resolve = vi.fn(async () => {
      throw new Error("boom");
    });
    const { manager } = makeManager({ onMentionResolveError }, resolve);
    manager.add(makeSource(resolve), item("bad"));
    await tick();
    expect(onMentionResolveError).toHaveBeenCalledWith(
      expect.objectContaining({ id: "bad" }),
      expect.any(Error)
    );
    const bundle = await manager.collectForSubmit().finalize();
    expect(bundle.llmEntries).toEqual([]); // dropped
  });

  it("namespaces opt-in context by source + item", async () => {
    const resolve = async () => ({ context: { path: "/x" } });
    const { manager } = makeManager({}, resolve);
    manager.add(makeSource(resolve, "files"), item("App.tsx"));
    await tick();
    const bundle = await manager.collectForSubmit().finalize();
    expect(bundle.context).toEqual({ files: { "App.tsx": { path: "/x" } } });
  });
});

function makeSource(
  resolve: AgentWidgetContextMentionSource["resolve"],
  id = "files"
): AgentWidgetContextMentionSource {
  return { id, label: "Files", search: () => [], resolve };
}
