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

/** Provide the critical launcher global so `loadLauncher()` short-circuits. */
function provideLauncherBundle() {
  (window as any).AgentWidgetLauncher = { mount: launcherMount };
}

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
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
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

describe("install.ts: onError", () => {
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
