import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { VirtualScroller } from "./virtual-scroller";

// Minimal DOM mock for Node environment
function createMockElement(tag = "div"): any {
  const children: any[] = [];
  const style: Record<string, string> = {};
  const listeners: Record<string, Function[]> = {};
  const el: any = {
    tagName: tag.toUpperCase(),
    style,
    children,
    childNodes: children,
    firstChild: null,
    parentNode: null,
    appendChild(child: any) {
      children.push(child);
      child.parentNode = el;
      el.firstChild = children[0] || null;
      return child;
    },
    remove() {
      if (el.parentNode) {
        const idx = el.parentNode.children.indexOf(el);
        if (idx >= 0) el.parentNode.children.splice(idx, 1);
        el.parentNode = null;
      }
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
    textContent: "",
    innerHTML: "",
    offsetHeight: 0,
    scrollTop: 0,
    scrollHeight: 200,
    clientHeight: 200,
    scrollTo(opts: { top: number; behavior?: string }) {
      el.scrollTop = opts.top;
    },
  };
  return el;
}

// Stub document.createElement for VirtualScroller internals
const origCreateElement = globalThis.document?.createElement;
let rafCallbacks: Function[] = [];

function _flushRAF() {
  const cbs = rafCallbacks.slice();
  rafCallbacks = [];
  cbs.forEach((cb) => cb());
}

beforeEach(() => {
  rafCallbacks = [];
  // Provide a minimal document.createElement
  if (!globalThis.document) {
    (globalThis as any).document = {};
  }
  (globalThis.document as any).createElement = (tag: string) =>
    createMockElement(tag);
  // Queue RAF callbacks so we can control when they execute
  (globalThis as any).requestAnimationFrame = (cb: Function) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  };
  (globalThis as any).cancelAnimationFrame = (id: number) => {
    if (id > 0 && id <= rafCallbacks.length) {
      rafCallbacks[id - 1] = () => {};
    }
  };
});

afterEach(() => {
  if (origCreateElement) {
    globalThis.document.createElement = origCreateElement;
  }
});

describe("VirtualScroller", () => {
  let container: any;
  let scroller: VirtualScroller;

  beforeEach(() => {
    container = createMockElement("div");
    container.clientHeight = 200;
    container.scrollHeight = 200;
    container.scrollTop = 0;
  });

  afterEach(() => {
    scroller?.destroy();
  });

  function createRenderRow() {
    return (index: number) => {
      const el = createMockElement("div");
      el.textContent = `Row ${index}`;
      el.__dataIndex = index;
      return el;
    };
  }

  it("should create spacer and viewport elements in container", () => {
    scroller = new VirtualScroller({
      container,
      rowHeight: 40,
      renderRow: createRenderRow(),
    });

    // Spacer should be in container
    expect(container.children.length).toBe(1);
    const spacer = container.children[0];
    expect(spacer.style.position).toBe("relative");
    expect(spacer.style.width).toBe("100%");

    // Viewport should be in spacer
    expect(spacer.children.length).toBe(1);
    const viewport = spacer.children[0];
    expect(viewport.style.position).toBe("absolute");
  });

  it("should update spacer height when totalCount changes", () => {
    scroller = new VirtualScroller({
      container,
      rowHeight: 40,
      renderRow: createRenderRow(),
    });

    scroller.setTotalCount(100);
    const spacer = container.children[0];
    expect(spacer.style.height).toBe("4000px");

    scroller.setTotalCount(50);
    expect(spacer.style.height).toBe("2000px");
  });

  it("should render visible rows on setTotalCount", () => {
    scroller = new VirtualScroller({
      container,
      rowHeight: 40,
      overscan: 0,
      renderRow: createRenderRow(),
    });

    scroller.setTotalCount(100);

    // Container height 200 / rowHeight 40 = ceil(5) visible rows
    const viewport = container.children[0].children[0];
    expect(viewport.children.length).toBe(5);
  });

  it("should render rows with correct positioning", () => {
    scroller = new VirtualScroller({
      container,
      rowHeight: 40,
      overscan: 0,
      renderRow: createRenderRow(),
    });

    scroller.setTotalCount(100);

    const viewport = container.children[0].children[0];
    const firstRow = viewport.children[0];

    expect(firstRow.style.position).toBe("absolute");
    expect(firstRow.style.height).toBe("40px");
    expect(firstRow.style.transform).toBe("translateY(0px)");
    expect(firstRow.textContent).toBe("Row 0");
  });

  it("should include overscan rows", () => {
    scroller = new VirtualScroller({
      container,
      rowHeight: 40,
      overscan: 3,
      renderRow: createRenderRow(),
    });

    scroller.setTotalCount(100);

    // 5 visible + 3 overscan below = 8 (no overscan above at scrollTop=0)
    const viewport = container.children[0].children[0];
    expect(viewport.children.length).toBe(8);
  });

  it("should clear rows when totalCount is 0", () => {
    scroller = new VirtualScroller({
      container,
      rowHeight: 40,
      overscan: 0,
      renderRow: createRenderRow(),
    });

    scroller.setTotalCount(10);
    const viewport = container.children[0].children[0];
    expect(viewport.children.length).toBeGreaterThan(0);

    scroller.setTotalCount(0);
    expect(viewport.children.length).toBe(0);
  });

  it("should use default rowHeight of 40 and overscan of 5", () => {
    scroller = new VirtualScroller({
      container,
      renderRow: createRenderRow(),
    });

    scroller.setTotalCount(100);
    const spacer = container.children[0];
    expect(spacer.style.height).toBe("4000px");
    // ceil(200/40) + 5 = 10
    const viewport = spacer.children[0];
    expect(viewport.children.length).toBe(10);
  });

  it("should report isNearBottom correctly", () => {
    scroller = new VirtualScroller({
      container,
      rowHeight: 40,
      renderRow: createRenderRow(),
    });

    scroller.setTotalCount(100);

    // scrollHeight=200, scrollTop=0, clientHeight=200 => distance=0 < 50
    expect(scroller.isNearBottom()).toBe(true);

    // Simulate scrolling up
    container.scrollHeight = 4000;
    container.scrollTop = 0;
    expect(scroller.isNearBottom()).toBe(false);
  });

  it("should clean up on destroy", () => {
    scroller = new VirtualScroller({
      container,
      rowHeight: 40,
      overscan: 0,
      renderRow: createRenderRow(),
    });

    scroller.setTotalCount(10);
    scroller.destroy();

    // Spacer should be removed from container
    expect(container.children.length).toBe(0);
  });

  it("should not render more rows than totalCount", () => {
    scroller = new VirtualScroller({
      container,
      rowHeight: 40,
      overscan: 5,
      renderRow: createRenderRow(),
    });

    // Only 3 items total - should render at most 3
    scroller.setTotalCount(3);
    const viewport = container.children[0].children[0];
    expect(viewport.children.length).toBe(3);
  });

  it("should handle scrollToBottom", () => {
    scroller = new VirtualScroller({
      container,
      rowHeight: 40,
      renderRow: createRenderRow(),
    });

    scroller.setTotalCount(100);

    // Set offsetHeight on spacer for scrollToBottom calculation
    container.children[0].offsetHeight = 4000;

    scroller.scrollToBottom();
    expect(scroller.getIsAutoScrolling()).toBe(true);
  });

  it("should not create duplicate rows on repeated setTotalCount", () => {
    scroller = new VirtualScroller({
      container,
      rowHeight: 40,
      overscan: 0,
      renderRow: createRenderRow(),
    });

    scroller.setTotalCount(10);
    const viewport = container.children[0].children[0];
    const countBefore = viewport.children.length;

    // Call again with same count - should not duplicate
    scroller.setTotalCount(10);
    expect(viewport.children.length).toBe(countBefore);
  });

  it("should remove rows outside visible range when scrolled", () => {
    scroller = new VirtualScroller({
      container,
      rowHeight: 40,
      overscan: 0,
      renderRow: createRenderRow(),
    });

    scroller.setTotalCount(100);
    const viewport = container.children[0].children[0];

    // Initially: rows 0-4 (5 visible)
    expect(viewport.children.length).toBe(5);
    expect(viewport.children[0].__dataIndex).toBe(0);

    // Simulate scroll to show rows 50-54
    container.scrollTop = 2000; // 2000/40 = row 50
    scroller.render();

    // Should only have rows 50-54
    expect(viewport.children.length).toBe(5);
    expect(viewport.children[0].__dataIndex).toBe(50);
  });

  describe("with 400px container height", () => {
    beforeEach(() => {
      container.clientHeight = 400;
      container.scrollHeight = 400;
    });

    it("should render ~10 visible rows plus overscan with 100 items", () => {
      scroller = new VirtualScroller({
        container,
        rowHeight: 40,
        overscan: 5,
        renderRow: createRenderRow(),
      });

      scroller.setTotalCount(100);

      // 400px / 40px = 10 visible + 5 overscan below = 15 rows
      const viewport = container.children[0].children[0];
      expect(viewport.children.length).toBe(15);
    });

    it("should render correct rows when scrollTop is 200", () => {
      scroller = new VirtualScroller({
        container,
        rowHeight: 40,
        overscan: 0,
        renderRow: createRenderRow(),
      });

      scroller.setTotalCount(100);
      const viewport = container.children[0].children[0];

      // Initially at scrollTop=0: rows 0-9 (400/40 = 10 visible)
      expect(viewport.children.length).toBe(10);

      // Scroll to 200px -> first visible row = floor(200/40) = 5
      // Last visible row = ceil((200+400)/40) = 15
      container.scrollTop = 200;
      scroller.render();

      expect(viewport.children.length).toBe(10);
      expect(viewport.children[0].__dataIndex).toBe(5);
      expect(viewport.children[viewport.children.length - 1].__dataIndex).toBe(14);
    });

    it("should render correct range with overscan when scrollTop is 200", () => {
      scroller = new VirtualScroller({
        container,
        rowHeight: 40,
        overscan: 3,
        renderRow: createRenderRow(),
      });

      scroller.setTotalCount(100);
      const viewport = container.children[0].children[0];

      container.scrollTop = 200;
      scroller.render();

      // startIndex = max(0, floor(200/40) - 3) = max(0, 5-3) = 2
      // endIndex = min(100, ceil((200+400)/40) + 3) = min(100, 15+3) = 18
      // 18 - 2 = 16 rows
      expect(viewport.children.length).toBe(16);
      expect(viewport.children[0].__dataIndex).toBe(2);
      expect(viewport.children[viewport.children.length - 1].__dataIndex).toBe(17);
    });
  });

  it("should remove excess rows when totalCount decreases", () => {
    scroller = new VirtualScroller({
      container,
      rowHeight: 40,
      overscan: 0,
      renderRow: createRenderRow(),
    });

    // Start with many items
    scroller.setTotalCount(100);
    const viewport = container.children[0].children[0];
    const spacer = container.children[0];
    expect(viewport.children.length).toBe(5); // 200/40 = 5

    // Decrease to 2 items
    scroller.setTotalCount(2);
    expect(spacer.style.height).toBe("80px"); // 2 * 40
    expect(viewport.children.length).toBe(2); // Only 2 rows exist
    expect(viewport.children[0].__dataIndex).toBe(0);
    expect(viewport.children[1].__dataIndex).toBe(1);
  });

  it("isNearBottom should return true when at bottom", () => {
    scroller = new VirtualScroller({
      container,
      rowHeight: 40,
      renderRow: createRenderRow(),
    });

    scroller.setTotalCount(100);

    // At bottom: scrollHeight - scrollTop - clientHeight < threshold
    container.scrollHeight = 4000;
    container.scrollTop = 3800; // 4000 - 3800 - 200 = 0 < 50
    expect(scroller.isNearBottom()).toBe(true);
  });

  it("isNearBottom should return false when scrolled up", () => {
    scroller = new VirtualScroller({
      container,
      rowHeight: 40,
      renderRow: createRenderRow(),
    });

    scroller.setTotalCount(100);

    container.scrollHeight = 4000;
    container.scrollTop = 1000; // 4000 - 1000 - 200 = 2800 > 50
    expect(scroller.isNearBottom()).toBe(false);
  });
});
