// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { AttachmentManager } from "./attachment-manager";

describe("AttachmentManager.remountPreviews", () => {
  it("repaints pending previews into a new container (composer rebuild)", async () => {
    const manager = new AttachmentManager({ allowedTypes: ["text/plain"] });
    const first = document.createElement("div");
    manager.setPreviewsContainer(first);

    await manager.handleFiles([
      new File(["notes"], "notes.txt", { type: "text/plain" }),
    ]);
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
});
