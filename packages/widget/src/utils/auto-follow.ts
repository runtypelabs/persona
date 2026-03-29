export type FollowStateAction = "none" | "pause" | "resume";

export type FollowStateController = {
  isFollowing: () => boolean;
  pause: () => boolean;
  resume: () => boolean;
};

export type FollowStateScrollInput = {
  following: boolean;
  currentScrollTop: number;
  lastScrollTop: number;
  nearBottom: boolean;
  userScrollThreshold: number;
  isAutoScrolling?: boolean;
  pauseOnUpwardScroll?: boolean;
  pauseWhenAwayFromBottom?: boolean;
  resumeRequiresDownwardScroll?: boolean;
};

export type FollowStateWheelInput = {
  following: boolean;
  deltaY: number;
  nearBottom?: boolean;
  resumeWhenNearBottom?: boolean;
};

export function createFollowStateController(initiallyFollowing = true): FollowStateController {
  let following = initiallyFollowing;

  return {
    isFollowing: () => following,
    pause: () => {
      if (!following) return false;
      following = false;
      return true;
    },
    resume: () => {
      if (following) return false;
      following = true;
      return true;
    }
  };
}

export function getScrollBottomOffset(element: Pick<HTMLElement, "scrollHeight" | "clientHeight">): number {
  return Math.max(0, element.scrollHeight - element.clientHeight);
}

export function isElementNearBottom(
  element: Pick<HTMLElement, "scrollTop" | "scrollHeight" | "clientHeight">,
  threshold: number
): boolean {
  return getScrollBottomOffset(element) - element.scrollTop <= threshold;
}

export function resolveFollowStateFromScroll(
  input: FollowStateScrollInput
): { action: FollowStateAction; delta: number; nextLastScrollTop: number } {
  const {
    following,
    currentScrollTop,
    lastScrollTop,
    nearBottom,
    userScrollThreshold,
    isAutoScrolling = false,
    pauseOnUpwardScroll = false,
    pauseWhenAwayFromBottom = true,
    resumeRequiresDownwardScroll = false
  } = input;

  const delta = currentScrollTop - lastScrollTop;

  if (isAutoScrolling || Math.abs(delta) < userScrollThreshold) {
    return { action: "none", delta, nextLastScrollTop: currentScrollTop };
  }

  if (!following && nearBottom && (!resumeRequiresDownwardScroll || delta > 0)) {
    return { action: "resume", delta, nextLastScrollTop: currentScrollTop };
  }

  if (following && pauseOnUpwardScroll && delta < 0) {
    return { action: "pause", delta, nextLastScrollTop: currentScrollTop };
  }

  if (following && pauseWhenAwayFromBottom && !nearBottom) {
    return { action: "pause", delta, nextLastScrollTop: currentScrollTop };
  }

  return { action: "none", delta, nextLastScrollTop: currentScrollTop };
}

export function resolveFollowStateFromWheel(
  input: FollowStateWheelInput
): FollowStateAction {
  const {
    following,
    deltaY,
    nearBottom = false,
    resumeWhenNearBottom = false
  } = input;

  if (following && deltaY < 0) {
    return "pause";
  }

  if (!following && resumeWhenNearBottom && deltaY > 0 && nearBottom) {
    return "resume";
  }

  return "none";
}
