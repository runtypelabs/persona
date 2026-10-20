/**
 * Composer overflow `+` menu.
 *
 * `createPopover` owns positioning, outside-pointerdown dismissal, and the
 * Shadow-DOM-safe mount. It is not by itself an accessible menu, so the menu
 * semantics live here: `role="menu"`/`menuitem`, roving tabindex, Arrow/Home/End
 * navigation, Escape and Tab close with focus restored to the trigger, and
 * focus-out dismissal. Every outside check runs on `composedPath()`, so a
 * shadowed widget dismisses on the same events a light-DOM one does.
 *
 * The panel holds elements the action renderer places into it; this module
 * never decides what is in the menu.
 */

import type { ComposerOverflowMenuConfig } from "../types";
import { ensureComposerActionStyles } from "./composer-action-styles";
import { createPopover, type PopoverHandle } from "../plugin-kit";
import { createElement, createNode } from "../utils/dom";
import type { renderLucideIcon } from "../utils/icons";
import type { attachTooltip } from "../utils/tooltip";
import {
  COMPOSER_CONTROL_CLASS,
  COMPOSER_CONTROL_GLYPH_CLASS,
  COMPOSER_CONTROL_ICON_FALLBACK_PX,
  forwardMenuTokens,
} from "./composer-tokens";

export interface ComposerOverflowMenuOptions {
  deps: { renderLucideIcon: typeof renderLucideIcon; attachTooltip: typeof attachTooltip };
  /** Accessible name for the trigger and the menu. */
  label: string;
  /**
   * Explicit icon-button edge. Undefined (the normal case) leaves the trigger
   * on `--persona-composer-control-size`, matching the sibling controls.
   */
  getButtonSize?: () => string | undefined;
  getConfig?: () => ComposerOverflowMenuConfig | undefined;
  getComposer?: () => HTMLElement | undefined;
  beforeOpen?: () => boolean;
  onClose?: () => void;
}

export interface ComposerOverflowMenu {
  /** Wrapper placed in the start cluster, like every other action element. */
  trigger: HTMLElement;
  triggerButton: HTMLButtonElement;
  /** Menu panel; detached while closed. */
  panel: HTMLElement;
  /**
   * Declare the ordered roving-focus targets. Call after every placement pass;
   * targets that left the panel are dropped.
   */
  setItems: (items: readonly HTMLElement[]) => void;
  isOpen: () => boolean;
  open: () => void;
  /** `restoreFocus` returns focus to the trigger (Escape, activation). */
  close: (restoreFocus?: boolean) => void;
  setLabel: (label: string) => void;
  applyButtonSize: () => void;
  /** Custom content owns internal keyboard handling; default rows retain roving focus. */
  setContentMode: (role: "menu" | "dialog", defaultKeyboard: boolean) => void;
  refresh: () => void;
  destroy: () => void;
}

const focusableSelector =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Panel surface tokens, forwarded onto the portaled panel on every open; unset
 * ones clear so the stylesheet's fallbacks stand.
 */
const MENU_TOKEN_VARS = [
  "--persona-components-composer-overflowMenu-background",
  "--persona-components-composer-overflowMenu-borderColor",
  "--persona-components-composer-overflowMenu-borderRadius",
  "--persona-components-composer-overflowMenu-foreground",
  "--persona-components-composer-overflowMenu-shadow",
  ...["padding", "rowGap", "rowPadding", "rowBorderRadius", "fontSize", "lineHeight", "iconSize", "iconGap", "hoverBackground", "focusBackground", "descriptionColor", "descriptionFontSize", "dividerColor", "dividerSpacing", "minWidth", "maxHeight"].map((name) => `--persona-components-composer-overflowMenu-${name}`),
] as const;

/**
 * Set on the menu row that holds keyboard focus. Rows that shade on
 * `:focus-visible` do not need it; wrapper rows around a live control do.
 */
export const MENU_FOCUS_ATTR = "data-persona-menu-focus";

/** Keys that move roving focus, and so make it visible. */
const NAVIGATION_KEYS = new Set(["ArrowDown", "ArrowUp", "Home", "End"]);

/**
 * The element that takes focus for a menu row. A registry button IS the row; a
 * folded built-in or custom control exposes its first focusable descendant.
 */
export function resolveMenuFocusTarget(container: HTMLElement): HTMLElement {
  if (container.getAttribute("role") === "menuitem") return container;
  const inner = container.querySelector<HTMLElement>(focusableSelector);
  return inner ?? container;
}

const isDisabled = (element: HTMLElement): boolean =>
  (element as HTMLButtonElement).disabled === true ||
  element.getAttribute("aria-disabled") === "true";

export function createComposerOverflowMenu(
  options: ComposerOverflowMenuOptions
): ComposerOverflowMenu {
  const { renderLucideIcon, attachTooltip } = options.deps;
  let label = options.label;
  let destroyed = false;
  let opening = false;
  let preparing = false;
  let closing = false;
  let defaultKeyboard = true;

  const trigger = createElement("div", "persona-send-button-wrapper");
  const triggerButton = createNode("button", {
    className: `persona-rounded-button persona-flex persona-items-center persona-justify-center persona-cursor-pointer persona-composer-action-button persona-composer-overflow-trigger ${COMPOSER_CONTROL_CLASS} ${COMPOSER_CONTROL_GLYPH_CLASS}`,
    attrs: {
      type: "button",
      "aria-haspopup": "menu",
      "aria-expanded": "false",
      "data-persona-composer-overflow-trigger": "",
    },
  }) as HTMLButtonElement;
  trigger.appendChild(triggerButton);

  const panel = createNode("div", {
    className: "persona-composer-overflow-menu",
    attrs: {
      role: "menu",
      tabindex: "-1",
      "data-persona-composer-overflow-menu": "",
    },
  });

  const applyButtonSize = (): void => {
    // The token owns the box; an explicit override is the only inline case.
    const size = options.getButtonSize?.() ?? "";
    triggerButton.style.width = size;
    triggerButton.style.height = size;
    triggerButton.style.minWidth = size;
    triggerButton.style.minHeight = size;
    triggerButton.style.lineHeight = "1";
    triggerButton.replaceChildren();
    const icon = renderLucideIcon(
      (isOpen() ? options.getConfig?.()?.openTriggerIconName : undefined) ?? options.getConfig?.()?.triggerIconName ?? "plus",
      COMPOSER_CONTROL_ICON_FALLBACK_PX,
      "currentColor",
      1.5
    );
    if (icon) triggerButton.appendChild(icon);
    else triggerButton.textContent = "+";
  };

  const applyLabel = (): void => {
    triggerButton.setAttribute("aria-label", label);
    panel.setAttribute("aria-label", label);
  };
  applyLabel();
  const tooltip = attachTooltip({
    anchor: triggerButton,
    trigger,
    text: () => triggerButton.getAttribute("aria-expanded") === "true" ? "" : label,
  });

  let items: HTMLElement[] = [];
  let activeIndex = -1;
  /**
   * Last input that moved roving focus. A contributed row is a button, so it
   * gets this distinction free from native `:focus-visible`: opening with the
   * mouse focuses the first row without shading it. A folded built-in is a
   * control inside a wrapper row, and the ROW is what shades, so the same
   * modality has to be published onto it explicitly.
   */
  let keyboardModality = false;

  /** The element with focus, resolved through the panel's own root. */
  const focusedElement = (): HTMLElement | null => {
    const root = panel.getRootNode() as Document | ShadowRoot;
    const active = root.activeElement;
    return active instanceof HTMLElement ? active : null;
  };

  /**
   * Mark the focused row only when that focus should be visible.
   *
   * The tracked modality is the single source of truth rather than a
   * `:focus-visible` probe, because the menu owns every way focus moves inside
   * it: `focusAt` is the only programmatic focus, and anything else is a
   * pointer press on a row. That reproduces the native heuristic exactly for
   * the interactions this menu can produce, and does so deterministically.
   */
  const syncFocusHighlight = (): void => {
    const focused = focusedElement();
    for (const item of items) {
      const isFocused =
        Boolean(focused) && resolveMenuFocusTarget(item) === focused;
      item.toggleAttribute(MENU_FOCUS_ATTR, isFocused && keyboardModality);
    }
  };

  /** Focusable, enabled rows in DOM order. */
  const focusables = (): HTMLElement[] =>
    items
      .filter((item) => item.isConnected || panel.contains(item))
      .map(resolveMenuFocusTarget)
      .filter((target) => !isDisabled(target));

  const applyRoving = (targets: HTMLElement[], index: number): void => {
    targets.forEach((target, i) => {
      target.setAttribute("tabindex", i === index ? "0" : "-1");
    });
  };

  const focusAt = (index: number): void => {
    const targets = focusables();
    if (targets.length === 0) return;
    const clamped = ((index % targets.length) + targets.length) % targets.length;
    activeIndex = clamped;
    applyRoving(targets, clamped);
    targets[clamped].focus();
    syncFocusHighlight();
  };

  const ownerDocument = (): Document => trigger.ownerDocument ?? document;

  let focusinHandler: ((event: Event) => void) | null = null;
  let panelFocusInHandler: ((event: Event) => void) | null = null;
  let panelPointerDownHandler: ((event: Event) => void) | null = null;

  const detachFocusOut = (): void => {
    if (!focusinHandler) return;
    ownerDocument().removeEventListener("focusin", focusinHandler, true);
    focusinHandler = null;
  };

  const detachPanelFocusIn = (): void => {
    if (panelFocusInHandler) {
      panel.removeEventListener("focusin", panelFocusInHandler);
      panelFocusInHandler = null;
    }
    if (panelPointerDownHandler) {
      panel.removeEventListener("pointerdown", panelPointerDownHandler, true);
      panelPointerDownHandler = null;
    }
  };

  // Built on first open, not at construction: `createPopover` resolves its
  // mount container from the anchor's root node, and the trigger is only
  // parented into the (possibly shadow) composer after the renderer places it.
  let popover: PopoverHandle | null = null;
  const ensurePopover = (): PopoverHandle => {
    if (!popover) {
      popover = createPopover({
        anchor: triggerButton,
        getAnchorRect: () => {
          if (options.getConfig?.()?.width === "composer") {
            const rect = options.getComposer?.()?.getBoundingClientRect();
            if (rect) { panel.style.width = `${rect.width}px`; return rect; }
          }
          return triggerButton.getBoundingClientRect();
        },
        content: panel,
        placement: "top-start",
        getPlacement: () => options.getConfig?.()?.placement === "below" ? "bottom-start" : "top-start",
        viewportPadding: 8,
        offset: 6,
        onDismiss: () => {
          finishClose();
        },
      });
    }
    return popover;
  };
  const isOpen = (): boolean => popover?.isOpen === true;

  const finishClose = (): void => {
    closing = true;
    opening = false;
    triggerButton.setAttribute("aria-expanded", "false");
    detachFocusOut();
    detachPanelFocusIn();
    activeIndex = -1;
    keyboardModality = false;
    for (const item of items) item.removeAttribute(MENU_FOCUS_ATTR);
    try { options.onClose?.(); } finally { closing = false; }
    applyButtonSize();
  };

  const close = (restoreFocus = false): void => {
    if (!isOpen() && !opening) return;
    popover?.close();
    finishClose();
    if (restoreFocus && !destroyed) triggerButton.focus();
  };

  const refresh = (): void => {
    forwardMenuTokens(triggerButton, panel, MENU_TOKEN_VARS);
    panel.setAttribute("data-persona-menu-description-layout", options.getConfig?.()?.descriptionLayout ?? "stacked");
    const width = options.getConfig?.()?.width;
    panel.style.width = width === "composer"
      ? `${options.getComposer?.()?.getBoundingClientRect().width ?? 0}px`
      : width && width !== "content" ? width : "";
    applyButtonSize();
    popover?.reposition();
  };
  applyButtonSize();

  const open = (focusIndex = 0, viaKeyboard = false): void => {
    if (destroyed || preparing || closing || isOpen()) return;
    ensureComposerActionStyles(triggerButton);
    tooltip.hide();
    opening = true;
    preparing = true;
    let prepared: boolean | undefined;
    try { prepared = options.beforeOpen?.(); } finally { preparing = false; }
    if (prepared === false || !opening || destroyed) {
      if (opening) close();
      return;
    }
    keyboardModality = viaKeyboard;
    refresh();
    ensurePopover().open();
    opening = false;
    triggerButton.setAttribute("aria-expanded", "true");
    applyButtonSize();
    if (defaultKeyboard) {
      const targets = focusables();
      applyRoving(targets, -1);
      focusAt(focusIndex < 0 ? targets.length - 1 : focusIndex);
      if (!targets.length) panel.focus();
    } else {
      (Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector)).find((target) => !isDisabled(target) && !target.closest("[hidden]")) ?? panel).focus();
    }

    // Focusing custom content may synchronously close or destroy the widget.
    if (!isOpen() || destroyed) return;

    // Focus leaving both the panel and the trigger dismisses without stealing
    // focus back. composedPath crosses the shadow boundary.
    focusinHandler = (event: Event) => {
      const path =
        typeof event.composedPath === "function" ? event.composedPath() : [];
      if (path.includes(panel) || path.includes(trigger)) return;
      close();
    };
    ownerDocument().addEventListener("focusin", focusinHandler, true);

    // Focus can also land on a row without `focusAt`, by clicking its control.
    // That is pointer modality, so the row must not light up.
    panelFocusInHandler = () => syncFocusHighlight();
    panel.addEventListener("focusin", panelFocusInHandler);
    // A pointer press inside the menu ends keyboard modality, the same way it
    // drops `:focus-visible` on a contributed row.
    panelPointerDownHandler = () => {
      keyboardModality = false;
    };
    panel.addEventListener("pointerdown", panelPointerDownHandler, true);
  };

  const onTriggerClick = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
    if (isOpen()) close(true);
    else open(0);
  };

  const onTriggerKeydown = (event: KeyboardEvent): void => {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      keyboardModality = true;
      if (isOpen()) { if (defaultKeyboard) focusAt(0); else panel.focus(); }
      else open(0, true);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      keyboardModality = true;
      if (isOpen()) { if (defaultKeyboard) focusAt(-1); else panel.focus(); }
      else open(-1, true);
    }
  };

  const onPanelKeydown = (event: KeyboardEvent): void => {
    if (!defaultKeyboard) {
      // A renderer may consume Escape for nested content before it reaches us.
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        event.stopPropagation();
        close(true);
      }
      return;
    }
    // Any navigation key makes focus visible, exactly as `:focus-visible` does
    // for a contributed row after a pointer-opened menu.
    if (NAVIGATION_KEYS.has(event.key)) keyboardModality = true;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusAt(activeIndex + 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        focusAt(activeIndex - 1);
        return;
      case "Home":
        event.preventDefault();
        focusAt(0);
        return;
      case "End":
        event.preventDefault();
        focusAt(focusables().length - 1);
        return;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        close(true);
        return;
      case "Tab":
        // Never trap: close and hand the sequence back to the trigger.
        close(true);
        return;
      default:
    }
  };

  triggerButton.addEventListener("click", onTriggerClick);
  triggerButton.addEventListener("keydown", onTriggerKeydown);
  panel.addEventListener("keydown", onPanelKeydown);

  return {
    trigger,
    triggerButton,
    panel,
    setItems: (next) => {
      for (const item of items) {
        if (!next.includes(item)) item.removeAttribute(MENU_FOCUS_ATTR);
      }
      items = [...next];
      if (!isOpen() || !defaultKeyboard) return;
      const targets = focusables();
      applyRoving(targets, Math.min(activeIndex, targets.length - 1));
      syncFocusHighlight();
    },
    isOpen,
    open: () => open(0),
    close,
    setLabel: (next) => {
      if (next === label) return;
      label = next;
      applyLabel();
      if (tooltip.isOpen) {
        tooltip.hide();
        tooltip.show();
      }
    },
    applyButtonSize,
    refresh,
    setContentMode: (role, keyboard) => {
      const restoreDefaultFocus = keyboard && !defaultKeyboard && isOpen();
      defaultKeyboard = keyboard;
      panel.setAttribute("role", role);
      triggerButton.setAttribute("aria-haspopup", role);
      if (restoreDefaultFocus) focusAt(0);
    },
    destroy: () => {
      destroyed = true;
      close();
      tooltip.destroy();
      detachFocusOut();
      detachPanelFocusIn();
      triggerButton.removeEventListener("click", onTriggerClick);
      triggerButton.removeEventListener("keydown", onTriggerKeydown);
      panel.removeEventListener("keydown", onPanelKeydown);
      popover?.destroy();
      popover = null;
      trigger.remove();
      panel.remove();
      items = [];
    },
  };
}
