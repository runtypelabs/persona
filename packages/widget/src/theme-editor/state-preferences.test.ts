import { describe, expect, it } from "vitest";
import { ThemeEditorState } from "./state";

describe("ThemeEditorState preference reset", () => {
  it("unsets a path and prunes empty parent objects", () => {
    const state = new ThemeEditorState(undefined, {}, { mergeDefaults: false });
    state.set("features.artifacts.display.files", "inline");
    expect(state.get("features.artifacts.display.files")).toBe("inline");

    state.unset("features.artifacts.display.files");

    expect(state.get("features.artifacts.display.files")).toBeUndefined();
    expect(state.getConfig()).not.toHaveProperty("features");
  });

  it("preserves an authored v5 defaults opt-in across state reset", () => {
    const state = new ThemeEditorState(
      undefined,
      { future: { v5Defaults: true } },
    );

    expect(state.getConfig().future?.v5Defaults).toBe(true);
    expect(state.exportSnapshot().config.future).toEqual({ v5Defaults: true });

    state.resetToDefaults();

    expect(state.getConfig().future?.v5Defaults).toBe(true);
  });
});

describe('version switching preserves authored values', () => {
  it('rebases config and theme in both directions, including undo/redo', () => {
    const state = new ThemeEditorState();
    state.set('theme.components.header.controlSize', '32px');
    state.set('features.toolCallDisplay.autoExpand', true);
    state.set('future.v5Defaults', true);
    expect(state.get('features.toolCallDisplay.variant')).toBe('row');
    expect(state.get('features.toolCallDisplay.autoExpand')).toBe(true);
    expect(state.get('theme.components.header.controlSize')).toBe('32px');
    expect(state.get('theme.components.header.controlIconSize')).toBe('16px');
    state.undo();
    state.redo();
    state.unset('future.v5Defaults');
    expect(state.get('features.toolCallDisplay.variant')).toBeUndefined();
    expect(state.get('theme.components.header.controlIconSize')).toBeUndefined();
    state.set('future.v5Defaults', true);
    expect(state.get('theme.components.header.controlSize')).toBe('32px');
  });
  it('preserves constructor overrides and same-batch edits regardless of order', () => {
    const state = new ThemeEditorState({ components: { header: { controlSize: '40px' } } }, { features: { toolCallDisplay: { autoExpand: true } } });
    state.setBatch({ 'theme.components.header.controlIconSize': '22px', 'future.v5Defaults': true });
    expect(state.get('features.toolCallDisplay.variant')).toBe('row');
    expect(state.get('theme.components.header.controlSize')).toBe('40px');
    expect(state.get('theme.components.header.controlIconSize')).toBe('22px');
    state.setBatch({ 'future.v5Defaults': false, 'theme.components.header.controlSize': '44px' });
    expect(state.get('theme.components.header.controlSize')).toBe('44px');
  });
  it('keeps sparse configs sparse when defaults merging is disabled', () => {
    const state = new ThemeEditorState(undefined, {}, { mergeDefaults: false });
    state.set('future.v5Defaults', true);
    expect(state.get('features')).toBeUndefined();
    expect(state.get('theme.components.header.controlSize')).toBe('28px');
  });
});
