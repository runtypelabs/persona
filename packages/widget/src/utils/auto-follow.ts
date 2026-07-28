import type { AgentWidgetMessage } from "../types";

/**
 * Is this message *output a human came for*, as opposed to progress chrome?
 *
 * This is the classifier behind anchor-top's "first unread" positioning: the
 * transcript anchors to the first attention-worthy block of a response and
 * leaves everything else to scroll past underneath. Two categories:
 *
 * - **Chrome** — tool calls and reasoning. Rendered so the reader *can* audit
 *   the work, never positioned to. A response that opens with six tool calls
 *   should not park the reader on the sixth one.
 * - **Attention-worthy** — anything that carries the answer: prose, an
 *   artifact or component block (charts, forms, documents — these carry their
 *   payload in `rawContent` with an EMPTY `content`, so testing text alone
 *   silently drops them), multi-modal parts (images), and approval requests
 *   (which are the strongest case of all: the turn is blocked on the reader
 *   deciding, so it must never sit off-screen).
 *
 * The empty streaming placeholder — an assistant bubble created at
 * `text_start` before its first token — is deliberately NOT attention-worthy,
 * so the anchor waits for content rather than jumping to a blank bubble.
 */
export function isAttentionWorthyMessage(message: AgentWidgetMessage): boolean {
  if (message.role !== "assistant") return false;
  if (message.variant === "tool" || message.variant === "reasoning") return false;
  // Blocked on the reader: attention-worthy even with no text of its own.
  if (message.variant === "approval") return true;
  return Boolean(
    message.content?.trim() ||
      message.rawContent?.trim() ||
      message.contentParts?.length
  );
}

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

export type SelectionLike = Pick<Selection, "isCollapsed"> & {
  anchorNode: Node | null;
  focusNode: Node | null;
};

/**
 * True when the user has a non-collapsed text selection that touches the
 * given container. Used to pause auto-follow while the user is selecting
 * transcript text, so the streaming scroll doesn't drag content out from
 * under an in-progress drag-selection.
 */
export function hasSelectionWithin(
  selection: SelectionLike | null,
  container: Pick<Node, "contains">
): boolean {
  if (!selection || selection.isCollapsed) return false;
  return (
    container.contains(selection.anchorNode) ||
    container.contains(selection.focusNode)
  );
}

export type AnchorScrollInput = {
  /** Top of the anchored user message, relative to the scroll content. */
  anchorOffsetTop: number;
  /** Desired gap kept between the anchored message and the viewport top. */
  topOffset: number;
  /** clientHeight of the scroll container. */
  viewportHeight: number;
  /** scrollHeight of the scroll container, excluding any anchor spacer. */
  contentHeight: number;
};

/**
 * Geometry for anchor-top ("pin the sent user message near the viewport
 * top") scrolling. The spacer height is the extra scrollable room needed so
 * the target scroll position is reachable before the streamed response has
 * grown tall enough to provide it naturally.
 */
export function computeAnchorScrollState(input: AnchorScrollInput): {
  targetScrollTop: number;
  spacerHeight: number;
} {
  const targetScrollTop = Math.max(0, input.anchorOffsetTop - input.topOffset);
  const spacerHeight = Math.max(
    0,
    targetScrollTop + input.viewportHeight - input.contentHeight
  );
  return { targetScrollTop, spacerHeight };
}

/**
 * Shrink-only spacer update: as streamed content grows beneath the anchored
 * message, the spacer gives back exactly that much room so total scroll
 * height stays constant and nothing jumps. Never grows after anchoring.
 */
export function computeShrunkSpacerHeight(input: {
  initialSpacerHeight: number;
  contentHeightAtAnchor: number;
  currentContentHeight: number;
}): number {
  const growth = Math.max(
    0,
    input.currentContentHeight - input.contentHeightAtAnchor
  );
  return Math.max(0, input.initialSpacerHeight - growth);
}
