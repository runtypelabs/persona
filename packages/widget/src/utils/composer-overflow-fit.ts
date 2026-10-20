import type { ComposerActionPlacement } from "../types";

export interface ComposerOverflowFitAction {
  id: string;
  placement: ComposerActionPlacement;
  width: number;
  order: number;
  sequence: number;
  auto: boolean;
}

/** Pure selection, independent of menu layout. Later actions fold first;
 * explicit menu rows and pinned controls are supplied by the caller. */
export function selectComposerFitOverflow(input: {
  available: number;
  actions: readonly ComposerOverflowFitAction[];
  slots: Record<ComposerActionPlacement, { width: number; count: number }>;
  gaps: Record<ComposerActionPlacement, number>;
  clusterGap: number;
  triggerWidth: number;
  hasMenu: boolean;
  previous: ReadonlySet<string>;
}): Set<string> {
  if (input.available <= 0) return new Set(input.previous);
  const cost = (folded: ReadonlySet<string>): number => {
    const clusters = {
      start: { ...input.slots.start },
      end: { ...input.slots.end },
    };
    for (const action of input.actions) {
      if (folded.has(action.id)) continue;
      const cluster = clusters[action.placement];
      cluster.width += action.width;
      cluster.count += 1;
    }
    if (input.hasMenu || folded.size) {
      clusters.start.width += input.triggerWidth;
      clusters.start.count += 1;
    }
    return clusters.start.width + clusters.end.width +
      Math.max(0, clusters.start.count - 1) * input.gaps.start +
      Math.max(0, clusters.end.count - 1) * input.gaps.end +
      (clusters.start.count && clusters.end.count ? input.clusterGap : 0);
  };
  const folded = new Set<string>();
  const initialCost = cost(folded);
  const available = input.available - (input.previous.size ? 16 : 0);
  const candidates = input.actions.filter((action) => action.auto).sort(
    (a, b) => b.order - a.order || b.sequence - a.sequence
  );
  for (const action of candidates) {
    if (cost(folded) <= available) break;
    folded.add(action.id);
  }
  // Adding a trigger for one tiny action can consume MORE width. In that case
  // the shell may stack, but the menu must not make the crowded row worse.
  if (!input.hasMenu && cost(folded) >= initialCost) return new Set();
  return folded;
}

export function measureComposerActionWidth(element: HTMLElement): number {
  const view = element.ownerDocument.defaultView;
  if (!view) return 0;
  const style = view.getComputedStyle(element);
  if (style.display === "none" || ["absolute", "fixed"].includes(style.position)) return 0;
  const number = (value: string): number => Number.parseFloat(value) || 0;
  const width = style.display === "contents"
    ? Array.from(element.children).reduce((total, child) =>
      total + (child instanceof view.HTMLElement ? measureComposerActionWidth(child) : 0), 0)
    : Math.max(element.getBoundingClientRect().width, element.scrollWidth);
  return width + number(style.marginLeft) + number(style.marginRight);
}
