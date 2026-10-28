import type { AgentWidgetConfig } from "../types";
import { createNode } from "../utils/dom";

/**
 * Long user message collapse ("Show more" / "Show less").
 *
 * The default user bubble wraps its content (attachments, mention chips and
 * text) in a clip region. ui.ts measures the region's real rendered height
 * after each morph and decides whether it overflows; the bubble is then
 * re-rendered from that state, so morphs and cached wrappers always agree
 * with the live DOM. The full text stays in the DOM in every state (no nested
 * scroller), so find-in-page, selection, copy and screen readers still reach it.
 */

/**
 * Default collapsed height. A bubble line is ~22–24px (0.875rem at
 * leading-relaxed/1.75), so 240px shows about ten lines: enough to recognise
 * the message, while leaving most of a ~640px panel for the reply that
 * anchor-top streams in beneath it.
 */
export const DEFAULT_USER_MESSAGE_COLLAPSE_MAX_HEIGHT = 240;

/**
 * Content within this many px (about two lines) of the limit stays expanded,
 * so the toggle never hides just a line or two behind a button of its own size.
 */
export const USER_MESSAGE_COLLAPSE_SLACK = 48;

/**
 * - `fit`: not measured yet, or short enough; no toggle.
 * - `live`: an interim voice transcript; expanded so the speaker can watch it.
 * - `settling`: the transcript's first final render, still expanded; the
 *   post-morph measurement settles it in the same pass, holding the viewport.
 * - `collapsed` / `expanded`: overflowing, with the toggle.
 */
export type UserMessageCollapseState = "fit" | "live" | "settling" | "collapsed" | "expanded";

export type UserMessageCollapseRender = {
  state: UserMessageCollapseState;
  maxHeight: number;
  showMoreLabel: string;
  showLessLabel: string;
};

export const USER_COLLAPSE_REGION_ATTR = "data-persona-user-collapse";
export const USER_COLLAPSE_TOGGLE_ATTR = "data-persona-user-collapse-toggle";

export const isUserMessageCollapseEnabled = (config: AgentWidgetConfig): boolean =>
  config.features?.userMessageCollapse?.enabled === true;

export const resolveUserMessageCollapseMaxHeight = (config: AgentWidgetConfig): number => {
  const value = config.features?.userMessageCollapse?.maxHeight;
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_USER_MESSAGE_COLLAPSE_MAX_HEIGHT;
};

export const resolveUserMessageCollapseLabels = (
  config: AgentWidgetConfig
): Pick<UserMessageCollapseRender, "showMoreLabel" | "showLessLabel"> => ({
  showMoreLabel: config.copy?.showMoreLabel?.trim() || "Show more",
  showLessLabel: config.copy?.showLessLabel?.trim() || "Show less",
});

/** Whether a measured natural content height warrants collapsing. */
export const userMessageOverflows = (naturalHeight: number, maxHeight: number): boolean =>
  naturalHeight > maxHeight + USER_MESSAGE_COLLAPSE_SLACK;

const regionId = (messageId: string) => `persona-user-collapse-${messageId}`;

export const createUserCollapseRegion = (
  messageId: string,
  maxHeight: number
): HTMLElement => {
  const region = createNode("div", {
    className: "persona-user-collapse-region",
    attrs: { id: regionId(messageId), [USER_COLLAPSE_REGION_ATTR]: "fit" },
  });
  region.style.setProperty("--persona-user-collapse-max-height", `${maxHeight}px`);
  return region;
};

/**
 * Apply a state to a region and its sibling toggle. Used both while building a
 * fresh bubble and to patch the live bubble in place on a toggle or a new
 * measurement, so the toggle keeps its identity (and focus) across states.
 */
export const applyUserCollapseState = (
  bubble: HTMLElement,
  region: HTMLElement,
  messageId: string,
  render: UserMessageCollapseRender
): void => {
  const { state } = render;
  region.setAttribute(USER_COLLAPSE_REGION_ATTR, state);
  region.style.setProperty("--persona-user-collapse-max-height", `${render.maxHeight}px`);
  let toggle = bubble.querySelector<HTMLButtonElement>(`button[${USER_COLLAPSE_TOGGLE_ATTR}]`);
  if (state !== "collapsed" && state !== "expanded") {
    toggle?.remove();
    return;
  }
  if (!toggle) {
    toggle = createNode("button", {
      className: "persona-user-collapse-toggle",
      attrs: {
        type: "button",
        id: `persona-user-collapse-toggle-${messageId}`,
        [USER_COLLAPSE_TOGGLE_ATTR]: "",
        "aria-controls": regionId(messageId),
      },
    }) as HTMLButtonElement;
    region.after(toggle);
  }
  const expanded = state === "expanded";
  toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
  toggle.textContent = expanded ? render.showLessLabel : render.showMoreLabel;
};
