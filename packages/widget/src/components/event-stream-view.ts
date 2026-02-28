import { createElement } from "../utils/dom";
import { renderLucideIcon } from "../utils/icons";
import type { EventStreamBuffer } from "../utils/event-stream-buffer";
import type {
  SSEEventRecord,
  AgentWidgetConfig,
  EventStreamConfig,
  EventStreamBadgeColor,
} from "../types";
import type { AgentWidgetPlugin } from "../plugins/types";

// ============================================================================
// Helpers
// ============================================================================

/** Append custom class names to an element if provided. */
function applyCustomClasses(el: HTMLElement, classes?: string): void {
  if (classes) {
    classes.split(/\s+/).forEach((c) => c && el.classList.add(c));
  }
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_BADGE_COLORS: Record<string, EventStreamBadgeColor> = {
  flow_: { bg: "#dcfce7", text: "#166534" },
  step_: { bg: "#dbeafe", text: "#1e40af" },
  reason_: { bg: "#ffedd5", text: "#9a3412" },
  tool_: { bg: "#f3e8ff", text: "#6b21a8" },
  agent_: { bg: "#ccfbf1", text: "#115e59" },
  error: { bg: "#fecaca", text: "#991b1b" },
};
const DEFAULT_BADGE_COLOR: EventStreamBadgeColor = {
  bg: "#f3f4f6",
  text: "#4b5563",
};

const DEFAULT_DESCRIPTION_FIELDS = [
  "flowName",
  "stepName",
  "reasoningText",
  "text",
  "name",
  "tool",
  "toolName",
];

// Minimum interval between renders (ms)
const UPDATE_THROTTLE_MS = 100;

// ============================================================================
// Helper Functions
// ============================================================================

function getBadgeColor(
  eventType: string,
  customColors?: Record<string, EventStreamBadgeColor>
): EventStreamBadgeColor {
  const allColors = { ...DEFAULT_BADGE_COLORS, ...customColors };
  // Exact match first
  if (allColors[eventType]) return allColors[eventType];
  // Prefix match (keys ending with "_")
  for (const prefix of Object.keys(allColors)) {
    if (prefix.endsWith("_") && eventType.startsWith(prefix)) {
      return allColors[prefix];
    }
  }
  return DEFAULT_BADGE_COLOR;
}

function formatRelativeTimestamp(ms: number, firstEventMs: number): string {
  const delta = (ms - firstEventMs) / 1000;
  return `+${delta.toFixed(3)}s`;
}

function formatAbsoluteTimestamp(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const mmm = String(d.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${mmm}`;
}

function extractDescription(
  payload: string,
  fields: string[]
): string | null {
  try {
    const obj = JSON.parse(payload) as Record<string, unknown>;
    if (typeof obj !== "object" || obj === null) return null;
    for (const field of fields) {
      const parts = field.split(".");
      let current: unknown = obj;
      for (const part of parts) {
        if (current && typeof current === "object" && current !== null) {
          current = (current as Record<string, unknown>)[part];
        } else {
          current = undefined;
          break;
        }
      }
      if (typeof current === "string" && current.trim()) return current.trim();
    }
  } catch {
    // Not JSON, no description
  }
  return null;
}

function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve) => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    resolve();
  });
}

function formatEventForCopy(event: SSEEventRecord): string {
  let formattedPayload: unknown;
  try {
    formattedPayload = JSON.parse(event.payload);
  } catch {
    formattedPayload = event.payload;
  }
  return JSON.stringify(
    {
      type: event.type,
      timestamp: new Date(event.timestamp).toISOString(),
      payload: formattedPayload,
    },
    null,
    2
  );
}

// ============================================================================
// Inline Payload Component
// ============================================================================

function renderInlinePayload(
  event: SSEEventRecord,
  plugins: AgentWidgetPlugin[],
  config: AgentWidgetConfig | undefined
): HTMLElement {
  let formattedPayload: string;
  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(event.payload);
    formattedPayload = JSON.stringify(parsedPayload, null, 2);
  } catch {
    parsedPayload = event.payload;
    formattedPayload = event.payload;
  }

  // Plugin hook: renderEventStreamPayload
  const payloadPlugin = plugins.find((p) => p.renderEventStreamPayload);
  if (payloadPlugin?.renderEventStreamPayload && config) {
    const customPayload = payloadPlugin.renderEventStreamPayload({
      event,
      config,
      defaultRenderer: () => renderDefaultPayload(),
      parsedPayload,
    });
    if (customPayload) return customPayload;
  }

  return renderDefaultPayload();

  function renderDefaultPayload(): HTMLElement {
    const payloadContainer = createElement(
      "div",
      "tvw-bg-cw-container tvw-border-t tvw-border-cw-divider tvw-px-3 tvw-py-2 tvw-ml-4 tvw-mr-3 tvw-mb-1 tvw-rounded-b tvw-overflow-auto tvw-max-h-[300px]"
    );

    const payloadContent = createElement(
      "pre",
      "tvw-m-0 tvw-whitespace-pre-wrap tvw-break-all tvw-text-[11px] tvw-text-cw-secondary tvw-font-mono"
    );
    payloadContent.textContent = formattedPayload;

    payloadContainer.appendChild(payloadContent);
    return payloadContainer;
  }
}

// ============================================================================
// Event Row Component
// ============================================================================

function renderEventRow(
  event: SSEEventRecord,
  index: number,
  firstTimestamp: number,
  esConfig: EventStreamConfig,
  expandedSet: Set<string>,
  onToggleExpand: (eventId: string) => void,
  plugins: AgentWidgetPlugin[],
  config: AgentWidgetConfig | undefined
): HTMLElement {
  const isExpanded = expandedSet.has(event.id);
  const wrapper = createElement(
    "div",
    "tvw-border-b tvw-border-cw-divider tvw-text-xs"
  );
  applyCustomClasses(wrapper, esConfig.classNames?.eventRow);

  // Plugin hook: renderEventStreamRow
  const rowPlugin = plugins.find((p) => p.renderEventStreamRow);
  if (rowPlugin?.renderEventStreamRow && config) {
    const customRow = rowPlugin.renderEventStreamRow({
      event,
      index,
      config,
      defaultRenderer: () => buildDefaultRowContent(),
      isExpanded,
      onToggleExpand: () => onToggleExpand(event.id),
    });
    if (customRow) {
      wrapper.appendChild(customRow);
      return wrapper;
    }
  }

  wrapper.appendChild(buildDefaultRowContent());
  return wrapper;

  function buildDefaultRowContent(): HTMLElement {
    const container = createElement("div", "");

    // Main row line
    const row = createElement(
      "div",
      "tvw-flex tvw-items-center tvw-gap-2 tvw-px-3 tvw-py-3 hover:tvw-bg-cw-container tvw-cursor-pointer tvw-group"
    );
    row.setAttribute("data-event-id", event.id);

    // 1. Chevron (expand/collapse)
    const chevron = createElement(
      "span",
      "tvw-flex-shrink-0 tvw-text-cw-muted tvw-w-4 tvw-text-center tvw-flex tvw-items-center tvw-justify-center"
    );
    const chevronIcon = renderLucideIcon(
      isExpanded ? "chevron-down" : "chevron-right",
      "14px",
      "currentColor",
      2
    );
    if (chevronIcon) chevron.appendChild(chevronIcon);

    // 2. Timestamp
    const timestamp = createElement(
      "span",
      "tvw-text-[11px] tvw-text-cw-muted tvw-whitespace-nowrap tvw-flex-shrink-0 tvw-font-mono tvw-w-[70px]"
    );
    const tsFormat = esConfig.timestampFormat ?? "relative";
    timestamp.textContent =
      tsFormat === "relative"
        ? formatRelativeTimestamp(event.timestamp, firstTimestamp)
        : formatAbsoluteTimestamp(event.timestamp);

    // 3. Sequence number
    let seqNum: HTMLElement | null = null;
    if (esConfig.showSequenceNumbers !== false) {
      seqNum = createElement(
        "span",
        "tvw-text-[11px] tvw-text-cw-muted tvw-font-mono tvw-flex-shrink-0 tvw-w-[28px] tvw-text-right"
      );
      seqNum.textContent = String(index + 1);
    }

    // 4. Color-coded type badge
    const badgeColor = getBadgeColor(event.type, esConfig.badgeColors);
    const badge = createElement(
      "span",
      "tvw-inline-flex tvw-items-center tvw-px-2 tvw-py-0.5 tvw-rounded tvw-text-[11px] tvw-font-mono tvw-font-medium tvw-whitespace-nowrap tvw-flex-shrink-0 tvw-border"
    );
    badge.style.backgroundColor = badgeColor.bg;
    badge.style.color = badgeColor.text;
    badge.style.borderColor = badgeColor.text + "50";
    badge.textContent = event.type;

    // 5. Description (extracted from payload)
    const descFields =
      esConfig.descriptionFields ?? DEFAULT_DESCRIPTION_FIELDS;
    const desc = extractDescription(event.payload, descFields);
    let descEl: HTMLElement | null = null;
    if (desc) {
      descEl = createElement(
        "span",
        "tvw-text-[11px] tvw-text-cw-secondary tvw-truncate tvw-min-w-0"
      );
      descEl.textContent = desc;
    }

    // 6. Spacer
    const spacer = createElement("div", "tvw-flex-1 tvw-min-w-0");

    // 7. Copy button
    const copyBtn = createElement(
      "button",
      "tvw-text-cw-muted hover:tvw-text-cw-primary tvw-cursor-pointer tvw-flex-shrink-0 tvw-border-none tvw-bg-transparent tvw-p-0"
    );
    const clipIcon = renderLucideIcon(
      "clipboard",
      "12px",
      "currentColor",
      1.5
    );
    if (clipIcon) copyBtn.appendChild(clipIcon);
    copyBtn.addEventListener("click", async (e: Event) => {
      e.stopPropagation();
      await copyToClipboard(formatEventForCopy(event));
      // Visual feedback
      copyBtn.innerHTML = "";
      const checkIcon = renderLucideIcon(
        "check",
        "12px",
        "currentColor",
        1.5
      );
      if (checkIcon) copyBtn.appendChild(checkIcon);
      setTimeout(() => {
        copyBtn.innerHTML = "";
        const restoreIcon = renderLucideIcon(
          "clipboard",
          "12px",
          "currentColor",
          1.5
        );
        if (restoreIcon) copyBtn.appendChild(restoreIcon);
      }, 1500);
    });

    // Assemble row
    row.appendChild(chevron);
    row.appendChild(timestamp);
    if (seqNum) row.appendChild(seqNum);
    row.appendChild(badge);
    if (descEl) row.appendChild(descEl);
    row.appendChild(spacer);
    row.appendChild(copyBtn);

    container.appendChild(row);

    // Expanded payload (inline)
    if (isExpanded) {
      container.appendChild(
        renderInlinePayload(event, plugins, config)
      );
    }

    return container;
  }
}

// ============================================================================
// Main View
// ============================================================================

export type EventStreamViewOptions = {
  buffer: EventStreamBuffer;
  getFullHistory?: () => Promise<SSEEventRecord[]>;
  onClose?: () => void;
  config?: AgentWidgetConfig;
  plugins?: AgentWidgetPlugin[];
};

export function createEventStreamView(
  options: EventStreamViewOptions
): {
  element: HTMLElement;
  update: () => void;
  destroy: () => void;
} {
  const {
    buffer,
    getFullHistory,
    onClose,
    config,
    plugins = [],
  } = options;

  const esConfig: EventStreamConfig = config?.features?.eventStream ?? {};

  // --- Plugin hook: renderEventStreamView (replace entire view) ---
  const viewPlugin = plugins.find((p) => p.renderEventStreamView);
  if (viewPlugin?.renderEventStreamView && config) {
    const customView = viewPlugin.renderEventStreamView({
      config,
      events: buffer.getAll(),
      defaultRenderer: () => buildDefaultView().element,
      onClose,
    });
    if (customView) {
      return {
        element: customView,
        update: () => {
          // Plugin manages its own updates
        },
        destroy: () => {
          // Plugin manages its own cleanup
        },
      };
    }
  }

  return buildDefaultView();

  function buildDefaultView(): {
    element: HTMLElement;
    update: () => void;
    destroy: () => void;
  } {
    const customClasses = esConfig.classNames;
    const container = createElement(
      "div",
      "tvw-event-stream-view tvw-flex tvw-flex-col tvw-flex-1 tvw-min-h-0"
    );
    applyCustomClasses(container, customClasses?.panel);

    // State
    let filteredEvents: SSEEventRecord[] = [];
    let selectedType = "";
    let searchTerm = "";
    let searchTimeout: ReturnType<typeof setTimeout> | null = null;
    let lastKnownTypes: string[] = [];
    let lastTypeCounts: Record<string, number> = {};
    let lastFilteredCount = 0;
    let userScrolledUp = false;
    let newEventsSincePause = 0;
    let lastRenderTime = 0;
    let pendingUpdate = false;
    let pendingRafId: number | null = null;
    let suppressScrollHandler = false;
    let lastScrollTop = 0;
    const expandedSet = new Set<string>();

    // Incremental rendering state
    const rowElements = new Map<string, HTMLElement>();
    let lastRenderedFilter = "";
    let lastRenderedSearch = "";
    let dirtyExpandId: string | null = null;

    // ========================================================================
    // Toolbar: Header Bar + Search Bar
    // ========================================================================

    // Elements we need references to across functions
    // These are assigned inside buildDefaultToolbar() which always runs
    let countBadge!: HTMLElement;
    let filterSelect!: HTMLSelectElement;
    let copyAllBtn!: HTMLButtonElement;
    let searchInput!: HTMLInputElement;
    let searchClearBtn!: HTMLButtonElement;

    function buildDefaultToolbar(): HTMLElement {
      const toolbarOuter = createElement(
        "div",
        "tvw-flex tvw-flex-col tvw-flex-shrink-0"
      );

      // --- Header bar ---
      const headerBar = createElement(
        "div",
        "tvw-flex tvw-items-center tvw-gap-2 tvw-px-4 tvw-py-3 tvw-pb-0 tvw-border-cw-divider tvw-bg-cw-surface tvw-overflow-hidden"
      );
      applyCustomClasses(headerBar, customClasses?.headerBar);

      // Title
      const title = createElement(
        "span",
        "tvw-text-sm tvw-font-medium tvw-text-cw-primary tvw-whitespace-nowrap"
      );
      title.textContent = "Events";

      // Count badge
      countBadge = createElement(
        "span",
        "tvw-text-[11px] tvw-font-mono tvw-bg-cw-container tvw-text-cw-muted tvw-px-2 tvw-py-0.5 tvw-rounded tvw-border tvw-border-cw-border"
      );
      countBadge.textContent = "0";

      const headerSpacer = createElement("div", "tvw-flex-1");

      // Filter dropdown
      filterSelect = createElement(
        "select",
        "tvw-text-xs tvw-bg-cw-surface tvw-border tvw-border-cw-border tvw-rounded tvw-px-2.5 tvw-py-1 tvw-text-cw-primary tvw-cursor-pointer"
      ) as HTMLSelectElement;
      const allOption = createElement("option", "") as HTMLOptionElement;
      allOption.value = "";
      allOption.textContent = "All events";
      filterSelect.appendChild(allOption);

      // Copy All button
      const iconBtnClass =
        "tvw-inline-flex tvw-items-center tvw-gap-1.5 tvw-rounded tvw-text-xs tvw-text-cw-muted hover:tvw-bg-cw-container hover:tvw-text-cw-primary tvw-cursor-pointer tvw-border tvw-border-cw-border tvw-bg-cw-surface tvw-flex-shrink-0 tvw-px-2.5 tvw-py-1";

      copyAllBtn = createElement(
        "button",
        iconBtnClass
      ) as HTMLButtonElement;
      copyAllBtn.type = "button";
      copyAllBtn.title = "Copy All";
      const copyAllIcon = renderLucideIcon(
        "clipboard-copy",
        "12px",
        "currentColor",
        1.5
      );
      if (copyAllIcon) copyAllBtn.appendChild(copyAllIcon);
      const copyAllLabel = createElement(
        "span",
        "tvw-text-xs"
      );
      copyAllLabel.textContent = "Copy All";
      copyAllBtn.appendChild(copyAllLabel);

      headerBar.appendChild(title);
      headerBar.appendChild(countBadge);
      headerBar.appendChild(headerSpacer);
      headerBar.appendChild(filterSelect);
      headerBar.appendChild(copyAllBtn);

      // --- Search bar ---
      const searchBar = createElement(
        "div",
        "tvw-relative tvw-px-4 tvw-py-2.5 tvw-border-b tvw-border-cw-divider tvw-bg-cw-surface"
      );
      applyCustomClasses(searchBar, customClasses?.searchBar);

      // Search icon
      const searchIcon = renderLucideIcon(
        "search",
        "14px",
        "var(--cw-muted, #9ca3af)",
        1.5
      );
      const searchIconWrapper = createElement(
        "span",
        "tvw-absolute tvw-left-6 tvw-top-1/2 tvw--translate-y-1/2 tvw-pointer-events-none tvw-flex tvw-items-center"
      );
      if (searchIcon) searchIconWrapper.appendChild(searchIcon);

      searchInput = createElement(
        "input",
        "tvw-text-sm tvw-bg-cw-surface tvw-border tvw-border-cw-border tvw-rounded-md tvw-pl-8 tvw-pr-3 tvw-py-1 tvw-w-full tvw-text-cw-primary"
      ) as HTMLInputElement;
      applyCustomClasses(searchInput, customClasses?.searchInput);
      searchInput.type = "text";
      searchInput.placeholder = "Search event payloads...";

      searchClearBtn = createElement(
        "button",
        "tvw-absolute tvw-right-5 tvw-top-1/2 tvw--translate-y-1/2 tvw-text-cw-muted hover:tvw-text-cw-primary tvw-cursor-pointer tvw-border-none tvw-bg-transparent tvw-p-0 tvw-leading-none"
      ) as HTMLButtonElement;
      searchClearBtn.type = "button";
      searchClearBtn.style.display = "none";
      const clearSearchIcon = renderLucideIcon(
        "x",
        "12px",
        "currentColor",
        2
      );
      if (clearSearchIcon) searchClearBtn.appendChild(clearSearchIcon);

      searchBar.appendChild(searchIconWrapper);
      searchBar.appendChild(searchInput);
      searchBar.appendChild(searchClearBtn);

      toolbarOuter.appendChild(headerBar);
      toolbarOuter.appendChild(searchBar);
      return toolbarOuter;
    }

    // Build toolbar (with plugin hook)
    let toolbar: HTMLElement;
    const toolbarPlugin = plugins.find((p) => p.renderEventStreamToolbar);
    if (toolbarPlugin?.renderEventStreamToolbar && config) {
      const customToolbar = toolbarPlugin.renderEventStreamToolbar({
        config,
        defaultRenderer: () => buildDefaultToolbar(),
        eventCount: buffer.getSize(),
        filteredCount: 0,
        onFilterChange: (type: string) => {
          selectedType = type;
          resetScrollState();
          updateNow();
        },
        onSearchChange: (term: string) => {
          searchTerm = term;
          resetScrollState();
          updateNow();
        },
      });
      toolbar = customToolbar ?? buildDefaultToolbar();
    } else {
      toolbar = buildDefaultToolbar();
    }

    // ========================================================================
    // Truncation Banner
    // ========================================================================

    const truncationBanner = createElement(
      "div",
      "tvw-text-xs tvw-text-cw-muted tvw-text-center tvw-py-0.5 tvw-px-4 tvw-bg-cw-container tvw-border-b tvw-border-cw-divider tvw-italic tvw-flex-shrink-0"
    );
    truncationBanner.style.display = "none";

    // ========================================================================
    // Events List (simple DOM, no virtual scroller)
    // ========================================================================

    const eventsListWrapper = createElement(
      "div",
      "tvw-flex-1 tvw-min-h-0 tvw-relative"
    );

    const eventsList = createElement(
      "div",
      "tvw-event-stream-list tvw-overflow-y-auto tvw-min-h-0"
    );
    eventsList.style.height = "100%";

    // Scroll-to-bottom indicator
    const scrollIndicator = createElement(
      "div",
      "tvw-absolute tvw-bottom-3 tvw-left-1/2 tvw-transform tvw--translate-x-1/2 tvw-bg-cw-accent tvw-text-white tvw-text-xs tvw-px-3 tvw-py-1.5 tvw-rounded-full tvw-cursor-pointer tvw-shadow-md tvw-z-10 tvw-flex tvw-items-center tvw-gap-1"
    );
    applyCustomClasses(scrollIndicator, customClasses?.scrollIndicator);
    scrollIndicator.style.display = "none";
    const arrowIcon = renderLucideIcon(
      "arrow-down",
      "12px",
      "currentColor",
      2
    );
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

    // ========================================================================
    // Assemble container
    // ========================================================================

    container.setAttribute("tabindex", "0");
    container.appendChild(toolbar);
    container.appendChild(truncationBanner);
    container.appendChild(eventsListWrapper);

    // ========================================================================
    // Filtering & Search Logic
    // ========================================================================

    function updateFilterOptions() {
      const allEvents = buffer.getAll();
      const typeCounts: Record<string, number> = {};
      for (const e of allEvents) {
        typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
      }
      const types = Object.keys(typeCounts).sort();

      const typesChanged =
        types.length !== lastKnownTypes.length ||
        !types.every((t, i) => t === lastKnownTypes[i]);
      const countsChanged =
        !typesChanged &&
        types.some((t) => typeCounts[t] !== lastTypeCounts[t]);
      const totalChanged =
        allEvents.length !==
        Object.values(lastTypeCounts).reduce((a, b) => a + b, 0);

      if (!typesChanged && !countsChanged && !totalChanged) return;

      lastKnownTypes = types;
      lastTypeCounts = typeCounts;

      if (!filterSelect) return;

      const currentValue = filterSelect.value;

      // Update "All events" option
      filterSelect.options[0].textContent = `All events`;

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
        if (currentValue && types.includes(currentValue)) {
          filterSelect.value = currentValue;
        } else if (currentValue) {
          filterSelect.value = "";
          selectedType = "";
        }
      } else {
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

    function resetScrollState() {
      lastFilteredCount = 0;
      newEventsSincePause = 0;
      userScrolledUp = false;
      scrollIndicator.style.display = "none";
    }

    function toggleExpand(eventId: string) {
      if (expandedSet.has(eventId)) {
        expandedSet.delete(eventId);
      } else {
        expandedSet.add(eventId);
      }
      dirtyExpandId = eventId;
      // Save scroll position — user-initiated expand/collapse should not auto-scroll
      const savedScrollTop = eventsList.scrollTop;
      const wasUserScrolledUp = userScrolledUp;
      suppressScrollHandler = true;
      userScrolledUp = true; // prevent auto-scroll during re-render
      updateNow();
      eventsList.scrollTop = savedScrollTop;
      userScrolledUp = wasUserScrolledUp;
      suppressScrollHandler = false;
    }

    // ========================================================================
    // Render Logic
    // ========================================================================

    function isNearBottom(): boolean {
      const threshold = 50;
      return (
        eventsList.scrollHeight -
          eventsList.scrollTop -
          eventsList.clientHeight <=
        threshold
      );
    }

    function updateNow() {
      lastRenderTime = Date.now();
      pendingUpdate = false;

      updateFilterOptions();

      // Truncation banner
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

      // Update count badge
      if (countBadge) {
        countBadge.textContent = String(buffer.getSize());
      }

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

      // Update Copy All button title
      if (copyAllBtn) {
        copyAllBtn.title = hasActiveFilters()
          ? `Copy Filtered (${newCount})`
          : "Copy All";
      }

      // Track new events since user scrolled up
      if (userScrolledUp && newCount > lastFilteredCount) {
        newEventsSincePause += newCount - lastFilteredCount;
        indicatorText.textContent = `${newEventsSincePause} new event${newEventsSincePause === 1 ? "" : "s"}`;
        scrollIndicator.style.display = "";
      }
      lastFilteredCount = newCount;

      // Get first event timestamp for relative time calculations
      // Use the unfiltered first event for consistent time references
      const allEvents = buffer.getAll();
      const firstTimestamp =
        allEvents.length > 0 ? allEvents[0].timestamp : 0;

      // Clean up expanded state for evicted events
      const currentIds = new Set(filteredEvents.map((e) => e.id));
      for (const id of expandedSet) {
        if (!currentIds.has(id)) expandedSet.delete(id);
      }

      // Determine which rendering path to use
      const filterChanged =
        selectedType !== lastRenderedFilter ||
        searchTerm !== lastRenderedSearch;
      const isFirstRender = rowElements.size === 0 && filteredEvents.length > 0;

      if (filterChanged || isFirstRender || filteredEvents.length === 0) {
        // Path A — Full rebuild (filter/search changed, first render, or empty list)
        eventsList.innerHTML = "";
        rowElements.clear();
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < filteredEvents.length; i++) {
          const row = renderEventRow(
            filteredEvents[i],
            i,
            firstTimestamp,
            esConfig,
            expandedSet,
            toggleExpand,
            plugins,
            config
          );
          rowElements.set(filteredEvents[i].id, row);
          fragment.appendChild(row);
        }
        eventsList.appendChild(fragment);
        lastRenderedFilter = selectedType;
        lastRenderedSearch = searchTerm;
        dirtyExpandId = null;
      } else {
        // Path B — Single row replace (expand/collapse)
        if (dirtyExpandId !== null) {
          const oldRow = rowElements.get(dirtyExpandId);
          if (oldRow && oldRow.parentNode === eventsList) {
            // Find the index of this event in filteredEvents for correct seq number
            const idx = filteredEvents.findIndex(
              (e) => e.id === dirtyExpandId
            );
            if (idx >= 0) {
              const newRow = renderEventRow(
                filteredEvents[idx],
                idx,
                firstTimestamp,
                esConfig,
                expandedSet,
                toggleExpand,
                plugins,
                config
              );
              eventsList.insertBefore(newRow, oldRow);
              oldRow.remove();
              rowElements.set(dirtyExpandId, newRow);
            }
          }
          dirtyExpandId = null;
        }

        // Path C — Incremental append (default streaming path)
        // Remove evicted rows
        const activeIds = new Set(filteredEvents.map((e) => e.id));
        for (const [id, el] of rowElements) {
          if (!activeIds.has(id)) {
            el.remove();
            rowElements.delete(id);
          }
        }
        // Append new rows (events not yet in rowElements)
        for (let i = 0; i < filteredEvents.length; i++) {
          const evt = filteredEvents[i];
          if (!rowElements.has(evt.id)) {
            const row = renderEventRow(
              evt,
              i,
              firstTimestamp,
              esConfig,
              expandedSet,
              toggleExpand,
              plugins,
              config
            );
            rowElements.set(evt.id, row);
            eventsList.appendChild(row);
          }
        }
      }

      // Auto-scroll if user hasn't scrolled up
      if (!userScrolledUp) {
        eventsList.scrollTop = eventsList.scrollHeight;
      }
    }

    function update() {
      const now = Date.now();
      const elapsed = now - lastRenderTime;

      if (elapsed >= UPDATE_THROTTLE_MS) {
        if (pendingRafId !== null) {
          cancelAnimationFrame(pendingRafId);
          pendingRafId = null;
        }
        updateNow();
        return;
      }

      if (!pendingUpdate) {
        pendingUpdate = true;
        pendingRafId = requestAnimationFrame(() => {
          pendingRafId = null;
          updateNow();
        });
      }
    }

    // ========================================================================
    // Event Handlers
    // ========================================================================

    const swapCopyAllIcon = (
      iconName: string,
      restoreAfterMs: number
    ) => {
      if (!copyAllBtn) return;
      copyAllBtn.innerHTML = "";
      const icon = renderLucideIcon(
        iconName,
        "12px",
        "currentColor",
        1.5
      );
      if (icon) copyAllBtn.appendChild(icon);
      const label = createElement("span", "tvw-text-xs");
      label.textContent = "Copy All";
      copyAllBtn.appendChild(label);
      setTimeout(() => {
        copyAllBtn.innerHTML = "";
        const original = renderLucideIcon(
          "clipboard-copy",
          "12px",
          "currentColor",
          1.5
        );
        if (original) copyAllBtn.appendChild(original);
        const restoreLabel = createElement("span", "tvw-text-xs");
        restoreLabel.textContent = "Copy All";
        copyAllBtn.appendChild(restoreLabel);
        copyAllBtn.disabled = false;
      }, restoreAfterMs);
    };

    const handleCopyAll = async () => {
      if (!copyAllBtn) return;
      copyAllBtn.disabled = true;
      try {
        let events: SSEEventRecord[];
        if (hasActiveFilters()) {
          events = filteredEvents;
        } else {
          if (getFullHistory) {
            events = await getFullHistory();
            if (events.length === 0) events = buffer.getAll();
          } else {
            events = buffer.getAll();
          }
        }
        const parsed = events.map((e) => {
          try {
            return JSON.parse(e.payload);
          } catch {
            return e.payload;
          }
        });
        await navigator.clipboard.writeText(
          JSON.stringify(parsed, null, 2)
        );
        swapCopyAllIcon("check", 1500);
      } catch {
        swapCopyAllIcon("x", 1500);
      }
    };

    const handleFilterChange = () => {
      if (!filterSelect) return;
      selectedType = filterSelect.value;
      resetScrollState();
      updateNow();
    };

    const handleSearchInput = () => {
      if (!searchInput || !searchClearBtn) return;
      searchClearBtn.style.display = searchInput.value ? "" : "none";
      if (searchTimeout) clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        searchTerm = searchInput.value;
        resetScrollState();
        updateNow();
      }, 150);
    };

    const handleSearchClear = () => {
      if (!searchInput || !searchClearBtn) return;
      searchInput.value = "";
      searchTerm = "";
      searchClearBtn.style.display = "none";
      if (searchTimeout) clearTimeout(searchTimeout);
      resetScrollState();
      updateNow();
    };

    const handleListScroll = () => {
      if (suppressScrollHandler) return;
      const currentScrollTop = eventsList.scrollTop;
      const scrollingDown = currentScrollTop > lastScrollTop;
      lastScrollTop = currentScrollTop;

      if (isNearBottom() && scrollingDown) {
        // User scrolled back down to bottom — re-enable auto-scroll
        userScrolledUp = false;
        newEventsSincePause = 0;
        scrollIndicator.style.display = "none";
      } else if (!isNearBottom()) {
        userScrolledUp = true;
      }
    };

    // Wheel events fire synchronously before rAF callbacks, so we can
    // detect upward scroll intent before the next updateNow() auto-scrolls.
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) {
        userScrolledUp = true;
      }
    };

    const handleScrollIndicatorClick = () => {
      eventsList.scrollTop = eventsList.scrollHeight;
      userScrolledUp = false;
      newEventsSincePause = 0;
      scrollIndicator.style.display = "none";
    };

    // Delegated click handler for expand/collapse (survives DOM rebuilds)
    const handleRowClick = (e: Event) => {
      const target = e.target as Element;
      if (!target) return;
      // Skip if clicking copy button or its children
      if (target.closest("button")) return;
      // Find the closest row with an event ID
      const row = target.closest("[data-event-id]") as HTMLElement | null;
      if (!row) return;
      const eventId = row.getAttribute("data-event-id");
      if (eventId) toggleExpand(eventId);
    };

    // Keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;

      if (isMod && e.key === "f") {
        e.preventDefault();
        searchInput?.focus();
        searchInput?.select();
        return;
      }

      if (e.key === "Escape") {
        if (
          searchInput &&
          document.activeElement === searchInput
        ) {
          handleSearchClear();
          searchInput.blur();
          container.focus();
        } else if (onClose) {
          onClose();
        }
      }
    };

    // ========================================================================
    // Wire up event listeners
    // ========================================================================

    if (copyAllBtn) copyAllBtn.addEventListener("click", handleCopyAll);
    if (filterSelect)
      filterSelect.addEventListener("change", handleFilterChange);
    if (searchInput)
      searchInput.addEventListener("input", handleSearchInput);
    if (searchClearBtn)
      searchClearBtn.addEventListener("click", handleSearchClear);
    eventsList.addEventListener("scroll", handleListScroll);
    eventsList.addEventListener("wheel", handleWheel, { passive: true });
    eventsList.addEventListener("click", handleRowClick);
    scrollIndicator.addEventListener("click", handleScrollIndicatorClick);
    container.addEventListener("keydown", handleKeyDown);

    // ========================================================================
    // Destroy / Cleanup
    // ========================================================================

    function destroy() {
      if (searchTimeout) clearTimeout(searchTimeout);
      if (pendingRafId !== null) {
        cancelAnimationFrame(pendingRafId);
        pendingRafId = null;
      }
      pendingUpdate = false;
      rowElements.clear();
      if (copyAllBtn)
        copyAllBtn.removeEventListener("click", handleCopyAll);
      if (filterSelect)
        filterSelect.removeEventListener("change", handleFilterChange);
      if (searchInput)
        searchInput.removeEventListener("input", handleSearchInput);
      if (searchClearBtn)
        searchClearBtn.removeEventListener("click", handleSearchClear);
      eventsList.removeEventListener("scroll", handleListScroll);
      eventsList.removeEventListener("wheel", handleWheel);
      eventsList.removeEventListener("click", handleRowClick);
      scrollIndicator.removeEventListener(
        "click",
        handleScrollIndicatorClick
      );
      container.removeEventListener("keydown", handleKeyDown);
    }

    return { element: container, update, destroy };
  }
}
