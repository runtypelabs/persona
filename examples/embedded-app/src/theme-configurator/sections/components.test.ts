// @vitest-environment jsdom

import { describe, expect, test, vi } from 'vitest';

import { render, renderShapeSections, renderColorSections } from './components';

describe('component section theming', () => {
  test('keeps structural component fields shared while color fields remain mode-specific', () => {
    const container = document.createElement('div');
    const controls = render(container, vi.fn());
    const paths = controls.map(control => control.fieldDef.path);

    expect(paths).toContain('theme.components.panel.width');
    expect(paths).toContain('theme.components.message.user.background');
    expect(paths).toContain('darkTheme.components.message.user.background');
    expect(paths).not.toContain('darkTheme.components.panel.width');
    expect(paths).not.toContain('darkTheme.components.launcher.size');
    expect(paths).not.toContain('darkTheme.components.button.primary.borderRadius');
    expect(paths).toContain('theme.components.launcher.size');
    expect(paths).toContain('theme.components.button.primary.borderRadius');
    expect(paths).not.toContain('theme.components.voice.recording.indicator');
    expect(paths).not.toContain('theme.components.approval.requested.background');
    expect(paths).not.toContain('theme.components.attachment.image.background');
  });

  test('renderShapeSections returns only shared layout/shape fields', () => {
    const container = document.createElement('div');
    const controls = renderShapeSections(container, vi.fn());
    const paths = controls.map(c => c.fieldDef.path);

    expect(paths).toContain('theme.components.panel.width');
    expect(paths).toContain('theme.components.launcher.size');
    expect(paths).toContain('theme.components.button.primary.borderRadius');
    expect(paths).not.toContain('theme.components.message.user.background');
  });

  test('renderColorSections returns only mode-specific color fields', () => {
    const container = document.createElement('div');
    const controls = renderColorSections(container, vi.fn());
    const paths = controls.map(c => c.fieldDef.path);

    expect(paths).toContain('theme.components.message.user.background');
    expect(paths).toContain('darkTheme.components.message.user.background');
    expect(paths).not.toContain('theme.components.panel.width');
    expect(paths).not.toContain('theme.components.launcher.size');
  });
});
