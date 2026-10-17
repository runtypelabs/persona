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

describe("AttachmentManager.updateConfig", () => {
  it("preserves omitted upload settings and resets explicitly undefined settings", async () => {
    const add = vi.fn(async () => part("uploaded"));
    const rejected = vi.fn();
    const manager = new AttachmentManager({ allowedTypes: ["application/json"], maxFileSize: 1, maxFiles: 1, adapter: { add }, onFileRejected: rejected });
    manager.updateConfig({ preview: { file: { icon: false } } });
    await manager.handleFiles([textFile()]);
    expect(rejected).toHaveBeenLastCalledWith(expect.any(File), "type");
    expect(add).not.toHaveBeenCalled();
    manager.updateConfig({ allowedTypes: undefined, maxFileSize: undefined, maxFiles: undefined, adapter: undefined, onFileRejected: undefined });
    await manager.handleFiles([textFile(), textFile("two.txt"), textFile("three.txt"), textFile("four.txt"), textFile("five.txt")]);
    expect(manager.getAttachments()).toHaveLength(4);
    expect(manager.getAttachments().every(attachment => attachment.status === "ready")).toBe(true);
    expect(add).not.toHaveBeenCalled();
    expect(rejected).toHaveBeenCalledTimes(1);
    manager.destroy();
  });
});

describe("AttachmentManager.remountPreviews", () => {
  it("lets theme CSS control remove contrast and removes the file", async () => {
    const manager = new AttachmentManager({ allowedTypes: ["text/plain"] });
    const container = document.createElement("div");
    container.style.setProperty("--persona-text-inverse", "#111111");
    manager.setPreviewsContainer(container);
    await manager.handleFiles([textFile()]);

    const remove = container.querySelector<HTMLButtonElement>(".persona-attachment-remove")!;
    expect(remove.style.color).toBe("");
    expect(container.firstElementChild?.getAttribute("data-kind")).toBe("file");
    expect(remove.querySelector("svg")?.getAttribute("stroke")).toBe("currentColor");
    remove.click();
    expect(manager.count()).toBe(0);
    expect(container.querySelector(".persona-attachment-preview")).toBeNull();
    manager.destroy();
  });

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

  it("keeps a detached conversation's upload alive without painting another composer", async () => {
    const { adapter, calls } = deferredAdapter();
    const manager = new AttachmentManager({ allowedTypes: ["text/plain"], adapter });
    const sharedContainer = document.createElement("div");
    manager.setPreviewsContainer(sharedContainer);
    const uploading = manager.handleFiles([textFile()]);

    manager.setPreviewsContainer(null);
    sharedContainer.innerHTML = "<span>Other conversation</span>";
    calls[0].onProgress(0.5);
    calls[0].resolve(part("source upload"));
    await uploading;

    expect(calls[0].signal.aborted).toBe(false);
    expect(sharedContainer.textContent).toBe("Other conversation");
    manager.remountPreviews(sharedContainer);
    expect(sharedContainer.querySelector<HTMLElement>("[data-attachment-id]")?.dataset.status).toBe("ready");
    expect(manager.getContentParts()).toEqual([part("source upload")]);
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

  it("releases abandoned draft uploads, including an adapter completion after disposal", async () => {
    const { adapter, calls } = deferredAdapter();
    const remove = vi.fn();
    const onChange = vi.fn();
    const manager = new AttachmentManager({
      allowedTypes: ["text/plain"],
      adapter: { ...adapter, remove },
      onAttachmentsChange: onChange,
    });
    const uploading = manager.handleFiles([textFile("ready.txt"), textFile("late.txt")]);
    calls[0].resolve(part("ready"));
    await flush();

    manager.destroy({ release: true });
    manager.destroy({ release: true });
    const changesAtDisposal = onChange.mock.calls.length;
    expect(calls[1].signal.aborted).toBe(true);
    expect(remove.mock.calls.map(([value]) => value)).toEqual([part("ready")]);

    calls[1].resolve(part("late"));
    await uploading;
    expect(remove.mock.calls.map(([value]) => value)).toEqual([part("ready"), part("late")]);
    expect(onChange).toHaveBeenCalledTimes(changesAtDisposal);
    expect(manager.count()).toBe(0);
  });

  it("retains completed uploaded parts on ordinary teardown", async () => {
    const { adapter, calls } = deferredAdapter();
    const remove = vi.fn();
    const manager = new AttachmentManager({
      allowedTypes: ["text/plain"],
      adapter: { ...adapter, remove },
    });
    const uploading = manager.handleFiles([textFile("ready.txt"), textFile("late.txt")]);
    calls[0].resolve(part("ready"));
    await flush();
    manager.destroy();
    calls[1].resolve(part("late"));
    await uploading;
    expect(remove).not.toHaveBeenCalled();
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

describe("configurable composer attachment previews", () => {
  it("keeps image fit and removal independent of document policies", async () => {
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
    const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const manager = new AttachmentManager({ adapter: { add: async () => part("done") }, preview: {
      image: { fit: "contain", remove: { placement: "inside", visibility: "always" } },
      file: { remove: { placement: "inline", visibility: "hover" } },
    } });
    const container = document.createElement("div");
    manager.setPreviewsContainer(container);
    await manager.handleFiles([new File(["pixels"], "photo.png", { type: "image/png" }), textFile()]);
    const image = container.querySelector<HTMLImageElement>("img")!;
    expect(image.style.objectFit).toBe("contain");
    expect(image.alt).toBe("photo.png");
    expect(image.parentElement?.dataset.removePlacement).toBe("inside");
    expect(image.parentElement?.dataset.removeVisibility).toBe("always");
    manager.clearAttachments();
    expect(revokeUrl).toHaveBeenCalledWith("blob:preview");
    manager.destroy();
    createUrl.mockRestore();
    revokeUrl.mockRestore();
  });

  it("renders filename, size, badge and distinct remove policy without changing outgoing parts", async () => {
    const manager = AttachmentManager.fromConfig({ preview: { file: { layout: "horizontal", name: "full", metadata: "size", badge: "extension", remove: { placement: "inline", visibility: "hover" } } } });
    const container = document.createElement("div");
    manager.setPreviewsContainer(container);
    await manager.handleFiles([textFile("report.final.txt")]);
    expect(container.querySelector(".persona-attachment-file-name")?.textContent).toBe("report.final.txt");
    expect(container.querySelector(".persona-attachment-file-metadata")?.textContent).toBe("5 B");
    expect(container.querySelector(".persona-attachment-file-badge")?.textContent).toBe("TXT");
    expect(container.firstElementChild?.getAttribute("data-remove-visibility")).toBe("hover");
    expect(container.firstElementChild?.getAttribute("data-remove-placement")).toBe("inline");
    expect(manager.getContentParts()).toHaveLength(1);
    manager.updateConfig({ preview: { file: { layout: "vertical", name: "basename", badge: "none", icon: false } } });
    expect(container.querySelector(".persona-attachment-file-name")?.textContent).toBe("report.final");
    expect(container.querySelector(".persona-attachment-file-icon")).toBeNull();
    expect(container.querySelector(".persona-attachment-file-badge")).toBeNull();
    manager.destroy();
  });

  it("counts bounded supported text asynchronously and skips binary formats", async () => {
    const manager = new AttachmentManager({ preview: { file: { metadata: "line-count" } }, allowedTypes: ["text/plain", "application/pdf"], adapter: { add: async () => part("uploaded") } });
    const container = document.createElement("div");
    manager.setPreviewsContainer(container);
    await manager.handleFiles([new File(["first\r\nsecond\n"], "lines.txt", { type: "text/plain" }), new File(["binary\nbytes"], "document.pdf", { type: "application/pdf" })]);
    await vi.waitFor(() => expect(container.querySelector(".persona-attachment-file-metadata")?.textContent).toBe("2 lines"));
    expect(manager.getAttachments()[1].lineCount).toBeUndefined();
    manager.destroy();
  });

  it("reads line counts when metadata is enabled on existing files", async () => {
    const manager = new AttachmentManager({ adapter: { add: async () => part("done") } });
    await manager.handleFiles([textFile()]);
    manager.updateConfig({ preview: { file: { metadata: "line-count" } } });
    await vi.waitFor(() => expect(manager.getAttachments()[0].lineCount).toBe(1));
    manager.destroy();
  });

  it("updates managed renderers through upload states and cleans each mount once", async () => {
    const { adapter, calls } = deferredAdapter();
    const update = vi.fn();
    const destroy = vi.fn();
    const contexts: import("../types").AttachmentPreviewRenderContext[] = [];
    const manager = new AttachmentManager({ adapter, instanceId: "widget-a", renderAttachmentPreview: context => { contexts.push(context); return { element: document.createElement("section"), update, destroy }; } });
    const first = document.createElement("div");
    manager.setPreviewsContainer(first);
    const pending = manager.handleFiles([textFile()]);
    calls[0].onProgress(0.4);
    expect(update.mock.calls[0][0].state.progress).toBe(0.4);
    expect(contexts[0].instanceId).toBe("widget-a");
    expect(Object.isFrozen(contexts[0].state)).toBe(true);
    calls[0].resolve(part("done"));
    await pending;
    expect(update.mock.calls.at(-1)?.[0].state.status).toBe("ready");
    manager.remountPreviews(document.createElement("div"));
    expect(destroy).toHaveBeenCalledTimes(1);
    contexts[1].actions.remove();
    expect(destroy).toHaveBeenCalledTimes(2);
    manager.clearAttachments();
    manager.destroy();
    expect(destroy).toHaveBeenCalledTimes(2);
  });

  it("falls back from null and throwing renderers and isolates failed cleanup", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const manager = new AttachmentManager({ renderAttachmentPreview: () => { throw new Error("broken renderer"); } });
    const container = document.createElement("div");
    manager.setPreviewsContainer(container);
    await manager.handleFiles([textFile()]);
    expect(container.querySelector(".persona-attachment-preview")).not.toBeNull();
    manager.updateConfig({ renderAttachmentPreview: () => ({ element: document.createElement("div"), destroy: () => { throw new Error("broken cleanup"); } }) });
    expect(() => manager.clearAttachments()).not.toThrow();
    expect(manager.count()).toBe(0);
    manager.updateConfig({ renderAttachmentPreview: () => null });
    await manager.handleFiles([textFile()]);
    expect(container.querySelector(".persona-attachment-preview")).not.toBeNull();
    manager.destroy();
    error.mockRestore();
  });
});
