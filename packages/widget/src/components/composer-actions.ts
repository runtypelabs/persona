/**
 * Composer action registry.
 *
 * One descriptor type for every composer control, fed by three contributors in
 * this fixed order: core built-ins, host `composer.actions`, then every active
 * plugin's `contributeComposerActions`. All contribution hooks run; the first
 * contributor to claim a final id keeps it.
 *
 * Order ranges (decision 19.4) are public documentation, not internal trivia:
 *
 *   start cluster   mention affordances  100 + channel index
 *                   attachment button    200
 *                   overflow trigger     900  (default; composer.actionOverflow.order)
 *   end cluster     mic                  800
 *                   send                1000  (terminal)
 *   custom actions default to 500.
 *
 * Send is terminal: an end-cluster action ordered at or after 1000 is clamped
 * to 999, so nothing can render after it. Equal orders keep contribution order.
 *
 * `presentation` selects the surface, not a second registry: `"bar"` stays in
 * the row, `"overflow"` always lives in the `+` menu, `"auto"` moves into the
 * menu under the `composer.actionOverflow` width policy. Built-ins fold only
 * when `includeBuiltIns` names them.
 */

import type { AgentWidgetPlugin } from "../plugins/types";
import type {
  ComposerAction,
  ComposerActionContext,
  ComposerActionContributionContext,
  ComposerActionOverflowConfig,
  ComposerActionPlacement,
  ComposerActionPresentation,
  ComposerActionVisibility,
  ComposerButtonAction,
  ComposerCustomAction,
  ComposerState,
} from "../types";
import { createElement, createNode, cx } from "../utils/dom";
import { renderLucideIcon } from "../utils/icons";
import {
  attachTooltip,
  hideTooltipFor,
  TOOLTIP_SUPPRESSED_ATTR,
  type TooltipHandle,
} from "../utils/tooltip";
import type { ComposerSurfaceBindings } from "./composer-bindings";
import {
  COMPOSER_CONTROL_CLASS,
  COMPOSER_CONTROL_GLYPH_CLASS,
  COMPOSER_CONTROL_ICON_FALLBACK_PX,
} from "./composer-parts";
import {
  createComposerOverflowMenu,
  resolveMenuFocusTarget,
  type ComposerOverflowMenu,
} from "./composer-overflow-menu";
import { COMPOSER_MIN_EDITOR_WIDTH } from "../utils/composer-fit";
import { measureComposerActionWidth, selectComposerFitOverflow } from "../utils/composer-overflow-fit";

/** Public order anchors. See the module docblock. */
export const COMPOSER_ACTION_ORDER = {
  mention: 100,
  attachment: 200,
  mic: 800,
  overflow: 900,
  send: 1000,
  custom: 500,
} as const;

/** Attribute carrying the resolved action id; stable selector for hosts. */
export const COMPOSER_ACTION_ATTR = "data-persona-composer-action";
const STREAMING_ATTR = "data-persona-composer-disable-when-streaming";

/** Registry id of the overflow trigger. Reserved: hosts cannot claim it. */
export const COMPOSER_OVERFLOW_ACTION_ID = "core:overflow";

/**
 * Which built-in an `includeBuiltIns` entry names. Mention affordances are one
 * per channel, so they match by prefix.
 */
const builtInOverflowKind = (
  id: string
): "attachments" | "mentions" | null => {
  if (id === "core:attachment") return "attachments";
  if (id.startsWith("core:mention")) return "mentions";
  return null;
};

/**
 * Resolve `collapseAutoActionsBelow` to CSS pixels. A number is already px; a
 * string is measured with a hidden probe inside the footer, so em/rem/%/ch all
 * resolve against the real box. Returns null when the length is unusable.
 */
export function resolveCollapseThreshold(
  value: number | string | undefined,
  footer: HTMLElement
): number | null {
  if (value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const numeric = Number.parseFloat(value);
  if (/^\s*-?\d*\.?\d+(px)?\s*$/.test(value) && Number.isFinite(numeric)) {
    return numeric;
  }
  const probe = createElement("div");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  probe.style.height = "0";
  probe.style.width = value;
  footer.appendChild(probe);
  const width = probe.getBoundingClientRect().width;
  probe.remove();
  return Number.isFinite(width) && width > 0
    ? width
    : Number.isFinite(numeric)
      ? numeric
      : null;
}

/** Footer content-box width in CSS pixels; 0 when the box is not laid out. */
export function measureFooterContentWidth(footer: HTMLElement): number {
  const client = footer.clientWidth;
  if (!client) return 0;
  const view = footer.ownerDocument?.defaultView;
  if (!view?.getComputedStyle) return client;
  const style = view.getComputedStyle(footer);
  const inset =
    (Number.parseFloat(style.paddingLeft) || 0) +
    (Number.parseFloat(style.paddingRight) || 0);
  return Math.max(0, client - inset);
}

/**
 * A core control the registry orders but does not necessarily create.
 *
 * `managed: true` means the registry inserts the element into its cluster
 * (mention affordances). `managed: false` is a positional placeholder: the
 * composer builder already mounted the element and the registry only uses it
 * as an ordering anchor, so built-in DOM is untouched.
 */
export interface ComposerBuiltInDescriptor {
  id: string;
  placement: ComposerActionPlacement;
  order: number;
  element: HTMLElement | null;
  managed?: boolean;
}

export interface ComposerActionResolveInput {
  builtIns: readonly ComposerBuiltInDescriptor[];
  configActions?: readonly ComposerAction[];
  plugins: readonly AgentWidgetPlugin[];
  contributionContext: ComposerActionContributionContext;
  debug?: boolean;
}

export interface ResolvedComposerAction {
  /** Final id, after plugin namespacing. */
  id: string;
  placement: ComposerActionPlacement;
  presentation: ComposerActionPresentation;
  order: number;
  /** Contribution index; ties on `order` break by it. */
  sequence: number;
  source: "core" | "config" | "plugin";
  pluginId?: string;
  /** Absent for built-ins. */
  action?: ComposerAction;
  builtIn?: ComposerBuiltInDescriptor;
}

const warn = (debug: boolean | undefined, message: string): void => {
  if (!debug || typeof console === "undefined") return;
  // eslint-disable-next-line no-console
  console.warn(message);
};

const namespaced = (pluginId: string, id: string): string =>
  id.includes(":") ? id : `${pluginId}:${id}`;

/**
 * Merge every contributor into one ordered list. Pure: no DOM, no side effects
 * beyond debug warnings.
 */
export function resolveComposerActions(
  input: ComposerActionResolveInput
): ResolvedComposerAction[] {
  const { debug } = input;
  const resolved: ResolvedComposerAction[] = [];
  const claimed = new Map<string, ResolvedComposerAction>();
  let sequence = 0;

  const claim = (entry: ResolvedComposerAction): void => {
    const previous = claimed.get(entry.id);
    if (previous) {
      warn(
        debug,
        `[Persona] composer action "${entry.id}" is already contributed by ${describeSource(previous)}; the ${describeSource(entry)} copy is ignored.`
      );
      return;
    }
    claimed.set(entry.id, entry);
    resolved.push(entry);
  };

  for (const builtIn of input.builtIns) {
    claim({
      id: builtIn.id,
      placement: builtIn.placement,
      presentation: "bar",
      order: builtIn.order,
      sequence: sequence++,
      source: "core",
      builtIn,
    });
  }

  const addAction = (
    action: ComposerAction,
    source: "config" | "plugin",
    pluginId?: string
  ): void => {
    const id = pluginId ? namespaced(pluginId, action.id) : action.id;
    let order = action.order ?? COMPOSER_ACTION_ORDER.custom;
    // Send is terminal: nothing may sort at or after it.
    if (action.placement === "end" && order >= COMPOSER_ACTION_ORDER.send) {
      warn(
        debug,
        `[Persona] composer action "${id}" ordered at ${order} would render after send; clamped to ${COMPOSER_ACTION_ORDER.send - 1}.`
      );
      order = COMPOSER_ACTION_ORDER.send - 1;
    }
    claim({
      id,
      placement: action.placement,
      presentation: action.presentation ?? "bar",
      order,
      sequence: sequence++,
      source,
      pluginId,
      action,
    });
  };

  for (const action of input.configActions ?? []) addAction(action, "config");

  for (const plugin of input.plugins) {
    if (!plugin.contributeComposerActions) continue;
    let contributed: ComposerAction[];
    try {
      contributed = plugin.contributeComposerActions(input.contributionContext);
    } catch (error) {
      if (typeof console !== "undefined") {
        // eslint-disable-next-line no-console
        console.error(
          `[Persona] plugin "${plugin.id}" contributeComposerActions failed:`,
          error
        );
      }
      continue;
    }
    for (const action of contributed ?? []) {
      addAction(action, "plugin", plugin.id);
    }
  }

  return resolved.sort((a, b) =>
    a.order === b.order ? a.sequence - b.sequence : a.order - b.order
  );
}

const describeSource = (entry: ResolvedComposerAction): string =>
  entry.source === "plugin"
    ? `plugin "${entry.pluginId}"`
    : entry.source === "config"
      ? "composer.actions"
      : "a core built-in";

// --- rendering -------------------------------------------------------------

export interface ComposerActionRendererOptions {
  /** The live surface; null while no bindable composer is mounted. */
  getBindings: () => ComposerSurfaceBindings | null;
  /** Re-run contributors and rebuild the input for `resolve()`. */
  collect: () => ComposerActionResolveInput;
  /** Capabilities handed to `onSelect` and custom renderers. */
  actionContext: ComposerActionContext;
  getState: () => Readonly<ComposerState>;
  /** Rejected async `onSelect`, and any renderer failure. */
  reportError: (error: unknown, info: { actionId: string }) => void;
  /**
   * Explicit icon-button edge. Leave unset (the normal case) and the box comes
   * from `--persona-composer-control-size` in the stylesheet; a returned value
   * writes inline styles that override the token.
   */
  getButtonSize?: () => string | undefined;
  /** Live `composer.actionOverflow`; re-read on every resolve. */
  getOverflow?: () => ComposerActionOverflowConfig | undefined;
  /** Accessible name for the `+` trigger and its menu. Default "More actions". */
  getOverflowLabel?: () => string;
}

export interface ComposerActionRenderer {
  /** Re-run contributors, diff, and place the row. */
  resolve: () => void;
  /** Cheap pass: re-evaluate visible/disabled/pressed against current state. */
  sync: () => void;
  getResolved: () => readonly ResolvedComposerAction[];
  /** The `+` menu, once the overflow policy has created one. */
  getOverflowMenu: () => ComposerOverflowMenu | null;
  destroy: () => void;
}

/** Where an entry currently renders. */
type EntryMode = "bar" | "menu";

type Entry = {
  resolved: ResolvedComposerAction;
  /** Node placed into the cluster. */
  element: HTMLElement;
  button?: HTMLButtonElement;
  tooltip?: TooltipHandle;
  /** The registry created this element and owns its teardown. */
  owned: boolean;
  /** The registry inserts/removes this element from its cluster. */
  managed: boolean;
  destroy?: () => void;
  detach?: () => void;
  busy: boolean;
  visible: boolean;
  /** Surface the element is currently built/placed for. */
  mode: EntryMode;
  /** `role="none"` wrapper holding a folded built-in or custom control. */
  menuSlot?: HTMLElement;
  /** Text appended beside an icon-only folded control. */
  menuLabel?: HTMLElement;
  /** Removes the slot's click forwarding. */
  detachMenuSlot?: () => void;
};

const evaluate = (
  value: boolean | ((state: Readonly<ComposerState>) => boolean) | undefined,
  state: Readonly<ComposerState>,
  fallback: boolean
): boolean => {
  if (value === undefined) return fallback;
  return typeof value === "function" ? value(state) === true : value === true;
};

/**
 * The draft state `sendButton.visibility` reads: text, a pending attachment, or
 * a live stream all count as "there is something in flight".
 */
const hasDraftContent = (state: Readonly<ComposerState>): boolean =>
  state.phase === "streaming" ||
  state.text.trim().length > 0 ||
  state.attachments.length > 0;

/**
 * `ComposerAction.visibility` against the current draft. Evaluated on every
 * state-driven pass, so the answer is always render-time, never patched on.
 */
export function matchesComposerActionVisibility(
  visibility: ComposerActionVisibility | undefined,
  state: Readonly<ComposerState>
): boolean {
  if (!visibility || visibility === "always") return true;
  const drafting = hasDraftContent(state);
  return visibility === "when-text" ? drafting : !drafting;
}

const isCustom = (action: ComposerAction): action is ComposerCustomAction =>
  action.kind === "custom";

/** The interactive control inside a built-in's wrapper, or the wrapper itself. */
const controlOf = (element: HTMLElement): HTMLElement =>
  element instanceof HTMLButtonElement
    ? element
    : (element.querySelector<HTMLElement>("button") ?? element);

/**
 * Accessible name of a folded control, in the order the composer sets it:
 * `aria-label` (every built-in stamps one), then the tooltip `title`.
 */
const accessibleNameOf = (element: HTMLElement): string => {
  const control = controlOf(element);
  return (
    control.getAttribute("aria-label")?.trim() ||
    control.getAttribute("title")?.trim() ||
    ""
  );
};

/**
 * Subtrees whose text a sighted user never reads inline: the portaled control
 * tooltip and any other tooltip, screen-reader-only, or hidden naming span. A
 * naive `textContent` walk counts these and wrongly concludes the control is
 * already labeled.
 */
const NON_VISIBLE_TEXT_SELECTOR =
  '.persona-control-tooltip, [role="tooltip"], .persona-sr-only, [hidden], [aria-hidden="true"]';

/** Text a sighted user actually reads inside `element`. */
export function visibleTextOf(element: HTMLElement): string {
  let text = "";
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.nodeValue ?? "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    if (typeof el.matches === "function" && el.matches(NON_VISIBLE_TEXT_SELECTOR)) {
      return;
    }
    node.childNodes.forEach(walk);
  };
  walk(element);
  return text.trim();
}

/**
 * True when the control renders no text of its own, so a menu row built from it
 * would be a bare icon among labeled rows.
 */
const isIconOnly = (element: HTMLElement): boolean =>
  visibleTextOf(element).length === 0;

export function createComposerActionRenderer(
  options: ComposerActionRendererOptions
): ComposerActionRenderer {
  const entries = new Map<string, Entry>();
  let order: ResolvedComposerAction[] = [];
  let destroyed = false;
  let activatedMenuActionId: string | null = null;

  /** Explicit override, or undefined when the control-size token owns the box. */
  const buttonSize = (): string | undefined => options.getButtonSize?.();

  /** Menu row: icon plus always-visible label, `role="menuitem"`. */
  const applyMenuItemAppearance = (
    entry: Entry,
    action: ComposerButtonAction
  ): void => {
    const button = entry.button;
    if (!button) return;
    button.setAttribute("role", "menuitem");
    button.setAttribute("tabindex", "-1");
    button.className = "persona-composer-overflow-menu__item";
    for (const property of [
      "width",
      "height",
      "minWidth",
      "minHeight",
      "fontSize",
      "color",
      "backgroundColor",
    ] as const) {
      button.style[property] = "";
    }
    button.style.lineHeight = "1";
    if (action.tooltipText) button.setAttribute("title", action.tooltipText);
    else button.removeAttribute("title");

    button.replaceChildren();
    const iconHolder = createElement(
      "span",
      "persona-composer-overflow-menu__icon"
    );
    if (action.iconName) {
      const icon = renderLucideIcon(action.iconName, 16, "currentColor", 1.5);
      if (icon) iconHolder.appendChild(icon);
    }
    const text = createElement("span", "persona-composer-overflow-menu__label");
    text.textContent = action.shortLabel ?? action.label;
    button.append(iconHolder, text);
  };

  const applyButtonAppearance = (
    entry: Entry,
    action: ComposerButtonAction
  ): void => {
    const button = entry.button;
    if (!button) return;
    button.setAttribute("aria-label", action.label);
    if (action.pressed === undefined) button.removeAttribute("aria-pressed");
    else button.setAttribute("aria-pressed", action.pressed ? "true" : "false");
    button.toggleAttribute(STREAMING_ATTR, action.disableWhenStreaming === true);

    if (entry.mode === "menu") {
      entry.tooltip?.destroy();
      entry.tooltip = undefined;
      applyMenuItemAppearance(entry, action);
      return;
    }
    button.removeAttribute("role");
    button.removeAttribute("tabindex");
    button.removeAttribute("title");

    const size = buttonSize();
    // Text buttons size from their padding; icon-only buttons are a fixed box,
    // matching the attachment/mic controls. The box itself comes from
    // `--persona-composer-control-size`; only an explicit override is inline.
    const hasText = Boolean(action.shortLabel) || !action.iconName;
    button.className = cx(
      "persona-rounded-button persona-flex persona-items-center persona-justify-center disabled:persona-opacity-50 persona-cursor-pointer persona-composer-action-button",
      COMPOSER_CONTROL_CLASS,
      COMPOSER_CONTROL_GLYPH_CLASS,
      hasText && "persona-composer-action-button--text persona-gap-1 persona-text-sm"
    );
    button.style.width = size && !hasText ? size : "";
    button.style.height = size ?? "";
    button.style.minWidth = size && !hasText ? size : "";
    button.style.minHeight = size ?? "";
    button.style.fontSize = hasText ? "" : "18px";
    button.style.lineHeight = "1";
    // Per-action chrome. Unset clears, so `controller.update()` can drop it.
    button.style.color = action.iconColor ?? "";
    button.style.backgroundColor = action.backgroundColor ?? "";

    button.replaceChildren();
    if (action.iconName) {
      const icon = renderLucideIcon(
        action.iconName,
        COMPOSER_CONTROL_ICON_FALLBACK_PX,
        "currentColor",
        1.5
      );
      if (icon) {
        if (action.iconName === "voice-bars" && action.iconAnimation === "voice") {
          icon.classList.add("persona-voice-bars--animated");
        }
        button.appendChild(icon);
      }
    }
    if (hasText) {
      const text = createElement("span", "persona-composer-action-button__label");
      text.textContent = action.shortLabel ?? action.label;
      button.appendChild(text);
    }
    if (action.trailingIconName && hasText) {
      const trailing = renderLucideIcon(action.trailingIconName, COMPOSER_CONTROL_ICON_FALLBACK_PX, "currentColor", 1.5);
      if (trailing) button.appendChild(trailing);
    }
    if (!button.firstChild) {
      // No icon and no visible text: fall back to the accessible name so the
      // control is never an empty box.
      button.textContent = action.label;
    }

    entry.tooltip?.destroy();
    entry.tooltip = attachTooltip({
      anchor: button,
      trigger: entry.element,
      text: () => action.tooltipText ?? action.label,
      enabled: Boolean(action.tooltipText),
    });
  };

  /**
   * A button action renders as a bar icon button or as a menu row; the two are
   * different elements, so a presentation flip rebuilds the entry.
   */
  const createButtonEntry = (
    resolved: ResolvedComposerAction,
    mode: EntryMode
  ): Entry => {
    const action = resolved.action as ComposerButtonAction;
    const button = createNode("button", {
      attrs: { type: "button" },
    }) as HTMLButtonElement;

    let element: HTMLElement = button;
    if (mode === "bar") {
      const wrapper = createElement("div", "persona-send-button-wrapper");
      wrapper.appendChild(button);
      element = wrapper;
    }
    element.setAttribute(COMPOSER_ACTION_ATTR, resolved.id);

    const entry: Entry = {
      resolved,
      element,
      button,
      owned: true,
      managed: true,
      busy: false,
      visible: true,
      mode,
    };

    const onClick = (event: Event): void => {
      event.preventDefault();
      // The composer form focuses the input on any click that is not a known
      // control; an action button is a control.
      event.stopPropagation();
      if (entry.busy || button.disabled) return;
      const current = entry.resolved.action as ComposerButtonAction;
      // Menu semantics: activating a row closes the menu and returns focus.
      if (entry.mode === "menu") {
        activatedMenuActionId = entry.resolved.id;
        overflowMenu?.close(true);
      }
      let result: void | Promise<void>;
      try {
        result = current.onSelect(options.actionContext, event);
      } catch (error) {
        options.reportError(error, { actionId: entry.resolved.id });
        return;
      }
      if (!result || typeof (result as Promise<void>).then !== "function") return;
      entry.busy = true;
      button.setAttribute("aria-busy", "true");
      void (result as Promise<void>)
        .catch((error: unknown) => {
          options.reportError(error, { actionId: entry.resolved.id });
        })
        .finally(() => {
          entry.busy = false;
          button.removeAttribute("aria-busy");
        });
    };
    button.addEventListener("click", onClick);
    entry.detach = () => button.removeEventListener("click", onClick);

    applyButtonAppearance(entry, action);
    return entry;
  };

  const createCustomEntry = (
    resolved: ResolvedComposerAction
  ): Entry | null => {
    const action = resolved.action as ComposerCustomAction;
    let rendered: { element: HTMLElement; destroy?: () => void };
    try {
      rendered = action.render({
        ...options.actionContext,
        id: resolved.id,
        action,
      });
    } catch (error) {
      options.reportError(error, { actionId: resolved.id });
      return null;
    }
    if (!rendered?.element) return null;
    rendered.element.setAttribute(COMPOSER_ACTION_ATTR, resolved.id);
    rendered.element.toggleAttribute(
      STREAMING_ATTR,
      action.disableWhenStreaming === true
    );
    return {
      resolved,
      element: rendered.element,
      owned: true,
      managed: true,
      destroy: rendered.destroy,
      busy: false,
      visible: true,
      mode: "bar",
    };
  };

  const createEntry = (
    resolved: ResolvedComposerAction,
    mode: EntryMode
  ): Entry | null => {
    if (resolved.builtIn) {
      const element = resolved.builtIn.element;
      if (!element) return null;
      return {
        resolved,
        element,
        owned: false,
        managed: resolved.builtIn.managed === true,
        busy: false,
        visible: true,
        mode: "bar",
      };
    }
    const action = resolved.action;
    if (!action) return null;
    return isCustom(action)
      ? createCustomEntry(resolved)
      : createButtonEntry(resolved, mode);
  };

  const teardown = (entry: Entry): void => {
    entry.detach?.();
    entry.tooltip?.destroy();
    entry.detachMenuSlot?.();
    entry.detachMenuSlot = undefined;
    entry.menuLabel?.remove();
    entry.menuLabel = undefined;
    entry.menuSlot?.remove();
    entry.menuSlot = undefined;
    if (entry.owned) {
      try {
        entry.destroy?.();
      } catch (error) {
        options.reportError(error, { actionId: entry.resolved.id });
      }
      entry.element.remove();
    }
  };

  /**
   * Place managed elements around the built-in placeholders. Placeholders are
   * never moved. A reverse pass uses the following entry as an anchor and
   * leaves already ordered nodes attached, preserving keyboard focus.
   */
  const place = (cluster: HTMLElement, visible: Entry[]): void => {
    let anchor: HTMLElement | null = null;
    for (let i = visible.length - 1; i >= 0; i--) {
      const entry = visible[i];
      if (!entry.managed) {
        if (entry.element.parentElement === cluster) anchor = entry.element;
        continue;
      }
      // Re-inserting a node that is already in place still detaches it, which
      // blurs anything focused inside it (the model picker restores focus to
      // its trigger on selection, and the store emit re-places right after).
      if (anchor) {
        if (
          entry.element.parentElement !== cluster ||
          entry.element.nextSibling !== anchor
        ) {
          cluster.insertBefore(entry.element, anchor);
        }
      } else if (cluster.lastChild !== entry.element) {
        cluster.appendChild(entry.element);
      }
      anchor = entry.element;
    }
  };

  const setDisabled = (entry: Entry, disabled: boolean): void => {
    if (entry.button) {
      entry.button.disabled = disabled;
      return;
    }
    if (!entry.owned) return;
    const element = entry.element;
    element.toggleAttribute("data-disabled", disabled);
    element.setAttribute("aria-disabled", disabled ? "true" : "false");
    // The root may be the control, or a wrapper around it (the model picker
    // wraps its select so a chevron can overlay it).
    const control =
      element instanceof HTMLButtonElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement
        ? element
        : element.querySelector<
            | HTMLButtonElement
            | HTMLSelectElement
            | HTMLInputElement
            | HTMLTextAreaElement
          >("button, select, input, textarea");
    if (control) control.disabled = disabled;
  };

  // --- overflow presentation ------------------------------------------------

  let overflowMenu: ComposerOverflowMenu | null = null;
  let observedFooter: HTMLElement | null = null;
  let resizeObserver: ResizeObserver | null = null;
  /** Latest footer content-box width; 0 while the box is not laid out. */
  let footerWidth = 0;
  let fitObserver: MutationObserver | null = null;
  let fitFrame: number | null = null;
  let fitForm: HTMLElement | null = null;
  let fontEpoch = 0;
  let fitFolded = new Set<string>();
  const barWidths = new Map<string, { key: string; width: number }>();
  const fontChanged = () => { fontEpoch += 1; scheduleFit(); };
  const scheduleFit = () => {
    if (destroyed || fitFrame !== null || !observedFooter) return;
    const view = observedFooter.ownerDocument.defaultView;
    if (!view) return;
    fitFrame = view.requestAnimationFrame(() => { fitFrame = null; sync(); });
  };
  const disconnectFit = () => {
    if (fitFrame !== null) observedFooter?.ownerDocument.defaultView?.cancelAnimationFrame(fitFrame);
    fitFrame = null;
    fitObserver?.disconnect();
    fitObserver = null;
    observedFooter?.ownerDocument.defaultView?.removeEventListener("resize", scheduleFit);
    observedFooter?.ownerDocument.fonts?.removeEventListener("loadingdone", fontChanged);
    fitForm = null;
  };

  const overflowConfig = (): ComposerActionOverflowConfig | undefined => {
    const value = options.getOverflow?.();
    return value?.enabled === true ? value : undefined;
  };

  const ensureOverflowMenu = (): ComposerOverflowMenu => {
    if (!overflowMenu) {
      overflowMenu = createComposerOverflowMenu({
        label: options.getOverflowLabel?.() ?? "More actions",
        getButtonSize: buttonSize,
      });
    } else {
      overflowMenu.setLabel(options.getOverflowLabel?.() ?? "More actions");
    }
    return overflowMenu;
  };

  /** Observe the footer so `collapseAutoActionsBelow` tracks live resizes. */
  const observeFooter = (bindings: ComposerSurfaceBindings, fit: boolean): void => {
    const footer = bindings.footer;
    if (observedFooter === footer && (fit ? fitForm === bindings.form : fitForm === null)) return;
    disconnectFit();
    resizeObserver?.disconnect();
    observedFooter = footer;
    footerWidth = measureFooterContentWidth(footer);
    if (fit) {
      fitForm = bindings.form;
      const view = footer.ownerDocument.defaultView;
      view?.addEventListener("resize", scheduleFit);
      footer.ownerDocument.fonts?.addEventListener("loadingdone", fontChanged);
      if (view?.MutationObserver) {
        fitObserver = new view.MutationObserver((records) => {
          if (records.some((record) => {
            if (overflowMenu?.trigger.contains(record.target)) return false;
            if (record.target === bindings.input && record.type === "attributes") return false;
            const changed = [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)];
            if (changed.length && changed.every((node) => node instanceof view.HTMLElement && node.hasAttribute("data-persona-composer-measure"))) return false;
            return true;
          })) scheduleFit();
        });
        fitObserver.observe(footer, { subtree: true, childList: true, characterData: true,
          attributes: true, attributeFilter: ["class", "style", "hidden", "data-persona-composer-layout", "data-persona-composer-compact"] });
      }
    }
    if (typeof ResizeObserver === "undefined") return;
    resizeObserver = new ResizeObserver((observed) => {
      if (fit) { scheduleFit(); return; }
      const last = observed[observed.length - 1];
      const width =
        last?.contentRect?.width ?? measureFooterContentWidth(footer);
      if (width === footerWidth) return;
      footerWidth = width;
      sync();
    });
    resizeObserver.observe(footer);
    if (fit) {
      resizeObserver.observe(bindings.form);
      resizeObserver.observe(bindings.actionsStart);
      resizeObserver.observe(bindings.actionsEnd);
    }
  };

  /** True while `auto` actions should fold. Unmeasured footers never fold. */
  const shouldCollapseAuto = (
    config: ComposerActionOverflowConfig,
    footer: HTMLElement
  ): boolean => {
    const threshold = resolveCollapseThreshold(
      config.collapseAutoActionsBelow,
      footer
    );
    if (threshold === null) return false;
    const width = footerWidth || measureFooterContentWidth(footer);
    return width > 0 && width < threshold;
  };

  const presentationOf = (
    entry: Entry,
    config: ComposerActionOverflowConfig | undefined,
    collapseAuto: boolean
  ): EntryMode => {
    if (!config) return "bar";
    if (entry.resolved.builtIn) {
      const kind = builtInOverflowKind(entry.resolved.id);
      // Built-ins fold only when explicitly named; never because the menu exists.
      return kind && config.includeBuiltIns?.includes(kind) ? "menu" : "bar";
    }
    const presentation: ComposerActionPresentation = entry.resolved.presentation;
    if (presentation === "overflow") return "menu";
    if (presentation === "auto") return collapseAuto ? "menu" : "bar";
    return "bar";
  };

  /**
   * Give a folded icon-only control the same icon-plus-label row shape as a
   * contributed menu item, using its accessible name.
   *
   * Idempotent and re-entrant: the span is created once per slot and only its
   * text is rewritten, so repeated `resolve()`/`sync()` passes (and a live
   * `aria-label` change from `controller.update()`) never duplicate it. The bar
   * never sees it: unfolding drops the slot and the label with it.
   */
  const syncMenuSlotLabel = (entry: Entry): void => {
    const slot = entry.menuSlot;
    if (!slot) return;
    if (!isIconOnly(entry.element)) {
      // The control grew its own text; ours would read twice.
      entry.menuLabel?.remove();
      entry.menuLabel = undefined;
      return;
    }
    const name = accessibleNameOf(entry.element);
    if (!name) {
      entry.menuLabel?.remove();
      entry.menuLabel = undefined;
      return;
    }
    if (!entry.menuLabel) {
      entry.menuLabel = createElement(
        "span",
        "persona-composer-overflow-menu__label"
      );
    }
    if (entry.menuLabel.textContent !== name) entry.menuLabel.textContent = name;
    if (entry.menuLabel.parentElement !== slot) slot.appendChild(entry.menuLabel);
  };

  /**
   * Move an entry between the bar and the menu. The live button/control stays
   * alive; only its wrapper and appearance change, preserving async state.
   */
  const applyEntryMode = (entry: Entry, mode: EntryMode): Entry => {
    if (entry.mode === mode) return entry;
    const action = entry.resolved.action;
    if (action && !isCustom(action)) {
      // Keep the button and its async busy state alive across presentation
      // changes. Only its bar wrapper changes; no onSelect lifecycle restarts.
      const previous = entry.element;
      if (mode === "menu") entry.element = entry.button!;
      else {
        entry.element = createElement("div", "persona-send-button-wrapper");
        entry.element.appendChild(entry.button!);
        entry.button!.removeAttribute(COMPOSER_ACTION_ATTR);
      }
      if (previous !== entry.element && previous !== entry.button) previous.remove();
      entry.element.setAttribute(COMPOSER_ACTION_ATTR, entry.resolved.id);
      entry.mode = mode;
      applyButtonAppearance(entry, action);
      return entry;
    }
    if (mode === "menu") {
      const slot = createNode("div", {
        className: "persona-composer-overflow-menu__slot",
        // The row's own label is the visible name, so the control's bar tooltip
        // must not open over it. Suppression is read at open time, so unfolding
        // restores normal tooltip behavior with no extra bookkeeping.
        attrs: { role: "none", [TOOLTIP_SUPPRESSED_ATTR]: "" },
      });
      slot.appendChild(entry.element);
      // A tooltip already open when the control folds would outlive the hover.
      hideTooltipFor(controlOf(entry.element));
      entry.menuSlot = slot;
      // The whole row is the target, including the appended label.
      //
      // CAPTURE phase, for two reasons. It runs before the control's own
      // handler, so the menu closes first and focus returns to the trigger
      // exactly like a contributed row (which closes before `onSelect`); the
      // control then acts inside the same user gesture, so a file picker still
      // opens. And it cannot be skipped: the mention affordance stops
      // propagation, so a bubble-phase listener would never see a direct hit on
      // it and the menu would stay open behind the mention picker.
      const onSlotClick = (event: Event): void => {
        const control = controlOf(entry.element);
        // A disabled control activates nothing, so it must not close the menu.
        if ((control as HTMLButtonElement).disabled) return;
        const direct =
          event.target === control || control.contains(event.target as Node);
        activatedMenuActionId = entry.resolved.id;
        overflowMenu?.close(true);
        // A direct hit reaches the control on its own; a click on the label or
        // the row padding is forwarded. Removing the panel mid-dispatch does not
        // stop the in-flight event from reaching its target.
        if (!direct) control.click();
      };
      slot.addEventListener("click", onSlotClick, true);
      entry.detachMenuSlot = () =>
        slot.removeEventListener("click", onSlotClick, true);
      // Folded built-ins are inserted by the registry from here on, so the bar
      // gets them back in the right slot when the policy changes.
      entry.managed = true;
      syncMenuSlotLabel(entry);
    } else {
      entry.detachMenuSlot?.();
      entry.detachMenuSlot = undefined;
      entry.menuLabel?.remove();
      entry.menuLabel = undefined;
      entry.menuSlot?.remove();
      entry.menuSlot = undefined;
    }
    entry.mode = mode;
    return entry;
  };

  /** Place the menu rows in resolved order inside the panel. */
  const placeMenu = (panel: HTMLElement, rows: Entry[]): void => {
    const nodes = rows.map((entry) => entry.menuSlot ?? entry.element);
    nodes.forEach((node, index) => {
      const current = panel.children[index];
      if (current === node) return;
      if (current) panel.insertBefore(node, current);
      else panel.appendChild(node);
    });
    while (panel.children.length > nodes.length) {
      panel.lastElementChild?.remove();
    }
  };

  const fitSelection = (bindings: ComposerSurfaceBindings, visible: Entry[], overflow: ComposerActionOverflowConfig): Set<string> => {
    const available = measureFooterContentWidth(bindings.form);
    if (!available) return fitFolded;
    const view = bindings.form.ownerDocument.defaultView!;
    const style = view.getComputedStyle(bindings.form);
    const number = (value: string) => Number.parseFloat(value) || 0;
    const gap = number(style.columnGap);
    const compact = bindings.footer.getAttribute("data-persona-composer-layout") === "single-row" &&
      bindings.footer.hasAttribute("data-persona-composer-compact");
    const key = [style.fontFamily, style.fontSize,
      style.getPropertyValue("--persona-composer-font-size"),
      style.getPropertyValue("--persona-composer-control-size"),
      style.getPropertyValue("--persona-composer-control-icon-size"), buttonSize(), fontEpoch].join("|");
    const regions = { start: bindings.actionsStart, end: bindings.actionsEnd };
    const slots = { start: { width: 0, count: 0 }, end: { width: 0, count: 0 } };
    const gaps = { start: 0, end: 0 };
    for (const placement of ["start", "end"] as const) {
      gaps[placement] = number(view.getComputedStyle(regions[placement]).columnGap);
      for (const child of Array.from(regions[placement].children)) {
        if (!(child instanceof view.HTMLElement) || child === overflowMenu?.trigger ||
            visible.some((entry) => entry.element === child)) continue;
        const width = measureComposerActionWidth(child);
        if (width) { slots[placement].width += width; slots[placement].count += 1; }
      }
    }
    const items = [];
    let hasMenu = false;
    for (const entry of visible) {
      if (presentationOf(entry, overflow, false) === "menu") { hasMenu = true; continue; }
      const action = entry.resolved.action;
      const cacheKey = `${key}|${action && !isCustom(action) ? [action.label, action.shortLabel, action.iconName, action.trailingIconName, action.pressed].join("|") : "custom"}`;
      let width = entry.mode === "bar" ? measureComposerActionWidth(entry.element) : 0;
      const cached = barWidths.get(entry.resolved.id);
      if (!width && cached?.key === cacheKey) width = cached.width;
      if (!width && action && !isCustom(action)) {
        // Measure a registry-owned bar button, never a clone or re-render of a
        // live custom control. Menu row widths are not bar widths.
        const probe = createButtonEntry(entry.resolved, "bar");
        probe.element.setAttribute("data-persona-composer-measure", "");
        probe.element.style.cssText = "position:absolute;visibility:hidden;width:max-content;pointer-events:none";
        regions[entry.resolved.placement].appendChild(probe.element);
        width = measureComposerActionWidth(probe.button!);
        teardown(probe);
      }
      // A custom control can have different menu chrome. Its last measured
      // bar width remains authoritative until it returns to the bar.
      if (!width && action && isCustom(action)) width = cached?.width ?? 0;
      if (width) barWidths.set(entry.resolved.id, { key: cacheKey, width });
      if (!width && view.getComputedStyle(entry.element).display !== "none") return fitFolded;
      if (!width) continue;
      items.push({ id: entry.resolved.id, placement: entry.resolved.placement, width,
        order: entry.resolved.order, sequence: entry.resolved.sequence,
        auto: entry.resolved.presentation === "auto" });
    }
    const controlSize = number(style.getPropertyValue("--persona-composer-control-size")) || 40;
    const triggerWidth = overflowMenu ? measureComposerActionWidth(overflowMenu.trigger) : 0;
    return selectComposerFitOverflow({ available: Math.max(1, available - (compact ? COMPOSER_MIN_EDITOR_WIDTH + gap * 2 : 0)),
      actions: items, slots, gaps, clusterGap: compact ? 0 : gap,
      triggerWidth: triggerWidth || number(buttonSize() ?? "") || controlSize,
      hasMenu, previous: fitFolded });
  };

  const sync = (): void => {
    if (destroyed) return;
    const bindings = options.getBindings();
    if (!bindings) return;
    const state = options.getState();
    const streaming = state.phase === "streaming";
    const overflow = overflowConfig();
    const fit = overflow?.collapseAutoActions === "fit";
    if (overflow) observeFooter(bindings, fit);
    else { disconnectFit(); resizeObserver?.disconnect(); observedFooter = null; }
    const collapseAuto = overflow && !fit
      ? shouldCollapseAuto(overflow, bindings.footer)
      : false;

    const root = bindings.footer.getRootNode() as Document | ShadowRoot;
    const active = root.activeElement;
    const triggerFocused = active === overflowMenu?.triggerButton;
    const focused = active ? Array.from(entries.values()).find((entry) => entry.element.contains(active)) : undefined;
    const previousMode = focused?.mode;
    if (fit) {
      const visible = order.map((resolved) => entries.get(resolved.id)).filter((entry): entry is Entry => Boolean(entry))
        .filter((entry) => !entry.resolved.action || (evaluate(entry.resolved.action.visible, state, true) && matchesComposerActionVisibility(entry.resolved.action.visibility, state)));
      // New bar nodes must acquire their real inherited styles before measuring.
      for (const placement of ["start", "end"] as const) {
        place(placement === "start" ? bindings.actionsStart : bindings.actionsEnd,
          visible.filter((entry) => entry.mode === "bar" && entry.resolved.placement === placement));
      }
      fitFolded = fitSelection(bindings, visible, overflow!);
    } else fitFolded.clear();

    const clusters: Record<ComposerActionPlacement, Entry[]> = {
      start: [],
      end: [],
    };
    const menuRows: Entry[] = [];

    for (const resolved of order) {
      let entry = entries.get(resolved.id);
      if (!entry) continue;
      const action = resolved.action;
      const visible = action
        ? evaluate(action.visible, state, true) &&
          matchesComposerActionVisibility(action.visibility, state)
        : true;
      if (entry.visible !== visible) {
        entry.visible = visible;
        // Managed elements leave the DOM when hidden; the node (and any custom
        // action's internal state) survives for the next show.
        if (!visible && entry.managed) {
          (entry.menuSlot ?? entry.element).remove();
        }
      }
      if (!visible) continue;
      const mode = presentationOf(entry, overflow, collapseAuto);
      entry = applyEntryMode(entry, mode === "menu" || (fit && resolved.presentation === "auto" && fitFolded.has(resolved.id)) ? "menu" : "bar");
      if (action) {
        const disabled =
          evaluate(action.disabled, state, false) ||
          (action.disableWhenStreaming === true && streaming);
        setDisabled(entry, disabled);
        if (!isCustom(action) && action.pressed !== undefined) {
          entry.button?.setAttribute(
            "aria-pressed",
            action.pressed ? "true" : "false"
          );
        }
      }
      if (entry.mode === "menu") {
        // Re-read each pass so a live accessible-name change (an updated
        // `attachments.buttonTooltipText`, say) reaches the row.
        syncMenuSlotLabel(entry);
        menuRows.push(entry);
      } else {
        clusters[resolved.placement].push(entry);
      }
    }

    if (menuRows.length > 0) {
      const menu = ensureOverflowMenu();
      placeMenu(menu.panel, menuRows);
      menu.setItems(menuRows.map((entry) => entry.menuSlot ?? entry.element));
      menu.applyButtonSize();
      // The trigger is a start-cluster control ordered like any other; the
      // 900 anchor is only its default, so `order: 0` leads the bar.
      const triggerOrder = Number.isFinite(overflow?.order)
        ? (overflow?.order as number)
        : COMPOSER_ACTION_ORDER.overflow;
      const index = clusters.start.findIndex(
        (entry) => entry.resolved.order > triggerOrder
      );
      const triggerEntry: Entry = {
        resolved: {
          id: COMPOSER_OVERFLOW_ACTION_ID,
          placement: "start",
          presentation: "bar",
          order: triggerOrder,
          sequence: -1,
          source: "core",
        },
        element: menu.trigger,
        owned: false,
        managed: true,
        busy: false,
        visible: true,
        mode: "bar",
      };
      clusters.start.splice(index < 0 ? clusters.start.length : index, 0, triggerEntry);
    } else if (overflowMenu) {
      // Nothing left to show: the trigger must not linger as an empty affordance.
      overflowMenu.close();
      overflowMenu.trigger.remove();
      overflowMenu.setItems([]);
    }

    place(bindings.actionsStart, clusters.start);
    place(bindings.actionsEnd, clusters.end);
    if (focused && active && focused.visible && (!active.isConnected || focused.mode !== previousMode || root.activeElement !== active)) {
      if (focused.mode === "bar") {
        overflowMenu?.close();
        resolveMenuFocusTarget(focused.element).focus();
      } else if (overflowMenu?.isOpen()) resolveMenuFocusTarget(focused.menuSlot ?? focused.element).focus();
      else overflowMenu?.triggerButton.focus();
    } else if (triggerFocused && !menuRows.length) {
      const restored = activatedMenuActionId ? entries.get(activatedMenuActionId) : undefined;
      if (restored?.visible && restored.mode === "bar") resolveMenuFocusTarget(restored.element).focus();
      else bindings.input.focus();
    }
    activatedMenuActionId = null;
  };

  const resolve = (): void => {
    if (destroyed) return;
    const next = resolveComposerActions(options.collect());
    const nextIds = new Set(next.map((item) => item.id));

    for (const [id, entry] of entries) {
      if (nextIds.has(id)) continue;
      teardown(entry);
      entries.delete(id);
      barWidths.delete(id);
    }

    for (const resolved of next) {
      const existing = entries.get(resolved.id);
      if (!existing) {
        const entry = createEntry(resolved, "bar");
        if (entry) entries.set(resolved.id, entry);
        continue;
      }
      const previousAction = existing.resolved.action;
      const nextAction = resolved.action;
      // A custom action is rebuilt only when its renderer identity changes;
      // otherwise the live element (and its state) is kept across updates.
      const rebuild =
        Boolean(previousAction) !== Boolean(nextAction) ||
        (previousAction &&
          nextAction &&
          isCustom(previousAction) !== isCustom(nextAction)) ||
        (previousAction &&
          nextAction &&
          isCustom(previousAction) &&
          isCustom(nextAction) &&
          previousAction.render !== nextAction.render);
      if (rebuild) {
        teardown(existing);
        entries.delete(resolved.id);
        barWidths.delete(resolved.id);
        const entry = createEntry(resolved, existing.mode);
        if (entry) entries.set(resolved.id, entry);
        continue;
      }
      existing.resolved = resolved;
      if (resolved.builtIn) {
        // A folded built-in stays managed: the registry owns its placement now.
        existing.managed =
          resolved.builtIn.managed === true || existing.mode === "menu";
        if (resolved.builtIn.element && existing.mode === "bar") {
          existing.element = resolved.builtIn.element;
        }
      } else if (nextAction && !isCustom(nextAction)) {
        applyButtonAppearance(existing, nextAction);
      } else if (nextAction) {
        existing.element.toggleAttribute(
          STREAMING_ATTR,
          nextAction.disableWhenStreaming === true
        );
      }
    }

    order = next;
    sync();
  };

  return {
    resolve,
    sync,
    getResolved: () => order,
    getOverflowMenu: () => overflowMenu,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      disconnectFit();
      resizeObserver?.disconnect();
      resizeObserver = null;
      observedFooter = null;
      for (const entry of entries.values()) teardown(entry);
      entries.clear();
      overflowMenu?.destroy();
      overflowMenu = null;
      order = [];
    },
  };
}
