import { createElement, createNode, cx } from "../utils/dom";
import { renderLucideIcon } from "../utils/icons";
import { AgentWidgetConfig } from "../types";
import { DEFAULT_INPUT_PLACEHOLDER } from "../defaults";
import { ALL_SUPPORTED_MIME_TYPES } from "../utils/content";
import { attachTooltip } from "../utils/tooltip";
import {
  DEFAULT_COMPOSER_MAX_LINES,
  FALLBACK_LINE_HEIGHT,
  applyComposerEnterKeyHint,
  applyComposerInputAttributes,
  isCoarsePointer,
  readLineHeightPx,
  resolveMaxLines,
} from "../utils/composer-input-config";

/**
 * Low-level composer control factories. Both `buildComposer` (full,
 * column-stacked card) and `buildPillComposer` (single-row pill) consume
 * these: the only meaningful difference between the two composers is the
 * layout shell + className. No DOM assembly here; each factory returns the
 * element plus any handles the caller needs.
 *
 * Stable selectors (data attributes + class hooks) live with the elements
 * so `bindComposerRefsFromFooter()` in ui.ts finds them regardless of
 * which builder ran.
 */

/**
 * Class hook for the shared composer control box. The stylesheet sizes it from
 * `--persona-composer-control-size` (theme `components.composer.controlSize`).
 */
export const COMPOSER_CONTROL_CLASS = "persona-composer-control";
/** Adds `--persona-composer-control-icon-size` sizing to the control's glyph. */
export const COMPOSER_CONTROL_GLYPH_CLASS = "persona-composer-control--glyph";
/**
 * Token default in CSS pixels. Only used to derive JS-computed glyph sizes when
 * a per-control size is unset; the box itself is owned by the stylesheet.
 */
export const COMPOSER_CONTROL_FALLBACK_PX = 40;
/** Icon-size token default in CSS pixels, for the same JS-derived cases. */
export const COMPOSER_CONTROL_ICON_FALLBACK_PX = 24;

export interface ComposerTextareaParts {
  textarea: HTMLTextAreaElement;
  /**
   * Wire the input listener that grows the textarea up to its current
   * `maxHeight`. Caller decides when to attach (full composer attaches
   * immediately; pill composer also attaches because expanded mode users
   * want multi-line composition).
   */
  attachAutoResize: () => void;
}

export interface ComposerTextareaOptions {
  /** Line cap when `composer.maxLines` is unset. */
  defaultMaxLines?: number;
}

export const createComposerTextarea = (
  config?: AgentWidgetConfig,
  options?: ComposerTextareaOptions
): ComposerTextareaParts => {
  const textarea = createElement("textarea") as HTMLTextAreaElement;
  textarea.setAttribute("data-persona-composer-input", "");
  // Must stay in sync with DEFAULT_WIDGET_CONFIG.copy.inputPlaceholder.
  textarea.placeholder = config?.copy?.inputPlaceholder ?? DEFAULT_INPUT_PLACEHOLDER;
  // Mixed-direction drafts resolve per paragraph instead of inheriting the host.
  textarea.dir = "auto";
  // The hint follows `composer.submitKey`; it is not always "send".
  applyComposerEnterKeyHint(textarea, {
    submitKey: config?.composer?.submitKey,
    insertNewlineOnTouchEnter: config?.composer?.insertNewlineOnTouchEnter,
    coarsePointer: isCoarsePointer(textarea),
  });
  applyComposerInputAttributes(textarea, config?.composer?.inputAttributes);
  textarea.className =
    "persona-w-full persona-min-h-[24px] persona-resize-none persona-border-none persona-bg-transparent persona-text-sm persona-text-persona-text focus:persona-outline-none focus:persona-border-none persona-composer-textarea";
  textarea.rows = 1;

  textarea.style.fontFamily =
    'var(--persona-input-font-family, var(--persona-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif))';
  textarea.style.fontWeight = "var(--persona-input-font-weight, var(--persona-font-weight, 400))";

  // Auto-resize: expand up to `composer.maxLines` rendered lines (3 for the
  // full composer, 5 for the pill). The closure honors whatever maxHeight is
  // set at the time of the input event, so a live update re-caps growth.
  const maxLines = resolveMaxLines(
    config?.composer?.maxLines,
    options?.defaultMaxLines ?? DEFAULT_COMPOSER_MAX_LINES
  );

  // Tracks the last maxHeight this module wrote, so a caller's post-construction
  // override is distinguishable from our own default and always wins.
  let managedMaxHeight = `${maxLines * FALLBACK_LINE_HEIGHT}px`;
  textarea.style.maxHeight = managedMaxHeight;
  textarea.style.overflowY = "auto";

  // Read maxHeight at event time so callers can change it after construction.
  // `theme.components.composer.lineHeight` can change the rendered line height,
  // so the line count is only correct when measured from the live element.
  const readMaxHeight = (): number => {
    const current = textarea.style.maxHeight;
    if (current !== managedMaxHeight) {
      const overridden = parseFloat(current);
      if (Number.isFinite(overridden) && overridden > 0) return overridden;
    }
    const derived = maxLines * readLineHeightPx(textarea);
    managedMaxHeight = `${derived}px`;
    textarea.style.maxHeight = managedMaxHeight;
    return derived;
  };

  const attachAutoResize = () => {
    textarea.addEventListener("input", () => {
      textarea.style.height = "auto";
      const newHeight = Math.min(textarea.scrollHeight, readMaxHeight());
      textarea.style.height = `${newHeight}px`;
    });
  };

  // Strip browser default focus rings: the composer wraps the textarea in
  // its own surface, so the textarea itself must be visually transparent.
  textarea.style.border = "none";
  textarea.style.outline = "none";
  textarea.style.borderWidth = "0";
  textarea.style.borderStyle = "none";
  textarea.style.borderColor = "transparent";
  textarea.addEventListener("focus", () => {
    textarea.style.border = "none";
    textarea.style.outline = "none";
    textarea.style.borderWidth = "0";
    textarea.style.borderStyle = "none";
    textarea.style.borderColor = "transparent";
    textarea.style.boxShadow = "none";
  });
  textarea.addEventListener("blur", () => {
    textarea.style.border = "none";
    textarea.style.outline = "none";
  });

  return { textarea, attachAutoResize };
};

export interface SendButtonParts {
  button: HTMLButtonElement;
  wrapper: HTMLElement;
  /**
   * Swap the button between its idle ("send") and streaming ("stop")
   * appearances. In icon mode this swaps the SVG; in text mode it swaps
   * the label. Tooltip text and aria-label update too.
   */
  setMode: (mode: "send" | "stop") => void;
  /**
   * The crossfade container in icon mode, when both glyphs rendered. Null in
   * text mode and when the send glyph fell back to `iconText`.
   */
  glyphStack: HTMLElement | null;
}

/** Marker for the send/stop crossfade container. */
export const SEND_GLYPH_STACK_SELECTOR = "[data-persona-glyph-stack]";

/**
 * Stack both send/stop glyphs in one grid cell. Shared by the builder and the
 * `controller.update()` restyle path so the two can never produce different
 * structures for the same button.
 */
export const buildSendGlyphStack = (
  sendIcon: SVGElement,
  stopIcon: SVGElement,
  mode: "send" | "stop" = "send"
): HTMLElement => {
  const stack = createNode("span", {
    className: "persona-composer-glyph-stack",
    attrs: { "data-mode": mode, "data-persona-glyph-stack": "" },
  });
  sendIcon.setAttribute("data-glyph", "send");
  stopIcon.setAttribute("data-glyph", "stop");
  stack.append(sendIcon, stopIcon);
  return stack;
};

export const createSendButton = (config?: AgentWidgetConfig): SendButtonParts => {
  const sendButtonConfig = config?.sendButton ?? {};
  const useIcon = sendButtonConfig.useIcon ?? false;
  const iconText = sendButtonConfig.iconText ?? "↑";
  const iconName = sendButtonConfig.iconName;
  const stopIconName = sendButtonConfig.stopIconName ?? "square";
  const tooltipText = sendButtonConfig.tooltipText ?? "Send message";
  const stopTooltipText = sendButtonConfig.stopTooltipText ?? "Stop generating";
  const sendLabel = config?.copy?.sendButtonLabel ?? "Send";
  const stopLabel = config?.copy?.stopButtonLabel ?? "Stop";
  const showTooltip = sendButtonConfig.showTooltip ?? false;
  // Unset means "follow --persona-composer-control-size"; only an explicit
  // `sendButton.size` writes an inline box that overrides the token.
  const buttonSize = sendButtonConfig.size;
  const buttonSizeNum = parseFloat(buttonSize ?? "") || COMPOSER_CONTROL_FALLBACK_PX;
  const backgroundColor = sendButtonConfig.backgroundColor;
  const textColor = sendButtonConfig.textColor;

  const wrapper = createElement("div", "persona-send-button-wrapper");

  const button = createNode("button", {
    className: cx(
      "persona-rounded-button disabled:persona-opacity-50 persona-cursor-pointer",
      useIcon
        ? `persona-flex persona-items-center persona-justify-center ${COMPOSER_CONTROL_CLASS}`
        : "persona-bg-persona-accent persona-px-4 persona-py-2 persona-text-sm persona-font-semibold",
      // Icon mode without an explicit background falls back to the primary bg
      // class; text mode without an explicit color falls back to white text.
      useIcon && !backgroundColor && "persona-bg-persona-primary",
      !useIcon && !textColor && "persona-text-white"
    ),
    // `data-persona-send-mode` is the stop-state styling hook; widget.css keys
    // `components.button.stop.*` off it in both icon and text modes.
    attrs: {
      type: "submit",
      "data-persona-composer-submit": "",
      "data-persona-send-mode": "send",
    },
    style: {
      // Sizing is icon-mode-only (text mode is sized by its padding classes),
      // and only when `sendButton.size` is set: otherwise the control-size
      // token drives the box from the stylesheet.
      width: useIcon ? buttonSize : undefined,
      height: useIcon ? buttonSize : undefined,
      minWidth: useIcon ? buttonSize : undefined,
      minHeight: useIcon ? buttonSize : undefined,
      fontSize: useIcon ? "18px" : undefined,
      lineHeight: useIcon ? "1" : undefined,
      // Icon mode always sets a color; text mode only when textColor is given.
      // The `--persona-send-button-fg` hop is what lets the stop-state rule
      // recolor an inline-styled glyph.
      color: useIcon
        ? textColor ||
          "var(--persona-send-button-fg, var(--persona-button-primary-fg, #ffffff))"
        : textColor || undefined,
      // backgroundColor is honored in icon mode only.
      backgroundColor: useIcon ? backgroundColor || undefined : undefined,
      borderWidth: sendButtonConfig.borderWidth || undefined,
      borderStyle: sendButtonConfig.borderWidth ? "solid" : undefined,
      borderColor: sendButtonConfig.borderColor || undefined,
      // Padding is text-mode-only: icon mode is a fixed `size` box with the
      // glyph drawn at that size, so padding just crushes the SVG (the
      // always-present defaults squeezed a 40px glyph into 16x20).
      paddingLeft: useIcon ? "0" : sendButtonConfig.paddingX || undefined,
      paddingRight: useIcon ? "0" : sendButtonConfig.paddingX || undefined,
      paddingTop: useIcon ? "0" : sendButtonConfig.paddingY || undefined,
      paddingBottom: useIcon ? "0" : sendButtonConfig.paddingY || undefined,
    },
  });

  // Both icons are pre-rendered AND both stay mounted, stacked in one grid
  // cell and crossfaded by `data-mode`. Only icon mode stacks: text mode swaps
  // its label, which has nothing to crossfade.
  let sendIcon: SVGElement | null = null;
  let stopIcon: SVGElement | null = null;
  let glyphStack: HTMLElement | null = null;

  if (useIcon) {
    // Default glyph box is half the button, the closest clean ratio to the
    // pre-fix live rendering (a 40px glyph crushed to a ~16px content box).
    // Dense glyphs like the default "send" plane fill most of their viewBox;
    // sparse ones (arrow-up) may want a larger explicit `iconSize`.
    const iconSize =
      parseFloat(sendButtonConfig.iconSize ?? "") ||
      Math.round(buttonSizeNum * 0.5);
    const iconStroke = sendButtonConfig.iconStrokeWidth ?? 2;
    const iconColor = textColor?.trim() || "currentColor";

    if (iconName) {
      sendIcon = renderLucideIcon(iconName, iconSize, iconColor, iconStroke);
    }
    stopIcon = renderLucideIcon(stopIconName, iconSize, iconColor, iconStroke);

    if (sendIcon && stopIcon) {
      // One grid cell, both glyphs in it. `data-mode` on the stack decides
      // which is opaque, so exactly one is ever visible and no swap can leave
      // two mounted glyphs behind.
      glyphStack = buildSendGlyphStack(sendIcon, stopIcon);
      button.appendChild(glyphStack);
    } else if (sendIcon) {
      button.appendChild(sendIcon);
    } else {
      // No renderable send glyph: fall back to the text token, and drop the
      // stop glyph too so the button never renders an orphan square.
      button.textContent = iconText;
      stopIcon = null;
    }
  } else {
    button.textContent = sendLabel;
  }

  button.setAttribute("aria-label", tooltipText);
  wrapper.appendChild(button);
  attachTooltip({
    anchor: button,
    trigger: wrapper,
    text: () => button.getAttribute("aria-label") ?? "",
    enabled: showTooltip,
  });

  let currentMode: "send" | "stop" = "send";
  const setMode = (mode: "send" | "stop") => {
    if (mode === currentMode) return;
    currentMode = mode;
    const label = mode === "stop" ? stopTooltipText : tooltipText;
    button.setAttribute("aria-label", label);
    button.setAttribute("data-persona-send-mode", mode);

    if (useIcon) {
      // One attribute write, no DOM swap. This is also what retired the
      // double-icon bug class: neither glyph is ever added or removed, so no
      // re-render or morph can leave both of them mounted and visible.
      //
      // Resolved from the DOM, not from the captured reference: the live
      // restyle path in ui.ts can rebuild the stack, which would detach the
      // node this closure captured at mount.
      const live =
        button.querySelector<HTMLElement>(SEND_GLYPH_STACK_SELECTOR) ?? glyphStack;
      live?.setAttribute("data-mode", mode);
    } else {
      button.textContent = mode === "stop" ? stopLabel : sendLabel;
    }
  };

  return { button, wrapper, setMode, glyphStack };
};

export interface MicButtonParts {
  button: HTMLButtonElement;
  wrapper: HTMLElement;
}

/**
 * Returns null when voice recognition is disabled or the browser doesn't
 * support the Web Speech API and no Runtype/custom voice provider is
 * configured.
 */
export const createMicButton = (config?: AgentWidgetConfig): MicButtonParts | null => {
  const voiceRecognitionConfig = config?.voiceRecognition ?? {};
  const voiceRecognitionEnabled = voiceRecognitionConfig.enabled === true;
  if (!voiceRecognitionEnabled) return null;

  const hasSpeechRecognition =
    typeof window !== "undefined" &&
    (typeof (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition !== "undefined" ||
      typeof (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition !== "undefined");
  const hasRuntypeProvider = voiceRecognitionConfig.provider?.type === "runtype";
  // Bring-your-own (`custom`) providers own their input pipeline, so the mic
  // renders regardless of Web Speech support (matches the runtime builder).
  const hasCustomProvider = voiceRecognitionConfig.provider?.type === "custom";
  const hasVoiceInput = hasSpeechRecognition || hasRuntypeProvider || hasCustomProvider;
  if (!hasVoiceInput) return null;

  const micIconName = voiceRecognitionConfig.iconName ?? "mic";
  // `voiceRecognition.iconSize` is the mic's per-control size override; unset
  // means the shared control-size token owns the box.
  const micIconSize = voiceRecognitionConfig.iconSize;
  const micIconSizeNum =
    parseFloat(micIconSize ?? "") || COMPOSER_CONTROL_ICON_FALLBACK_PX;
  const micBackgroundColor =
    voiceRecognitionConfig.backgroundColor ?? config?.sendButton?.backgroundColor;
  const micIconColor = voiceRecognitionConfig.iconColor ?? config?.sendButton?.textColor;

  const wrapper = createElement("div", "persona-send-button-wrapper");
  const button = createNode("button", {
    className: cx(
      "persona-rounded-button persona-flex persona-items-center persona-justify-center disabled:persona-opacity-50 persona-cursor-pointer",
      COMPOSER_CONTROL_CLASS,
      // An explicit `iconSize` sized both box and glyph before the token
      // existed; keep that by opting the glyph out of the icon-size token.
      !micIconSize && COMPOSER_CONTROL_GLYPH_CLASS
    ),
    attrs: {
      type: "button",
      "data-persona-composer-mic": "",
      // Animatable state, kept in sync by ui.ts; CSS keys motion off it.
      "data-state": "idle",
      "aria-label": voiceRecognitionConfig.tooltipText ?? "Start voice recognition",
    },
    style: {
      // Inline only when explicitly configured; padding keys stay overrides on
      // top of whichever box wins.
      width: micIconSize,
      height: micIconSize,
      minWidth: micIconSize,
      minHeight: micIconSize,
      fontSize: "18px",
      lineHeight: "1",
      color: micIconColor || "var(--persona-text, #111827)",
      backgroundColor: micBackgroundColor || undefined,
      borderWidth: voiceRecognitionConfig.borderWidth || undefined,
      borderStyle: voiceRecognitionConfig.borderWidth ? "solid" : undefined,
      borderColor: voiceRecognitionConfig.borderColor || undefined,
      paddingLeft: voiceRecognitionConfig.paddingX || undefined,
      paddingRight: voiceRecognitionConfig.paddingX || undefined,
      paddingTop: voiceRecognitionConfig.paddingY || undefined,
      paddingBottom: voiceRecognitionConfig.paddingY || undefined,
    },
  });

  const iconColorValue = micIconColor || "currentColor";
  const micIconSvg = renderLucideIcon(micIconName, micIconSizeNum, iconColorValue, 1.5);
  if (micIconSvg) {
    button.appendChild(micIconSvg);
  } else {
    button.textContent = "🎤";
  }

  wrapper.appendChild(button);

  const micTooltipText = voiceRecognitionConfig.tooltipText ?? "Start voice recognition";
  const showMicTooltip = voiceRecognitionConfig.showTooltip ?? false;
  attachTooltip({
    anchor: button,
    trigger: wrapper,
    text: () => button.getAttribute("aria-label") ?? micTooltipText,
    enabled: showMicTooltip,
  });

  return { button, wrapper };
};

export interface AttachmentControlParts {
  button: HTMLButtonElement;
  wrapper: HTMLElement;
  input: HTMLInputElement;
  previewsContainer: HTMLElement;
}

/**
 * Returns null when attachments are disabled. Caller decides where to
 * place the previewsContainer (full composer puts it inside the form
 * above the textarea; pill composer floats it above the pill in a
 * separate row).
 */
export const createAttachmentControls = (config?: AgentWidgetConfig): AttachmentControlParts | null => {
  const attachmentsConfig = config?.attachments ?? {};
  if (attachmentsConfig.enabled !== true) return null;

  const previewsContainer = createElement(
    "div",
    "persona-attachment-previews persona-flex persona-flex-wrap persona-gap-2 persona-mb-2"
  );
  previewsContainer.setAttribute("data-persona-composer-attachment-previews", "");
  previewsContainer.style.display = "none";

  const input = createElement("input") as HTMLInputElement;
  input.type = "file";
  input.setAttribute("data-persona-composer-attachment-input", "");
  input.accept = (attachmentsConfig.allowedTypes ?? ALL_SUPPORTED_MIME_TYPES).join(",");
  input.multiple = (attachmentsConfig.maxFiles ?? 4) > 1;
  input.style.display = "none";
  input.setAttribute("aria-label", "Attach files");

  const attachIconName = attachmentsConfig.buttonIconName ?? "paperclip";

  const wrapper = createElement("div", "persona-send-button-wrapper");
  const button = createNode("button", {
    className: `persona-rounded-button persona-flex persona-items-center persona-justify-center disabled:persona-opacity-50 persona-cursor-pointer persona-attachment-button ${COMPOSER_CONTROL_CLASS} ${COMPOSER_CONTROL_GLYPH_CLASS}`,
    attrs: {
      type: "button",
      "data-persona-composer-attachment-button": "",
      "aria-label": attachmentsConfig.buttonTooltipText ?? "Attach file",
    },
    style: {
      // Appearance is themed from the CSS rule for `.persona-attachment-button`
      // via the `--persona-button-ghost-*` tokens (components.button.ghost);
      // the box comes from `--persona-composer-control-size`. Nothing here is
      // config-driven, so nothing sizing-related stays inline.
      fontSize: "18px",
      lineHeight: "1",
    },
  });

  const attachIconSvg = renderLucideIcon(
    attachIconName,
    COMPOSER_CONTROL_ICON_FALLBACK_PX,
    "currentColor",
    1.5
  );
  if (attachIconSvg) {
    button.appendChild(attachIconSvg);
  } else {
    button.textContent = "📎";
  }

  button.addEventListener("click", (e) => {
    e.preventDefault();
    input.click();
  });

  wrapper.appendChild(button);

  const attachTooltipText = attachmentsConfig.buttonTooltipText ?? "Attach file";
  attachTooltip({
    anchor: button,
    trigger: wrapper,
    text: () => button.getAttribute("aria-label") ?? attachTooltipText,
  });

  return { button, wrapper, input, previewsContainer };
};

export const createStatusText = (config?: AgentWidgetConfig): HTMLElement => {
  const statusConfig = config?.statusIndicator ?? {};
  const alignClass =
    statusConfig.align === "left"
      ? "persona-text-left"
      : statusConfig.align === "center"
        ? "persona-text-center"
        : "persona-text-right";
  const statusText = createElement(
    "div",
    `persona-mt-2 ${alignClass} persona-text-xs persona-text-persona-muted`
  );
  statusText.setAttribute("data-persona-composer-status", "");

  const isVisible = statusConfig.visible ?? true;
  statusText.style.display = isVisible ? "" : "none";
  const idleLabel = statusConfig.idleText ?? "Online";
  if (statusConfig.idleLink) {
    const link = createElement("a") as HTMLAnchorElement;
    link.href = statusConfig.idleLink;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = idleLabel;
    link.style.color = "inherit";
    link.style.textDecoration = "none";
    statusText.appendChild(link);
  } else {
    statusText.textContent = idleLabel;
  }

  return statusText;
};

export const createSuggestionsRow = (): HTMLElement =>
  createNode("div", {
    className: "persona-mb-3 persona-flex persona-flex-wrap persona-gap-2",
    attrs: { "data-persona-composer-suggestions": "" },
  });
