import { describe, expect, it } from "vitest";

import {
  createFollowStateController,
  getScrollBottomOffset,
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
