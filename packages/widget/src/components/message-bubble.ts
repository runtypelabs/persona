import { createElement } from "../utils/dom";
import {
  AgentWidgetMessage,
  AgentWidgetMessageLayoutConfig,
  AgentWidgetAvatarConfig,
  AgentWidgetTimestampConfig,
  AgentWidgetMessageActionsConfig,
  AgentWidgetMessageFeedback,
  LoadingIndicatorRenderContext,
  ImageContentPart
} from "../types";
import { renderLucideIcon } from "../utils/icons";
import { IMAGE_ONLY_MESSAGE_FALLBACK_TEXT } from "../utils/content";

export type LoadingIndicatorRenderer = (context: LoadingIndicatorRenderContext) => HTMLElement | null;

export type MessageTransform = (context: {
  text: string;
  message: AgentWidgetMessage;
  streaming: boolean;
  raw?: string;
}) => string;

export type MessageActionCallbacks = {
  onCopy?: (message: AgentWidgetMessage) => void;
  onFeedback?: (feedback: AgentWidgetMessageFeedback) => void;
};

const MESSAGE_IMAGE_PREVIEW_MAX_WIDTH_PX = 320;
const MESSAGE_IMAGE_PREVIEW_MAX_HEIGHT_PX = 320;

const getMessageImageParts = (message: AgentWidgetMessage): ImageContentPart[] => {
  if (!message.contentParts || message.contentParts.length === 0) {
    return [];
  }

  return message.contentParts.filter(
    (part): part is ImageContentPart =>
      part.type === "image" &&
      typeof part.image === "string" &&
      part.image.trim().length > 0
  );
};

const createMessageImagePreviews = (
  imageParts: ImageContentPart[],
  hasVisibleText: boolean,
  onPreviewFailed?: () => void
): HTMLElement | null => {
  if (imageParts.length === 0) return null;

  try {
    const container = createElement(
      "div",
      "persona-flex persona-flex-col persona-gap-2"
    );
    container.setAttribute("data-message-attachments", "images");
    if (hasVisibleText) {
      container.style.marginBottom = "8px";
    }

    let visiblePreviewCount = 0;
    let failureHandled = false;

    const handleTotalPreviewFailure = () => {
      if (failureHandled) return;
      failureHandled = true;
      container.remove();
      onPreviewFailed?.();
    };

    imageParts.forEach((imagePart, index) => {
      const imageElement = createElement("img") as HTMLImageElement;
      imageElement.alt = imagePart.alt?.trim() || `Attached image ${index + 1}`;
      imageElement.loading = "lazy";
      imageElement.decoding = "async";
      imageElement.referrerPolicy = "no-referrer";
      imageElement.style.display = "block";
      imageElement.style.width = "100%";
      imageElement.style.maxWidth = `${MESSAGE_IMAGE_PREVIEW_MAX_WIDTH_PX}px`;
      imageElement.style.maxHeight = `${MESSAGE_IMAGE_PREVIEW_MAX_HEIGHT_PX}px`;
      imageElement.style.height = "auto";
      imageElement.style.objectFit = "contain";
      imageElement.style.borderRadius = "10px";
      imageElement.style.backgroundColor = "var(--persona-attachment-image-bg, var(--persona-container, #f3f4f6))";
      imageElement.style.border = "1px solid var(--persona-attachment-image-border, var(--persona-border, #e5e7eb))";

      let settled = false;
      visiblePreviewCount += 1;
      imageElement.addEventListener("error", () => {
        if (settled) return;
        settled = true;
        visiblePreviewCount = Math.max(0, visiblePreviewCount - 1);
        imageElement.remove();
        if (visiblePreviewCount === 0) {
          handleTotalPreviewFailure();
        }
      });
      imageElement.addEventListener("load", () => {
        settled = true;
      });

      imageElement.src = imagePart.image;
      container.appendChild(imageElement);
    });

    if (visiblePreviewCount === 0) {
      handleTotalPreviewFailure();
      return null;
    }

    return container;
  } catch {
    onPreviewFailed?.();
    return null;
  }
};

// Create typing indicator element
export const createTypingIndicator = (): HTMLElement => {
  const container = document.createElement("div");
  container.className = "persona-flex persona-items-center persona-space-x-1 persona-h-5 persona-mt-2";

  const dot1 = document.createElement("div");
  dot1.className = "persona-bg-persona-primary persona-animate-typing persona-rounded-full persona-h-1.5 persona-w-1.5";
  dot1.style.animationDelay = "0ms";

  const dot2 = document.createElement("div");
  dot2.className = "persona-bg-persona-primary persona-animate-typing persona-rounded-full persona-h-1.5 persona-w-1.5";
  dot2.style.animationDelay = "250ms";

  const dot3 = document.createElement("div");
  dot3.className = "persona-bg-persona-primary persona-animate-typing persona-rounded-full persona-h-1.5 persona-w-1.5";
  dot3.style.animationDelay = "500ms";

  const srOnly = document.createElement("span");
  srOnly.className = "persona-sr-only";
  srOnly.textContent = "Loading";

  container.appendChild(dot1);
  container.appendChild(dot2);
  container.appendChild(dot3);
  container.appendChild(srOnly);

  return container;
};

/**
 * Render loading indicator with fallback chain:
 * 1. Custom renderer (if provided and returns non-null)
 * 2. Default typing indicator
 */
export const renderLoadingIndicatorWithFallback = (
  location: 'inline' | 'standalone',
  customRenderer?: LoadingIndicatorRenderer,
  widgetConfig?: import("../types").AgentWidgetConfig
): HTMLElement | null => {
  const context: LoadingIndicatorRenderContext = {
    config: widgetConfig ?? ({} as import("../types").AgentWidgetConfig),
    streaming: true,
    location,
    defaultRenderer: createTypingIndicator
  };

  // Try custom renderer first
  if (customRenderer) {
    const result = customRenderer(context);
    if (result !== null) {
      return result;
    }
  }

  // Fall back to default
  return createTypingIndicator();
};

/**
 * Create an avatar element
 */
const createAvatar = (
  avatarConfig: AgentWidgetAvatarConfig,
  role: "user" | "assistant"
): HTMLElement => {
  const avatar = createElement(
    "div",
    "persona-flex-shrink-0 persona-w-8 persona-h-8 persona-rounded-full persona-flex persona-items-center persona-justify-center persona-text-sm"
  );

  const avatarContent = role === "user" 
    ? avatarConfig.userAvatar 
    : avatarConfig.assistantAvatar;

  if (avatarContent) {
    // Check if it's a URL or emoji/text
    if (avatarContent.startsWith("http") || avatarContent.startsWith("/") || avatarContent.startsWith("data:")) {
      const img = createElement("img") as HTMLImageElement;
      img.src = avatarContent;
      img.alt = role === "user" ? "User" : "Assistant";
      img.className = "persona-w-full persona-h-full persona-rounded-full persona-object-cover";
      avatar.appendChild(img);
    } else {
      // Emoji or text
      avatar.textContent = avatarContent;
      avatar.classList.add(
        role === "user" ? "persona-bg-persona-accent" : "persona-bg-persona-primary",
        "persona-text-white"
      );
    }
  } else {
    // Default avatar
    avatar.textContent = role === "user" ? "U" : "A";
    avatar.classList.add(
      role === "user" ? "persona-bg-persona-accent" : "persona-bg-persona-primary",
      "persona-text-white"
    );
  }

  return avatar;
};

/**
 * Create a timestamp element
 */
const createTimestamp = (
  message: AgentWidgetMessage,
  timestampConfig: AgentWidgetTimestampConfig
): HTMLElement => {
  const timestamp = createElement(
    "div",
    "persona-text-xs persona-text-persona-muted"
  );

  const date = new Date(message.createdAt);
  
  if (timestampConfig.format) {
    timestamp.textContent = timestampConfig.format(date);
  } else {
    // Default format: HH:MM
    timestamp.textContent = date.toLocaleTimeString([], { 
      hour: "2-digit", 
      minute: "2-digit" 
    });
  }

  return timestamp;
};

/**
 * Get bubble classes based on layout preset
 */
const getBubbleClasses = (
  role: "user" | "assistant" | "system",
  layout: AgentWidgetMessageLayoutConfig["layout"] = "bubble"
): string[] => {
  const baseClasses = ["vanilla-message-bubble", "persona-max-w-[85%]"];

  switch (layout) {
    case "flat":
      // Flat layout: no bubble styling, just text
      if (role === "user") {
        baseClasses.push(
          "vanilla-message-user-bubble",
          "persona-ml-auto",
          "persona-text-persona-primary",
          "persona-py-2"
        );
      } else {
        baseClasses.push(
          "vanilla-message-assistant-bubble",
          "persona-text-persona-primary",
          "persona-py-2"
        );
      }
      break;

    case "minimal":
      // Minimal layout: reduced padding and styling
      baseClasses.push(
        "persona-text-sm",
        "persona-leading-relaxed"
      );
      if (role === "user") {
        baseClasses.push(
          "vanilla-message-user-bubble",
          "persona-ml-auto",
          "persona-bg-persona-accent",
          "persona-text-white",
          "persona-px-3",
          "persona-py-2",
          "persona-rounded-lg"
        );
      } else {
        baseClasses.push(
          "vanilla-message-assistant-bubble",
          "persona-bg-persona-surface",
          "persona-text-persona-primary",
          "persona-px-3",
          "persona-py-2",
          "persona-rounded-lg"
        );
      }
      break;

    case "bubble":
    default:
      // Default bubble layout
      baseClasses.push(
        "persona-rounded-2xl",
        "persona-text-sm",
        "persona-leading-relaxed",
        "persona-shadow-sm"
      );
      if (role === "user") {
        baseClasses.push(
          "vanilla-message-user-bubble",
          "persona-ml-auto",
          "persona-bg-persona-accent",
          "persona-text-white",
          "persona-px-5",
          "persona-py-3"
        );
      } else {
        baseClasses.push(
          "vanilla-message-assistant-bubble",
          "persona-bg-persona-surface",
          "persona-border",
          "persona-border-persona-message-border",
          "persona-text-persona-primary",
          "persona-px-5",
          "persona-py-3"
        );
      }
      break;
  }

  return baseClasses;
};

/**
 * Create message action buttons (copy, upvote, downvote)
 *
 * This is a pure rendering function. It creates button elements with the
 * correct `data-action` attributes, icons, and CSS classes. All click
 * handling, vote state management, clipboard logic, and callback dispatch
 * is handled via event delegation in `ui.ts` so that handlers survive
 * idiomorph DOM morphing.
 */
export const createMessageActions = (
  message: AgentWidgetMessage,
  actionsConfig: AgentWidgetMessageActionsConfig,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _callbacks?: MessageActionCallbacks
): HTMLElement => {
  const showCopy = actionsConfig.showCopy ?? true;
  const showUpvote = actionsConfig.showUpvote ?? true;
  const showDownvote = actionsConfig.showDownvote ?? true;

  // Don't render the container at all when no actions are visible
  if (!showCopy && !showUpvote && !showDownvote) {
    const empty = createElement("div");
    empty.style.display = "none";
    empty.id = `actions-${message.id}`;
    empty.setAttribute("data-actions-for", message.id);
    return empty;
  }

  const visibility = actionsConfig.visibility ?? "hover";
  const align = actionsConfig.align ?? "right";
  const layout = actionsConfig.layout ?? "pill-inside";

  // Map alignment to CSS class
  const alignClass = {
    left: "persona-message-actions-left",
    center: "persona-message-actions-center",
    right: "persona-message-actions-right",
  }[align];

  // Map layout to CSS class
  const layoutClass = {
    "pill-inside": "persona-message-actions-pill",
    "row-inside": "persona-message-actions-row",
  }[layout];

  const container = createElement(
    "div",
    `persona-message-actions persona-flex persona-items-center persona-gap-1 persona-mt-2 ${alignClass} ${layoutClass} ${
      visibility === "hover" ? "persona-message-actions-hover" : ""
    }`
  );
  // Set id for idiomorph matching (prevents recreation on morph)
  container.id = `actions-${message.id}`;
  container.setAttribute("data-actions-for", message.id);

  const createActionButton = (
    iconName: string,
    label: string,
    dataAction: string
  ): HTMLButtonElement => {
    const button = document.createElement("button");
    button.className = "persona-message-action-btn";
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
    button.setAttribute("data-action", dataAction);

    const icon = renderLucideIcon(iconName, 14, "currentColor", 2);
    if (icon) {
      button.appendChild(icon);
    }

    return button;
  };

  // Copy button
  if (showCopy) {
    container.appendChild(createActionButton("copy", "Copy message", "copy"));
  }

  // Upvote button
  if (showUpvote) {
    container.appendChild(createActionButton("thumbs-up", "Upvote", "upvote"));
  }

  // Downvote button
  if (showDownvote) {
    container.appendChild(createActionButton("thumbs-down", "Downvote", "downvote"));
  }

  return container;
};

/**
 * Options for creating a standard message bubble
 */
export type CreateStandardBubbleOptions = {
  /**
   * Custom loading indicator renderer for inline location
   */
  loadingIndicatorRenderer?: LoadingIndicatorRenderer;
  /**
   * Full widget config (needed for loading indicator context)
   */
  widgetConfig?: import("../types").AgentWidgetConfig;
};

/**
 * Create standard message bubble
 * Supports layout configuration for avatars, timestamps, and visual presets
 */
export const createStandardBubble = (
  message: AgentWidgetMessage,
  transform: MessageTransform,
  layoutConfig?: AgentWidgetMessageLayoutConfig,
  actionsConfig?: AgentWidgetMessageActionsConfig,
  actionCallbacks?: MessageActionCallbacks,
  options?: CreateStandardBubbleOptions
): HTMLElement => {
  const config = layoutConfig ?? {};
  const layout = config.layout ?? "bubble";
  const avatarConfig = config.avatar;
  const timestampConfig = config.timestamp;
  const showAvatar = avatarConfig?.show ?? false;
  const showTimestamp = timestampConfig?.show ?? false;
  const avatarPosition = avatarConfig?.position ?? "left";
  const timestampPosition = timestampConfig?.position ?? "below";

  // Create the bubble element
  const classes = getBubbleClasses(message.role, layout);
  const bubble = createElement("div", classes.join(" "));
  // Set id for idiomorph matching
  bubble.id = `bubble-${message.id}`;
  bubble.setAttribute("data-message-id", message.id);

  bubble.setAttribute("data-persona-theme-zone", message.role === "user" ? "user-message" : "assistant-message");

  // Apply component-level color overrides via CSS variables
  if (message.role === "user") {
    bubble.style.backgroundColor = 'var(--persona-message-user-bg, var(--persona-accent))';
    bubble.style.color = 'var(--persona-message-user-text, white)';
  } else if (message.role === "assistant") {
    bubble.style.backgroundColor = 'var(--persona-message-assistant-bg, var(--persona-surface))';
    bubble.style.color = 'var(--persona-message-assistant-text, var(--persona-text))';
  }

  const imageParts = getMessageImageParts(message);
  const messageContentText = message.content?.trim() ?? "";
  const isImageOnlyFallbackMessage =
    imageParts.length > 0 && messageContentText === IMAGE_ONLY_MESSAGE_FALLBACK_TEXT;
  const shouldHideTextUntilPreviewFails = isImageOnlyFallbackMessage;

  // Add message content
  const contentDiv = document.createElement("div");
  contentDiv.classList.add("persona-message-content");
  const transformedContent = transform({
    text: message.content,
    message,
    streaming: Boolean(message.streaming),
    raw: message.rawContent
  });
  let textContentDiv: HTMLElement | null = null;

  if (shouldHideTextUntilPreviewFails) {
    textContentDiv = document.createElement("div");
    textContentDiv.innerHTML = transformedContent;
    textContentDiv.style.display = "none";
    contentDiv.appendChild(textContentDiv);
  } else {
    contentDiv.innerHTML = transformedContent;
  }

  // Add inline timestamp if configured
  if (showTimestamp && timestampPosition === "inline" && message.createdAt) {
    const timestamp = createTimestamp(message, timestampConfig!);
    timestamp.classList.add("persona-ml-2", "persona-inline");
    contentDiv.appendChild(timestamp);
  }

  if (imageParts.length > 0) {
    const imagePreviews = createMessageImagePreviews(
      imageParts,
      !shouldHideTextUntilPreviewFails && Boolean(messageContentText),
      () => {
        if (shouldHideTextUntilPreviewFails && textContentDiv) {
          textContentDiv.style.display = "";
        }
      }
    );

    if (imagePreviews) {
      bubble.appendChild(imagePreviews);
    } else if (shouldHideTextUntilPreviewFails && textContentDiv) {
      textContentDiv.style.display = "";
    }
  }

  bubble.appendChild(contentDiv);

  // Add timestamp below if configured
  if (showTimestamp && timestampPosition === "below" && message.createdAt) {
    const timestamp = createTimestamp(message, timestampConfig!);
    timestamp.classList.add("persona-mt-1");
    bubble.appendChild(timestamp);
  }

  // Add typing indicator if this is a streaming assistant message
  if (message.streaming && message.role === "assistant") {
    if (!message.content || !message.content.trim()) {
      // Use custom renderer if provided, otherwise default
      const indicator = renderLoadingIndicatorWithFallback(
        'inline',
        options?.loadingIndicatorRenderer,
        options?.widgetConfig
      );
      if (indicator) {
        bubble.appendChild(indicator);
      }
    }
  }

  // Add message actions for assistant messages (only when not streaming and has content)
  const shouldShowActions = 
    message.role === "assistant" && 
    !message.streaming && 
    message.content && 
    message.content.trim() &&
    actionsConfig?.enabled !== false;

  if (shouldShowActions && actionsConfig) {
    const actions = createMessageActions(message, actionsConfig, actionCallbacks);
    bubble.appendChild(actions);
  }

  // If no avatar needed, return bubble directly
  if (!showAvatar || message.role === "system") {
    return bubble;
  }

  // Create wrapper with avatar
  const wrapper = createElement(
    "div",
    `persona-flex persona-gap-2 ${message.role === "user" ? "persona-flex-row-reverse" : ""}`
  );

  const avatar = createAvatar(avatarConfig!, message.role);

  if (avatarPosition === "right" || (avatarPosition === "left" && message.role === "user")) {
    wrapper.append(bubble, avatar);
  } else {
    wrapper.append(avatar, bubble);
  }

  // Adjust bubble max-width when avatar is present
  bubble.classList.remove("persona-max-w-[85%]");
  bubble.classList.add("persona-max-w-[calc(85%-2.5rem)]");

  return wrapper;
};

/**
 * Create bubble with custom renderer support
 * Uses custom renderer if provided in layout config, otherwise falls back to standard bubble
 */
export const createBubbleWithLayout = (
  message: AgentWidgetMessage,
  transform: MessageTransform,
  layoutConfig?: AgentWidgetMessageLayoutConfig,
  actionsConfig?: AgentWidgetMessageActionsConfig,
  actionCallbacks?: MessageActionCallbacks,
  options?: CreateStandardBubbleOptions
): HTMLElement => {
  const config = layoutConfig ?? {};

  // Check for custom renderers
  if (message.role === "user" && config.renderUserMessage) {
    return config.renderUserMessage({
      message,
      config: {} as any, // Will be populated by caller
      streaming: Boolean(message.streaming)
    });
  }

  if (message.role === "assistant" && config.renderAssistantMessage) {
    return config.renderAssistantMessage({
      message,
      config: {} as any, // Will be populated by caller
      streaming: Boolean(message.streaming)
    });
  }

  // Fall back to standard bubble
  return createStandardBubble(message, transform, layoutConfig, actionsConfig, actionCallbacks, options);
};
