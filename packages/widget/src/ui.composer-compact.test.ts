// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    ...config,
  } as unknown as Parameters<typeof createAgentExperience>[1]);
  controllers.push(controller);
  return { mount, controller };
};

const flush = async (times = 6) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

const footerOf = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>(".persona-widget-footer")!;

const textareaOf = (mount: HTMLElement) =>
  mount.querySelector<HTMLTextAreaElement>("[data-persona-composer-input]")!;

const isCompact = (mount: HTMLElement) =>
  footerOf(mount).hasAttribute("data-persona-composer-compact");

const type = async (mount: HTMLElement, value: string) => {
  const textarea = textareaOf(mount);
  textarea.value = value;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  await flush();
};

/** jsdom lays nothing out, so line height and scrollHeight are supplied. */
const simulateWrap = (mount: HTMLElement, lines: number) => {
  const textarea = textareaOf(mount);
  textarea.style.lineHeight = "20px";
  textarea.style.paddingTop = "0px";
  textarea.style.paddingBottom = "0px";
  Object.defineProperty(textarea, "scrollHeight", {
    configurable: true,
    get: () => lines * 20,
  });
};

const capturingFetch = () =>
  async () =>
    ({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.close();
        },
      }),
    }) as unknown as Response;

describe("composer compact state", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    controllers.splice(0).forEach((controller) => {
      try {
        controller.destroy();
      } catch {
        /* already destroyed */
      }
    });
    mounts.splice(0).forEach((mount) => mount.remove());
    document.body.innerHTML = "";
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("stamps the attribute on an empty composer", async () => {
    const { mount } = makeController();
    await flush();
    expect(isCompact(mount)).toBe(true);
  });

  it("stays compact for a single line of text", async () => {
    const { mount } = makeController();
    await type(mount, "hello");
    expect(isCompact(mount)).toBe(true);
  });

  it("expands on an explicit newline", async () => {
    const { mount } = makeController();
    await type(mount, "hello\nworld");
    expect(isCompact(mount)).toBe(false);
  });

  it("expands while a mode chip is visible", async () => {
    const { mount } = makeController({
      composer: { modes: [{ id: "search", label: "Search" }] },
    });
    await flush();
    expect(isCompact(mount)).toBe(true);
    mount
      .querySelector<HTMLButtonElement>(
        '[data-persona-composer-action="core:mode:search"] button'
      )!
      .click();
    await flush();
    expect(isCompact(mount)).toBe(false);
  });

  it("stays expanded after a wrap until the draft is cleared (hysteresis)", async () => {
    const { mount } = makeController();
    simulateWrap(mount, 3);
    await type(mount, "a long line that wraps");
    expect(isCompact(mount)).toBe(false);

    // The editor shrank back to one line but the draft is still there.
    simulateWrap(mount, 1);
    await type(mount, "short");
    expect(isCompact(mount)).toBe(false);

    await type(mount, "");
    expect(isCompact(mount)).toBe(true);
  });

  it("releases the wrap latch on send", async () => {
    const { mount } = makeController({ customFetch: capturingFetch() });
    simulateWrap(mount, 3);
    await type(mount, "a long line that wraps");
    expect(isCompact(mount)).toBe(false);

    simulateWrap(mount, 1);
    mount
      .querySelector<HTMLFormElement>("[data-persona-composer-form]")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flush(12);
    expect(isCompact(mount)).toBe(true);
  });

  it("expands while dictation is active", async () => {
    class FakeRecognition {
      continuous = false;
      interimResults = false;
      lang = "";
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start(): void {}
      stop(): void {}
    }
    vi.stubGlobal("SpeechRecognition", FakeRecognition);
    const { mount, controller } = makeController({
      voiceRecognition: { enabled: true },
    });
    await flush();
    expect(isCompact(mount)).toBe(true);
    controller.startVoiceRecognition();
    await type(mount, "");
    expect(isCompact(mount)).toBe(false);
    vi.unstubAllGlobals();
  });
});
