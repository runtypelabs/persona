/**
 * Main panel controller — manages tabs, connection to page, and message routing.
 */

// ── Connection to background service worker ──

const tabId = chrome.devtools.inspectedWindow.tabId;
const port = chrome.runtime.connect({ name: 'persona-devtools-panel' });
port.postMessage({ type: 'INIT', tabId });

/** Send a command to the page agent */
export function sendCommand(type, data) {
  port.postMessage({ type, ...data });
}

// ── State ──

let widgetDetected = false;
let selectedInstance = '';
let currentTab = 'theme';

/** Registered tab handlers: { init, onMessage, onActivate, onDeactivate } */
const tabHandlers = {};

/** Register a tab module */
export function registerTab(id, handler) {
  tabHandlers[id] = handler;
}

/** Get selected instance ID */
export function getSelectedInstance() {
  return selectedInstance;
}

// ── Message routing from page agent ──

port.onMessage.addListener((msg) => {
  if (!msg || !msg.type) return;

  // Widget detection
  if (msg.type === 'WIDGETS_DETECTED') {
    handleWidgetDetection(msg.data);
  }

  // Route to all tab handlers
  for (const handler of Object.values(tabHandlers)) {
    handler.onMessage?.(msg);
  }
});

function handleWidgetDetection(data) {
  const overlay = document.getElementById('no-widget-overlay');
  const select = document.getElementById('instance-select');
  const badge = document.getElementById('connection-badge');

  if (!data || data.widgetCount === 0) {
    widgetDetected = false;
    overlay.classList.remove('hidden');
    badge.className = 'badge badge-gray';
    badge.textContent = 'No widget';
    return;
  }

  widgetDetected = true;
  overlay.classList.add('hidden');

  // Update connection badge
  badge.className = data.debugApiAvailable ? 'badge badge-green' : 'badge badge-yellow';
  badge.textContent = data.debugApiAvailable ? 'Connected' : 'Limited';

  // Update instance select
  select.innerHTML = '';
  if (data.instances.length === 1) {
    const opt = document.createElement('option');
    opt.value = data.instances[0].instanceId;
    opt.textContent = data.instances[0].instanceId || 'Default Widget';
    select.appendChild(opt);
  } else {
    data.instances.forEach((inst, i) => {
      const opt = document.createElement('option');
      opt.value = inst.instanceId;
      opt.textContent = inst.instanceId || `Widget #${i + 1}`;
      select.appendChild(opt);
    });
  }

  selectedInstance = select.value;

  // Notify active tab
  tabHandlers[currentTab]?.onActivate?.();
}

// ── Tab navigation ──

const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const tabId = btn.dataset.tab;
    if (tabId === currentTab) return;

    // Deactivate old tab
    tabHandlers[currentTab]?.onDeactivate?.();

    // Switch UI
    tabButtons.forEach((b) => b.classList.toggle('active', b === btn));
    tabPanels.forEach((p) => p.classList.toggle('active', p.id === `tab-${tabId}`));

    currentTab = tabId;

    // Activate new tab
    if (widgetDetected) {
      tabHandlers[currentTab]?.onActivate?.();
    }
  });
});

// ── Instance select ──

document.getElementById('instance-select').addEventListener('change', (e) => {
  selectedInstance = e.target.value;
  // Re-activate current tab with new instance
  if (widgetDetected) {
    tabHandlers[currentTab]?.onActivate?.();
  }
});

// ── Retry button ──

document.getElementById('retry-detect').addEventListener('click', () => {
  sendCommand('DETECT_WIDGETS');
});

// ── Page navigation handling ──

chrome.devtools.network.onNavigated.addListener(() => {
  widgetDetected = false;
  document.getElementById('no-widget-overlay').classList.remove('hidden');
  document.getElementById('connection-badge').className = 'badge badge-gray';
  document.getElementById('connection-badge').textContent = 'Searching...';

  // Re-detect after a short delay for page to load
  setTimeout(() => sendCommand('DETECT_WIDGETS'), 500);
  setTimeout(() => sendCommand('DETECT_WIDGETS'), 2000);
});

// ── Load tab modules ──

async function loadTabs() {
  const modules = await Promise.all([
    import('./tabs/theme-tab.js'),
    import('./tabs/state-tab.js'),
    import('./tabs/events-tab.js'),
    import('./tabs/config-tab.js'),
    import('./tabs/elements-tab.js'),
  ]);
  modules.forEach((m) => m.init?.());

  // Initial detection request
  sendCommand('DETECT_WIDGETS');
}

loadTabs();
