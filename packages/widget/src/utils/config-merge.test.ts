import { describe, expect, it, vi } from "vitest";

import { mergeConfigUpdate } from "./config-merge";
import { DEFAULT_FLOATING_LAUNCHER_WIDTH, mergeWithDefaults } from "../defaults";
import { getPanelAliasProvenance } from "./panel-config";
import type { AgentConfig, AgentWidgetConfig, StreamAnimationPlugin, VoiceProvider } from "../types";

describe.each([false, true])("mergeConfigUpdate (v5=%s)", (v5Defaults) => {
  // Stored controller config is post-mergeWithDefaults.
  const base = (overrides: Partial<AgentWidgetConfig> = {}): AgentWidgetConfig =>
    mergeWithDefaults({ apiUrl: "https://api.example.com/chat", future: { v5Defaults }, ...overrides }) as AgentWidgetConfig;

  it("retains and clears legacy panel-alias provenance across live patches", () => {
    const initial = base({ launcher: { width: "600px", dock: { width: "520px" } } });
    expect(getPanelAliasProvenance(initial)).toMatchObject({ launcherWidth: true, dockWidth: true });

    const retained = mergeConfigUpdate(initial, { launcher: { title: "Updated" } });
    expect(getPanelAliasProvenance(retained)).toMatchObject({ launcherWidth: true, dockWidth: true });

    const cleared = mergeConfigUpdate(retained, { launcher: { width: undefined, dock: { width: undefined } } });
    expect(getPanelAliasProvenance(cleared)).toMatchObject({ launcherWidth: false, dockWidth: false });

    const parentCleared = mergeConfigUpdate(initial, { launcher: undefined });
    expect(getPanelAliasProvenance(parentCleared)).toMatchObject({ launcherWidth: false, dockWidth: false });

    const dockParentCleared = mergeConfigUpdate(initial, { launcher: { dock: undefined } });
    expect(getPanelAliasProvenance(dockParentCleared)).toMatchObject({ launcherWidth: true, dockWidth: false });
  });

  it("does not treat an explicit undefined width as a legacy alias", () => {
    const config = mergeWithDefaults({
      future: { v5Defaults },
      launcherWidth: "600px",
      launcher: { width: undefined },
    }) as AgentWidgetConfig;
    expect(getPanelAliasProvenance(config)).toMatchObject({
      launcherWidth: false,
      legacyLauncherWidth: true,
    });
  });

  it("keeps an explicit legacy width even when it equals the materialized default", () => {
    const config = base({ launcher: { width: DEFAULT_FLOATING_LAUNCHER_WIDTH } });
    expect(getPanelAliasProvenance(config).launcherWidth).toBe(true);
  });

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
    const previous = base({
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

  it("replaces the full agent definition and clears it without changing agent options", () => {
    const first: AgentConfig = {
      name: "First", model: "model-a", systemPrompt: "First prompt",
      temperature: 0.5, loopConfig: { maxTurns: 5 },
    };
    const replacement: AgentConfig = { name: "Next", model: "model-b", systemPrompt: "Next prompt" };
    const prev = base({ agent: first, agentOptions: { debugMode: true } });
    const next = mergeConfigUpdate(prev, { agent: replacement });
    expect(next.agent).toEqual(replacement);
    expect(next.agent?.loopConfig).toBeUndefined();
    expect(next.agentOptions?.debugMode).toBe(true);
    expect(mergeConfigUpdate(next, { agent: undefined }).agent).toBeUndefined();
    expect(prev.agent).toEqual(first);
  });

  it("replaces custom voice implementations without inheriting optional methods", () => {
    const replacement: VoiceProvider = {
      type: "custom",
      connect: vi.fn(async () => {}), disconnect: vi.fn(async () => {}),
      startListening: vi.fn(async () => {}), stopListening: vi.fn(async () => {}),
      onResult: vi.fn(), onError: vi.fn(), onStatusChange: vi.fn(),
    };
    const first: VoiceProvider = { ...replacement, onLevel: vi.fn() };
    const prev = base({ voiceRecognition: {
      enabled: true, provider: { type: "custom", custom: first, browser: { language: "fr-FR" } },
    } });
    const next = mergeConfigUpdate(prev, { voiceRecognition: { provider: { custom: replacement } } });
    expect(next.voiceRecognition?.provider?.custom).toBe(replacement);
    expect(next.voiceRecognition?.provider?.custom).not.toHaveProperty("onLevel");
    expect(next.voiceRecognition?.enabled).toBe(true);
    expect(next.voiceRecognition?.provider?.browser?.language).toBe("fr-FR");
    const factory = () => replacement;
    const fromFactory = mergeConfigUpdate(next, { voiceRecognition: { provider: { custom: factory } } });
    expect(fromFactory.voiceRecognition?.provider?.custom).toBe(factory);
    expect(mergeConfigUpdate(fromFactory, { voiceRecognition: { provider: { custom: replacement } } })
      .voiceRecognition?.provider?.custom).toBe(replacement);
    const cleared = mergeConfigUpdate(next, { voiceRecognition: { provider: undefined } });
    expect(cleared.voiceRecognition?.provider).toEqual(base().voiceRecognition?.provider);
    expect(cleared.voiceRecognition?.enabled).toBe(true);
    expect(prev.voiceRecognition?.provider?.custom).toBe(first);
  });

  it("replaces renderer and target resolver maps, including explicit empty maps", () => {
    const oldRenderer = vi.fn(() => document.createElement("div"));
    const newRenderer = vi.fn(() => document.createElement("div"));
    const oldResolver = vi.fn(() => ({ payload: { assistant: "old" } }));
    const newResolver = vi.fn(() => ({ payload: { assistant: "new" } }));
    const prev = base({ components: { old: oldRenderer }, targetProviders: { old: oldResolver } });
    const next = mergeConfigUpdate(prev, {
      components: { next: newRenderer }, targetProviders: { next: newResolver },
    });
    expect(next.components).toEqual({ next: newRenderer });
    expect(next.targetProviders).toEqual({ next: newResolver });
    const emptied = mergeConfigUpdate(next, { components: {}, targetProviders: {} });
    expect(emptied.components).toEqual({});
    expect(emptied.targetProviders).toEqual({});
    const cleared = mergeConfigUpdate(next, { components: undefined, targetProviders: undefined });
    expect(cleared.components).toEqual(base().components);
    expect(cleared.targetProviders).toEqual(base().targetProviders);
    expect(prev.components).toEqual({ old: oldRenderer });
  });

  it("replaces icon variants and renderers while retaining welcome siblings", () => {
    const prev = base({ welcome: {
      title: "Keep", icon: { type: "image", url: "/logo.png", alt: "Logo", placement: "inline" },
    } });
    const next = mergeConfigUpdate(prev, { welcome: { icon: { type: "text", text: "Hello" } } });
    expect(next.welcome).toEqual({ title: "Keep", icon: { type: "text", text: "Hello" } });
    const renderIcon = vi.fn(() => document.createElement("span"));
    const rendered = mergeConfigUpdate(next, { welcome: { icon: renderIcon } });
    expect(rendered.welcome?.icon).toBe(renderIcon);
    const lucide = mergeConfigUpdate(rendered, { welcome: { icon: { type: "lucide", name: "sparkles" } } });
    expect(lucide.welcome?.icon).toEqual({ type: "lucide", name: "sparkles" });
    expect(mergeConfigUpdate(lucide, { welcome: { icon: undefined } }).welcome).toEqual({ title: "Keep" });
    expect(mergeConfigUpdate(lucide, { welcome: undefined }).welcome).toBeUndefined();
  });

  it("merges theme component tokens and resets a feature parent without dropping siblings", () => {
    const prev = base({
      theme: { components: {
        composer: { send: { background: "#123456", foreground: "#ffffff" } },
        button: { stop: { foreground: "#ff0000" } },
      } },
      features: { artifacts: { enabled: true, display: { default: "inline" }, layout: { paneWidth: "30rem" } },
        history: { enabled: true } },
    });
    const next = mergeConfigUpdate(prev, { theme: { components: { composer: { send: { foreground: "#eeeeee" } } } },
      features: { artifacts: undefined } });
    expect(next.theme?.components?.composer?.send).toMatchObject({ background: "#123456", foreground: "#eeeeee" });
    expect(next.theme?.components?.button?.stop?.foreground).toBe("#ff0000");
    expect(next.features?.artifacts).toEqual(base().features?.artifacts);
    expect(next.features?.history?.enabled).toBe(true);
    expect(mergeConfigUpdate(next, { theme: { components: undefined } }).theme?.components)
      .toEqual(base().theme?.components);
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


describe("live defaults version changes", () => {
  const base = (config: Partial<AgentWidgetConfig> = {}) =>
    mergeWithDefaults({ apiUrl: "/api", ...config }) as AgentWidgetConfig;

  it("moves inherited defaults in both directions and resets a cleared future flag", () => {
    const v5 = mergeConfigUpdate(base(), { future: { v5Defaults: true } });
    expect(v5.launcher?.headerIconSize).toBe("20px");
    expect(v5.layout?.header?.showSubtitle).toBe(false);
    expect(v5.composer?.layout).toBe("single-row");
    expect(v5.statusIndicator?.mode).toBe("transient");
    const v4 = mergeConfigUpdate(v5, { future: undefined });
    expect(v4.launcher?.headerIconSize).toBe("40px");
    expect(v4.layout?.header?.showSubtitle).toBe(true);
    expect(v4.composer?.layout).toBeUndefined();
    expect(v4.statusIndicator?.mode).toBeUndefined();
    const v5Again = mergeConfigUpdate(v4, { future: { v5Defaults: true } });
    expect(v5Again.layout?.messages?.assistant?.width).toBe("full");
    expect(v5Again.composer?.layout).toBe("single-row");
  });

  it("retains host choices even when they equal a previous version default", () => {
    const initial = base({ launcher: { headerIconSize: "40px" }, layout: { header: { showSubtitle: true } } });
    const v5 = mergeConfigUpdate(initial, { future: { v5Defaults: true } });
    expect(v5.launcher?.headerIconSize).toBe("40px");
    expect(v5.layout?.header?.showSubtitle).toBe(true);
    const reset = mergeConfigUpdate(v5, { launcher: { headerIconSize: undefined }, layout: { header: undefined } });
    expect(reset.launcher?.headerIconSize).toBe("20px");
    expect(reset.layout?.header?.showSubtitle).toBe(false);
    expect(initial.launcher?.headerIconSize).toBe("40px");
  });

  it("preserves live overrides and normal config spreads across version changes", () => {
    const edited = mergeConfigUpdate(base(), { composer: { layout: "stacked" }, statusIndicator: { mode: "always" } });
    const v5 = mergeConfigUpdate({ ...edited }, { future: { v5Defaults: true } });
    expect(v5.composer?.layout).toBe("stacked");
    expect(v5.statusIndicator?.mode).toBe("always");
    expect(v5.launcher?.headerIconSize).toBe("20px");
  });
});
