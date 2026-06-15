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

const getTextarea = (mount: HTMLElement) =>
  mount.querySelector<HTMLTextAreaElement>("[data-persona-composer-input]")!;

const press = (el: Element, key: string) =>
  el.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
  );

describe("createAgentExperience composer keyboard: Enter / Esc while streaming", () => {
  const originalFetch = global.fetch;
  let capturedSignals: AbortSignal[] = [];

  beforeEach(() => {
    capturedSignals = [];
    vi.stubGlobal("requestAnimationFrame", (cb: (time: number) => void) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    window.scrollTo = vi.fn();

    // Fetch hangs until aborted: models an in-flight SSE stream so the widget
    // stays "streaming".
    global.fetch = vi.fn().mockImplementation((_url: string, options: any) => {
      const signal = options.signal as AbortSignal;
      capturedSignals.push(signal);
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    }) as any;
  });

  afterEach(() => {
    document.body.innerHTML = "";
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  const startStreaming = async (mount: HTMLElement) => {
    const textarea = getTextarea(mount);
    textarea.value = "Hello";
    mount
      .querySelector<HTMLButtonElement>("[data-persona-composer-submit]")!
      .click();
    await flush();
    return textarea;
  };

  it("Enter while streaming does NOT stop the stream and does not send", async () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
    });

    const textarea = await startStreaming(mount);
    expect(controller.getState().streaming).toBe(true);
    expect(capturedSignals).toHaveLength(1);

    // Type something new, then hit Enter: it must be inert mid-stream.
    textarea.value = "queued text";
    press(textarea, "Enter");
    await flush();

    expect(controller.getState().streaming).toBe(true);
    expect(capturedSignals[0].aborted).toBe(false);
    // No second request fired (nothing sent).
    expect(capturedSignals).toHaveLength(1);

    controller.destroy();
  });

  it("Escape while streaming stops the stream", async () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
    });

    const textarea = await startStreaming(mount);
    expect(controller.getState().streaming).toBe(true);

    press(textarea, "Escape");
    await flush();

    expect(controller.getState().streaming).toBe(false);
    expect(capturedSignals[0].aborted).toBe(true);

    controller.destroy();
  });

  it("Escape while NOT streaming does not throw and leaves state idle", async () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
    });

    const textarea = getTextarea(mount);
    press(textarea, "Escape");
    await flush();

    expect(controller.getState().streaming).toBe(false);
    expect(capturedSignals).toHaveLength(0);

    controller.destroy();
  });
});

describe("createAgentExperience composer keyboard: Up/Down history", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
    try {
      window.localStorage.clear();
    } catch {
      /* jsdom edge cases */
    }
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  const seededConfig = (composerHistory?: boolean) => ({
    apiUrl: "https://api.example.com/chat",
    launcher: { enabled: false } as const,
    ...(composerHistory === undefined
      ? {}
      : { features: { composerHistory } }),
    initialMessages: [
      {
        id: "u1",
        role: "user" as const,
        content: "first message",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "a1",
        role: "assistant" as const,
        content: "a reply",
        createdAt: "2026-01-01T00:00:01.000Z",
      },
      {
        id: "u2",
        role: "user" as const,
        content: "second message",
        createdAt: "2026-01-01T00:00:02.000Z",
      },
    ],
  });

  it("Up recalls the most recent user message; repeated Up steps older; Down restores the draft", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, seededConfig());
    const textarea = getTextarea(mount);

    textarea.value = "draft in progress";
    textarea.setSelectionRange(0, 0); // caret at start

    press(textarea, "ArrowUp");
    expect(textarea.value).toBe("second message");

    press(textarea, "ArrowUp");
    expect(textarea.value).toBe("first message");

    // Down walks back toward the present...
    press(textarea, "ArrowDown");
    expect(textarea.value).toBe("second message");

    // ...and past the newest entry restores the saved draft.
    press(textarea, "ArrowDown");
    expect(textarea.value).toBe("draft in progress");

    controller.destroy();
  });

  it("does not hijack Up when the caret is not at the start (multi-line editing)", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, seededConfig());
    const textarea = getTextarea(mount);

    textarea.value = "line one\nline two";
    textarea.setSelectionRange(5, 5); // caret mid-text

    press(textarea, "ArrowUp");
    // Value unchanged: Up moved the cursor instead of recalling history.
    expect(textarea.value).toBe("line one\nline two");

    controller.destroy();
  });

  it("can be disabled via features.composerHistory: false", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, seededConfig(false));
    const textarea = getTextarea(mount);

    textarea.value = "";
    textarea.setSelectionRange(0, 0);

    press(textarea, "ArrowUp");
    expect(textarea.value).toBe("");

    controller.destroy();
  });
});
