export interface VirtualScrollerOptions {
  container: HTMLElement;
  rowHeight?: number;
  overscan?: number;
  renderRow: (index: number) => HTMLElement;
}

export class VirtualScroller {
  private container: HTMLElement;
  private rowHeight: number;
  private overscan: number;
  private renderRow: (index: number) => HTMLElement;
  private totalCount = 0;
  private spacer: HTMLElement;
  private viewport: HTMLElement;
  private visibleRows: Map<number, HTMLElement> = new Map();
  private scrollRAF: number | null = null;
  private isAutoScrolling = false;
  private onScroll: () => void;

  constructor(options: VirtualScrollerOptions) {
    this.container = options.container;
    this.rowHeight = options.rowHeight ?? 40;
    this.overscan = options.overscan ?? 5;
    this.renderRow = options.renderRow;

    // Create spacer (provides full scrollable height)
    this.spacer = document.createElement("div");
    this.spacer.style.position = "relative";
    this.spacer.style.width = "100%";
    this.spacer.style.height = "0px";

    // Create viewport (holds visible rows)
    this.viewport = document.createElement("div");
    this.viewport.style.position = "absolute";
    this.viewport.style.top = "0";
    this.viewport.style.left = "0";
    this.viewport.style.right = "0";

    this.spacer.appendChild(this.viewport);
    this.container.appendChild(this.spacer);

    // Throttled scroll handler via RAF
    this.onScroll = () => {
      if (this.scrollRAF !== null) return;
      this.scrollRAF = requestAnimationFrame(() => {
        this.scrollRAF = null;
        this.render();
      });
    };

    this.container.addEventListener("scroll", this.onScroll);
  }

  setTotalCount(count: number): void {
    this.totalCount = count;
    this.spacer.style.height = `${count * this.rowHeight}px`;
    // Always invalidate cached rows — data may have changed even at the same count
    for (const [, el] of this.visibleRows) {
      el.remove();
    }
    this.visibleRows.clear();
    this.render();
  }

  render(): void {
    if (this.totalCount === 0) {
      // Clear all visible rows
      for (const [, el] of this.visibleRows) {
        el.remove();
      }
      this.visibleRows.clear();
      return;
    }

    const scrollTop = this.container.scrollTop;
    const containerHeight = this.container.clientHeight;

    const startIndex = Math.max(
      0,
      Math.floor(scrollTop / this.rowHeight) - this.overscan
    );
    const endIndex = Math.min(
      this.totalCount,
      Math.ceil((scrollTop + containerHeight) / this.rowHeight) + this.overscan
    );

    // Add new rows that should be visible
    for (let i = startIndex; i < endIndex; i++) {
      if (!this.visibleRows.has(i)) {
        const row = this.renderRow(i);
        row.style.position = "absolute";
        row.style.top = "0";
        row.style.left = "0";
        row.style.right = "0";
        row.style.height = `${this.rowHeight}px`;
        row.style.transform = `translateY(${i * this.rowHeight}px)`;
        this.viewport.appendChild(row);
        this.visibleRows.set(i, row);
      }
    }

    // Remove rows that are no longer visible
    for (const [index, el] of this.visibleRows) {
      if (index < startIndex || index >= endIndex) {
        el.remove();
        this.visibleRows.delete(index);
      }
    }
  }

  scrollToBottom(smooth?: boolean): void {
    this.isAutoScrolling = true;
    const target = this.spacer.offsetHeight - this.container.clientHeight;
    if (smooth) {
      this.container.scrollTo({ top: target, behavior: "smooth" });
    } else {
      this.container.scrollTop = target;
    }
    // Reset flag after scroll settles
    requestAnimationFrame(() => {
      this.isAutoScrolling = false;
    });
  }

  isNearBottom(threshold = 50): boolean {
    return (
      this.container.scrollHeight -
        this.container.scrollTop -
        this.container.clientHeight <
      threshold
    );
  }

  getIsAutoScrolling(): boolean {
    return this.isAutoScrolling;
  }

  destroy(): void {
    this.container.removeEventListener("scroll", this.onScroll);
    if (this.scrollRAF !== null) {
      cancelAnimationFrame(this.scrollRAF);
      this.scrollRAF = null;
    }
    for (const [, el] of this.visibleRows) {
      el.remove();
    }
    this.visibleRows.clear();
    this.spacer.remove();
  }
}
