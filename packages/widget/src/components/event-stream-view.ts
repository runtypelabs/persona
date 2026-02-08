import { createElement } from "../utils/dom";
import { renderLucideIcon } from "../utils/icons";
import { VirtualScroller } from "../utils/virtual-scroller";
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

// Row height constant shared between renderEventRow and scroller config
const EVENT_ROW_HEIGHT = 52;

function renderEventRow(event: SSEEventRecord): HTMLElement {
  // The virtual scroller sets position:absolute + explicit height on the returned element.
  // We build content directly inside it using fixed pixel positioning to guarantee visibility.
  const row = createElement(
    "div",
    "tvw-border-b tvw-border-cw-divider tvw-text-xs hover:tvw-bg-cw-container tvw-group tvw-overflow-hidden"
  );

  // Top line: badge + timestamp + spacer + copy button
  const topRow = createElement(
    "div",
    "tvw-flex tvw-items-center tvw-gap-2 tvw-px-4"
  );
  topRow.style.height = "24px";

  // Event type badge
  const badge = createElement(
    "span",
    "tvw-inline-block tvw-px-1.5 tvw-py-px tvw-rounded tvw-text-[10px] tvw-font-mono tvw-font-medium tvw-bg-cw-accent/10 tvw-text-cw-accent tvw-whitespace-nowrap tvw-flex-shrink-0"
  );
  badge.textContent = event.type;

  // Timestamp
  const timestamp = createElement(
    "span",
    "tvw-text-[10px] tvw-text-cw-muted tvw-whitespace-nowrap tvw-flex-shrink-0 tvw-font-mono"
  );
  timestamp.textContent = formatTimestamp(event.timestamp);

  // Spacer
  const spacer = createElement("div", "tvw-flex-1");

  // Copy button (visible on hover)
  const copyBtn = createElement(
    "button",
    "tvw-opacity-0 group-hover:tvw-opacity-100 tvw-text-cw-muted hover:tvw-text-cw-primary tvw-cursor-pointer tvw-flex-shrink-0 tvw-border-none tvw-bg-transparent tvw-p-0"
  );
  const clipIcon = renderLucideIcon("clipboard", "12px", "currentColor", 1.5);
  if (clipIcon) copyBtn.appendChild(clipIcon);
  copyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(event.payload);
  });

  topRow.appendChild(badge);
  topRow.appendChild(timestamp);
  topRow.appendChild(spacer);
  topRow.appendChild(copyBtn);

  // Bottom line: payload preview (full width)
  const payload = createElement(
    "pre",
    "tvw-text-[11px] tvw-text-cw-secondary tvw-font-mono tvw-overflow-hidden tvw-text-ellipsis tvw-whitespace-nowrap tvw-m-0 tvw-px-4"
  );
  payload.style.height = "18px";
  payload.style.lineHeight = "18px";
  const preview =
    event.payload.length > 200
      ? event.payload.slice(0, 200) + "..."
      : event.payload;
  payload.textContent = preview;

  row.appendChild(topRow);
  row.appendChild(payload);

  return row;
}

export function createEventStreamView(
  buffer: EventStreamBuffer,
  getFullHistory?: () => Promise<SSEEventRecord[]>
): {
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
    "tvw-flex tvw-items-center tvw-gap-1.5 tvw-px-4 tvw-py-1.5 tvw-border-b tvw-border-cw-divider tvw-bg-cw-surface tvw-flex-shrink-0"
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
    "tvw-text-xs tvw-bg-cw-container tvw-border tvw-border-cw-border tvw-rounded tvw-px-2 tvw-py-1 tvw-flex-1 tvw-min-w-0 tvw-text-cw-primary"
  ) as HTMLInputElement;
  searchInput.type = "text";
  searchInput.placeholder = "Search events...";

  const iconBtnClass =
    "tvw-inline-flex tvw-items-center tvw-justify-center tvw-rounded tvw-text-cw-muted hover:tvw-bg-cw-container hover:tvw-text-cw-primary tvw-cursor-pointer tvw-border-none tvw-bg-transparent tvw-flex-shrink-0 tvw-p-1";

  // Copy All button (icon)
  const copyAllBtn = createElement(
    "button",
    iconBtnClass
  ) as HTMLButtonElement;
  copyAllBtn.type = "button";
  copyAllBtn.title = "Copy All";
  copyAllBtn.style.width = "26px";
  copyAllBtn.style.height = "26px";
  const copyAllIcon = renderLucideIcon("clipboard-copy", "14px", "currentColor", 1.5);
  if (copyAllIcon) copyAllBtn.appendChild(copyAllIcon);

  // Clear button (icon)
  const clearBtn = createElement(
    "button",
    iconBtnClass
  ) as HTMLButtonElement;
  clearBtn.type = "button";
  clearBtn.title = "Clear";
  clearBtn.style.width = "26px";
  clearBtn.style.height = "26px";
  const clearIcon = renderLucideIcon("trash-2", "14px", "currentColor", 1.5);
  if (clearIcon) clearBtn.appendChild(clearIcon);

  toolbar.appendChild(filterSelect);
  toolbar.appendChild(searchInput);
  toolbar.appendChild(copyAllBtn);
  toolbar.appendChild(clearBtn);

  // Truncation notice banner (above virtual scroller)
  const truncationBanner = createElement(
    "div",
    "tvw-text-xs tvw-text-cw-muted tvw-text-center tvw-py-0.5 tvw-px-4 tvw-bg-cw-container tvw-border-b tvw-border-cw-divider tvw-italic tvw-flex-shrink-0"
  );
  truncationBanner.style.display = "none";

  // Events list container (wraps virtual scroller + scroll-to-bottom indicator)
  const eventsListWrapper = createElement(
    "div",
    "tvw-flex-1 tvw-min-h-0 tvw-relative"
  );

  const eventsList = createElement(
    "div",
    "tvw-event-stream-list tvw-flex-1 tvw-overflow-y-auto tvw-min-h-0 tvw-relative"
  );
  eventsList.style.height = "100%";

  // Scroll-to-bottom indicator
  const scrollIndicator = createElement(
    "div",
    "tvw-absolute tvw-bottom-3 tvw-left-1/2 tvw-transform tvw--translate-x-1/2 tvw-bg-cw-accent tvw-text-white tvw-text-xs tvw-px-3 tvw-py-1.5 tvw-rounded-full tvw-cursor-pointer tvw-shadow-md tvw-z-10 tvw-flex tvw-items-center tvw-gap-1"
  );
  scrollIndicator.style.display = "none";
  const arrowIcon = renderLucideIcon("arrow-down", "12px", "currentColor", 2);
  if (arrowIcon) scrollIndicator.appendChild(arrowIcon);
  const indicatorText = createElement("span", "");
  scrollIndicator.appendChild(indicatorText);

  eventsListWrapper.appendChild(eventsList);
  eventsListWrapper.appendChild(scrollIndicator);

  container.appendChild(toolbar);
  container.appendChild(truncationBanner);
  container.appendChild(eventsListWrapper);

  // Virtual scroller state
  let filteredEvents: SSEEventRecord[] = [];

  const scroller = new VirtualScroller({
    container: eventsList,
    rowHeight: EVENT_ROW_HEIGHT,
    overscan: 5,
    renderRow: (index: number) => {
      const event = filteredEvents[index];
      if (!event) return createElement("div", "");
      return renderEventRow(event);
    },
  });

  // Auto-scroll state
  let userScrolledUp = false;
  let newEventsSincePause = 0;

  const handleListScroll = () => {
    if (scroller.getIsAutoScrolling()) return;
    if (scroller.isNearBottom()) {
      userScrolledUp = false;
      newEventsSincePause = 0;
      scrollIndicator.style.display = "none";
    } else {
      userScrolledUp = true;
    }
  };
  eventsList.addEventListener("scroll", handleListScroll);

  scrollIndicator.addEventListener("click", () => {
    scroller.scrollToBottom(true);
    userScrolledUp = false;
    newEventsSincePause = 0;
    scrollIndicator.style.display = "none";
  });

  // Track last known event types for filter update
  let lastKnownTypes: string[] = [];
  let lastFilteredCount = 0;

  function updateFilterOptions() {
    const types = buffer.getEventTypes();
    if (types.length === lastKnownTypes.length && types.every((t, i) => t === lastKnownTypes[i])) {
      return;
    }
    lastKnownTypes = types;
    const currentValue = filterSelect.value;
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

    // Update truncation banner
    const evictedCount = buffer.getEvictedCount();
    if (evictedCount > 0) {
      truncationBanner.textContent = `${evictedCount.toLocaleString()} older events truncated`;
      truncationBanner.style.display = "";
    } else {
      truncationBanner.style.display = "none";
    }

    filteredEvents = getFilteredEvents();
    const newCount = filteredEvents.length;

    // Track new events since user scrolled up
    if (userScrolledUp && newCount > lastFilteredCount) {
      newEventsSincePause += newCount - lastFilteredCount;
      indicatorText.textContent = `${newEventsSincePause} new event${newEventsSincePause === 1 ? "" : "s"}`;
      scrollIndicator.style.display = "";
    }
    lastFilteredCount = newCount;

    scroller.setTotalCount(filteredEvents.length);

    // Auto-scroll if user hasn't scrolled up
    if (!userScrolledUp) {
      scroller.scrollToBottom();
    }
  }

  // Event handlers
  const swapCopyAllIcon = (iconName: string, restoreAfterMs: number) => {
    copyAllBtn.innerHTML = "";
    const icon = renderLucideIcon(iconName, "14px", "currentColor", 1.5);
    if (icon) copyAllBtn.appendChild(icon);
    setTimeout(() => {
      copyAllBtn.innerHTML = "";
      const original = renderLucideIcon("clipboard-copy", "14px", "currentColor", 1.5);
      if (original) copyAllBtn.appendChild(original);
      copyAllBtn.disabled = false;
    }, restoreAfterMs);
  };

  const handleCopyAll = async () => {
    copyAllBtn.disabled = true;

    try {
      const allEvents = getFullHistory
        ? await getFullHistory()
        : buffer.getAll();
      await navigator.clipboard.writeText(JSON.stringify(allEvents, null, 2));
      swapCopyAllIcon("check", 1500);
    } catch {
      swapCopyAllIcon("x", 1500);
    }
  };

  const handleClear = () => {
    buffer.clear();
    userScrolledUp = false;
    newEventsSincePause = 0;
    lastFilteredCount = 0;
    scrollIndicator.style.display = "none";
    update();
  };

  const handleFilterChange = () => {
    lastFilteredCount = 0;
    newEventsSincePause = 0;
    userScrolledUp = false;
    scrollIndicator.style.display = "none";
    update();
  };
  const handleSearchInput = () => {
    lastFilteredCount = 0;
    newEventsSincePause = 0;
    userScrolledUp = false;
    scrollIndicator.style.display = "none";
    update();
  };

  copyAllBtn.addEventListener("click", handleCopyAll);
  clearBtn.addEventListener("click", handleClear);
  filterSelect.addEventListener("change", handleFilterChange);
  searchInput.addEventListener("input", handleSearchInput);

  function destroy() {
    scroller.destroy();
    eventsList.removeEventListener("scroll", handleListScroll);
    copyAllBtn.removeEventListener("click", handleCopyAll);
    clearBtn.removeEventListener("click", handleClear);
    filterSelect.removeEventListener("change", handleFilterChange);
    searchInput.removeEventListener("input", handleSearchInput);
  }

  return { element: container, update, destroy };
}
