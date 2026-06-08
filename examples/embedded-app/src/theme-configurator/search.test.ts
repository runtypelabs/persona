// @vitest-environment jsdom

import { describe, expect, test } from 'vitest';

import {
  getTabDisplayLabel,
  getSectionDisplayLabel,
  registerCatalogSections,
  resetSearchIndex,
  search,
} from './search';
import type { FieldDef } from './types';

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

describe('catalog search (drill-down fields indexed up front)', () => {
  const shadowField = (id: string, label: string, path: string): FieldDef => ({
    id,
    label,
    type: 'select',
    path,
  });

  test('finds shadow fields by path keyword without their section being rendered', () => {
    resetSearchIndex();
    registerCatalogSections('style', [
      {
        id: 'comp-shadows',
        fields: [
          shadowField('shadow-approval', 'Approval Bubble', 'theme.components.approval.requested.shadow'),
          shadowField('shadow-tool-bubble', 'Tool Call Bubble', 'theme.components.toolBubble.shadow'),
        ],
      },
    ]);

    const results = search('shadow');
    const ids = results.map((r) => r.entry.fieldId);
    expect(ids).toContain('shadow-approval');
    expect(ids).toContain('shadow-tool-bubble');
    // Catalog entries route to the right tab/section for navigation.
    expect(results.find((r) => r.entry.fieldId === 'shadow-approval')?.entry.sectionId).toBe('comp-shadows');
  });

  test('collapses duplicate field ids (catalog + live) to a single result', () => {
    resetSearchIndex();
    const section = {
      id: 'comp-shadows',
      fields: [shadowField('shadow-approval', 'Approval Bubble', 'theme.components.approval.requested.shadow')],
    };
    // Register twice to simulate a catalog entry plus a live entry for the same field.
    registerCatalogSections('style', [section]);
    registerCatalogSections('style', [section]);

    const matches = search('approval').filter((r) => r.entry.fieldId === 'shadow-approval');
    expect(matches).toHaveLength(1);
  });
});
