import { createElement, createFragment } from "../utils/dom";
import { AgentWidgetMessage, AgentWidgetConfig } from "../types";
import { MessageTransform, MessageActionCallbacks } from "./message-bubble";
import { createStandardBubble } from "./message-bubble";
import { createReasoningBubble } from "./reasoning-bubble";
import { createToolBubble } from "./tool-bubble";

export const renderMessages = (
  container: HTMLElement,
  messages: AgentWidgetMessage[],
  transform: MessageTransform,
  showReasoning: boolean,
  showToolCalls: boolean,
  config?: AgentWidgetConfig,
  actionCallbacks?: MessageActionCallbacks
) => {
  container.innerHTML = "";
  const fragment = createFragment();

  messages.forEach((message) => {
    let bubble: HTMLElement;
    if (message.variant === "reasoning" && message.reasoning) {
      if (!showReasoning) return;
      bubble = createReasoningBubble(message);
    } else if (message.variant === "tool" && message.toolCall) {
      if (!showToolCalls) return;
      bubble = createToolBubble(message, config);
    } else {
      bubble = createStandardBubble(
        message, 
        transform, 
        config?.layout?.messages, 
        config?.messageActions, 
        actionCallbacks
      );
    }

    const wrapper = createElement("div", "tvw-flex");
    if (message.role === "user") {
      wrapper.classList.add("tvw-justify-end");
    }
    wrapper.appendChild(bubble);
    fragment.appendChild(wrapper);
  });

  container.appendChild(fragment);
  container.scrollTop = container.scrollHeight;
};






