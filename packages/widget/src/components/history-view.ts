/**
 * History ("Messages") navigation view — the lazily chunked surface described in
 * `docs/visitor-history-implementation-plan.md` D7.
 *
 * PLACEHOLDER: this ships the mount contract and the bundle boundary only. The
 * Phase 3 UI task replaces the internals (list, grouping, paging, states,
 * plugin hooks) but must keep `createHistoryView(options) -> { element,
 * refresh, destroy }` intact, because the loader/chunk wiring is typed against
 * it.
 *
 * Never statically imported on the core path: the IIFE build marks
 * `@runtypelabs/persona/history-view` external and `build:client` marks the same
 * subpath external for ESM/CJS. The core reaches it through
 * `history-view-loader.ts`. Guarded by `history-view-bundle.test.ts`.
 */

import { createNode, cx } from "../utils/dom";

export interface HistoryViewOptions {
  /**
   * Widget config and resolved copy. Deliberately loose: the `features.history`
   * config/copy types land with the UI task, and typing them now would force an
   * edit to `types.ts`.
   */
  config: unknown;
  copy: unknown;
  /** Already resolved against the host container width by the shell, not here. */
  presentation: "panel" | "rail";
  onSelect?: (conversationId: string) => void;
  onClose?: () => void;
  // NOTE: no `provider`/`context` yet. The session-layer `HistoryProvider` seam
  // (D9) is still being built; it joins this signature with the UI task.
}

export interface HistoryViewHandle {
  element: HTMLElement;
  /** Re-fetch and re-render the list in place, preserving list/focus state. */
  refresh(): void;
  destroy(): void;
}

export function createHistoryView(options: HistoryViewOptions): HistoryViewHandle {
  const element = createNode(
    "div",
    {
      className: cx(
        "persona-history-view",
        `persona-history-view-${options.presentation}`
      ),
      attrs: {
        "data-persona-history-presentation": options.presentation,
      },
    },
    createNode("div", {
      className: "persona-history-view-loading",
      text: "Loading conversations",
    })
  );

  return {
    element,
    refresh: () => {
      // Placeholder: no data source is wired until the provider seam lands.
    },
    destroy: () => {
      element.remove();
      element.replaceChildren();
    },
  };
}
