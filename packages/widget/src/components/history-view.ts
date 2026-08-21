/**
 * History ("Messages") navigation view — the default visitor-facing surface
 * described in `docs/visitor-history-implementation-plan.md` D7.
 *
 * Scope split: this file owns the VIEW (list, grouping, paging, list-region
 * states, row/menu affordances, its own announcements and styles). The shell
 * owns placement, open/close, inertness of the obscured conversation, focus
 * orchestration between surfaces, confirmations, and every session mutation —
 * the view only invokes the callbacks below and awaits their promises.
 *
 * Never statically imported on the core path: the IIFE build marks
 * `@runtypelabs/persona/history-view` external and `build:client` marks the same
 * subpath external for ESM/CJS. The core reaches it through
 * `history-view-loader.ts`. Guarded by `history-view-bundle.test.ts`.
 */

import { injectStyles } from "../plugin-kit";
import { createNode, cx } from "../utils/dom";
import type { TooltipHandle, TooltipOptions } from "../utils/tooltip";
import { createHistoryAnnouncer } from "./history-view/announcer";
import { HISTORY_VIEW_CSS } from "./history-view/css";
import {
  resolveHistoryViewCopy,
  type HistoryViewCopyInput,
  type ResolvedHistoryViewCopy,
} from "./history-view/copy";
import {
  groupConversations,
  type HistoryGroupingMode,
} from "./history-view/grouping";
import { historyIcon } from "./history-view/icons";
import {
  buildConversationRow,
  buildMenuTrigger,
  buildOverflowMenu,
  menuItemFocusKey,
  type HistoryMenuItemSpec,
  type RowPending,
} from "./history-view/rows";
import {
  buildStateBlock,
  toListState,
  type HistoryListState,
} from "./history-view/state";
import {
  isHistoryProviderError,
  type HistoryConversationSummary,
  type HistoryOperationContext,
  type HistoryProvider,
} from "../internal/history-provider";
import type {
  AgentWidgetHistoryRenderActions,
  HistoryIdentityStatus,
} from "../types";

export type HistoryViewPresentation = "panel" | "rail";

/**
 * Where the top bar's contents live. `"external"` hands them to the shell,
 * which mounts them inside its own persistent header; the view element then
 * starts at the body.
 */
export type HistoryHeaderPlacement = "inline" | "external";

export type HistoryViewPendingAction =
  | { kind: "refresh" | "load-more" | "start-new" | "clear" | "reset" }
  | { kind: "open" | "delete"; conversationId: string }
  | null;

/**
 * Slot seams for the core arbitration layer (`history-render.ts`). The public
 * plugin contexts are built there: the view only supplies the slot's data and
 * its own default DOM, and never sees a plugin.
 */
export interface HistoryHeaderSlotContext {
  identityStatus: HistoryIdentityStatus;
  pendingAction: HistoryViewPendingAction;
  copy: ResolvedHistoryViewCopy;
  defaultRenderer: () => HTMLElement;
}

export interface HistoryConversationSlotContext {
  conversation: HistoryConversationSummary;
  active: boolean;
  pending: RowPending;
  open: () => Promise<void>;
  requestDelete: () => Promise<"deleted" | "cancelled">;
  defaultRenderer: () => HTMLElement;
}

export interface HistoryStateSlotContext {
  state: Exclude<HistoryListState, { kind: "ready" }>;
  identityStatus: HistoryIdentityStatus;
  copy: ResolvedHistoryViewCopy;
  retry?: () => Promise<void>;
  startNewConversation?: () => Promise<void>;
  defaultRenderer: () => HTMLElement;
}

export interface HistoryViewSlotRenderers {
  header?: (context: HistoryHeaderSlotContext) => HTMLElement | null;
  conversation?: (
    context: HistoryConversationSlotContext
  ) => HTMLElement | null;
  state?: (context: HistoryStateSlotContext) => HTMLElement | null;
}

/** Snapshot source for the core arbitration layer. Read-only by contract. */
export interface HistoryViewModel {
  conversations: readonly HistoryConversationSummary[];
  activeConversationId: string | null;
  state: HistoryListState;
  pendingAction: HistoryViewPendingAction;
  identityStatus: HistoryIdentityStatus;
  nextCursor: string | null;
}

/**
 * The operations the default DOM invokes. Shaped as the public render actions
 * minus `close` (the shell owns that) so the core can forward them verbatim.
 */
export type HistoryViewOperations = Omit<
  AgentWidgetHistoryRenderActions,
  "close"
>;

/** Where a rail section sits relative to the built-in conversation list. */
export type HistoryRailSectionPlacement =
  | "above-conversations"
  | "below-conversations"
  | "footer";

/** Core-normalized rail nav item: one label, one pre-resolved icon, one action. */
export interface HistoryRailSectionItem {
  id: string;
  label: string;
  badge?: string;
  /** Memoized by the core, so a presentation flip reuses the same node. */
  iconNode?: () => Element | null;
  /** Already guarded by the core; this chunk calls it bare. */
  onSelect: () => void;
}

export interface HistoryRailSection {
  id: string;
  title?: string;
  placement: HistoryRailSectionPlacement;
  items: HistoryRailSectionItem[];
  /**
   * Plugin-backed body, in place of `items`. Re-invoked with each new collapsed
   * value; null empties and hides the section, as does a throw after one warn.
   */
  render?: (collapsed: boolean) => Element | null;
}

export interface HistoryViewOptions {
  /** Internal seam (D9). The view never touches `AgentWidgetClient`. */
  provider: HistoryProvider;
  /** Resolved once when history opens; reused by every operation. */
  context: HistoryOperationContext;
  /** Canonical active target filter. `null` lists the whole authorized scope. */
  targetId: string | null;
  /** Host overrides; defaults are applied here, so passing a partial is fine. */
  copy?: HistoryViewCopyInput;
  /** Already resolved against the host container width by the shell, not here. */
  presentation: HistoryViewPresentation;
  /**
   * Rail only. Default true: the bar's leading control is a collapse toggle
   * instead of a close (x), and `onToggleCollapse` drives it.
   */
  collapsible?: boolean;
  /** Rail only. Initial collapsed state; the shell owns and persists it. */
  collapsed?: boolean;
  /**
   * Rail only. The edge the rail docks to, so the bar can put its collapse
   * toggle on the inner edge facing the conversation. Default `"left"`.
   */
  railSide?: "left" | "right";
  /**
   * Rail only. Host-rendered identity for the bar's heading area. The `h2`
   * stays in the DOM as sr-only, so the region keeps its accessible name.
   */
  renderRailHeader?: (context: {
    collapsed: boolean;
    defaultTitle: string;
  }) => Element | null;
  /**
   * Rail only. Core-resolved brand mark for both identity spots: the heading
   * default composition (`false`) and the collapsed toggle's rest face
   * (`true`). Null means no brand for that spot. Outranked by
   * `renderRailHeader` in the heading.
   */
  railBrand?: (collapsed: boolean) => Element | null;
  /**
   * Rail only. Host navigation sections stacked around the conversation list.
   * Normalized by the core, which also resolves each item's icon precedence
   * into `iconNode` so this chunk never imports the lucide registry.
   */
  railSections?: HistoryRailSection[];
  /**
   * Rail only. Pre-formatted collapse shortcut: `hint` is the tooltip chip,
   * `aria` the `aria-keyshortcuts` value. The shell owns the binding and both
   * strings, so this chunk never bundles the shortcut module.
   */
  collapseShortcut?: { hint: string; aria: string };
  /** Default `"inline"`. Rail is always inline; the shell enforces that. */
  headerPlacement?: HistoryHeaderPlacement;
  showScopeStatus: boolean;
  /**
   * Per-row delete via the row overflow menu. Default true; false drops the
   * trigger (delete is its only item). Hides the control only — custom row
   * slots still receive `requestDelete`.
   */
  showDelete?: boolean;
  /** The list overflow menu's clear-history item. Default true. */
  showDeleteAll?: boolean;
  /**
   * Leading row avatar: an image URL, a glyph, or `false` to omit the block.
   * Absent falls back to the same glyph the header uses.
   */
  rowAvatar?: string | false;
  activeConversationId: string | null;
  /**
   * Date bucketing of the list. Default `"time"`; `"none"` folds the time
   * buckets into one flat group. Starred rows keep their pinned group either
   * way.
   */
  grouping?: HistoryGroupingMode;
  /** List page size. Default 25. */
  pageSize?: number;
  /** Clock seam for grouping and relative time. */
  now?: () => number;

  /** Row selection. The shell commits the open; the view shows row pending. */
  onSelect: (conversationId: string) => void | Promise<void>;
  onStartNew: () => void | Promise<void>;
  /** Back (panel) or close (rail without a collapse toggle). */
  onClose: () => void;
  /** Collapse toggle. The shell decides, then calls `setCollapsed`. */
  onToggleCollapse?: () => void;
  /** Shell owns the confirmation; resolves with the outcome. */
  onRequestDeleteConversation: (
    conversationId: string
  ) => Promise<"deleted" | "cancelled">;
  onRequestClearHistory: () => Promise<"cleared" | "cancelled">;
  /** Rendered only when the provider exposes `resetDevice`. */
  onRequestResetIdentity?: () => Promise<
    { outcome: "cancelled" } | { outcome: "reset"; remoteRevocationConfirmed: boolean }
  >;

  /** Core-owned plugin slots. Absent means the default DOM everywhere. */
  slots?: HistoryViewSlotRenderers;
  /**
   * Start with DOM rendering suspended so the core can arbitrate a full-view
   * hook before any slot runs. Default true.
   */
  renderDom?: boolean;
  /** Model-change signal, emitted only while DOM rendering is suspended. */
  onModelChange?: () => void;
  /**
   * Fired whenever the ACTIVE conversation's list summary changes: on
   * selection, on a list refresh that delivers a server-generated title, on a
   * rename/star patch, and with `null` when no active conversation is listed.
   * Feeds the shell's `layout.header.titleSource: "conversation"` binding and
   * its built-in title-menu star toggle.
   */
  onActiveConversationChange?: (
    summary: HistoryConversationSummary | null
  ) => void;
  /** Shell live region, used while this view's own one is detached. */
  onAnnounce?: (message: string) => void;
  /**
   * The shell's tooltip attacher, passed in so the size-capped chunk never
   * bundles a second copy of the tooltip module. Absent means no tooltips.
   */
  attachTooltip?: (options: TooltipOptions) => TooltipHandle;
}

export interface HistoryViewHandle {
  element: HTMLElement;
  /** Resolved copy, defaults included. The defaults live in this chunk. */
  copy: ResolvedHistoryViewCopy;
  /** Immutable-by-contract model snapshot for the core arbitration layer. */
  getModel(): HistoryViewModel;
  /** The same operations the default DOM invokes, for public render hooks. */
  operations: HistoryViewOperations;
  /** Suspend/resume this view's DOM while a plugin owns the full surface. */
  setDomRenderEnabled(enabled: boolean): void;
  /** Re-fetch and re-render the list in place, preserving list/focus state. */
  refresh(): void;
  /**
   * Retarget the view when the shell moves it between hosts (rail <-> panel).
   * The instance and all its state survive the move; only chrome changes.
   */
  setPresentation(presentation: HistoryViewPresentation): void;
  /**
   * Collapse the rail to its icon column. The view only styles itself and
   * relabels the toggle; the shell owns the host width and the persisted state.
   */
  setCollapsed(collapsed: boolean): void;
  /** Re-mirror the bar for a live `rail.side` change. */
  setRailSide(side: "left" | "right"): void;
  /**
   * The top bar's CURRENT content node (the default bar or a slot replacement).
   * A slot re-render swaps it in place, so an external host stays its parent.
   */
  getHeaderElement(): HTMLElement;
  /**
   * Hand the bar's contents to the shell (`"external"`, detached for the shell
   * to re-home) or take them back (`"inline"`). Idempotent; never replays the
   * entrance.
   */
  setHeaderPlacement(placement: HistoryHeaderPlacement): void;
  /** Keep the active-row indicator in sync when the shell changes conversation. */
  setActiveConversationId(conversationId: string | null): void;
  /** Patch one listed summary in place after a shell-side rename/star. */
  applyConversationSummary(summary: HistoryConversationSummary): void;
  /** Drop one listed row after a shell-side delete (headless or built-in). */
  removeConversationSummary(conversationId: string): void;
  /** Enter/leave the post-deletion replacement-init recovery state. */
  setNewConversationRequired(required: boolean): void;
  /**
   * Mirrored exit for the shell's close sequence. Resolves once the surface has
   * visually left; never rejects, and repeat calls join the running exit.
   * `null` means nothing to wait for (motion off, or no WAAPI): the caller must
   * tear down synchronously rather than deferring by a microtask.
   */
  playExit(): Promise<void> | null;
  destroy(): void;
}

const DEFAULT_PAGE_SIZE = 25;

/**
 * Open-menu id for the list-level overflow, so it shares the row menu's
 * open/close, outside-click and Escape machinery. Never a conversation id.
 */
const LIST_MENU_ID = "persona:list-options";

/** Motion. The entrance is CSS (`css.ts`); the exit below mirrors it. */
const ENTRANCE_MS = 180;
/** Arrival of the shell-hosted bar; the bar chrome around it never moves. */
const SHELL_FADE_MS = 120;
const EXIT_MS = 160;
const EXIT_EASING = "cubic-bezier(0.4, 0, 1, 1)";
const EXIT_SLIDE_PX: Record<HistoryViewPresentation, number> = {
  panel: 20,
  rail: 12,
};

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A cancelled animation resolves like a finished one: the shell must proceed. */
const settled = (animation: Animation): Promise<void> =>
  animation.finished
    ? animation.finished.then(
        () => undefined,
        () => undefined
      )
    : Promise.resolve();

function identityKey(status: HistoryIdentityStatus): string {
  return `${status.state}:${"reason" in status ? status.reason : ""}`;
}

function scopeCopy(
  status: HistoryIdentityStatus,
  copy: ResolvedHistoryViewCopy
): { title: string; description: string; pending: boolean } {
  switch (status.state) {
    case "verified":
      return {
        title: copy.verifiedTitle,
        description: copy.verifiedDescription,
        pending: false,
      };
    case "verifying":
    case "resetting":
      return {
        title: copy.verifyingTitle,
        description: copy.verifyingDescription,
        pending: true,
      };
    case "authentication_required":
      return {
        title: copy.authenticationRequiredTitle,
        description: copy.authenticationRequiredDescription,
        pending: false,
      };
    case "identity_provider_failed":
      return {
        title: copy.identityProviderFailedTitle,
        description: copy.identityProviderFailedDescription,
        pending: false,
      };
    case "configuration_error":
      return {
        title: copy.proofNotAdmittedTitle,
        description: copy.proofNotAdmittedDescription,
        pending: false,
      };
    case "unavailable":
      return {
        title: copy.unavailableTitle,
        description: copy.unavailableDescription,
        pending: false,
      };
    default:
      return {
        title: copy.browserOnlyTitle,
        description: copy.browserOnlyDescription,
        pending: false,
      };
  }
}

/**
 * Ambient states are stable information, not a call to action: the title alone
 * shows as a quiet subtitle and the sentence attaches via `aria-describedby`.
 * Everything else is actionable and keeps the visible block.
 */
function scopeAmbient(status: HistoryIdentityStatus): boolean {
  return status.state === "verified" || status.state === "browser_only";
}

/** Identity states whose failure copy offers a retry. */
function identityRetryable(status: HistoryIdentityStatus): boolean {
  return (
    status.state === "authentication_required" ||
    status.state === "identity_provider_failed" ||
    status.state === "configuration_error"
  );
}

export function createHistoryView(
  options: HistoryViewOptions
): HistoryViewHandle {
  const copy = resolveHistoryViewCopy(options.copy);
  const now = options.now ?? (() => Date.now());
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const headingId = `persona-history-title-${Math.random().toString(36).slice(2, 8)}`;

  let items: HistoryConversationSummary[] = [];
  let nextCursor: string | null = null;
  let listState: HistoryListState = { kind: "loading", phase: "initial" };
  let pending: HistoryViewPendingAction = null;
  let activeConversationId = options.activeConversationId;
  let identityStatus = options.provider.getIdentityStatus();
  let renderedIdentityKey = identityKey(identityStatus);
  let openMenuId: string | null = null;
  let focusMenuOnRender = false;
  let destroyed = false;
  let listEpoch = 0;
  let presentation = options.presentation;
  const collapsible = options.collapsible !== false;
  let collapsed = options.collapsed === true;
  let railRight = options.railSide === "right";
  let domRenderEnabled = options.renderDom !== false;
  const rowErrors = new Map<string, { message: string; retry: () => void }>();
  let actionError: { message: string; retry: () => void } | null = null;

  const announcer = createHistoryAnnouncer();

  /** A suspended view is detached: its live region cannot speak, the shell's can. */
  const announce = (message: string): void => {
    if (!domRenderEnabled && options.onAnnounce) options.onAnnounce(message);
    else announcer.announce(message);
  };

  const busy = (): boolean => pending !== null;

  // --- static chrome (built once; never moves between list states) ---------

  const bodyId = `${headingId}-body`;

  const backButton = createNode("button", {
    className: "persona-history-icon-button persona-history-back",
    attrs: { type: "button" },
  });

  /** Only a collapsible rail turns the leading control into a toggle. */
  const collapseToggle = (): boolean => presentation === "rail" && collapsible;

  /** Built once: the ctx of this face is always the collapsed rail. */
  let toggleFace: Element | null | undefined;

  /**
   * Collapsed rest face for the toggle, stacked with the glyph the CSS reveals
   * on hover and keyboard focus. Panel drops it; a move back re-appends it.
   */
  const syncToggleBrand = (): void => {
    if (!options.railBrand) return;
    if (!collapseToggle()) {
      backButton.classList.remove("persona-history-back--branded");
      return;
    }
    if (toggleFace === undefined) {
      const mark = options.railBrand(true);
      toggleFace = mark
        ? createNode(
            "span",
            {
              className:
                "persona-history-brand-mark persona-history-toggle-brand",
              attrs: { "aria-hidden": "true" },
            },
            mark
          )
        : null;
    }
    if (!toggleFace) return;
    backButton.classList.add("persona-history-back--branded");
    backButton.appendChild(toggleFace);
  };

  const syncLeadingControl = (): void => {
    const toggle = collapseToggle();
    const rail = presentation === "rail";
    backButton.setAttribute(
      "data-persona-history-focus",
      toggle ? "collapse" : "close"
    );
    backButton.setAttribute(
      "aria-label",
      toggle
        ? collapsed
          ? copy.expandLabel
          : copy.collapseLabel
        : rail
          ? copy.closeLabel
          : copy.backLabel
    );
    if (toggle) {
      backButton.setAttribute("aria-expanded", collapsed ? "false" : "true");
      backButton.setAttribute("aria-controls", bodyId);
      // Only the collapse toggle answers to the shortcut; a back/close does not.
      if (options.collapseShortcut?.aria) {
        backButton.setAttribute(
          "aria-keyshortcuts",
          options.collapseShortcut.aria
        );
      }
    } else {
      backButton.removeAttribute("aria-expanded");
      backButton.removeAttribute("aria-controls");
      backButton.removeAttribute("aria-keyshortcuts");
    }
    backButton.replaceChildren(
      historyIcon(toggle ? "panel-left" : rail ? "x" : "arrow-left")
    );
    syncToggleBrand();
  };
  syncLeadingControl();
  backButton.addEventListener("click", () => {
    if (collapseToggle()) options.onToggleCollapse?.();
    else options.onClose();
  });

  const title = createNode("h2", {
    className: "persona-history-title",
    text: copy.viewTitle,
    attrs: { id: headingId },
  });

  const scopeTitle = createNode("span", {
    className: "persona-history-scope-title",
  });
  // The icon is rail-only chrome, revealed by CSS; panel keeps the plain
  // sentence. Decorative: the title text carries the meaning.
  const scopeLine = createNode(
    "p",
    { className: "persona-history-scope" },
    createNode(
      "span",
      {
        className: "persona-history-scope-icon",
        attrs: { "aria-hidden": "true" },
      },
      historyIcon("monitor", 14)
    ),
    scopeTitle
  );

  const headingGroup = createNode(
    "div",
    { className: "persona-history-heading-group" },
    title
  );

  let brandWarned = false;
  /** Built once: the ctx of this face is always the expanded rail. */
  let headingBrand: Element | null | undefined;

  /**
   * Rail-only identity slot. A host mark replaces the visible title; the `h2`
   * stays sr-only so `aria-labelledby` still resolves to a name.
   */
  const syncRailBrand = (): void => {
    const rail = presentation === "rail";
    const slot = rail ? options.renderRailHeader : undefined;
    let mark: Element | null = null;
    let slotted = slot !== undefined;
    if (slot) {
      try {
        mark = slot({ collapsed, defaultTitle: copy.viewTitle });
      } catch (error) {
        slotted = false;
        if (!brandWarned) {
          brandWarned = true;
          console.warn("[persona] history rail renderHeader threw", error);
        }
      }
    }
    // Default composition for a brand declaration: mark leading, the view
    // title beside it as the wordmark. Built once, since this face is only
    // ever the expanded one.
    if (!slotted && rail && options.railBrand) {
      if (headingBrand === undefined) {
        const brand = options.railBrand(false);
        headingBrand = brand
          ? createNode(
              "span",
              {
                className: "persona-history-heading-brand",
                attrs: { "aria-hidden": "true" },
              },
              createNode(
                "span",
                { className: "persona-history-brand-mark" },
                brand
              ),
              createNode("span", {
                className: "persona-history-wordmark",
                text: copy.viewTitle,
              })
            )
          : null;
      }
      if (headingBrand) {
        slotted = true;
        mark = headingBrand;
      }
    }
    title.classList.toggle("persona-history-sr-only", slotted);
    headingGroup.replaceChildren(title);
    if (mark) headingGroup.appendChild(mark);
  };
  syncRailBrand();

  const newIconButton = createNode("button", {
    className: "persona-history-icon-button persona-history-new-icon",
    attrs: {
      type: "button",
      "data-persona-history-focus": "new-icon",
      "aria-label": copy.newConversationLabel,
    },
  });
  newIconButton.appendChild(historyIcon("plus"));
  newIconButton.addEventListener("click", () => void startNew());

  // Same styled tooltip as the shell header controls beside this bar. Live
  // aria-label getters keep the rail close relabel accurate.
  const tooltipHandles = [backButton, newIconButton].map((control) =>
    options.attachTooltip?.({
      anchor: control,
      text: () => control.getAttribute("aria-label") ?? "",
      // Hint chip only while this control is the collapse toggle.
      ...(control === backButton && options.collapseShortcut
        ? { hint: () => (collapseToggle() ? options.collapseShortcut!.hint : "") }
        : {}),
    })
  );

  const topbar = createNode("div", { className: "persona-history-topbar" });

  let barOrderKey: string | null = null;

  /**
   * The rail puts its collapse toggle on the inner edge facing the conversation
   * (trailing on the left, leading on the right); the panel keeps the back
   * arrow leading. DOM order, so tab order follows the visual one.
   */
  const syncBarOrder = (): void => {
    const rail = presentation === "rail";
    const key = rail ? (railRight ? "rail-right" : "rail") : "panel";
    if (key === barOrderKey) return;
    barOrderKey = key;
    // Re-parenting blurs what it moves, so only a real order change re-appends.
    if (key === "rail") topbar.append(headingGroup, backButton);
    else topbar.append(backButton, headingGroup);
    // The rail already carries a new-conversation row in its body.
    if (rail) newIconButton.remove();
    else topbar.appendChild(newIconButton);
    // Only reachable after `element` exists: the first call is below it.
    element.classList.toggle(
      "persona-history-view--rail-right",
      key === "rail-right"
    );
  };

  /**
   * Explanatory scope text + identity retry, at the top of the body. Visible
   * only for actionable states; ambient states keep it sr-only behind the
   * caption above the list (see `scopeAmbient`).
   */
  const scopeBlock = createNode("div", {
    className: "persona-history-scope-alert",
  });
  const scopeDescriptionId = `${headingId}-scope`;

  // Both presentations lead with the compose plus, Intercom-style.
  const newIcon = historyIcon("plus", 18);
  const newConversationButton = createNode(
    "button",
    {
      className: "persona-history-new",
      attrs: { type: "button", "data-persona-history-focus": "new" },
    },
    newIcon,
    createNode("span", { text: copy.newConversationLabel })
  );
  newConversationButton.addEventListener("click", () => void startNew());

  const listRegion = createNode("div", {
    className: "persona-history-list-region",
  });

  // Destructive actions are never ambient furniture: both live behind this one
  // quiet trigger, which is chrome and therefore renders through the load.
  const clearAllowed = options.showDeleteAll !== false;
  const resetAllowed = !!options.provider.resetDevice;

  const optionsButton =
    clearAllowed || resetAllowed
      ? buildMenuTrigger({
          className: "persona-history-list-options",
          label: copy.listOptionsLabel,
          focusKey: `menu:${LIST_MENU_ID}`,
          open: false,
          inert: true,
          iconSize: 16,
          onToggle: () => toggleMenu(LIST_MENU_ID),
        })
      : null;

  /**
   * Heading over the conversation list. Visible in the rail, where it anchors
   * the block the way the nav section titles do; sr-only in the panel, which
   * already carries the view title directly above.
   */
  const conversationsHeading = createNode("h3", {
    className: "persona-history-conversations-title",
    text: copy.conversationsTitle,
  });

  /**
   * List header block: heading and overflow trigger on the first line, the
   * scope caption under them. Present even when the scope caption is off or
   * hidden, so the trigger never depends on identity state. The item attribute
   * is what the row menus use, so the outside-click guard covers this menu too.
   */
  const captionRow = createNode(
    "div",
    {
      className: "persona-history-caption",
      attrs: { "data-persona-history-item": LIST_MENU_ID },
    },
    conversationsHeading,
    options.showScopeStatus ? scopeLine : null,
    optionsButton
  );

  // One sliding region below the bar: the scope alert and the ambient caption
  // are body content, not chrome.
  const body = createNode(
    "div",
    { className: "persona-history-body", attrs: { id: bodyId } },
    options.showScopeStatus ? scopeBlock : null,
    newConversationButton,
    // Always present: the rail shows its heading even with the scope caption
    // off and no overflow trigger; the panel hides the empty row (renderChrome).
    captionRow,
    listRegion
  );

  let headerPlacement: HistoryHeaderPlacement =
    options.headerPlacement ?? "inline";
  if (headerPlacement === "external") {
    topbar.classList.add(
      "persona-history-topbar--shell",
      "persona-history-topbar--shell-enter"
    );
  }

  const element = createNode(
    "div",
    {
      className: cx(
        "persona-history-view",
        `persona-history-view--${options.presentation}`,
        "persona-history-view--enter"
      ),
      attrs: {
        role: "region",
        "aria-labelledby": headingId,
        "data-persona-history-presentation": options.presentation,
      },
    },
    announcer.element,
    headerPlacement === "inline" ? topbar : null,
    body
  );

  /** Collapsed is a rail-only treatment: panel always shows the whole list. */
  const syncCollapsedClass = (): void => {
    element.classList.toggle(
      "persona-history-view--rail-collapsed",
      collapsed && collapseToggle()
    );
  };
  syncCollapsedClass();
  syncBarOrder();

  // --- rail nav sections --------------------------------------------------

  const buildNavSection = (
    section: HistoryRailSection,
    index: number
  ): HTMLElement => {
    const navHeadingId = `${headingId}-s${index}`;
    const node = createNode("div", {
      className: cx(
        "persona-history-nav",
        section.placement === "footer" && "persona-history-nav--footer"
      ),
      attrs: {
        role: "group",
        "data-persona-rail-section": section.id,
        ...(section.title
          ? { "aria-labelledby": navHeadingId }
          : { "aria-label": section.id }),
      },
    });
    if (section.title) {
      node.appendChild(
        createNode("h3", {
          className: "persona-history-group-heading",
          text: section.title,
          attrs: { id: navHeadingId },
        })
      );
    }
    for (const item of section.items) {
      const icon = item.iconNode?.() ?? null;
      const button = createNode(
        "button",
        {
          // Collapsed keeps only the rows that have something to show as a square.
          className: cx(
            "persona-history-nav-item",
            icon && "persona-history-nav-item--icon"
          ),
          attrs: {
            type: "button",
            "aria-label": item.label,
            "data-persona-rail-item": item.id,
          },
        },
        icon ? createNode("span", { className: "persona-history-nav-icon" }, icon) : null,
        createNode("span", {
          className: "persona-history-nav-label persona-history-truncate",
          text: item.label,
        }),
        item.badge
          ? createNode("span", {
              className: "persona-history-nav-badge",
              text: item.badge,
            })
          : null
      );
      button.addEventListener("click", () => item.onSelect());
      node.appendChild(button);
    }
    return node;
  };

  /** Built once; a presentation flip only detaches and re-attaches them. */
  let navNodes: HTMLElement[] | null = null;
  /** Collapsed value the render-backed sections were last built for. */
  let navCollapsed: boolean | null = null;

  /**
   * Render-backed sections only, and only while this view owns the DOM: a
   * plugin holding the whole surface never invokes them.
   */
  const syncNavContent = (): void => {
    if (
      !navNodes ||
      !domRenderEnabled ||
      presentation !== "rail" ||
      collapsed === navCollapsed
    )
      return;
    navCollapsed = collapsed;
    options.railSections!.forEach((section, index) => {
      if (!section.render) return;
      const node = navNodes![index];
      // The heading outlives a content swap; it is always the first child.
      const heading = section.title ? node.firstElementChild : null;
      let content: Element | null = null;
      try {
        content = section.render(collapsed);
      } catch (error) {
        // Warn once, then drop the section: this array is the view's own copy.
        section.render = undefined;
        console.warn("[persona] history rail section threw", section.id, error);
      }
      node.replaceChildren(...(heading ? [heading] : []), ...(content ? [content] : []));
      node.hidden = !content;
    });
  };

  const syncNavSections = (): void => {
    const sections = options.railSections;
    // The list header draws its divider only with a nav block above to close off.
    element.classList.toggle(
      "persona-history-view--has-nav",
      presentation === "rail" &&
        !!sections?.some((section) => section.placement === "above-conversations")
    );
    if (!sections?.length) return;
    if (presentation !== "rail") {
      navNodes?.forEach((node) => node.remove());
      return;
    }
    navNodes ??= sections.map(buildNavSection);
    // Bucket order, then array order within a bucket: re-parenting an already
    // placed node is a no-op only because nothing inside it holds focus.
    for (const placement of [
      "above-conversations",
      "below-conversations",
      "footer",
    ] as HistoryRailSectionPlacement[]) {
      // Nothing follows the list any more, so the trailing buckets append in
      // placement order; `insertBefore(node, null)` is that append.
      const anchor =
        placement === "above-conversations"
          ? captionRow.parentNode === body
            ? captionRow
            : listRegion
          : null;
      sections.forEach((section, index) => {
        if (section.placement === placement) {
          body.insertBefore(navNodes![index], anchor);
        }
      });
    }
    syncNavContent();
  };
  syncNavSections();

  injectStyles(element, "persona-history-view", HISTORY_VIEW_CSS);

  // --- entrance / exit ----------------------------------------------------

  // components.history.motion overrides ride in as inherited CSS vars; the
  // chunk never defines them on its own elements, so a theme emission at the
  // widget root is never shadowed. Read lazily: the values must match what
  // the CSS animation actually uses at that moment.
  const motionMs = (name: string, fallback: number): number => {
    const raw = element.ownerDocument.defaultView
      ?.getComputedStyle(element)
      .getPropertyValue(name);
    const parsed = Number.parseFloat(raw ?? "");
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  };
  const motionEasing = (name: string, fallback: string): string =>
    element.ownerDocument.defaultView
      ?.getComputedStyle(element)
      .getPropertyValue(name)
      .trim() || fallback;

  /**
   * The entrance is a one-shot mount animation. Re-parenting a node restarts a
   * CSS animation, so the class is dropped the moment it can no longer be
   * needed: the shell's live rail <-> panel move must not replay it. The timer
   * is only the fallback for a missing animationend, so it follows the themed
   * duration rather than cutting a longer one short.
   */
  let entranceTimer: ReturnType<typeof setTimeout> | null = null;
  const endEntrance = (): void => {
    if (entranceTimer !== null) {
      clearTimeout(entranceTimer);
      entranceTimer = null;
    }
    element.removeEventListener("animationend", endEntrance);
    element.classList.remove("persona-history-view--enter");
  };
  element.addEventListener("animationend", endEntrance);
  // Two-step arm: at creation the element is detached and inherited vars read
  // empty, so the themed duration resolves one macrotask later, after the
  // shell has mounted the view.
  entranceTimer = setTimeout(() => {
    entranceTimer = setTimeout(
      endEntrance,
      motionMs("--persona-history-enter-ms", ENTRANCE_MS) + 60
    );
  }, 0);

  /**
   * The shell-hosted bar fades in once. Same one-shot discipline as the
   * entrance: the class is dropped so a later re-parent cannot replay it.
   */
  let shellFadeTimer: ReturnType<typeof setTimeout> | null = null;
  const endShellFade = (): void => {
    if (shellFadeTimer !== null) {
      clearTimeout(shellFadeTimer);
      shellFadeTimer = null;
    }
    topbar.classList.remove("persona-history-topbar--shell-enter");
  };
  const startShellFade = (): void => {
    endShellFade();
    topbar.classList.add("persona-history-topbar--shell-enter");
    shellFadeTimer = setTimeout(endShellFade, SHELL_FADE_MS + 60);
  };
  if (headerPlacement === "external") {
    shellFadeTimer = setTimeout(endShellFade, SHELL_FADE_MS + 60);
  }

  let exitAnimations: Animation[] = [];
  let exitPromise: Promise<void> | null = null;

  const playExit = (): Promise<void> | null => {
    if (exitPromise) return exitPromise;
    if (destroyed || prefersReducedMotion() || typeof element.animate !== "function") {
      endEntrance();
      return null;
    }
    // Closing mid-entrance: start from wherever the entrance got to rather than
    // popping back to full opacity first.
    const from =
      element.ownerDocument.defaultView?.getComputedStyle(body).opacity || "1";
    endEntrance();
    // A leaving surface is no longer a target, but focus stays put until the
    // shell restores it. The bar's contents go with it wherever they are hosted.
    element.style.pointerEvents = "none";
    headerContent.style.pointerEvents = "none";
    const timing = {
      duration: motionMs("--persona-history-exit-ms", EXIT_MS),
      easing: motionEasing("--persona-history-exit-easing", EXIT_EASING),
      fill: "forwards",
    } as const;
    const distance = EXIT_SLIDE_PX[presentation];
    // Only the body leaves: the bar is furniture and switches back instantly.
    exitAnimations = [
      body.animate(
        [
          { opacity: from, transform: "none" },
          { opacity: 0, transform: `translateX(${distance}px)` },
        ],
        timing
      ),
    ];
    exitPromise = Promise.all(exitAnimations.map(settled)).then(() => undefined);
    return exitPromise;
  };

  // --- rendering ----------------------------------------------------------

  /** `aria-disabled` rather than `disabled`: a busy control keeps its focus. */
  const setInert = (target: HTMLElement | null, inert: boolean): void => {
    if (!target) return;
    if (inert) target.setAttribute("aria-disabled", "true");
    else target.removeAttribute("aria-disabled");
  };

  // --- header slot --------------------------------------------------------

  let headerContent: HTMLElement = topbar;
  let headerRenderedKey: string | null = null;

  /**
   * Re-run only when the header's own inputs change: a custom header must not
   * lose focus every time the list below it re-renders.
   */
  const renderHeader = (): void => {
    const slot = options.slots?.header;
    if (!slot) return;
    const key = `${presentation}|${identityKey(identityStatus)}|${
      pending ? `${pending.kind}:${"conversationId" in pending ? pending.conversationId : ""}` : ""
    }`;
    if (key === headerRenderedKey) return;
    headerRenderedKey = key;
    const next =
      slot({
        identityStatus,
        pendingAction: pending,
        copy,
        defaultRenderer: () => topbar,
      }) ?? topbar;
    if (next === headerContent) return;
    // Swaps in place wherever the content lives, including an external host.
    // Detached (external, pre-mount) it is bookkeeping only: the shell then
    // mounts whatever `getHeaderElement()` reports.
    headerContent.replaceWith(next);
    headerContent = next;
  };

  let scopeRenderedKey: string | null = null;

  const renderScope = (): void => {
    if (!options.showScopeStatus) return;
    // Rebuild only on a real identity change: a `verifying` block is live, and
    // re-rendering it on every list render would re-announce.
    const key = identityKey(identityStatus);
    if (key === scopeRenderedKey) return;
    scopeRenderedKey = key;
    const resolved = scopeCopy(identityStatus, copy);
    // Text is patched in place so a stable caption never re-announces.
    scopeTitle.textContent = resolved.title;
    const ambient = scopeAmbient(identityStatus);
    // The visible block carries the whole message; the caption would repeat it.
    scopeLine.hidden = !ambient;
    scopeBlock.replaceChildren(
      ...(ambient
        ? []
        : [
            createNode("span", {
              className: "persona-history-scope-alert-title",
              text: resolved.title,
            }),
          ]),
      createNode("span", {
        className: "persona-history-scope-description",
        text: resolved.description,
        attrs: { id: scopeDescriptionId },
      })
    );
    scopeBlock.setAttribute(
      "data-persona-history-scope-tone",
      ambient ? "ambient" : "attention"
    );
    // Described-by only while the block is sr-only; a visible one would repeat.
    if (ambient) scopeLine.setAttribute("aria-describedby", scopeDescriptionId);
    else scopeLine.removeAttribute("aria-describedby");
    if (resolved.pending) scopeBlock.setAttribute("role", "status");
    else scopeBlock.removeAttribute("role");
    scopeBlock.setAttribute("data-persona-history-identity", identityStatus.state);
    // Mirrored on the caption so the rail's icon and dot can key off it.
    scopeLine.setAttribute("data-persona-history-identity", identityStatus.state);
    if (identityRetryable(identityStatus)) {
      const retry = createNode("button", {
        className: "persona-history-secondary persona-history-state-action",
        text: copy.retryIdentityLabel,
        attrs: { type: "button", "data-persona-history-focus": "identity-retry" },
      });
      retry.addEventListener("click", () => {
        if (busy()) return;
        void loadList("refresh");
      });
      scopeBlock.appendChild(retry);
    }
  };

  const rowPendingFor = (id: string): RowPending => {
    if (!pending) return null;
    if (pending.kind === "open" && pending.conversationId === id) return "opening";
    if (pending.kind === "delete" && pending.conversationId === id)
      return "deleting";
    return null;
  };

  const captureFocusKey = (): string | null => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !element.contains(active)) return null;
    return active.getAttribute("data-persona-history-focus");
  };

  // Menu keys are looked up on the whole view: the list menu lives in the
  // caption row, outside the list region.
  const restoreFocus = (key: string | null): void => {
    if (focusMenuOnRender && openMenuId) {
      focusMenuOnRender = false;
      const item = element.querySelector<HTMLElement>(
        `[data-persona-history-focus="${menuItemFocusKey(openMenuId)}"]`
      );
      if (item) {
        item.focus();
        return;
      }
    }
    if (!key) return;
    element
      .querySelector<HTMLElement>(`[data-persona-history-focus="${key}"]`)
      ?.focus();
  };

  const buildActionError = (): HTMLElement | null => {
    if (!actionError) return null;
    const retry = createNode("button", {
      className: "persona-history-secondary persona-history-state-action",
      text: copy.retryLabel,
      attrs: { type: "button", "data-persona-history-focus": "action-retry" },
    });
    const failed = actionError;
    retry.addEventListener("click", () => {
      if (busy()) return;
      failed.retry();
    });
    return createNode(
      "div",
      { className: "persona-history-row-error", attrs: { role: "alert" } },
      createNode("span", { text: failed.message }),
      retry
    );
  };

  const buildGroups = (): HTMLElement[] =>
    groupConversations(items, now(), copy, options.grouping).map((group, index) => {
      const groupHeadingId = `${headingId}-g${index}`;
      const list = createNode("ul", {
        className: "persona-history-list",
        attrs: { "aria-labelledby": groupHeadingId },
      });
      for (const conversation of group.items) {
        const defaultRow = (): HTMLElement =>
          buildConversationRow({
            conversation,
            active: conversation.id === activeConversationId,
            pending: rowPendingFor(conversation.id),
            busy: busy(),
            menuOpen: openMenuId === conversation.id,
            error: rowErrors.get(conversation.id) ?? null,
            avatar: options.rowAvatar,
            showDelete: options.showDelete !== false,
            nowMs: now(),
            copy,
            onOpen: () => void openConversation(conversation.id),
            onToggleMenu: () => toggleMenu(conversation.id),
            onCloseMenu: (opts) => closeMenu(opts),
            onDelete: () => void deleteConversation(conversation.id),
          });
        const custom = options.slots?.conversation?.({
          conversation,
          active: conversation.id === activeConversationId,
          pending: rowPendingFor(conversation.id),
          open: () => openConversation(conversation.id),
          requestDelete: () => deleteConversation(conversation.id),
          defaultRenderer: defaultRow,
        });
        const row = custom ?? defaultRow();
        // The list stays a real list even when a plugin returns loose markup.
        list.appendChild(
          row instanceof HTMLLIElement
            ? row
            : createNode("li", { className: "persona-history-item" }, row)
        );
      }
      return createNode(
        "div",
        {
          className: "persona-history-group",
          attrs: { "data-persona-history-group": group.key },
        },
        createNode("h3", {
          // The flat group's heading would repeat the list heading above it,
          // so it labels the list from the accessibility tree only.
          className: cx(
            "persona-history-group-heading",
            group.key === "recent" && "persona-history-sr-only"
          ),
          text: group.label,
          attrs: { id: groupHeadingId },
        }),
        list
      );
    });

  const buildLoadMore = (): HTMLElement | null => {
    if (!nextCursor) return null;
    const loadingMore =
      pending?.kind === "load-more" ||
      (listState.kind === "loading" && listState.phase === "load-more");
    const button = createNode("button", {
      className: "persona-history-secondary persona-history-load-more",
      text: loadingMore ? copy.loadingMoreLabel : copy.loadMoreLabel,
      attrs: {
        type: "button",
        "data-persona-history-focus": "load-more",
        ...(loadingMore
          ? { "aria-busy": "true", "aria-disabled": "true" }
          : {}),
        ...(busy() && !loadingMore ? { "aria-disabled": "true" } : {}),
      },
    });
    button.addEventListener("click", () => {
      if (busy()) return;
      void loadList("load-more");
    });
    return button;
  };

  const renderList = (): void => {
    const focusKey = captureFocusKey();
    const children: Array<Node | null> = [buildActionError()];

    const hasRows = items.length > 0;
    if (hasRows) {
      children.push(...buildGroups());
      children.push(buildLoadMore());
    }

    const stateNeedsBlock =
      listState.kind !== "ready" &&
      !(listState.kind === "loading" && listState.phase !== "initial" && hasRows);
    if (stateNeedsBlock) {
      const state = listState as Exclude<HistoryListState, { kind: "ready" }>;
      // Recovery affordances exist only where they are safe for this state.
      const retry = state.kind === "loading" ? undefined : () => loadList("refresh");
      const startNewConversation =
        state.kind === "new_conversation_required" ? () => startNew() : undefined;
      const defaultState = (): HTMLElement =>
        buildStateBlock({
          state,
          copy,
          identityStatus,
          busy: busy(),
          ...(retry ? { onRetry: () => void retry() } : {}),
          ...(startNewConversation
            ? { onStartNew: () => void startNewConversation() }
            : {}),
        });
      const custom = options.slots?.state?.({
        state,
        identityStatus,
        copy,
        ...(retry ? { retry } : {}),
        ...(startNewConversation ? { startNewConversation } : {}),
        defaultRenderer: defaultState,
      });
      children.push(custom ?? defaultState());
    }

    listRegion.replaceChildren(...children.filter((node): node is Node => !!node));
    restoreFocus(focusKey);
  };

  /**
   * Menu items, computed fresh at open time. Destructive actions reveal with
   * the data they act on: neither the empty state nor an unresolved first load
   * has anything to delete yet.
   */
  const listMenuItems = (): HistoryMenuItemSpec[] => {
    const listUnresolved = listState.kind === "loading" && items.length === 0;
    const specs: HistoryMenuItemSpec[] = [];
    // Opening lands on the first item, whichever action that turns out to be.
    const nextKey = (): string =>
      specs.length === 0
        ? menuItemFocusKey(LIST_MENU_ID)
        : `${menuItemFocusKey(LIST_MENU_ID)}-${specs.length}`;
    if (
      clearAllowed &&
      !(items.length === 0 && (listState.kind === "empty" || listUnresolved))
    ) {
      specs.push({
        label: copy.clearHistoryLabel,
        focusKey: nextKey(),
        onSelect: () => void clearHistory(),
      });
    }
    if (resetAllowed && !listUnresolved) {
      specs.push({
        label: copy.resetIdentityLabel,
        focusKey: nextKey(),
        onSelect: () => void resetIdentity(),
      });
    }
    return specs;
  };

  const renderChrome = (): void => {
    setInert(newConversationButton, busy());
    setInert(newIconButton, busy());
    if (optionsButton) {
      const specs = listMenuItems();
      // The trigger is chrome: it holds its slot through the first load rather
      // than popping in behind the rows, and only drops out once the resolved
      // state has nothing to offer.
      const listUnresolved = listState.kind === "loading" && items.length === 0;
      optionsButton.hidden = specs.length === 0 && !listUnresolved;
      setInert(optionsButton, busy() || specs.length === 0);
      optionsButton.setAttribute(
        "aria-expanded",
        openMenuId === LIST_MENU_ID ? "true" : "false"
      );
      const menu = captionRow.querySelector(".persona-history-menu");
      if (openMenuId !== LIST_MENU_ID || specs.length === 0) {
        menu?.remove();
      } else {
        const next = buildOverflowMenu({
          label: copy.listOptionsLabel,
          items: specs,
          onCloseMenu: (opts) => closeMenu(opts),
        });
        if (menu) menu.replaceWith(next);
        else captionRow.appendChild(next);
      }
    }
    // The rail always shows the block for its heading; in the panel the
    // heading is sr-only, so an otherwise empty row would still take a body gap.
    captionRow.hidden =
      presentation !== "rail" &&
      ((!optionsButton || optionsButton.hidden) &&
        (!options.showScopeStatus || scopeLine.hidden));
  };

  // The shell's active-conversation binding. Reported from render() so every
  // path that can change the answer (selection, list refresh delivering a
  // server title, rename/star, deletion, clear) funnels through one
  // change-detecting emit; runs even while DOM rendering is suspended, since
  // the data still moved.
  let reportedActiveKey: string | undefined;
  const reportActiveConversation = (): void => {
    const callback = options.onActiveConversationChange;
    if (!callback) return;
    const active = items.find((c) => c.id === activeConversationId) ?? null;
    const key = active
      ? `${active.id}\0${active.title}\0${active.starred ? 1 : 0}`
      : "";
    if (key === reportedActiveKey) return;
    reportedActiveKey = key;
    callback(active);
  };

  const render = (): void => {
    if (destroyed) return;
    reportActiveConversation();
    // Suspended means a plugin owns the whole surface: build nothing, just tell
    // the arbitration layer the model moved.
    if (!domRenderEnabled) {
      options.onModelChange?.();
      return;
    }
    renderHeader();
    renderScope();
    renderChrome();
    renderList();
    // First paint for render-backed sections: nothing runs while suspended.
    syncNavContent();
  };

  // --- menu ---------------------------------------------------------------

  const closeMenu = (opts?: { restoreFocus?: boolean }): void => {
    if (!openMenuId) return;
    const previous = openMenuId;
    openMenuId = null;
    focusMenuOnRender = false;
    render();
    if (opts?.restoreFocus) {
      element
        .querySelector<HTMLElement>(
          `[data-persona-history-focus="menu:${previous}"]`
        )
        ?.focus();
    }
  };

  const toggleMenu = (conversationId: string): void => {
    if (openMenuId === conversationId) {
      closeMenu({ restoreFocus: true });
      return;
    }
    openMenuId = conversationId;
    focusMenuOnRender = true;
    render();
  };

  const onDocumentPointerDown = (event: Event): void => {
    if (!openMenuId) return;
    const target = event.target;
    if (target instanceof Node && element.contains(target)) {
      const item = (target as HTMLElement).closest?.(
        `[data-persona-history-item="${openMenuId}"]`
      );
      if (item) return;
    }
    closeMenu();
  };
  document.addEventListener("pointerdown", onDocumentPointerDown, true);

  const onRootKeydown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || !openMenuId) return;
    // Do not let the shell's Escape close the whole surface behind the menu.
    event.stopPropagation();
    closeMenu({ restoreFocus: true });
  };
  element.addEventListener("keydown", onRootKeydown);

  // --- data operations ----------------------------------------------------

  async function loadList(
    phase: "initial" | "refresh" | "load-more"
  ): Promise<void> {
    if (destroyed) return;
    const epoch = ++listEpoch;
    const cursor = phase === "load-more" ? nextCursor : null;
    if (phase === "load-more" && !cursor) return;
    pending = { kind: phase === "load-more" ? "load-more" : "refresh" };
    listState = { kind: "loading", phase };
    if (phase !== "load-more") {
      rowErrors.clear();
      actionError = null;
    }
    closeMenu();
    render();
    try {
      const result = await options.provider.list({
        limit: pageSize,
        context: options.context,
        ...(cursor ? { cursor } : {}),
        ...(options.targetId ? { targetId: options.targetId } : {}),
      });
      if (destroyed || epoch !== listEpoch) return;
      items = cursor ? [...items, ...result.items] : result.items;
      nextCursor = result.nextCursor;
      listState = items.length === 0 ? { kind: "empty" } : { kind: "ready" };
    } catch (error) {
      if (destroyed || epoch !== listEpoch) return;
      listState = toListState(error);
    } finally {
      if (!destroyed && epoch === listEpoch) {
        pending = null;
        render();
      }
    }
  }

  const removeConversation = (conversationId: string): void => {
    items = items.filter((item) => item.id !== conversationId);
    rowErrors.delete(conversationId);
    if (activeConversationId === conversationId) activeConversationId = null;
    if (items.length === 0 && !nextCursor) listState = { kind: "empty" };
  };

  async function openConversation(conversationId: string): Promise<void> {
    if (busy() || destroyed) return;
    rowErrors.delete(conversationId);
    closeMenu();
    pending = { kind: "open", conversationId };
    render();
    try {
      await options.onSelect(conversationId);
      if (destroyed) return;
      activeConversationId = conversationId;
    } catch {
      if (destroyed) return;
      rowErrors.set(conversationId, {
        message: copy.openFailedLabel,
        retry: () => void openConversation(conversationId),
      });
    } finally {
      if (!destroyed) {
        pending = null;
        render();
      }
    }
  }

  /** A failed delete resolves "cancelled"; the failure surfaces as a row error. */
  async function deleteConversation(
    conversationId: string
  ): Promise<"deleted" | "cancelled"> {
    if (busy() || destroyed) return "cancelled";
    rowErrors.delete(conversationId);
    pending = { kind: "delete", conversationId };
    render();
    try {
      const outcome = await options.onRequestDeleteConversation(conversationId);
      if (destroyed) return outcome;
      if (outcome === "deleted") {
        removeConversation(conversationId);
        announce(copy.conversationRemovedNotice);
      }
      return outcome;
    } catch (error) {
      if (destroyed) return "cancelled";
      // A 404 means the row is already gone: remove it without an error.
      if (isHistoryProviderError(error) && error.code === "not_found") {
        removeConversation(conversationId);
      } else {
        rowErrors.set(conversationId, {
          message: copy.deleteFailedLabel,
          retry: () => void deleteConversation(conversationId),
        });
      }
      return "cancelled";
    } finally {
      if (!destroyed) {
        pending = null;
        render();
      }
    }
  }

  async function startNew(): Promise<void> {
    if (busy() || destroyed) return;
    actionError = null;
    closeMenu();
    pending = { kind: "start-new" };
    render();
    try {
      await options.onStartNew();
      if (destroyed) return;
      if (listState.kind === "new_conversation_required") {
        listState = items.length === 0 ? { kind: "empty" } : { kind: "ready" };
      }
    } catch {
      if (destroyed) return;
      actionError = {
        message: copy.errorDescription,
        retry: () => void startNew(),
      };
    } finally {
      if (!destroyed) {
        pending = null;
        render();
      }
    }
  }

  /** A failed clear resolves "cancelled"; the failure surfaces as an action error. */
  async function clearHistory(): Promise<"cleared" | "cancelled"> {
    if (busy() || destroyed) return "cancelled";
    actionError = null;
    closeMenu();
    pending = { kind: "clear" };
    render();
    try {
      const outcome = await options.onRequestClearHistory();
      if (destroyed) return outcome;
      if (outcome === "cleared") {
        items = [];
        nextCursor = null;
        activeConversationId = null;
        listState = { kind: "empty" };
        announce(copy.historyClearedNotice);
      }
      return outcome;
    } catch {
      if (destroyed) return "cancelled";
      actionError = {
        message: copy.errorDescription,
        retry: () => void clearHistory(),
      };
      return "cancelled";
    } finally {
      if (!destroyed) {
        pending = null;
        render();
      }
    }
  }

  type ResetOutcome =
    | { outcome: "cancelled" }
    | { outcome: "reset"; remoteRevocationConfirmed: boolean };

  const CANCELLED: ResetOutcome = { outcome: "cancelled" };

  async function resetIdentity(): Promise<ResetOutcome> {
    if (busy() || destroyed || !options.onRequestResetIdentity) return CANCELLED;
    actionError = null;
    closeMenu();
    pending = { kind: "reset" };
    render();
    try {
      const result = await options.onRequestResetIdentity();
      if (destroyed) return result;
      if (result.outcome === "reset") {
        announce(
          result.remoteRevocationConfirmed
            ? copy.identityResetNotice
            : copy.identityResetUnconfirmedNotice
        );
        pending = null;
        await loadList("refresh");
        return result;
      }
      return result;
    } catch {
      if (destroyed) return CANCELLED;
      actionError = {
        message: copy.errorDescription,
        retry: () => void resetIdentity(),
      };
      return CANCELLED;
    } finally {
      if (!destroyed && pending?.kind === "reset") {
        pending = null;
        render();
      }
    }
  }

  // --- subscriptions ------------------------------------------------------

  const unsubscribeIdentity = options.provider.subscribeIdentityStatus(
    (status) => {
      if (destroyed) return;
      const key = identityKey(status);
      const changed = key !== renderedIdentityKey;
      identityStatus = status;
      renderedIdentityKey = key;
      render();
      // Announce only real transitions, and let `verifying` speak through its
      // own role="status" block instead of announcing twice.
      if (changed && status.state !== "verifying") {
        announce(scopeCopy(status, copy).title);
      }
    }
  );

  const unsubscribeAvailability = options.provider.subscribeAvailability?.(
    (available) => {
      if (destroyed) return;
      if (available) {
        void loadList("refresh");
        return;
      }
      items = [];
      nextCursor = null;
      listState = { kind: "error", reason: "unavailable", retryable: false };
      render();
    }
  );

  render();
  void loadList("initial");

  return {
    element,
    copy,
    getModel: () => ({
      conversations: items,
      activeConversationId,
      state: listState,
      pendingAction: pending,
      identityStatus,
      nextCursor,
    }),
    // Busy gating matches the default controls, which are inert while pending.
    operations: {
      refresh: async () => {
        if (busy()) return;
        await loadList("refresh");
      },
      loadMore: async () => {
        if (busy()) return;
        await loadList("load-more");
      },
      openConversation: (conversationId) => openConversation(conversationId),
      startNewConversation: () => startNew(),
      requestDeleteConversation: (conversationId) =>
        deleteConversation(conversationId),
      requestClearConversationHistory: () => clearHistory(),
      requestResetHistoryIdentity: () => resetIdentity(),
    },
    setDomRenderEnabled: (enabled) => {
      if (enabled === domRenderEnabled) return;
      domRenderEnabled = enabled;
      if (enabled) render();
    },
    refresh: () => {
      void loadList("refresh");
    },
    setPresentation: (next) => {
      if (next === presentation) return;
      // The shell re-parents the element around this call; a live entrance
      // would replay on re-insertion.
      endEntrance();
      presentation = next;
      headerRenderedKey = null;
      const rail = next === "rail";
      element.classList.toggle("persona-history-view--panel", !rail);
      element.classList.toggle("persona-history-view--rail", rail);
      element.setAttribute("data-persona-history-presentation", next);
      syncLeadingControl();
      syncCollapsedClass();
      syncBarOrder();
      syncRailBrand();
      syncNavSections();
      // A header slot is presentation-aware, so it re-arbitrates on the move.
      render();
    },
    setCollapsed: (next) => {
      if (next === collapsed) return;
      collapsed = next;
      syncCollapsedClass();
      syncLeadingControl();
      syncRailBrand();
      syncNavContent();
    },
    setRailSide: (side) => {
      railRight = side === "right";
      syncBarOrder();
    },
    getHeaderElement: () => headerContent,
    setHeaderPlacement: (next) => {
      if (next === headerPlacement) return;
      headerPlacement = next;
      const external = next === "external";
      topbar.classList.toggle("persona-history-topbar--shell", external);
      if (external) {
        startShellFade();
        // The shell re-homes it; leaving it here would show it twice.
        headerContent.remove();
        return;
      }
      endShellFade();
      element.insertBefore(headerContent, body);
    },
    setActiveConversationId: (conversationId) => {
      if (activeConversationId === conversationId) return;
      activeConversationId = conversationId;
      render();
    },
    applyConversationSummary: (summary) => {
      const index = items.findIndex((item) => item.id === summary.id);
      if (index === -1) return;
      items[index] = summary;
      render();
    },
    removeConversationSummary: (conversationId) => {
      if (!items.some((item) => item.id === conversationId)) return;
      removeConversation(conversationId);
      render();
    },
    setNewConversationRequired: (required) => {
      if (required) {
        listState = { kind: "new_conversation_required" };
      } else if (listState.kind === "new_conversation_required") {
        listState = items.length === 0 ? { kind: "empty" } : { kind: "ready" };
      }
      render();
    },
    playExit,
    destroy: () => {
      destroyed = true;
      listEpoch += 1;
      endEntrance();
      endShellFade();
      // An open tooltip holds document-level listeners; the buttons may also
      // outlive this element in the shell header.
      tooltipHandles.forEach((handle) => handle?.destroy());
      // The bar's contents may be hosted outside this element.
      headerContent.remove();
      exitAnimations.forEach((animation) => animation.cancel());
      exitAnimations = [];
      unsubscribeIdentity();
      unsubscribeAvailability?.();
      document.removeEventListener("pointerdown", onDocumentPointerDown, true);
      element.removeEventListener("keydown", onRootKeydown);
      announcer.destroy();
      element.remove();
      element.replaceChildren();
    },
  };
}
