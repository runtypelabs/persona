// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createAttachmentPreview } from "./attachment-preview";
import type { AgentWidgetAttachmentPreviewConfig, AttachmentPreviewRenderContext } from "../types";

function context(preview?: AgentWidgetAttachmentPreviewConfig, image = true): AttachmentPreviewRenderContext {
  return {
    instanceId: "preview-test",
    state: { id: "attachment", kind: image ? "image" : "file", name: "report.final.png", mimeType: image ? "image/png" : "text/plain", size: 1024, status: "ready", previewUrl: image ? "blob:preview" : null },
    config: { attachments: { preview } },
    actions: { remove: vi.fn(), retry: vi.fn() },
    defaultRenderer: () => { throw new Error("Not used by built-in renderer"); },
  };
}

describe("built-in attachment previews", () => {
  it("retains bare thumbnails and default document badges", () => {
    const image = createAttachmentPreview(context()).element;
    expect(image.dataset.layout).toBe("thumbnail");
    expect(image.querySelector(".persona-attachment-image-card")).toBeNull();
    expect(image.querySelector(".persona-attachment-file-name")).toBeNull();
    expect(image.querySelector("img")?.style.objectFit).toBe("cover");
    const file = createAttachmentPreview(context(undefined, false)).element;
    expect(file.dataset.layout).toBe("tile");
    expect(file.dataset.iconPlacement).toBe("start");
    expect(file.querySelector(".persona-attachment-file-badge")?.textContent).toBe("TXT");
    expect(file.dataset.removeVisibility).toBe("always");
    expect(file.dataset.removePlacement).toBe("overlap");
  });

  it("puts inline removal inside an image chip and retains the thumbnail source", () => {
    const initial = context({ image: { layout: "chip", name: "full", fit: "contain", remove: { placement: "inline", visibility: "hover" } } });
    const handle = createAttachmentPreview(initial);
    const card = handle.element.querySelector(".persona-attachment-image-card")!;
    expect(card.querySelector("img")?.src).toBe("blob:preview");
    expect(card.querySelector("img")?.style.objectFit).toBe("contain");
    expect(card.querySelector(".persona-attachment-file-name")?.textContent).toBe("report.final.png");
    expect(card.querySelector("button")?.getAttribute("aria-label")).toBe("Remove attachment");
    card.querySelector<HTMLButtonElement>("button")!.click();
    expect(initial.actions.remove).toHaveBeenCalledOnce();
    handle.update?.({ ...initial, config: { attachments: { preview: { image: { name: "basename" } } } } });
    expect(handle.element.dataset.layout).toBe("thumbnail");
    expect(handle.element.querySelector(".persona-attachment-file-name")?.textContent).toBe("report.final");
    expect(handle.element.querySelector(".persona-attachment-image-card button")).toBeNull();
  });

  it("uses explicit file icons and retains MIME fallback and icon hiding", () => {
    const initial = context({ file: { layout: "vertical", iconName: "code-xml", iconPlacement: "center" } }, false);
    const handle = createAttachmentPreview(initial);
    const override = handle.element.querySelector(".persona-attachment-file-icon")!.innerHTML;
    expect(handle.element.dataset.iconPlacement).toBe("center");
    handle.update?.({ ...initial, config: { attachments: { preview: { file: {} } } } });
    expect(handle.element.querySelector(".persona-attachment-file-icon")!.innerHTML).not.toBe(override);
    handle.update?.({ ...initial, config: { attachments: { preview: { file: { iconName: "code-xml", icon: false } } } } });
    expect(handle.element.querySelector(".persona-attachment-file-icon")).toBeNull();
  });

  it("updates upload progress without replacing chip controls and calls the latest actions", () => {
    const initial = context({ image: { layout: "chip", name: "full", remove: { placement: "inline" } } });
    const handle = createAttachmentPreview(initial);
    const remove = handle.element.querySelector<HTMLButtonElement>(".persona-attachment-remove")!;
    const actions = { remove: vi.fn(), retry: vi.fn() };
    handle.update?.({ ...initial, actions, state: { ...initial.state, status: "uploading", progress: 0.6 } });
    expect(handle.element.querySelector(".persona-attachment-remove")).toBe(remove);
    expect(handle.element.getAttribute("aria-busy")).toBe("true");
    expect(handle.element.querySelector<HTMLElement>(".persona-attachment-progress__bar")?.style.width).toBe("60%");
    remove.click();
    expect(actions.remove).toHaveBeenCalledOnce();
    expect(initial.actions.remove).not.toHaveBeenCalled();
  });
});
