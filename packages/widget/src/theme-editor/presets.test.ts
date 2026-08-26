import { describe, expect, it } from 'vitest';
import type { AgentWidgetConfig } from '../types';
import { createTheme, getActiveTheme, themeToCssVariables } from '../utils/theme';
import { BUILT_IN_PRESETS, getThemeEditorPreset } from './presets';

describe('theme editor presets', () => {
  it('offers the paired Persona default before the single-scheme presets', () => {
    const preset = getThemeEditorPreset('persona-default');

    expect(BUILT_IN_PRESETS[0]).toBe(preset);
    expect(preset).toMatchObject({
      name: 'Persona Default',
      tags: ['light', 'dark', 'adaptive'],
      preview: { surface: '#ffffff' },
      darkPreview: { surface: '#1f2937' },
    });
    expect(preset?.darkTheme).toBeDefined();
  });

  it('resolves the paired default to distinct light and dark surfaces', () => {
    const preset = getThemeEditorPreset('persona-default')!;
    const config = {
      theme: preset.theme,
      darkTheme: preset.darkTheme,
    } as AgentWidgetConfig;

    const light = themeToCssVariables(getActiveTheme({ ...config, colorScheme: 'light' }));
    const dark = themeToCssVariables(getActiveTheme({ ...config, colorScheme: 'dark' }));

    expect(light).toMatchObject({
      '--persona-surface': '#f9fafb',
      '--persona-background': '#f9fafb',
      '--persona-text': '#111827',
      '--persona-border': '#e5e7eb',
    });
    expect(dark).toMatchObject({
      '--persona-surface': '#1f2937',
      '--persona-background': '#111827',
      '--persona-text': '#f3f4f6',
      '--persona-border': '#374151',
    });
  });

  it('gives markdown links a readable foreground in the dark preset', () => {
    // Default Dark is applied through createTheme(), not createDarkTheme(),
    // so the shade has to live on the preset itself.
    const darkPreset = getThemeEditorPreset('default-dark')!;
    const fromPreset = themeToCssVariables(
      createTheme(darkPreset.theme, { validate: false })
    );
    expect(fromPreset['--persona-md-link-color']).toBe('#a3a3a3');

    const paired = getThemeEditorPreset('persona-default')!;
    const config = {
      theme: paired.theme,
      darkTheme: paired.darkTheme,
    } as AgentWidgetConfig;
    const light = themeToCssVariables(getActiveTheme({ ...config, colorScheme: 'light' }));
    const dark = themeToCssVariables(getActiveTheme({ ...config, colorScheme: 'dark' }));
    expect(light['--persona-md-link-color']).toBe('#0f0f0f');
    expect(dark['--persona-md-link-color']).toBe('#a3a3a3');
  });
});
