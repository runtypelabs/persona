// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest';

const stateMocks = vi.hoisted(() => ({
  getTheme: vi.fn(() => ({ semantic: { colors: { primary: 'palette.colors.primary.500' } } })),
  getConfig: vi.fn(() => ({ apiUrl: 'https://api.example.com', flowId: 'flow-1' })),
  exportSnapshot: vi.fn(() => ({
    version: 2,
    config: { apiUrl: 'https://api.example.com', flowId: 'flow-1' },
    theme: { semantic: { colors: { primary: 'palette.colors.primary.500' } } },
  })),
  setTheme: vi.fn(),
  setFullConfig: vi.fn(),
}));

vi.mock('./state', () => ({
  getTheme: stateMocks.getTheme,
  getConfig: stateMocks.getConfig,
  exportSnapshot: stateMocks.exportSnapshot,
  setTheme: stateMocks.setTheme,
  setFullConfig: stateMocks.setFullConfig,
}));

vi.mock('@runtypelabs/persona', () => ({
  createTheme: vi.fn((theme: unknown) => theme),
}));

import { applyPreset, loadCustomPresets, saveCustomPreset } from './presets';

describe('custom presets', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  test('saves current config alongside theme', () => {
    expect(saveCustomPreset('My preset')).toBe(true);

    const [preset] = loadCustomPresets();
    expect(preset.label).toBe('My preset');

    const raw = localStorage.getItem('persona-widget-presets-v2');
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!)[0].config).toEqual({
      apiUrl: 'https://api.example.com',
      flowId: 'flow-1',
    });
  });

  test('applies config-aware presets through full state restore', () => {
    applyPreset({
      id: 'custom',
      label: 'Custom',
      description: 'Config aware preset',
      builtIn: false,
      theme: { semantic: { colors: { text: 'palette.colors.gray.900' } } },
      config: { flowId: 'flow-2', apiUrl: 'https://api.changed.com' },
    } as any);

    expect(stateMocks.setFullConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        flowId: 'flow-2',
        apiUrl: 'https://api.changed.com',
      }),
      expect.objectContaining({
        semantic: {
          colors: {
            text: 'palette.colors.gray.900',
          },
        },
      })
    );
    expect(stateMocks.setTheme).not.toHaveBeenCalled();
  });
});
