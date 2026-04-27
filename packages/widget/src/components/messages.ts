import { createElement, createFragment } from "../utils/dom";
import { AgentWidgetMessage, AgentWidgetConfig } from "../types";
import { MessageTransform, MessageActionCallbacks } from "./message-bubble";
import { createStandardBubble } from "./message-bubble";
import { createReasoningBubble } from "./reasoning-bubble";
import { createToolBubble } from "./tool-bubble";
import {
  ensureAskUserQuestionSheet,
  isAskUserQuestionMessage,
  removeAskUserQuestionSheet,
} from "./ask-user-question-bubble";

export const renderMessages = (
  container: HTMLElement,
  messages: AgentWidgetMessage[],
  transform: MessageTransform,
  showReasoning: boolean,
  showToolCalls: boolean,
  config?: AgentWidgetConfig,
  actionCallbacks?: MessageActionCallbacks,
  composerOverlay?: HTMLElement | null
) => {
  container.innerHTML = "";
  const fragment = createFragment();

  // Track which ask_user_question tool-call ids are currently in the message
  // list, so we can prune stale sheets from the overlay afterward.
  const liveAskToolIds = new Set<string>();

  messages.forEach((message) => {
    let bubble: HTMLElement;
    if (message.variant === "reasoning" && message.reasoning) {
      if (!showReasoning) return;
      bubble = createReasoningBubble(message, config);
    } else if (isAskUserQuestionMessage(message)) {
      // No transcript bubble — the overlay sheet is the only question UI.
      if (config?.features?.askUserQuestion?.enabled === false) return;
      if (!message.agentMetadata?.askUserQuestionAnswered) {
        if (message.toolCall?.id) liveAskToolIds.add(message.toolCall.id);
        ensureAskUserQuestionSheet(message, config, composerOverlay ?? null);
      }
      return;
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

    const wrapper = createElement("div", "persona-flex");
    if (message.role === "user") {
      wrapper.classList.add("persona-justify-end");
    }
    wrapper.appendChild(bubble);
    fragment.appendChild(wrapper);
  });

  container.appendChild(fragment);
  container.scrollTop = container.scrollHeight;

  // Clean up any orphaned ask_user_question sheets whose source message is no
  // longer in the list (e.g. after clearChat or a message splice).
  if (composerOverlay) {
    const sheets = composerOverlay.querySelectorAll<HTMLElement>(
      '[data-persona-ask-sheet-for]'
    );
    sheets.forEach((sheet) => {
      const id = sheet.getAttribute('data-persona-ask-sheet-for');
      if (id && !liveAskToolIds.has(id)) {
        removeAskUserQuestionSheet(composerOverlay, id);
      }
    });
  }
};






