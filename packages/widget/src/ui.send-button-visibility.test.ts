// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";

const createMount = () => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  return mount;
};

const flush = async (times = 4) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

const wrapperOf = (mount: HTMLElement): HTMLElement =>
  mount
    .querySelector<HTMLButtonElement>("[data-persona-composer-submit]")!
    .closest<HTMLElement>(".persona-send-button-wrapper")!;

const typeInto = (mount: HTMLElement, value: string): void => {
  const textarea = mount.querySelector<HTMLTextAreaElement>(
    "[data-persona-composer-input]"
  )!;
  textarea.value = value;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
};

describe("sendButton.visibility", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (cb: (time: number) => void) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    window.scrollTo = vi.fn();
    global.fetch = vi.fn().mockImplementation((_url: string, options: any) => {
      const signal = options.signal as AbortSignal;
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    document.body.innerHTML = "";
    global.fetch = originalFetch;
    if (typeof localStorage !== "undefined") localStorage.clear();
    vi.restoreAllMocks();
  });

  it('never stamps the hidden attribute under the default "always"', async () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
    });

    expect(wrapperOf(mount).hasAttribute("data-persona-send-hidden")).toBe(false);
    typeInto(mount, "Hello");
    await flush();
    expect(wrapperOf(mount).hasAttribute("data-persona-send-hidden")).toBe(false);

    controller.destroy();
  });

  it('hides the control on an empty draft under "when-text" and restores it on input', async () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      sendButton: { visibility: "when-text" },
    });

    await flush();
    expect(wrapperOf(mount).hasAttribute("data-persona-send-hidden")).toBe(true);

    typeInto(mount, "Hello");
    await flush();
    expect(wrapperOf(mount).hasAttribute("data-persona-send-hidden")).toBe(false);

    // Whitespace is not a draft.
    typeInto(mount, "   ");
    await flush();
    expect(wrapperOf(mount).hasAttribute("data-persona-send-hidden")).toBe(true);

    controller.destroy();
  });

  it('keeps the control visible while streaming, because it is Stop', async () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      sendButton: { visibility: "when-text" },
    });

    typeInto(mount, "Hello");
    await flush();
    mount
      .querySelector<HTMLButtonElement>("[data-persona-composer-submit]")!
      .click();
    await flush();

    expect(controller.getState().streaming).toBe(true);
    // The draft cleared on submit, but the button is Stop now.
    expect(wrapperOf(mount).hasAttribute("data-persona-send-hidden")).toBe(false);

    controller.destroy();
  });

  it("follows a live update() of the visibility mode", async () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
    });

    expect(wrapperOf(mount).hasAttribute("data-persona-send-hidden")).toBe(false);
    controller.update({ sendButton: { visibility: "when-text" } });
    await flush();
    expect(wrapperOf(mount).hasAttribute("data-persona-send-hidden")).toBe(true);

    controller.destroy();
  });
});

describe("send button stop-state styling hook", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (cb: (time: number) => void) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    window.scrollTo = vi.fn();
    global.fetch = vi.fn().mockImplementation((_url: string, options: any) => {
      const signal = options.signal as AbortSignal;
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    document.body.innerHTML = "";
    global.fetch = originalFetch;
    if (typeof localStorage !== "undefined") localStorage.clear();
    vi.restoreAllMocks();
  });

  it("flips data-persona-send-mode between send and stop", async () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      sendButton: { useIcon: true, iconName: "arrow-up" },
    });

    const submit = mount.querySelector<HTMLButtonElement>(
      "[data-persona-composer-submit]"
    )!;
    expect(submit.getAttribute("data-persona-send-mode")).toBe("send");

    typeInto(mount, "Hi");
    submit.click();
    await flush();
    expect(submit.getAttribute("data-persona-send-mode")).toBe("stop");

    submit.click();
    await flush();
    expect(submit.getAttribute("data-persona-send-mode")).toBe("send");

    controller.destroy();
  });

  it("routes the icon-mode foreground through the stop-recolorable var chain", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      sendButton: { useIcon: true, iconName: "arrow-up" },
    });

    const submit = mount.querySelector<HTMLButtonElement>(
      "[data-persona-composer-submit]"
    )!;
    expect(submit.style.color).toContain("--persona-send-button-fg");
    expect(submit.style.color).toContain("--persona-button-primary-fg");

    controller.destroy();
  });
});
