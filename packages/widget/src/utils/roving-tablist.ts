/**
 * Roving-tabindex tablist controller (WAI-ARIA APG tabs pattern). Owns the tab
 * roles, aria-selected, roving tabindex, Arrow/Home/End keyboard nav routed
 * through an onSelect callback, focus reveal via scrollIntoView, and focus
 * survival across a tab-DOM rebuild. Extracted so custom tab bars stay
 * accessible without re-implementing the pattern.
 */

export interface RovingTablistOptions {
  onSelect: (index: number) => void;
  /** Arrow-key axis. @default "horizontal" */
  orientation?: "horizontal" | "vertical";
}

export interface RovingTablistController {
  /** Snapshot whether focus is inside the strip. Call before replacing tab DOM. */
  beforeRender(): void;
  /**
   * Apply role=tablist/tab, aria-selected, roving tabindex, and keyboard nav to
   * the given tab elements (in order). Restores focus to the selected tab when
   * the last beforeRender() saw focus inside the strip. Call after (re)building
   * tabs.
   */
  render(tabs: HTMLElement[], selectedIndex: number): void;
  destroy(): void;
}

export function createRovingTablist(
  container: HTMLElement,
  options: RovingTablistOptions
): RovingTablistController {
  const orientation = options.orientation ?? "horizontal";
  const prevKey = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";
  const nextKey = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
  container.setAttribute("role", "tablist");

  let tabs: HTMLElement[] = [];
  // Whether the last beforeRender() saw focus inside the strip; consumed by the
  // next render() to restore the roving stop after a rebuild.
  let restoreFocus = false;

  const revealTab = (tab: HTMLElement) => {
    if (typeof tab.scrollIntoView === "function") {
      tab.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  };

  const indexOfTarget = (target: EventTarget | null): number => {
    const node = target as HTMLElement | null;
    return tabs.findIndex((t) => t === node || t.contains(node));
  };

  // One delegated keydown listener so it survives child replacement. Arrow moves
  // selection one step (clamped); Home/End jump to the edges; selection routes
  // through onSelect so the host owns state.
  const onKeydown = (e: KeyboardEvent) => {
    const index = indexOfTarget(e.target);
    if (index < 0) return;
    let next = index;
    if (e.key === nextKey) next = Math.min(index + 1, tabs.length - 1);
    else if (e.key === prevKey) next = Math.max(index - 1, 0);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    if (next === index) return;
    options.onSelect(next);
  };

  // Delegated focus reveal: bring a focused edge tab out from under the fade.
  const onFocusin = (e: FocusEvent) => {
    const index = indexOfTarget(e.target);
    if (index >= 0) revealTab(tabs[index]);
  };

  container.addEventListener("keydown", onKeydown);
  container.addEventListener("focusin", onFocusin);

  return {
    beforeRender() {
      restoreFocus =
        typeof document !== "undefined" &&
        container.contains(document.activeElement);
    },
    render(nextTabs: HTMLElement[], selectedIndex: number) {
      tabs = nextTabs;
      nextTabs.forEach((tab, i) => {
        tab.setAttribute("role", "tab");
        const selected = i === selectedIndex;
        tab.setAttribute("aria-selected", selected ? "true" : "false");
        // Roving tabindex: the selected tab is the only stop, or the first tab
        // when nothing is selected.
        tab.tabIndex = selected || (selectedIndex < 0 && i === 0) ? 0 : -1;
      });
      // Restore focus to the roving stop after the rebuild so arrow nav keeps
      // working across the selection re-render.
      if (restoreFocus) {
        const stop =
          (selectedIndex >= 0 ? nextTabs[selectedIndex] : undefined) ?? nextTabs[0];
        if (stop && typeof stop.focus === "function") {
          revealTab(stop);
          stop.focus();
        }
      }
    },
    destroy() {
      container.removeEventListener("keydown", onKeydown);
      container.removeEventListener("focusin", onFocusin);
    },
  };
}
