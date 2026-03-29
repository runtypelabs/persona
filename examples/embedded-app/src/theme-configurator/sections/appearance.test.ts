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
      primary: { '500': '#171717' },
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

  test('renders V2 sections in outcome-oriented order', () => {
    const container = document.createElement('div');
    const onChange = vi.fn();
    const controls = render(container, onChange);

    const sectionIds = Array.from(container.querySelectorAll('[data-section-id]')).map(
      (el) => (el as HTMLElement).dataset.sectionId
    );

    expect(sectionIds).toEqual([
      'theme-mode-v2',
      'brand-palette-v2',
      'status-palette',
      'interface-roles',
      'status-colors',
      'advanced-tokens',
    ]);
    expect(controls.length).toBeGreaterThan(0);
  });

  test('brand color change generates full scale for both themes and updates semantic refs', () => {
    const container = document.createElement('div');
    const onChange = vi.fn();
    render(container, onChange);

    // Find the primary brand color control in the brand palette section
    const primaryControl = container.querySelector('[data-section-id="brand-palette-v2"] input[type="color"]') as HTMLInputElement;
    expect(primaryControl).not.toBeNull();

    const newColor = '#ff0000';
    primaryControl!.value = newColor;
    primaryControl!.dispatchEvent(new Event('input', { bubbles: true }));

    // Verify the scale was generated for both themes
    const primary500 = state.get('theme.palette.colors.primary.500');
    const primary300 = state.get('theme.palette.colors.primary.300');
    const darkPrimary500 = state.get('darkTheme.palette.colors.primary.500');

    expect(primary500).toBe(newColor);
    expect(primary300).toBeTruthy();
    expect(primary300).not.toBe(primary500);
    expect(darkPrimary500).toBe(newColor);

    // Semantic references were updated
    expect(state.get('theme.semantic.colors.primary')).toBe('palette.colors.primary.500');
    expect(state.get('darkTheme.semantic.colors.primary')).toBe('palette.colors.primary.400');
  });

  test('header summaries and drilldown links are rendered in appropriate sections', () => {
    const container = document.createElement('div');
    render(container, vi.fn());

    // Brand Palette shows 4 color swatches (Primary, Secondary, Accent, Neutral)
    const brandSummary = container.querySelectorAll(
      '[data-section-id="brand-palette-v2"] .accordion-summary-item-color'
    );
    const brandDrilldown = container.querySelector(
      '[data-section-id="brand-palette-v2"] .section-header-action'
    );
    expect(brandSummary).toHaveLength(4);
    expect(brandDrilldown).not.toBeNull();
    expect(brandDrilldown?.textContent).toContain('Full palette');
    expect((brandDrilldown as HTMLElement)?.dataset.drilldownTarget).toBe('palette');

    // Theme mode shows current value
    const themeSummary = container.querySelector('[data-section-id="theme-mode-v2"] .accordion-summary');
    expect(themeSummary?.textContent).toContain('Auto');

    // Advanced Tokens has drilldown links
    const advancedActions = container.querySelectorAll(
      '[data-section-id="advanced-tokens"] .section-header-action'
    );
    expect(advancedActions.length).toBeGreaterThanOrEqual(1);
  });

  test('interface roles section renders role-assignment fields', () => {
    const container = document.createElement('div');
    render(container, vi.fn());

    const rolesSection = container.querySelector('[data-section-id="interface-roles"]');
    expect(rolesSection).not.toBeNull();

    // Should have role-assignment controls for each role
    const roleControls = rolesSection!.querySelectorAll('.role-assignment-control');
    expect(roleControls.length).toBe(8);
  });
});
