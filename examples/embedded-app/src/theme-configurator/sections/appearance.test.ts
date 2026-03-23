// @vitest-environment jsdom

import { describe, expect, test, vi, beforeEach } from 'vitest';

vi.mock('@runtypelabs/persona', () => ({
  default: {},
  DEFAULT_WIDGET_CONFIG: {
    launcher: { enabled: true, clearChat: {} },
    copy: {},
    voiceRecognition: {},
    features: {},
    layout: { header: {}, messages: { avatar: {}, timestamp: {} } },
    markdown: { options: {} },
    messageActions: {},
    suggestionChips: [],
    suggestionChipsConfig: {},
    attachments: { enabled: false },
  },
  DEFAULT_PALETTE: {
    colors: {
      primary: { '500': '#2563eb' },
      secondary: { '500': '#7c3aed' },
      accent: { '500': '#06b6d4' },
      gray: { '500': '#6b7280' },
      success: { '500': '#16a34a' },
      warning: { '500': '#d97706' },
      error: { '500': '#dc2626' },
    },
  },
  createTheme: vi.fn((config?: Record<string, unknown>) => config ?? {}),
  applyThemeVariables: vi.fn(),
}));

vi.mock('../../middleware', () => ({
  parseActionResponse: vi.fn(() => null),
}));

import * as state from '../state';
import { render } from './appearance';

describe('appearance curated controls', () => {
  beforeEach(() => {
    state.initStore();
  });

  test('renders curated sections in the new high-signal order with launcher controls surfaced', () => {
    const container = document.createElement('div');
    const onChange = vi.fn();
    const controls = render(container, onChange);

    const sectionIds = Array.from(container.querySelectorAll('[data-section-id]')).map(
      (el) => (el as HTMLElement).dataset.sectionId
    );

    expect(sectionIds).toEqual([
      'brand-colors',
      'chat-colors',
      'launcher-style',
      'typography',
      'theme-mode',
      'shape',
      'shadows',
      'widget-style',
    ]);
    expect(controls.length).toBeGreaterThan(0);
  });

  test('brand color change generates full scale for both themes and updates semantic refs', () => {
    const container = document.createElement('div');
    const onChange = vi.fn();
    render(container, onChange);

    // Find the primary brand color control
    const primaryControl = container.querySelector('[data-section-id="brand-colors"] input[type="color"]') as HTMLInputElement;
    expect(primaryControl).not.toBeNull();

    // Simulate color change via the control's onChange
    // The brand color control path is theme.palette.colors.primary.500
    // After a change, both theme and darkTheme palettes should be updated
    const primaryBefore = state.get('theme.palette.colors.primary.500');
    const newColor = '#ff0000';

    // Trigger the brand color onChange directly through state
    // The compound handler is wired via the render function
    primaryControl!.value = newColor;
    primaryControl!.dispatchEvent(new Event('input', { bubbles: true }));

    // Verify the scale was generated for both themes
    const primary500 = state.get('theme.palette.colors.primary.500');
    const primary300 = state.get('theme.palette.colors.primary.300');
    const darkPrimary500 = state.get('darkTheme.palette.colors.primary.500');

    // The new 500 shade should match the input color
    expect(primary500).toBe(newColor);
    // A full scale was generated (300 shade exists and differs from 500)
    expect(primary300).toBeTruthy();
    expect(primary300).not.toBe(primary500);
    // Dark theme was also updated
    expect(darkPrimary500).toBe(newColor);

    // Semantic references were updated
    expect(state.get('theme.semantic.colors.primary')).toBe('palette.colors.primary.500');
    expect(state.get('darkTheme.semantic.colors.primary')).toBe('palette.colors.primary.400');
  });

  test('shape section has preset buttons', () => {
    const container = document.createElement('div');
    const onChange = vi.fn();
    render(container, onChange);

    const shapeSection = container.querySelector('[data-section-id="shape"]');
    expect(shapeSection).not.toBeNull();

    const presetBtns = shapeSection!.querySelectorAll('.preset-btn');
    const presetLabels = Array.from(presetBtns).map((btn) => btn.textContent);
    expect(presetLabels).toContain('Default');
    expect(presetLabels).toContain('Sharp');
    expect(presetLabels).toContain('Rounded');
  });

  test('header summaries and promoted actions are rendered in appropriate sections', () => {
    const container = document.createElement('div');
    render(container, vi.fn());

    const brandSummary = container.querySelectorAll(
      '[data-section-id="brand-colors"] .accordion-summary-item-color'
    );
    const brandDrilldown = container.querySelector(
      '[data-section-id="brand-colors"] .section-header-action'
    );
    expect(brandSummary).toHaveLength(3);
    expect(brandDrilldown).not.toBeNull();
    expect(brandDrilldown?.textContent).toContain('Full palette');
    expect((brandDrilldown as HTMLElement)?.dataset.drilldownTarget).toBe('palette');

    const chatDrilldown = container.querySelector(
      '[data-section-id="chat-colors"] .section-header-action'
    );
    expect(chatDrilldown).not.toBeNull();
    expect(chatDrilldown?.textContent).toContain('Component colors');

    const launcherSummary = container.querySelector(
      '[data-section-id="launcher-style"] .accordion-summary'
    );
    const launcherAction = container.querySelector(
      '[data-section-id="launcher-style"] .section-header-action'
    );
    expect(launcherSummary?.textContent).toContain('Shape:');
    expect(launcherSummary?.textContent).toContain('Size:');
    expect(launcherSummary?.textContent).toContain('Position:');
    expect((launcherAction as HTMLElement)?.dataset.crosslinkTab).toBe('configure');
    expect((launcherAction as HTMLElement)?.dataset.crosslinkSection).toBe('launcher-config');

    const runtimeSummary = container.querySelector('[data-section-id="theme-mode"] .accordion-summary');
    expect(runtimeSummary?.textContent).toContain('Follow system');

    const widgetDrilldown = container.querySelector(
      '[data-section-id="widget-style"] .section-header-action'
    );
    expect(widgetDrilldown).not.toBeNull();
    expect(widgetDrilldown?.textContent).toContain('Component shapes');
  });
});
