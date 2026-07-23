// @vitest-environment jsdom

// An update must not restyle or reveal header chrome the mount deliberately
// set: the close button hidden on non-closeable panels, and the clear-chat
// icon's stroke weight (builder and updater drifted to different constants).

import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";

const createMount = () => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  return mount;
};

const inlineConfig = () => ({
  apiUrl: "https://api.example.com/chat",
  launcher: { enabled: false },
  attachments: { enabled: true },
});

describe("header stability across unrelated updates", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("keeps the close button hidden on a non-closeable panel after an unrelated update", () => {
    window.scrollTo = vi.fn();
    const mount = createMount();
    const controller = createAgentExperience(mount, inlineConfig());

    const closeBtn = () =>
      mount.querySelector<HTMLElement>('button[aria-label="Close chat"]')!;
    expect(closeBtn().style.display).toBe("none");

    controller.update({ attachments: { enabled: true, maxFiles: 2 } });
    expect(closeBtn().style.display).toBe("none");

    controller.destroy();
  });

  it("showCloseButton filters on top of toggleability, it cannot force-show", () => {
    window.scrollTo = vi.fn();
    const mount = createMount();
    const controller = createAgentExperience(mount, inlineConfig());

    const closeBtn = () =>
      mount.querySelector<HTMLElement>('button[aria-label="Close chat"]')!;

    // Non-closeable panel stays hidden even with an explicit true (which is
    // also the default, so it cannot mean force-show).
    controller.update({ layout: { header: { showCloseButton: true } } });
    expect(closeBtn().style.display).toBe("none");

    controller.destroy();
  });

  it("still honors showCloseButton on a toggleable (launcher) panel", () => {
    window.scrollTo = vi.fn();
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: true, autoExpand: true },
    });

    const closeBtn = () =>
      mount.querySelector<HTMLElement>('button[aria-label="Close chat"]')!;
    expect(closeBtn().style.display).toBe("");

    controller.update({ layout: { header: { showCloseButton: false } } });
    expect(closeBtn().style.display).toBe("none");

    controller.update({ layout: { header: { showCloseButton: true } } });
    expect(closeBtn().style.display).toBe("");

    controller.destroy();
  });

  it("keeps the clear-chat icon stroke weight stable across updates", () => {
    window.scrollTo = vi.fn();
    const mount = createMount();
    const controller = createAgentExperience(mount, inlineConfig());

    const stroke = () =>
      mount
        .querySelector('button[aria-label="Clear chat"] svg')!
        .getAttribute("stroke-width");
    expect(stroke()).toBe("1");

    controller.update({ attachments: { enabled: true, maxFiles: 2 } });
    expect(stroke()).toBe("1");

    controller.destroy();
  });
});

describe("composer and header icon stability across unrelated updates", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("keeps the mic icon stroke and button color stable", () => {
    window.scrollTo = vi.fn();
    // The mic button only renders when speech recognition is available.
    vi.stubGlobal("SpeechRecognition", class {});
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      voiceRecognition: { enabled: true },
    });

    const mic = () => mount.querySelector<HTMLElement>("[data-persona-composer-mic]")!;
    expect(mic()).not.toBeNull();
    expect(mic().querySelector("svg")!.getAttribute("stroke-width")).toBe("1.5");
    expect(mic().style.color).toBe("var(--persona-text, #111827)");

    controller.update({ attachments: { enabled: true } });

    expect(mic().querySelector("svg")!.getAttribute("stroke-width")).toBe("1.5");
    expect(mic().style.color).toBe("var(--persona-text, #111827)");

    controller.destroy();
  });

  it("keeps display:block on close and clear-chat icons", () => {
    window.scrollTo = vi.fn();
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: true, autoExpand: true },
    });

    const iconDisplay = (label: string) =>
      mount.querySelector<SVGElement>(`button[aria-label="${label}"] svg`)!.style.display;
    expect(iconDisplay("Close chat")).toBe("block");
    expect(iconDisplay("Clear chat")).toBe("block");

    controller.update({ attachments: { enabled: true } });

    expect(iconDisplay("Close chat")).toBe("block");
    expect(iconDisplay("Clear chat")).toBe("block");

    controller.destroy();
  });
});
