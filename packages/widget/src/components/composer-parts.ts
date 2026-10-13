import { applyControlPadding, applyControlSize, controlToken, legacyControlValue } from "./control-styles";
import { applyStatusIndicatorState } from "../utils/status-indicator";
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

/**
 * Forward theme vars onto a portaled menu panel, which lives outside the
 * themed mount. The panel is reused across opens, so an unset var must clear
 * any previously stamped value for the stylesheet fallback to paint again.
 */
export const forwardMenuTokens = (
  from: HTMLElement,
  to: HTMLElement,
  names: readonly string[]
): void => {
  const view = from.ownerDocument?.defaultView;
  if (!view) return;
  const computed = view.getComputedStyle(from);
  for (const name of names) {
    const value = computed.getPropertyValue(name).trim();
    if (value) to.style.setProperty(name, value);
    else to.style.removeProperty(name);
  }
};

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

const sendButtonConfigs = new WeakMap<HTMLButtonElement, AgentWidgetConfig | undefined>();

/** Submit styling and glyph rendering shared by mount, update, and stop flips. */
export const applySendButtonStyle = (
  button: HTMLButtonElement,
  config?: AgentWidgetConfig,
  renderContent = true,
): void => {
  sendButtonConfigs.set(button, config);
  const send = config?.sendButton ?? {};
  const useIcon = send.useIcon ?? false;
  const mode = button.getAttribute("data-persona-send-mode") === "stop" ? "stop" : "send";
  const legacy = (key: string) => legacyControlValue(config, `sendButton.${key}`);
  const token = (key: string, fallback: string) => controlToken(config, "composer.send", key, fallback);
  const size = legacy("size") || send.size;
  button.style.fontSize = useIcon ? "18px" : "";
  button.style.lineHeight = useIcon ? "1" : "";
  button.className = cx(
    "persona-rounded-button disabled:persona-opacity-50 persona-cursor-pointer",
    useIcon ? `persona-flex persona-items-center persona-justify-center ${COMPOSER_CONTROL_CLASS}`
      : "persona-bg-persona-accent persona-px-4 persona-py-2 persona-text-sm persona-font-semibold",
    useIcon && !legacy("backgroundColor") && "persona-bg-persona-primary",
    !useIcon && !legacy("textColor") && "persona-text-white",
  );
  applyControlSize(button, useIcon ? size || (token("size", "") ? token("size", "var(--persona-composer-control-size, 40px)") : "") : "", useIcon ? size : undefined);
  const foreground = token("foreground", useIcon
    ? "var(--persona-send-button-fg, var(--persona-button-primary-fg, #ffffff))" : "#ffffff");
  const background = token("background", useIcon
    ? "var(--persona-button-primary-bg, var(--persona-primary, #111827))" : "var(--persona-accent, #0f0f0f)");
  button.style.color = legacy("textColor") || (mode === "stop" && token("foreground", "")
    ? `var(--persona-button-stop-fg, ${foreground})`
    : token("foreground", "") || (useIcon ? foreground : ""));
  button.style.backgroundColor = (useIcon ? legacy("backgroundColor") : undefined)
    || (token("background", "") ? (mode === "stop" ? `var(--persona-button-stop-bg, ${background})` : background) : "");
  const width = legacy("borderWidth") || (token("borderWidth", "") ? token("borderWidth", send.borderWidth || "0px") : send.borderWidth || "");
  button.style.borderWidth = width;
  button.style.borderStyle = width ? "solid" : "";
  button.style.borderColor = legacy("borderColor") || (token("borderColor", "") ? token("borderColor", send.borderColor || "transparent") : send.borderColor || "");
  button.style.borderRadius = token("borderRadius", "") ? token("borderRadius", "var(--persona-components-composer-sendButtonRadius, var(--persona-button-radius))") : "";
  applyControlPadding(button, token("padding", useIcon ? "0" : "8px 16px"),
    useIcon ? undefined : legacy("paddingX") || (token("padding", "") ? undefined : send.paddingX),
    useIcon ? undefined : legacy("paddingY") || (token("padding", "") ? undefined : send.paddingY));
  const iconSize = parseFloat(send.iconSize ?? "") || Math.round((parseFloat(send.size ?? "") || COMPOSER_CONTROL_FALLBACK_PX) * 0.5);
  if (renderContent) {
    button.replaceChildren();
    if (useIcon) {
      const iconStroke = send.iconStrokeWidth ?? 2;
      const sendIcon = send.iconName ? renderLucideIcon(send.iconName, iconSize, "currentColor", iconStroke) : null;
      const stopIcon = renderLucideIcon(send.stopIconName ?? "square", iconSize, "currentColor", iconStroke);
      if (sendIcon && stopIcon) button.appendChild(buildSendGlyphStack(sendIcon, stopIcon, mode));
      else if (sendIcon) button.appendChild(sendIcon);
      else button.textContent = send.iconText ?? "↑";
    } else button.textContent = mode === "stop" ? config?.copy?.stopButtonLabel ?? "Stop" : config?.copy?.sendButtonLabel ?? "Send";
  }
  for (const svg of Array.from(button.querySelectorAll("svg"))) {
    svg.style.width = svg.style.height = legacy("iconSize") ? "" : token("iconSize", `var(--persona-components-composer-sendIconSize, ${iconSize}px)`);
    const explicitStroke = config?.sendButton?.iconStrokeWidth;
    svg.style.strokeWidth = explicitStroke !== undefined ? String(explicitStroke) : token("iconStrokeWidth", "");
  }
};

export const createSendButton = (config?: AgentWidgetConfig): SendButtonParts => {
  const send = config?.sendButton;
  const wrapper = createElement("div", "persona-send-button-wrapper");
  const button = createNode("button", {
    attrs: { type: "submit", "data-persona-composer-submit": "", "data-persona-send-mode": "send" },
  });
  applySendButtonStyle(button, config);
  button.setAttribute("aria-label", send?.tooltipText ?? "Send message");
  wrapper.appendChild(button);
  attachTooltip({ anchor: button, trigger: wrapper, text: () => button.getAttribute("aria-label") ?? "", enabled: send?.showTooltip ?? false });
  const glyphStack = button.querySelector<HTMLElement>(SEND_GLYPH_STACK_SELECTOR);
  const setMode = (mode: "send" | "stop") => {
    if (button.getAttribute("data-persona-send-mode") === mode) return;
    button.setAttribute("data-persona-send-mode", mode);
    button.setAttribute("aria-label", mode === "stop" ? send?.stopTooltipText ?? "Stop generating" : send?.tooltipText ?? "Send message");
    const currentConfig = sendButtonConfigs.get(button);
    applySendButtonStyle(button, currentConfig, false);
    button.querySelector(SEND_GLYPH_STACK_SELECTOR)?.setAttribute("data-mode", mode);
    if (!(currentConfig?.sendButton?.useIcon ?? false)) button.textContent = mode === "stop" ? currentConfig?.copy?.stopButtonLabel ?? "Stop" : currentConfig?.copy?.sendButtonLabel ?? "Send";
  };
  return { button, wrapper, setMode, glyphStack };
};

export type MicControlState = "idle" | "recording" | "processing" | "speaking";

/** One recipe for browser dictation and provider-driven states; reads current config on restoration. */
export const applyMicButtonStyle = (
  button: HTMLButtonElement,
  config?: AgentWidgetConfig,
  state: MicControlState = "idle",
  interruptionMode: "none" | "cancel" | "barge-in" = "none",
): void => {
  const voice = config?.voiceRecognition ?? {};
  const legacy = (key: string) => legacyControlValue(config, `voiceRecognition.${key}`);
  const token = (key: string, fallback: string) => controlToken(config, "voice.control", key, fallback);
  const size = legacy("iconSize") || voice.iconSize;
  applyControlSize(button, size || (token("size", "") ? token("size", "var(--persona-composer-control-size, 40px)") : ""), size);
  button.classList.add(COMPOSER_CONTROL_CLASS);
  button.classList.toggle(COMPOSER_CONTROL_GLYPH_CLASS, !size && !token("size", ""));
  button.style.fontSize = "18px";
  button.style.lineHeight = "1";
  const idleColor = legacy("iconColor") || legacyControlValue(config, "sendButton.textColor") || token("foreground", "var(--persona-text, #111827)");
  const idleBackground = legacy("backgroundColor") || legacyControlValue(config, "sendButton.backgroundColor") || token("background", voice.backgroundColor || "transparent");
  const idleBorder = legacy("borderColor") || token("borderColor", voice.borderColor || "transparent");
  const width = legacy("borderWidth") || token("borderWidth", voice.borderWidth || "");
  button.style.borderWidth = width;
  button.style.borderStyle = width ? "solid" : "";
  button.style.borderRadius = token("borderRadius", "") ? token("borderRadius", "var(--persona-button-radius)") : "";
  applyControlPadding(button, token("padding", "") ? token("padding", "0px") : "", legacy("paddingX") || (token("padding", "") ? undefined : voice.paddingX), legacy("paddingY") || (token("padding", "") ? undefined : voice.paddingY));
  const recordingBackground = legacy("recordingBackgroundColor") || "var(--persona-voice-recording-bg, #ef4444)";
  const recordingColor = legacy("recordingIconColor") || "var(--persona-voice-recording-indicator, #ffffff)";
  const recordingBorder = legacy("recordingBorderColor") || `var(--persona-consumer-voice-recording-border, ${voice.recordingBorderColor || idleBorder})`;
  let color = idleColor;
  let background = idleBackground;
  let border = idleBorder;
  let icon = voice.iconName ?? "mic";
  if (state === "recording") {
    color = recordingColor; background = recordingBackground; border = recordingBorder;
  } else if (state === "processing") {
    color = legacy("processingIconColor") || `var(--persona-consumer-voice-processing-icon, ${idleColor})`;
    background = legacy("processingBackgroundColor") || `var(--persona-consumer-voice-processing-background, ${idleBackground})`;
    border = legacy("processingBorderColor") || `var(--persona-components-voice-processing-border, ${idleBorder})`;
    icon = voice.processingIconName ?? "loader";
  } else if (state === "speaking") {
    const bargeIn = interruptionMode === "barge-in";
    // A barge-in mic historically uses recording fill/border, but its idle
    // foreground unless the host explicitly supplied a recording foreground.
    color = legacy("speakingIconColor") || `var(--persona-consumer-voice-speaking-icon, ${bargeIn ? legacy("recordingIconColor") || idleColor : idleColor})`;
    background = legacy("speakingBackgroundColor") || `var(--persona-components-voice-speaking-background, ${bargeIn ? recordingBackground : idleBackground})`;
    border = legacy("speakingBorderColor") || `var(--persona-components-voice-speaking-border, ${bargeIn ? recordingBorder : idleBorder})`;
    icon = voice.speakingIconName ?? (interruptionMode === "cancel" ? "square" : bargeIn ? "mic" : "volume-2");
  }
  button.style.color = color;
  button.style.backgroundColor = background;
  button.style.borderColor = border;
  button.setAttribute("data-state", state);
  const iconSize = parseFloat(voice.iconSize ?? "") || COMPOSER_CONTROL_ICON_FALLBACK_PX;
  const svg = renderLucideIcon(icon, iconSize, "currentColor", 1.5);
  button.replaceChildren();
  if (svg) {
    const glyphSize = size || (token("iconSize", "") ? token("iconSize", "var(--persona-composer-control-icon-size, 24px)") : "");
    svg.style.width = svg.style.height = glyphSize;
    if (!size && token("iconSize", "")) svg.style.flexBasis = glyphSize;
    svg.style.strokeWidth = token("iconStrokeWidth", "1.5");
    button.appendChild(svg);
  } else button.textContent = "🎤";
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
  if (!voiceRecognitionEnabled || voiceRecognitionConfig.showButton === false) return null;

  const hasSpeechRecognition =
    typeof window !== "undefined" &&
    (typeof (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition !== "undefined" ||
      typeof (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition !== "undefined");
  const hasRuntypeProvider = voiceRecognitionConfig.provider?.type === "runtype";
  // Bring-your-own (`custom`) providers own their input pipeline, so the mic
  // renders regardless of Web Speech support (matches the runtime builder).
  const hasCustomProvider = voiceRecognitionConfig.provider?.type === "custom" || voiceRecognitionConfig.dictation?.provider?.type === "custom";
  const hasVoiceInput = hasSpeechRecognition || hasRuntypeProvider || hasCustomProvider;
  if (!hasVoiceInput) return null;

  const wrapper = createElement("div", "persona-send-button-wrapper");
  const button = createNode("button", {
    className: "persona-rounded-button persona-flex persona-items-center persona-justify-center disabled:persona-opacity-50 persona-cursor-pointer persona-composer-control",
    attrs: {
      type: "button",
      "data-persona-composer-mic": "",
      // Animatable state, kept in sync by ui.ts; CSS keys motion off it.
      "data-state": "idle",
      "aria-label": voiceRecognitionConfig.tooltipText ?? "Start voice recognition",
    },
  });
  applyMicButtonStyle(button, config);

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

  applyStatusIndicatorState(statusText, statusConfig, "idle");
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
