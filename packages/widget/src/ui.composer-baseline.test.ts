// @vitest-environment jsdom

/**
 * Phase 3 baseline composer configuration: submit keys and mobile behavior,
 * editor sizing and safe attributes, and the inputDisabled / sendDisabled
 * locks.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import { createStaticMentionSource } from "./utils/mention-matcher";
import { loadContextMentions } from "./context-mentions-loader";
import {
  setContextMentionsInlineLoader,
  loadContextMentionsInline,
} from "./context-mentions-inline-loader";
import { mountInlineComposer } from "./context-mentions-inline-entry";

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

const inputOf = (mount: HTMLElement) =>
  mount.querySelector<HTMLTextAreaElement>("[data-persona-composer-input]")!;

const submitOf = (mount: HTMLElement) =>
  mount.querySelector<HTMLButtonElement>("[data-persona-composer-submit]")!;

const statusOf = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>("[data-persona-composer-status]")!;

const flush = async (times = 8) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

const macro = async (times = 8) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 0));
  }
};

type KeyInit = {
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
};

/** Returns true when the handler prevented the default (i.e. it claimed Enter). */
const pressEnter = (el: Element, init: KeyInit = {}): boolean => {
  const event = new KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true,
    ...init,
  });
  el.dispatchEvent(event);
  return event.defaultPrevented;
};

/** Enter during an IME composition; jsdom needs `isComposing` forced on. */
const pressComposingEnter = (el: Element): boolean => {
  const event = new KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, "isComposing", { value: true });
  el.dispatchEvent(event);
  return event.defaultPrevented;
};

const setCoarsePointer = (coarse: boolean) => {
  window.matchMedia = ((query: string) => ({
    matches: coarse && query === "(pointer: coarse)",
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
};

const userMessages = (controller: ReturnType<typeof createAgentExperience>) =>
  controller.getMessages().filter((message) => message.role === "user");

const isStreaming = (controller: ReturnType<typeof createAgentExperience>) =>
  controller.getComposerState().phase === "streaming";

describe("composer baseline configuration", () => {
  const originalFetch = global.fetch;
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    window.scrollTo = vi.fn();
    setCoarsePointer(false);
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
    window.matchMedia = originalMatchMedia;
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  // --- 7.2 submit keys ------------------------------------------------------

  describe("submit keys", () => {
    it("enter (default) submits on Enter", async () => {
      const { mount, controller } = makeController();
      const input = inputOf(mount);

      input.value = "one";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      expect(pressEnter(input)).toBe(true);
      await flush();
      expect(userMessages(controller)).toHaveLength(1);
    });

    it("enter (default) keeps submitting on a held modifier", async () => {
      const { mount, controller } = makeController();
      const input = inputOf(mount);
      input.value = "one";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      expect(pressEnter(input, { metaKey: true })).toBe(true);
      await flush();
      expect(userMessages(controller)).toHaveLength(1);
    });

    it("mod-enter submits on Command+Enter and Ctrl+Enter, never bare Enter", async () => {
      const { mount, controller } = makeController({
        composer: { submitKey: "mod-enter" },
      });
      const input = inputOf(mount);

      input.value = "typed";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      // Plain Enter inserts a newline: the handler must not claim it.
      expect(pressEnter(input)).toBe(false);
      await flush();
      expect(userMessages(controller)).toHaveLength(0);

      expect(pressEnter(input, { metaKey: true })).toBe(true);
      await flush();
      expect(userMessages(controller)).toHaveLength(1);
    });

    it("mod-enter also submits on Ctrl+Enter", async () => {
      const { mount, controller } = makeController({
        composer: { submitKey: "mod-enter" },
      });
      const input = inputOf(mount);
      input.value = "typed";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      expect(pressEnter(input, { ctrlKey: true })).toBe(true);
      await flush();
      expect(userMessages(controller)).toHaveLength(1);
    });

    it("none leaves submission to the button and the controller", async () => {
      const { mount, controller } = makeController({
        composer: { submitKey: "none" },
      });
      const input = inputOf(mount);
      input.value = "typed";
      input.dispatchEvent(new Event("input", { bubbles: true }));

      expect(pressEnter(input)).toBe(false);
      expect(pressEnter(input, { metaKey: true })).toBe(false);
      expect(pressEnter(input, { ctrlKey: true })).toBe(false);
      await flush();
      expect(userMessages(controller)).toHaveLength(0);

      submitOf(mount).click();
      await flush();
      expect(userMessages(controller)).toHaveLength(1);
    });

    it("Shift+Enter never submits under any mode", async () => {
      for (const submitKey of ["enter", "mod-enter", "none"] as const) {
        const { mount, controller } = makeController({
          composer: { submitKey },
        });
        const input = inputOf(mount);
        input.value = "typed";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        expect(pressEnter(input, { shiftKey: true })).toBe(false);
        // eslint-disable-next-line no-await-in-loop
        await flush();
        expect(userMessages(controller)).toHaveLength(0);
      }
    });

    it("never submits during IME composition under any mode", async () => {
      for (const submitKey of ["enter", "mod-enter", "none"] as const) {
        const { mount, controller } = makeController({
          composer: { submitKey },
        });
        const input = inputOf(mount);
        input.value = "にほんご";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        expect(pressComposingEnter(input)).toBe(false);
        // eslint-disable-next-line no-await-in-loop
        await flush();
        expect(userMessages(controller)).toHaveLength(0);
      }
    });

    it("stays Enter-inert while streaming under every mode", async () => {
      for (const submitKey of ["enter", "mod-enter"] as const) {
        const { mount, controller } = makeController({
          composer: { submitKey },
        });
        const input = inputOf(mount);
        input.value = "first";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        if (submitKey === "enter") pressEnter(input);
        else pressEnter(input, { metaKey: true });
        // eslint-disable-next-line no-await-in-loop
        await flush();
        expect(isStreaming(controller)).toBe(true);

        input.value = "second";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        const claimed =
          submitKey === "enter"
            ? pressEnter(input)
            : pressEnter(input, { metaKey: true });
        // The submit combination is swallowed, never treated as stop.
        expect(claimed).toBe(true);
        // eslint-disable-next-line no-await-in-loop
        await flush();
        expect(userMessages(controller)).toHaveLength(1);
        expect(isStreaming(controller)).toBe(true);
      }
    });

    it("insertNewlineOnTouchEnter turns Enter into a newline on a coarse pointer", async () => {
      setCoarsePointer(true);
      const { mount, controller } = makeController({
        composer: { insertNewlineOnTouchEnter: true },
      });
      const input = inputOf(mount);
      input.value = "typed";
      input.dispatchEvent(new Event("input", { bubbles: true }));

      expect(pressEnter(input)).toBe(false);
      await flush();
      expect(userMessages(controller)).toHaveLength(0);
      // The button is still the submit affordance.
      submitOf(mount).click();
      await flush();
      expect(userMessages(controller)).toHaveLength(1);
    });

    it("insertNewlineOnTouchEnter is inert on a fine pointer", async () => {
      const { mount, controller } = makeController({
        composer: { insertNewlineOnTouchEnter: true },
      });
      const input = inputOf(mount);
      input.value = "typed";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      expect(pressEnter(input)).toBe(true);
      await flush();
      expect(userMessages(controller)).toHaveLength(1);
    });

    it("the mention menu keeps first refusal over Enter", async () => {
      const { mount, controller } = makeController({
        contextMentions: {
          enabled: true,
          sources: [
            createStaticMentionSource({
              id: "files",
              label: "Files",
              items: [{ id: "app", label: "App.tsx" }],
              resolve: async () => ({ llmAppend: "app body" }),
            }),
          ],
        },
      });
      const input = inputOf(mount);
      mount
        .querySelector<HTMLButtonElement>("[aria-haspopup='listbox']")!
        .click();
      await loadContextMentions().catch(() => {});
      await macro();

      input.value = "hello @";
      input.setSelectionRange(7, 7);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await macro();
      pressEnter(input);
      await flush();
      // The open menu consumed Enter: nothing was sent.
      expect(userMessages(controller)).toHaveLength(0);
    });

    it("derives enterKeyHint from the mode, live", async () => {
      const { mount, controller } = makeController();
      expect(inputOf(mount).getAttribute("enterkeyhint")).toBe("send");

      controller.update({ composer: { submitKey: "mod-enter" } } as never);
      expect(inputOf(mount).getAttribute("enterkeyhint")).toBe("enter");

      controller.update({ composer: { submitKey: "none" } } as never);
      expect(inputOf(mount).getAttribute("enterkeyhint")).toBe("enter");

      controller.update({ composer: { submitKey: "enter" } } as never);
      expect(inputOf(mount).getAttribute("enterkeyhint")).toBe("send");
    });
  });

  // --- 7.2 / 7.3 inline contenteditable ------------------------------------

  describe("inline contenteditable editor", () => {
    const mountInline = async (config: Record<string, unknown> = {}) => {
      setContextMentionsInlineLoader(async () => ({ mountInlineComposer }));
      const made = makeController({
        contextMentions: {
          enabled: true,
          display: "inline",
          sources: [
            createStaticMentionSource({
              id: "files",
              label: "Files",
              items: [{ id: "app", label: "App.tsx" }],
              resolve: async () => ({ llmAppend: "app body" }),
            }),
          ],
        },
        ...config,
      });
      await loadContextMentionsInline().catch(() => {});
      await macro();
      return made;
    };

    it("applies the submit key, sizing, and attributes to the swapped surface", async () => {
      const { mount } = await mountInline({
        composer: {
          submitKey: "mod-enter",
          maxLines: 6,
          inputAttributes: { spellcheck: false, ariaLabel: "Inline composer" },
        },
      });
      const editor = inputOf(mount) as unknown as HTMLElement;

      expect(editor.getAttribute("contenteditable")).toBe("true");
      expect(editor.getAttribute("enterkeyhint")).toBe("enter");
      expect(editor.getAttribute("spellcheck")).toBe("false");
      expect(editor.getAttribute("aria-label")).toBe("Inline composer");
      expect(editor.style.maxHeight).toBe("120px");
    });

    it("keeps a placeholder-derived accessible name when no ariaLabel is configured", async () => {
      const { mount } = await mountInline({
        copy: { inputPlaceholder: "Ask about a file" },
      });
      const editor = inputOf(mount) as unknown as HTMLElement;
      expect(editor.getAttribute("aria-label")).toBe("Ask about a file");
    });

    it("submits on the configured combination only", async () => {
      const { mount, controller } = await mountInline({
        composer: { submitKey: "mod-enter" },
      });
      const editor = inputOf(mount) as unknown as HTMLElement;
      (editor as unknown as HTMLTextAreaElement).value = "inline draft";
      await flush();

      expect(pressEnter(editor)).toBe(false);
      await flush();
      expect(userMessages(controller)).toHaveLength(0);

      expect(pressEnter(editor, { metaKey: true })).toBe(true);
      await flush();
      expect(userMessages(controller)).toHaveLength(1);
    });

    it("locks the surface with contenteditable=false when inputDisabled", async () => {
      const { mount, controller } = await mountInline();
      const editor = inputOf(mount) as unknown as HTMLElement;
      expect(editor.getAttribute("contenteditable")).toBe("true");

      controller.update({ composer: { inputDisabled: true } } as never);
      expect(editor.getAttribute("contenteditable")).toBe("false");
      expect(editor.getAttribute("aria-disabled")).toBe("true");

      controller.update({ composer: { inputDisabled: false } } as never);
      expect(editor.getAttribute("contenteditable")).toBe("true");
    });
  });

  // --- 7.3 sizing and attributes -------------------------------------------

  describe("maxLines", () => {
    it("caps the full composer at the configured line count", () => {
      const { mount } = makeController({ composer: { maxLines: 8 } });
      expect(inputOf(mount).style.maxHeight).toBe("160px");
    });

    it("caps the composer-bar pill at the configured line count", () => {
      const { mount } = makeController({
        launcher: { enabled: true, mountMode: "composer-bar" },
        composer: { maxLines: 2 },
      });
      expect(inputOf(mount).style.maxHeight).toBe("40px");
    });

    it("defaults to 3 lines for the full composer and 5 for the pill", () => {
      const full = makeController();
      expect(inputOf(full.mount).style.maxHeight).toBe("60px");
      const pill = makeController({
        launcher: { enabled: true, mountMode: "composer-bar" },
      });
      expect(inputOf(pill.mount).style.maxHeight).toBe("100px");
    });

    it("re-applies on controller.update()", () => {
      const { mount, controller } = makeController({ composer: { maxLines: 2 } });
      expect(inputOf(mount).style.maxHeight).toBe("40px");
      controller.update({ composer: { maxLines: 9 } } as never);
      expect(inputOf(mount).style.maxHeight).toBe("180px");
    });
  });

  describe("inputAttributes", () => {
    it("applies the allowlist to the textarea", () => {
      const { mount } = makeController({
        composer: {
          inputAttributes: {
            autocomplete: "on",
            autocapitalize: "words",
            spellcheck: false,
            inputmode: "search",
            ariaLabel: "Message the assistant",
          },
        },
      });
      const input = inputOf(mount);
      expect(input.getAttribute("autocomplete")).toBe("on");
      expect(input.getAttribute("autocapitalize")).toBe("words");
      expect(input.getAttribute("spellcheck")).toBe("false");
      expect(input.getAttribute("inputmode")).toBe("search");
      expect(input.getAttribute("aria-label")).toBe("Message the assistant");
    });

    it("never overrides persona data attributes, disabled, class, style, or value", () => {
      const { mount } = makeController({
        composer: {
          inputAttributes: {
            "data-persona-composer-input": "hijacked",
            disabled: true,
            class: "evil",
            style: "display:none",
            value: "injected",
          },
        },
      });
      const input = inputOf(mount);
      expect(input.getAttribute("data-persona-composer-input")).toBe("");
      expect(input.disabled).toBe(false);
      expect(input.className).toContain("persona-composer-textarea");
      expect(input.style.display).not.toBe("none");
      expect(input.value).toBe("");
    });

    it("re-applies and clears on controller.update()", () => {
      const { mount, controller } = makeController({
        composer: { inputAttributes: { ariaLabel: "First", spellcheck: true } },
      });
      const input = inputOf(mount);
      expect(input.getAttribute("aria-label")).toBe("First");

      controller.update({
        composer: { inputAttributes: { ariaLabel: "Second" } },
      } as never);
      expect(input.getAttribute("aria-label")).toBe("Second");
      // Config patches merge recursively: spellcheck survives until cleared.
      expect(input.getAttribute("spellcheck")).toBe("true");

      controller.update({
        composer: {
          inputAttributes: { ariaLabel: undefined, spellcheck: undefined },
        },
      } as never);
      expect(input.hasAttribute("aria-label")).toBe(false);
      expect(input.hasAttribute("spellcheck")).toBe(false);
      expect(input.getAttribute("autocomplete")).toBe("off");
    });

    it("keeps dir=auto on the editor", () => {
      const { mount } = makeController();
      expect(inputOf(mount).getAttribute("dir")).toBe("auto");
    });
  });

  // --- 7.4 inputDisabled ----------------------------------------------------

  describe("inputDisabled", () => {
    const lockedConfig = {
      attachments: { enabled: true },
      voiceRecognition: { enabled: true, provider: { type: "custom" } },
      suggestionChips: [{ id: "s1", label: "Hi", prompt: "Hi there" }],
      contextMentions: {
        enabled: true,
        sources: [
          createStaticMentionSource({
            id: "files",
            label: "Files",
            items: [{ id: "app", label: "App.tsx" }],
            resolve: async () => ({ llmAppend: "app body" }),
          }),
        ],
      },
      composer: { inputDisabled: { reason: "Session is read only" } },
    };

    it("locks the editor, attachment intake, mentions, dictation, and suggestions", () => {
      const { mount, controller } = makeController(lockedConfig);
      const input = inputOf(mount);

      expect(input.disabled).toBe(true);
      expect(input.getAttribute("aria-disabled")).toBe("true");
      expect(controller.getComposerState().inputDisabled).toBe(true);
      expect(controller.getComposerState().sendDisabled).toBe(true);

      expect(
        mount.querySelector<HTMLButtonElement>(
          "[data-persona-composer-attachment-button]"
        )!.disabled
      ).toBe(true);
      expect(
        mount.querySelector<HTMLInputElement>(
          "[data-persona-composer-attachment-input]"
        )!.disabled
      ).toBe(true);
      expect(
        mount.querySelector<HTMLButtonElement>("[data-persona-composer-mic]")!
          .disabled
      ).toBe(true);
      expect(
        mount.querySelector<HTMLButtonElement>("[aria-haspopup='listbox']")!
          .disabled
      ).toBe(true);
      expect(
        mount.querySelector<HTMLButtonElement>(".persona-suggestion")?.disabled
      ).toBe(true);
      expect(submitOf(mount).disabled).toBe(true);
    });

    it("blocks paste-to-attach and drag-and-drop intake", async () => {
      const { mount, controller } = makeController(lockedConfig);
      const input = inputOf(mount);

      const file = new File(["x"], "shot.png", { type: "image/png" });
      const paste = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(paste, "clipboardData", {
        value: { items: [], files: [file], types: ["Files"] },
      });
      input.dispatchEvent(paste);

      const drop = new Event("drop", { bubbles: true, cancelable: true });
      Object.defineProperty(drop, "dataTransfer", {
        value: { files: [file], types: ["Files"] },
      });
      mount.dispatchEvent(drop);

      await macro(4);
      expect(controller.getComposerState().attachments).toHaveLength(0);
    });

    it("blocks every submission path", async () => {
      const { mount, controller } = makeController(lockedConfig);
      const input = inputOf(mount);

      // The element is disabled, so drive the store the way the runtime does.
      input.value = "please send";
      input.dispatchEvent(new Event("input", { bubbles: true }));

      pressEnter(input);
      submitOf(mount).click();
      expect(controller.submitMessage("programmatic")).toBe(false);
      expect(controller.setMessage("typed")).toBe(false);
      await flush();
      expect(userMessages(controller)).toHaveLength(0);
    });

    it("unlocks live through controller.update()", async () => {
      const { mount, controller } = makeController({
        composer: { inputDisabled: true },
      });
      expect(inputOf(mount).disabled).toBe(true);

      controller.update({ composer: { inputDisabled: false } } as never);
      expect(inputOf(mount).disabled).toBe(false);
      expect(controller.getComposerState().inputDisabled).toBe(false);

      const input = inputOf(mount);
      input.value = "now allowed";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      pressEnter(input);
      await flush();
      expect(userMessages(controller)).toHaveLength(1);
    });
  });

  // --- 7.4 sendDisabled -----------------------------------------------------

  describe("sendDisabled", () => {
    it("keeps composition fully available", () => {
      const { mount, controller } = makeController({
        attachments: { enabled: true },
        voiceRecognition: { enabled: true, provider: { type: "custom" } },
        composer: { sendDisabled: true },
      });
      const input = inputOf(mount);

      expect(input.disabled).toBe(false);
      input.value = "still typing";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      expect(controller.getComposerState().text).toBe("still typing");
      expect(controller.getComposerState().inputDisabled).toBe(false);
      expect(
        mount.querySelector<HTMLButtonElement>(
          "[data-persona-composer-attachment-button]"
        )!.disabled
      ).toBe(false);
      expect(
        mount.querySelector<HTMLButtonElement>("[data-persona-composer-mic]")!
          .disabled
      ).toBe(false);
    });

    it("blocks Enter, the send button, the controller, and suggestion sends", async () => {
      const { mount, controller } = makeController({
        suggestionChips: [{ id: "s1", label: "Hi", prompt: "Hi there" }],
        composer: { sendDisabled: { reason: "Waiting on approval" } },
      });
      const input = inputOf(mount);
      input.value = "blocked";
      input.dispatchEvent(new Event("input", { bubbles: true }));

      expect(submitOf(mount).disabled).toBe(true);
      // Enter is swallowed rather than inserting a stray newline.
      expect(pressEnter(input)).toBe(true);
      submitOf(mount).click();
      expect(controller.submitMessage("programmatic")).toBe(false);
      mount.querySelector<HTMLButtonElement>(".persona-suggestion")?.click();
      await flush();

      expect(userMessages(controller)).toHaveLength(0);
      // The draft survives untouched.
      expect(controller.getComposerState().text).toBe("blocked");
    });

    it("blocks a plugin action's submit()", async () => {
      const { mount, controller } = makeController({
        composer: {
          sendDisabled: true,
          actions: [
            {
              id: "send-now",
              placement: "end",
              label: "Send now",
              onSelect: (context: { submit: () => void }) => context.submit(),
            },
          ],
        },
      });
      const input = inputOf(mount);
      input.value = "via action";
      input.dispatchEvent(new Event("input", { bubbles: true }));

      mount
        .querySelector<HTMLButtonElement>(
          '[data-persona-composer-action="send-now"] button'
        )!
        .click();
      await flush();
      expect(userMessages(controller)).toHaveLength(0);
    });

    it("keeps Stop working while streaming", async () => {
      const { mount, controller } = makeController();
      const input = inputOf(mount);
      input.value = "start a stream";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      pressEnter(input);
      await flush();
      expect(isStreaming(controller)).toBe(true);

      // The lock arrives mid-stream: the button is Stop, and Stop is not a
      // submission.
      controller.update({ composer: { sendDisabled: true } } as never);
      expect(submitOf(mount).disabled).toBe(false);

      submitOf(mount).click();
      await flush();
      expect(isStreaming(controller)).toBe(false);
      // Still no new user message: only the stream was stopped.
      expect(userMessages(controller)).toHaveLength(1);
    });

    it("does not auto-send a dictation transcript", async () => {
      const { mount, controller } = makeController({
        composer: { sendDisabled: true },
      });
      const input = inputOf(mount);
      // The transcript lands in the composer exactly as dictation writes it.
      input.value = "spoken words";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      controller.submitMessage();
      await flush();

      expect(userMessages(controller)).toHaveLength(0);
      expect(controller.getComposerState().text).toBe("spoken words");
    });
  });

  // --- 7.4 reasons ----------------------------------------------------------

  describe("lock reasons", () => {
    it("renders the reason in the status region with a polite live region", () => {
      const { mount } = makeController({
        composer: { sendDisabled: { reason: "Waiting on approval" } },
      });
      const status = statusOf(mount);
      expect(status.textContent).toBe("Waiting on approval");
      expect(status.getAttribute("aria-live")).toBe("polite");
      expect(status.getAttribute("role")).toBe("status");
      expect(status.hasAttribute("data-persona-composer-reason")).toBe(true);
    });

    it("prefers the inputDisabled reason over the sendDisabled reason", () => {
      const { mount, controller } = makeController({
        composer: {
          inputDisabled: { reason: "Read only" },
          sendDisabled: { reason: "Waiting on approval" },
        },
      });
      expect(statusOf(mount).textContent).toBe("Read only");

      // A bare `true` carries no reason: the send reason shows through.
      controller.update({
        composer: {
          inputDisabled: true,
          sendDisabled: { reason: "Waiting on approval" },
        },
      } as never);
      expect(statusOf(mount).textContent).toBe("Waiting on approval");
    });

    it("restores the normal status text when the lock clears", () => {
      const { mount, controller } = makeController({
        statusIndicator: { idleText: "Online" },
        composer: { sendDisabled: { reason: "Waiting on approval" } },
      });
      const status = statusOf(mount);
      expect(status.textContent).toBe("Waiting on approval");

      controller.update({ composer: { sendDisabled: false } } as never);
      expect(status.hasAttribute("data-persona-composer-reason")).toBe(false);
      expect(status.hasAttribute("aria-live")).toBe(false);
      expect(status.textContent).toBe("Online");
    });

    it("uses a composer tooltip in composer-bar mode, where status is hidden", () => {
      const { mount, controller } = makeController({
        launcher: { enabled: true, mountMode: "composer-bar" },
        composer: { inputDisabled: { reason: "Read only" } },
      });
      const form = mount.querySelector<HTMLElement>(
        "[data-persona-composer-form]"
      )!;
      expect(form.getAttribute("title")).toBe("Read only");
      expect(statusOf(mount).textContent).not.toBe("Read only");

      controller.update({ composer: { inputDisabled: false } } as never);
      expect(form.hasAttribute("title")).toBe(false);
    });
  });
});
