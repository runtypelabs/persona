import { createElement } from "../utils/dom";
import { AgentWidgetSession } from "../session";
import { AgentWidgetMessage, AgentWidgetSuggestionChipsConfig } from "../types";

export interface SuggestionButtons {
  buttons: HTMLButtonElement[];
  render: (
    chips: string[] | undefined,
    session: AgentWidgetSession,
    textarea: HTMLTextAreaElement,
    messages?: AgentWidgetMessage[],
    config?: AgentWidgetSuggestionChipsConfig
  ) => void;
}

export const createSuggestions = (container: HTMLElement): SuggestionButtons => {
  const suggestionButtons: HTMLButtonElement[] = [];

  const render = (
    chips: string[] | undefined,
    session: AgentWidgetSession,
    textarea: HTMLTextAreaElement,
    messages?: AgentWidgetMessage[],
    chipsConfig?: AgentWidgetSuggestionChipsConfig
  ) => {
    container.innerHTML = "";
    suggestionButtons.length = 0;
    if (!chips || !chips.length) return;

    // Hide suggestions after the first user message is sent
    // Use provided messages or get from session
    const messagesToCheck = messages ?? (session ? session.getMessages() : []);
    const hasUserMessage = messagesToCheck.some((msg) => msg.role === "user");
    if (hasUserMessage) return;

    const fragment = document.createDocumentFragment();
    const streaming = session ? session.isStreaming() : false;

    // Get font family mapping function
    const getFontFamilyValue = (family: "sans-serif" | "serif" | "mono"): string => {
      switch (family) {
        case "serif":
          return 'Georgia, "Times New Roman", Times, serif';
        case "mono":
          return '"Courier New", Courier, "Lucida Console", Monaco, monospace';
        case "sans-serif":
        default:
          return '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif';
      }
    };

    chips.forEach((chip) => {
      const btn = createElement(
        "button",
        "tvw-rounded-button tvw-bg-cw-surface tvw-px-3 tvw-py-1.5 tvw-text-xs tvw-font-medium tvw-text-cw-muted hover:tvw-opacity-90 tvw-cursor-pointer tvw-border tvw-border-gray-200"
      ) as HTMLButtonElement;
      btn.type = "button";
      btn.textContent = chip;
      btn.disabled = streaming;

      // Apply typography settings
      if (chipsConfig?.fontFamily) {
        btn.style.fontFamily = getFontFamilyValue(chipsConfig.fontFamily);
      }
      if (chipsConfig?.fontWeight) {
        btn.style.fontWeight = chipsConfig.fontWeight;
      }

      // Apply padding settings
      if (chipsConfig?.paddingX) {
        btn.style.paddingLeft = chipsConfig.paddingX;
        btn.style.paddingRight = chipsConfig.paddingX;
      }
      if (chipsConfig?.paddingY) {
        btn.style.paddingTop = chipsConfig.paddingY;
        btn.style.paddingBottom = chipsConfig.paddingY;
      }

      btn.addEventListener("click", () => {
        if (!session || session.isStreaming()) return;
        textarea.value = "";
        session.sendMessage(chip);
      });
      fragment.appendChild(btn);
      suggestionButtons.push(btn);
    });
    container.appendChild(fragment);
  };

  return {
    buttons: suggestionButtons,
    render
  };
};



