/** Theme Configurator v2 — Entry point */

import '@runtypelabs/persona/widget.css';
import '../index.css';
import '../theme-configurator.css';

import type { OnChangeCallback, ControlResult } from './types';
import * as state from './state';
import { initSearchUI } from './search';
import * as colorsStyleTab from './sections/colors-style';
import * as componentsTab from './sections/components';
import * as widgetConfigTab from './sections/widget-config';
import * as exportTab from './sections/export';
import { DynamicForm } from '../components';
import { componentRegistry } from '@runtypelabs/persona';

// ─── Register custom components ──────────────────────────────────
componentRegistry.register('dynamic-form', (props, ctx) => {
  return DynamicForm(props, ctx);
});

// ─── Tab configuration ───────────────────────────────────────────

interface Tab {
  id: string;
  label: string;
  render: (container: HTMLElement, onChange: OnChangeCallback) => ControlResult[];
}

const tabs: Tab[] = [
  { id: colorsStyleTab.TAB_ID, label: colorsStyleTab.TAB_LABEL, render: colorsStyleTab.render },
  { id: componentsTab.TAB_ID, label: componentsTab.TAB_LABEL, render: componentsTab.render },
  { id: widgetConfigTab.TAB_ID, label: widgetConfigTab.TAB_LABEL, render: widgetConfigTab.render },
  { id: exportTab.TAB_ID, label: exportTab.TAB_LABEL, render: exportTab.render },
];

// ─── State ───────────────────────────────────────────────────────

let allControls: ControlResult[] = [];
let activeTabId: string = tabs[0].id;

// ─── Initialize ─────────────────────────────────────────────────

function init(): void {
  // Initialize widget preview
  const previewMount = document.getElementById('widget-preview');
  if (!previewMount) {
    throw new Error('Preview mount element not found');
  }

  state.initStore(previewMount);

  // Build tab navigation
  const tabNav = document.getElementById('tab-nav');
  const tabContent = document.getElementById('tab-content');
  if (!tabNav || !tabContent) {
    throw new Error('Tab elements not found');
  }

  // Create tab buttons
  for (const tab of tabs) {
    const btn = document.createElement('button');
    btn.className = `tab-btn${tab.id === activeTabId ? ' active' : ''}`;
    btn.textContent = tab.label;
    btn.type = 'button';
    btn.dataset.tabId = tab.id;

    btn.addEventListener('click', () => {
      switchTab(tab.id);
    });

    tabNav.appendChild(btn);
  }

  // Create tab panels
  for (const tab of tabs) {
    const panel = document.createElement('div');
    panel.className = `tab-panel${tab.id === activeTabId ? ' active' : ''}`;
    panel.id = `tab-panel-${tab.id}`;

    const controls = tab.render(panel, handleChange);
    allControls.push(...controls);

    tabContent.appendChild(panel);
  }

  // Initialize search
  initSearchUI((tabId, sectionId, fieldId) => {
    switchTab(tabId);
    // Expand the section if collapsed
    const panel = document.getElementById(`tab-panel-${tabId}`);
    if (panel) {
      const section = panel.querySelector(`[data-section-id="${sectionId}"]`);
      if (section?.classList.contains('collapsed')) {
        section.classList.remove('collapsed');
      }
    }
  });

  // Listen for state changes to update code preview
  state.onChange(() => {
    // The export tab code preview auto-updates via its own mechanism
  });
}

// ─── Tab switching ──────────────────────────────────────────────

function switchTab(tabId: string): void {
  if (tabId === activeTabId) return;
  activeTabId = tabId;

  // Update button states
  const tabNav = document.getElementById('tab-nav');
  if (tabNav) {
    tabNav.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.tabId === tabId);
    });
  }

  // Update panel visibility
  const tabContent = document.getElementById('tab-content');
  if (tabContent) {
    tabContent.querySelectorAll('.tab-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `tab-panel-${tabId}`);
    });
  }
}

// ─── Change handler ─────────────────────────────────────────────

function handleChange(path: string, value: any): void {
  // Theme paths are prefixed with 'theme.' and go to the PersonaTheme object
  if (path.startsWith('theme.')) {
    state.set(path, value);
  } else {
    // Config paths go to the AgentWidgetConfig object
    state.set(path, value);
  }
}

// ─── Boot ───────────────────────────────────────────────────────

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
