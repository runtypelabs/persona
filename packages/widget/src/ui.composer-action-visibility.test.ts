// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import type { ComposerAction } from "./types";

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

/** The store coalesces on a microtask, so state-driven syncs need a turn. */
const flush = async (times = 4) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

const actionEl = (mount: HTMLElement, id: string) =>
  mount.querySelector<HTMLElement>(`[data-persona-composer-action="${id}"]`);

const typeInto = (mount: HTMLElement, value: string): void => {
  const textarea = mount.querySelector<HTMLTextAreaElement>(
    "[data-persona-composer-input]"
  )!;
  textarea.value = value;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
};

const voiceAction = (patch: Partial<ComposerAction> = {}): ComposerAction =>
  ({
    id: "voice-mode",
    placement: "end",
    label: "Voice mode",
    iconName: "mic",
    onSelect: () => {},
    ...patch,
  }) as ComposerAction;

describe("ComposerAction.visibility", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    controllers.splice(0).forEach((controller) => {
      try {
        controller.destroy();
      } catch {
        /* already destroyed in the test */
      }
    });
    mounts.splice(0).forEach((mount) => mount.remove());
    document.body.innerHTML = "";
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("mounts the control on every draft state under the default", async () => {
    const { mount } = makeController({
      composer: { actions: [voiceAction()] },
    });

    expect(actionEl(mount, "voice-mode")).toBeTruthy();
    typeInto(mount, "Hello");
    await flush();
    expect(actionEl(mount, "voice-mode")).toBeTruthy();
  });

  it('"when-empty" drops the control out of the DOM once the draft has text', async () => {
    const { mount } = makeController({
      composer: { actions: [voiceAction({ visibility: "when-empty" })] },
    });

    await flush();
    expect(actionEl(mount, "voice-mode")).toBeTruthy();

    typeInto(mount, "Hello");
    await flush();
    // Removed, not faded: gone from layout and from tab order.
    expect(actionEl(mount, "voice-mode")).toBeNull();

    // Whitespace is not a draft.
    typeInto(mount, "   ");
    await flush();
    expect(actionEl(mount, "voice-mode")).toBeTruthy();
  });

  it('"when-text" is the inverse of "when-empty" on the same state', async () => {
    const { mount } = makeController({
      composer: {
        actions: [
          voiceAction({ visibility: "when-empty" }),
          voiceAction({ id: "improve", visibility: "when-text", label: "Improve" }),
        ],
      },
    });

    await flush();
    expect(actionEl(mount, "voice-mode")).toBeTruthy();
    expect(actionEl(mount, "improve")).toBeNull();

    typeInto(mount, "Hello");
    await flush();
    expect(actionEl(mount, "voice-mode")).toBeNull();
    expect(actionEl(mount, "improve")).toBeTruthy();
  });

  it('hides a "when-empty" control while streaming, and holds it across chunks', async () => {
    const chunks = [
      'data: {"type":"text_delta","delta":"one"}\n\n',
      'data: {"type":"text_delta","delta":" two"}\n\n',
    ];
    let release: () => void = () => {};
    const settled = new Promise<void>((resolve) => {
      release = resolve;
    });
    const encoder = new TextEncoder();
    global.fetch = vi.fn().mockImplementation(
      async () =>
        ({
          ok: true,
          headers: new Headers({ "content-type": "text/event-stream" }),
          body: new ReadableStream({
            async start(controller) {
              for (const chunk of chunks) {
                controller.enqueue(encoder.encode(chunk));
                // Each chunk is its own turn, so the action row re-syncs between
                // them: a post-render patch would be visible here.
                await Promise.resolve();
              }
              await settled;
              controller.close();
            },
          }),
        }) as unknown as Response
    );

    const { mount } = makeController({
      composer: { actions: [voiceAction({ visibility: "when-empty" })] },
    });

    typeInto(mount, "Hello");
    await flush();
    mount
      .querySelector<HTMLButtonElement>("[data-persona-composer-submit]")!
      .click();

    // The draft cleared on submit; the stream is what keeps the control hidden.
    for (let i = 0; i < 12; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await flush();
      expect(actionEl(mount, "voice-mode")).toBeNull();
    }

    release();
    await flush(20);
    expect(actionEl(mount, "voice-mode")).toBeTruthy();
  });

  it("stays hidden when the visible predicate says so, whatever the draft", async () => {
    const { mount } = makeController({
      composer: {
        actions: [voiceAction({ visibility: "when-empty", visible: false })],
      },
    });

    await flush();
    expect(actionEl(mount, "voice-mode")).toBeNull();
  });

  it("follows a live update() of the visibility mode", async () => {
    const { mount, controller } = makeController({
      composer: { actions: [voiceAction()] },
    });

    typeInto(mount, "Hello");
    await flush();
    expect(actionEl(mount, "voice-mode")).toBeTruthy();

    controller.update({
      composer: { actions: [voiceAction({ visibility: "when-empty" })] },
    });
    await flush();
    expect(actionEl(mount, "voice-mode")).toBeNull();
  });
});
