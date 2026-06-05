import { describe, it, expect } from "vitest";
import {
  navigateComposerHistory,
  INITIAL_HISTORY_STATE,
  type ComposerHistoryState
} from "./composer-history";

const history = ["first", "second", "third"]; // oldest -> newest

const up = (
  state: ComposerHistoryState,
  overrides: Partial<Parameters<typeof navigateComposerHistory>[0]> = {}
) =>
  navigateComposerHistory({
    direction: "up",
    history,
    currentValue: "",
    atStart: true,
    state,
    ...overrides
  });

const down = (
  state: ComposerHistoryState,
  overrides: Partial<Parameters<typeof navigateComposerHistory>[0]> = {}
) =>
  navigateComposerHistory({
    direction: "down",
    history,
    currentValue: "",
    atStart: true,
    state,
    ...overrides
  });

describe("navigateComposerHistory", () => {
  it("Up from a fresh composer recalls the newest message and saves the draft", () => {
    const result = up(
      { ...INITIAL_HISTORY_STATE },
      { currentValue: "my draft" }
    );
    expect(result.handled).toBe(true);
    expect(result.value).toBe("third");
    expect(result.state).toEqual({ index: 2, draft: "my draft" });
  });

  it("repeated Up steps toward older messages", () => {
    let state = up({ ...INITIAL_HISTORY_STATE }).state;
    expect(state.index).toBe(2);

    const second = up(state);
    expect(second.value).toBe("second");
    state = second.state;

    const third = up(state);
    expect(third.value).toBe("first");
    state = third.state;
    expect(state.index).toBe(0);
  });

  it("Up at the oldest entry is consumed but does not change the value", () => {
    const state: ComposerHistoryState = { index: 0, draft: "" };
    const result = up(state);
    expect(result.handled).toBe(true);
    expect(result.value).toBeUndefined();
    expect(result.state.index).toBe(0);
  });

  it("does not hijack Up when not navigating and the caret is not at the start", () => {
    const result = up({ ...INITIAL_HISTORY_STATE }, { atStart: false });
    expect(result.handled).toBe(false);
    expect(result.value).toBeUndefined();
  });

  it("continues navigating Up even when the caret is not at the start", () => {
    // Already in history mode (caret sits at end after a recall).
    const state: ComposerHistoryState = { index: 2, draft: "draft" };
    const result = up(state, { atStart: false });
    expect(result.handled).toBe(true);
    expect(result.value).toBe("second");
  });

  it("Down steps toward newer messages while navigating", () => {
    const state: ComposerHistoryState = { index: 0, draft: "draft" };
    const result = down(state);
    expect(result.handled).toBe(true);
    expect(result.value).toBe("second");
    expect(result.state.index).toBe(1);
  });

  it("Down past the newest entry restores the saved draft and exits", () => {
    const state: ComposerHistoryState = { index: 2, draft: "saved draft" };
    const result = down(state);
    expect(result.handled).toBe(true);
    expect(result.value).toBe("saved draft");
    expect(result.state).toEqual(INITIAL_HISTORY_STATE);
  });

  it("Down does nothing when not navigating history", () => {
    const result = down({ ...INITIAL_HISTORY_STATE });
    expect(result.handled).toBe(false);
    expect(result.value).toBeUndefined();
  });

  it("does nothing when there is no history", () => {
    const result = navigateComposerHistory({
      direction: "up",
      history: [],
      currentValue: "",
      atStart: true,
      state: { ...INITIAL_HISTORY_STATE }
    });
    expect(result.handled).toBe(false);
  });

  it("round-trips: Up then Down returns to the original draft", () => {
    const draft = "in progress";
    let state = { ...INITIAL_HISTORY_STATE };

    const u1 = up(state, { currentValue: draft });
    state = u1.state;
    expect(u1.value).toBe("third");

    const d1 = down(state); // back past newest -> restore draft
    expect(d1.value).toBe(draft);
    expect(d1.state).toEqual(INITIAL_HISTORY_STATE);
  });
});
