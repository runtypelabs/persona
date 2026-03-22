// @vitest-environment jsdom

import { describe, expect, test, vi } from 'vitest';

import { render } from './widget-config';

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

  test('launcher configure section surfaces position summary and a cross-link back to style', () => {
    const container = document.createElement('div');
    render(container, vi.fn());

    const launcherSection = container.querySelector('[data-section-id="launcher-config"]');
    const summary = launcherSection?.querySelector('.accordion-summary');
    const action = launcherSection?.querySelector('.section-header-action') as HTMLElement | null;

    expect(summary?.textContent).toContain('Position:');
    expect(action?.textContent).toContain('Edit appearance');
    expect(action?.dataset.crosslinkTab).toBe('style');
    expect(action?.dataset.crosslinkSection).toBe('launcher-style');
  });
});
