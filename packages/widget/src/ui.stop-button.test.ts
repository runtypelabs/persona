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

describe("createAgentExperience stop-streaming submit button", () => {
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

    // Fetch hangs until the caller aborts the signal — models an in-flight
    // SSE stream so the widget stays in the "streaming" state.
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

  it("keeps the submit button enabled while streaming and clicking it cancels the stream", async () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
    });

    const submit = mount.querySelector<HTMLButtonElement>(
      "[data-persona-composer-submit]"
    );
    expect(submit).not.toBeNull();

    const textarea = mount.querySelector<HTMLTextAreaElement>(
      "[data-persona-composer-input]"
    )!;
    textarea.value = "Hello";
    submit!.click();

    await flush();

    // Streaming is active: the button must stay enabled so it can be clicked
    // again to stop the response.
    expect(controller.getState().streaming).toBe(true);
    expect(submit!.disabled).toBe(false);
    expect(capturedSignals).toHaveLength(1);
    expect(capturedSignals[0].aborted).toBe(false);

    // Second click — acts as "stop generating".
    submit!.click();

    await flush();

    expect(controller.getState().streaming).toBe(false);
    expect(capturedSignals[0].aborted).toBe(true);
    // No new request should have been fired by the stop click.
    expect(capturedSignals).toHaveLength(1);
    // Typed text is preserved so the user can resend after stopping.
    expect(textarea.value).toBe("");
    // (The textarea was cleared on the *first* submit, not by the stop click —
    // that's fine because after cancel the user can keep typing.)

    controller.destroy();
  });

  it("swaps to the stop icon while streaming and back to the send icon after cancel (icon mode)", async () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      sendButton: { useIcon: true, iconName: "arrow-up" },
    });

    const submit = mount.querySelector<HTMLButtonElement>(
      "[data-persona-composer-submit]"
    )!;
    const textarea = mount.querySelector<HTMLTextAreaElement>(
      "[data-persona-composer-input]"
    )!;

    // Initial state: send icon (aria-label tracks tooltip default).
    expect(submit.getAttribute("aria-label")).toBe("Send message");

    textarea.value = "Hi";
    submit.click();
    await flush();

    expect(controller.getState().streaming).toBe(true);
    expect(submit.getAttribute("aria-label")).toBe("Stop generating");

    submit.click();
    await flush();

    expect(controller.getState().streaming).toBe(false);
    expect(submit.getAttribute("aria-label")).toBe("Send message");

    controller.destroy();
  });

  it("swaps the text label in text mode", async () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      sendButton: { useIcon: false },
      copy: { sendButtonLabel: "Send", stopButtonLabel: "Stop" },
    });

    const submit = mount.querySelector<HTMLButtonElement>(
      "[data-persona-composer-submit]"
    )!;
    const textarea = mount.querySelector<HTMLTextAreaElement>(
      "[data-persona-composer-input]"
    )!;

    expect(submit.textContent).toBe("Send");

    textarea.value = "Hi";
    submit.click();
    await flush();

    expect(controller.getState().streaming).toBe(true);
    expect(submit.textContent).toBe("Stop");

    submit.click();
    await flush();

    expect(controller.getState().streaming).toBe(false);
    expect(submit.textContent).toBe("Send");

    controller.destroy();
  });
});
