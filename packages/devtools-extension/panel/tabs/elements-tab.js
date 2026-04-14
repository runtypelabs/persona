/**
 * Elements Explorer tab.
 *
 * Shows the widget's theme zone hierarchy as a tree.
 * Hovering highlights elements on the page, clicking shows computed CSS vars.
 */

import { registerTab, sendCommand, getSelectedInstance } from '../panel.js';

const container = document.getElementById('tab-elements');

let zones = [];
let selectedZone = null;
let zoneVars = {};

function render() {
  container.innerHTML = '';

  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';

  const refreshBtn = document.createElement('button');
  refreshBtn.className = 'btn btn-sm';
  refreshBtn.textContent = 'Refresh';
  refreshBtn.addEventListener('click', requestZones);

  toolbar.appendChild(refreshBtn);
  container.appendChild(toolbar);

  if (zones.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'tab-empty';
    empty.innerHTML = '<p>No theme zones detected.<br>Make sure the Persona widget is loaded on the page.</p>';
    container.appendChild(empty);
    return;
  }

  // Split layout: tree on left, vars on right
  const layout = document.createElement('div');
  layout.style.cssText = 'display: flex; gap: 8px; height: calc(100% - 40px);';

  // Zone tree
  const treePanel = document.createElement('div');
  treePanel.className = 'section';
  treePanel.style.cssText = 'flex: 1; overflow-y: auto; min-width: 200px;';

  const treeHeader = document.createElement('div');
  treeHeader.className = 'section-header';
  treeHeader.innerHTML = `<span class="section-chevron">\u25BC</span><span>Theme Zones</span><span class="section-count">${zones.length}</span>`;
  treeHeader.addEventListener('click', () => treePanel.classList.toggle('collapsed'));

  const treeBody = document.createElement('div');
  treeBody.className = 'section-body zone-tree';

  for (const zone of zones) {
    const node = document.createElement('div');
    node.className = 'zone-node' + (selectedZone === zone.zone ? ' selected' : '');
    node.style.paddingLeft = '8px';

    const tag = document.createElement('span');
    tag.className = 'zone-tag';
    tag.textContent = `<${zone.tag}>`;

    const name = document.createElement('span');
    name.className = 'zone-name';
    name.textContent = zone.zone;

    if (zone.inShadowDom) {
      const shadow = document.createElement('span');
      shadow.className = 'badge badge-purple';
      shadow.textContent = 'shadow';
      shadow.style.cssText = 'margin-left: 4px; font-size: 9px;';
      node.append(tag, name, shadow);
    } else {
      node.append(tag, name);
    }

    // Hover -> highlight on page
    node.addEventListener('mouseenter', () => {
      sendCommand('HIGHLIGHT_ELEMENT', { zoneName: zone.zone, instanceId: getSelectedInstance() });
    });
    node.addEventListener('mouseleave', () => {
      sendCommand('CLEAR_HIGHLIGHT');
    });

    // Click -> show computed vars
    node.addEventListener('click', () => {
      selectedZone = zone.zone;
      sendCommand('GET_ZONE_VARS', { zoneName: zone.zone, instanceId: getSelectedInstance() });
      // Update selection styling
      treeBody.querySelectorAll('.zone-node').forEach((n) => n.classList.remove('selected'));
      node.classList.add('selected');
    });

    treeBody.appendChild(node);
  }

  treePanel.append(treeHeader, treeBody);

  // Computed vars panel
  const varsPanel = document.createElement('div');
  varsPanel.className = 'section';
  varsPanel.style.cssText = 'flex: 1; overflow-y: auto;';
  varsPanel.id = 'zone-vars-panel';

  const varsHeader = document.createElement('div');
  varsHeader.className = 'section-header';
  varsHeader.innerHTML = '<span class="section-chevron">\u25BC</span><span>Computed Variables</span>';
  varsHeader.addEventListener('click', () => varsPanel.classList.toggle('collapsed'));

  const varsBody = document.createElement('div');
  varsBody.className = 'section-body';
  varsBody.id = 'zone-vars-body';

  if (selectedZone && Object.keys(zoneVars).length > 0) {
    renderZoneVars(varsBody);
  } else {
    const hint = document.createElement('div');
    hint.style.cssText = 'color: var(--dt-text-muted); font-size: 11px; padding: 8px;';
    hint.textContent = selectedZone ? 'No variables found for this zone.' : 'Click a zone to see its computed CSS variables.';
    varsBody.appendChild(hint);
  }

  varsPanel.append(varsHeader, varsBody);

  layout.append(treePanel, varsPanel);
  container.appendChild(layout);
}

function renderZoneVars(body) {
  const sorted = Object.entries(zoneVars).sort(([a], [b]) => a.localeCompare(b));
  for (const [name, value] of sorted) {
    const row = document.createElement('div');
    row.className = 'prop-row';

    const nameEl = document.createElement('span');
    nameEl.className = 'prop-name';
    nameEl.textContent = name.replace(/^--persona-/, '');
    nameEl.title = name;

    const valueEl = document.createElement('span');
    valueEl.className = 'prop-value';

    // Show color swatch if it looks like a color
    if (/^#[0-9a-f]{3,8}$/i.test(value.trim()) || /^rgba?\(/.test(value.trim())) {
      const swatch = document.createElement('span');
      swatch.style.cssText = `display: inline-block; width: 12px; height: 12px; border-radius: 2px; border: 1px solid var(--dt-border); background: ${value}; flex-shrink: 0;`;
      valueEl.appendChild(swatch);
    }

    const text = document.createElement('span');
    text.style.cssText = 'font-family: var(--dt-font-mono); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
    text.textContent = value;
    text.title = value;
    valueEl.appendChild(text);

    row.append(nameEl, valueEl);
    body.appendChild(row);
  }
}

function requestZones() {
  sendCommand('GET_THEME_ZONES', { instanceId: getSelectedInstance() });
}

// ── Tab Handler ──

registerTab('elements', {
  onMessage(msg) {
    if (msg.type === 'THEME_ZONES' && msg.data) {
      zones = msg.data;
      render();
    }
    if (msg.type === 'ZONE_VARS' && msg.data) {
      zoneVars = msg.data;
      // Re-render just the vars panel
      const body = document.getElementById('zone-vars-body');
      if (body) {
        body.innerHTML = '';
        if (Object.keys(zoneVars).length > 0) {
          renderZoneVars(body);
        } else {
          const hint = document.createElement('div');
          hint.style.cssText = 'color: var(--dt-text-muted); font-size: 11px; padding: 8px;';
          hint.textContent = 'No variables found for this zone.';
          body.appendChild(hint);
        }
      }
    }
  },
  onActivate() {
    requestZones();
  },
  onDeactivate() {
    // Clean up highlight when leaving tab
    sendCommand('CLEAR_HIGHLIGHT');
  },
});

export function init() {
  container.innerHTML = '<div class="tab-empty"><p>Switch to this tab to explore widget DOM structure.</p></div>';
}
