import { describe, expect, it } from "vitest";

import {
  computeAnchorScrollState,
  computeShrunkSpacerHeight,
  createFollowStateController,
  getScrollBottomOffset,
  hasSelectionWithin,
  isElementNearBottom,
  resolveFollowStateFromScroll,
  resolveFollowStateFromWheel
} from "./auto-follow";

describe("auto-follow utilities", () => {
  it("tracks pause and resume state", () => {
    const state = createFollowStateController();

    expect(state.isFollowing()).toBe(true);
    expect(state.pause()).toBe(true);
    expect(state.isFollowing()).toBe(false);
    expect(state.pause()).toBe(false);
    expect(state.resume()).toBe(true);
    expect(state.isFollowing()).toBe(true);
  });

  it("computes bottom offset and near-bottom status", () => {
    const element = {
      scrollTop: 590,
      scrollHeight: 1000,
      clientHeight: 400
    };

    expect(getScrollBottomOffset(element)).toBe(600);
    expect(isElementNearBottom(element, 10)).toBe(true);
    expect(isElementNearBottom({ ...element, scrollTop: 560 }, 10)).toBe(false);
  });

  it("pauses transcript-style auto-follow on upward scroll immediately", () => {
    const result = resolveFollowStateFromScroll({
      following: true,
      currentScrollTop: 597,
      lastScrollTop: 600,
      nearBottom: true,
      userScrollThreshold: 1,
      pauseOnUpwardScroll: true,
      pauseWhenAwayFromBottom: false
    });

    expect(result.action).toBe("pause");
  });

  it("resumes event-log-style auto-follow only when scrolling down near bottom", () => {
    const stayPaused = resolveFollowStateFromScroll({
      following: false,
      currentScrollTop: 550,
      lastScrollTop: 560,
      nearBottom: true,
      userScrollThreshold: 1,
      resumeRequiresDownwardScroll: true
    });
    const resume = resolveFollowStateFromScroll({
      following: false,
      currentScrollTop: 590,
      lastScrollTop: 550,
      nearBottom: true,
      userScrollThreshold: 1,
      resumeRequiresDownwardScroll: true
    });

    expect(stayPaused.action).toBe("none");
    expect(resume.action).toBe("resume");
  });

  it("keeps transcript-style auto-follow paused near the bottom until scrolling down", () => {
    const stayPaused = resolveFollowStateFromScroll({
      following: false,
      currentScrollTop: 597,
      lastScrollTop: 600,
      nearBottom: true,
      userScrollThreshold: 1,
      resumeRequiresDownwardScroll: true
    });
    const resume = resolveFollowStateFromScroll({
      following: false,
      currentScrollTop: 599,
      lastScrollTop: 597,
      nearBottom: true,
      userScrollThreshold: 1,
      resumeRequiresDownwardScroll: true
    });

    expect(stayPaused.action).toBe("none");
    expect(resume.action).toBe("resume");
  });

  it("detects an active selection touching the container", () => {
    const inside = { name: "inside" } as unknown as Node;
    const outside = { name: "outside" } as unknown as Node;
    const container = {
      contains: (node: Node | null) => node === inside
    };

    expect(hasSelectionWithin(null, container)).toBe(false);
    expect(
      hasSelectionWithin(
        { isCollapsed: true, anchorNode: inside, focusNode: inside },
        container
      )
    ).toBe(false);
    expect(
      hasSelectionWithin(
        { isCollapsed: false, anchorNode: outside, focusNode: outside },
        container
      )
    ).toBe(false);
    expect(
      hasSelectionWithin(
        { isCollapsed: false, anchorNode: inside, focusNode: outside },
        container
      )
    ).toBe(true);
    expect(
      hasSelectionWithin(
        { isCollapsed: false, anchorNode: outside, focusNode: inside },
        container
      )
    ).toBe(true);
  });

  it("computes anchor-top scroll geometry", () => {
    // Anchored message deep in the transcript: spacer fills the shortfall so
    // the target position is reachable.
    expect(
      computeAnchorScrollState({
        anchorOffsetTop: 700,
        topOffset: 16,
        viewportHeight: 400,
        contentHeight: 1000
      })
    ).toEqual({ targetScrollTop: 684, spacerHeight: 84 });

    // Message near the top of the transcript: target clamps to 0.
    expect(
      computeAnchorScrollState({
        anchorOffsetTop: 10,
        topOffset: 16,
        viewportHeight: 400,
        contentHeight: 1000
      }).targetScrollTop
    ).toBe(0);

    // Already enough content below: no spacer needed.
    expect(
      computeAnchorScrollState({
        anchorOffsetTop: 500,
        topOffset: 16,
        viewportHeight: 400,
        contentHeight: 2000
      }).spacerHeight
    ).toBe(0);
  });

  it("shrinks the anchor spacer as content grows, never below zero or above initial", () => {
    const base = {
      initialSpacerHeight: 100,
      contentHeightAtAnchor: 1000
    };

    expect(
      computeShrunkSpacerHeight({ ...base, currentContentHeight: 1000 })
    ).toBe(100);
    expect(
      computeShrunkSpacerHeight({ ...base, currentContentHeight: 1040 })
    ).toBe(60);
    expect(
      computeShrunkSpacerHeight({ ...base, currentContentHeight: 1500 })
    ).toBe(0);
    // Content shrank (e.g. a collapsed tool row): spacer never grows back.
    expect(
      computeShrunkSpacerHeight({ ...base, currentContentHeight: 900 })
    ).toBe(100);
  });

  it("resolves wheel intent for pause and resume", () => {
    expect(
      resolveFollowStateFromWheel({
        following: true,
        deltaY: -12
      })
    ).toBe("pause");

    expect(
      resolveFollowStateFromWheel({
        following: false,
        deltaY: 12,
        nearBottom: true,
        resumeWhenNearBottom: true
      })
    ).toBe("resume");
  });
});
