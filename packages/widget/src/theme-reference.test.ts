import { describe, expect, it } from "vitest";

import { getThemeReference } from "./theme-reference";
import { resolveDefaults } from "./defaults";
import { resolveThemeDefaults } from "./utils/tokens";

describe.each([false, true])("theme reference defaults versioning (v5=%s)", (v5Defaults) => {
  it("reads its documented defaults from the shared future-aware resolvers", () => {
    const reference = getThemeReference({ v5Defaults });
    const future = { v5Defaults };

    expect(reference.defaultsVersion).toBe(v5Defaults ? "v5" : "v4");
    expect(reference.themeDefaultsVersion).toBe(v5Defaults ? "v5" : "v4");
    expect(reference.defaultColorPalette).toBe(
      resolveThemeDefaults(future).palette.colors
    );
    expect(reference.defaultRadius).toBe(resolveThemeDefaults(future).palette.radius);
    expect(reference.defaultLauncher).toEqual(resolveDefaults({ future }).launcher);
  });
});

describe("scoped style replacement reference", () => {
  it("documents scope, opt-in old state tokens, units, reset semantics, and retained no-ops", () => {
    const reference = getThemeReference();
    expect(reference.tokenDocs.layers.components.header.properties).toContain("close and clear");
    expect(reference.tokenDocs.layers.components.voice).toContain("materialized defaults do not recolor");
    expect(reference.tokenDocs.layers.components.toolBubble).toContain("CSS duration uses ms/s");
    expect(reference.tokenDocs.layers.components.askUserQuestion).toContain("Local features.askUserQuestion.styles still wins");
    expect(reference.tokenDocs.styleMigration.updates).toContain("JSON-round-tripped");
    expect(reference.tokenDocs.styleMigration.retained).toContain("fontFamily is an accepted no-op");
    expect(reference.examples.independentControls.theme.components?.voice?.control).toMatchObject({ size: "44px", iconSize: "22px" });
    expect(reference.examples.scopedSurfaces.theme.components?.toolBubble?.loading?.duration).toBe("1600ms");
  });
});

it('starts new authoring at brand/semantic/components with explicit defaults selection', () => {
  const overview = getThemeReference().tokenDocs.overview;
  expect(overview).toContain('brand');
  expect(overview).toContain('theme.semantic');
  expect(overview).toContain('theme.components');
  expect(overview).toContain('Current V4 defaults');
  expect(overview).toContain('future.v5Defaults');
  expect(overview).not.toContain('non-theme appearance options');
  expect(getThemeReference().tokenDocs.layers.components.button.description).toContain('button.stop');
});
