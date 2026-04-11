// @vitest-environment jsdom

import { describe, expect, test, vi, beforeEach } from 'vitest';

const mockCreateAgentExperience = vi.fn(() => ({
  update: vi.fn(),
  destroy: vi.fn(),
  open: vi.fn(),
  close: vi.fn(),
  toggle: vi.fn(),
  clearChat: vi.fn(),
  clearArtifacts: vi.fn(),
  upsertArtifact: vi.fn(),
  getState: vi.fn(() => ({
    open: true,
    launcherEnabled: true,
    streaming: false,
    voiceActive: false,
  })),
  on: vi.fn(() => vi.fn()),
}));
const mockCreateWidgetHostLayout = vi.fn((target: HTMLElement, config?: { launcher?: { mountMode?: string } }) => {
  const host = target.ownerDocument.createElement('div');
  host.dataset.mockPersonaPreviewHost = 'true';
  target.appendChild(host);

  return {
    mode: (config?.launcher?.mountMode ?? 'floating') === 'docked' ? 'docked' : 'direct',
    host,
    shell: null,
    syncWidgetState: vi.fn(),
    updateConfig: vi.fn(),
    destroy: vi.fn(() => host.remove()),
  };
});
const fetchMock = vi.fn();

vi.mock('@runtypelabs/persona', () => ({
  default: {},
  createAgentExperience: mockCreateAgentExperience,
  createWidgetHostLayout: mockCreateWidgetHostLayout,
  isDockedMountMode: vi.fn(
    (config?: { launcher?: { mountMode?: string } }) => (config?.launcher?.mountMode ?? 'floating') === 'docked'
  ),
  markdownPostprocessor: vi.fn((x: string) => x),
  DEFAULT_WIDGET_CONFIG: {
    launcher: {
      enabled: true,
      clearChat: {},
      mountMode: 'floating',
      dock: { side: 'right', width: '420px' },
    },
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
  getActiveTheme: vi.fn((config: Record<string, unknown>) => config.theme ?? {}),
  themeToCssVariables: vi.fn(() => ({
    '--persona-background': '#f8fafc',
    '--persona-surface': '#ffffff',
    '--persona-header-bg': '#ffffff',
    '--persona-message-assistant-bg': '#ffffff',
    '--persona-message-assistant-text': '#111827',
    '--persona-message-user-bg': '#171717',
    '--persona-message-user-text': '#ffffff',
    '--persona-primary': '#171717',
  })),
  componentRegistry: { register: vi.fn() },
  generateCodeSnippet: vi.fn(() => 'initAgentWidget({});'),
  widget: {},
}));

vi.mock('../middleware', () => ({
  parseActionResponse: vi.fn(() => null),
}));

vi.mock('../components', () => ({
  DynamicForm: vi.fn(() => document.createElement('div')),
}));

vi.mock('idiomorph', () => ({
  Idiomorph: {
    morph: (element: HTMLElement, html: string) => {
      element.innerHTML = html;
    },
  },
}));

function dispatchPreviewBackgroundMessage(
  mountId: string,
  status: 'loading' | 'loaded' | 'timeout',
  inspection?: {
    accessible: boolean;
    href?: string;
    title?: string;
    text?: string;
    hasBody?: boolean;
    bodyChildCount?: number;
  }
): void {
  const wrapper = document.querySelector<HTMLElement>(
    `.preview-iframe-wrapper[data-mount-id="${mountId}"]`
  );
  expect(wrapper).not.toBeNull();
  const renderToken = Number(wrapper!.dataset.renderToken);

  window.dispatchEvent(
    new MessageEvent('message', {
      data: {
        type: 'persona-theme-preview-background-state',
        mountId,
        renderToken,
        status,
        inspection,
      },
    })
  );
}

function createEmbedCheckResponse(
  verdict: 'allowed' | 'blocked' | 'unknown' = 'allowed',
  reason?: string
) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({ verdict, reason }),
  };
}

async function flushPreviewEmbedCheck(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  if (vi.isFakeTimers()) {
    await vi.advanceTimersByTimeAsync(0);
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('theme configurator shell', () => {
  beforeEach(() => {
    vi.resetModules();
    mockCreateAgentExperience.mockClear();
    mockCreateWidgetHostLayout.mockClear();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(createEmbedCheckResponse('allowed'));
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();
    document.documentElement.className = '';
    document.body.innerHTML = `
      <div id="config-drawer-backdrop" class="config-drawer-backdrop" aria-hidden="true"></div>
      <main class="configurator-layout">
        <header class="mobile-editor-toolbar" aria-label="Theme editor">
          <div class="mobile-editor-toolbar-start">
            <span class="mobile-editor-toolbar-title">Theme Editor</span>
            <span class="mobile-editor-toolbar-subtitle">Tap to edit</span>
          </div>
          <button type="button" id="mobile-form-open-btn" class="mobile-form-open-btn" aria-expanded="false">Form</button>
        </header>
        <aside class="config-panel">
          <div class="config-header">
            <div class="config-header-row">
              <h1>Theme Editor</h1>
              <button type="button" id="config-drawer-close" class="config-drawer-close" aria-label="Close form panel">×</button>
            </div>
          </div>
          <div id="editor-toolbar" class="editor-toolbar">
            <div class="editor-toolbar-group">
              <button type="button" id="undo-btn" class="toolbar-btn toolbar-btn-icon">↶</button>
              <button type="button" id="redo-btn" class="toolbar-btn toolbar-btn-icon">↷</button>
            </div>
            <div class="editor-toolbar-group toolbar-dropdown-group">
              <button type="button" id="presets-btn" class="toolbar-btn">Presets</button>
            </div>
            <div id="presets-menu" class="toolbar-menu hidden"></div>
            <div class="editor-toolbar-spacer"></div>
            <div class="editor-toolbar-group toolbar-dropdown-group">
              <button type="button" id="export-btn" class="toolbar-btn">Actions</button>
              <div id="export-dropdown" class="toolbar-menu export-dropdown hidden"></div>
            </div>
          </div>
          <div class="editor-panel-card">
            <div class="search-section">
              <input type="text" id="field-search" class="search-input" />
              <button type="button" id="clear-search" class="clear-search-btn"></button>
              <div id="search-results" class="search-results hidden"></div>
            </div>
            <nav class="editor-tabs" id="editor-tabs">
              <button type="button" class="editor-tab active" data-tab="style">Style</button>
              <button type="button" class="editor-tab" data-tab="configure">Configure</button>
            </nav>
            <div class="tab-panel active" data-tab-panel="style">
              <p class="group-description">Colors, typography, shape, and visual design.</p>
              <div id="style-summary" class="group-content">
                <div id="style-group" class="group-content"></div>
              </div>
              <div id="style-drilldown" class="drilldown-container hidden">
                <button type="button" id="drilldown-back-btn" class="drilldown-back-btn">Back to Style</button>
                <div class="drilldown-header">
                  <h3 id="drilldown-title" class="drilldown-title"></h3>
                  <div class="drilldown-editing-toggle hidden" id="drilldown-editing-toggle">
                    <div class="editor-control-stack">
                      <div class="editor-control-label">Editing Tokens</div>
                      <div class="segmented-control" id="editing-theme-toggle" data-control="editing">
                        <button type="button" class="segment-btn" data-value="light">Light</button>
                        <button type="button" class="segment-btn" data-value="dark">Dark</button>
                      </div>
                    </div>
                  </div>
                </div>
                <div id="drilldown-content" class="group-content"></div>
              </div>
            </div>
            <div class="tab-panel" data-tab-panel="configure">
              <p class="group-description">Content, layout, and widget behavior.</p>
              <div id="configure-group" class="group-content"></div>
            </div>
          </div>
        </aside>
        <section class="preview-panel">
          <div class="preview-canvas-toolbar" aria-label="Preview toolbar">
            <div class="preview-toolbar-lead">
              <div id="preview-device-toggle" class="segmented-control preview-icon-toggle" data-control="preview-device">
                <button type="button" class="segment-btn" data-value="desktop" aria-label="Desktop preview" title="Desktop preview">Desktop</button>
                <button type="button" class="segment-btn" data-value="mobile" aria-label="Mobile preview" title="Mobile preview">Mobile</button>
              </div>
            </div>
            <div class="preview-url-bar" id="preview-url-bar">
              <input type="url" id="preview-bg-url" class="preview-url-input" placeholder="https://yoursite.com" aria-label="Background website URL" />
              <span id="preview-url-badge" class="preview-url-badge" hidden></span>
              <button type="button" id="preview-bg-url-clear" class="preview-url-clear" title="Clear URL" aria-label="Clear URL" style="display:none"></button>
            </div>
            <div class="preview-toolbar-trail">
              <div id="preview-control-actions" class="preview-control-actions">
                <div class="editor-control-stack preview-control-stack">
                  <div class="editor-control-label">Scene</div>
                  <select id="preview-scene-select" class="preview-select preview-select-pill preview-select-scene" aria-label="Preview scene">
                    <option value="conversation">Conversation</option>
                    <option value="home">Home</option>
                    <option value="minimized">Minimized</option>
                  </select>
                </div>
                <div class="editor-control-stack preview-control-stack">
                  <div class="editor-control-label">Preview Theme</div>
                  <div id="preview-theme-toggle" class="segmented-control preview-theme-toggle" data-control="preview-theme">
                    <button type="button" class="segment-btn preview-theme-btn" data-value="system" aria-label="System theme" title="System theme">
                      <svg class="preview-theme-icon" aria-hidden="true"></svg>
                      <span class="visually-hidden">System</span>
                    </button>
                    <button type="button" class="segment-btn preview-theme-btn" data-value="light" aria-label="Light theme" title="Light theme">
                      <svg class="preview-theme-icon" aria-hidden="true"></svg>
                      <span class="visually-hidden">Light</span>
                    </button>
                    <button type="button" class="segment-btn preview-theme-btn" data-value="dark" aria-label="Dark theme" title="Dark theme">
                      <svg class="preview-theme-icon" aria-hidden="true"></svg>
                      <span class="visually-hidden">Dark</span>
                    </button>
                  </div>
                </div>
                <div class="editor-control-stack preview-control-stack preview-control-stack-compare">
                  <div class="editor-control-label">Compare</div>
                  <div class="preview-compare-control-row">
                    <div id="compare-mode-toggle" class="preview-pill-scene-grid" role="radiogroup" aria-label="Compare mode">
                      <button type="button" class="preview-pill-scene-btn active" data-compare="off" role="radio" aria-checked="true">Off</button>
                      <button type="button" class="preview-pill-scene-btn" data-compare="baseline" role="radio" aria-checked="false">Changes</button>
                      <button type="button" class="preview-pill-scene-btn" data-compare="themes" role="radio" aria-checked="false">Light vs Dark</button>
                    </div>
                    <button type="button" id="update-baseline-btn" class="preview-toggle-btn preview-baseline-btn hidden">Update baseline</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        <div id="contrast-summary" class="contrast-summary hidden"></div>
          <div id="mobile-inline-hint" class="preview-inline-hint" role="note" aria-hidden="true"></div>
          <div class="preview-stage-wrapper">
            <div id="preview-stage"></div>
          </div>
          <div class="preview-status-bar">
            <div class="preview-status-bar-start">
              <button type="button" id="contrast-btn" class="preview-zoom-btn preview-contrast-toggle" aria-label="Toggle contrast ratio summary" aria-pressed="false"></button>
              <span class="preview-status-label"></span>
            </div>
            <div class="preview-zoom-controls">
              <button type="button" id="zoom-out-btn" class="preview-zoom-btn">-</button>
              <button type="button" id="zoom-level" class="preview-zoom-level">100%</button>
              <button type="button" id="zoom-in-btn" class="preview-zoom-btn">+</button>
              <button type="button" id="zoom-fit-btn" class="preview-zoom-btn preview-zoom-btn-fit">Fit</button>
            </div>
          </div>
        </section>
      </main>
      <div id="wizard-overlay" class="wizard-overlay hidden">
        <div class="wizard-dialog">
          <input type="color" id="wizard-color-input" value="#171717" />
          <input type="text" id="wizard-color-text" value="#171717" />
          <button type="button" id="wizard-cancel-btn">Cancel</button>
          <button type="button" id="wizard-apply-btn">Generate</button>
        </div>
      </div>
      <div id="editor-toast" class="editor-toast hidden"></div>
    `;
  });

  test('initializes grouped sections and preview shell', async () => {
    await import('./index');

    expect(document.querySelectorAll('[data-section-id]').length).toBeGreaterThan(4);
    // Style tab has V2 sections: brand palette, theme mode, interface roles, etc.
    expect(document.querySelector('#style-group [data-section-id="brand-palette-v2"]')).not.toBeNull();
    expect(document.querySelector('#style-group [data-section-id="theme-mode-v2"]')).not.toBeNull();
    // Configure tab has content sections with sub-group dividers
    expect(document.querySelector('#configure-group [data-section-id="copy"]')).not.toBeNull();
    expect(document.querySelector('#configure-group .subgroup-divider')).not.toBeNull();
    // Preview uses iframe with widget mount
    const iframe = document.querySelector('iframe[data-mount-id="preview-current"]');
    expect(iframe).not.toBeNull();
    expect((iframe as HTMLIFrameElement).srcdoc).toContain('preview-current');
  });

  test('mobile form drawer toggles body class and aria state', async () => {
    await import('./index');

    const openBtn = document.getElementById('mobile-form-open-btn') as HTMLButtonElement | null;
    const backdrop = document.getElementById('config-drawer-backdrop');
    expect(openBtn).not.toBeNull();
    expect(backdrop).not.toBeNull();

    openBtn!.click();
    expect(document.body.classList.contains('config-drawer-open')).toBe(true);
    expect(backdrop!.getAttribute('aria-hidden')).toBe('false');
    expect(openBtn!.getAttribute('aria-expanded')).toBe('true');

    backdrop!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.body.classList.contains('config-drawer-open')).toBe(false);
    expect(backdrop!.getAttribute('aria-hidden')).toBe('true');
    expect(openBtn!.getAttribute('aria-expanded')).toBe('false');
  });

  test('mobile form drawer traps Tab between first and last focusable', async () => {
    await import('./index');

    const panel = document.querySelector('.config-panel');
    const openBtn = document.getElementById('mobile-form-open-btn') as HTMLButtonElement | null;
    expect(panel).not.toBeNull();
    expect(openBtn).not.toBeNull();

    const listFocusables = (): HTMLElement[] =>
      Array.from(
        panel!.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => {
        if (el.getAttribute('aria-hidden') === 'true') return false;
        const style = window.getComputedStyle(el);
        return style.visibility !== 'hidden' && style.display !== 'none';
      });

    openBtn!.click();
    await new Promise((r) => setTimeout(r, 0));

    const focusables = listFocusables();
    expect(focusables.length).toBeGreaterThan(1);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    last.focus();
    last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(first);

    first.focus();
    first.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }),
    );
    expect(document.activeElement).toBe(last);
  });

  test('toolbar buttons and reorganized preview controls exist in the new shell', async () => {
    await import('./index');

    const compareModeToggle = document.getElementById('compare-mode-toggle');
    const contrastBtn = document.getElementById('contrast-btn');
    const exportBtn = document.getElementById('export-btn');

    expect(document.getElementById('undo-btn')).not.toBeNull();
    expect(document.getElementById('redo-btn')).not.toBeNull();
    expect(document.getElementById('presets-btn')).not.toBeNull();
    expect(compareModeToggle).not.toBeNull();
    expect(document.getElementById('update-baseline-btn')).not.toBeNull();
    expect(contrastBtn).not.toBeNull();
    expect(exportBtn).not.toBeNull();
    expect(document.getElementById('editing-theme-toggle')).not.toBeNull();
    expect(document.getElementById('preview-device-toggle')).not.toBeNull();
    expect(document.getElementById('preview-scene-select')).not.toBeNull();
    expect(document.getElementById('preview-theme-toggle')).not.toBeNull();
    expect(compareModeToggle?.closest('.preview-canvas-toolbar')).not.toBeNull();
    expect(contrastBtn?.closest('.preview-status-bar')).not.toBeNull();
    expect(exportBtn?.textContent?.trim()).toBe('Actions');
  });

  test('preview scene select uses the same compact rail styling', async () => {
    await import('./index');

    const sceneSelect = document.getElementById('preview-scene-select');
    expect(sceneSelect).not.toBeNull();
    expect(sceneSelect?.classList.contains('preview-select-pill')).toBe(true);
    expect(sceneSelect?.classList.contains('preview-select-scene')).toBe(true);
    expect(sceneSelect?.getAttribute('aria-label')).toBe('Preview scene');
  });

  test('editing toggle lives inside drill-down area', async () => {
    await import('./index');

    const toggle = document.getElementById('editing-theme-toggle');
    expect(toggle).not.toBeNull();
    expect(toggle!.closest('.drilldown-header')).not.toBeNull();

    const label = toggle!.closest('.editor-control-stack')?.querySelector('.editor-control-label');
    expect(label?.textContent?.trim()).toBe('Editing Tokens');
  });

  test('preview theme mode uses an icon segmented control', async () => {
    await import('./index');

    const themeButtons = Array.from(
      document.querySelectorAll<HTMLButtonElement>('#preview-theme-toggle .segment-btn')
    );
    expect(themeButtons.map((button) => button.dataset.value)).toEqual(['system', 'light', 'dark']);
    expect(themeButtons.find((button) => button.classList.contains('active'))?.dataset.value).toBe('system');
    expect(themeButtons.map((button) => button.getAttribute('title'))).toEqual([
      'System theme',
      'Light theme',
      'Dark theme',
    ]);
    expect(themeButtons.every((button) => button.querySelector('.preview-theme-icon'))).toBe(true);
  });

  test('preview icon controls expose tooltips for each icon button', async () => {
    await import('./index');

    const deviceButtons = Array.from(
      document.querySelectorAll<HTMLButtonElement>('#preview-device-toggle .segment-btn')
    );

    expect(deviceButtons).toHaveLength(2);
    expect(deviceButtons.map((button) => button.getAttribute('title'))).toEqual([
      'Desktop preview',
      'Mobile preview',
    ]);
  });

  test('preview no longer renders title and subtitle copy', async () => {
    await import('./index');

    expect(document.querySelector('.preview-header')).toBeNull();
    expect(document.querySelector('.preview-subtitle')).toBeNull();
    expect(document.body.textContent).not.toContain('See your changes in real time across devices, scenes, and theme modes.');
  });

  test('preview theme segmented control syncs from store', async () => {
    const state = await import('./state');
    await import('./index');

    const getActiveTheme = () =>
      document.querySelector<HTMLButtonElement>('#preview-theme-toggle .segment-btn.active')?.dataset.value;
    expect(getActiveTheme()).toBe('system');

    state.setPreviewMode('dark');

    expect(getActiveTheme()).toBe('dark');
  });

  test('clicking preview theme segmented control updates store', async () => {
    const state = await import('./state');
    await import('./index');

    const clickTheme = (value: 'system' | 'light' | 'dark') => {
      const button = document.querySelector<HTMLButtonElement>(
        `#preview-theme-toggle .segment-btn[data-value="${value}"]`
      );
      expect(button).not.toBeNull();
      button!.click();
    };

    expect(state.getPreviewMode()).toBe('system');

    clickTheme('light');
    expect(state.getPreviewMode()).toBe('light');

    clickTheme('dark');
    expect(state.getPreviewMode()).toBe('dark');

    clickTheme('system');
    expect(state.getPreviewMode()).toBe('system');
  });

  test('preview footer contrast toggle shows summary and pressed state', async () => {
    await import('./index');

    const contrastBtn = document.getElementById('contrast-btn') as HTMLButtonElement;
    const contrastSummary = document.getElementById('contrast-summary');

    expect(contrastBtn?.closest('.preview-status-bar-start')).not.toBeNull();
    expect(contrastSummary?.classList.contains('hidden')).toBe(true);
    expect(contrastBtn.getAttribute('aria-pressed')).toBe('false');

    contrastBtn.click();
    expect(contrastBtn.getAttribute('aria-pressed')).toBe('true');
    expect(contrastBtn.classList.contains('active')).toBe(true);
    expect(contrastSummary).not.toBeNull();
  });

  test('clicking preview device toggle swaps between desktop and mobile preview shells', async () => {
    const state = await import('./state');
    await import('./index');

    expect(state.getPreviewDevice()).toBe('desktop');
    expect(document.querySelector('.preview-iframe-wrapper:not(.preview-iframe-wrapper-mobile)')).not.toBeNull();
    expect(document.querySelector('.preview-iframe-wrapper-mobile')).toBeNull();

    const mobileButton = document.querySelector<HTMLButtonElement>(
      '#preview-device-toggle .segment-btn[data-value="mobile"]'
    );
    expect(mobileButton).not.toBeNull();

    mobileButton!.click();

    expect(state.getPreviewDevice()).toBe('mobile');
    expect(document.querySelector('.preview-iframe-wrapper-mobile')).not.toBeNull();
    const mobileWrapper = document.querySelector('.preview-iframe-wrapper-mobile') as HTMLElement;
    expect(mobileWrapper?.dataset.device).toBe('mobile');
  });

  test('minimized scene renders compact launcher preview path', async () => {
    const state = await import('./state');
    await import('./index');

    const sceneSelect = document.getElementById('preview-scene-select') as HTMLSelectElement;
    expect(sceneSelect).not.toBeNull();
    sceneSelect.value = 'minimized';
    sceneSelect.dispatchEvent(new Event('change'));

    expect(state.getPreviewScene()).toBe('minimized');
    expect(document.querySelector('.preview-launcher-canvas')).not.toBeNull();
    expect(document.querySelector('.preview-single.preview-launcher-canvas')).not.toBeNull();
    const iframe = document.querySelector('iframe[data-mount-id="preview-current"]') as HTMLIFrameElement | null;
    expect(iframe).not.toBeNull();
    expect(iframe!.srcdoc).toContain('preview-iframe-mock');
  });

  test('docked preview renders a workspace shell and layout signature', async () => {
    const state = await import('./state');
    await import('./index');

    state.setImmediate('launcher.mountMode', 'docked');
    state.setImmediate('launcher.dock.side', 'left');
    state.setImmediate('launcher.dock.width', '480px');

    const wrapper = document.querySelector<HTMLElement>(
      '.preview-iframe-wrapper[data-mount-id="preview-current"]'
    );
    const iframe = document.querySelector<HTMLIFrameElement>('iframe[data-mount-id="preview-current"]');

    expect(wrapper).not.toBeNull();
    expect(wrapper?.dataset.layoutSignature).toContain('docked:left:480px');
    expect(iframe).not.toBeNull();
    expect(iframe!.srcdoc).toContain('preview-workspace-shell');
    expect(iframe!.srcdoc).toMatch(/\.preview-workspace-shell \{[^}]*height: 100%/);
    expect(iframe!.srcdoc).toContain('id="preview-content-preview-current"');
    expect(iframe!.srcdoc).not.toContain('z-index:9999');
  });

  test('docked preview places background iframe inside the wrapped content pane', async () => {
    const state = await import('./state');
    await import('./index');

    state.setImmediate('launcher.mountMode', 'docked');
    state.setPreviewBackgroundUrl('https://example.com');
    await flushPreviewEmbedCheck();

    const iframe = document.querySelector<HTMLIFrameElement>('iframe[data-mount-id="preview-current"]');
    expect(iframe).not.toBeNull();
    expect(iframe!.srcdoc).toContain('preview-workspace-content');
    expect(iframe!.srcdoc).toContain('id="preview-content-preview-current"');
    expect(iframe!.srcdoc).toMatch(/\.preview-workspace-content \{[^}]*height: 100%/);
    expect(iframe!.srcdoc).toContain('src="https://example.com"');
    expect(iframe!.srcdoc).not.toContain('<div style="position:fixed;inset:0;z-index:9999;">');
  });

  test('preview uses iframe-based layout with mock page and widget mount', async () => {
    await import('./index');

    expect(document.querySelector('.preview-single')).not.toBeNull();
    const wrapper = document.querySelector('.preview-iframe-wrapper');
    expect(wrapper).not.toBeNull();
    const iframe = wrapper?.querySelector('iframe[data-mount-id="preview-current"]');
    expect(iframe).not.toBeNull();
    expect((iframe as HTMLIFrameElement).getAttribute('sandbox')).toContain('allow-scripts allow-same-origin');
    expect((iframe as HTMLIFrameElement).srcdoc).toBeTruthy();
  });

  test('preview background helper functions derive mock visibility and status labels', async () => {
    const index = await import('./index');

    expect(index.shouldRenderMockPreviewShell(false, 'none')).toBe(true);
    expect(index.shouldRenderMockPreviewShell(true, 'checking')).toBe(true);
    expect(index.shouldRenderMockPreviewShell(true, 'loading')).toBe(false);
    expect(index.shouldRenderMockPreviewShell(true, 'loaded')).toBe(false);
    expect(index.shouldRenderMockPreviewShell(true, 'blocked')).toBe(true);
    expect(index.shouldRenderMockPreviewShell(true, 'timeout')).toBe(true);

    expect(index.getPreviewBackgroundStatusLabel(['none'], false)).toBe('');
    expect(index.getPreviewBackgroundStatusLabel(['checking'], true)).toBe('Checking preview site…');
    expect(index.getPreviewBackgroundStatusLabel(['loading'], true)).toBe('Loading preview site…');
    expect(index.getPreviewBackgroundStatusLabel(['blocked'], true)).toBe('');
    expect(index.getPreviewBackgroundStatusLabel(['timeout'], true)).toBe(
      "Couldn't display this page. Showing mock preview."
    );
    expect(index.getPreviewBackgroundStatusLabel(['loaded', 'timeout'], true)).toBe(
      'Some preview frames could not display this page. Showing mock fallback where needed.'
    );
    expect(index.getPreviewBackgroundBadgeLabel(['blocked'], 'https://vercel.com')).toBe(
      'Iframe preview blocked'
    );
    expect(
      index.inferPreviewBackgroundStateFromInspection(
        {
          accessible: true,
          href: 'chrome-error://chromewebdata/',
          text: 'This page has been blocked by X-Frame-Options',
          hasBody: true,
          bodyChildCount: 1,
        },
        'loaded'
      )
    ).toBe('timeout');
    expect(
      index.inferPreviewBackgroundStateFromInspection(
        {
          accessible: false,
        },
        'loaded'
      )
    ).toBe('loaded');
  });

  test('preview theme segmented control rebuilds iframe shell styles for dark and light modes', async () => {
    const state = await import('./state');
    await import('./index');

    const clickTheme = (value: 'system' | 'light' | 'dark') => {
      const button = document.querySelector<HTMLButtonElement>(
        `#preview-theme-toggle .segment-btn[data-value="${value}"]`
      );
      expect(button).not.toBeNull();
      button!.click();
    };
    const getWrapper = () =>
      document.querySelector<HTMLElement>('.preview-iframe-wrapper[data-mount-id="preview-current"]');
    const getIframe = () =>
      document.querySelector<HTMLIFrameElement>('iframe[data-mount-id="preview-current"]');

    expect(getWrapper()?.dataset.shellMode).toBe('light');
    expect(getIframe()?.srcdoc).toContain('color-scheme: light');
    expect(getIframe()?.srcdoc).toContain('background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)');

    clickTheme('dark');

    expect(state.getPreviewMode()).toBe('dark');
    expect(getWrapper()?.dataset.shellMode).toBe('dark');
    expect(getIframe()?.srcdoc).toContain('color-scheme: dark');
    expect(getIframe()?.srcdoc).toContain('background: linear-gradient(180deg, #0f172a 0%, #020617 100%)');
    expect(getIframe()?.srcdoc).toContain('background: #111827');

    clickTheme('system');

    expect(state.getPreviewMode()).toBe('system');
    expect(getWrapper()?.dataset.shellMode).toBe('light');
    expect(getIframe()?.srcdoc).toContain('color-scheme: light');
    expect(getIframe()?.srcdoc).toContain('background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)');
  });

  test('baseline compare mode shares shell chrome; widget configs can diverge', async () => {
    const state = await import('./state');
    await import('./index');

    document.querySelector<HTMLButtonElement>('[data-compare="baseline"]')!.click();

    expect(document.querySelectorAll('iframe[data-mount-id]')).toHaveLength(2);
    expect(document.querySelector('.preview-frame-label')?.textContent).toBe('Baseline');
    expect(document.getElementById('update-baseline-btn')?.classList.contains('hidden')).toBe(false);

    state.setImmediate('colorScheme', 'dark');

    const baselineWrapper = document.querySelector<HTMLElement>(
      '.preview-iframe-wrapper[data-mount-id="preview-baseline"]'
    );
    const currentWrapper = document.querySelector<HTMLElement>(
      '.preview-iframe-wrapper[data-mount-id="preview-current"]'
    );
    const baselineIframe = document.querySelector<HTMLIFrameElement>(
      'iframe[data-mount-id="preview-baseline"]'
    );
    const currentIframe = document.querySelector<HTMLIFrameElement>(
      'iframe[data-mount-id="preview-current"]'
    );

    // Shell chrome follows editor preview mode only (both panes share system/light here).
    expect(baselineWrapper?.dataset.shellMode).toBe('light');
    expect(currentWrapper?.dataset.shellMode).toBe('light');
    expect(baselineIframe?.srcdoc).toContain('color-scheme: light');
    expect(currentIframe?.srcdoc).toContain('color-scheme: light');
  });

  test('light vs dark compare disables preview theme toggle and labels panes explicitly', async () => {
    const state = await import('./state');
    await import('./index');

    const previewThemeToggle = document.getElementById('preview-theme-toggle') as HTMLElement;
    const previewThemeButtons = Array.from(
      document.querySelectorAll<HTMLButtonElement>('#preview-theme-toggle .segment-btn')
    );

    state.setPreviewMode('dark');
    document.querySelector<HTMLButtonElement>('[data-compare="themes"]')!.click();

    const mountIds = Array.from(
      document.querySelectorAll<HTMLIFrameElement>('iframe[data-mount-id]')
    ).map((iframe) => iframe.dataset.mountId);
    const paneLabels = Array.from(document.querySelectorAll('.preview-frame-label')).map(
      (label) => label.textContent?.trim()
    );

    expect(mountIds).toEqual(['preview-light', 'preview-dark']);
    expect(paneLabels).toEqual(['Light', 'Dark']);
    expect(previewThemeToggle.classList.contains('is-disabled')).toBe(true);
    expect(previewThemeButtons.every((button) => button.disabled)).toBe(true);

    previewThemeButtons[0].click();
    expect(state.getPreviewMode()).toBe('dark');
    expect(document.getElementById('update-baseline-btn')?.classList.contains('hidden')).toBe(true);
  });

  test('presets menu renders visual cards and applies the clicked preset', async () => {
    await import('./index');

    const presetsBtn = document.getElementById('presets-btn') as HTMLButtonElement;
    const menu = document.getElementById('presets-menu') as HTMLElement;

    presetsBtn.click();

    const cards = Array.from(
      menu.querySelectorAll<HTMLButtonElement>('.preset-visual-card')
    );
    expect(menu.classList.contains('hidden')).toBe(false);
    expect(cards.length).toBeGreaterThan(0);
    expect(cards[0].querySelector('.preset-visual-preview')).not.toBeNull();
    expect(menu.querySelector('.preset-generate-cta')).not.toBeNull();

    cards[0].click();
    expect(menu.classList.contains('hidden')).toBe(true);
    expect(document.getElementById('editor-toast')?.textContent).toContain('Applied preset:');
  });

  test('each tab has a guidance description', async () => {
    await import('./index');

    const descriptions = Array.from(document.querySelectorAll('.group-description')).map(
      (el) => el.textContent?.trim()
    );

    expect(descriptions).toHaveLength(2);
    expect(descriptions[0]).toContain('Colors');
    expect(descriptions[1]).toContain('Content');
  });

  test('tab navigation shows one panel at a time', async () => {
    await import('./index');

    // Style tab is active by default
    const tabs = document.querySelectorAll('.editor-tab');
    expect(tabs).toHaveLength(2);
    expect(tabs[0].classList.contains('active')).toBe(true);
    expect(tabs[0].textContent).toBe('Style');

    // Only style panel is active
    const activePanel = document.querySelector('.tab-panel.active') as HTMLElement;
    expect(activePanel).not.toBeNull();
    expect(activePanel.dataset.tabPanel).toBe('style');

    // Click the Configure tab
    (tabs[1] as HTMLElement).click();

    const newActivePanel = document.querySelector('.tab-panel.active') as HTMLElement;
    expect(newActivePanel.dataset.tabPanel).toBe('configure');
    expect(tabs[0].classList.contains('active')).toBe(false);
    expect(tabs[1].classList.contains('active')).toBe(true);
  });

  test('srcdoc shows real page only and loading status when URL is set', async () => {
    const state = await import('./state');
    await import('./index');

    state.setPreviewBackgroundUrl('https://example.com');

    const sceneSelect = document.getElementById('preview-scene-select') as HTMLSelectElement;
    sceneSelect.value = 'conversation';
    sceneSelect.dispatchEvent(new Event('change'));

    const iframe = document.querySelector<HTMLIFrameElement>('iframe[data-mount-id="preview-current"]');
    const statusLabel = document.querySelector<HTMLElement>('.preview-status-label');
    const checkingOverlay = document.querySelector<HTMLElement>('.preview-background-overlay-label');
    expect(iframe).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/preview/embed-check?url=https%3A%2F%2Fexample.com',
      expect.any(Object)
    );
    expect(iframe!.srcdoc).not.toContain('src="https://example.com"');
    expect(iframe!.srcdoc).toContain('<div class="preview-iframe-mock"');
    expect(checkingOverlay?.textContent).toBe('Checking preview site...');
    expect(statusLabel?.textContent).toBe('Checking preview site…');

    await flushPreviewEmbedCheck();

    const updatedIframe = document.querySelector<HTMLIFrameElement>('iframe[data-mount-id="preview-current"]');
    const loadingOverlay = document.querySelector<HTMLElement>('.preview-background-overlay-label');
    expect(updatedIframe).not.toBeNull();
    expect(updatedIframe!.srcdoc).toContain('src="https://example.com"');
    expect(updatedIframe!.srcdoc).not.toContain('<div class="preview-iframe-mock"');
    expect(updatedIframe!.srcdoc).toContain("message('loading')");
    expect(updatedIframe!.srcdoc).toContain("window.addEventListener('securitypolicyviolation'");
    expect(updatedIframe!.srcdoc).toContain('z-index:9999');
    expect(loadingOverlay?.textContent).toBe('Loading preview site...');
    expect(statusLabel?.textContent).toBe('Loading preview site…');
  });

  test('loaded preview background message clears status without restoring mock shell', async () => {
    const state = await import('./state');
    await import('./index');

    state.setPreviewBackgroundUrl('https://example.com');

    const sceneSelect = document.getElementById('preview-scene-select') as HTMLSelectElement;
    sceneSelect.value = 'conversation';
    sceneSelect.dispatchEvent(new Event('change'));
    await flushPreviewEmbedCheck();

    dispatchPreviewBackgroundMessage('preview-current', 'loaded');

    const iframe = document.querySelector<HTMLIFrameElement>('iframe[data-mount-id="preview-current"]');
    const statusLabel = document.querySelector<HTMLElement>('.preview-status-label');
    const overlay = document.querySelector<HTMLElement>('.preview-background-overlay');
    expect(iframe).not.toBeNull();
    expect(iframe!.srcdoc).not.toContain('<div class="preview-iframe-mock"');
    expect(overlay).toBeNull();
    expect(statusLabel?.textContent).toBe('');
  });

  test('loaded preview background message falls back when inspection matches a browser error page', async () => {
    const state = await import('./state');
    await import('./index');

    state.setPreviewBackgroundUrl('https://vercel.com');

    const sceneSelect = document.getElementById('preview-scene-select') as HTMLSelectElement;
    sceneSelect.value = 'conversation';
    sceneSelect.dispatchEvent(new Event('change'));
    await flushPreviewEmbedCheck();

    dispatchPreviewBackgroundMessage('preview-current', 'loaded', {
      accessible: true,
      href: 'chrome-error://chromewebdata/',
      title: 'This page has been blocked',
      text: 'https://vercel.com refused to connect',
      hasBody: true,
      bodyChildCount: 1,
    });

    const iframe = document.querySelector<HTMLIFrameElement>('iframe[data-mount-id="preview-current"]');
    const statusLabel = document.querySelector<HTMLElement>('.preview-status-label');
    const overlayLabel = document.querySelector<HTMLElement>('.preview-background-overlay-label');
    const overlayDescription = document.querySelector<HTMLElement>('.preview-background-overlay-description');
    expect(iframe).not.toBeNull();
    expect(iframe!.srcdoc).toContain('<div class="preview-iframe-mock"');
    expect(overlayLabel?.textContent).toBe('Preview unavailable');
    expect(overlayDescription?.textContent).toBe('We could not load this page. Showing mock preview instead.');
    expect(statusLabel?.textContent).toBe("Couldn't display this page. Showing mock preview.");
  });

  test('timed-out preview background message restores mock fallback and status', async () => {
    vi.useFakeTimers();

    try {
      const state = await import('./state');
      await import('./index');

      state.setPreviewBackgroundUrl('https://example.com');

      const sceneSelect = document.getElementById('preview-scene-select') as HTMLSelectElement;
      sceneSelect.value = 'conversation';
      sceneSelect.dispatchEvent(new Event('change'));
      await flushPreviewEmbedCheck();

      dispatchPreviewBackgroundMessage('preview-current', 'timeout');

      const iframe = document.querySelector<HTMLIFrameElement>('iframe[data-mount-id="preview-current"]');
      const statusLabel = document.querySelector<HTMLElement>('.preview-status-label');
      const overlayLabel = document.querySelector<HTMLElement>('.preview-background-overlay-label');
      const overlayDescription = document.querySelector<HTMLElement>('.preview-background-overlay-description');
      expect(iframe).not.toBeNull();
      expect(iframe!.srcdoc).toContain('<div class="preview-iframe-mock"');
      expect(overlayLabel?.textContent).toBe('Preview unavailable');
      expect(overlayDescription?.textContent).toBe('We could not load this page. Showing mock preview instead.');
      expect(statusLabel?.textContent).toBe("Couldn't display this page. Showing mock preview.");

      await vi.advanceTimersByTimeAsync(3000);

      expect(document.querySelector('.preview-background-overlay')).toBeNull();
      expect(statusLabel?.textContent).toBe("Couldn't display this page. Showing mock preview.");
    } finally {
      vi.useRealTimers();
    }
  });

  test('baseline compare mode keeps fallback only on frames that time out', async () => {
    const state = await import('./state');
    await import('./index');

    state.setPreviewBackgroundUrl('https://example.com');
    document.querySelector<HTMLButtonElement>('[data-compare="baseline"]')!.click();
    await flushPreviewEmbedCheck();

    dispatchPreviewBackgroundMessage('preview-current', 'loaded');
    dispatchPreviewBackgroundMessage('preview-baseline', 'timeout');

    const baselineIframe = document.querySelector<HTMLIFrameElement>(
      'iframe[data-mount-id="preview-baseline"]'
    );
    const currentIframe = document.querySelector<HTMLIFrameElement>(
      'iframe[data-mount-id="preview-current"]'
    );
    const statusLabel = document.querySelector<HTMLElement>('.preview-status-label');

    expect(baselineIframe).not.toBeNull();
    expect(currentIframe).not.toBeNull();
    expect(baselineIframe!.srcdoc).toContain('<div class="preview-iframe-mock"');
    expect(currentIframe!.srcdoc).not.toContain('<div class="preview-iframe-mock"');
    expect(statusLabel?.textContent).toBe(
      'Some preview frames could not display this page. Showing mock fallback where needed.'
    );
  });

  test('preview URL input normalizes bare domains to https', async () => {
    const state = await import('./state');
    await import('./index');

    const bgUrlInput = document.getElementById('preview-bg-url') as HTMLInputElement | null;
    expect(bgUrlInput).not.toBeNull();

    bgUrlInput!.value = 'runtype.com';
    bgUrlInput!.dispatchEvent(new Event('change'));

    expect(bgUrlInput!.value).toBe('https://runtype.com');
    expect(state.getPreviewBackgroundUrl()).toBe('https://runtype.com');
    await flushPreviewEmbedCheck();

    const iframe = document.querySelector<HTMLIFrameElement>('iframe[data-mount-id="preview-current"]');
    expect(iframe).not.toBeNull();
    expect(iframe!.srcdoc).toContain('src="https://runtype.com"');
  });

  test('blocked preview URL never attempts iframe rendering and shows blocked status', async () => {
    vi.useFakeTimers();

    try {
      fetchMock.mockResolvedValueOnce(createEmbedCheckResponse('blocked', 'csp-frame-ancestors'));

      const state = await import('./state');
      await import('./index');

      state.setPreviewBackgroundUrl('https://vercel.com');

      const sceneSelect = document.getElementById('preview-scene-select') as HTMLSelectElement;
      sceneSelect.value = 'conversation';
      sceneSelect.dispatchEvent(new Event('change'));
      await flushPreviewEmbedCheck();

      const iframe = document.querySelector<HTMLIFrameElement>('iframe[data-mount-id="preview-current"]');
      const statusLabel = document.querySelector<HTMLElement>('.preview-status-label');
      const badge = document.getElementById('preview-url-badge');
      const overlay = document.querySelector<HTMLElement>('.preview-background-overlay');
      const overlayLabel = document.querySelector<HTMLElement>('.preview-background-overlay-label');
      const overlayDescription = document.querySelector<HTMLElement>('.preview-background-overlay-description');
      expect(iframe).not.toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(iframe!.srcdoc).not.toContain('src="https://vercel.com"');
      expect(iframe!.srcdoc).toContain('<div class="preview-iframe-mock"');
      expect(overlay).not.toBeNull();
      expect(overlayLabel?.textContent).toBe('Preview unavailable');
      expect(overlayDescription?.textContent).toBe('This site blocks iframe previews. Showing mock preview instead.');
      expect(statusLabel?.textContent).toBe('');
      expect(badge?.textContent).toBe('Blocked by site CSP');
      expect(badge?.hasAttribute('hidden')).toBe(false);

      await vi.advanceTimersByTimeAsync(3000);

      expect(document.querySelector('.preview-background-overlay')).toBeNull();
      expect(statusLabel?.textContent).toBe('');
      expect(badge?.textContent).toBe('Blocked by site CSP');
    } finally {
      vi.useRealTimers();
    }
  });

  test('srcdoc has no bg iframe when URL is empty', async () => {
    const state = await import('./state');
    await import('./index');

    state.setPreviewBackgroundUrl('');

    const sceneSelect = document.getElementById('preview-scene-select') as HTMLSelectElement;
    sceneSelect.value = 'conversation';
    sceneSelect.dispatchEvent(new Event('change'));

    const iframe = document.querySelector<HTMLIFrameElement>('iframe[data-mount-id="preview-current"]');
    expect(iframe).not.toBeNull();
    expect(iframe!.srcdoc).not.toContain('<iframe src=');
  });

  test('preview URL clear button hides when URL is empty', async () => {
    const state = await import('./state');
    await import('./index');

    const clearBtn = document.getElementById('preview-bg-url-clear') as HTMLElement;
    expect(clearBtn.style.display).toBe('none');

    state.setPreviewBackgroundUrl('https://example.com');
    expect(clearBtn.style.display).toBe('');
  });

  test('new 2-tab layout contains the expected sections', async () => {
    await import('./index');

    const styleSections = Array.from(
      document.querySelectorAll('#style-group [data-section-id]')
    ).map((section) => (section as HTMLElement).dataset.sectionId);

    // V2 outcome-oriented sections
    expect(styleSections).toEqual([
      'theme-mode-v2',
      'brand-palette-v2',
      'status-palette',
      'interface-roles',
      'status-colors',
      'advanced-tokens',
    ]);

    // Configure tab: content, layout, widget, features, developer sub-groups
    expect(document.querySelector('#configure-group [data-section-id="copy"]')).not.toBeNull();
    expect(document.querySelector('#configure-group [data-section-id="suggestions"]')).not.toBeNull();
    expect(document.querySelector('#configure-group [data-section-id="header-layout"]')).not.toBeNull();
    expect(document.querySelector('#configure-group [data-section-id="messages-layout"]')).not.toBeNull();
    expect(document.querySelector('#configure-group [data-section-id="launcher-basics"]')).not.toBeNull();
    expect(document.querySelector('#configure-group [data-section-id="launcher-advanced"]')).not.toBeNull();
    expect(document.querySelector('#configure-group [data-section-id="send-button"]')).not.toBeNull();
    expect(document.querySelector('#configure-group [data-section-id="features"]')).not.toBeNull();
    expect(document.querySelector('#configure-group [data-section-id="attachments-config"]')).not.toBeNull();
    expect(document.querySelector('#configure-group [data-section-id="artifacts-customization"]')).not.toBeNull();
    expect(document.querySelector('#configure-group [data-section-id="api-integration"]')).not.toBeNull();
    expect(document.querySelector('#configure-group [data-section-id="debug-inspection"]')).not.toBeNull();
    expect(document.querySelector('#configure-group [data-section-id="markdown"]')).not.toBeNull();

    expect(document.querySelector('#configure-group [data-section-id="launcher-basics"] .section-header-action')).not.toBeNull();

    // Export is in toolbar, not a tab panel
    expect(document.getElementById('export-btn')).not.toBeNull();
    expect(document.getElementById('export-dropdown')).not.toBeNull();
  });

  test('preview transcript builder injects entries without remounting', async () => {
    await import('./index');

    const addButton = document.querySelector<HTMLButtonElement>(
      '#configure-group [data-section-id="debug-inspection"] [data-preview-transcript-add]'
    );
    const wrapperBefore = document.querySelector<HTMLElement>(
      '.preview-iframe-wrapper[data-mount-id="preview-current"]'
    );

    expect(addButton).not.toBeNull();
    expect(wrapperBefore).not.toBeNull();
    const initialSignature = wrapperBefore?.dataset.layoutSignature;

    addButton!.click();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const wrapperAfter = document.querySelector<HTMLElement>(
      '.preview-iframe-wrapper[data-mount-id="preview-current"]'
    );
    // Signature should NOT change — transcript entries are injected via
    // controller API rather than rebuilding initialMessages.
    expect(wrapperAfter?.dataset.layoutSignature).toBe(initialSignature);
  });
});
