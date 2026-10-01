import { describe, expect, it } from "vitest";
import {
  DEFAULT_WIDGET_CONFIG,
  mergeWithDefaults,
  resolveDefaults,
  resolveDefaultsVersion,
} from "./defaults";

describe.each([false, true])("defaults resolver (v5Defaults: %s)", (v5Defaults) => {
  const future = { v5Defaults };

  it("leaves V5 suggestion weight to theme tokens and preserves explicit legacy overrides", () => {
    expect(mergeWithDefaults({ future }).suggestionChipsConfig?.fontWeight)
      .toBe(v5Defaults ? undefined : "500");
    expect(mergeWithDefaults({ future, suggestionChipsConfig: { fontWeight: "600" } })
      .suggestionChipsConfig?.fontWeight).toBe("600");
  });

  it("selects the requested version and its documented defaults", () => {
    expect(resolveDefaultsVersion({ future })).toBe(v5Defaults ? "v5" : "v4");
    const defaults = resolveDefaults({ future });
    if (!v5Defaults) expect(defaults).toEqual(DEFAULT_WIDGET_CONFIG);
    expect(defaults.layout?.header?.showSubtitle).toBe(!v5Defaults);
    expect(defaults.composer?.layout).toBe(v5Defaults ? "single-row" : undefined);
    expect(defaults.launcher?.variant).toBe(v5Defaults ? "circle" : undefined);
    expect(defaults.composer?.placement).toBe(v5Defaults ? "overlay" : undefined);
    expect(defaults.launcher?.width).toBe(v5Defaults
      ? "min(400px, calc(100vw - 24px))"
      : "min(440px, calc(100vw - 24px))");
  });

  it("preserves explicit composer and header options above the version defaults", () => {
    const result = mergeWithDefaults({
      future, composer: { layout: "stacked", placement: "block" },
      layout: { header: { showSubtitle: true } },
    });
    expect(result.composer?.layout).toBe("stacked");
    expect(result.composer?.placement).toBe("block");
    expect(result.layout?.header?.showSubtitle).toBe(true);
    const partial = mergeWithDefaults({ future, composer: { placement: "overlay" } });
    expect(partial.composer?.layout).toBe(v5Defaults ? "single-row" : undefined);
  });

  it("merges partial role sizing above the selected default width", () => {
    const result = mergeWithDefaults({ future, layout: { messages: { assistant: { maxWidth: "65ch" } } } });
    expect(result.layout?.messages?.assistant?.maxWidth).toBe("65ch");
    expect(result.layout?.messages?.assistant?.width).toBe(v5Defaults ? "full" : undefined);
    expect(result.layout?.messages?.user).toBeUndefined();
  });

  it("merges explicit options and nested theme overrides above the selected defaults", () => {
    const config = {
      future,
      launcher: { headerIconSize: "31px", title: "Custom title" },
      features: { reasoningDisplay: { expandable: false } },
      theme: { components: { header: { padding: "7px", title: { fontSize: "19px" } } } },
    };
    const result = mergeWithDefaults(config);
    expect(result.future).toEqual(future);
    expect(result.launcher?.headerIconSize).toBe("31px");
    expect(result.launcher?.title).toBe("Custom title");
    expect(result.features?.reasoningDisplay).toEqual({
      ...DEFAULT_WIDGET_CONFIG.features?.reasoningDisplay,
      ...(v5Defaults ? { variant: "row", iconVisibility: "active", autoExpand: false, loadingAnimation: "shimmer" } : {}),
      expandable: false,
    });
    expect(result.theme?.components?.header).toEqual(config.theme.components.header);
    expect(resolveDefaults({ future }).launcher?.headerIconSize).toBe(v5Defaults ? "20px" : "40px");
  });
});

it("keeps the legacy defaults when the opt-in is missing", () => {
  expect(resolveDefaultsVersion()).toBe("v4");
  expect(resolveDefaultsVersion({ future: {} })).toBe("v4");
  expect(JSON.stringify(mergeWithDefaults())).toBe(JSON.stringify(DEFAULT_WIDGET_CONFIG));
});


it("merges approval options independently and preserves disabling", () => {
  const future = { v5Defaults: true };
  const partial = mergeWithDefaults({ future, approval: { approveLabel: "Proceed" } });
  expect(partial.approval).toMatchObject({ resolvedDisplay: "row", primaryAction: "allow-once", keyboardShortcuts: "focused", approveLabel: "Proceed" });
  expect(mergeWithDefaults({ future, approval: false }).approval).toBe(false);
  expect(mergeWithDefaults({ future, approval: { resolvedDisplay: "trace", primaryAction: "always-allow", keyboardShortcuts: false } }).approval).toEqual({ resolvedDisplay: "trace", primaryAction: "always-allow", keyboardShortcuts: false });
  expect(mergeWithDefaults({}).approval).toBeUndefined();
});
