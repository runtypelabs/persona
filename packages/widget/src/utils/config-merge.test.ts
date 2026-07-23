import { describe, expect, it, vi } from "vitest";

import { mergeConfigUpdate } from "./config-merge";
import { mergeWithDefaults } from "../defaults";
import type { AgentWidgetConfig, StreamAnimationPlugin } from "../types";

// Stored controller config is post-mergeWithDefaults; simulate that here.
const base = (overrides: Partial<AgentWidgetConfig> = {}): AgentWidgetConfig =>
  mergeWithDefaults({ apiUrl: "https://api.example.com/chat", ...overrides }) as AgentWidgetConfig;

describe("mergeConfigUpdate", () => {
  it("recursively merges nested plain objects, preserving sibling overrides", () => {
    const prev = base({ launcher: { enabled: false, clearChat: { backgroundColor: "#123456" } } });
    const next = mergeConfigUpdate(prev, { launcher: { title: "After" } });
    expect(next.launcher?.clearChat?.backgroundColor).toBe("#123456");
    expect(next.launcher?.title).toBe("After");
    // Launcher defaults survive a partial patch.
    expect(next.launcher?.mountMode).toBe("floating");
  });

  it("patches composerBar without replacing sibling launcher fields", () => {
    const prev = base({ launcher: { title: "Keep", composerBar: { collapsedMaxWidth: "700px" } } });
    const next = mergeConfigUpdate(prev, { launcher: { composerBar: { bottomOffset: "8px" } } });
    expect(next.launcher?.title).toBe("Keep");
    expect(next.launcher?.composerBar?.collapsedMaxWidth).toBe("700px");
    expect(next.launcher?.composerBar?.bottomOffset).toBe("8px");
  });

  it("replaces arrays wholesale (suggestionChips)", () => {
    const prev = base({ suggestionChips: ["a", "b", "c"] });
    const next = mergeConfigUpdate(prev, { suggestionChips: ["x"] });
    expect(next.suggestionChips).toEqual(["x"]);
  });

  it("replaces callbacks wholesale", () => {
    const first = vi.fn();
    const second = vi.fn();
    const prev = base({ onSessionInit: first });
    const next = mergeConfigUpdate(prev, { onSessionInit: second });
    expect(next.onSessionInit).toBe(second);
  });

  it("guards boolean|object unions in both directions", () => {
    const objFirst = base({ approval: { backgroundColor: "#ffffff" } });
    const toScalar = mergeConfigUpdate(objFirst, { approval: false });
    expect(toScalar.approval).toBe(false);

    const scalarFirst = base({ persistState: true });
    const toObject = mergeConfigUpdate(scalarFirst, { persistState: { storage: "local" } });
    expect(toObject.persistState).toEqual({ storage: "local" });
  });

  it("replaces the headers map wholesale (stale keys do not survive)", () => {
    const prev = base({ headers: { "X-A": "1", "X-B": "2" } });
    const next = mergeConfigUpdate(prev, { headers: { "X-B": "3" } });
    expect(next.headers).toEqual({ "X-B": "3" });
    expect(next.headers?.["X-A"]).toBeUndefined();
  });

  it("replaces features.streamAnimation.plugins wholesale", () => {
    const p1 = { name: "p1" } as StreamAnimationPlugin;
    const p2 = { name: "p2" } as StreamAnimationPlugin;
    const prev = base({ features: { streamAnimation: { plugins: { p1 } } } });
    const next = mergeConfigUpdate(prev, { features: { streamAnimation: { plugins: { p2 } } } });
    expect(next.features?.streamAnimation?.plugins).toEqual({ p2 });
    expect(next.features?.streamAnimation?.plugins?.p1).toBeUndefined();
  });

  it("replaces storageAdapter wholesale (no hybrid: new adapter's absent save is not inherited)", () => {
    const oldSave = vi.fn();
    const oldLoad = vi.fn();
    const newLoad = vi.fn();
    const prev = base({ storageAdapter: { save: oldSave, load: oldLoad } });
    const next = mergeConfigUpdate(prev, { storageAdapter: { load: newLoad } });
    expect(next.storageAdapter?.load).toBe(newLoad);
    expect(next.storageAdapter?.save).toBeUndefined();
  });

  it("resets a cleared key to its default value (launcher.title)", () => {
    const prev = base({ launcher: { title: "Custom" } });
    expect(prev.launcher?.title).toBe("Custom");
    const next = mergeConfigUpdate(prev, { launcher: { title: undefined } });
    expect(next.launcher?.title).toBe("Chat Assistant");
    // Other launcher fields are untouched by the clear.
    expect(next.launcher?.mountMode).toBe("floating");
  });

  it("leaves a cleared key unset when no default exists (launcher.closeButtonColor)", () => {
    const prev = base({ launcher: { closeButtonColor: "#ff0000" } });
    expect(prev.launcher?.closeButtonColor).toBe("#ff0000");
    const next = mergeConfigUpdate(prev, { launcher: { closeButtonColor: undefined } });
    // closeButtonColor is intentionally omitted from the launcher defaults.
    expect(next.launcher?.closeButtonColor).toBeUndefined();
  });

  it("resets a cleared key with a truthy default (messageActions.showCopy resets to true)", () => {
    const prev = base({ messageActions: { showCopy: false } });
    expect(prev.messageActions?.showCopy).toBe(false);
    const next = mergeConfigUpdate(prev, { messageActions: { showCopy: undefined } });
    // The key must be absent (not own-undefined) so the default spread repopulates it.
    expect(next.messageActions?.showCopy).toBe(true);
  });

  it("resets a cleared nested key with a truthy default (layout.header.showTitle resets to true)", () => {
    const prev = base({ layout: { header: { showTitle: false } } });
    expect(prev.layout?.header?.showTitle).toBe(false);
    const next = mergeConfigUpdate(prev, { layout: { header: { showTitle: undefined } } });
    expect(next.layout?.header?.showTitle).toBe(true);
  });

  it("preserves keys absent from the patch", () => {
    const prev = base({ launcher: { title: "Keep", subtitle: "Sub" } });
    const next = mergeConfigUpdate(prev, { launcher: { title: "New" } });
    expect(next.launcher?.title).toBe("New");
    expect(next.launcher?.subtitle).toBe("Sub");
  });

  it("deep-merges theme partials through update, preserving earlier theme overrides", () => {
    const prev = base({ theme: { semantic: { colors: { primary: "#111111" } } } });
    const next = mergeConfigUpdate(prev, { theme: { semantic: { colors: { secondary: "#222222" } } } });
    expect(next.theme?.semantic?.colors?.primary).toBe("#111111");
    expect(next.theme?.semantic?.colors?.secondary).toBe("#222222");
  });

  it("is idempotent: merging a config over its equal self is a no-op", () => {
    const prev = base({ launcher: { clearChat: { backgroundColor: "#123456" } } });
    const merged = mergeConfigUpdate(prev, { launcher: { title: "T" } });
    const again = mergeConfigUpdate(merged, merged);
    expect(again).toEqual(merged);
  });
});
