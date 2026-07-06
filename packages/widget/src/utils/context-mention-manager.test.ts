// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { ContextMentionManager, refFromItem } from "./context-mention-manager";
import type {
  AgentWidgetConfig,
  AgentWidgetContextMentionConfig,
  AgentWidgetContextMentionItem,
  AgentWidgetContextMentionPayload,
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
  const announce = vi.fn();
  const announceError = vi.fn();
  const manager = new ContextMentionManager({
    mentionConfig,
    contextRow,
    getMessages: () => [],
    getConfig: () => ({}) as AgentWidgetConfig,
    getComposerText: () => "hello",
    announce,
    announceError,
  });
  const source: AgentWidgetContextMentionSource = {
    id: "files",
    label: "Files",
    search: () => [],
    resolve: sourceResolve ?? (async () => ({ llmAppend: "CONTENT" })),
  };
  return { manager, contextRow, mentionConfig, source, announce, announceError };
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

  it("reuses the in-flight resolve at submit (no duplicate fetch, survives clear)", async () => {
    // Resolve stays pending until we release it — mirrors a submit that fires
    // before the select-time resolve has settled.
    let release!: (v: AgentWidgetContextMentionPayload) => void;
    const resolve = vi.fn(
      () => new Promise<AgentWidgetContextMentionPayload>((r) => (release = r))
    );
    const { manager, contextRow, source } = makeManager({}, resolve);
    manager.add(source, item("App.tsx"));
    expect(resolve).toHaveBeenCalledTimes(1);

    // Submit path: collect (detaches ownership) then the UI's post-send clear().
    const { finalize } = manager.collectForSubmit();
    expect(contextRow.querySelectorAll("[data-persona-mention-chip]")).toHaveLength(0);
    manager.clear(); // must NOT abort the collected in-flight resolve

    // The select-time resolve settles after collect+clear; finalize reuses it.
    release({ llmAppend: "FILE BODY" });
    const bundle = await finalize();
    expect(resolve).toHaveBeenCalledTimes(1); // never re-fetched
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
    const { manager, contextRow, source } = makeManager();
    manager.add(source, item("a"));
    manager.add(source, item("b"));
    expect(contextRow.querySelectorAll(".persona-mention-chip")).toHaveLength(2);
    expect(manager.removeLast()).toBe(true);
    const labels = Array.from(
      contextRow.querySelectorAll(".persona-mention-chip-label")
    ).map((el) => el.textContent);
    expect(labels).toEqual(["a"]);
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

  it("announces a select-resolve failure through the assertive region", async () => {
    const resolve = vi.fn(async () => {
      throw new Error("boom");
    });
    const { manager, announceError } = makeManager({}, resolve);
    manager.add(makeSource(resolve), item("bad", "Bad File"));
    await tick();
    expect(announceError).toHaveBeenCalledWith(
      "Couldn't attach Bad File to context"
    );
  });

  it("forwards the resolved payload to renderMentionChip once ready", async () => {
    const seen: (AgentWidgetContextMentionPayload | undefined)[] = [];
    const renderMentionChip = vi.fn((ctx) => {
      seen.push(ctx.payload);
      const el = document.createElement("span");
      el.className = "custom-chip";
      el.dataset.status = ctx.status;
      return el;
    });
    const resolve = vi.fn(async () => ({ llmAppend: "FILE BODY" }));
    const { manager, source } = makeManager({ renderMentionChip }, resolve);
    manager.add(source, item("App.tsx"));
    // First render is the resolving state, before resolve() settles: no payload.
    expect(seen[0]).toBeUndefined();
    await tick();
    // After resolve, the renderer is re-invoked with status "ready" + the payload.
    expect(seen.at(-1)).toEqual({ llmAppend: "FILE BODY" });
    expect(renderMentionChip).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "ready",
        payload: { llmAppend: "FILE BODY" },
      })
    );
  });

  it("does not expose a payload to renderMentionChip for resolveOn:'submit' sources", async () => {
    const seen: (AgentWidgetContextMentionPayload | undefined)[] = [];
    const renderMentionChip = vi.fn((ctx) => {
      seen.push(ctx.payload);
      const el = document.createElement("span");
      el.dataset.status = ctx.status;
      return el;
    });
    const { manager } = makeManager({ renderMentionChip });
    const source: AgentWidgetContextMentionSource = {
      id: "page",
      label: "Page",
      search: () => [],
      resolve: async () => ({ llmAppend: "LIVE" }),
      resolveOn: "submit",
    };
    manager.add(source, item("hero"));
    await tick();
    // Submit sources flip straight to "ready" with no payload until send time.
    expect(seen.every((p) => p === undefined)).toBe(true);
  });

  it("namespaces opt-in context by source + item", async () => {
    const resolve = async () => ({ context: { path: "/x" } });
    const { manager } = makeManager({}, resolve);
    manager.add(makeSource(resolve, "files"), item("App.tsx"));
    await tick();
    const bundle = await manager.collectForSubmit().finalize();
    expect(bundle.context).toEqual({ files: { "App.tsx": { path: "/x" } } });
  });

  // ---- inline mode (track / admit / refFromItem) ---------------------------

  it("refFromItem builds the stored ref from source + item", () => {
    const source = makeSource(async () => ({}), "files");
    expect(
      refFromItem(source, {
        id: "app",
        label: "App.tsx",
        iconName: "file",
        color: "#f00",
      })
    ).toEqual({
      sourceId: "files",
      itemId: "app",
      label: "App.tsx",
      iconName: "file",
      color: "#f00",
    });
  });

  it("admit enforces the limit and fires the rejection hook (inline pre-insert gate)", () => {
    const onMentionRejected = vi.fn();
    const { manager, source } = makeManager({ maxMentions: 1, onMentionRejected });
    manager.track("pmention-1", source, item("a"));
    expect(manager.admit(source, item("b"))).toBe(false);
    expect(onMentionRejected).toHaveBeenCalledWith(
      expect.objectContaining({ id: "b" }),
      "limit"
    );
  });

  it("admit allows a mention under the limit", () => {
    const { manager, source } = makeManager({ maxMentions: 2 });
    manager.track("pmention-1", source, item("a"));
    expect(manager.admit(source, item("b"))).toBe(true);
  });

  it("admit rejects a duplicate of an already-tracked mention (chip parity, no double payload)", async () => {
    // Inline entries are keyed by ComposerMentionId, so duplicate detection must
    // match on the ref (source + item) — a repeated pick of the same item would
    // otherwise double-emit its payload at finalize().
    const onMentionRejected = vi.fn();
    const { manager, source } = makeManager({ onMentionRejected });
    manager.track("pmention-1", source, item("a"));
    expect(manager.admit(source, item("a"))).toBe(false);
    expect(onMentionRejected).toHaveBeenCalledWith(
      expect.objectContaining({ id: "a" }),
      "duplicate"
    );
    // A different item from the same source is still admitted.
    expect(manager.admit(source, item("b"))).toBe(true);

    // The single tracked mention emits exactly one payload.
    await tick();
    const bundle = await manager.collectForSubmit().finalize();
    expect(bundle.llmEntries).toHaveLength(1);
  });

  it("admit also rejects a duplicate of a chip added via add()", () => {
    const onMentionRejected = vi.fn();
    const { manager, source } = makeManager({ onMentionRejected });
    manager.add(source, item("a"));
    expect(manager.admit(source, item("a"))).toBe(false);
    expect(onMentionRejected).toHaveBeenCalledWith(
      expect.objectContaining({ id: "a" }),
      "duplicate"
    );
  });

  it("track reports resolve status onto the inline token (resolved / error)", async () => {
    // Success: reports "resolved" once the select-time resolve settles.
    const ok = makeManager({}, async () => ({ llmAppend: "CONTENT" }));
    const okReports: string[] = [];
    ok.manager.track("pmention-1", ok.source, item("good"), "", (s) =>
      okReports.push(s)
    );
    await tick();
    expect(okReports).toContain("resolved");

    // Failure: reports "error" so the token surfaces the dropped context.
    const badResolve = vi.fn(async () => {
      throw new Error("boom");
    });
    const bad = makeManager({}, badResolve);
    const badReports: string[] = [];
    bad.manager.track("pmention-2", bad.source, item("bad"), "", (s) =>
      badReports.push(s)
    );
    await tick();
    expect(badReports).toContain("error");
  });
});

function makeSource(
  resolve: AgentWidgetContextMentionSource["resolve"],
  id = "files"
): AgentWidgetContextMentionSource {
  return { id, label: "Files", search: () => [], resolve };
}
