// @vitest-environment jsdom

/**
 * Phase 3 attachment lifecycle: the public `attachments.onChange` event and the
 * `attachments.adapter` upload contract, observed through the mounted widget.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import type { AgentWidgetPlugin } from "./plugins/types";
import type {
  AgentWidgetAttachmentAdapter,
  ComposerAttachmentState,
  ContentPart,
} from "./types";

type ComposerCtx = Parameters<NonNullable<AgentWidgetPlugin["renderComposer"]>>[0];

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

const tileOf = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>("[data-attachment-id]");

const flush = async (times = 8) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

const macro = async (times = 4) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 0));
  }
};

const pick = (mount: HTMLElement, name = "note.txt") => {
  const input = mount.querySelector<HTMLInputElement>(
    "[data-persona-composer-attachment-input]"
  )!;
  const file = new File(["hi"], name, { type: "text/plain" });
  Object.defineProperty(input, "files", {
    configurable: true,
    value: { 0: file, length: 1, item: () => file },
  });
  input.dispatchEvent(new Event("change", { bubbles: true }));
};

function deferredAdapter() {
  const calls: Array<{
    signal: AbortSignal;
    onProgress: (value: number) => void;
    resolve: (part: ContentPart) => void;
    reject: (error: unknown) => void;
  }> = [];
  const adapter: AgentWidgetAttachmentAdapter = {
    add: (_file, context) =>
      new Promise<ContentPart>((resolve, reject) => {
        calls.push({
          signal: context.signal,
          onProgress: context.onProgress,
          resolve,
          reject,
        });
      }),
  };
  return { adapter, calls };
}

const createGatePlugin = () => {
  const state = { gated: false, ctx: null as ComposerCtx | null };
  const plugin: AgentWidgetPlugin = {
    id: "gate",
    renderComposer: (ctx) => {
      state.ctx = ctx;
      return null;
    },
  };
  return { plugin, state };
};

describe("composer attachment lifecycle", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    window.scrollTo = vi.fn();
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

  it("reports the public state shape to attachments.onChange, with no internals", async () => {
    const batches: (readonly ComposerAttachmentState[])[] = [];
    const { mount } = makeController({
      attachments: {
        enabled: true,
        onChange: (attachments: readonly ComposerAttachmentState[]) =>
          batches.push(attachments),
      },
    });

    pick(mount);
    await macro();

    expect(batches.length).toBeGreaterThan(0);
    const latest = batches.at(-1)!;
    expect(latest).toHaveLength(1);
    expect(Object.keys(latest[0]).sort()).toEqual([
      "error",
      "id",
      "mimeType",
      "name",
      "progress",
      "size",
      "status",
    ]);
    expect(latest[0]).toMatchObject({
      name: "note.txt",
      mimeType: "text/plain",
      status: "ready",
    });
    // No File handle, content part, or DOM node leaks into the payload.
    expect(latest[0]).not.toHaveProperty("file");
    expect(latest[0]).not.toHaveProperty("contentPart");
    expect(latest[0]).not.toHaveProperty("previewUrl");
  });

  it("shows an uploading tile with progress and only unlocks send when ready", async () => {
    const { adapter, calls } = deferredAdapter();
    const { mount, controller } = makeController({
      attachments: { enabled: true, adapter },
    });

    pick(mount);
    await macro();

    const tile = tileOf(mount)!;
    expect(tile.dataset.status).toBe("uploading");
    expect(controller.getComposerState().attachments[0].status).toBe("uploading");
    // Send is gated while the upload is in flight.
    expect(submitOf(mount).disabled).toBe(true);

    const input = inputOf(mount);
    input.value = "with a file";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
    );
    await flush();
    expect(
      controller.getMessages().filter((m) => m.role === "user")
    ).toHaveLength(0);

    calls[0].onProgress(0.6);
    expect(
      mount.querySelector<HTMLElement>(".persona-attachment-progress__bar")!.style
        .width
    ).toBe("60%");
    expect(controller.getComposerState().attachments[0].progress).toBe(0.6);

    calls[0].resolve({ type: "text", text: "uploaded" } as ContentPart);
    await macro();

    expect(tile.dataset.status).toBe("ready");
    expect(submitOf(mount).disabled).toBe(false);
  });

  it("surfaces an upload failure with a retry affordance on the tile", async () => {
    const { adapter, calls } = deferredAdapter();
    const { mount, controller } = makeController({
      attachments: { enabled: true, adapter },
    });

    pick(mount);
    await macro();
    calls[0].reject(new Error("storage offline"));
    await macro();

    const tile = tileOf(mount)!;
    expect(tile.dataset.status).toBe("error");
    expect(controller.getComposerState().attachments[0]).toMatchObject({
      status: "error",
      error: "storage offline",
    });
    expect(submitOf(mount).disabled).toBe(true);

    tile.querySelector<HTMLButtonElement>(".persona-attachment-retry")!.click();
    await macro();
    expect(tile.dataset.status).toBe("uploading");

    calls[1].resolve({ type: "text", text: "uploaded" } as ContentPart);
    await macro();
    expect(tile.dataset.status).toBe("ready");
    expect(submitOf(mount).disabled).toBe(false);
  });

  it("aborts the in-flight upload when the tile is removed", async () => {
    const { adapter, calls } = deferredAdapter();
    const { mount, controller } = makeController({
      attachments: { enabled: true, adapter },
    });

    pick(mount);
    await macro();
    tileOf(mount)!
      .querySelector<HTMLButtonElement>(".persona-attachment-remove")!
      .click();

    expect(calls[0].signal.aborted).toBe(true);
    await macro();
    expect(controller.getComposerState().attachments).toHaveLength(0);
    expect(submitOf(mount).disabled).toBe(false);
  });

  it("aborts every upload on clear chat and on destroy", async () => {
    const { adapter, calls } = deferredAdapter();
    const { mount, controller } = makeController({
      attachments: { enabled: true, adapter },
    });

    pick(mount);
    await macro();
    controller.clearChat();
    expect(calls[0].signal.aborted).toBe(true);
    expect(controller.getComposerState().attachments).toHaveLength(0);

    pick(mount, "second.txt");
    await macro();
    controller.destroy();
    expect(calls[1].signal.aborted).toBe(true);
  });

  it("ignores a late completion after destroy", async () => {
    const { adapter, calls } = deferredAdapter();
    const { mount, controller } = makeController({
      attachments: { enabled: true, adapter },
    });

    pick(mount);
    await macro();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    controller.destroy();

    calls[0].resolve({ type: "text", text: "too late" } as ContentPart);
    await macro();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("carries an in-flight upload through a composer rebuild", async () => {
    const { adapter, calls } = deferredAdapter();
    const { plugin, state } = createGatePlugin();
    const { mount, controller } = makeController({
      attachments: { enabled: true, adapter },
      plugins: [plugin],
    });

    pick(mount);
    await macro();
    expect(tileOf(mount)!.dataset.status).toBe("uploading");

    state.ctx!.requestRender();
    const rebuilt = tileOf(mount)!;
    expect(rebuilt.dataset.status).toBe("uploading");
    expect(submitOf(mount).disabled).toBe(true);

    // Progress continues into the remounted tile.
    calls[0].onProgress(0.75);
    expect(
      mount.querySelector<HTMLElement>(".persona-attachment-progress__bar")!.style
        .width
    ).toBe("75%");

    calls[0].resolve({ type: "text", text: "uploaded" } as ContentPart);
    await macro();
    expect(tileOf(mount)!.dataset.status).toBe("ready");
    expect(controller.getComposerState().attachments[0].status).toBe("ready");
    expect(submitOf(mount).disabled).toBe(false);
  });

  it("sends the uploaded part once every attachment is ready", async () => {
    const { adapter, calls } = deferredAdapter();
    const { mount, controller } = makeController({
      attachments: { enabled: true, adapter },
    });

    pick(mount);
    await macro();
    calls[0].resolve({ type: "text", text: "uploaded-ref" } as ContentPart);
    await macro();

    const input = inputOf(mount);
    input.value = "caption";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    submitOf(mount).click();
    await flush();

    const message = controller
      .getMessages()
      .find((entry) => entry.role === "user")!;
    expect(message.contentParts).toEqual([
      { type: "text", text: "uploaded-ref" },
      { type: "text", text: "caption" },
    ]);
    expect(controller.getComposerState().attachments).toHaveLength(0);
  });
});
