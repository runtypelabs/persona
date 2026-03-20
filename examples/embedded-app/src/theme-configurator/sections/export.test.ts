// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest';

const stateMocks = vi.hoisted(() => {
  let currentConfig = { apiUrl: 'https://api.example.com', flowId: 'flow-1' };
  const currentTheme = { semantic: { colors: { primary: 'palette.colors.primary.500' } } };
  let changeListener: (() => void) | null = null;

  return {
    getCurrentConfig: () => currentConfig,
    setCurrentConfig: (value: typeof currentConfig) => {
      currentConfig = value;
    },
    getCurrentTheme: () => currentTheme,
    getChangeListener: () => changeListener,
    clearChangeListener: () => {
      changeListener = null;
    },
    onChange: vi.fn((listener: () => void) => {
      changeListener = listener;
      return () => {
        changeListener = null;
      };
    }),
    exportSnapshot: vi.fn(() => ({
      version: 2,
      config: currentConfig,
      theme: currentTheme,
    })),
    importSnapshot: vi.fn(),
    resetToDefaults: vi.fn(),
  };
});

vi.mock('../state', () => ({
  getConfig: vi.fn(() => stateMocks.getCurrentConfig()),
  getConfigForOutput: vi.fn(() => stateMocks.getCurrentConfig()),
  getTheme: vi.fn(() => stateMocks.getCurrentTheme()),
  onChange: stateMocks.onChange,
  exportSnapshot: stateMocks.exportSnapshot,
  importSnapshot: stateMocks.importSnapshot,
  resetToDefaults: stateMocks.resetToDefaults,
}));

vi.mock('@runtypelabs/persona', () => ({
  generateCodeSnippet: vi.fn((config: unknown, format: string) => JSON.stringify({ format, config })),
  createTheme: vi.fn((theme: unknown) => theme),
}));

import { toggleExport, closeExport, isExportOpen } from './export';

describe('export dropdown behavior', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="export-dropdown" class="toolbar-menu export-dropdown hidden"></div>
    `;
    stateMocks.setCurrentConfig({ apiUrl: 'https://api.example.com', flowId: 'flow-1' });
    stateMocks.clearChangeListener();
    stateMocks.onChange.mockClear();
    stateMocks.exportSnapshot.mockClear();
    stateMocks.importSnapshot.mockClear();
    stateMocks.resetToDefaults.mockClear();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    // Reset export state
    if (isExportOpen()) closeExport();
  });

  test('toggleExport opens dropdown and renders content', () => {
    const dropdown = document.getElementById('export-dropdown')!;
    expect(dropdown.classList.contains('hidden')).toBe(true);

    toggleExport();

    expect(dropdown.classList.contains('hidden')).toBe(false);
    expect(isExportOpen()).toBe(true);
    expect(dropdown.querySelector('#code-format-select')).not.toBeNull();
    expect(dropdown.querySelector('#copy-code-btn')).not.toBeNull();
    expect(dropdown.querySelector('#copy-json-btn')).not.toBeNull();
    expect(dropdown.querySelector('#load-json-btn')).not.toBeNull();
    expect(dropdown.querySelector('#reset-defaults-btn')).not.toBeNull();
    expect(dropdown.querySelector('#export-preset-name')).not.toBeNull();
  });

  test('toggleExport closes dropdown when already open', () => {
    toggleExport(); // open
    expect(isExportOpen()).toBe(true);

    toggleExport(); // close
    expect(isExportOpen()).toBe(false);
    const dropdown = document.getElementById('export-dropdown')!;
    expect(dropdown.classList.contains('hidden')).toBe(true);
  });

  test('closeExport closes the dropdown', () => {
    toggleExport(); // open
    closeExport();

    expect(isExportOpen()).toBe(false);
    const dropdown = document.getElementById('export-dropdown')!;
    expect(dropdown.classList.contains('hidden')).toBe(true);
  });

  test('refreshes code preview when configurator state changes', () => {
    toggleExport();

    const dropdown = document.getElementById('export-dropdown')!;
    const code = dropdown.querySelector('#code-preview code');
    expect(code?.textContent).toContain('flow-1');

    stateMocks.setCurrentConfig({ ...stateMocks.getCurrentConfig(), flowId: 'flow-2' });
    stateMocks.getChangeListener()?.();

    expect(code?.textContent).toContain('flow-2');
  });

  test('copies full config snapshot json', async () => {
    toggleExport();

    const dropdown = document.getElementById('export-dropdown')!;
    const copyJsonBtn = dropdown.querySelector('#copy-json-btn') as HTMLButtonElement;
    await copyJsonBtn.click();

    expect(stateMocks.exportSnapshot).toHaveBeenCalled();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      JSON.stringify(
        {
          version: 2,
          config: stateMocks.getCurrentConfig(),
          theme: stateMocks.getCurrentTheme(),
        },
        null,
        2
      )
    );
  });
});
