// @vitest-environment jsdom

import { describe, expect, test } from 'vitest';

import { getTabDisplayLabel, getSectionDisplayLabel } from './search';

describe('search UX labels', () => {
  test('getTabDisplayLabel returns UX labels for new 2-tab layout', () => {
    expect(getTabDisplayLabel('style')).toBe('Style');
    expect(getTabDisplayLabel('configure')).toBe('Configure');
    // Unknown IDs fall back to word splitting
    expect(getTabDisplayLabel('unknown-tab')).toBe('Unknown Tab');
    expect(getTabDisplayLabel('design-system')).toBe('Design System');
  });

  test('getSectionDisplayLabel humanizes section ids for breadcrumbs', () => {
    expect(getSectionDisplayLabel('theme-behavior')).toBe('Theme Behavior');
    expect(getSectionDisplayLabel('light-brand-palette')).toBe('Light Brand Palette');
    expect(getSectionDisplayLabel('dark-semantic-colors')).toBe('Dark Semantic Colors');
    expect(getSectionDisplayLabel('comp-panel')).toBe('Comp Panel');
  });
});
