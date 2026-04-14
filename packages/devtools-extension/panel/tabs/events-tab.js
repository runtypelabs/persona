/**
 * Event Stream Monitor tab.
 *
 * Captures SSE events from the page agent and displays them in a
 * filterable, searchable, expandable list with color-coded type badges.
 */

import { registerTab, sendCommand, getSelectedInstance } from '../panel.js';
import { createSearchBar } from '../components/search-bar.js';
import { renderJsonTree } from '../components/json-viewer.js';

const container = document.getElementById('tab-events');

/** @type {{ id: string, type: string, timestamp: number, payload: string }[]} */
let events = [];
let capturing = false;
let paused = false;
let filterType = '';
let searchQuery = '';
let expandedEventId = null;
let autoScroll = true;
let firstTimestamp = 0;

/** Collect unique event types for the filter dropdown */
const seenTypes = new Set();

// Badge colors by event type prefix
const BADGE_COLORS = {
  flow: 'green',
  step: 'blue',
  reason: 'orange',
  tool: 'purple',
  agent: 'teal',
  error: 'red',
};

function getBadgeColor(type) {
  for (const [prefix, color] of Object.entries(BADGE_COLORS)) {
    if (type.startsWith(prefix)) return color;
  }
  return 'gray';
}

// ── Build UI ──

let searchBar = null;
let toolbarEl = null;
let listEl = null;
let countBadge = null;

function buildUI() {
  container.innerHTML = '';

  // Toolbar
  toolbarEl = document.createElement('div');
  toolbarEl.className = 'toolbar';

  const captureBtn = document.createElement('button');
  captureBtn.className = 'btn btn-sm btn-primary';
  captureBtn.textContent = capturing ? (paused ? 'Resume' : 'Pause') : 'Start Capture';
  captureBtn.addEventListener('click', toggleCapture);
  captureBtn.id = 'evt-capture-btn';

  countBadge = document.createElement('span');
  countBadge.className = 'badge badge-blue';
  countBadge.textContent = `${events.length} events`;

  const clearBtn = document.createElement('button');
  clearBtn.className = 'btn btn-sm';
  clearBtn.textContent = 'Clear';
  clearBtn.addEventListener('click', clearEvents);

  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn btn-sm';
  exportBtn.textContent = 'Export JSON';
  exportBtn.addEventListener('click', exportEvents);

  const spacer = document.createElement('span');
  spacer.className = 'toolbar-spacer';

  toolbarEl.append(captureBtn, countBadge, spacer, clearBtn, exportBtn);
  container.appendChild(toolbarEl);

  // Search + filter bar
  searchBar = createSearchBar({
    placeholder: 'Search events...',
    onSearch(q) {
      searchQuery = q;
      renderList();
    },
    onFilterChange(type) {
      filterType = type;
      renderList();
    },
    filterOptions: [...seenTypes].sort().map((t) => ({ value: t, label: t })),
  });
  container.appendChild(searchBar.el);

  // Event list
  listEl = document.createElement('div');
  listEl.id = 'event-list';
  listEl.style.cssText = 'overflow-y: auto; flex: 1;';
  container.appendChild(listEl);

  renderList();
}

function renderList() {
  if (!listEl) return;
  listEl.innerHTML = '';

  const filtered = events.filter((evt) => {
    if (filterType && evt.type !== filterType) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        evt.type.toLowerCase().includes(q) ||
        evt.payload.toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'tab-empty';
    empty.innerHTML = events.length === 0
      ? '<p>No events captured yet. Click "Start Capture" to begin.</p>'
      : '<p>No events match the current filter.</p>';
    listEl.appendChild(empty);
    return;
  }

  for (const evt of filtered) {
    const isExpanded = expandedEventId === evt.id;

    const row = document.createElement('div');
    row.className = 'event-row' + (isExpanded ? ' expanded' : '');

    // Relative timestamp
    const time = document.createElement('span');
    time.className = 'event-time';
    const relMs = evt.timestamp - firstTimestamp;
    time.textContent = firstTimestamp ? `+${(relMs / 1000).toFixed(3)}s` : '0.000s';

    // Type badge
    const typeBadge = document.createElement('span');
    typeBadge.className = `event-type-badge badge badge-${getBadgeColor(evt.type)}`;
    typeBadge.textContent = evt.type;
    typeBadge.title = evt.type;

    // Description (first meaningful field from payload)
    const desc = document.createElement('span');
    desc.className = 'event-desc';
    desc.textContent = extractDescription(evt.payload);

    row.append(time, typeBadge, desc);
    row.addEventListener('click', () => {
      expandedEventId = isExpanded ? null : evt.id;
      renderList();
    });
    listEl.appendChild(row);

    // Detail panel
    const detail = document.createElement('div');
    detail.className = 'event-detail';
    if (isExpanded) {
      detail.style.display = 'block';
      try {
        const parsed = JSON.parse(evt.payload);
        detail.appendChild(renderJsonTree(parsed));
      } catch {
        const pre = document.createElement('pre');
        pre.style.cssText = 'font-family: var(--dt-font-mono); font-size: 11px; white-space: pre-wrap; word-break: break-all;';
        pre.textContent = evt.payload;
        detail.appendChild(pre);
      }
    }
    listEl.appendChild(detail);
  }

  // Auto-scroll to bottom
  if (autoScroll) {
    listEl.scrollTop = listEl.scrollHeight;
  }
}

function extractDescription(payload) {
  try {
    const obj = JSON.parse(payload);
    // Try common fields
    for (const key of ['text', 'content', 'message', 'name', 'tool_name', 'description', 'status']) {
      if (typeof obj[key] === 'string') {
        return obj[key].slice(0, 80);
      }
    }
    if (typeof obj.delta?.text === 'string') return obj.delta.text.slice(0, 80);
    return '';
  } catch {
    return payload.slice(0, 60);
  }
}

// ── Actions ──

function toggleCapture() {
  if (!capturing) {
    sendCommand('CAPTURE_SSE', { instanceId: getSelectedInstance() });
    capturing = true;
    paused = false;
  } else if (paused) {
    sendCommand('PAUSE_SSE', { paused: false, instanceId: getSelectedInstance() });
    paused = false;
  } else {
    sendCommand('PAUSE_SSE', { paused: true, instanceId: getSelectedInstance() });
    paused = true;
  }
  updateCaptureBtn();
}

function updateCaptureBtn() {
  const btn = document.getElementById('evt-capture-btn');
  if (!btn) return;
  if (!capturing) {
    btn.textContent = 'Start Capture';
    btn.className = 'btn btn-sm btn-primary';
  } else if (paused) {
    btn.textContent = 'Resume';
    btn.className = 'btn btn-sm btn-primary';
  } else {
    btn.textContent = 'Pause';
    btn.className = 'btn btn-sm';
  }
}

function clearEvents() {
  events = [];
  seenTypes.clear();
  firstTimestamp = 0;
  expandedEventId = null;
  searchBar?.updateFilters([]);
  if (countBadge) countBadge.textContent = '0 events';
  renderList();
}

function exportEvents() {
  const json = JSON.stringify(events, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `persona-events-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Tab Handler ──

registerTab('events', {
  onMessage(msg) {
    if (msg.type === 'SSE_EVENT' && msg.data) {
      const evt = msg.data;
      events.push(evt);

      if (!firstTimestamp) firstTimestamp = evt.timestamp;

      // Track types for filter
      if (!seenTypes.has(evt.type)) {
        seenTypes.add(evt.type);
        searchBar?.updateFilters(
          [...seenTypes].sort().map((t) => ({ value: t, label: t }))
        );
      }

      if (countBadge) countBadge.textContent = `${events.length} events`;

      // Append to list if visible and not paused
      if (listEl && !paused) {
        renderList();
      }
    }
  },
  onActivate() {
    buildUI();
    if (!capturing) {
      // Auto-start capture when tab is activated
      sendCommand('CAPTURE_SSE', { instanceId: getSelectedInstance() });
      capturing = true;
      updateCaptureBtn();
    }
  },
  onDeactivate() {},
});

export function init() {
  container.innerHTML = '<div class="tab-empty"><p>Switch to this tab to monitor SSE events.</p></div>';
}
