// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";

const mounts: HTMLElement[] = [];
const controllers: ReturnType<typeof createAgentExperience>[] = [];

/** The last SpeechRecognition the widget constructed. */
let recognition: FakeRecognition | null = null;

class FakeRecognition {
  continuous = false;
  interimResults = false;
  lang = "";
  started = false;
  stopped = false;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;

  constructor() {
    recognition = this;
  }
  start(): void {
    this.started = true;
  }
  stop(): void {
    this.stopped = true;
  }
  /** One final transcript result, as the Web Speech API shapes it. */
  emitFinal(text: string): void {
    this.onresult?.({
      results: [Object.assign([{ transcript: text }], { isFinal: true })],
    });
  }
}

const sent: Record<string, unknown>[] = [];

const makeController = (config: Record<string, unknown> = {}) => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  mounts.push(mount);
  const controller = createAgentExperience(mount, {
    apiUrl: "https://api.example.com/chat",
    launcher: { enabled: false },
    persistState: false,
    suggestionChips: [],
    voiceRecognition: { enabled: true, pauseDuration: 10 },
    customFetch: async (_url: string, _init: unknown, payload: unknown) => {
      sent.push(payload as Record<string, unknown>);
      return {
        ok: true,
        body: new ReadableStream({
          start(streamController) {
            streamController.close();
          },
        }),
      } as unknown as Response;
    },
    ...config,
  } as unknown as Parameters<typeof createAgentExperience>[1]);
  controllers.push(controller);
  return { mount, controller };
};

const flush = async (times = 8) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

const textareaOf = (mount: HTMLElement) =>
  mount.querySelector<HTMLTextAreaElement>("[data-persona-composer-input]")!;

const micOf = (mount: HTMLElement) =>
  mount.querySelector<HTMLButtonElement>("[data-persona-composer-mic]")!;

describe("dictation completion behavior", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
    sent.length = 0;
    recognition = null;
    vi.stubGlobal("SpeechRecognition", FakeRecognition);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
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
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("auto-sends after the pause by default", async () => {
    const { mount } = makeController();
    micOf(mount).click();
    recognition!.emitFinal("book a table");
    vi.advanceTimersByTime(50);
    await vi.runOnlyPendingTimersAsync();
    await flush();
    expect(sent).toHaveLength(1);
    expect(textareaOf(mount).value).toBe("");
  });

  it("review leaves the transcript in the composer and sends nothing", async () => {
    const { mount, controller } = makeController({
      voiceRecognition: {
        enabled: true,
        pauseDuration: 10,
        completionBehavior: "review",
      },
    });
    micOf(mount).click();
    recognition!.emitFinal("book a table");
    vi.advanceTimersByTime(50);
    await vi.runOnlyPendingTimersAsync();
    await flush();
    expect(sent).toHaveLength(0);
    expect(textareaOf(mount).value).toBe("book a table ");
    // The store mirrors the transcript, so send eligibility is already true.
    expect(controller.getComposerState().text).toBe("book a table ");
    // Recognition itself still stopped.
    expect(recognition!.stopped).toBe(true);
  });

  it("review suppresses the auto-send on natural end of recognition", async () => {
    const { mount } = makeController({
      voiceRecognition: {
        enabled: true,
        pauseDuration: 10_000,
        completionBehavior: "review",
      },
    });
    micOf(mount).click();
    recognition!.emitFinal("hello there");
    recognition!.onend?.();
    await flush();
    expect(sent).toHaveLength(0);
    expect(textareaOf(mount).value).toBe("hello there ");
  });

  it("review suppresses the auto-send when the user taps the mic to stop", async () => {
    const { mount } = makeController({
      voiceRecognition: {
        enabled: true,
        pauseDuration: 10_000,
        completionBehavior: "review",
      },
    });
    micOf(mount).click();
    recognition!.emitFinal("hello there");
    micOf(mount).click();
    await flush();
    expect(sent).toHaveLength(0);
    expect(textareaOf(mount).value).toBe("hello there ");
  });

  it("send is still the default when the user taps the mic to stop", async () => {
    const { mount } = makeController();
    micOf(mount).click();
    recognition!.emitFinal("hello there");
    micOf(mount).click();
    await flush();
    expect(sent).toHaveLength(1);
  });

  it("controller.update() switches the behavior mid-session", async () => {
    const { mount, controller } = makeController();
    controller.update({
      voiceRecognition: {
        enabled: true,
        pauseDuration: 10,
        completionBehavior: "review",
      },
    } as never);
    micOf(mount).click();
    recognition!.emitFinal("later then");
    vi.advanceTimersByTime(50);
    await vi.runOnlyPendingTimersAsync();
    await flush();
    expect(sent).toHaveLength(0);
  });
});
