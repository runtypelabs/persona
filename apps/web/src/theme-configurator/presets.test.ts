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

import {
  applyPreset,
  BUILT_IN_PRESETS,
  loadCustomPresets,
  saveCustomPreset,
} from './presets';

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

  test('maps the paired Persona default into light and dark config slots', () => {
    const preset = BUILT_IN_PRESETS[0];

    expect(preset).toMatchObject({
      id: 'persona-default',
      label: 'Persona Default',
      builtIn: true,
      config: {
        colorScheme: 'auto',
        darkTheme: expect.any(Object),
      },
    });
    expect(preset.theme).toBeTruthy();
  });

  test('applying Persona Default replaces stale dark overrides and fixed pane backgrounds', () => {
    const preset = BUILT_IN_PRESETS[0];
    stateMocks.getConfig.mockReturnValueOnce({
      apiUrl: 'https://api.example.com',
      flowId: 'flow-1',
      colorScheme: 'light',
      darkTheme: {
        semantic: { colors: { surface: '#ffffff' } },
        components: { message: { assistant: { background: '#ffffff' } } },
      },
      features: {
        artifacts: {
          enabled: true,
          layout: {
            paneBackground: '#ffffff',
            toolbarPreset: 'document',
          },
        },
      },
    } as any);

    applyPreset(preset);

    expect(stateMocks.setFullConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        apiUrl: 'https://api.example.com',
        flowId: 'flow-1',
        colorScheme: 'auto',
        darkTheme: preset.config?.darkTheme,
        features: expect.objectContaining({
          artifacts: expect.objectContaining({
            layout: expect.objectContaining({
              paneBackground: undefined,
              toolbarPreset: 'document',
            }),
          }),
        }),
      }),
      preset.theme
    );
  });

  test('theme-only presets clear layout paneBackground so semantic artifact fill applies', () => {
    stateMocks.getConfig.mockReturnValueOnce({
      apiUrl: 'https://api.example.com',
      features: {
        artifacts: {
          enabled: true,
          layout: {
            paneBackground: '#0a0a0a',
            toolbarPreset: 'document',
          },
        },
      },
    } as any);

    applyPreset({
      id: 'default-light',
      label: 'Default Light',
      description: 'Test',
      builtIn: true,
      theme: {},
    } as any);

    expect(stateMocks.setFullConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        darkTheme: undefined,
        features: expect.objectContaining({
          artifacts: expect.objectContaining({
            layout: expect.objectContaining({
              paneBackground: undefined,
              toolbarPreset: 'document',
            }),
          }),
        }),
      }),
      expect.anything()
    );
    expect(stateMocks.setTheme).not.toHaveBeenCalled();
  });

  test('theme-only presets clear darkTheme so dark preview uses preset light slot + createDarkTheme', () => {
    stateMocks.getConfig.mockReturnValueOnce({
      apiUrl: 'https://api.example.com',
      darkTheme: {
        semantic: {
          colors: {
            surface: 'palette.colors.gray.50',
            background: 'palette.colors.gray.50',
          },
        },
      },
    } as any);

    applyPreset({
      id: 'default-dark',
      label: 'Default Dark',
      description: 'Test',
      builtIn: true,
      theme: { semantic: { colors: { surface: 'palette.colors.gray.800' } } },
    } as any);

    expect(stateMocks.setFullConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        apiUrl: 'https://api.example.com',
        darkTheme: undefined,
      }),
      expect.objectContaining({
        semantic: { colors: { surface: 'palette.colors.gray.800' } },
      })
    );
    expect(stateMocks.setTheme).not.toHaveBeenCalled();
  });
});
