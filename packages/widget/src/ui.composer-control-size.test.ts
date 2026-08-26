// @vitest-environment jsdom

/**
 * The composer control-size token end to end: mount defaults, the live
 * `update()` path, and the per-control config overrides that outrank it.
 */

import { afterEach, describe, expect, it } from "vitest";

import { createAgentExperience } from "./ui";

const mounts: HTMLElement[] = [];
const controllers: ReturnType<typeof createAgentExperience>[] = [];

const makeController = (config: Record<string, unknown> = {}) => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  mounts.push(mount);
  const controller = createAgentExperience(mount, {
    apiUrl: "https://api.example.com/chat",
    launcher: { enabled: false },
    persistState: false,
    suggestionChips: [],
    attachments: { enabled: true },
    voiceRecognition: { enabled: true, provider: { type: "custom" } },
    ...config,
  } as unknown as Parameters<typeof createAgentExperience>[1]);
  controllers.push(controller);
  return { mount, controller };
};

const controlSize = (mount: HTMLElement) =>
  mount.style.getPropertyValue("--persona-composer-control-size");
const controlIconSize = (mount: HTMLElement) =>
  mount.style.getPropertyValue("--persona-composer-control-icon-size");

const sendButton = (mount: HTMLElement) =>
  mount.querySelector<HTMLButtonElement>("[data-persona-composer-submit]")!;
const micButton = (mount: HTMLElement) =>
  mount.querySelector<HTMLButtonElement>("[data-persona-composer-mic]")!;
const attachmentButton = (mount: HTMLElement) =>
  mount.querySelector<HTMLButtonElement>(
    "[data-persona-composer-attachment-button]"
  )!;

const inlineBox = (button: HTMLElement) => [
  button.style.width,
  button.style.height,
  button.style.minWidth,
  button.style.minHeight,
];

afterEach(() => {
  for (const controller of controllers.splice(0)) controller.destroy();
  for (const mount of mounts.splice(0)) mount.remove();
  document.body.innerHTML = "";
});

describe("composer control size token", () => {
  it("defaults to 40px boxes with 24px glyphs, matching the pre-token rendering", () => {
    const { mount } = makeController();
    expect(controlSize(mount)).toBe("40px");
    expect(controlIconSize(mount)).toBe("24px");
  });

  it("leaves every composer control on the token with no inline box", () => {
    const { mount } = makeController();
    for (const button of [
      sendButton(mount),
      micButton(mount),
      attachmentButton(mount),
    ]) {
      expect(button.classList.contains("persona-composer-control")).toBe(true);
      expect(inlineBox(button)).toEqual(["", "", "", ""]);
    }
  });

  it("shrinks registry, attachment, mic and send uniformly at controlSize 32px", () => {
    const { mount } = makeController({
      theme: { components: { composer: { controlSize: "32px" } } },
    });
    expect(controlSize(mount)).toBe("32px");
    // One token, one box: no control opts out with an inline size of its own.
    for (const button of [
      sendButton(mount),
      micButton(mount),
      attachmentButton(mount),
    ]) {
      expect(inlineBox(button)).toEqual(["", "", "", ""]);
    }
  });

  it("resizes controls through a live controller.update()", () => {
    const { mount, controller } = makeController();
    expect(controlSize(mount)).toBe("40px");

    controller.update({
      theme: { components: { composer: { controlSize: "32px", controlIconSize: "18px" } } },
    } as never);
    expect(controlSize(mount)).toBe("32px");
    expect(controlIconSize(mount)).toBe("18px");
    expect(inlineBox(sendButton(mount))).toEqual(["", "", "", ""]);

    controller.update({
      theme: { components: { composer: { controlSize: "48px" } } },
    } as never);
    // A partial patch merges: the untouched icon size survives the second call.
    expect(controlSize(mount)).toBe("48px");
    expect(controlIconSize(mount)).toBe("18px");
  });

  it("lets an explicit sendButton.size beat the token", () => {
    const { mount } = makeController({
      sendButton: { useIcon: true, iconName: "send", size: "48px" },
      theme: { components: { composer: { controlSize: "32px" } } },
    });
    expect(controlSize(mount)).toBe("32px");
    expect(inlineBox(sendButton(mount))).toEqual([
      "48px",
      "48px",
      "48px",
      "48px",
    ]);
    // Only send opts out; its neighbours stay on the token.
    expect(inlineBox(attachmentButton(mount))).toEqual(["", "", "", ""]);
  });

  it("keeps voiceRecognition padding working as an override on top of the token box", () => {
    const { mount } = makeController({
      voiceRecognition: {
        enabled: true,
        provider: { type: "custom" },
        paddingX: "6px",
        paddingY: "4px",
      },
    });
    const mic = micButton(mount);
    expect(inlineBox(mic)).toEqual(["", "", "", ""]);
    expect(mic.style.paddingLeft).toBe("6px");
    expect(mic.style.paddingTop).toBe("4px");
  });
});
