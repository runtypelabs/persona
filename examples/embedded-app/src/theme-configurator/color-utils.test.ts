// @vitest-environment jsdom

import { describe, expect, test } from 'vitest';
import { resolveThemeColorPath } from './color-utils';

describe('resolveThemeColorPath', () => {
  test('returns literal hex and rgb', () => {
    const get = (path: string) => {
      if (path === 'theme.components.message.user.text') return '#ff00ff';
      return undefined;
    };
    expect(resolveThemeColorPath(get, 'theme.components.message.user.text')).toBe('#ff00ff');
  });

  test('follows palette and semantic refs', () => {
    const store: Record<string, unknown> = {
      'theme.components.message.user.text': 'semantic.colors.textInverse',
      'theme.semantic.colors.textInverse': 'palette.colors.gray.50',
      'theme.palette.colors.gray.50': '#f9fafb',
    };
    const get = (path: string) => store[path];
    expect(resolveThemeColorPath(get, 'theme.components.message.user.text')).toBe('#f9fafb');
  });

  test('caps recursion depth', () => {
    const store: Record<string, unknown> = {
      'theme.start': 'semantic.colors.s0',
      'theme.semantic.colors.s0': 'semantic.colors.s1',
      'theme.semantic.colors.s1': 'semantic.colors.s2',
      'theme.semantic.colors.s2': 'semantic.colors.s3',
      'theme.semantic.colors.s3': 'semantic.colors.s4',
      'theme.semantic.colors.s4': 'semantic.colors.s5',
      'theme.semantic.colors.s5': 'semantic.colors.s6',
      'theme.semantic.colors.s6': '#111111',
    };
    const get = (path: string) => store[path];
    expect(resolveThemeColorPath(get, 'theme.start')).toBe('#cbd5e1');
  });
});
