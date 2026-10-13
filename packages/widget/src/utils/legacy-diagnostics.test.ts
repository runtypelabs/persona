import { afterEach, describe, expect, it, vi } from "vitest";
import { mergeWithDefaults, resolveDefaults } from "../defaults";
import { createLegacyDiagnosticContext, LEGACY_MIGRATIONS, updateLegacyDiagnostics } from "./legacy-diagnostics";
import { mergeConfigUpdate } from "./config-merge";
import type { AgentWidgetConfig } from "../types";
import { LEGACY_STYLE_PATHS } from "./style-provenance";

afterEach(() => vi.restoreAllMocks());

const atPath = (path: string, value: unknown): Record<string, unknown> =>
  path.split(".").reverse().reduce<Record<string, unknown>>((child, key, index) =>
    ({ [key]: index === 0 ? value : child }), {});

describe("scoped legacy diagnostics", () => {
  it("maps each verified style leaf and excludes known no-ops and behavior", () => {
    for (const path of LEGACY_STYLE_PATHS) expect(LEGACY_MIGRATIONS[path]).toBeDefined();
    for (const path of ["suggestionChipsConfig.fontFamily", "features.artifacts.layout.unifiedSplitChrome", "sendButton.useIcon", "voiceRecognition.provider", "approval.onDecision"]) {
      expect(LEGACY_MIGRATIONS[path]).toBeUndefined();
    }
  });
  it.each(Object.keys(LEGACY_MIGRATIONS))("reports only explicit host usage of %s", (path) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const context = createLegacyDiagnosticContext({ ...atPath(path, ""), debug: true });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(path));
    updateLegacyDiagnostics(context, { copy: { inputPlaceholder: "Unrelated" } });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])("does not report inherited defaults or own undefined resets (v5=%s)", (v5Defaults) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const config = mergeWithDefaults({ future: { v5Defaults }, debug: true });
    const context = createLegacyDiagnosticContext(config);
    updateLegacyDiagnostics(context, { approval: { backgroundColor: undefined }, copy: { welcomeTitle: undefined } });
    updateLegacyDiagnostics(context, { ...config });
    expect(warn).not.toHaveBeenCalled();
  });

  it("delays diagnostics until debug is enabled and ignores cleared fields", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const context = createLegacyDiagnosticContext({ toolCall: { shadow: "none" }, approval: { borderColor: "red" } });
    expect(warn).not.toHaveBeenCalled();
    expect(context.warned.size).toBe(0);
    updateLegacyDiagnostics(context, { approval: undefined });
    updateLegacyDiagnostics(context, { debug: true });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("toolCall.shadow"));
    updateLegacyDiagnostics(context, { debug: false, copy: { showWelcomeCard: false } });
    updateLegacyDiagnostics(context, { debug: true });
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenLastCalledWith(expect.stringContaining("copy.showWelcomeCard"));
  });

  it("keeps separate widget lifetimes even for reused host config objects", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const input = { debug: true, launcherWidth: "400px" };
    const first = createLegacyDiagnosticContext(input);
    const second = createLegacyDiagnosticContext(input);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(first.warned).not.toBe(second.warned);
    updateLegacyDiagnostics(first, { launcherWidth: undefined });
    updateLegacyDiagnostics(first, { launcherWidth: "500px" });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("retains usage through normalized controller rebuild config and diagnoses newly added fields", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const raw = { debug: true, copy: { welcomeTitle: "Hello" } };
    const context = createLegacyDiagnosticContext(raw);
    let config = mergeWithDefaults(raw) as AgentWidgetConfig;
    config = mergeConfigUpdate(config, { launcher: { mountMode: "docked" } });
    updateLegacyDiagnostics(context, { ...config });
    expect(warn).toHaveBeenCalledTimes(1);
    updateLegacyDiagnostics(context, { approval: { shadow: "none" } });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("keeps warnings bounded instead of guessing from color names or whole objects", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    createLegacyDiagnosticContext({ debug: true, launcher: {}, sendButton: { tooltipText: "Send" }, suggestionChipsConfig: { fontFamily: "mono" } });
    expect(warn).not.toHaveBeenCalled();
  });

  it("conservatively diagnoses present aliases in unknown-origin external default-filled configs", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const context = createLegacyDiagnosticContext({ ...resolveDefaults(), debug: true });
    expect(context.current.has("suggestionChips")).toBe(true);
    expect(context.current.has("suggestionChipsConfig.paddingX")).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("suggestionChipsConfig.paddingX"));
  });
});
