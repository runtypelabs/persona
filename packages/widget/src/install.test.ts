// @vitest-environment jsdom
//
// Integration tests for the installer IIFE (`install.ts`). These import the real
// module so the self-executing installer runs in jsdom, then assert behavior by
// observing the mocked global bundles (`window.AgentWidget` /
// `window.AgentWidgetLauncher`) and the lifecycle callbacks / DOM events.
//
// The installer defers loading to `setTimeout` (via `waitForHydration`, since
// jsdom has no `requestIdleCallback`), so tests use fake timers and
// `vi.runAllTimersAsync()` to drive it forward deterministically.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { version } from "../package.json";

const PERSONA_EVENTS = [
  "persona:script-load",
  "persona:launcher-shown",
  "persona:chat-ready",
  "persona:error",
] as const;

type FakeHandle = { open: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn> };

// Captured across a single installer run.
let capturedOnOpen: (() => void) | null;
let launcherMount: ReturnType<typeof vi.fn>;
let launcherDestroy: ReturnType<typeof vi.fn>;
let launcherElement: HTMLButtonElement;
let initAgentWidget: ReturnType<typeof vi.fn>;
let fakeHandle: FakeHandle;
let errorSpy: ReturnType<typeof vi.spyOn>;

/** Subscribe to every persona:* event and record dispatch order + detail. */
function recordEvents() {
  const log: Array<{ type: string; detail: any }> = [];
  const handlers: Array<[string, (e: Event) => void]> = [];
  for (const type of PERSONA_EVENTS) {
    const handler = (e: Event) => log.push({ type, detail: (e as CustomEvent).detail });
    window.addEventListener(type, handler);
    handlers.push([type, handler]);
  }
  return {
    log,
    types: () => log.map((entry) => entry.type),
    stop() {
      handlers.forEach(([type, handler]) => window.removeEventListener(type, handler));
    },
  };
}

/** Make `isCssLoaded()` return true so `loadCSS()` resolves without a network. */
function markCssLoaded() {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.setAttribute("data-persona", "true");
  document.head.appendChild(link);
}

/** Provide the full bundle global so `loadJS()` short-circuits to resolved. */
function provideFullBundle() {
  (window as any).AgentWidget = { initAgentWidget };
}

/**
 * Provide the critical launcher global so `loadLauncher()` short-circuits.
 * `criticalStyles` models a current bundle that embeds its own rules (`true`),
 * one whose inline styles the page blocked (`false`), or an older bundle with
 * no such export (omitted).
 */
function provideLauncherBundle(criticalStyles?: boolean) {
  (window as any).AgentWidgetLauncher = {
    mount: launcherMount,
    ...(criticalStyles === undefined ? {} : { installCriticalStyles: vi.fn(() => criticalStyles) }),
  };
}

/** Which resource hints the simulated browser understands (jsdom knows none). */
function supportHints(...rels: string[]) {
  vi.spyOn(DOMTokenList.prototype, "supports").mockImplementation((rel: string) => rels.includes(rel));
}

/** Resource hints the installer has added, by `rel`. */
function hints(rel: string) {
  return Array.from(document.head.querySelectorAll<HTMLLinkElement>(`link[rel="${rel}"]`));
}

const stylesheetLink = () =>
  document.head.querySelector<HTMLLinkElement>('link[rel="stylesheet"][data-persona]');

/** jsdom never fires load/error on injected nodes; settle one by hand. */
function settle(node: Element | null, type: "load" | "error" = "load") {
  const handler = (node as any)?.[`on${type}`];
  expect(handler, `on${type} handler`).toBeTypeOf("function");
  handler(new Event(type));
}

/**
 * The installer captures document.currentScript.src synchronously at module
 * evaluation; fake it with an own-property override (jsdom's getter lives on
 * the prototype, so a configurable instance property shadows it cleanly).
 */
function setCurrentScript(src: string) {
  const script = document.createElement("script");
  script.src = src;
  Object.defineProperty(document, "currentScript", { value: script, configurable: true });
}

/**
 * The usual embed: every asset sits beside the installer, so it is the
 * installer's own release and the launcher is trusted to style itself.
 */
const SELF_HOSTED = "https://assets.example.com/persona";
const installedBesideAssets = () => setCurrentScript(`${SELF_HOSTED}/install.global.js`);

/** The lazy chunks a default config's reveal waits for, in request order. */
const REVEAL_CHUNKS = [
  "composer-actions-runtime", "markdown-parsers", "activity-ui", "loading-label-runtime",
  "dictation-runtime", "icons-extra",
];
/** What the first turn then imports: only ever fetched speculatively. */
const TURN_CHUNKS = ["client-dispatch", "client-stream"];
const DEFAULT_CHUNKS = [...REVEAL_CHUNKS, ...TURN_CHUNKS];

/**
 * Force the next dynamically-inserted <script> to error. jsdom never fires
 * load/error on injected scripts, so we trigger `onerror` on a fake timer that
 * `runAllTimersAsync()` flushes: deterministic under fake timers.
 */
function failNextScriptLoad() {
  const head = document.head;
  const original = head.appendChild.bind(head);
  vi.spyOn(head, "appendChild").mockImplementation(((node: any) => {
    const result = original(node);
    if (node && node.tagName === "SCRIPT") {
      setTimeout(() => node.onerror && node.onerror(new Event("error")), 0);
    }
    return result;
  }) as any);
}

async function install(config: any) {
  (window as any).siteAgentConfig = config;
  await import("./install");
}

/** Flush waitForHydration's timer, the deferred init setTimeout(0), prefetch, etc. */
async function flush() {
  await vi.runAllTimersAsync();
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();

  document.head.innerHTML = "";
  document.body.innerHTML = "";
  try {
    window.sessionStorage.clear();
    window.localStorage.clear();
  } catch {
    /* storage unavailable */
  }

  delete (window as any).__siteAgentInstallerLoaded;
  delete (window as any).siteAgentConfig;
  delete (window as any).AgentWidget;
  delete (window as any).AgentWidgetLauncher;
  capturedOnOpen = null;

  launcherElement = document.createElement("button");
  launcherDestroy = vi.fn();
  launcherMount = vi.fn((opts: any) => {
    capturedOnOpen = opts.onOpen;
    document.body.append(launcherElement);
    return {
      root: document.createElement("div"),
      element: launcherElement,
      update: vi.fn(),
      destroy: launcherDestroy,
    };
  });

  fakeHandle = { open: vi.fn(), close: vi.fn(), on: vi.fn() };
  initAgentWidget = vi.fn(() => fakeHandle);

  vi.spyOn(console, "warn").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  // A current browser: both hints work, so nothing falls back to fetch().
  supportHints("modulepreload", "prefetch");
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(""))));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (navigator as any).connection;
  delete (document as any).currentScript;
});

describe("install.ts: onScriptLoad beacon", () => {
  it("fires synchronously on script execution, before any loading or gating", async () => {
    const events = recordEvents();
    const onScriptLoad = vi.fn();

    // No config at all: the beacon must still fire (diagnostics: "did my embed run").
    await install({ onScriptLoad });

    // Fired during module evaluation: no timer flush needed.
    expect(onScriptLoad).toHaveBeenCalledTimes(1);
    expect(onScriptLoad).toHaveBeenCalledWith({ version: "latest" });
    expect(events.types()[0]).toBe("persona:script-load");
    expect(events.log[0]?.detail).toEqual({ version: "latest" });
    events.stop();
  });

  it("reports the configured version in the beacon", async () => {
    const onScriptLoad = vi.fn();
    await install({ version: "1.2.3", onScriptLoad });
    expect(onScriptLoad).toHaveBeenCalledWith({ version: "1.2.3" });
  });
});

describe("install.ts: deferred launcher path", () => {
  it("clears slow embedded feedback on failure", async () => {
    markCssLoaded(); provideFullBundle();
    const target = document.createElement("div");
    document.body.append(target);
    let reject!: (error: Error) => void;
    const ready = new Promise<void>((_, fail) => { reject = fail; });
    initAgentWidget.mockImplementation(() => ({ ...fakeHandle, ready }));
    const onError = vi.fn(), cleanup = vi.fn();
    const renderLoading = vi.fn(() => cleanup);
    await install({ target, config: { apiUrl: "/api", launcher: { enabled: false } }, onError, renderLoading });
    await flush();
    expect(target.querySelector("[data-persona-loading]")).not.toBeNull();
    reject(new Error("offline"));
    await flush();
    expect(target.querySelector("[data-persona-loading]")).toBeNull();
    expect(target.hasAttribute("aria-busy")).toBe(false);
    expect(onError).toHaveBeenCalledOnce();
    expect(renderLoading).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("retains the launcher until renderer preparation finishes", async () => {
    markCssLoaded(); provideFullBundle(); provideLauncherBundle();
    let resolve!: () => void;
    const ready = new Promise<void>(done => { resolve = done; });
    initAgentWidget.mockImplementation(() => ({ ...fakeHandle, ready }));
    const onChatReady = vi.fn();
    await install({ config: { apiUrl: "/api", launcher: { enabled: true } }, onChatReady });
    await flush(); capturedOnOpen!(); await flush();
    expect(launcherDestroy).not.toHaveBeenCalled();
    expect(fakeHandle.open).not.toHaveBeenCalled();
    expect(onChatReady).not.toHaveBeenCalled();
    expect(launcherElement.querySelector("[data-persona-loading]")).not.toBeNull();
    resolve(); await flush();
    expect(launcherElement.querySelector("[data-persona-loading]")).toBeNull();
    expect(fakeHandle.open).toHaveBeenCalledOnce();
    expect(launcherDestroy).toHaveBeenCalledOnce();
    expect(onChatReady).toHaveBeenCalledOnce();
  });

  it("destroys a failed mount and lets the retained launcher retry preparation", async () => {
    markCssLoaded(); provideFullBundle(); provideLauncherBundle();
    const destroy = vi.fn(), onError = vi.fn();
    initAgentWidget.mockImplementationOnce(() => ({
      ...fakeHandle, destroy, ready: Promise.reject(new Error("renderer offline")),
    }));
    await install({ config: { apiUrl: "/api", launcher: { enabled: true } }, onError });
    await flush(); capturedOnOpen!(); await flush();
    expect(destroy).toHaveBeenCalledOnce();
    expect(launcherDestroy).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
    capturedOnOpen!(); await flush();
    expect(initAgentWidget).toHaveBeenCalledTimes(2);
    expect(launcherDestroy).toHaveBeenCalledOnce();
  });

  it("mounts the critical launcher, fires onLauncherShown, and defers onChatReady until open", async () => {
    markCssLoaded();
    provideFullBundle(); // so loadJS resolves instantly when the user opens
    provideLauncherBundle();
    const events = recordEvents();
    const onScriptLoad = vi.fn();
    const onLauncherShown = vi.fn();
    const onChatReady = vi.fn();

    await install({
      config: { apiUrl: "/api", launcher: { enabled: true } },
      onScriptLoad,
      onLauncherShown,
      onChatReady,
    });

    // script-load fires before hydration.
    expect(onScriptLoad).toHaveBeenCalledTimes(1);

    await flush();

    // The real launcher is painted at page-load time from the critical bundle.
    expect(launcherMount).toHaveBeenCalledTimes(1);
    expect(onLauncherShown).toHaveBeenCalledTimes(1);
    expect(onLauncherShown).toHaveBeenCalledWith({ deferred: true, element: launcherElement });
    // The full widget has NOT been initialized yet: that waits for first open.
    expect(initAgentWidget).not.toHaveBeenCalled();
    expect(onChatReady).not.toHaveBeenCalled();

    // Simulate the user clicking the launcher.
    expect(capturedOnOpen).toBeTypeOf("function");
    capturedOnOpen!();
    await flush();

    // Full widget mounts, the click carries through (panel opens), and the
    // critical launcher is removed (handoff).
    expect(initAgentWidget).toHaveBeenCalledTimes(1);
    expect(fakeHandle.open).toHaveBeenCalledTimes(1);
    expect(onChatReady).toHaveBeenCalledTimes(1);
    expect(onChatReady).toHaveBeenCalledWith(fakeHandle);
    expect(launcherDestroy).toHaveBeenCalledTimes(1);

    // DOM event parity: script-load → launcher-shown (deferred) → chat-ready.
    const types = events.types();
    expect(types).toContain("persona:script-load");
    const launcherShown = events.log.find((e) => e.type === "persona:launcher-shown");
    expect(launcherShown?.detail).toMatchObject({ deferred: true });
    const chatReady = events.log.find((e) => e.type === "persona:chat-ready");
    expect(chatReady?.detail).toBe(fakeHandle);
    // launcher-shown precedes chat-ready.
    expect(types.indexOf("persona:launcher-shown")).toBeLessThan(types.indexOf("persona:chat-ready"));
    events.stop();
  });

  it.each([false, true])("preserves brand through the deferred handoff (nested override: %s)", async (override) => {
    markCssLoaded();
    provideFullBundle();
    provideLauncherBundle();
    const brand = { accent: "#4361ee", neutral: "#18181b" };
    const nested = { accent: "#b45309", density: "compact" };
    await install({ brand, config: { apiUrl: "/api", ...(override ? { brand: nested } : {}) } });
    await flush();
    expect(launcherMount.mock.calls[0][0].config.brand).toEqual(override ? nested : brand);
    capturedOnOpen!();
    await flush();
    expect(initAgentWidget.mock.calls[0][0].config.brand).toEqual(override ? nested : brand);
  });

  it("a second click while loading does not initialize the widget twice", async () => {
    markCssLoaded();
    provideFullBundle();
    provideLauncherBundle();
    await install({ config: { apiUrl: "/api", launcher: { enabled: true } } });
    await flush();

    capturedOnOpen!();
    capturedOnOpen!(); // re-entrant click before the first finishes
    await flush();

    expect(initAgentWidget).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])("passes future.v5Defaults=%s through the deferred launcher handoff", async (v5Defaults) => {
    markCssLoaded();
    provideFullBundle();
    provideLauncherBundle();

    const variant = v5Defaults ? "pill" : "circle";
    await install({
      config: { apiUrl: "/api", launcher: { variant } },
      future: { v5Defaults },
    });
    await flush();

    expect(launcherMount).toHaveBeenCalledWith(expect.objectContaining({
      config: expect.objectContaining({ future: { v5Defaults }, launcher: expect.objectContaining({ variant }) }),
    }));

    capturedOnOpen!();
    await flush();

    expect(initAgentWidget).toHaveBeenCalledWith(expect.objectContaining({
      config: expect.objectContaining({ future: { v5Defaults }, launcher: expect.objectContaining({ variant }) }),
    }));
  });
});

describe("install.ts: launcher critical path", () => {
  const deferred = { config: { apiUrl: "/api", launcher: { enabled: true } } };
  beforeEach(installedBesideAssets);

  it("paints a self-styled launcher without requesting widget.css first", async () => {
    provideLauncherBundle(true);
    const onLauncherShown = vi.fn();
    (window as any).siteAgentConfig = { ...deferred, onLauncherShown };
    await import("./install");
    // Up to the mount, and no further: the warm-up is a later timer.
    await vi.advanceTimersByTimeAsync(300);

    expect(launcherMount).toHaveBeenCalledTimes(1);
    expect(onLauncherShown).toHaveBeenCalledTimes(1);
    expect(stylesheetLink()).toBeNull();
    expect(hints("prefetch")).toEqual([]);
    expect(hints("modulepreload")).toEqual([]);
  });

  it.each([
    ["an older launcher bundle without critical styles", undefined],
    ["a page that blocks the launcher's inline styles", false],
  ])("waits for widget.css before mounting %s", async (_label, criticalStyles) => {
    provideLauncherBundle(criticalStyles);
    await install(deferred);
    await flush();

    // The stylesheet was requested, and the launcher holds until it applies.
    expect(stylesheetLink()).not.toBeNull();
    expect(launcherMount).not.toHaveBeenCalled();
    settle(stylesheetLink());
    await flush();
    expect(launcherMount).toHaveBeenCalledTimes(1);
  });

  it("starts widget.css alongside the launcher when the page blocks inline styles", async () => {
    // A blocked <style> is attached but never parsed.
    vi.spyOn(HTMLStyleElement.prototype, "sheet", "get").mockReturnValue(null);
    // Neither bundle provided: both requests are in flight together.
    await install(deferred);
    await flush();
    expect(stylesheetLink()?.href).toBe(`${SELF_HOSTED}/widget.css`);
    expect(document.head.querySelector('script[src$="launcher.global.js"]')).not.toBeNull();
    // The probe itself leaves nothing behind.
    expect(document.head.querySelector("style")).toBeNull();
  });
});

describe("install.ts: warm-up", () => {
  const deferred = { config: { apiUrl: "/api", launcher: { enabled: true } } };
  beforeEach(installedBesideAssets);
  const names = (links: HTMLLinkElement[]) =>
    links.map((link) => link.href.split("/").pop()!.replace(/\.js$/, ""));
  const bundles = () => document.head.querySelectorAll('script[src$="index.global.js"]');

  it("fills the cache with the stylesheet, the bundle and the config's chunks at idle, at low priority", async () => {
    provideLauncherBundle(true);
    await install(deferred);
    await flush();

    expect(stylesheetLink()?.getAttribute("fetchpriority")).toBe("low");
    const links = hints("prefetch");
    expect(names(links)).toEqual(["index.global", ...DEFAULT_CHUNKS]);
    expect(links.every((link) => link.getAttribute("as") === "script")).toBe(true);
    expect(links.every((link) => link.getAttribute("fetchpriority") === "low")).toBe(true);
    // Chunks are module scripts (CORS); the classic bundle is not.
    expect(links.map((link) => link.crossOrigin)).toEqual([null, ...DEFAULT_CHUNKS.map(() => "anonymous")]);
    // Speculative: a failed modulepreload would poison the widget's own import.
    expect(hints("modulepreload")).toEqual([]);
    // Warming never evaluates the widget.
    expect(bundles()).toHaveLength(0);
    expect(initAgentWidget).not.toHaveBeenCalled();
  });

  it("warms the chunks the config enables, including version defaults", async () => {
    provideLauncherBundle(true);
    provideFullBundle();
    await install({
      future: { v5Defaults: true },
      config: {
        apiUrl: "/api",
        features: { showToolCalls: false, showReasoning: false },
        voiceRecognition: { enabled: false },
        contextMentions: { enabled: true },
      },
    });
    await flush();
    expect(names(hints("prefetch"))).toEqual([
      "composer-actions-runtime", "markdown-parsers", "loading-label-runtime", "artifacts-ui", "ui-extras",
      "icons-extra", "client-dispatch", "client-stream",
    ]);
  });

  it("warms the HTTP cache with fetch where prefetch is unsupported (Safari)", async () => {
    supportHints("modulepreload");
    provideLauncherBundle(true);
    await install(deferred);
    await flush();
    expect(document.head.querySelectorAll('link:not([rel="stylesheet"])')).toHaveLength(0);
    const calls = vi.mocked(fetch).mock.calls;
    expect(calls.map(([url]) => String(url).split("/").pop())).toEqual(
      ["index.global.js", ...DEFAULT_CHUNKS.map((name) => `${name}.js`)]);
    // Each mirrors the request its script type will make, behind the host page's own.
    expect(calls.map(([, init]) => init)).toEqual([
      { mode: "no-cors", credentials: "include", priority: "low" },
      ...DEFAULT_CHUNKS.map(() => ({ priority: "low" })),
    ]);
  });

  it.each([
    ["Save-Data", { saveData: true }],
    ["a 2G connection", { effectiveType: "2g" }],
    ["a slow-2G connection", { effectiveType: "slow-2g" }],
  ])("does not warm speculatively on %s, but does on intent", async (_label, connection) => {
    Object.defineProperty(navigator, "connection", { value: connection, configurable: true });
    provideLauncherBundle(true);
    await install(deferred);
    await flush();
    expect(document.head.querySelectorAll("link")).toHaveLength(0);

    launcherElement.dispatchEvent(new Event("pointerenter"));
    // Asked for by the visitor now, so what the reveal needs is not deprioritized.
    expect(stylesheetLink()?.hasAttribute("fetchpriority")).toBe(false);
    expect(names(hints("prefetch"))).toEqual(DEFAULT_CHUNKS);
    expect(hints("prefetch").map((link) => link.getAttribute("fetchpriority")))
      .toEqual([...REVEAL_CHUNKS.map(() => null), ...TURN_CHUNKS.map(() => "low")]);
    // The bundle is evaluated, not merely prefetched; still speculative, so
    // at the default priority.
    expect(bundles()).toHaveLength(1);
    expect(bundles()[0].hasAttribute("fetchpriority")).toBe(false);
  });

  it.each(["pointerenter", "focus", "touchstart"])("evaluates the bundle once on %s, and the click reuses it", async (type) => {
    provideLauncherBundle(true);
    await install(deferred);
    await flush();

    launcherElement.dispatchEvent(new Event(type));
    launcherElement.dispatchEvent(new Event(type));
    expect(bundles()).toHaveLength(1);
    expect(initAgentWidget).not.toHaveBeenCalled(); // intent never mounts
    expect(hints("modulepreload")).toEqual([]); // still speculative

    settle(stylesheetLink());
    capturedOnOpen!();
    await flush();
    expect(bundles()).toHaveLength(1); // no second evaluation
    expect(initAgentWidget).not.toHaveBeenCalled(); // still downloading

    provideFullBundle();
    settle(bundles()[0]);
    await flush();
    expect(initAgentWidget).toHaveBeenCalledTimes(1);
    expect(fakeHandle.open).toHaveBeenCalledTimes(1);
  });

  it("retries a bundle that failed on intent when the launcher is clicked", async () => {
    provideLauncherBundle(true);
    const onError = vi.fn();
    await install({ ...deferred, onError });
    await flush();

    launcherElement.dispatchEvent(new Event("pointerenter"));
    settle(bundles()[0], "error");
    await flush();
    expect(onError).not.toHaveBeenCalled(); // nothing was asked for yet
    expect(bundles()).toHaveLength(0);

    settle(stylesheetLink());
    capturedOnOpen!();
    expect(bundles()).toHaveLength(1); // a fresh request
    provideFullBundle();
    settle(bundles()[0]);
    await flush();
    expect(initAgentWidget).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("an open module-preloads what the reveal waits for, alongside the bundle", async () => {
    provideLauncherBundle(true);
    await install(deferred);
    await flush();
    expect(hints("modulepreload")).toEqual([]);

    capturedOnOpen!();
    const chunks = hints("modulepreload");
    // The first turn's chunks stay speculative: they must not compete with the reveal.
    expect(names(chunks)).toEqual(REVEAL_CHUNKS);
    expect(chunks.some((link) => link.hasAttribute("fetchpriority"))).toBe(false);
    // Exactly once, however often the launcher is clicked.
    capturedOnOpen!();
    expect(hints("modulepreload")).toHaveLength(REVEAL_CHUNKS.length);
  });

  it("an open without modulepreload support still fetches the chunks early", async () => {
    supportHints("prefetch");
    provideLauncherBundle(true);
    (window as any).siteAgentConfig = deferred;
    await import("./install");
    await vi.advanceTimersByTimeAsync(300); // mounted, not yet warmed
    capturedOnOpen!();
    expect(hints("modulepreload")).toEqual([]);
    expect(names(hints("prefetch"))).toEqual(REVEAL_CHUNKS);
  });

  it("never reveals the panel ahead of its stylesheet", async () => {
    provideLauncherBundle(true);
    provideFullBundle();
    await install(deferred);
    await flush(); // warm-up: the stylesheet is requested, not yet applied

    capturedOnOpen!();
    await flush();
    expect(initAgentWidget).not.toHaveBeenCalled();

    settle(stylesheetLink());
    await flush();
    expect(initAgentWidget).toHaveBeenCalledTimes(1);
    expect(launcherDestroy).toHaveBeenCalledTimes(1);
  });

  it("a click that beats the warm-up requests everything at full priority", async () => {
    provideLauncherBundle(true);
    (window as any).siteAgentConfig = deferred;
    await import("./install");
    await vi.advanceTimersByTimeAsync(300); // mounted, not yet warmed

    capturedOnOpen!();
    expect(stylesheetLink()?.hasAttribute("fetchpriority")).toBe(false);
    expect(bundles()).toHaveLength(1);
    // The visitor is waiting on it: not left at an async script's low priority.
    expect(bundles()[0].getAttribute("fetchpriority")).toBe("high");
    // The bundle is being loaded for real, so it is not also prefetched, and
    // nothing the reveal is not waiting for joins the queue.
    expect(hints("prefetch")).toEqual([]);
    expect(names(hints("modulepreload"))).toEqual(REVEAL_CHUNKS);

    // Once the widget is up, the first send's chunks are warmed behind it.
    settle(stylesheetLink());
    provideFullBundle();
    settle(bundles()[0]);
    await flush();
    expect(initAgentWidget).toHaveBeenCalledTimes(1);
    expect(names(hints("prefetch"))).toEqual(TURN_CHUNKS);
    expect(hints("prefetch").every((link) => link.getAttribute("fetchpriority") === "low")).toBe(true);
  });

  it("reports a stylesheet failure on open as 'css' and retries it on the next click", async () => {
    provideLauncherBundle(true);
    provideFullBundle();
    const onError = vi.fn();
    await install({ ...deferred, onError });
    await flush();

    capturedOnOpen!();
    settle(stylesheetLink(), "error");
    await flush();
    expect(onError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ phase: "css" }));
    expect(initAgentWidget).not.toHaveBeenCalled();
    expect(launcherDestroy).not.toHaveBeenCalled();
    // The failed link is gone, so a retry cannot mistake it for a loaded sheet.
    expect(stylesheetLink()).toBeNull();

    capturedOnOpen!();
    settle(stylesheetLink());
    await flush();
    expect(initAgentWidget).toHaveBeenCalledTimes(1);
    expect(launcherDestroy).toHaveBeenCalledTimes(1);
  });
});

describe("install.ts: eager path", () => {
  it("non-floating (launcher disabled) eager-loads, fires onChatReady, and does NOT fire onLauncherShown", async () => {
    markCssLoaded();
    provideFullBundle();
    provideLauncherBundle(); // available, but must NOT be used for an inline embed
    const onLauncherShown = vi.fn();
    const onChatReady = vi.fn();

    await install({
      config: { apiUrl: "/api", launcher: { enabled: false } },
      onLauncherShown,
      onChatReady,
    });
    await flush();

    expect(launcherMount).not.toHaveBeenCalled();
    expect(initAgentWidget).toHaveBeenCalledTimes(1);
    expect(onChatReady).toHaveBeenCalledWith(fakeHandle);
    // No floating launcher → onLauncherShown must stay silent (name-honest).
    expect(onLauncherShown).not.toHaveBeenCalled();
  });

  it("eager floating install fires onLauncherShown with deferred:false", async () => {
    markCssLoaded();
    provideFullBundle();
    provideLauncherBundle();
    const onLauncherShown = vi.fn();

    // autoExpand starts the panel open → deferral is disabled → eager floating.
    await install({
      config: { apiUrl: "/api", launcher: { enabled: true, autoExpand: true } },
      onLauncherShown,
    });
    await flush();

    expect(launcherMount).not.toHaveBeenCalled(); // deferral off
    expect(initAgentWidget).toHaveBeenCalledTimes(1);
    expect(onLauncherShown).toHaveBeenCalledTimes(1);
    expect(onLauncherShown).toHaveBeenCalledWith({ deferred: false });
  });
});

describe("install.ts: eager path loading", () => {
  it("requests the stylesheet, the bundle and the config's chunks together", async () => {
    await install({ config: { apiUrl: "/api", launcher: { enabled: false } } });
    await flush();

    // Nothing has loaded yet (jsdom never settles them), yet all are in flight.
    expect(stylesheetLink()).not.toBeNull();
    expect(stylesheetLink()?.hasAttribute("fetchpriority")).toBe(false);
    const bundle = document.head.querySelectorAll('script[src$="index.global.js"]');
    expect(bundle).toHaveLength(1);
    expect(bundle[0].getAttribute("fetchpriority")).toBe("high");
    const chunks = hints("modulepreload");
    expect(chunks.map((link) => link.href.split("/").pop())).toEqual(REVEAL_CHUNKS.map((name) => `${name}.js`));
    expect(chunks.some((link) => link.hasAttribute("fetchpriority"))).toBe(false);
    // Nothing the reveal is not waiting for joins the queue yet.
    expect(hints("prefetch")).toEqual([]);
    expect(initAgentWidget).not.toHaveBeenCalled();
  });

  it("initializes only after both the stylesheet and the bundle have loaded", async () => {
    const onError = vi.fn();
    await install({ config: { apiUrl: "/api", launcher: { enabled: false } }, onError });
    await flush();

    provideFullBundle();
    settle(document.head.querySelector('script[src$="index.global.js"]'));
    await flush();
    expect(initAgentWidget).not.toHaveBeenCalled(); // stylesheet still pending

    settle(stylesheetLink());
    await flush();
    expect(initAgentWidget).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    // With the widget up, the first send's chunks are warmed behind it.
    const turn = hints("prefetch");
    expect(turn.map((link) => link.href.split("/").pop())).toEqual(TURN_CHUNKS.map((name) => `${name}.js`));
    expect(turn.every((link) => link.getAttribute("fetchpriority") === "low")).toBe(true);
  });

  it("reports a stylesheet failure as 'css' even though the bundle loaded", async () => {
    const onError = vi.fn();
    await install({ config: { apiUrl: "/api", launcher: { enabled: false } }, onError });
    await flush();
    provideFullBundle();
    settle(document.head.querySelector('script[src$="index.global.js"]'));
    settle(stylesheetLink(), "error");
    await flush();
    expect(onError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ phase: "css" }));
    expect(initAgentWidget).not.toHaveBeenCalled();
  });

  it("preloads no chunks when there is nothing to initialize", async () => {
    await install({ config: {} });
    await flush();
    expect(hints("modulepreload")).toEqual([]);
    expect(hints("prefetch")).toEqual([]);
  });
});

describe("install.ts: deferral gate", () => {
  async function expectDecision(config: any, { defers }: { defers: boolean }) {
    markCssLoaded();
    provideFullBundle();
    provideLauncherBundle();
    await install({ config });
    await flush();
    if (defers) {
      expect(launcherMount).toHaveBeenCalledTimes(1);
      expect(initAgentWidget).not.toHaveBeenCalled();
    } else {
      expect(launcherMount).not.toHaveBeenCalled();
      expect(initAgentWidget).toHaveBeenCalledTimes(1);
    }
  }

  it("defers for a plain floating launcher", async () => {
    await expectDecision({ apiUrl: "/api", launcher: { enabled: true } }, { defers: true });
  });

  it("defers when launcher.mountMode is omitted (defaults to floating)", async () => {
    await expectDecision({ apiUrl: "/api", launcher: { title: "Help" } }, { defers: true });
  });

  it("does NOT defer for a docked launcher", async () => {
    await expectDecision({ apiUrl: "/api", launcher: { enabled: true, mountMode: "docked" } }, { defers: false });
  });

  it("does NOT defer when an onStateLoaded hook is present (it may request open)", async () => {
    await expectDecision(
      { apiUrl: "/api", launcher: { enabled: true }, onStateLoaded: () => ({ open: true }) },
      { defers: false }
    );
  });

  it("does NOT defer when a persisted open state is restored from storage", async () => {
    window.sessionStorage.setItem("persona-widget-open", "true");
    await expectDecision({ apiUrl: "/api", launcher: { enabled: true }, persistState: true }, { defers: false });
  });

  it("STILL defers when persistState is on but no open state is stored", async () => {
    // Distinguishes the real storage read from a blanket "persistState disables deferral".
    await expectDecision({ apiUrl: "/api", launcher: { enabled: true }, persistState: true }, { defers: true });
  });

  it("honors a custom keyPrefix + local storage when checking persisted open state", async () => {
    window.localStorage.setItem("shop-widget-open", "true");
    await expectDecision(
      {
        apiUrl: "/api",
        launcher: { enabled: true },
        persistState: { keyPrefix: "shop-", storage: "local" },
      },
      { defers: false }
    );
  });

  it("does NOT defer when a custom jsUrl override has no derivable launcher URL", async () => {
    markCssLoaded();
    provideFullBundle();
    provideLauncherBundle();
    // Non-standard jsUrl → getCdnBase() yields launcherUrl: null → eager.
    await install({
      cssUrl: "https://cdn.example.com/persona.css",
      jsUrl: "https://cdn.example.com/persona.bundle.js",
      config: { apiUrl: "/api", launcher: { enabled: true } },
    });
    await flush();
    expect(launcherMount).not.toHaveBeenCalled();
    expect(initAgentWidget).toHaveBeenCalledTimes(1);
  });
});

describe("install.ts: CDN base derivation", () => {

  /**
   * Run the deferred path with NO bundles provided so loadCSS/loadLauncher
   * inject real (never-resolving in jsdom) elements whose URLs we can read.
   */
  async function installedUrls(installerOptions: any) {
    await install({ config: { apiUrl: "/api", launcher: { enabled: true } }, ...installerOptions });
    await flush();
    const css = document.head.querySelector("link[rel=\"stylesheet\"][data-persona]") as HTMLLinkElement | null;
    const scripts = Array.from(document.head.querySelectorAll("script")).map((s) => s.src);
    return { cssHref: css?.href ?? null, scripts };
  }

  /**
   * Assets beside the installer are its own release, so the launcher is trusted
   * to carry its critical rules and the stylesheet waits for the warm-up. Run
   * through to that warm-up and read every URL it requested.
   */
  async function warmedUrls() {
    provideLauncherBundle(true);
    await install({ config: { apiUrl: "/api", launcher: { enabled: true } } });
    await flush();
    const [bundle, ...chunks] = hints("prefetch").map((link) => link.href);
    return { cssHref: stylesheetLink()?.href ?? null, bundle: [bundle], chunks };
  }

  it("pins first-party latest installer assets to the embedded release", async () => {
    setCurrentScript("https://cdn.runtype.com/persona/latest/install.global.js");
    const { cssHref, scripts } = await installedUrls({});
    // Same release as the installer: only the launcher is on the critical path.
    expect(cssHref).toBeNull();
    expect(scripts).toEqual([`https://cdn.runtype.com/persona/${version}/launcher.global.js`]);
  });

  it("pins the warm-up's stylesheet, bundle and chunks to the embedded release", async () => {
    setCurrentScript("https://cdn.runtype.com/persona/latest/install.global.js");
    const base = `https://cdn.runtype.com/persona/${version}`;
    const { cssHref, bundle, chunks } = await warmedUrls();
    expect(cssHref).toBe(`${base}/widget.css`);
    expect(bundle).toEqual([`${base}/index.global.js`]);
    expect(chunks).toEqual(DEFAULT_CHUNKS.map((name) => `${base}/${name}.js`));
  });

  it("keeps npm-CDN siblings on the installer's own pinned range (no @latest skew)", async () => {
    setCurrentScript("https://cdn.jsdelivr.net/npm/@runtypelabs/persona@4/dist/install.global.js");
    const base = "https://cdn.jsdelivr.net/npm/@runtypelabs/persona@4/dist";
    const { cssHref, bundle, chunks } = await warmedUrls();
    expect(cssHref).toBe(`${base}/widget.css`);
    expect(bundle).toEqual([`${base}/index.global.js`]);
    expect(chunks).toEqual(DEFAULT_CHUNKS.map((name) => `${base}/${name}.js`));
  });

  it("keeps a jsUrl override's query string on every preloaded chunk", async () => {
    setCurrentScript("https://cdn.runtype.com/persona/latest/install.global.js");
    provideLauncherBundle(true);
    await install({
      config: { apiUrl: "/api" },
      cssUrl: "https://assets.example.com/p/widget.css?v=9",
      jsUrl: "https://assets.example.com/p/index.global.js?v=9",
    });
    await flush();
    expect(hints("prefetch").map((link) => link.href)).toEqual([
      "https://assets.example.com/p/index.global.js?v=9",
      ...DEFAULT_CHUNKS.map((name) => `https://assets.example.com/p/${name}.js?v=9`),
    ]);
  });

  it("pins the full bundle on the eager first-party latest path", async () => {
    setCurrentScript("https://cdn.runtype.com/persona/latest/install.global.js");
    markCssLoaded();
    await install({ config: { apiUrl: "/api", launcher: { enabled: false } } });
    await flush();
    const scripts = Array.from(document.head.querySelectorAll("script")).map((s) => s.src);
    expect(scripts).toContain(`https://cdn.runtype.com/persona/${version}/index.global.js`);
  });

  it("falls back to jsDelivr@latest when currentScript is unavailable", async () => {
    // No setCurrentScript: module/inline contexts have no script src.
    const { cssHref } = await installedUrls({});
    expect(cssHref).toBe("https://cdn.jsdelivr.net/npm/@runtypelabs/persona@latest/dist/widget.css");
  });

  it("falls back to the npm CDN for a non-http(s) installer source", async () => {
    setCurrentScript("data:text/javascript,void%200");
    const { cssHref } = await installedUrls({});
    expect(cssHref).toBe("https://cdn.jsdelivr.net/npm/@runtypelabs/persona@latest/dist/widget.css");
  });

  it("an explicit `version` on the first-party CDN stays first-party (versioned path)", async () => {
    setCurrentScript("https://cdn.runtype.com/persona/latest/install.global.js");
    const { cssHref, scripts } = await installedUrls({ version: "1.2.3" });
    expect(cssHref).toBe("https://cdn.runtype.com/persona/1.2.3/widget.css");
    expect(scripts).toContain("https://cdn.runtype.com/persona/1.2.3/launcher.global.js");
  });

  it("an explicit `version` on a non-first-party src opts into npm-CDN URLs", async () => {
    setCurrentScript("https://assets.example.com/vendor/persona/install.global.js");
    const { cssHref } = await installedUrls({ version: "1.2.3" });
    expect(cssHref).toBe("https://cdn.jsdelivr.net/npm/@runtypelabs/persona@1.2.3/dist/widget.css");
  });

  it("warns when resolved assets leave the installer's origin (silent-CSP guard)", async () => {
    setCurrentScript("https://cdn.runtype.com/persona/latest/install.global.js");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await installedUrls({ cdn: "jsdelivr" });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("strict CSP may silently block"));
    warn.mockRestore();
  });

  it("does not warn when assets resolve to the installer's own origin", async () => {
    setCurrentScript("https://cdn.runtype.com/persona/latest/install.global.js");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await installedUrls({ version: "1.2.3" });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("does not warn for explicit cssUrl + jsUrl overrides on another origin", async () => {
    setCurrentScript("https://cdn.runtype.com/persona/latest/install.global.js");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await installedUrls({
      cssUrl: "https://assets.example.com/persona/widget.css",
      jsUrl: "https://assets.example.com/persona/index.global.js",
    });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("an explicit `cdn` opts back into npm-CDN URLs even when the src is derivable", async () => {
    setCurrentScript("https://cdn.runtype.com/persona/latest/install.global.js");
    const { cssHref } = await installedUrls({ cdn: "unpkg" });
    expect(cssHref).toBe("https://unpkg.com/@runtypelabs/persona@latest/dist/widget.css");
  });

  it("explicit cssUrl + jsUrl win over the derived installer base", async () => {
    setCurrentScript("https://cdn.runtype.com/persona/latest/install.global.js");
    const { cssHref } = await installedUrls({
      cssUrl: "https://assets.example.com/persona/widget.css",
      jsUrl: "https://assets.example.com/persona/index.global.js",
    });
    expect(cssHref).toBe("https://assets.example.com/persona/widget.css");
  });
});

describe("install.ts: onError", () => {
  it.each(["throw", "ready rejection"])("reports deferred %s as an init error and retains a retryable launcher", async (failure) => {
    markCssLoaded();
    provideFullBundle();
    provideLauncherBundle();
    const boom = new Error("renderer offline");
    const destroy = vi.fn();
    let rejectReady!: (error: Error) => void;
    const ready = new Promise<void>((_, reject) => { rejectReady = reject; });
    initAgentWidget.mockImplementationOnce(() => {
      if (failure === "throw") throw boom;
      return { ...fakeHandle, destroy, ready };
    });
    const events = recordEvents();
    const onError = vi.fn();
    const onChatReady = vi.fn();
    const cleanup = vi.fn();
    await install({
      config: { apiUrl: "/api", launcher: { enabled: true } },
      onError, onChatReady, renderLoading: () => cleanup,
    });
    await flush();
    capturedOnOpen!();
    await flush();
    if (failure === "ready rejection") {
      expect(launcherElement.querySelector("[data-persona-loading]")).not.toBeNull();
      rejectReady(boom);
      await flush();
      expect(destroy).toHaveBeenCalledOnce();
      expect(cleanup).toHaveBeenCalledOnce();
    }

    expect(onError).toHaveBeenCalledExactlyOnceWith({ phase: "init", error: boom });
    expect(events.log.filter(event => event.type === "persona:error").map(event => event.detail))
      .toEqual([{ phase: "init", error: boom }]);
    expect(onChatReady).not.toHaveBeenCalled();
    expect(fakeHandle.open).not.toHaveBeenCalled();
    expect(launcherDestroy).not.toHaveBeenCalled();
    expect(launcherElement.querySelector("[data-persona-loading]")).toBeNull();
    expect(launcherElement.hasAttribute("aria-busy")).toBe(false);

    capturedOnOpen!();
    await flush();
    expect(initAgentWidget).toHaveBeenCalledTimes(2);
    expect(fakeHandle.open).toHaveBeenCalledOnce();
    expect(launcherDestroy).toHaveBeenCalledOnce();
    expect(onChatReady).toHaveBeenCalledExactlyOnceWith(fakeHandle);
    events.stop();
  });

  it("fires onError with phase 'init' and dispatches persona:error when initialization throws", async () => {
    markCssLoaded();
    provideFullBundle();
    const boom = new Error("init boom");
    initAgentWidget.mockImplementation(() => {
      throw boom;
    });
    const events = recordEvents();
    const onError = vi.fn();

    await install({ config: { apiUrl: "/api", launcher: { enabled: false } }, onError });
    await flush();

    expect(onError).toHaveBeenCalledWith({ phase: "init", error: boom });
    const errorEvent = events.log.find((e) => e.type === "persona:error");
    expect(errorEvent?.detail).toMatchObject({ phase: "init" });
    events.stop();
  });

  it("fires onError with phase 'bundle' when the full bundle fails to load on open", async () => {
    markCssLoaded();
    provideLauncherBundle();
    // AgentWidget intentionally NOT provided → loadJS() creates a real <script>...
    failNextScriptLoad(); // ...which we force to error.
    const events = recordEvents();
    const onError = vi.fn();

    await install({ config: { apiUrl: "/api", launcher: { enabled: true } }, onError });
    await flush();

    expect(launcherMount).toHaveBeenCalledTimes(1);
    expect(capturedOnOpen).toBeTypeOf("function");
    capturedOnOpen!(); // user clicks → loadJS → <script> error
    await flush();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toMatchObject({ phase: "bundle" });
    const errorEvent = events.log.find((e) => e.type === "persona:error");
    expect(errorEvent?.detail).toMatchObject({ phase: "bundle" });
    events.stop();
  });
});

describe("install.ts: lifecycle callback safety", () => {
  it("a throwing onScriptLoad callback does not break the rest of installation", async () => {
    markCssLoaded();
    provideFullBundle();
    const onChatReady = vi.fn();

    await install({
      config: { apiUrl: "/api", launcher: { enabled: false } },
      onScriptLoad: () => {
        throw new Error("user callback blew up");
      },
      onChatReady,
    });
    await flush();

    // The throw was swallowed (logged) and init still completed.
    expect(onChatReady).toHaveBeenCalledWith(fakeHandle);
    expect(errorSpy).toHaveBeenCalled();
  });
});
