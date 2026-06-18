// @vitest-environment jsdom

import { describe, expect, test, vi } from 'vitest';

import { render, renderPaletteScales, renderSemanticGroup } from './colors-style';

describe('colors & style section theming', () => {
  test('palette scales render mode-specific (light + dark) without shared typography/radius/shadows', () => {
    const container = document.createElement('div');
    const controls = render(container, vi.fn());
    const paths = controls.map(control => control.fieldDef.path);

    // Light and dark palette scales
    expect(paths).toContain('theme.palette.colors.primary');
    expect(paths).toContain('darkTheme.palette.colors.primary');

    // Light and dark semantic colors
    expect(paths).toContain('theme.semantic.colors.primary');
    expect(paths).toContain('darkTheme.semantic.colors.primary');

    // Typography, radius, shadows are NO LONGER part of colors-style (moved to Style tab)
    expect(paths).not.toContain('theme.semantic.typography.fontFamily');
    expect(paths).not.toContain('theme.palette.radius.sm');
    expect(paths).not.toContain('theme.palette.shadows.sm');
  });

  test('renderPaletteScales renders light + dark palette sections', () => {
    const container = document.createElement('div');
    const controls = renderPaletteScales(container, vi.fn());
    const paths = controls.map(c => c.fieldDef.path);

    expect(paths).toContain('theme.palette.colors.primary');
    expect(paths).toContain('darkTheme.palette.colors.primary');
    expect(paths).not.toContain('theme.semantic.colors.primary');
  });

  test('renderSemanticGroup renders light + dark semantic sections', () => {
    const container = document.createElement('div');
    const controls = renderSemanticGroup(container, vi.fn());
    const paths = controls.map(c => c.fieldDef.path);

    expect(paths).toContain('theme.semantic.colors.primary');
    expect(paths).toContain('darkTheme.semantic.colors.primary');
    expect(paths).not.toContain('theme.palette.colors.primary');
  });
});
