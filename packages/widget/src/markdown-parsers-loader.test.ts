import { afterEach, describe, expect, it, vi } from "vitest";
import type { MarkdownParsersModule } from "./markdown-parsers-loader";

/**
 * Tests for the parser-ready subscription registry.
 *
 * The loader holds module-level singleton state (`moduleCache`, subscribers), and
 * `vitest.setup.ts` eager-provides parsers into the shared graph — which would make
 * `onMarkdownParsersReady` no-op everywhere. So each test imports a FRESH copy of
 * the loader via `vi.resetModules()` + dynamic import, starting from the unloaded
 * (IIFE/CDN) state, and drives the transition itself.
 */

// A stand-in parsers module; the registry never touches its fields.
const FAKE_PARSERS = {} as unknown as MarkdownParsersModule;

const freshLoader = async () => {
  vi.resetModules();
  return import("./markdown-parsers-loader");
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("onMarkdownParsersReady", () => {
  it("fires a pending subscriber once when the lazy chunk resolves", async () => {
    const loader = await freshLoader();
    loader.setMarkdownParsersLoader(() => Promise.resolve(FAKE_PARSERS));

    const cb = vi.fn();
    loader.onMarkdownParsersReady(cb);
    expect(cb).not.toHaveBeenCalled(); // not yet: chunk not loaded

    await loader.loadMarkdownParsers();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("kicks the load itself so a lone surface still heals", async () => {
    const loader = await freshLoader();
    const load = vi.fn(() => Promise.resolve(FAKE_PARSERS));
    loader.setMarkdownParsersLoader(load);

    const cb = vi.fn();
    // No explicit loadMarkdownParsers() call — subscribing must trigger it.
    loader.onMarkdownParsersReady(cb);
    await vi.waitFor(() => expect(cb).toHaveBeenCalledTimes(1));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not fire (and returns a no-op) when parsers are already loaded", async () => {
    const loader = await freshLoader();
    loader.provideMarkdownParsers(FAKE_PARSERS); // eager/ESM steady state

    const cb = vi.fn();
    const unsub = loader.onMarkdownParsersReady(cb);
    await Promise.resolve();
    expect(cb).not.toHaveBeenCalled();
    expect(() => unsub()).not.toThrow();
  });

  it("unsubscribe prevents the callback from firing", async () => {
    const loader = await freshLoader();
    loader.setMarkdownParsersLoader(() => Promise.resolve(FAKE_PARSERS));

    const cb = vi.fn();
    const unsub = loader.onMarkdownParsersReady(cb);
    unsub();

    await loader.loadMarkdownParsers();
    expect(cb).not.toHaveBeenCalled();
  });

  it("fires each subscriber exactly once (no re-fire on a later load call)", async () => {
    const loader = await freshLoader();
    loader.setMarkdownParsersLoader(() => Promise.resolve(FAKE_PARSERS));

    const cb = vi.fn();
    loader.onMarkdownParsersReady(cb);

    await loader.loadMarkdownParsers();
    await loader.loadMarkdownParsers(); // cached; must not re-notify
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("provideMarkdownParsers (eager) flushes pending subscribers", async () => {
    const loader = await freshLoader();
    // Subscribe while still unloaded, then have the eager path provide.
    loader.setMarkdownParsersLoader(() => new Promise(() => {})); // never resolves
    const cb = vi.fn();
    loader.onMarkdownParsersReady(cb);

    loader.provideMarkdownParsers(FAKE_PARSERS);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("one throwing subscriber does not starve the others", async () => {
    const loader = await freshLoader();
    loader.setMarkdownParsersLoader(() => Promise.resolve(FAKE_PARSERS));

    const boom = vi.fn(() => {
      throw new Error("subscriber blew up");
    });
    const ok = vi.fn();
    loader.onMarkdownParsersReady(boom);
    loader.onMarkdownParsersReady(ok);

    await loader.loadMarkdownParsers();
    expect(boom).toHaveBeenCalledTimes(1);
    expect(ok).toHaveBeenCalledTimes(1);
  });
});
