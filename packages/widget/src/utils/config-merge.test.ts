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

  it("patches suggestion surfaces without dropping sibling behavior", () => {
    const prev = base({
      suggestions: {
        starters: { variant: "card", behavior: "fill" },
        followUps: { variant: "chip", placement: "after-message" },
      },
    });
    const next = mergeConfigUpdate(prev, {
      suggestions: {
        followUps: { overflow: "wrap" },
      },
    });

    expect(next.suggestions?.starters).toEqual({
      variant: "card",
      behavior: "fill",
    });
    expect(next.suggestions?.followUps).toEqual({
      variant: "chip",
      placement: "after-message",
      overflow: "wrap",
    });
  });

  it("replaces callbacks wholesale", () => {
    const first = vi.fn();
    const second = vi.fn();
    const prev = base({ onSessionInit: first });
    const next = mergeConfigUpdate(prev, { onSessionInit: second });
    expect(next.onSessionInit).toBe(second);
  });

  it("replaces history identity/persistence callbacks wholesale", () => {
    const firstProof = vi.fn();
    const secondProof = vi.fn();
    const firstGet = vi.fn();
    const secondGet = vi.fn();
    const firstSet = vi.fn();
    const secondSet = vi.fn();
    const firstClear = vi.fn();
    const secondClear = vi.fn();
    const firstClearSession = vi.fn();
    const secondClearSession = vi.fn();

    const prev = base({
      getIdentityProof: firstProof,
      getStoredConversationId: firstGet,
      setStoredConversationId: firstSet,
      clearStoredConversationId: firstClear,
      clearStoredSessionId: firstClearSession,
    });
    const next = mergeConfigUpdate(prev, {
      getIdentityProof: secondProof,
      getStoredConversationId: secondGet,
      setStoredConversationId: secondSet,
      clearStoredConversationId: secondClear,
      clearStoredSessionId: secondClearSession,
    });

    expect(next.getIdentityProof).toBe(secondProof);
    expect(next.getStoredConversationId).toBe(secondGet);
    expect(next.setStoredConversationId).toBe(secondSet);
    expect(next.clearStoredConversationId).toBe(secondClear);
    expect(next.clearStoredSessionId).toBe(secondClearSession);
  });

  it("preserves history identity/persistence callbacks absent from the patch", () => {
    const getProof = vi.fn();
    const getId = vi.fn();
    const setId = vi.fn();
    const clearId = vi.fn();
    const clearSession = vi.fn();

    const prev = base({
      getIdentityProof: getProof,
      getStoredConversationId: getId,
      setStoredConversationId: setId,
      clearStoredConversationId: clearId,
      clearStoredSessionId: clearSession,
    });
    const next = mergeConfigUpdate(prev, { launcher: { title: "New" } });

    expect(next.getIdentityProof).toBe(getProof);
    expect(next.getStoredConversationId).toBe(getId);
    expect(next.setStoredConversationId).toBe(setId);
    expect(next.clearStoredConversationId).toBe(clearId);
    expect(next.clearStoredSessionId).toBe(clearSession);
  });

  it("keeps features.history defaults when the host sets only enabled", () => {
    const prev = base();
    expect(prev.features?.history).toMatchObject({
      enabled: false,
      presentation: "panel",
      showScopeStatus: true,
    });

    // Same guarantee through the defaults merge itself.
    const withDefaults = mergeWithDefaults({ features: { history: { enabled: true } } });
    expect(withDefaults.features?.history).toMatchObject({
      enabled: true,
      presentation: "panel",
      showScopeStatus: true,
    });

    const next = mergeConfigUpdate(prev, { features: { history: { enabled: true } } });
    expect(next.features?.history?.enabled).toBe(true);
    expect(next.features?.history?.presentation).toBe("panel");
    expect(next.features?.history?.showScopeStatus).toBe(true);
    // Sibling feature blocks survive the history patch.
    expect(next.features?.askUserQuestion?.enabled).toBe(true);
  });

  it("merges features.history.copy without dropping sibling copy overrides", () => {
    const prev = base({ features: { history: { copy: { viewTitle: "Threads" } } } });
    const next = mergeConfigUpdate(prev, {
      features: { history: { copy: { emptyTitle: "Nothing yet" } } },
    });
    expect(next.features?.history?.copy?.viewTitle).toBe("Threads");
    expect(next.features?.history?.copy?.emptyTitle).toBe("Nothing yet");
    expect(next.features?.history?.presentation).toBe("panel");
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

  it("replaces artifact display scope maps so reset preferences do not strand stale keys", () => {
    const previous = mergeWithDefaults({
      features: {
        artifacts: {
          enabled: true,
          display: {
            default: "card",
            files: {
              byMediaType: {
                "text/html": "inline",
                "text/csv": "inline",
              },
            },
          },
        },
      },
    });

    const next = mergeConfigUpdate(previous, {
      features: {
        artifacts: {
          display: {
            default: "card",
            files: {
              byMediaType: {
                "text/csv": "panel",
              },
            },
          },
        },
      },
    });

    expect(next.features?.artifacts?.display).toEqual({
      default: "card",
      files: {
        byMediaType: {
          "text/csv": "panel",
        },
      },
    });
  });

  it("replaces the preferences slice wholesale so dropped overrides do not strand", () => {
    const prev = base({
      preferences: {
        showToolCalls: false,
        artifacts: { display: "inline", filePreview: { enabled: false } },
      },
    });
    // The host's new slice dropped showToolCalls and filePreview: both must go.
    const next = mergeConfigUpdate(prev, {
      preferences: { artifacts: { display: "inline" } },
    });
    expect(next.preferences).toEqual({ artifacts: { display: "inline" } });
    // Explicit-undefined still clears the whole slice.
    const cleared = mergeConfigUpdate(next, { preferences: undefined });
    expect(cleared.preferences).toBeUndefined();
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
