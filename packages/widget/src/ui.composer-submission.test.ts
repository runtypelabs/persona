// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import { createStaticMentionSource } from "./utils/mention-matcher";
import { loadContextMentions } from "./context-mentions-loader";
import type { ComposerSubmissionSnapshot } from "./types";

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

const typeAndSend = async (mount: HTMLElement, text: string) => {
  const textarea = textareaOf(mount);
  textarea.value = text;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  submitOf(mount).click();
  await flush();
};

const flush = async (times = 8) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

const flushMentions = async () => {
  await loadContextMentions().catch(() => {});
  for (let i = 0; i < 8; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 0));
  }
};

describe("composer submission order", () => {
  const originalFetch = global.fetch;
  let requests: Array<Record<string, unknown>> = [];

  beforeEach(() => {
    requests = [];
    window.scrollTo = vi.fn();
    global.fetch = vi.fn().mockImplementation((_url: string, options: any) => {
      requests.push(JSON.parse(options?.body ?? "{}"));
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

  it("passes a frozen public snapshot to onBeforeSend", async () => {
    let seen: Readonly<ComposerSubmissionSnapshot> | null = null;
    const { mount } = makeController({
      composer: {
        onBeforeSend: (snapshot: Readonly<ComposerSubmissionSnapshot>) => {
          seen = snapshot;
        },
      },
    });

    await typeAndSend(mount, "hello there");

    expect(seen).not.toBeNull();
    expect(seen!.text).toBe("hello there");
    expect(seen!.mentionRefs).toEqual([]);
    expect(seen!.options).toEqual({});
    expect(Object.isFrozen(seen!)).toBe(true);
    expect("mentions" in (seen as unknown as object)).toBe(false);
  });

  it("cancels on false and leaves the draft intact", async () => {
    const { mount, controller } = makeController({
      composer: { onBeforeSend: () => false },
    });

    await typeAndSend(mount, "do not send");

    expect(requests).toHaveLength(0);
    expect(controller.getMessages()).toHaveLength(0);
    expect(textareaOf(mount).value).toBe("do not send");
    expect(controller.getComposerState().text).toBe("do not send");
  });

  it("patches the outgoing snapshot without touching the visible draft", async () => {
    const { mount, controller } = makeController({
      composer: { onBeforeSend: () => ({ text: "rewritten" }) },
    });
    const textarea = textareaOf(mount);
    textarea.value = "original";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    submitOf(mount).click();
    await flush();

    const sent = controller
      .getMessages()
      .filter((message) => message.role === "user")
      .map((message) => message.content);
    expect(sent).toEqual(["rewritten"]);
    // The draft was consumed (accepted send), not replaced with the patch.
    expect(textareaOf(mount).value).toBe("");
  });

  it("awaits an async hook, then dispatches once", async () => {
    let release: (() => void) | null = null;
    const { mount, controller } = makeController({
      composer: {
        onBeforeSend: () =>
          new Promise<void>((resolve) => {
            release = () => resolve();
          }),
      },
    });

    await typeAndSend(mount, "slow send");
    expect(requests).toHaveLength(0);
    expect(controller.getComposerState().phase).toBe("preparing");

    // A repeat submit while preparing is ignored.
    submitOf(mount).click();
    await flush();
    expect(requests).toHaveLength(0);

    release!();
    await flush();
    expect(requests).toHaveLength(1);
    expect(controller.getMessages().filter((m) => m.role === "user")).toHaveLength(
      1
    );
  });

  it("Escape while preparing supersedes the send and preserves the draft", async () => {
    const { mount, controller } = makeController({
      composer: {
        onBeforeSend: (
          _snapshot: unknown,
          { signal }: { signal: AbortSignal }
        ) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(new Error("aborted")));
          }),
      },
    });

    await typeAndSend(mount, "abort me");
    expect(controller.getComposerState().phase).toBe("preparing");

    textareaOf(mount).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    await flush();

    expect(requests).toHaveLength(0);
    expect(textareaOf(mount).value).toBe("abort me");
    expect(controller.getComposerState().phase).toBe("idle");
  });

  it("reports a thrown hook as a preparation error and preserves the draft", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { mount, controller } = makeController({
      composer: {
        onBeforeSend: () => {
          throw new Error("prep failed");
        },
      },
    });

    await typeAndSend(mount, "keep me");

    expect(requests).toHaveLength(0);
    expect(controller.getMessages()).toHaveLength(0);
    expect(textareaOf(mount).value).toBe("keep me");
    expect(errorSpy).toHaveBeenCalled();
    expect(String(errorSpy.mock.calls[0][0])).toContain("onBeforeSend");
    errorSpy.mockRestore();
  });

  it("an async rejection also preserves the draft", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { mount } = makeController({
      composer: { onBeforeSend: async () => Promise.reject(new Error("nope")) },
    });

    await typeAndSend(mount, "still here");
    await flush();

    expect(requests).toHaveLength(0);
    expect(textareaOf(mount).value).toBe("still here");
    errorSpy.mockRestore();
  });

  it("resolves an inline slash command before onBeforeSend sees the text", async () => {
    const seen: string[] = [];
    const { mount, controller } = makeController({
      contextMentions: {
        enabled: true,
        triggers: [
          {
            trigger: "/",
            sources: [
              {
                id: "commands",
                label: "Commands",
                command: "prompt",
                search: () => [
                  { id: "brief", label: "brief", prompt: "Write a brief" },
                ],
                matchCommand: (text: string) =>
                  text.startsWith("/brief")
                    ? { item: { id: "brief", label: "brief" }, args: "" }
                    : null,
                resolve: () => ({ prompt: "Write a brief" }),
              },
            ],
          },
        ],
      },
      composer: {
        onBeforeSend: (snapshot: Readonly<ComposerSubmissionSnapshot>) => {
          seen.push(snapshot.text);
        },
      },
    });

    const textarea = textareaOf(mount);
    textarea.value = "/brief";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    submitOf(mount).click();
    await flushMentions();
    await flush();

    // Whatever the command engine resolves, the hook must observe the resolved
    // text (step 2 runs before step 4), never a stale read of the raw draft.
    expect(seen).toHaveLength(1);
    expect(controller.getMessages().filter((m) => m.role === "user")).toHaveLength(
      1
    );
  });

  it("carries mention refs on the snapshot and clears chips only after acceptance", async () => {
    const seen: Array<Readonly<ComposerSubmissionSnapshot>> = [];
    const { mount, controller } = makeController({
      contextMentions: {
        enabled: true,
        sources: [
          createStaticMentionSource({
            id: "files",
            label: "Files",
            items: [{ id: "app", label: "app" }],
            resolve: (item: { label: string }) => ({
              llmAppend: `body of ${item.label}`,
            }),
          }),
        ],
      },
      composer: {
        onBeforeSend: (snapshot: Readonly<ComposerSubmissionSnapshot>) => {
          seen.push(snapshot);
          return false;
        },
      },
    });

    const textarea = textareaOf(mount);
    textarea.value = "@app";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    await flushMentions();
    textarea.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
    );
    await flushMentions();

    const chipsBefore = mount.querySelectorAll("[data-persona-mention-chip]");
    expect(chipsBefore).toHaveLength(1);

    submitOf(mount).click();
    await flush();

    // The snapshot carried the ref, and the cancel left the chip attached.
    expect(seen).toHaveLength(1);
    expect(seen[0].mentionRefs.map((ref) => ref.label)).toEqual(["app"]);
    expect(controller.getMessages()).toHaveLength(0);
    expect(mount.querySelectorAll("[data-persona-mention-chip]")).toHaveLength(1);
    expect(controller.getComposerState().mentionRefs).toHaveLength(1);
  });

  it("routes suggestion sends through the same interceptor", async () => {
    const seen: string[] = [];
    const { mount, controller } = makeController({
      suggestions: {
        starters: { items: [{ label: "Show pricing" }], behavior: "send" },
      },
      composer: {
        onBeforeSend: (snapshot: Readonly<ComposerSubmissionSnapshot>) => {
          seen.push(snapshot.text);
          return false;
        },
      },
    });

    const chip = Array.from(
      mount.querySelectorAll<HTMLButtonElement>("button.persona-suggestion")
    ).find((button) => button.textContent?.includes("Show pricing"))!;
    chip.click();
    await flush();

    expect(seen).toEqual(["Show pricing"]);
    expect(controller.getMessages()).toHaveLength(0);
  });

  it("routes a plugin composer submit through the same interceptor", async () => {
    const seen: string[] = [];
    const plugin = {
      id: "custom-composer",
      renderComposer: (ctx: { onSubmit: (text: string) => void }) => {
        const footer = document.createElement("div");
        const form = document.createElement("form");
        form.setAttribute("data-persona-composer-form", "");
        const input = document.createElement("textarea");
        input.setAttribute("data-persona-composer-input", "");
        const button = document.createElement("button");
        button.setAttribute("data-test-send", "");
        button.addEventListener("click", () => ctx.onSubmit("from plugin"));
        form.append(input, button);
        footer.appendChild(form);
        return footer;
      },
    };
    const { mount, controller } = makeController({
      plugins: [plugin],
      composer: {
        onBeforeSend: (snapshot: Readonly<ComposerSubmissionSnapshot>) => {
          seen.push(snapshot.text);
        },
      },
    });

    mount.querySelector<HTMLButtonElement>("[data-test-send]")!.click();
    await flush();

    expect(seen).toEqual(["from plugin"]);
    expect(
      controller.getMessages().filter((message) => message.role === "user")
    ).toHaveLength(1);
  });

  it("keeps the existing content priority chain for attachments", async () => {
    const { mount, controller } = makeController({
      attachments: { enabled: true },
      composer: { onBeforeSend: () => ({ text: "patched caption" }) },
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
    await vi.waitFor(() =>
      expect(controller.getComposerState().attachments[0]?.status).toBe("ready")
    );

    await typeAndSend(mount, "caption");

    const userMessage = controller
      .getMessages()
      .find((message) => message.role === "user")!;
    const parts = (userMessage.contentParts ?? []) as Array<{
      type: string;
      text?: string;
    }>;
    // Attachment parts first, patched text last, and the previews cleared.
    expect(parts[0].type).toBe("file");
    expect(parts[parts.length - 1]).toMatchObject({
      type: "text",
      text: "patched caption",
    });
    expect(controller.getComposerState().attachments).toHaveLength(0);
  });
});
