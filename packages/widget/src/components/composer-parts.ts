import { createElement, createNode } from "../utils/dom";
import { renderLucideIcon } from "../utils/icons";
import { AgentWidgetConfig } from "../types";
import { ALL_SUPPORTED_MIME_TYPES } from "../utils/content";

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

export const createComposerTextarea = (config?: AgentWidgetConfig): ComposerTextareaParts => {
  const textarea = createElement("textarea") as HTMLTextAreaElement;
  textarea.setAttribute("data-persona-composer-input", "");
  textarea.placeholder = config?.copy?.inputPlaceholder ?? "Type your message…";
  textarea.className =
    "persona-w-full persona-min-h-[24px] persona-resize-none persona-border-none persona-bg-transparent persona-text-sm persona-text-persona-primary focus:persona-outline-none focus:persona-border-none persona-composer-textarea";
  textarea.rows = 1;

  textarea.style.fontFamily =
    'var(--persona-input-font-family, var(--persona-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif))';
  textarea.style.fontWeight = "var(--persona-input-font-weight, var(--persona-font-weight, 400))";

  // Auto-resize: expand up to 3 lines for the full composer (line-height ~20px
  // for text-sm). The pill composer overrides this maxHeight after construction
  // (allowing more growth in expanded mode), and the closure below honors
  // whatever maxHeight is set at the time of the input event.
  const defaultMaxLines = 3;
  const lineHeight = 20;
  textarea.style.maxHeight = `${defaultMaxLines * lineHeight}px`;
  textarea.style.overflowY = "auto";

  // Read maxHeight at event time so callers can change it after construction.
  const readMaxHeight = (): number => {
    const parsed = parseFloat(textarea.style.maxHeight);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultMaxLines * lineHeight;
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
}

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
  const buttonSize = sendButtonConfig.size ?? "40px";
  const backgroundColor = sendButtonConfig.backgroundColor;
  const textColor = sendButtonConfig.textColor;

  const wrapper = createElement("div", "persona-send-button-wrapper");

  const button = createElement(
    "button",
    useIcon
      ? "persona-rounded-button persona-flex persona-items-center persona-justify-center disabled:persona-opacity-50 persona-cursor-pointer"
      : "persona-rounded-button persona-bg-persona-accent persona-px-4 persona-py-2 persona-text-sm persona-font-semibold disabled:persona-opacity-50 persona-cursor-pointer"
  ) as HTMLButtonElement;

  button.type = "submit";
  button.setAttribute("data-persona-composer-submit", "");

  // Both icons are pre-rendered so setMode can swap cheaply.
  let sendIcon: SVGElement | null = null;
  let stopIcon: SVGElement | null = null;

  if (useIcon) {
    button.style.width = buttonSize;
    button.style.height = buttonSize;
    button.style.minWidth = buttonSize;
    button.style.minHeight = buttonSize;
    button.style.fontSize = "18px";
    button.style.lineHeight = "1";

    button.innerHTML = "";

    if (textColor) {
      button.style.color = textColor;
    } else {
      button.style.color = "var(--persona-button-primary-fg, #ffffff)";
    }

    const iconSize = parseFloat(buttonSize) || 24;
    const iconColor = textColor?.trim() || "currentColor";

    if (iconName) {
      sendIcon = renderLucideIcon(iconName, iconSize, iconColor, 2);
      if (sendIcon) {
        button.appendChild(sendIcon);
      } else {
        button.textContent = iconText;
      }
    } else {
      button.textContent = iconText;
    }

    stopIcon = renderLucideIcon(stopIconName, iconSize, iconColor, 2);

    if (backgroundColor) {
      button.style.backgroundColor = backgroundColor;
    } else {
      button.classList.add("persona-bg-persona-primary");
    }
  } else {
    button.textContent = sendLabel;
    if (textColor) {
      button.style.color = textColor;
    } else {
      button.classList.add("persona-text-white");
    }
  }

  if (sendButtonConfig.borderWidth) {
    button.style.borderWidth = sendButtonConfig.borderWidth;
    button.style.borderStyle = "solid";
  }
  if (sendButtonConfig.borderColor) {
    button.style.borderColor = sendButtonConfig.borderColor;
  }

  if (sendButtonConfig.paddingX) {
    button.style.paddingLeft = sendButtonConfig.paddingX;
    button.style.paddingRight = sendButtonConfig.paddingX;
  } else {
    button.style.paddingLeft = "";
    button.style.paddingRight = "";
  }
  if (sendButtonConfig.paddingY) {
    button.style.paddingTop = sendButtonConfig.paddingY;
    button.style.paddingBottom = sendButtonConfig.paddingY;
  } else {
    button.style.paddingTop = "";
    button.style.paddingBottom = "";
  }

  let tooltip: HTMLElement | null = null;
  if (showTooltip && tooltipText) {
    tooltip = createElement("div", "persona-send-button-tooltip");
    tooltip.textContent = tooltipText;
    wrapper.appendChild(tooltip);
  }

  button.setAttribute("aria-label", tooltipText);
  wrapper.appendChild(button);

  let currentMode: "send" | "stop" = "send";
  const setMode = (mode: "send" | "stop") => {
    if (mode === currentMode) return;
    currentMode = mode;
    const label = mode === "stop" ? stopTooltipText : tooltipText;
    button.setAttribute("aria-label", label);
    if (tooltip) {
      tooltip.textContent = label;
    }

    if (useIcon) {
      if (sendIcon && stopIcon) {
        const next = mode === "stop" ? stopIcon : sendIcon;
        // Replace whatever icon is currently mounted: the button only ever
        // holds the single active icon. We use replaceChildren(next) rather
        // than replaceChild(next, prev) against a captured `prev` reference:
        // an external re-render/morph can swap the live icon child out from
        // under us, detaching our captured node so `prev.parentNode !== button`.
        // The old appendChild fallback then left BOTH icons mounted, which is
        // how the send button ended up showing two stacked arrows after the
        // first send→stop→send cycle.
        button.replaceChildren(next);
      }
    } else {
      button.textContent = mode === "stop" ? stopLabel : sendLabel;
    }
  };

  return { button, wrapper, setMode };
};

export interface MicButtonParts {
  button: HTMLButtonElement;
  wrapper: HTMLElement;
}

/**
 * Returns null when voice recognition is disabled or the browser doesn't
 * support either the Web Speech API or a Runtype voice provider.
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
  const hasVoiceInput = hasSpeechRecognition || hasRuntypeProvider;
  if (!hasVoiceInput) return null;

  const buttonSize = config?.sendButton?.size ?? "40px";
  const wrapper = createElement("div", "persona-send-button-wrapper");
  const button = createElement(
    "button",
    "persona-rounded-button persona-flex persona-items-center persona-justify-center disabled:persona-opacity-50 persona-cursor-pointer"
  ) as HTMLButtonElement;

  button.type = "button";
  button.setAttribute("data-persona-composer-mic", "");
  button.setAttribute("aria-label", "Start voice recognition");

  const micIconName = voiceRecognitionConfig.iconName ?? "mic";
  const micIconSize = voiceRecognitionConfig.iconSize ?? buttonSize;
  const micIconSizeNum = parseFloat(micIconSize) || 24;

  const micBackgroundColor =
    voiceRecognitionConfig.backgroundColor ?? config?.sendButton?.backgroundColor;
  const micIconColor = voiceRecognitionConfig.iconColor ?? config?.sendButton?.textColor;

  button.style.width = micIconSize;
  button.style.height = micIconSize;
  button.style.minWidth = micIconSize;
  button.style.minHeight = micIconSize;
  button.style.fontSize = "18px";
  button.style.lineHeight = "1";

  if (micIconColor) {
    button.style.color = micIconColor;
  } else {
    button.style.color = "var(--persona-text, #111827)";
  }

  const iconColorValue = micIconColor || "currentColor";
  const micIconSvg = renderLucideIcon(micIconName, micIconSizeNum, iconColorValue, 1.5);
  if (micIconSvg) {
    button.appendChild(micIconSvg);
  } else {
    button.textContent = "🎤";
  }

  if (micBackgroundColor) {
    button.style.backgroundColor = micBackgroundColor;
  }

  if (voiceRecognitionConfig.borderWidth) {
    button.style.borderWidth = voiceRecognitionConfig.borderWidth;
    button.style.borderStyle = "solid";
  }
  if (voiceRecognitionConfig.borderColor) {
    button.style.borderColor = voiceRecognitionConfig.borderColor;
  }

  if (voiceRecognitionConfig.paddingX) {
    button.style.paddingLeft = voiceRecognitionConfig.paddingX;
    button.style.paddingRight = voiceRecognitionConfig.paddingX;
  }
  if (voiceRecognitionConfig.paddingY) {
    button.style.paddingTop = voiceRecognitionConfig.paddingY;
    button.style.paddingBottom = voiceRecognitionConfig.paddingY;
  }

  wrapper.appendChild(button);

  const micTooltipText = voiceRecognitionConfig.tooltipText ?? "Start voice recognition";
  const showMicTooltip = voiceRecognitionConfig.showTooltip ?? false;
  if (showMicTooltip && micTooltipText) {
    const tooltip = createElement("div", "persona-send-button-tooltip");
    tooltip.textContent = micTooltipText;
    wrapper.appendChild(tooltip);
  }

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

  const buttonSize = config?.sendButton?.size ?? "40px";

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

  const wrapper = createElement("div", "persona-send-button-wrapper");
  const button = createElement(
    "button",
    "persona-rounded-button persona-flex persona-items-center persona-justify-center disabled:persona-opacity-50 persona-cursor-pointer persona-attachment-button"
  ) as HTMLButtonElement;
  button.type = "button";
  button.setAttribute("data-persona-composer-attachment-button", "");
  button.setAttribute("aria-label", attachmentsConfig.buttonTooltipText ?? "Attach file");

  const attachIconName = attachmentsConfig.buttonIconName ?? "paperclip";
  const attachIconSize = buttonSize;
  const buttonSizeNum = parseFloat(attachIconSize) || 40;
  const attachIconSizeNum = Math.round(buttonSizeNum * 0.6);

  button.style.width = attachIconSize;
  button.style.height = attachIconSize;
  button.style.minWidth = attachIconSize;
  button.style.minHeight = attachIconSize;
  button.style.fontSize = "18px";
  button.style.lineHeight = "1";
  button.style.backgroundColor = "transparent";
  button.style.color = "var(--persona-primary, #111827)";
  button.style.border = "none";
  button.style.borderRadius = "6px";
  button.style.transition = "background-color 0.15s ease";

  button.addEventListener("mouseenter", () => {
    button.style.backgroundColor = "var(--persona-palette-colors-black-alpha-50, rgba(0, 0, 0, 0.05))";
  });
  button.addEventListener("mouseleave", () => {
    button.style.backgroundColor = "transparent";
  });

  const attachIconSvg = renderLucideIcon(attachIconName, attachIconSizeNum, "currentColor", 1.5);
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
  const tooltip = createElement("div", "persona-send-button-tooltip");
  tooltip.textContent = attachTooltipText;
  wrapper.appendChild(tooltip);

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
