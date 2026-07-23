// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";

const createMount = () => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  return mount;
};

describe("createAgentExperience partial launcher update", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("preserves defaulted launcher styling when update() carries a partial launcher (regression: header buttons fell back to UA buttonface chrome)", () => {
    window.scrollTo = vi.fn();
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false, title: "Before" },
    });

    const closeBefore = mount.querySelector<HTMLButtonElement>('button[aria-label="Close chat"]');
    const clearBefore = mount.querySelector<HTMLButtonElement>('button[aria-label="Clear chat"]');
    expect(closeBefore).not.toBeNull();
    expect(clearBefore).not.toBeNull();
    // mergeWithDefaults supplies transparent button chrome at mount time.
    expect(closeBefore!.style.backgroundColor).toBe("transparent");
    expect(clearBefore!.style.backgroundColor).toBe("transparent");

    // A partial launcher update (e.g. a live settings preview changing only
    // the title) must not wholesale-replace the defaulted launcher config.
    controller.update({ launcher: { enabled: false, title: "After" } });

    const closeAfter = mount.querySelector<HTMLButtonElement>('button[aria-label="Close chat"]');
    const clearAfter = mount.querySelector<HTMLButtonElement>('button[aria-label="Clear chat"]');
    expect(closeAfter).not.toBeNull();
    expect(clearAfter).not.toBeNull();
    expect(closeAfter!.style.backgroundColor).toBe("transparent");
    expect(clearAfter!.style.backgroundColor).toBe("transparent");
  });

  it("keeps nested clearChat overrides across unrelated launcher updates", () => {
    window.scrollTo = vi.fn();
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: {
        enabled: false,
        clearChat: { backgroundColor: "#123456" },
      },
    });

    controller.update({ launcher: { enabled: false, title: "After" } });

    const clear = mount.querySelector<HTMLButtonElement>('button[aria-label="Clear chat"]');
    expect(clear).not.toBeNull();
    expect(clear!.style.backgroundColor).toBe("rgb(18, 52, 86)");
  });

  it("keeps a clearChat override when a later update patches only launcher.dock", () => {
    window.scrollTo = vi.fn();
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: {
        enabled: false,
        clearChat: { backgroundColor: "#123456" },
      },
    });

    // A partial dock patch must not wholesale-replace the launcher group.
    controller.update({ launcher: { dock: { side: "left" } } });

    const clear = mount.querySelector<HTMLButtonElement>('button[aria-label="Clear chat"]');
    expect(clear).not.toBeNull();
    expect(clear!.style.backgroundColor).toBe("rgb(18, 52, 86)");
  });
});
