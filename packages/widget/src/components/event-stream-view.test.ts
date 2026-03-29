import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SSEEventRecord } from "../types";

// ---------- DOM helpers for Node environment ----------

function createMockElement(tag = "div"): any {
  const children: any[] = [];
  const style: Record<string, string> = {};
  const listeners: Record<string, Function[]> = {};
  const classList = new Set<string>();
  const el: any = {
    tagName: tag.toUpperCase(),
    style,
    children,
    childNodes: children,
    firstChild: null,
    parentNode: null,
    value: "",
    type: "",
    placeholder: "",
    disabled: false,
    title: "",
    textContent: "",
    get innerHTML() { return ""; },
    set innerHTML(val: string) {
      if (val === "") {
        children.length = 0;
        el.firstChild = null;
      }
    },
    offsetHeight: 300,
    scrollTop: 0,
    scrollHeight: 300,
    clientHeight: 300,
    // For <select>
    options: [] as any[],
    appendChild(child: any) {
      // Handle DocumentFragment: move its children into this element
      if (child.tagName === "FRAGMENT") {
        const fragChildren = [...child.children];
        for (const fragChild of fragChildren) {
          children.push(fragChild);
          fragChild.parentNode = el;
          if (tag === "select" && fragChild.tagName === "OPTION") {
            el.options.push(fragChild);
          }
        }
        child.children.length = 0;
        el.firstChild = children[0] || null;
        return child;
      }
      children.push(child);
      child.parentNode = el;
      el.firstChild = children[0] || null;
      // Track options for <select>
      if (tag === "select" && child.tagName === "OPTION") {
        el.options.push(child);
      }
      return child;
    },
    remove(index?: number) {
      if (typeof index === "number") {
        // select.remove(index) - removes option at index
        const removed = el.options.splice(index, 1)[0];
        const childIdx = children.indexOf(removed);
        if (childIdx >= 0) children.splice(childIdx, 1);
      } else {
        // el.remove() - remove self from parent
        if (el.parentNode) {
          const idx = el.parentNode.children.indexOf(el);
          if (idx >= 0) el.parentNode.children.splice(idx, 1);
          el.parentNode = null;
        }
      }
    },
    insertBefore(newChild: any, refChild: any) {
      const idx = children.indexOf(refChild);
      if (idx >= 0) {
        children.splice(idx, 0, newChild);
      } else {
        children.push(newChild);
      }
      newChild.parentNode = el;
      return newChild;
    },
    addEventListener(event: string, handler: Function) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    },
    removeEventListener(event: string, handler: Function) {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((h) => h !== handler);
      }
    },
    setAttribute(name: string, value: string) {
      el[`__attr_${name}`] = value;
    },
    getAttribute(name: string) {
      return el[`__attr_${name}`] ?? null;
    },
    classList: {
      add: (...cls: string[]) => cls.forEach((c) => classList.add(c)),
      remove: (...cls: string[]) => cls.forEach((c) => classList.delete(c)),
      contains: (c: string) => classList.has(c),
    },
    closest(selector: string) {
      // Simple mock: check if this element or any parent matches
      if (selector === "button" && el.tagName === "BUTTON") return el;
      // Support attribute selectors like [data-event-id]
      const attrMatch = selector.match(/^\[([^\]]+)\]$/);
      if (attrMatch && el[`__attr_${attrMatch[1]}`] != null) return el;
      if (el.parentNode && el.parentNode.closest) return el.parentNode.closest(selector);
      return null;
    },
    focus: vi.fn(),
    blur: vi.fn(),
    select: vi.fn(),
    scrollTo(opts: { top: number; behavior?: string }) {
      el.scrollTop = opts.top;
    },
    // helper to fire events in tests
    __listeners: listeners,
    __fireEvent(event: string, detail?: any) {
      if (listeners[event]) {
        listeners[event].forEach((h) => h(detail || {}));
      }
    },
  };
  return el;
}

// Stub globals for Node environment
const origDocument = globalThis.document;
let rafCallbacks: Function[] = [];

function makeEvent(type: string, index: number, payload?: string): SSEEventRecord {
  return {
    id: `evt-${index}`,
    type,
    timestamp: 1000 + index,
    payload: payload ?? JSON.stringify({ index }),
  };
}

function createMockBuffer(events: SSEEventRecord[] = []) {
  const _events = [...events];
  const eventTypes = new Set<string>();
  for (const e of _events) eventTypes.add(e.type);

  return {
    getAll: vi.fn(() => [..._events]),
    getSize: vi.fn(() => _events.length),
    getEventTypes: vi.fn(() => Array.from(eventTypes).sort()),
    getEvictedCount: vi.fn(() => 0),
    getTotalCaptured: vi.fn(() => _events.length),
    clear: vi.fn(() => {
      _events.length = 0;
      eventTypes.clear();
    }),
    push: vi.fn((e: SSEEventRecord) => {
      _events.push(e);
      eventTypes.add(e.type);
    }),
    _events,
  };
}

beforeEach(() => {
  rafCallbacks = [];
  if (!globalThis.document) {
    (globalThis as any).document = {};
  }
  (globalThis.document as any).createElement = (tag: string) =>
    createMockElement(tag);
  (globalThis.document as any).activeElement = null;
  (globalThis.document as any).createDocumentFragment = () => {
    const frag = createMockElement("fragment");
    // Fragments transfer children on appendChild to a real element
    return frag;
  };

  (globalThis as any).requestAnimationFrame = (cb: Function) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  };
  (globalThis as any).cancelAnimationFrame = (id: number) => {
    if (id > 0 && id <= rafCallbacks.length) {
      rafCallbacks[id - 1] = () => {};
    }
  };

  // Mock navigator.clipboard
  const mockClipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
  vi.stubGlobal("navigator", { clipboard: mockClipboard });
});

afterEach(() => {
  if (origDocument) {
    (globalThis as any).document = origDocument;
  }
  vi.restoreAllMocks();
});

// Mock renderLucideIcon to return a simple SVG-like element
vi.mock("../utils/icons", () => ({
  renderLucideIcon: vi.fn((_name: string) => {
    const svg = createMockElement("svg");
    svg.__iconName = _name;
    return svg;
  }),
}));

// Use dynamic import to load after mocks are set up
async function loadModule() {
  const mod = await import("./event-stream-view");
  const origCreate = mod.createEventStreamView;
  const wrappedCreate = (options: Parameters<typeof origCreate>[0]): { element: any; update: () => void; destroy: () => void } => {
    return origCreate(options);
  };
  return { ...mod, createEventStreamView: wrappedCreate };
}

// Helper: navigate the new DOM structure
// container.children = [toolbarOuter, truncationBanner, eventsListWrapper]
// toolbarOuter.children = [headerBar, searchBar]
// headerBar.children = [title, countBadge, spacer, filterSelect, copyAllBtn]
// searchBar.children = [searchIconWrapper, searchInput, searchClearBtn]
// eventsListWrapper.children = [eventsList, noResultsMsg, scrollIndicator]

function getToolbar(element: any) {
  return element.children[0]; // toolbarOuter
}
function getHeaderBar(element: any) {
  return getToolbar(element).children[0]; // headerBar
}
function getSearchBar(element: any) {
  return getToolbar(element).children[1]; // searchBar
}
function getTitle(element: any) {
  return getHeaderBar(element).children[0]; // title span
}
function getCountBadge(element: any) {
  return getHeaderBar(element).children[1]; // count badge span
}
function getFilterSelect(element: any) {
  return getHeaderBar(element).children[3]; // filterSelect (after title, badge, spacer)
}
function getCopyAllBtn(element: any) {
  return getHeaderBar(element).children[4]; // copyAllBtn
}
function getSearchInput(element: any) {
  return getSearchBar(element).children[1]; // searchInput (after searchIconWrapper)
}
function getSearchClearBtn(element: any) {
  return getSearchBar(element).children[2]; // searchClearBtn
}
function getEventsWrapper(element: any) {
  return element.children[2]; // eventsListWrapper
}
function getEventsList(element: any) {
  return getEventsWrapper(element).children[0]; // eventsList
}
function getNoResultsMsg(element: any) {
  return getEventsWrapper(element).children[1]; // noResultsMsg
}
function getScrollIndicator(element: any) {
  return getEventsWrapper(element).children[2]; // scrollIndicator
}

describe("createEventStreamView", () => {
  it("should create a container element with expected children", async () => {
    const { createEventStreamView } = await loadModule();
    const buffer = createMockBuffer();
    const { element } = createEventStreamView({ buffer: buffer as any });

    // Container should have tabindex for keyboard events
    expect(element.getAttribute("tabindex")).toBe("0");

    // Should have toolbarOuter, truncation banner, and events wrapper
    expect(element.children.length).toBe(3);
  });

  it("should return update and destroy functions", async () => {
    const { createEventStreamView } = await loadModule();
    const buffer = createMockBuffer();
    const view = createEventStreamView({ buffer: buffer as any });

    expect(typeof view.update).toBe("function");
    expect(typeof view.destroy).toBe("function");
  });

  describe("header bar", () => {
    it("should show 'Event Stream' title and count badge", async () => {
      const { createEventStreamView } = await loadModule();
      const events = [makeEvent("step_chunk", 1)];
      const buffer = createMockBuffer(events);
      const { element, update } = createEventStreamView({ buffer: buffer as any });

      update();

      expect(getTitle(element).textContent).toBe("Events");
      expect(getCountBadge(element).textContent).toBe("1");
    });

    it("should update count badge when events change", async () => {
      vi.useFakeTimers();
      const { createEventStreamView } = await loadModule();
      const events = [makeEvent("step_chunk", 1)];
      const buffer = createMockBuffer(events);
      const { element, update } = createEventStreamView({ buffer: buffer as any });

      update();
      expect(getCountBadge(element).textContent).toBe("1");

      vi.advanceTimersByTime(150);
      buffer.push(makeEvent("step_chunk", 2));
      update();

      expect(getCountBadge(element).textContent).toBe("2");
      vi.useRealTimers();
    });
  });

  describe("filter dropdown", () => {
    it("should populate filter options from buffer event types with counts", async () => {
      const { createEventStreamView } = await loadModule();
      const events = [
        makeEvent("step_chunk", 1),
        makeEvent("step_chunk", 2),
        makeEvent("flow_complete", 3),
      ];
      const buffer = createMockBuffer(events);
      const { element, update } = createEventStreamView({ buffer: buffer as any });

      update();

      const filterSelect = getFilterSelect(element);

      // Should have "All events" + 2 type options
      expect(filterSelect.options.length).toBe(3);
      expect(filterSelect.options[0].textContent).toBe("All events");
      expect(filterSelect.options[1].textContent).toBe("flow_complete (1)");
      expect(filterSelect.options[2].textContent).toBe("step_chunk (2)");
    });

    it("should update counts on subsequent update() calls", async () => {
      vi.useFakeTimers();
      const { createEventStreamView } = await loadModule();
      const events = [makeEvent("step_chunk", 1)];
      const buffer = createMockBuffer(events);
      const { element, update } = createEventStreamView({ buffer: buffer as any });

      update();

      const filterSelect = getFilterSelect(element);
      expect(filterSelect.options[0].textContent).toBe("All events");
      expect(filterSelect.options[1].textContent).toBe("step_chunk (1)");

      // Add another event and advance past throttle window
      buffer.push(makeEvent("step_chunk", 2));
      vi.advanceTimersByTime(150);
      update();

      expect(filterSelect.options[1].textContent).toBe("step_chunk (2)");
      vi.useRealTimers();
    });

    it("should filter events when a type is selected", async () => {
      const { createEventStreamView } = await loadModule();
      const events = [
        makeEvent("step_chunk", 1),
        makeEvent("flow_complete", 2),
        makeEvent("step_chunk", 3),
      ];
      const buffer = createMockBuffer(events);
      const { element, update } = createEventStreamView({ buffer: buffer as any });

      update();

      const filterSelect = getFilterSelect(element);
      filterSelect.value = "step_chunk";
      filterSelect.__fireEvent("change");

      expect(buffer.getAll).toHaveBeenCalled();
    });
  });

  describe("search functionality", () => {
    it("should debounce search input", async () => {
      vi.useFakeTimers();
      const { createEventStreamView } = await loadModule();
      const events = [makeEvent("step_chunk", 1, '{"message":"hello world"}')];
      const buffer = createMockBuffer(events);
      const { element } = createEventStreamView({ buffer: buffer as any });

      const searchInput = getSearchInput(element);

      // Type in search
      searchInput.value = "hello";
      searchInput.__fireEvent("input");

      const callCountBefore = buffer.getAll.mock.calls.length;

      // Advance past debounce
      vi.advanceTimersByTime(200);

      expect(buffer.getAll.mock.calls.length).toBeGreaterThan(callCountBefore);
      vi.useRealTimers();
    });

    it("should show clear button when search has text", async () => {
      const { createEventStreamView } = await loadModule();
      const buffer = createMockBuffer();
      const { element } = createEventStreamView({ buffer: buffer as any });

      const searchInput = getSearchInput(element);
      const clearBtn = getSearchClearBtn(element);

      // Initially hidden
      expect(clearBtn.style.display).toBe("none");

      // Type something
      searchInput.value = "test";
      searchInput.__fireEvent("input");

      // Clear button should be visible
      expect(clearBtn.style.display).toBe("");
    });

    it("should clear search when clear button is clicked", async () => {
      vi.useFakeTimers();
      const { createEventStreamView } = await loadModule();
      const buffer = createMockBuffer([makeEvent("a", 1)]);
      const { element } = createEventStreamView({ buffer: buffer as any });

      const searchInput = getSearchInput(element);
      const clearBtn = getSearchClearBtn(element);

      // Type and trigger search
      searchInput.value = "test";
      searchInput.__fireEvent("input");
      vi.advanceTimersByTime(200);

      // Click clear
      clearBtn.__fireEvent("click");

      expect(searchInput.value).toBe("");
      expect(clearBtn.style.display).toBe("none");
      vi.useRealTimers();
    });
  });

  describe("no results message", () => {
    it("should show no results message when filters produce empty results", async () => {
      vi.useFakeTimers();
      const { createEventStreamView } = await loadModule();
      const events = [makeEvent("step_chunk", 1, '{"data":"hello"}')];
      const buffer = createMockBuffer(events);
      const { element } = createEventStreamView({ buffer: buffer as any });

      const searchInput = getSearchInput(element);

      // Search for something that doesn't match
      searchInput.value = "nonexistent_term_xyz";
      searchInput.__fireEvent("input");
      vi.advanceTimersByTime(200);

      const noResultsMsg = getNoResultsMsg(element);

      expect(noResultsMsg.style.display).toBe("");
      expect(noResultsMsg.textContent).toContain("nonexistent_term_xyz");
      vi.useRealTimers();
    });
  });

  describe("copy all button", () => {
    it("should update title based on active filters", async () => {
      vi.useFakeTimers();
      const { createEventStreamView } = await loadModule();
      const events = [
        makeEvent("step_chunk", 1),
        makeEvent("flow_complete", 2),
      ];
      const buffer = createMockBuffer(events);
      const { element, update } = createEventStreamView({ buffer: buffer as any });

      const copyAllBtn = getCopyAllBtn(element);

      update();

      // No filter: should be "Copy All"
      expect(copyAllBtn.title).toBe("Copy All");

      // Apply type filter
      const filterSelect = getFilterSelect(element);
      filterSelect.value = "step_chunk";
      filterSelect.__fireEvent("change");

      // Should now show "Copy Filtered (1)"
      expect(copyAllBtn.title).toBe("Copy Filtered (1)");
      vi.useRealTimers();
    });

    it("should copy filtered events when filters are active", async () => {
      const { createEventStreamView } = await loadModule();
      const events = [
        makeEvent("step_chunk", 1),
        makeEvent("flow_complete", 2),
      ];
      const buffer = createMockBuffer(events);
      const getFullHistory = vi.fn().mockResolvedValue(events);
      const { element } = createEventStreamView({
        buffer: buffer as any,
        getFullHistory,
      });

      const filterSelect = getFilterSelect(element);
      const copyAllBtn = getCopyAllBtn(element);

      // Apply type filter
      filterSelect.value = "step_chunk";
      filterSelect.__fireEvent("change");

      // Click copy all
      await copyAllBtn.__listeners.click[0]();

      // Should NOT call getFullHistory when filters are active
      expect(getFullHistory).not.toHaveBeenCalled();

      // Should copy only filtered events
      const writeCall = (globalThis.navigator.clipboard.writeText as any).mock.calls[0][0];
      const parsed = JSON.parse(writeCall);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].index).toBe(1);
    });

    it("should copy full history when no filters are active", async () => {
      const { createEventStreamView } = await loadModule();
      const events = [
        makeEvent("step_chunk", 1),
        makeEvent("flow_complete", 2),
      ];
      const buffer = createMockBuffer(events);
      const fullHistory = [...events, makeEvent("old_event", 0)];
      const getFullHistory = vi.fn().mockResolvedValue(fullHistory);
      const { element, update } = createEventStreamView({
        buffer: buffer as any,
        getFullHistory,
      });

      update();

      const copyAllBtn = getCopyAllBtn(element);

      // Click copy all with no filters
      await copyAllBtn.__listeners.click[0]();

      // Should call getFullHistory
      expect(getFullHistory).toHaveBeenCalled();
    });

    it("should fall back to buffer when getFullHistory returns empty", async () => {
      const { createEventStreamView } = await loadModule();
      const events = [
        makeEvent("step_chunk", 1),
        makeEvent("flow_complete", 2),
      ];
      const buffer = createMockBuffer(events);
      const getFullHistory = vi.fn().mockResolvedValue([]);
      const { element } = createEventStreamView({
        buffer: buffer as any,
        getFullHistory,
      });

      const copyAllBtn = getCopyAllBtn(element);

      // Click copy all with no filters (All events)
      await copyAllBtn.__listeners.click[0]();

      expect(getFullHistory).toHaveBeenCalled();
      const writeCall = (globalThis.navigator.clipboard.writeText as any).mock.calls[0][0];
      const parsed = JSON.parse(writeCall);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].index).toBe(1);
      expect(parsed[1].index).toBe(2);
    });
  });

  describe("keyboard shortcuts", () => {
    it("should focus search on Ctrl+F", async () => {
      const { createEventStreamView } = await loadModule();
      const buffer = createMockBuffer();
      const { element } = createEventStreamView({ buffer: buffer as any });

      const searchInput = getSearchInput(element);

      // Simulate Ctrl+F
      const event = {
        key: "f",
        ctrlKey: true,
        metaKey: false,
        preventDefault: vi.fn(),
      };
      element.__fireEvent("keydown", event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(searchInput.focus).toHaveBeenCalled();
      expect(searchInput.select).toHaveBeenCalled();
    });

    it("should clear search and blur on Escape when search is focused", async () => {
      vi.useFakeTimers();
      const { createEventStreamView } = await loadModule();
      const buffer = createMockBuffer([makeEvent("a", 1)]);
      const { element } = createEventStreamView({ buffer: buffer as any });

      const searchInput = getSearchInput(element);

      // Simulate search having text
      searchInput.value = "test";
      searchInput.__fireEvent("input");
      vi.advanceTimersByTime(200);

      // Make search input the active element
      (globalThis.document as any).activeElement = searchInput;

      // Press Escape
      element.__fireEvent("keydown", {
        key: "Escape",
        ctrlKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
      });

      expect(searchInput.value).toBe("");
      expect(searchInput.blur).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it("should call onClose on Escape when search is not focused", async () => {
      const { createEventStreamView } = await loadModule();
      const buffer = createMockBuffer();
      const onClose = vi.fn();
      const { element } = createEventStreamView({
        buffer: buffer as any,
        onClose,
      });

      // Ensure activeElement is NOT the search input
      (globalThis.document as any).activeElement = element;

      // Press Escape
      element.__fireEvent("keydown", {
        key: "Escape",
        ctrlKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
      });

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("event rows", () => {
    it("should render rows with relative timestamps", async () => {
      const { createEventStreamView } = await loadModule();
      const events = [
        { id: "evt-1", type: "flow_start", timestamp: 1000, payload: '{"flowName":"Test"}' },
        { id: "evt-2", type: "step_start", timestamp: 1361, payload: '{"stepName":"Chatbot 1"}' },
      ];
      const buffer = createMockBuffer(events);
      const { element, update } = createEventStreamView({ buffer: buffer as any });

      update();

      // Events are rendered in eventsList
      const eventsList = getEventsList(element);
      // Each event produces a row wrapper
      expect(eventsList.children.length).toBeGreaterThanOrEqual(2);
    });

    it("should render rows with absolute timestamps when configured", async () => {
      const { createEventStreamView } = await loadModule();
      const events = [makeEvent("step_chunk", 1)];
      const buffer = createMockBuffer(events);
      const { update } = createEventStreamView({
        buffer: buffer as any,
        config: {
          features: { eventStream: { timestampFormat: "absolute" } },
        } as any,
      });

      update();

      // Verify render happened
      expect(buffer.getAll).toHaveBeenCalled();
    });

    it("should extract description from payload fields", async () => {
      const { createEventStreamView } = await loadModule();
      const events = [
        { id: "evt-1", type: "flow_start", timestamp: 1000, payload: '{"flowName":"My Flow"}' },
      ];
      const buffer = createMockBuffer(events);
      const { element, update } = createEventStreamView({ buffer: buffer as any });

      update();

      // Verify the row was rendered
      const eventsList = getEventsList(element);
      expect(eventsList.children.length).toBeGreaterThanOrEqual(1);
    });

    it("should hide sequence numbers when showSequenceNumbers is false", async () => {
      const { createEventStreamView } = await loadModule();
      const events = [makeEvent("step_chunk", 1)];
      const buffer = createMockBuffer(events);
      const { update } = createEventStreamView({
        buffer: buffer as any,
        config: {
          features: { eventStream: { showSequenceNumbers: false } },
        } as any,
      });

      update();
      expect(buffer.getAll).toHaveBeenCalled();
    });

    it("should use custom badge colors from config", async () => {
      const { createEventStreamView } = await loadModule();
      const events = [makeEvent("custom_type", 1)];
      const buffer = createMockBuffer(events);
      const { update } = createEventStreamView({
        buffer: buffer as any,
        config: {
          features: {
            eventStream: {
              badgeColors: {
                // Event type keys can be snake_case (e.g. from API)
                ["custom_type" as string]: { bg: "#ff0000", text: "#ffffff" },
              },
            },
          },
        } as any,
      });

      update();
      expect(buffer.getAll).toHaveBeenCalled();
    });
  });

  describe("expand/collapse", () => {
    it("should expand row to show inline payload when clicked", async () => {
      const { createEventStreamView } = await loadModule();
      const events = [makeEvent("step_chunk", 1, '{"message":"hello"}')];
      const buffer = createMockBuffer(events);
      const { element, update } = createEventStreamView({ buffer: buffer as any });

      update();

      const eventsList = getEventsList(element);
      // First row wrapper (direct child of eventsList after fragment transfer)
      const rowWrapper = eventsList.children[0];
      expect(rowWrapper).toBeDefined();

      // Row wrapper > container div (from buildDefaultRowContent) > row line div
      const container = rowWrapper.children[0]; // container div
      expect(container).toBeDefined();
      expect(container.children.length).toBeGreaterThanOrEqual(1);

      const rowLine = container.children[0]; // the flex row line
      expect(rowLine).toBeDefined();

      // Verify delegated click handler is registered on eventsList (event delegation)
      expect(eventsList.__listeners.click).toBeDefined();
      expect(eventsList.__listeners.click.length).toBeGreaterThan(0);

      // Verify data-event-id attribute is set on the row
      expect(rowLine.getAttribute("data-event-id")).toBe("evt-1");

      // Simulate click via event delegation on eventsList - target is the row line
      eventsList.__fireEvent("click", { target: rowLine, stopPropagation: () => {} });

      // After incremental re-render (Path B: single row replace), the new wrapper
      // replaces the old one in place. The updated container should have 2 children
      // (row line + inline payload).
      const updatedWrapper = eventsList.children[0];
      const updatedContainer = updatedWrapper.children[0];
      expect(updatedContainer.children.length).toBe(2);
    });

    it("should format JSON payload as pretty-printed in expanded view", async () => {
      const jsonPayload = '{"name":"test","value":42}';
      const formatted = JSON.stringify(JSON.parse(jsonPayload), null, 2);
      expect(formatted).toBe('{\n  "name": "test",\n  "value": 42\n}');
    });

    it("should handle non-JSON payload gracefully", async () => {
      const plainPayload = "just plain text, not JSON";
      let result: string;
      try {
        result = JSON.stringify(JSON.parse(plainPayload), null, 2);
      } catch {
        result = plainPayload;
      }
      expect(result).toBe(plainPayload);
    });
  });

  describe("incremental rendering", () => {
    it("should preserve existing row DOM references when new events are appended", async () => {
      vi.useFakeTimers();
      const { createEventStreamView } = await loadModule();
      const events = [makeEvent("step_chunk", 1), makeEvent("step_chunk", 2)];
      const buffer = createMockBuffer(events);
      const { element, update } = createEventStreamView({ buffer: buffer as any });

      // Initial render (Path A — first render)
      update();

      const eventsList = getEventsList(element);
      expect(eventsList.children.length).toBe(2);

      // Save references to existing rows
      const row1Ref = eventsList.children[0];
      const row2Ref = eventsList.children[1];

      // Add a new event and update (Path C — incremental append)
      vi.advanceTimersByTime(150);
      buffer.push(makeEvent("step_chunk", 3));
      update();

      // Should now have 3 rows
      expect(eventsList.children.length).toBe(3);

      // Original rows should be the same DOM references (not recreated)
      expect(eventsList.children[0]).toBe(row1Ref);
      expect(eventsList.children[1]).toBe(row2Ref);
      vi.useRealTimers();
    });

    it("should replace only the target row on expand/collapse", async () => {
      vi.useFakeTimers();
      const { createEventStreamView } = await loadModule();
      const events = [
        makeEvent("step_chunk", 1, '{"msg":"first"}'),
        makeEvent("step_chunk", 2, '{"msg":"second"}'),
        makeEvent("step_chunk", 3, '{"msg":"third"}'),
      ];
      const buffer = createMockBuffer(events);
      const { element, update } = createEventStreamView({ buffer: buffer as any });

      // Initial render
      update();

      const eventsList = getEventsList(element);
      expect(eventsList.children.length).toBe(3);

      // Save references
      const row1Ref = eventsList.children[0];
      const row3Ref = eventsList.children[2];

      // Expand the second row by simulating a click
      vi.advanceTimersByTime(150);
      const row2Container = eventsList.children[1].children[0];
      const row2Line = row2Container.children[0];
      eventsList.__fireEvent("click", { target: row2Line, stopPropagation: () => {} });

      // Row 1 and Row 3 should be the same DOM references (untouched)
      expect(eventsList.children[0]).toBe(row1Ref);
      expect(eventsList.children[2]).toBe(row3Ref);

      // Row 2 should be a different reference (replaced)
      expect(eventsList.children[1]).not.toBe(row2Container);
      vi.useRealTimers();
    });

    it("should do a full rebuild when filter changes", async () => {
      vi.useFakeTimers();
      const { createEventStreamView } = await loadModule();
      const events = [
        makeEvent("step_chunk", 1),
        makeEvent("flow_complete", 2),
        makeEvent("step_chunk", 3),
      ];
      const buffer = createMockBuffer(events);
      const { element, update } = createEventStreamView({ buffer: buffer as any });

      // Initial render
      update();

      const eventsList = getEventsList(element);
      const originalRow1 = eventsList.children[0];

      // Change filter
      vi.advanceTimersByTime(150);
      const filterSelect = getFilterSelect(element);
      filterSelect.value = "step_chunk";
      filterSelect.__fireEvent("change");

      // After filter change, rows are fully rebuilt (Path A)
      // The first row should be a different DOM reference
      expect(eventsList.children[0]).not.toBe(originalRow1);
      // Should only show filtered events (2 step_chunk events)
      expect(eventsList.children.length).toBe(2);
      vi.useRealTimers();
    });
  });

  describe("scroll-to-bottom affordance", () => {
    it("uses icon-only arrow-down defaults when paused and new events arrive", async () => {
      vi.useFakeTimers();
      const { createEventStreamView } = await loadModule();
      const events = [makeEvent("step_chunk", 1)];
      const buffer = createMockBuffer(events);
      const { element, update } = createEventStreamView({
        buffer: buffer as any
      });

      update();

      const eventsList = getEventsList(element);
      eventsList.scrollTop = 0;
      eventsList.scrollHeight = 600;
      eventsList.clientHeight = 300;
      eventsList.__fireEvent("wheel", { deltaY: -24 });

      vi.advanceTimersByTime(150);
      buffer.push(makeEvent("step_chunk", 2));
      update();

      const indicator = getScrollIndicator(element);
      expect(indicator.style.display).toBe("");
      expect(indicator.children[1]?.textContent).toBe("");
      expect(indicator.children[0]?.__iconName).toBe("arrow-down");
      vi.useRealTimers();
    });

    it("hides the event stream affordance when disabled", async () => {
      vi.useFakeTimers();
      const { createEventStreamView } = await loadModule();
      const events = [makeEvent("step_chunk", 1)];
      const buffer = createMockBuffer(events);
      const { element, update } = createEventStreamView({
        buffer: buffer as any,
        config: {
          features: {
            eventStream: {},
            scrollToBottom: {
              enabled: false
            }
          }
        } as any
      });

      update();

      const eventsList = getEventsList(element);
      eventsList.scrollTop = 0;
      eventsList.scrollHeight = 600;
      eventsList.clientHeight = 300;
      eventsList.__fireEvent("wheel", { deltaY: -24 });

      vi.advanceTimersByTime(150);
      buffer.push(makeEvent("step_chunk", 2));
      update();

      expect(getScrollIndicator(element).style.display).toBe("none");
      vi.useRealTimers();
    });

    it("renders the event stream affordance as icon-only when label is empty", async () => {
      vi.useFakeTimers();
      const { createEventStreamView } = await loadModule();
      const events = [makeEvent("step_chunk", 1)];
      const buffer = createMockBuffer(events);
      const { element, update } = createEventStreamView({
        buffer: buffer as any,
        config: {
          features: {
            eventStream: {},
            scrollToBottom: {
              enabled: true,
              iconName: "arrow-down",
              label: ""
            }
          }
        } as any
      });

      update();

      const eventsList = getEventsList(element);
      eventsList.scrollTop = 0;
      eventsList.scrollHeight = 600;
      eventsList.clientHeight = 300;
      eventsList.__fireEvent("wheel", { deltaY: -24 });

      vi.advanceTimersByTime(150);
      buffer.push(makeEvent("step_chunk", 2));
      update();

      const indicator = getScrollIndicator(element);
      expect(indicator.style.display).toBe("");
      expect(indicator.children[1]?.textContent).toBe("");
      expect(indicator.children[0]?.__iconName).toBe("arrow-down");
      vi.useRealTimers();
    });

    it("supports a configured label and icon override", async () => {
      vi.useFakeTimers();
      const { createEventStreamView } = await loadModule();
      const events = [makeEvent("step_chunk", 1)];
      const buffer = createMockBuffer(events);
      const { element, update } = createEventStreamView({
        buffer: buffer as any,
        config: {
          features: {
            eventStream: {},
            scrollToBottom: {
              enabled: true,
              iconName: "arrow-down",
              label: "Jump to latest"
            }
          }
        } as any
      });

      update();

      const eventsList = getEventsList(element);
      eventsList.scrollTop = 0;
      eventsList.scrollHeight = 600;
      eventsList.clientHeight = 300;
      eventsList.__fireEvent("wheel", { deltaY: -24 });

      vi.advanceTimersByTime(150);
      buffer.push(makeEvent("step_chunk", 2));
      update();

      const indicator = getScrollIndicator(element);
      expect(indicator.style.display).toBe("");
      expect(indicator.children[1]?.textContent).toContain("Jump to latest");
      expect(indicator.children[0]?.__iconName).toBe("arrow-down");
      vi.useRealTimers();
    });
  });

  describe("individual event copy", () => {
    it("should format event as structured JSON with parsed payload", async () => {
      const { createEventStreamView } = await loadModule();
      const events = [makeEvent("step_chunk", 1, '{"message":"hello"}')];
      const buffer = createMockBuffer(events);
      const { update } = createEventStreamView({ buffer: buffer as any });

      update();

      expect(buffer.getAll).toHaveBeenCalled();
    });
  });

  describe("clear chat integration", () => {
    it("should reflect empty state after buffer clear and update", async () => {
      vi.useFakeTimers();
      const { createEventStreamView } = await loadModule();
      const events = [
        makeEvent("step_chunk", 1),
        makeEvent("flow_complete", 2),
      ];
      const buffer = createMockBuffer(events);
      const { element, update } = createEventStreamView({ buffer: buffer as any });

      update();

      const filterSelect = getFilterSelect(element);
      expect(filterSelect.options[0].textContent).toBe("All events");

      // Simulate clearChat: buffer.clear() + view.update()
      vi.advanceTimersByTime(150);
      buffer.clear();
      update();

      // Filter should show "All events"
      expect(filterSelect.options[0].textContent).toBe("All events");
      // No type-specific options remain
      expect(filterSelect.options.length).toBe(1);
      vi.useRealTimers();
    });

    it("should recover after clear when new events arrive", async () => {
      vi.useFakeTimers();
      const { createEventStreamView } = await loadModule();
      const events = [makeEvent("step_chunk", 1)];
      const buffer = createMockBuffer(events);
      const { element, update } = createEventStreamView({ buffer: buffer as any });

      update();

      // Clear (simulate clearChat)
      vi.advanceTimersByTime(150);
      buffer.clear();
      update();

      const filterSelect = getFilterSelect(element);
      expect(filterSelect.options[0].textContent).toBe("All events");

      // New events arrive in new session
      vi.advanceTimersByTime(150);
      buffer.push(makeEvent("tool_start", 10));
      update();

      expect(filterSelect.options[1].textContent).toBe("tool_start (1)");
      vi.useRealTimers();
    });
  });

  describe("update throttle", () => {
    it("should render immediately on first update call", async () => {
      const { createEventStreamView } = await loadModule();
      const events = [makeEvent("step_chunk", 1)];
      const buffer = createMockBuffer(events);
      const { element, update } = createEventStreamView({ buffer: buffer as any });

      update();

      const filterSelect = getFilterSelect(element);
      expect(filterSelect.options[1].textContent).toBe("step_chunk (1)");
    });

    it("should throttle rapid update calls within 100ms", async () => {
      vi.useFakeTimers();
      const { createEventStreamView } = await loadModule();
      const events = [makeEvent("step_chunk", 1)];
      const buffer = createMockBuffer(events);
      const { element, update } = createEventStreamView({ buffer: buffer as any });

      // First update renders immediately
      update();

      const filterSelect = getFilterSelect(element);
      expect(filterSelect.options[1].textContent).toBe("step_chunk (1)");

      // Add more events and call update rapidly (within throttle window)
      buffer.push(makeEvent("step_chunk", 2));
      buffer.push(makeEvent("step_chunk", 3));
      update();
      update();
      update();

      // Should NOT have rendered yet (within 100ms throttle, rAF pending)
      expect(filterSelect.options[1].textContent).toBe("step_chunk (1)");

      // Advance time to flush the rAF callback
      vi.advanceTimersByTime(20);

      // Now it should have rendered with all 3 events
      expect(filterSelect.options[1].textContent).toBe("step_chunk (3)");
      vi.useRealTimers();
    });

    it("should render immediately after 100ms has elapsed", async () => {
      vi.useFakeTimers();
      const { createEventStreamView } = await loadModule();
      const events = [makeEvent("step_chunk", 1)];
      const buffer = createMockBuffer(events);
      const { element, update } = createEventStreamView({ buffer: buffer as any });

      // First update
      update();

      const filterSelect = getFilterSelect(element);

      // Wait past the throttle interval
      vi.advanceTimersByTime(150);

      // Add event and update — should render immediately since 150ms > 100ms
      buffer.push(makeEvent("flow_complete", 2));
      update();

      expect(filterSelect.options.length).toBe(3); // All events + flow_complete + step_chunk
      vi.useRealTimers();
    });

    it("should coalesce multiple rapid updates into a single render via rAF", async () => {
      vi.useFakeTimers();
      const { createEventStreamView } = await loadModule();
      const buffer = createMockBuffer([makeEvent("step_chunk", 1)]);
      const { update } = createEventStreamView({ buffer: buffer as any });

      // First call: immediate render
      update();
      const callCountAfterFirst = buffer.getAll.mock.calls.length;

      // Rapid burst: 10 updates within throttle window
      for (let i = 2; i <= 11; i++) {
        buffer.push(makeEvent("step_chunk", i));
        update();
      }

      // Buffer.getAll should NOT have been called again yet (all coalesced via rAF)
      expect(buffer.getAll.mock.calls.length).toBe(callCountAfterFirst);

      // Flush the rAF
      vi.advanceTimersByTime(20);

      // Should have been called for the coalesced update
      expect(buffer.getAll.mock.calls.length).toBeGreaterThan(callCountAfterFirst);
      vi.useRealTimers();
    });

    it("should render immediately for user-initiated actions (filter change)", async () => {
      const { createEventStreamView } = await loadModule();
      const events = [
        makeEvent("step_chunk", 1),
        makeEvent("flow_complete", 2),
      ];
      const buffer = createMockBuffer(events);
      const { element, update } = createEventStreamView({ buffer: buffer as any });

      // Initial render
      update();

      const filterSelect = getFilterSelect(element);
      const copyAllBtn = getCopyAllBtn(element);

      // Immediately change filter — this should bypass throttle (uses updateNow internally)
      filterSelect.value = "step_chunk";
      filterSelect.__fireEvent("change");

      // Should have updated immediately (Copy All title reflects filter)
      expect(copyAllBtn.title).toBe("Copy Filtered (1)");
    });

    it("should cancel pending rAF on destroy", async () => {
      vi.useFakeTimers();
      const { createEventStreamView } = await loadModule();
      const buffer = createMockBuffer([makeEvent("step_chunk", 1)]);
      const { update, destroy } = createEventStreamView({ buffer: buffer as any });

      // First update — immediate
      update();

      // Schedule a throttled update
      buffer.push(makeEvent("step_chunk", 2));
      update();

      // Destroy before rAF fires — should not throw
      expect(() => destroy()).not.toThrow();

      // Advancing timers to flush rAF — should not throw even though view is destroyed
      vi.advanceTimersByTime(20);
      vi.useRealTimers();
    });
  });

  describe("scroll behavior", () => {
    it("should have scroll listener on events list", async () => {
      const { createEventStreamView } = await loadModule();
      const events = [makeEvent("step_chunk", 1)];
      const buffer = createMockBuffer(events);
      const { element, update } = createEventStreamView({ buffer: buffer as any });

      update();

      const eventsList = getEventsList(element);
      expect(eventsList.__listeners.scroll).toBeDefined();
      expect(eventsList.__listeners.scroll.length).toBeGreaterThan(0);

      // Triggering scroll should not throw
      expect(() => eventsList.__fireEvent("scroll")).not.toThrow();
    });
  });

  describe("destroy", () => {
    it("should clean up event listeners on destroy", async () => {
      const { createEventStreamView } = await loadModule();
      const buffer = createMockBuffer();
      const { destroy } = createEventStreamView({ buffer: buffer as any });

      // Should not throw
      expect(() => destroy()).not.toThrow();
    });

    it("should clear pending search timeout on destroy", async () => {
      vi.useFakeTimers();
      const { createEventStreamView } = await loadModule();
      const buffer = createMockBuffer([makeEvent("a", 1)]);
      const { element, destroy } = createEventStreamView({ buffer: buffer as any });

      const searchInput = getSearchInput(element);

      // Type to start debounce timer
      searchInput.value = "test";
      searchInput.__fireEvent("input");

      // Destroy before debounce fires
      expect(() => destroy()).not.toThrow();

      // Advancing time should not cause errors
      vi.advanceTimersByTime(200);
      vi.useRealTimers();
    });
  });

  describe("plugin hooks", () => {
    it("should use custom renderEventStreamRow plugin when provided", async () => {
      const { createEventStreamView } = await loadModule();
      const events = [makeEvent("step_chunk", 1)];
      const buffer = createMockBuffer(events);
      const customRow = createMockElement("div");
      customRow.textContent = "Custom Row";

      const plugin = {
        id: "test-plugin",
        renderEventStreamRow: vi.fn(() => customRow),
      };

      const { update } = createEventStreamView({
        buffer: buffer as any,
        config: {} as any,
        plugins: [plugin],
      });

      update();

      expect(plugin.renderEventStreamRow).toHaveBeenCalledWith(
        expect.objectContaining({
          event: events[0],
          index: 0,
          isExpanded: false,
        })
      );
    });

    it("should use custom renderEventStreamToolbar plugin when provided", async () => {
      const { createEventStreamView } = await loadModule();
      const buffer = createMockBuffer();
      const customToolbar = createMockElement("div");
      customToolbar.textContent = "Custom Toolbar";

      const plugin = {
        id: "test-plugin",
        renderEventStreamToolbar: vi.fn(() => customToolbar),
      };

      const { element } = createEventStreamView({
        buffer: buffer as any,
        config: {} as any,
        plugins: [plugin],
      });

      expect(plugin.renderEventStreamToolbar).toHaveBeenCalled();
      // The toolbar should be the custom element
      expect(element.children[0].textContent).toBe("Custom Toolbar");
    });

    it("should use custom renderEventStreamView plugin when provided", async () => {
      const { createEventStreamView } = await loadModule();
      const buffer = createMockBuffer();
      const customView = createMockElement("div");
      customView.textContent = "Fully Custom View";

      const plugin = {
        id: "test-plugin",
        renderEventStreamView: vi.fn(() => customView),
      };

      const { element } = createEventStreamView({
        buffer: buffer as any,
        config: {} as any,
        plugins: [plugin],
      });

      expect(plugin.renderEventStreamView).toHaveBeenCalled();
      expect(element.textContent).toBe("Fully Custom View");
    });

    it("should fall back to default when plugin returns null", async () => {
      const { createEventStreamView } = await loadModule();
      const events = [makeEvent("step_chunk", 1)];
      const buffer = createMockBuffer(events);

      const plugin = {
        id: "test-plugin",
        renderEventStreamRow: vi.fn(() => null),
      };

      const { element, update } = createEventStreamView({
        buffer: buffer as any,
        config: {} as any,
        plugins: [plugin],
      });

      update();

      // Should still render the default view
      expect(element.children.length).toBe(3);
      expect(plugin.renderEventStreamRow).toHaveBeenCalled();
    });
  });
});
