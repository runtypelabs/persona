import { createElement } from "../utils/dom";
import { renderLucideIcon } from "../utils/icons";
import type { EventStreamBuffer } from "../utils/event-stream-buffer";
import type { SSEEventRecord } from "../types";

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const mmm = String(d.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${mmm}`;
}

function renderEventRow(event: SSEEventRecord): HTMLElement {
  const row = createElement(
    "div",
    "tvw-flex tvw-items-start tvw-gap-2 tvw-px-4 tvw-py-2 tvw-border-b tvw-border-cw-divider tvw-text-xs hover:tvw-bg-cw-container tvw-group"
  );

  // Event type badge
  const badge = createElement(
    "span",
    "tvw-inline-block tvw-px-1.5 tvw-py-0.5 tvw-rounded tvw-text-[10px] tvw-font-mono tvw-font-medium tvw-bg-cw-accent/10 tvw-text-cw-accent tvw-whitespace-nowrap tvw-flex-shrink-0"
  );
  badge.textContent = event.type;

  // Timestamp
  const timestamp = createElement(
    "span",
    "tvw-text-cw-muted tvw-whitespace-nowrap tvw-flex-shrink-0 tvw-font-mono"
  );
  timestamp.textContent = formatTimestamp(event.timestamp);

  // Payload preview
  const payload = createElement(
    "pre",
    "tvw-text-cw-primary tvw-font-mono tvw-overflow-hidden tvw-text-ellipsis tvw-whitespace-nowrap tvw-flex-1 tvw-min-w-0 tvw-m-0"
  );
  const preview =
    event.payload.length > 120
      ? event.payload.slice(0, 120) + "..."
      : event.payload;
  payload.textContent = preview;

  // Copy button (visible on hover)
  const copyBtn = createElement(
    "button",
    "tvw-opacity-0 group-hover:tvw-opacity-100 tvw-text-cw-muted hover:tvw-text-cw-primary tvw-cursor-pointer tvw-flex-shrink-0 tvw-border-none tvw-bg-transparent tvw-p-0"
  );
  const clipIcon = renderLucideIcon("clipboard", "14px", "", 1);
  if (clipIcon) copyBtn.appendChild(clipIcon);
  copyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(event.payload);
  });

  row.appendChild(badge);
  row.appendChild(timestamp);
  row.appendChild(payload);
  row.appendChild(copyBtn);

  return row;
}

export function createEventStreamView(buffer: EventStreamBuffer): {
  element: HTMLElement;
  update: () => void;
  destroy: () => void;
} {
  const container = createElement(
    "div",
    "tvw-event-stream-view tvw-flex tvw-flex-col tvw-flex-1 tvw-min-h-0"
  );

  // Toolbar
  const toolbar = createElement(
    "div",
    "tvw-flex tvw-items-center tvw-gap-2 tvw-px-4 tvw-py-2 tvw-border-b tvw-border-cw-divider tvw-bg-cw-surface tvw-flex-shrink-0"
  );

  // Filter select
  const filterSelect = createElement(
    "select",
    "tvw-text-xs tvw-bg-cw-container tvw-border tvw-border-cw-border tvw-rounded tvw-px-2 tvw-py-1 tvw-text-cw-primary"
  );
  const allOption = createElement("option", "");
  allOption.value = "";
  allOption.textContent = "All Events";
  filterSelect.appendChild(allOption);

  // Search input
  const searchInput = createElement(
    "input",
    "tvw-text-xs tvw-bg-cw-container tvw-border tvw-border-cw-border tvw-rounded tvw-px-2 tvw-py-1 tvw-flex-1 tvw-text-cw-primary"
  ) as HTMLInputElement;
  searchInput.type = "text";
  searchInput.placeholder = "Search events...";

  // Copy All button
  const copyAllBtn = createElement(
    "button",
    "tvw-text-xs tvw-bg-cw-container tvw-border tvw-border-cw-border tvw-rounded tvw-px-2 tvw-py-1 tvw-text-cw-muted hover:tvw-text-cw-primary tvw-cursor-pointer"
  );
  copyAllBtn.textContent = "Copy All";
  copyAllBtn.type = "button";

  // Clear button
  const clearBtn = createElement(
    "button",
    "tvw-text-xs tvw-bg-cw-container tvw-border tvw-border-cw-border tvw-rounded tvw-px-2 tvw-py-1 tvw-text-cw-muted hover:tvw-text-cw-primary tvw-cursor-pointer"
  );
  clearBtn.textContent = "Clear";
  clearBtn.type = "button";

  toolbar.appendChild(filterSelect);
  toolbar.appendChild(searchInput);
  toolbar.appendChild(copyAllBtn);
  toolbar.appendChild(clearBtn);

  // Events list
  const eventsList = createElement(
    "div",
    "tvw-event-stream-list tvw-flex-1 tvw-overflow-y-auto tvw-min-h-0"
  );

  container.appendChild(toolbar);
  container.appendChild(eventsList);

  // Track last known event types for filter update
  let lastKnownTypes: string[] = [];

  function updateFilterOptions() {
    const types = buffer.getEventTypes();
    if (types.length === lastKnownTypes.length && types.every((t, i) => t === lastKnownTypes[i])) {
      return; // No change
    }
    lastKnownTypes = types;
    const currentValue = filterSelect.value;
    // Remove all options except "All Events"
    while (filterSelect.options.length > 1) {
      filterSelect.remove(1);
    }
    for (const type of types) {
      const opt = createElement("option", "");
      opt.value = type;
      opt.textContent = type;
      filterSelect.appendChild(opt);
    }
    filterSelect.value = currentValue;
  }

  function getFilteredEvents(): SSEEventRecord[] {
    let events = buffer.getAll();
    const filterType = filterSelect.value;
    const searchTerm = searchInput.value.toLowerCase();
    if (filterType) {
      events = events.filter((e) => e.type === filterType);
    }
    if (searchTerm) {
      events = events.filter(
        (e) =>
          e.type.toLowerCase().includes(searchTerm) ||
          e.payload.toLowerCase().includes(searchTerm)
      );
    }
    return events;
  }

  function update() {
    updateFilterOptions();

    // Check auto-scroll before updating: if scrolled to bottom (within 50px)
    const wasAtBottom =
      eventsList.scrollHeight - eventsList.scrollTop - eventsList.clientHeight < 50;

    const events = getFilteredEvents();

    // Simple DOM replacement
    eventsList.innerHTML = "";
    for (const event of events) {
      eventsList.appendChild(renderEventRow(event));
    }

    // Auto-scroll if was at bottom
    if (wasAtBottom) {
      eventsList.scrollTop = eventsList.scrollHeight;
    }
  }

  // Event handlers
  const handleCopyAll = () => {
    navigator.clipboard.writeText(JSON.stringify(buffer.getAll(), null, 2));
  };

  const handleClear = () => {
    buffer.clear();
    update();
  };

  const handleFilterChange = () => update();
  const handleSearchInput = () => update();

  copyAllBtn.addEventListener("click", handleCopyAll);
  clearBtn.addEventListener("click", handleClear);
  filterSelect.addEventListener("change", handleFilterChange);
  searchInput.addEventListener("input", handleSearchInput);

  function destroy() {
    copyAllBtn.removeEventListener("click", handleCopyAll);
    clearBtn.removeEventListener("click", handleClear);
    filterSelect.removeEventListener("change", handleFilterChange);
    searchInput.removeEventListener("input", handleSearchInput);
  }

  return { element: container, update, destroy };
}
