// @vitest-environment jsdom

import { describe, expect, test, vi } from 'vitest';

import { render } from './widget-config';
import * as state from '../state';

describe('widget config section parity', () => {
  test('renders all configure tab sections with sub-group dividers', () => {
    const container = document.createElement('div');
    const controls = render(container, vi.fn());
    const paths = controls.map(control => control.fieldDef.path);
    const suggestionChipsControl = controls.find(control => control.fieldDef.path === 'suggestionChips');

    // Content sub-group
    expect(paths).toContain('suggestionChips');
    expect(suggestionChipsControl?.fieldDef.type).toBe('chip-list');
    expect(paths).toContain('copy.welcomeTitle');

    // Layout sub-group
    expect(paths).toContain('layout.header.layout');
    expect(paths).toContain('layout.messages.layout');
    expect(paths).toContain('messageActions.enabled');

    // Widget sub-group — full launcher config is now in Configure tab
    expect(paths).toContain('launcher.title');
    expect(paths).toContain('launcher.subtitle');
    expect(paths).toContain('launcher.agentIconSize');
    expect(paths).toContain('launcher.callToActionIconSize');
    expect(paths).toContain('sendButton.useIcon');
    expect(paths).toContain('statusIndicator.visible');

    // Features sub-group
    expect(paths).toContain('voiceRecognition.enabled');
    expect(paths).toContain('attachments.enabled');
    expect(paths).toContain('attachments.maxFiles');

    // Developer sub-group
    expect(paths).toContain('apiUrl');
    expect(paths).toContain('parserType');
    expect(paths).toContain('features.showReasoning');
    expect(paths).toContain('debug');
    expect(paths).toContain('markdown.options.gfm');

    // Theme mode moved to Style tab
    expect(paths).not.toContain('colorScheme');
  });

  test('renders sub-group dividers for visual organization', () => {
    const container = document.createElement('div');
    render(container, vi.fn());

    const dividers = Array.from(container.querySelectorAll('.subgroup-divider .subgroup-label'))
      .map(el => el.textContent);

    expect(dividers).toEqual(['Content', 'Layout', 'Widget', 'Features', 'Developer']);
  });

  test('launcher basics section surfaces position summary and a cross-link back to style', () => {
    const container = document.createElement('div');
    render(container, vi.fn());

    const launcherSection = container.querySelector('[data-section-id="launcher-basics"]');
    const summary = launcherSection?.querySelector('.accordion-summary');
    const action = launcherSection?.querySelector('.section-header-action') as HTMLElement | null;

    expect(summary?.textContent).toContain('Position:');
    expect(action?.textContent).toContain('Edit appearance');
    expect(action?.dataset.crosslinkTab).toBe('style');
    expect(action?.dataset.crosslinkSection).toBe('launcher-style');
  });

  test('debug inspection section renders preview transcript builder controls', () => {
    const container = document.createElement('div');
    render(container, vi.fn());

    const debugSection = container.querySelector('[data-section-id="debug-inspection"]');
    const previewTypeSelect = debugSection?.querySelector('[data-preview-transcript-select]') as HTMLSelectElement | null;
    const addButton = debugSection?.querySelector('[data-preview-transcript-add]') as HTMLButtonElement | null;
    const clearButton = debugSection?.querySelector('[data-preview-transcript-clear]') as HTMLButtonElement | null;

    expect(previewTypeSelect).not.toBeNull();
    expect(addButton?.textContent).toContain('Add');
    expect(clearButton?.textContent).toContain('Clear');
  });

  test('preview transcript builder appends and clears entries', () => {
    const container = document.createElement('div');
    state.initStore();
    render(container, vi.fn());

    const debugSection = container.querySelector('[data-section-id="debug-inspection"]')!;
    const previewTypeSelect = debugSection.querySelector('[data-preview-transcript-select]') as HTMLSelectElement;
    const addButton = debugSection.querySelector('[data-preview-transcript-add]') as HTMLButtonElement;
    const clearButton = debugSection.querySelector('[data-preview-transcript-clear]') as HTMLButtonElement;

    previewTypeSelect.value = 'tool-running';
    addButton.click();
    previewTypeSelect.value = 'reasoning-streaming';
    addButton.click();

    expect(state.getPreviewTranscriptEntries()).toEqual(['tool-running', 'reasoning-streaming']);

    clearButton.click();
    expect(state.getPreviewTranscriptEntries()).toEqual([]);
  });
});
