// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import type { ComposerState } from "./types";

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

const textareaOf = (mount: HTMLElement) =>
  mount.querySelector<HTMLTextAreaElement>("[data-persona-composer-input]")!;

const submitOf = (mount: HTMLElement) =>
  mount.querySelector<HTMLButtonElement>("[data-persona-composer-submit]")!;

const flushMicrotasks = () => new Promise<void>((r) => queueMicrotask(r));

const flush = async (times = 6) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

describe("composer state view", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    window.scrollTo = vi.fn();
    // Hangs like an in-flight stream so `streaming` is observable.
    global.fetch = vi.fn().mockImplementation((_url: string, options: any) => {
      const signal = options?.signal as AbortSignal | undefined;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    }) as unknown as typeof fetch;
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
    global.fetch = originalFetch;
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("mirrors textarea input into getComposerState()", async () => {
    const { mount, controller } = makeController();
    expect(controller.getComposerState().text).toBe("");

    const textarea = textareaOf(mount);
    textarea.value = "hello";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));

    expect(controller.getComposerState().text).toBe("hello");
  });

  it("mirrors a contenteditable input adapter, not just a textarea", () => {
    // The inline mention mode swaps the textarea for a `value`-shimmed
    // contenteditable host. A plugin composer reproduces that shape: the store
    // reads the adapter's value, never the DOM node's type.
    const plugin = {
      id: "inline-composer",
      renderComposer: () => {
        const footer = document.createElement("div");
        const form = document.createElement("form");
        form.setAttribute("data-persona-composer-form", "");
        const editor = document.createElement("div");
        editor.setAttribute("contenteditable", "true");
        editor.setAttribute("data-persona-composer-input", "");
        Object.defineProperty(editor, "value", {
          configurable: true,
          get: () => editor.textContent ?? "",
          set: (next: string) => {
            editor.textContent = next;
          },
        });
        form.appendChild(editor);
        footer.appendChild(form);
        return footer;
      },
    };
    const { mount, controller } = makeController({ plugins: [plugin] });

    const editor = mount.querySelector<HTMLElement>(
      "[data-persona-composer-input][contenteditable]"
    )!;
    editor.textContent = "typed inline";
    editor.dispatchEvent(new Event("input", { bubbles: true }));

    expect(controller.getComposerState().text).toBe("typed inline");
  });

  it("emits a coalesced persona:composer:state event", async () => {
    const { mount, controller } = makeController();
    const seen: ComposerState[] = [];
    mount.addEventListener("persona:composer:state", (event) => {
      seen.push((event as CustomEvent<ComposerState>).detail);
    });

    const textarea = textareaOf(mount);
    for (const value of ["h", "he", "hel"]) {
      textarea.value = value;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    }
    expect(seen).toHaveLength(0);

    await flushMicrotasks();
    expect(seen).toHaveLength(1);
    expect(seen[0].text).toBe("hel");
    expect(controller.getComposerState().text).toBe("hel");
  });

  it("returns a frozen view that cannot be written back", () => {
    const { mount, controller } = makeController();
    const textarea = textareaOf(mount);
    textarea.value = "draft";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));

    const state = controller.getComposerState();
    try {
      (state as { text: string }).text = "tampered";
    } catch {
      /* frozen */
    }
    expect(controller.getComposerState().text).toBe("draft");
  });

  it("never exposes session, attachment manager, or DOM internals", () => {
    const { controller } = makeController();
    const state = controller.getComposerState();
    expect(Object.keys(state).sort()).toEqual([
      "activeModeIds",
      "attachments",
      "inputDisabled",
      "mentionRefs",
      "pendingSubmission",
      "phase",
      "quote",
      "selectedModelId",
      "sendDisabled",
      "text",
    ]);
  });

  it("moves idle to streaming and back to idle around a send", async () => {
    const { mount, controller } = makeController();
    expect(controller.getComposerState().phase).toBe("idle");

    const textarea = textareaOf(mount);
    textarea.value = "hello";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    submitOf(mount).click();
    await flush();

    expect(controller.getComposerState().phase).toBe("streaming");
    expect(controller.getComposerState().sendDisabled).toBe(true);
    // The draft was consumed by the accepted send.
    expect(controller.getComposerState().text).toBe("");

    // Escape stops the stream (the composer keeps its contents). The handler is
    // scoped by composed path, so it must originate inside the widget.
    textareaOf(mount).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    await flush();
    expect(controller.getComposerState().phase).toBe("idle");
  });

  it("reports preparing while an async onBeforeSend is pending", async () => {
    let release: (() => void) | null = null;
    const { mount, controller } = makeController({
      composer: {
        onBeforeSend: () =>
          new Promise<void>((resolve) => {
            release = () => resolve();
          }),
      },
    });

    const textarea = textareaOf(mount);
    textarea.value = "hello";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    submitOf(mount).click();
    await flush();

    expect(controller.getComposerState().phase).toBe("preparing");
    // The draft is untouched until the send is accepted.
    expect(textareaOf(mount).value).toBe("hello");

    release!();
    await flush();
    expect(controller.getComposerState().phase).not.toBe("preparing");
    expect(textareaOf(mount).value).toBe("");
  });

  it("tracks pending attachments in the state view", async () => {
    const { mount, controller } = makeController({
      attachments: { enabled: true },
    });
    const input = mount.querySelector<HTMLInputElement>(
      "[data-persona-composer-attachment-input]"
    )!;
    const file = new File(["hi"], "note.txt", { type: "text/plain" });
    Object.defineProperty(input, "files", {
      configurable: true,
      value: { 0: file, length: 1, item: () => file },
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    // The tile appears immediately; the default base64 adapter reports
    // `processing` until FileReader resolves on a macrotask.
    await vi.waitFor(() =>
      expect(controller.getComposerState().attachments).toHaveLength(1)
    );
    expect(controller.getComposerState().attachments[0].status).toBe(
      "processing"
    );

    await vi.waitFor(() =>
      expect(controller.getComposerState().attachments[0].status).toBe("ready")
    );
    expect(controller.getComposerState().attachments[0]).toMatchObject({
      name: "note.txt",
      mimeType: "text/plain",
      status: "ready",
    });
  });
});
