import { describe, expect, it, vi } from "vitest";

import { createComposerStore } from "./composer-store";
import type { AgentWidgetContextMentionRef } from "../types";

const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve));

describe("createComposerStore", () => {
  it("starts idle with an empty draft", () => {
    const store = createComposerStore();
    const state = store.getState();
    expect(state.text).toBe("");
    expect(state.attachments).toEqual([]);
    expect(state.mentionRefs).toEqual([]);
    expect(state.phase).toBe("idle");
    expect(state.inputDisabled).toBe(false);
    expect(state.sendDisabled).toBe(false);
  });

  it("ships the reserved fields empty", () => {
    const state = createComposerStore().getState();
    expect(state.selectedModelId).toBeUndefined();
    expect(state.activeModeIds).toEqual([]);
    expect(state.quote).toBeUndefined();
    expect(state.pendingSubmission).toBeUndefined();
  });

  it("returns a frozen view that cannot be mutated back into the store", () => {
    const store = createComposerStore();
    store.setText("hello");
    const state = store.getState();
    expect(Object.isFrozen(state)).toBe(true);
    try {
      (state as { text: string }).text = "tampered";
    } catch {
      /* strict mode throws; sloppy mode silently ignores */
    }
    try {
      (state.attachments as unknown as unknown[]).push({});
    } catch {
      /* frozen array */
    }
    expect(store.getState().text).toBe("hello");
    expect(store.getState().attachments).toEqual([]);
  });

  it("coalesces rapid text changes into one notification", async () => {
    const store = createComposerStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.setText("h");
    store.setText("he");
    store.setText("hel");
    expect(listener).not.toHaveBeenCalled();

    await flush();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].text).toBe("hel");
  });

  it("does not notify when a setter writes the same value", async () => {
    const store = createComposerStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.setText("");
    store.setStreaming(false);
    store.setMentionRefs([]);
    await flush();
    expect(listener).not.toHaveBeenCalled();
  });

  it("derives phase idle to preparing to streaming and back", async () => {
    const store = createComposerStore();
    const phases: string[] = [];
    store.subscribe((state) => phases.push(state.phase));

    expect(store.getState().phase).toBe("idle");
    store.setPreparing(true);
    await flush();
    expect(store.getState().phase).toBe("preparing");
    expect(store.getState().sendDisabled).toBe(true);

    // Streaming begins while the submission is still preparing: preparing wins
    // until it clears.
    store.setStreaming(true);
    store.setPreparing(false);
    await flush();
    expect(store.getState().phase).toBe("streaming");

    store.setStreaming(false);
    await flush();
    expect(store.getState().phase).toBe("idle");
    expect(phases).toEqual(["preparing", "streaming", "idle"]);
  });

  it("reports the effective send lock: config flag, input lock, or phase", async () => {
    const store = createComposerStore();
    expect(store.getState().sendDisabled).toBe(false);

    store.setSendDisabled(true);
    await flush();
    expect(store.getState().sendDisabled).toBe(true);
    // The input stays editable: sendDisabled is not inputDisabled.
    expect(store.getState().inputDisabled).toBe(false);

    store.setSendDisabled(false);
    store.setInputDisabled(true);
    await flush();
    expect(store.getState().inputDisabled).toBe(true);
    // A locked input implies no submission.
    expect(store.getState().sendDisabled).toBe(true);

    store.setInputDisabled(false);
    await flush();
    expect(store.getState().sendDisabled).toBe(false);
  });

  it("copies attachment and mention lists into the view", async () => {
    const store = createComposerStore();
    const attachments = [
      {
        id: "a1",
        name: "notes.pdf",
        mimeType: "application/pdf",
        size: 10,
        status: "ready" as const,
      },
    ];
    const refs = [
      { id: "m1", label: "Page", type: "page" },
    ] as unknown as AgentWidgetContextMentionRef[];

    store.setAttachments(attachments);
    store.setMentionRefs(refs);

    attachments.length = 0;
    refs.length = 0;

    const state = store.getState();
    expect(state.attachments).toHaveLength(1);
    expect(state.attachments[0].name).toBe("notes.pdf");
    expect(state.mentionRefs).toHaveLength(1);
  });

  it("stops notifying after destroy and unsubscribe", async () => {
    const store = createComposerStore();
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribe = store.subscribe(first);
    store.subscribe(second);

    unsubscribe();
    store.setText("a");
    await flush();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);

    store.destroy();
    store.setText("b");
    await flush();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("survives a throwing listener", async () => {
    const store = createComposerStore();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const good = vi.fn();
    store.subscribe(() => {
      throw new Error("boom");
    });
    store.subscribe(good);
    store.setText("x");
    await flush();
    expect(good).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});
