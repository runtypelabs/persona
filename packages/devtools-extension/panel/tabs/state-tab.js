/**
 * State Inspector tab.
 *
 * Shows widget state, message list, and persistent metadata.
 * Subscribes to controller events for live updates.
 */

import { registerTab, sendCommand, getSelectedInstance } from '../panel.js';
import { renderJsonTree } from '../components/json-viewer.js';

const container = document.getElementById('tab-state');

let widgetState = null;
let messages = [];
let metadata = {};
let subscribed = false;
let expandedMessageId = null;

// ── Build UI ──

function render() {
  container.innerHTML = '';

  // Status bar
  const statusBar = document.createElement('div');
  statusBar.className = 'status-bar';
  renderStatusBadges(statusBar);
  container.appendChild(statusBar);

  // Action buttons
  const actions = document.createElement('div');
  actions.className = 'toolbar';

  const openBtn = createActionBtn('Open', () => doAction('open'));
  const closeBtn = createActionBtn('Close', () => doAction('close'));
  const clearBtn = createActionBtn('Clear Chat', () => doAction('clearChat'));
  const refreshBtn = createActionBtn('Refresh', refresh);

  actions.append(openBtn, closeBtn, clearBtn, refreshBtn);
  container.appendChild(actions);

  // Messages section
  const msgSection = document.createElement('div');
  msgSection.className = 'section';

  const msgHeader = document.createElement('div');
  msgHeader.className = 'section-header';
  msgHeader.innerHTML = `<span class="section-chevron">\u25BC</span><span>Messages</span><span class="section-count">${messages.length}</span>`;
  msgHeader.addEventListener('click', () => msgSection.classList.toggle('collapsed'));

  const msgBody = document.createElement('div');
  msgBody.className = 'section-body';
  msgBody.id = 'state-messages-body';

  if (messages.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'tab-empty';
    empty.innerHTML = '<p>No messages yet</p>';
    msgBody.appendChild(empty);
  } else {
    for (const msg of messages) {
      renderMessageItem(msgBody, msg);
    }
  }

  msgSection.append(msgHeader, msgBody);
  container.appendChild(msgSection);

  // Metadata section
  const metaSection = document.createElement('div');
  metaSection.className = 'section collapsed';

  const metaHeader = document.createElement('div');
  metaHeader.className = 'section-header';
  metaHeader.innerHTML = '<span class="section-chevron">\u25BC</span><span>Persistent Metadata</span>';
  metaHeader.addEventListener('click', () => metaSection.classList.toggle('collapsed'));

  const metaBody = document.createElement('div');
  metaBody.className = 'section-body';

  if (metadata && Object.keys(metadata).length > 0) {
    metaBody.appendChild(renderJsonTree(metadata));
  } else {
    const empty = document.createElement('div');
    empty.style.cssText = 'color: var(--dt-text-muted); font-size: 11px; padding: 4px;';
    empty.textContent = 'No metadata';
    metaBody.appendChild(empty);
  }

  metaSection.append(metaHeader, metaBody);
  container.appendChild(metaSection);
}

function renderStatusBadges(bar) {
  bar.innerHTML = '';

  const state = widgetState?.state;
  const status = widgetState?.status;

  if (!state && !status) {
    bar.appendChild(makeBadge('No data', 'gray'));
    return;
  }

  if (state) {
    bar.appendChild(makeBadge(state.open ? 'Open' : 'Closed', state.open ? 'green' : 'gray'));
    bar.appendChild(makeBadge(state.streaming ? 'Streaming' : 'Idle', state.streaming ? 'blue' : 'gray'));
    if (state.voiceActive) bar.appendChild(makeBadge('Voice Active', 'purple'));
  }

  if (status) {
    const statusColors = { idle: 'gray', connecting: 'yellow', connected: 'green', error: 'red' };
    bar.appendChild(makeBadge(status, statusColors[status] || 'gray'));
  }
}

function makeBadge(text, color) {
  const badge = document.createElement('span');
  badge.className = `badge badge-${color}`;
  badge.textContent = text;
  return badge;
}

function renderMessageItem(parent, msg) {
  const id = msg.id || msg.messageId || Math.random().toString(36).slice(2);
  const isExpanded = expandedMessageId === id;

  const item = document.createElement('div');
  item.className = 'message-item' + (isExpanded ? ' expanded' : '');

  const role = document.createElement('span');
  role.className = `message-role ${msg.role || 'system'}`;
  role.textContent = (msg.role || 'system').slice(0, 4);

  const preview = document.createElement('span');
  preview.className = 'message-content-preview';
  const contentText = msg.content || msg.rawContent || (msg.contentParts?.[0]?.text) || '';
  preview.textContent = contentText.slice(0, 120);

  item.append(role, preview);
  item.addEventListener('click', () => {
    expandedMessageId = isExpanded ? null : id;
    render();
  });
  parent.appendChild(item);

  // Detail panel (shown when expanded)
  const detail = document.createElement('div');
  detail.className = 'message-detail';
  if (isExpanded) {
    detail.style.display = 'block';
    detail.appendChild(renderJsonTree(msg));
  }
  parent.appendChild(detail);
}

function createActionBtn(text, handler) {
  const btn = document.createElement('button');
  btn.className = 'btn btn-sm';
  btn.textContent = text;
  btn.addEventListener('click', handler);
  return btn;
}

function doAction(action) {
  sendCommand('WIDGET_ACTION', { action, instanceId: getSelectedInstance() });
  // Refresh state after a brief delay
  setTimeout(refresh, 300);
}

function refresh() {
  sendCommand('GET_STATE', { instanceId: getSelectedInstance() });
  sendCommand('GET_MESSAGES', { instanceId: getSelectedInstance() });
  sendCommand('GET_METADATA', { instanceId: getSelectedInstance() });
}

// ── Tab Handler ──

registerTab('state', {
  onMessage(msg) {
    if (msg.type === 'STATE_UPDATE' && msg.data) {
      if (msg.data.event === 'snapshot') {
        widgetState = msg.data.payload;
      } else if (msg.data.event === 'widget:state') {
        widgetState = { ...widgetState, state: msg.data.payload };
      }
      // Live update the status bar without full re-render
      const bar = container.querySelector('.status-bar');
      if (bar) renderStatusBadges(bar);
    }

    if (msg.type === 'MESSAGES_UPDATE' && msg.data) {
      messages = msg.data || [];
      render();
    }

    if (msg.type === 'MESSAGE_ADDED' || msg.type === 'MESSAGE_COMPLETE') {
      // Incremental: refresh messages
      sendCommand('GET_MESSAGES', { instanceId: getSelectedInstance() });
    }

    if (msg.type === 'METADATA' && msg.data) {
      metadata = msg.data;
    }
  },
  onActivate() {
    if (!subscribed) {
      sendCommand('SUBSCRIBE_EVENTS', { instanceId: getSelectedInstance() });
      subscribed = true;
    }
    refresh();
  },
  onDeactivate() {},
});

export function init() {
  container.innerHTML = '<div class="tab-empty"><p>Switch to this tab to inspect widget state.</p></div>';
}
