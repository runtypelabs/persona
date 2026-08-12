import { createElement, createNode, cx } from "../utils/dom";
import { renderLucideIcon } from "../utils/icons";
import { AgentWidgetConfig } from "../types";
import { attachTooltip } from "../utils/tooltip";
import { HEADER_THEME_CSS } from "./header-builder";

/**
 * Class hook for the shared header control box. The stylesheet sizes it from
 * `--persona-header-control-size` (theme `components.header.controlSize`).
 */
export const HEADER_CONTROL_CLASS = "persona-header-control";
/** Adds `--persona-header-control-icon-size` sizing to the control's glyph. */
export const HEADER_CONTROL_GLYPH_CLASS = "persona-header-control--glyph";
/** Scales the glyph up for icons whose paths under-fill the 24x24 viewBox. */
export const HEADER_CONTROL_SPARSE_CLASS = "persona-header-control--sparse";
/**
 * Icon-size token default in CSS pixels. Only derives the SVG attributes when a
 * per-control size is unset; the box itself is owned by the stylesheet.
 */
const ICON_FALLBACK_PX = 20;

/**
 * Icons whose Lucide paths occupy only the middle of the 24x24 viewBox (X spans
 * 6,6 to 18,18; siblings such as refresh-cw span ~75%). Rendering them larger
 * brings their visible extent into parity; the stroke is thinned by the same
 * factor so the weight still matches. Keep the scale in sync with the
 * `.persona-header-control--sparse` multiplier in widget.css.
 */
const SPARSE_GLYPHS: Record<string, [number, number]> = { x: [1.4, 1.05] };

// Flex, not block: an inline-flex button in a block wrapper reserves baseline
// slack and rides high inside it.
const DEFAULT_WRAPPER_CLASS =
  "persona-relative persona-ml-auto persona-inline-flex persona-items-center persona-justify-center";

const DEFAULT_CLEAR_CHAT_WRAPPER_CLASS =
  "persona-relative persona-ml-auto persona-clear-chat-button-wrapper";

export interface HeaderControlGlyphOptions {
  /**
   * Explicit nominal glyph size. Unset hands the box to
   * `--persona-header-control-icon-size` via the glyph class hook.
   */
  iconSize?: string;
  /** Text glyph rendered when the icon name is not in the registry. */
  iconText?: string;
}

/**
 * Render (or re-render) a header control's glyph with the shared optical
 * compensation, syncing the class hooks that let the stylesheet own the box.
 * Both the factory and the live `update()` restyle path go through it so a
 * config change can never repaint a control at a different size or weight.
 */
export const applyHeaderControlGlyph = (
  button: HTMLButtonElement,
  iconName: string,
  options: HeaderControlGlyphOptions = {},
): void => {
  const { iconSize, iconText } = options;
  // [glyph scale, stroke width]; dense glyphs take the standard pair.
  const [scale, stroke] = SPARSE_GLYPHS[iconName] ?? [1, 1.5];
  // Without an explicit size the stylesheet owns the glyph box, so the sparse
  // multiplier has to live there too.
  const tokenGlyph = !iconSize;
  button.classList.toggle(HEADER_CONTROL_GLYPH_CLASS, tokenGlyph);
  button.classList.toggle(HEADER_CONTROL_SPARSE_CLASS, tokenGlyph && scale !== 1);

  // Attribute sizing only decides the glyph when the stylesheet is not driving
  // it; with the glyph class the CSS width/height wins over these attributes.
  const nominalPx = parseFloat(iconSize ?? "") || ICON_FALLBACK_PX;
  const icon = renderLucideIcon(
    iconName,
    `${Math.round(nominalPx * scale)}px`,
    "currentColor",
    stroke,
  );
  if (icon) {
    // Inline SVG baseline spacing pushes the glyph a fractional pixel
    // off-center inside the button.
    icon.style.display = "block";
    button.replaceChildren(icon);
  } else if (iconText) {
    button.textContent = iconText;
  }
  // Unrenderable glyph with no text fallback keeps whatever was mounted; an
  // empty button is worse than a stale one.
};

export interface HeaderIconButtonParts {
  button: HTMLButtonElement;
  wrapper: HTMLElement;
}

export interface CreateHeaderIconButtonOptions {
  /** Required: also the tooltip text when the caller attaches one. */
  ariaLabel: string;
  /** Lucide icon name; falls back to `iconText` when it is not in the registry. */
  iconName?: string;
  /** Text glyph rendered when no icon resolves. */
  iconText?: string;
  /** Wrapper className. Always flex so the button can never ride off-center. */
  wrapperClassName?: string;
  /**
   * Explicit box size. Unset leaves `--persona-header-control-size` in charge;
   * set, it writes an inline box that overrides the token.
   */
  size?: string;
  /**
   * Explicit nominal glyph size. Unset leaves `--persona-header-control-icon-size`
   * in charge. Sparse-viewBox compensation applies on top either way.
   */
  iconSize?: string;
  /** Falls back to the header zone's action-icon color. */
  color?: string;
  /** Set, it replaces the transparent + hover-fill default classes. */
  backgroundColor?: string;
  borderWidth?: string;
  borderColor?: string;
  borderRadius?: string;
  paddingX?: string;
  paddingY?: string;
  /** Renders `display: none` without removing the control. */
  hidden?: boolean;
  /** Appended to the button's class list (e.g. a stable selector hook). */
  extraClassName?: string;
  /** Extra attributes, applied after `type` and `aria-label`. */
  attrs?: Record<string, string>;
}

/**
 * The one header icon-button recipe: close, clear chat, trailing actions, and
 * the Messages control all build through it so their box, glyph, and stroke
 * can never drift apart. Config keys stay inline styles, which win over the
 * token-driven stylesheet rules.
 */
export const createHeaderIconButton = (
  options: CreateHeaderIconButtonOptions,
): HeaderIconButtonParts => {
  const {
    ariaLabel,
    iconName,
    iconText,
    wrapperClassName = DEFAULT_WRAPPER_CLASS,
    size,
    iconSize,
    color,
    backgroundColor,
    borderWidth,
    borderColor,
    borderRadius,
    paddingX,
    paddingY,
    hidden,
    extraClassName,
    attrs,
  } = options;

  const wrapper = createElement("div", wrapperClassName);

  const hasBorder = Boolean(borderWidth || borderColor);

  // hover-bg / border-none / rounded-full are default utility classes that
  // apply only when the matching style override is absent; an override sets
  // the inline style instead (cx omits the class).
  const button = createNode("button", {
    className: cx(
      HEADER_CONTROL_CLASS,
      "persona-inline-flex persona-items-center persona-justify-center persona-cursor-pointer",
      !backgroundColor && "persona-bg-transparent hover:persona-bg-gray-100",
      !hasBorder && "persona-border-none",
      !borderRadius && "persona-rounded-full",
      extraClassName,
    ),
    attrs: { type: "button", "aria-label": ariaLabel, ...attrs },
    style: {
      width: size,
      height: size,
      minWidth: size,
      minHeight: size,
      display: hidden ? "none" : undefined,
      color: color || HEADER_THEME_CSS.actionIconColor,
      // Empty strings are a no-op on a fresh element, so they need no guard.
      backgroundColor,
      border: hasBorder
        ? `${borderWidth || "0px"} solid ${borderColor || "transparent"}`
        : undefined,
      borderRadius,
      paddingLeft: paddingX,
      paddingRight: paddingX,
      paddingTop: paddingY,
      paddingBottom: paddingY,
    },
  });

  if (iconName) {
    applyHeaderControlGlyph(button, iconName, { iconSize, iconText });
  } else if (iconText) {
    button.textContent = iconText;
  }

  wrapper.appendChild(button);
  return { button, wrapper };
};

export interface CloseButtonParts {
  button: HTMLButtonElement;
  wrapper: HTMLElement;
}

export interface ClearChatButtonParts {
  button: HTMLButtonElement;
  wrapper: HTMLElement;
}

export interface CreateCloseButtonOptions {
  showClose?: boolean;
  /**
   * Override the wrapper className. The full header passes its own
   * placement-aware class string; composer-bar mode passes a class that
   * positions the wrapper absolutely in the top-right of the panel chrome.
   */
  wrapperClassName?: string;
  /**
   * Explicit button-size override that wins over `launcher.closeButtonSize`.
   * Use when the call site has its own opinion about the size that should
   * take precedence over the global launcher config: e.g. composer-bar's
   * minimal close icon, where size is part of the mode's UX, not something
   * that should inherit from the floating launcher's button size.
   */
  buttonSize?: string;
  /**
   * Explicit nominal icon size. Unset means the header control icon-size token
   * owns the glyph. Pair with `buttonSize` when scaling the whole control down.
   */
  iconSize?: string;
}

export interface CreateClearChatButtonOptions {
  /**
   * Override the wrapper className. Header builder passes its own
   * placement-aware class string; composer-bar mode passes a class that
   * positions the wrapper absolutely (next to the close button).
   */
  wrapperClassName?: string;
  /**
   * Explicit button-size override that wins over `launcher.clearChat.size`.
   * Composer-bar mode uses this so the clear icon visually matches the
   * shrunken close button and doesn't inherit the header control size.
   */
  buttonSize?: string;
  /** Explicit icon size; unset leaves the header control icon-size token. */
  iconSize?: string;
}

/**
 * Build the close (×) button + tooltip used in the panel header. Every header
 * layout routes through this so composer-bar mode can render just a close
 * button (no full header strip) without duplicating the config-driven styling.
 */
export const createCloseButton = (
  config: AgentWidgetConfig | undefined,
  options: CreateCloseButtonOptions = {},
): CloseButtonParts => {
  const {
    showClose = true,
    wrapperClassName = DEFAULT_WRAPPER_CLASS,
    buttonSize,
    iconSize,
  } = options;
  const launcher = config?.launcher ?? {};
  const closeButtonTooltipText = launcher.closeButtonTooltipText ?? "Close chat";
  const closeButtonShowTooltip = launcher.closeButtonShowTooltip ?? true;

  const { button, wrapper } = createHeaderIconButton({
    ariaLabel: closeButtonTooltipText,
    iconName: launcher.closeButtonIconName ?? "x",
    iconText: launcher.closeButtonIconText ?? "×",
    wrapperClassName,
    // Call-site `buttonSize` wins over launcher config; both unset means the
    // header control-size token owns the box.
    size: buttonSize ?? launcher.closeButtonSize,
    iconSize,
    color: launcher.closeButtonColor,
    backgroundColor: launcher.closeButtonBackgroundColor,
    borderWidth: launcher.closeButtonBorderWidth,
    borderColor: launcher.closeButtonBorderColor,
    borderRadius: launcher.closeButtonBorderRadius,
    paddingX: launcher.closeButtonPaddingX,
    paddingY: launcher.closeButtonPaddingY,
    hidden: !showClose,
  });

  attachTooltip({
    anchor: button,
    trigger: wrapper,
    text: () => button.getAttribute("aria-label") ?? closeButtonTooltipText,
    enabled: closeButtonShowTooltip,
  });

  return { button, wrapper };
};

/**
 * Build the clear-chat (refresh) button + tooltip used in the panel header.
 *
 * The factory only handles construction. Wiring the click to the
 * clear-history handler is owned by `setupClearChatButton()` in `ui.ts`,
 * which keys off `panelElements.clearChatButton`.
 */
export const createClearChatButton = (
  config: AgentWidgetConfig | undefined,
  options: CreateClearChatButtonOptions = {},
): ClearChatButtonParts => {
  const {
    wrapperClassName = DEFAULT_CLEAR_CHAT_WRAPPER_CLASS,
    buttonSize,
    iconSize,
  } = options;

  const launcher = config?.launcher ?? {};
  const clearChatConfig = launcher.clearChat ?? {};
  const clearChatTooltipText = clearChatConfig.tooltipText ?? "Clear chat";
  const clearChatShowTooltip = clearChatConfig.showTooltip ?? true;

  const { button, wrapper } = createHeaderIconButton({
    ariaLabel: clearChatTooltipText,
    iconName: clearChatConfig.iconName ?? "refresh-cw",
    wrapperClassName,
    // Call-site `buttonSize` wins over `launcher.clearChat.size`; both unset
    // means the header control-size token owns the box.
    size: buttonSize ?? clearChatConfig.size,
    iconSize,
    color: clearChatConfig.iconColor,
    backgroundColor: clearChatConfig.backgroundColor,
    borderWidth: clearChatConfig.borderWidth,
    borderColor: clearChatConfig.borderColor,
    borderRadius: clearChatConfig.borderRadius,
    paddingX: clearChatConfig.paddingX,
    paddingY: clearChatConfig.paddingY,
  });

  attachTooltip({
    anchor: button,
    trigger: wrapper,
    text: () => button.getAttribute("aria-label") ?? clearChatTooltipText,
    enabled: clearChatShowTooltip,
  });

  return { button, wrapper };
};
