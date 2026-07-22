// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAgentExperience,
  mergeMentionContext,
  mergeFinalizedMentions,
} from "./ui";
import { createStaticMentionSource } from "./utils/mention-matcher";
import { loadContextMentions } from "./context-mentions-loader";
import type { MentionSubmitBundle } from "./utils/context-mention-manager";

const createMount = () => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  return mount;
};

const flush = async (times = 8) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

// Deterministically flush the lazy mention chunk load → mount → open chain by
// awaiting the same memoized loader promise the orchestrator uses, then pumping
// a few macrotasks for the debounced menu search.
const flushMentions = async () => {
  await loadContextMentions().catch(() => {});
  for (let i = 0; i < 8; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 0));
  }
};

const getTextarea = (mount: HTMLElement) =>
  mount.querySelector<HTMLTextAreaElement>("[data-persona-composer-input]")!;

const getSubmit = (mount: HTMLElement) =>
  mount.querySelector<HTMLButtonElement>("[data-persona-composer-submit]")!;

const press = (el: Element, key: string) =>
  el.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
  );

// --- Bug 3: deep cross-bundle context merge (pure helpers) -----------------
describe("mergeMentionContext / mergeFinalizedMentions", () => {
  it("deep-merges per-item maps for a source present in both bundles", () => {
    const a = { files: { app: "a-body" }, docs: { r: 1 } };
    const b = { files: { readme: "b-body" }, links: { x: 2 } };
    const merged = mergeMentionContext(a, b);
    // The shared `files` source keeps BOTH items (shallow spread would drop `app`).
    expect(merged.files).toEqual({ app: "a-body", readme: "b-body" });
    expect(merged.docs).toEqual({ r: 1 });
    expect(merged.links).toEqual({ x: 2 });
  });

  it("b wins on a genuine per-item collision", () => {
    const merged = mergeMentionContext(
      { files: { app: "old" } },
      { files: { app: "new" } }
    );
    expect(merged.files).toEqual({ app: "new" });
  });

  it("concatenates blocks/contentParts and deep-merges context", () => {
    const ra: MentionSubmitBundle = {
      blocks: ["A"],
      contentParts: [],
      context: { files: { app: "a" } },
    };
    const rb: MentionSubmitBundle = {
      blocks: ["B"],
      contentParts: [],
      context: { files: { readme: "b" } },
    };
    const out = mergeFinalizedMentions([ra, rb]);
    expect(out.blocks).toEqual(["A", "B"]);
    expect(out.context.files).toEqual({ app: "a", readme: "b" });
  });

  it("returns an empty bundle when nothing is fulfilled", () => {
    expect(mergeFinalizedMentions([])).toEqual({
      blocks: [],
      contentParts: [],
      context: {},
    });
  });
});

// --- Bug 1: double-submit re-entrancy guard --------------------------------
describe("createAgentExperience: double-submit guard", () => {
  const originalFetch = global.fetch;
  let fetchCalls = 0;

  beforeEach(() => {
    fetchCalls = 0;
    window.scrollTo = vi.fn();
    vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    // Fetch hangs (models an in-flight SSE stream) and counts invocations.
    global.fetch = vi.fn().mockImplementation((_url: string, options: any) => {
      fetchCalls += 1;
      const signal = options.signal as AbortSignal;
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    document.body.innerHTML = "";
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("two synchronous submits dispatch the message only once", async () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
    });

    const textarea = getTextarea(mount);
    textarea.value = "hello";

    // Both clicks land inside the async pre-send window (isStreaming() is still
    // false); the guard must swallow the second.
    getSubmit(mount).click();
    getSubmit(mount).click();
    await flush();

    expect(fetchCalls).toBe(1);
    controller.destroy();
  });
});

// --- Bug 4: history recall must not open the mention menu ------------------
describe("createAgentExperience: history recall does not open the mention menu", () => {
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

  const menuOpen = () =>
    document.querySelector('[role="listbox"]') !== null ||
    !!document
      .querySelector("[aria-haspopup='listbox']")
      ?.getAttribute("aria-expanded")
      ?.includes("true");

  it("recalling a message ending in '@word' keeps the menu closed and ArrowUp still navigates", async () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      contextMentions: {
        enabled: true,
        sources: [
          createStaticMentionSource({
            id: "files",
            label: "Files",
            items: [{ id: "app", label: "app" }],
            resolve: (i: { label: string }) => ({ llmAppend: `body of ${i.label}` }),
          }),
        ],
      },
      initialMessages: [
        {
          id: "u1",
          role: "user",
          content: "first note",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "u2",
          role: "user",
          content: "second @app",
          createdAt: "2026-01-01T00:00:02.000Z",
        },
      ],
    });

    const textarea = getTextarea(mount);

    // Warm the lazy mention engine by opening the picker from its affordance
    // button, so `engine` is live for the recall step below (a loaded engine is
    // exactly the state in which the bug reopened the menu on synthetic input).
    mount.querySelector<HTMLButtonElement>("[aria-haspopup='listbox']")!.click();
    await flushMentions();
    // If the harness can't drive the async menu open, this scenario can't be
    // expressed; bail loudly rather than asserting a vacuous pass.
    expect(menuOpen()).toBe(true);

    // Close the menu, back to an empty composer.
    press(textarea, "Escape");
    await flush();
    expect(menuOpen()).toBe(false);

    // Recall the newest user message (ends in '@app'): its synthetic input must
    // NOT reopen the menu (engine.handleInput would otherwise fire synchronously).
    textarea.setSelectionRange(0, 0);
    press(textarea, "ArrowUp");
    await flush();
    expect(textarea.value).toBe("second @app");
    expect(menuOpen()).toBe(false);

    // Because the menu stayed closed, ArrowUp is still owned by history nav.
    textarea.setSelectionRange(0, 0);
    press(textarea, "ArrowUp");
    await flush();
    expect(textarea.value).toBe("first note");

    controller.destroy();
  });
});
