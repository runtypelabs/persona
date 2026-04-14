/**
 * Configuration Viewer tab.
 *
 * Shows the current widget config (via getState) with a JSON tree.
 * Allows toggling booleans and editing simple values.
 */

import { registerTab, sendCommand, getSelectedInstance } from '../panel.js';
import { renderJsonTree } from '../components/json-viewer.js';

const container = document.getElementById('tab-config');

let configData = null;

function render() {
  container.innerHTML = '';

  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';

  const refreshBtn = document.createElement('button');
  refreshBtn.className = 'btn btn-sm';
  refreshBtn.textContent = 'Refresh';
  refreshBtn.addEventListener('click', requestConfig);

  toolbar.appendChild(refreshBtn);
  container.appendChild(toolbar);

  if (!configData) {
    const empty = document.createElement('div');
    empty.className = 'tab-empty';
    empty.innerHTML = '<p>No configuration data available.<br>Ensure the widget has <code>debug: true</code> or <code>debugTools: true</code>.</p>';
    container.appendChild(empty);
    return;
  }

  // Config JSON tree
  const section = document.createElement('div');
  section.className = 'section';

  const header = document.createElement('div');
  header.className = 'section-header';
  header.innerHTML = '<span class="section-chevron">\u25BC</span><span>Widget Configuration</span>';
  header.addEventListener('click', () => section.classList.toggle('collapsed'));

  const body = document.createElement('div');
  body.className = 'section-body';
  body.appendChild(renderJsonTree(configData));

  section.append(header, body);
  container.appendChild(section);
}

function requestConfig() {
  sendCommand('GET_CONFIG', { instanceId: getSelectedInstance() });
}

// ── Tab Handler ──

registerTab('config', {
  onMessage(msg) {
    if (msg.type === 'CONFIG' && msg.data) {
      configData = msg.data;
      render();
    }
  },
  onActivate() {
    requestConfig();
  },
  onDeactivate() {},
});

export function init() {
  container.innerHTML = '<div class="tab-empty"><p>Switch to this tab to view widget configuration.</p></div>';
}
