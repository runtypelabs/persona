// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import { AttachmentManager } from "./utils/attachment-manager";

const createMount = () => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  return mount;
};

/** jsdom does not expose `DataTransfer`; real browsers set `dropEffect` on dragover. */
function createFileDataTransfer(files: File[]): DataTransfer {
  const list: File[] = [...files];
  const fileList = list as unknown as FileList;
  return {
    dropEffect: "none",
    effectAllowed: "all",
    files: fileList,
    items: {
      add: () => {},
      clear: () => {},
      remove: () => {}
    } as unknown as DataTransferItemList,
    types: files.length > 0 ? ["Files"] : [],
    clearData: () => {},
    getData: () => "",
    setData: () => {},
    setDragImage: () => {}
  } as unknown as DataTransfer;
}

function createDragEvent(type: string, dataTransfer: DataTransfer): DragEvent {
  const ev = new Event(type, { bubbles: true, cancelable: true }) as unknown as DragEvent;
  Object.defineProperty(ev, "dataTransfer", { value: dataTransfer, enumerable: true });
  return ev;
}

describe("createAgentExperience attachment file drop", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (cb: (time: number) => void) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("calls AttachmentManager.handleFiles when files are dropped on the mount", () => {
    const handleFilesSpy = vi.spyOn(AttachmentManager.prototype, "handleFiles");

    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      attachments: { enabled: true, maxFiles: 4 },
    });

    const file = new File(["x"], "test.png", { type: "image/png" });
    const dt = createFileDataTransfer([file]);

    // dragover/drop are on mount so the browser default is suppressed everywhere
    const dragOver = createDragEvent("dragover", dt);
    mount.dispatchEvent(dragOver);
    expect(dragOver.defaultPrevented).toBe(true);
    expect(dt.dropEffect).toBe("copy");

    const drop = createDragEvent("drop", dt);
    mount.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);

    expect(handleFilesSpy).toHaveBeenCalledTimes(1);
    const passed = handleFilesSpy.mock.calls[0]?.[0] as File[];
    expect(passed).toHaveLength(1);
    expect(passed[0]?.name).toBe("test.png");

    handleFilesSpy.mockRestore();
    controller.destroy();
  });

  it("shows drop-active highlight on container during dragenter", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      attachments: { enabled: true, maxFiles: 4 },
    });

    const container = mount.querySelector(".persona-widget-container")!;
    const file = new File(["x"], "test.png", { type: "image/png" });
    const dt = createFileDataTransfer([file]);

    container.dispatchEvent(createDragEvent("dragenter", dt));
    expect(container.classList.contains("persona-attachment-drop-active")).toBe(true);

    container.dispatchEvent(createDragEvent("dragleave", dt));
    expect(container.classList.contains("persona-attachment-drop-active")).toBe(false);

    controller.destroy();
  });

  it("renders drop overlay with icon inside container", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      attachments: { enabled: true, maxFiles: 4 },
    });

    const overlay = mount.querySelector(".persona-attachment-drop-overlay");
    expect(overlay).not.toBeNull();
    expect(overlay!.querySelector("svg")).not.toBeNull();

    controller.destroy();
  });

  it("applies custom dropOverlay config as CSS variables", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      attachments: {
        enabled: true,
        maxFiles: 4,
        dropOverlay: {
          background: "rgba(255, 0, 0, 0.1)",
          backdropBlur: "12px",
          border: "2px solid red",
          inset: "8px",
          iconName: "image-plus",
          label: "Drop here",
        },
      },
    });

    const overlay = mount.querySelector<HTMLElement>(".persona-attachment-drop-overlay")!;
    expect(overlay).not.toBeNull();
    expect(overlay.style.getPropertyValue("--persona-drop-overlay-bg")).toBe("rgba(255, 0, 0, 0.1)");
    expect(overlay.style.getPropertyValue("--persona-drop-overlay-blur")).toBe("12px");
    expect(overlay.style.getPropertyValue("--persona-drop-overlay-border")).toBe("2px solid red");
    expect(overlay.style.getPropertyValue("--persona-drop-overlay-inset")).toBe("8px");

    const label = overlay.querySelector(".persona-drop-overlay-label");
    expect(label).not.toBeNull();
    expect(label!.textContent).toBe("Drop here");

    controller.destroy();
  });

  it("does not render drop overlay when attachments are disabled", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      attachments: { enabled: false },
    });

    const overlay = mount.querySelector(".persona-attachment-drop-overlay");
    expect(overlay).toBeNull();

    controller.destroy();
  });

  it("does not prevent dragover when attachments are disabled", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      attachments: { enabled: false },
    });

    const file = new File(["x"], "test.png", { type: "image/png" });
    const dt = createFileDataTransfer([file]);

    const dragOver = createDragEvent("dragover", dt);
    mount.dispatchEvent(dragOver);
    expect(dragOver.defaultPrevented).toBe(false);

    controller.destroy();
  });
});
