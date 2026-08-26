// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { AttachmentManager, type PendingAttachment } from "./attachment-manager";
import type { AgentWidgetAttachmentAdapter, ContentPart } from "../types";

const textFile = (name = "notes.txt") =>
  new File(["notes"], name, { type: "text/plain" });

const part = (text: string): ContentPart => ({ type: "text", text });

/** Adapter whose `add` resolves/rejects on demand, with manual progress. */
function deferredAdapter() {
  const calls: Array<{
    file: File;
    signal: AbortSignal;
    onProgress: (value: number) => void;
    resolve: (part: ContentPart) => void;
    reject: (error: unknown) => void;
  }> = [];
  const adapter: AgentWidgetAttachmentAdapter = {
    add: (file, context) =>
      new Promise<ContentPart>((resolve, reject) => {
        calls.push({
          file,
          signal: context.signal,
          onProgress: context.onProgress,
          resolve,
          reject,
        });
      }),
  };
  return { adapter, calls };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("AttachmentManager.remountPreviews", () => {
  it("repaints pending previews into a new container (composer rebuild)", async () => {
    const manager = new AttachmentManager({ allowedTypes: ["text/plain"] });
    const first = document.createElement("div");
    manager.setPreviewsContainer(first);

    await manager.handleFiles([textFile()]);
    expect(first.children.length).toBe(1);

    const second = document.createElement("div");
    manager.remountPreviews(second);

    expect(second.children.length).toBe(1);
    expect(second.querySelector("[data-attachment-id]")).not.toBeNull();
    expect(second.style.display).not.toBe("none");
    expect(manager.count()).toBe(1);
  });

  it("hides an empty container and keeps working with no container", () => {
    const manager = new AttachmentManager();
    const container = document.createElement("div");

    manager.remountPreviews(container);
    expect(container.children.length).toBe(0);
    expect(container.style.display).toBe("none");

    expect(() => manager.remountPreviews(null)).not.toThrow();
  });

  it("carries an in-flight upload's progress into the remounted tile", async () => {
    const { adapter, calls } = deferredAdapter();
    const manager = new AttachmentManager({
      allowedTypes: ["text/plain"],
      adapter,
    });
    const first = document.createElement("div");
    manager.setPreviewsContainer(first);
    void manager.handleFiles([textFile()]);
    await flush();

    const second = document.createElement("div");
    manager.remountPreviews(second);
    expect(
      second.querySelector<HTMLElement>("[data-attachment-id]")?.dataset.status
    ).toBe("uploading");

    calls[0].onProgress(0.5);
    const bar = second.querySelector<HTMLElement>(
      ".persona-attachment-progress__bar"
    );
    expect(bar?.style.width).toBe("50%");

    calls[0].resolve(part("done"));
    await flush();
    expect(
      second.querySelector<HTMLElement>("[data-attachment-id]")?.dataset.status
    ).toBe("ready");
  });
});

describe("AttachmentManager default adapter", () => {
  it("keeps base64 conversion as the default and reports ready", async () => {
    const manager = new AttachmentManager({ allowedTypes: ["text/plain"] });
    manager.setPreviewsContainer(document.createElement("div"));

    await manager.handleFiles([textFile()]);

    expect(manager.isReady()).toBe(true);
    expect(manager.getContentParts()).toHaveLength(1);
    expect(manager.getAttachments()[0].status).toBe("ready");
  });
});

describe("AttachmentManager upload adapter", () => {
  it("shows an uploading tile with progress, then ready (happy path)", async () => {
    const { adapter, calls } = deferredAdapter();
    const seen: PendingAttachment[][] = [];
    const manager = new AttachmentManager({
      allowedTypes: ["text/plain"],
      adapter,
      onAttachmentsChange: (attachments) => seen.push(attachments),
    });
    const container = document.createElement("div");
    manager.setPreviewsContainer(container);

    void manager.handleFiles([textFile()]);
    await flush();

    const tile = container.querySelector<HTMLElement>("[data-attachment-id]")!;
    expect(tile.dataset.status).toBe("uploading");
    expect(tile.getAttribute("aria-busy")).toBe("true");
    // Send is gated while the upload is in flight.
    expect(manager.isReady()).toBe(false);

    calls[0].onProgress(0.42);
    expect(
      container.querySelector<HTMLElement>(".persona-attachment-progress__bar")
        ?.style.width
    ).toBe("42%");

    calls[0].resolve(part("uploaded"));
    await flush();

    expect(tile.dataset.status).toBe("ready");
    expect(tile.getAttribute("aria-busy")).toBe("false");
    expect(manager.isReady()).toBe(true);
    expect(manager.getContentParts()).toEqual([part("uploaded")]);
    expect(seen.at(-1)?.[0].progress).toBeUndefined();
  });

  it("clamps reported progress to 0..1", async () => {
    const { adapter, calls } = deferredAdapter();
    const manager = new AttachmentManager({
      allowedTypes: ["text/plain"],
      adapter,
    });
    const container = document.createElement("div");
    manager.setPreviewsContainer(container);
    void manager.handleFiles([textFile()]);
    await flush();

    calls[0].onProgress(5);
    expect(manager.getAttachments()[0].progress).toBe(1);
    calls[0].onProgress(-3);
    expect(manager.getAttachments()[0].progress).toBe(0);
    calls[0].onProgress(Number.NaN);
    expect(manager.getAttachments()[0].progress).toBe(0);
  });

  it("shows an error state with a retry affordance and recovers", async () => {
    const { adapter, calls } = deferredAdapter();
    const manager = new AttachmentManager({
      allowedTypes: ["text/plain"],
      adapter,
    });
    const container = document.createElement("div");
    manager.setPreviewsContainer(container);
    void manager.handleFiles([textFile()]);
    await flush();

    calls[0].reject(new Error("network down"));
    await flush();

    const tile = container.querySelector<HTMLElement>("[data-attachment-id]")!;
    expect(tile.dataset.status).toBe("error");
    expect(tile.title).toContain("network down");
    expect(manager.isReady()).toBe(false);

    const retry = tile.querySelector<HTMLButtonElement>(
      ".persona-attachment-retry"
    )!;
    retry.click();
    await flush();
    expect(tile.dataset.status).toBe("uploading");

    calls[1].resolve(part("second try"));
    await flush();
    expect(tile.dataset.status).toBe("ready");
    expect(manager.isReady()).toBe(true);
  });

  it("keeps remove available in every state and aborts the in-flight add", async () => {
    const { adapter, calls } = deferredAdapter();
    const manager = new AttachmentManager({
      allowedTypes: ["text/plain"],
      adapter,
    });
    const container = document.createElement("div");
    manager.setPreviewsContainer(container);
    void manager.handleFiles([textFile()]);
    await flush();

    const remove = container.querySelector<HTMLButtonElement>(
      ".persona-attachment-remove"
    )!;
    remove.click();

    expect(calls[0].signal.aborted).toBe(true);
    expect(manager.count()).toBe(0);
  });

  it("ignores a late completion after the tile was removed", async () => {
    const { adapter, calls } = deferredAdapter();
    const seen: number[] = [];
    const manager = new AttachmentManager({
      allowedTypes: ["text/plain"],
      adapter,
      onAttachmentsChange: (attachments) => seen.push(attachments.length),
    });
    manager.setPreviewsContainer(document.createElement("div"));
    void manager.handleFiles([textFile()]);
    await flush();

    manager.removeAttachment(manager.getAttachments()[0].id);
    const before = seen.length;

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    calls[0].resolve(part("too late"));
    calls[0].reject(new Error("also too late"));
    await flush();

    expect(seen.length).toBe(before);
    expect(manager.count()).toBe(0);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("calls adapter.remove for a ready part but never on clear (post-send)", async () => {
    const { adapter, calls } = deferredAdapter();
    const removed: ContentPart[] = [];
    const manager = new AttachmentManager({
      allowedTypes: ["text/plain"],
      adapter: { ...adapter, remove: (p) => void removed.push(p) },
    });
    manager.setPreviewsContainer(document.createElement("div"));
    void manager.handleFiles([textFile()]);
    await flush();
    calls[0].resolve(part("stored"));
    await flush();

    manager.removeAttachment(manager.getAttachments()[0].id);
    expect(removed).toEqual([part("stored")]);

    // A second attachment cleared by a send must not be released.
    void manager.handleFiles([textFile("second.txt")]);
    await flush();
    calls[1].resolve(part("sent"));
    await flush();
    manager.clearAttachments();
    expect(removed).toEqual([part("stored")]);
  });

  it("aborts every in-flight upload on clear and on destroy", async () => {
    const { adapter, calls } = deferredAdapter();
    const manager = new AttachmentManager({
      allowedTypes: ["text/plain"],
      adapter,
      maxFiles: 4,
    });
    manager.setPreviewsContainer(document.createElement("div"));
    void manager.handleFiles([textFile("a.txt"), textFile("b.txt")]);
    await flush();

    manager.clearAttachments();
    expect(calls.map((c) => c.signal.aborted)).toEqual([true, true]);

    void manager.handleFiles([textFile("c.txt")]);
    await flush();
    manager.destroy();
    expect(calls[2].signal.aborted).toBe(true);
    expect(manager.count()).toBe(0);
  });
});

describe("AttachmentManager.fromConfig", () => {
  it("forwards the configured adapter and the internal change callback", async () => {
    const { adapter, calls } = deferredAdapter();
    const seen: number[] = [];
    const manager = AttachmentManager.fromConfig(
      { enabled: true, allowedTypes: ["text/plain"], adapter },
      (attachments) => seen.push(attachments.length)
    );
    manager.setPreviewsContainer(document.createElement("div"));

    void manager.handleFiles([textFile()]);
    await flush();
    expect(seen).toEqual([1]);

    calls[0].resolve(part("ok"));
    await flush();
    expect(seen).toEqual([1, 1]);

    manager.clearAttachments();
    expect(seen).toEqual([1, 1, 0]);
  });
});
