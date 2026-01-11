import { createElement } from "../utils/dom";
import { 
  AgentWidgetMessage, 
  AgentWidgetMessageLayoutConfig,
  AgentWidgetAvatarConfig,
  AgentWidgetTimestampConfig,
  AgentWidgetMessageActionsConfig,
  AgentWidgetMessageFeedback
} from "../types";
import { renderLucideIcon } from "../utils/icons";

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

// Create typing indicator element
export const createTypingIndicator = (): HTMLElement => {
  const container = document.createElement("div");
  container.className = "tvw-flex tvw-items-center tvw-space-x-1 tvw-h-5 tvw-mt-2";

  const dot1 = document.createElement("div");
  dot1.className = "tvw-bg-cw-primary tvw-animate-typing tvw-rounded-full tvw-h-1.5 tvw-w-1.5";
  dot1.style.animationDelay = "0ms";

  const dot2 = document.createElement("div");
  dot2.className = "tvw-bg-cw-primary tvw-animate-typing tvw-rounded-full tvw-h-1.5 tvw-w-1.5";
  dot2.style.animationDelay = "250ms";

  const dot3 = document.createElement("div");
  dot3.className = "tvw-bg-cw-primary tvw-animate-typing tvw-rounded-full tvw-h-1.5 tvw-w-1.5";
  dot3.style.animationDelay = "500ms";

  const srOnly = document.createElement("span");
  srOnly.className = "tvw-sr-only";
  srOnly.textContent = "Loading";

  container.appendChild(dot1);
  container.appendChild(dot2);
  container.appendChild(dot3);
  container.appendChild(srOnly);

  return container;
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
    "tvw-flex-shrink-0 tvw-w-8 tvw-h-8 tvw-rounded-full tvw-flex tvw-items-center tvw-justify-center tvw-text-sm"
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
      img.className = "tvw-w-full tvw-h-full tvw-rounded-full tvw-object-cover";
      avatar.appendChild(img);
    } else {
      // Emoji or text
      avatar.textContent = avatarContent;
      avatar.classList.add(
        role === "user" ? "tvw-bg-cw-accent" : "tvw-bg-cw-primary",
        "tvw-text-white"
      );
    }
  } else {
    // Default avatar
    avatar.textContent = role === "user" ? "U" : "A";
    avatar.classList.add(
      role === "user" ? "tvw-bg-cw-accent" : "tvw-bg-cw-primary",
      "tvw-text-white"
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
    "tvw-text-xs tvw-text-cw-muted"
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
  const baseClasses = ["vanilla-message-bubble", "tvw-max-w-[85%]"];

  switch (layout) {
    case "flat":
      // Flat layout: no bubble styling, just text
      if (role === "user") {
        baseClasses.push(
          "vanilla-message-user-bubble",
          "tvw-ml-auto",
          "tvw-text-cw-primary",
          "tvw-py-2"
        );
      } else {
        baseClasses.push(
          "vanilla-message-assistant-bubble",
          "tvw-text-cw-primary",
          "tvw-py-2"
        );
      }
      break;

    case "minimal":
      // Minimal layout: reduced padding and styling
      baseClasses.push(
        "tvw-text-sm",
        "tvw-leading-relaxed"
      );
      if (role === "user") {
        baseClasses.push(
          "vanilla-message-user-bubble",
          "tvw-ml-auto",
          "tvw-bg-cw-accent",
          "tvw-text-white",
          "tvw-px-3",
          "tvw-py-2",
          "tvw-rounded-lg"
        );
      } else {
        baseClasses.push(
          "vanilla-message-assistant-bubble",
          "tvw-bg-cw-surface",
          "tvw-text-cw-primary",
          "tvw-px-3",
          "tvw-py-2",
          "tvw-rounded-lg"
        );
      }
      break;

    case "bubble":
    default:
      // Default bubble layout
      baseClasses.push(
        "tvw-rounded-2xl",
        "tvw-text-sm",
        "tvw-leading-relaxed",
        "tvw-shadow-sm"
      );
      if (role === "user") {
        baseClasses.push(
          "vanilla-message-user-bubble",
          "tvw-ml-auto",
          "tvw-bg-cw-accent",
          "tvw-text-white",
          "tvw-px-5",
          "tvw-py-3"
        );
      } else {
        baseClasses.push(
          "vanilla-message-assistant-bubble",
          "tvw-bg-cw-surface",
          "tvw-border",
          "tvw-border-cw-message-border",
          "tvw-text-cw-primary",
          "tvw-px-5",
          "tvw-py-3"
        );
      }
      break;
  }

  return baseClasses;
};

/**
 * Create message action buttons (copy, upvote, downvote)
 */
export const createMessageActions = (
  message: AgentWidgetMessage,
  actionsConfig: AgentWidgetMessageActionsConfig,
  callbacks?: MessageActionCallbacks
): HTMLElement => {
  const showCopy = actionsConfig.showCopy ?? true;
  const showUpvote = actionsConfig.showUpvote ?? true;
  const showDownvote = actionsConfig.showDownvote ?? true;
  const visibility = actionsConfig.visibility ?? "hover";
  const align = actionsConfig.align ?? "right";
  const layout = actionsConfig.layout ?? "pill-inside";

  // Map alignment to CSS class
  const alignClass = {
    left: "tvw-message-actions-left",
    center: "tvw-message-actions-center",
    right: "tvw-message-actions-right",
  }[align];

  // Map layout to CSS class
  const layoutClass = {
    "pill-inside": "tvw-message-actions-pill",
    "row-inside": "tvw-message-actions-row",
  }[layout];

  const container = createElement(
    "div",
    `tvw-message-actions tvw-flex tvw-items-center tvw-gap-1 tvw-mt-2 ${alignClass} ${layoutClass} ${
      visibility === "hover" ? "tvw-message-actions-hover" : ""
    }`
  );
  // Set id for idiomorph matching (prevents recreation on morph)
  container.id = `actions-${message.id}`;
  container.setAttribute("data-actions-for", message.id);

  // Track vote state for this message
  let currentVote: "upvote" | "downvote" | null = null;

  const createActionButton = (
    iconName: string,
    label: string,
    onClick: () => void,
    dataAction?: string
  ): HTMLButtonElement => {
    const button = document.createElement("button");
    button.className = "tvw-message-action-btn";
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
    if (dataAction) {
      button.setAttribute("data-action", dataAction);
    }

    const icon = renderLucideIcon(iconName, 14, "currentColor", 2);
    if (icon) {
      button.appendChild(icon);
    }

    button.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });

    return button;
  };

  // Copy button
  if (showCopy) {
    const copyButton = createActionButton("copy", "Copy message", () => {
      // Copy to clipboard
      const textToCopy = message.content || "";
      navigator.clipboard.writeText(textToCopy).then(() => {
        // Show success feedback - swap icon temporarily
        copyButton.classList.add("tvw-message-action-success");
        const checkIcon = renderLucideIcon("check", 14, "currentColor", 2);
        if (checkIcon) {
          copyButton.innerHTML = "";
          copyButton.appendChild(checkIcon);
        }
        
        // Restore original icon after 2 seconds
        setTimeout(() => {
          copyButton.classList.remove("tvw-message-action-success");
          const originalIcon = renderLucideIcon("copy", 14, "currentColor", 2);
          if (originalIcon) {
            copyButton.innerHTML = "";
            copyButton.appendChild(originalIcon);
          }
        }, 2000);
      }).catch((err) => {
        if (typeof console !== "undefined") {
          console.error("[AgentWidget] Failed to copy message:", err);
        }
      });

      // Trigger callback
      if (callbacks?.onCopy) {
        callbacks.onCopy(message);
      }
      if (actionsConfig.onCopy) {
        actionsConfig.onCopy(message);
      }
    }, "copy");
    container.appendChild(copyButton);
  }

  // Upvote button
  if (showUpvote) {
    const upvoteButton = createActionButton("thumbs-up", "Upvote", () => {
      const wasActive = currentVote === "upvote";
      
      // Toggle state
      if (wasActive) {
        currentVote = null;
        upvoteButton.classList.remove("tvw-message-action-active");
      } else {
        // Remove downvote if active
        const downvoteBtn = container.querySelector('[data-action="downvote"]');
        if (downvoteBtn) {
          downvoteBtn.classList.remove("tvw-message-action-active");
        }
        currentVote = "upvote";
        upvoteButton.classList.add("tvw-message-action-active");
        
        // Trigger feedback
        const feedback: AgentWidgetMessageFeedback = {
          type: "upvote",
          messageId: message.id,
          message
        };
        if (callbacks?.onFeedback) {
          callbacks.onFeedback(feedback);
        }
        if (actionsConfig.onFeedback) {
          actionsConfig.onFeedback(feedback);
        }
      }
    }, "upvote");
    container.appendChild(upvoteButton);
  }

  // Downvote button
  if (showDownvote) {
    const downvoteButton = createActionButton("thumbs-down", "Downvote", () => {
      const wasActive = currentVote === "downvote";
      
      // Toggle state
      if (wasActive) {
        currentVote = null;
        downvoteButton.classList.remove("tvw-message-action-active");
      } else {
        // Remove upvote if active
        const upvoteBtn = container.querySelector('[data-action="upvote"]');
        if (upvoteBtn) {
          upvoteBtn.classList.remove("tvw-message-action-active");
        }
        currentVote = "downvote";
        downvoteButton.classList.add("tvw-message-action-active");
        
        // Trigger feedback
        const feedback: AgentWidgetMessageFeedback = {
          type: "downvote",
          messageId: message.id,
          message
        };
        if (callbacks?.onFeedback) {
          callbacks.onFeedback(feedback);
        }
        if (actionsConfig.onFeedback) {
          actionsConfig.onFeedback(feedback);
        }
      }
    }, "downvote");
    container.appendChild(downvoteButton);
  }

  return container;
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
  actionCallbacks?: MessageActionCallbacks
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

  // Add message content
  const contentDiv = document.createElement("div");
  contentDiv.innerHTML = transform({
    text: message.content,
    message,
    streaming: Boolean(message.streaming),
    raw: message.rawContent
  });

  // Add inline timestamp if configured
  if (showTimestamp && timestampPosition === "inline" && message.createdAt) {
    const timestamp = createTimestamp(message, timestampConfig!);
    timestamp.classList.add("tvw-ml-2", "tvw-inline");
    contentDiv.appendChild(timestamp);
  }

  bubble.appendChild(contentDiv);

  // Add timestamp below if configured
  if (showTimestamp && timestampPosition === "below" && message.createdAt) {
    const timestamp = createTimestamp(message, timestampConfig!);
    timestamp.classList.add("tvw-mt-1");
    bubble.appendChild(timestamp);
  }

  // Add typing indicator if this is a streaming assistant message
  if (message.streaming && message.role === "assistant") {
    if (!message.content || !message.content.trim()) {
      const typingIndicator = createTypingIndicator();
      bubble.appendChild(typingIndicator);
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
    `tvw-flex tvw-gap-2 ${message.role === "user" ? "tvw-flex-row-reverse" : ""}`
  );

  const avatar = createAvatar(avatarConfig!, message.role);

  if (avatarPosition === "right" || (avatarPosition === "left" && message.role === "user")) {
    wrapper.append(bubble, avatar);
  } else {
    wrapper.append(avatar, bubble);
  }

  // Adjust bubble max-width when avatar is present
  bubble.classList.remove("tvw-max-w-[85%]");
  bubble.classList.add("tvw-max-w-[calc(85%-2.5rem)]");

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
  actionCallbacks?: MessageActionCallbacks
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
  return createStandardBubble(message, transform, layoutConfig, actionsConfig, actionCallbacks);
};
