import { describe, expect, it } from "vitest";
import { selectComposerFitOverflow, type ComposerOverflowFitAction } from "./composer-overflow-fit";

const action = (id: string, order: number, width = 80, auto = true): ComposerOverflowFitAction =>
  ({ id, order, width, auto, placement: "start", sequence: order });
const select = (available: number, actions: ComposerOverflowFitAction[], previous = new Set<string>(), hasMenu = false) =>
  selectComposerFitOverflow({ available, actions, previous, hasMenu, triggerWidth: 40,
    gaps: { start: 8, end: 8 }, clusterGap: 8,
    slots: { start: { width: 0, count: 0 }, end: { width: 40, count: 1 } } });

describe("measured composer overflow selection", () => {
  it("folds only the later auto actions needed, accounting for the menu trigger", () => {
    const actions = [action("first", 100), action("second", 200), action("third", 300)];
    expect([...select(240, actions)]).toEqual(["third", "second"]);
    expect([...select(320, actions)]).toEqual([]);
  });
  it("keeps pinned actions, including when the remaining controls cannot fit", () => {
    expect([...select(70, [action("pinned", 900, 120, false), action("auto", 500)])]).toEqual(["auto"]);
  });
  it("recovers on widening with slack and retains unmeasured placement", () => {
    const actions = [action("first", 100), action("second", 200)];
    const folded = select(180, actions);
    expect([...folded]).toEqual(["second"]);
    expect([...select(220, actions, folded)]).toEqual(["second"]);
    expect([...select(240, actions, folded)]).toEqual([]);
    expect(select(0, actions, folded)).toEqual(folded);
  });
  it("does not replace one small action with a larger trigger", () => {
    expect([...select(60, [action("tiny", 500, 24)])]).toEqual([]);
    expect([...select(70, [action("tiny", 500, 24)], new Set(), true)]).toEqual(["tiny"]);
  });
});
