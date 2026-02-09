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

function renderEventRow(event: SSEEventRecord, onPayloadClick?: (event: SSEEventRecord, target: HTMLElement) => void): HTMLElement {
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
  copyBtn.addEventListener("click", async () => {
    // Format as structured JSON with parsed payload
    let formattedPayload: unknown;
    try {
      formattedPayload = JSON.parse(event.payload);
    } catch {
      formattedPayload = event.payload;
    }
    const formatted = JSON.stringify(
      {
        type: event.type,
        timestamp: new Date(event.timestamp).toISOString(),
        payload: formattedPayload,
      },
      null,
      2
    );

    try {
      await navigator.clipboard.writeText(formatted);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = formatted;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }

    // Visual feedback: swap icon to checkmark
    copyBtn.innerHTML = "";
    const checkIcon = renderLucideIcon("check", "12px", "currentColor", 1.5);
    if (checkIcon) copyBtn.appendChild(checkIcon);
    setTimeout(() => {
      copyBtn.innerHTML = "";
      const restoreIcon = renderLucideIcon("clipboard", "12px", "currentColor", 1.5);
      if (restoreIcon) copyBtn.appendChild(restoreIcon);
    }, 1500);
  });

  topRow.appendChild(badge);
  topRow.appendChild(timestamp);
  topRow.appendChild(spacer);
  topRow.appendChild(copyBtn);

  // Bottom line: payload preview (full width)
  const payload = createElement(
    "pre",
    "tvw-text-[11px] tvw-text-cw-secondary tvw-font-mono tvw-overflow-hidden tvw-text-ellipsis tvw-whitespace-nowrap tvw-m-0 tvw-px-4 tvw-cursor-pointer hover:tvw-text-cw-primary"
  );
  payload.style.height = "18px";
  payload.style.lineHeight = "18px";
  const preview =
    event.payload.length > 120
      ? event.payload.slice(0, 120) + "..."
      : event.payload;
  payload.textContent = preview;

  if (onPayloadClick) {
    payload.addEventListener("click", (e: Event) => {
      e.stopPropagation();
      onPayloadClick(event, payload);
    });
  }

  row.appendChild(topRow);
  row.appendChild(payload);

  return row;
}

export function createEventStreamView(
  buffer: EventStreamBuffer,
  getFullHistory?: () => Promise<SSEEventRecord[]>,
  onClose?: () => void
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
  ) as HTMLSelectElement;
  const allOption = createElement("option", "") as HTMLOptionElement;
  allOption.value = "";
  allOption.textContent = "All Events";
  filterSelect.appendChild(allOption);

  // Search input wrapper (relative for clear button positioning)
  const searchWrapper = createElement(
    "div",
    "tvw-relative tvw-flex-1 tvw-min-w-0"
  );

  const searchInput = createElement(
    "input",
    "tvw-text-xs tvw-bg-cw-container tvw-border tvw-border-cw-border tvw-rounded tvw-px-2 tvw-py-1 tvw-w-full tvw-text-cw-primary tvw-pr-6"
  ) as HTMLInputElement;
  searchInput.type = "text";
  searchInput.placeholder = "Search events...";

  // Clear search button
  const searchClearBtn = createElement(
    "button",
    "tvw-absolute tvw-right-1 tvw-top-1/2 tvw--translate-y-1/2 tvw-text-cw-muted hover:tvw-text-cw-primary tvw-cursor-pointer tvw-border-none tvw-bg-transparent tvw-p-0 tvw-leading-none"
  ) as HTMLButtonElement;
  searchClearBtn.type = "button";
  searchClearBtn.style.display = "none";
  const clearSearchIcon = renderLucideIcon("x", "12px", "currentColor", 2);
  if (clearSearchIcon) searchClearBtn.appendChild(clearSearchIcon);

  searchWrapper.appendChild(searchInput);
  searchWrapper.appendChild(searchClearBtn);

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
  toolbar.appendChild(searchWrapper);
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

  // No matching events message
  const noResultsMsg = createElement(
    "div",
    "tvw-flex tvw-items-center tvw-justify-center tvw-h-full tvw-text-sm tvw-text-cw-muted"
  );
  noResultsMsg.style.display = "none";

  eventsListWrapper.appendChild(eventsList);
  eventsListWrapper.appendChild(noResultsMsg);
  eventsListWrapper.appendChild(scrollIndicator);

  container.setAttribute("tabindex", "0");
  container.appendChild(toolbar);
  container.appendChild(truncationBanner);
  container.appendChild(eventsListWrapper);

  // Virtual scroller state
  let filteredEvents: SSEEventRecord[] = [];

  // Floating payload panel state
  let activePanel: HTMLElement | null = null;

  function dismissPanel() {
    if (activePanel) {
      activePanel.remove();
      activePanel = null;
    }
  }

  function showPayloadPanel(event: SSEEventRecord, target: HTMLElement) {
    // Dismiss any existing panel first
    dismissPanel();

    // Format JSON for display
    let formattedPayload: string;
    try {
      formattedPayload = JSON.stringify(JSON.parse(event.payload), null, 2);
    } catch {
      formattedPayload = event.payload;
    }

    // Create floating panel
    const panel = createElement(
      "div",
      "tvw-absolute tvw-z-20 tvw-bg-cw-surface tvw-border tvw-border-cw-border tvw-rounded-lg tvw-shadow-lg tvw-p-3 tvw-text-xs tvw-font-mono tvw-max-w-[500px] tvw-max-h-[300px] tvw-overflow-auto"
    );
    panel.setAttribute("data-payload-panel", "true");

    // Copy button in top-right corner
    const panelCopyBtn = createElement(
      "button",
      "tvw-absolute tvw-top-1.5 tvw-right-1.5 tvw-text-cw-muted hover:tvw-text-cw-primary tvw-cursor-pointer tvw-border-none tvw-bg-cw-surface tvw-p-1 tvw-rounded tvw-z-10"
    );
    panelCopyBtn.title = "Copy payload";
    const panelCopyIcon = renderLucideIcon("clipboard", "12px", "currentColor", 1.5);
    if (panelCopyIcon) panelCopyBtn.appendChild(panelCopyIcon);
    panelCopyBtn.addEventListener("click", async (e: Event) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(formattedPayload);
      } catch {
        // Fallback
        const textarea = document.createElement("textarea");
        textarea.value = formattedPayload;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      // Visual feedback
      panelCopyBtn.innerHTML = "";
      const checkIcon = renderLucideIcon("check", "12px", "currentColor", 1.5);
      if (checkIcon) panelCopyBtn.appendChild(checkIcon);
      setTimeout(() => {
        panelCopyBtn.innerHTML = "";
        const restoreIcon = renderLucideIcon("clipboard", "12px", "currentColor", 1.5);
        if (restoreIcon) panelCopyBtn.appendChild(restoreIcon);
      }, 1500);
    });

    // Payload content
    const payloadContent = createElement(
      "pre",
      "tvw-m-0 tvw-whitespace-pre-wrap tvw-break-all tvw-text-cw-secondary tvw-pr-6"
    );
    payloadContent.textContent = formattedPayload;

    panel.appendChild(panelCopyBtn);
    panel.appendChild(payloadContent);

    // Position below or above the target based on available space
    // Use the eventsListWrapper as the positioning context (it has position:relative)
    const wrapperRect = eventsListWrapper.getBoundingClientRect?.();
    const targetRect = target.getBoundingClientRect?.();

    if (wrapperRect && targetRect) {
      const spaceBelow = wrapperRect.bottom - targetRect.bottom;
      const spaceAbove = targetRect.top - wrapperRect.top;
      const leftOffset = targetRect.left - wrapperRect.left;

      if (spaceBelow >= 150 || spaceBelow >= spaceAbove) {
        // Position below
        panel.style.top = `${targetRect.bottom - wrapperRect.top}px`;
      } else {
        // Position above
        panel.style.bottom = `${wrapperRect.bottom - targetRect.top}px`;
      }
      panel.style.left = `${Math.max(4, leftOffset)}px`;
      panel.style.right = "4px";
    } else {
      // Fallback: center in wrapper
      panel.style.left = "4px";
      panel.style.right = "4px";
      panel.style.top = "50%";
    }

    // Stop click events from propagating out of the panel
    panel.addEventListener("click", (e: Event) => e.stopPropagation());

    eventsListWrapper.appendChild(panel);
    activePanel = panel;
  }

  const scroller = new VirtualScroller({
    container: eventsList,
    rowHeight: EVENT_ROW_HEIGHT,
    overscan: 5,
    renderRow: (index: number) => {
      const event = filteredEvents[index];
      if (!event) return createElement("div", "");
      return renderEventRow(event, showPayloadPanel);
    },
  });

  // Auto-scroll state
  let userScrolledUp = false;
  let newEventsSincePause = 0;

  const handleListScroll = () => {
    // Dismiss any open payload panel on scroll
    dismissPanel();
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
  let lastTypeCounts: Record<string, number> = {};
  let lastFilteredCount = 0;
  let selectedType = "";
  let searchTerm = "";
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;

  // Throttle state for update() — coalesces rapid event bursts
  let lastRenderTime = 0;
  let pendingUpdate = false;
  let pendingRafId: number | null = null;

  function updateFilterOptions() {
    const allEvents = buffer.getAll();
    const typeCounts: Record<string, number> = {};
    for (const e of allEvents) {
      typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
    }
    // Derive types from actual buffer contents (not the stale eventTypesSet)
    const types = Object.keys(typeCounts).sort();

    // Check if types or counts have changed
    const typesChanged = types.length !== lastKnownTypes.length || !types.every((t, i) => t === lastKnownTypes[i]);
    const countsChanged = !typesChanged && types.some(t => typeCounts[t] !== lastTypeCounts[t]);
    const totalChanged = allEvents.length !== Object.values(lastTypeCounts).reduce((a, b) => a + b, 0);

    if (!typesChanged && !countsChanged && !totalChanged) return;

    lastKnownTypes = types;
    lastTypeCounts = typeCounts;

    const currentValue = filterSelect.value;

    // Update "All Events" option with count
    filterSelect.options[0].textContent = `All Events (${allEvents.length})`;

    // Rebuild type options if types changed
    if (typesChanged) {
      while (filterSelect.options.length > 1) {
        filterSelect.remove(1);
      }
      for (const type of types) {
        const opt = createElement("option", "") as HTMLOptionElement;
        opt.value = type;
        opt.textContent = `${type} (${typeCounts[type] || 0})`;
        filterSelect.appendChild(opt);
      }
      // Reset to "All Events" if the previously selected type was evicted
      if (currentValue && types.includes(currentValue)) {
        filterSelect.value = currentValue;
      } else if (currentValue) {
        filterSelect.value = "";
        selectedType = "";
      }
    } else {
      // Just update counts on existing options
      for (let i = 1; i < filterSelect.options.length; i++) {
        const opt = filterSelect.options[i];
        opt.textContent = `${opt.value} (${typeCounts[opt.value] || 0})`;
      }
    }
  }

  function getFilteredEvents(): SSEEventRecord[] {
    let events = buffer.getAll();
    if (selectedType) {
      events = events.filter((e) => e.type === selectedType);
    }
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      events = events.filter(
        (e) =>
          e.type.toLowerCase().includes(lower) ||
          e.payload.toLowerCase().includes(lower)
      );
    }
    return events;
  }

  function hasActiveFilters(): boolean {
    return selectedType !== "" || searchTerm !== "";
  }

  function updateNow() {
    lastRenderTime = Date.now();
    pendingUpdate = false;

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
    const bufferHasEvents = buffer.getSize() > 0;

    // Show/hide no-results message
    if (newCount === 0 && bufferHasEvents && hasActiveFilters()) {
      noResultsMsg.textContent = searchTerm
        ? `No events matching '${searchTerm}'`
        : "No events matching filter";
      noResultsMsg.style.display = "";
      eventsList.style.display = "none";
    } else {
      noResultsMsg.style.display = "none";
      eventsList.style.display = "";
    }

    // Update Copy All button title based on active filters
    if (hasActiveFilters()) {
      copyAllBtn.title = `Copy Filtered (${newCount})`;
    } else {
      copyAllBtn.title = "Copy All";
    }

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

  // Minimum interval between renders (ms)
  const UPDATE_THROTTLE_MS = 100;

  function update() {
    const now = Date.now();
    const elapsed = now - lastRenderTime;

    if (elapsed >= UPDATE_THROTTLE_MS) {
      // Enough time has passed — render immediately
      if (pendingRafId !== null) {
        cancelAnimationFrame(pendingRafId);
        pendingRafId = null;
      }
      updateNow();
      return;
    }

    // Too soon — schedule a coalesced update if not already pending
    if (!pendingUpdate) {
      pendingUpdate = true;
      pendingRafId = requestAnimationFrame(() => {
        pendingRafId = null;
        updateNow();
      });
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
      let events: SSEEventRecord[];
      if (hasActiveFilters()) {
        // With filters active: copy only the filtered events from ring buffer
        events = filteredEvents;
      } else {
        // No filters: copy full history from IndexedDB if available
        events = getFullHistory
          ? await getFullHistory()
          : buffer.getAll();
      }
      await navigator.clipboard.writeText(JSON.stringify(events, null, 2));
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
    updateNow();
  };

  const handleFilterChange = () => {
    selectedType = filterSelect.value;
    lastFilteredCount = 0;
    newEventsSincePause = 0;
    userScrolledUp = false;
    scrollIndicator.style.display = "none";
    updateNow();
  };
  const handleSearchInput = () => {
    // Show/hide clear button based on input content
    searchClearBtn.style.display = searchInput.value ? "" : "none";
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      searchTerm = searchInput.value;
      lastFilteredCount = 0;
      newEventsSincePause = 0;
      userScrolledUp = false;
      scrollIndicator.style.display = "none";
      updateNow();
    }, 150);
  };

  const handleSearchClear = () => {
    searchInput.value = "";
    searchTerm = "";
    searchClearBtn.style.display = "none";
    if (searchTimeout) clearTimeout(searchTimeout);
    lastFilteredCount = 0;
    newEventsSincePause = 0;
    userScrolledUp = false;
    scrollIndicator.style.display = "none";
    updateNow();
  };

  // Keyboard shortcuts
  const handleKeyDown = (e: KeyboardEvent) => {
    const isMod = e.metaKey || e.ctrlKey;

    // Ctrl/Cmd + F: focus search
    if (isMod && e.key === "f") {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
      return;
    }

    // Escape handling
    if (e.key === "Escape") {
      // If a payload panel is open, dismiss it first
      if (activePanel) {
        dismissPanel();
        return;
      }
      if (document.activeElement === searchInput) {
        // When search is focused: clear and blur
        handleSearchClear();
        searchInput.blur();
        container.focus();
      } else if (onClose) {
        // When container is focused: close panel
        onClose();
      }
    }
  };

  // Dismiss payload panel on click outside
  const handleContainerClick = () => {
    dismissPanel();
  };

  copyAllBtn.addEventListener("click", handleCopyAll);
  clearBtn.addEventListener("click", handleClear);
  filterSelect.addEventListener("change", handleFilterChange);
  searchInput.addEventListener("input", handleSearchInput);
  searchClearBtn.addEventListener("click", handleSearchClear);
  container.addEventListener("keydown", handleKeyDown);
  container.addEventListener("click", handleContainerClick);

  function destroy() {
    if (searchTimeout) clearTimeout(searchTimeout);
    if (pendingRafId !== null) {
      cancelAnimationFrame(pendingRafId);
      pendingRafId = null;
    }
    pendingUpdate = false;
    dismissPanel();
    scroller.destroy();
    eventsList.removeEventListener("scroll", handleListScroll);
    copyAllBtn.removeEventListener("click", handleCopyAll);
    clearBtn.removeEventListener("click", handleClear);
    filterSelect.removeEventListener("change", handleFilterChange);
    searchInput.removeEventListener("input", handleSearchInput);
    searchClearBtn.removeEventListener("click", handleSearchClear);
    container.removeEventListener("keydown", handleKeyDown);
    container.removeEventListener("click", handleContainerClick);
  }

  return { element: container, update, destroy };
}
