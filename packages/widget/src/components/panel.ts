import { createElement } from "../utils/dom";
import { AgentWidgetConfig } from "../types";
import { positionMap } from "../utils/positioning";
import { buildHeader, attachHeaderToContainer, HeaderElements } from "./header-builder";
import { buildHeaderWithLayout } from "./header-layouts";
import { buildComposer, ComposerElements } from "./composer-builder";

export interface PanelWrapper {
  wrapper: HTMLElement;
  panel: HTMLElement;
}

export const createWrapper = (config?: AgentWidgetConfig): PanelWrapper => {
  const launcherEnabled = config?.launcher?.enabled ?? true;

  if (!launcherEnabled) {
    // For inline embed mode, use flex layout to ensure the widget fills its container
    // and only the chat messages area scrolls
    const wrapper = createElement(
      "div",
      "persona-relative persona-h-full persona-flex persona-flex-col persona-flex-1 persona-min-h-0"
    );
    const panel = createElement(
      "div",
      "persona-relative persona-flex-1 persona-flex persona-flex-col persona-min-h-0"
    );
    
    // Apply width from config, defaulting to 100% for inline embed mode
    const inlineWidth = config?.launcher?.width ?? "100%";
    wrapper.style.width = inlineWidth;
    panel.style.width = "100%";
    
    wrapper.appendChild(panel);
    return { wrapper, panel };
  }

  const launcher = config?.launcher ?? {};
  const position =
    launcher.position && positionMap[launcher.position]
      ? positionMap[launcher.position]
      : positionMap["bottom-right"];

  const wrapper = createElement(
    "div",
    `persona-widget-wrapper persona-fixed ${position} persona-z-50 persona-transition`
  );

  const panel = createElement(
    "div",
    "persona-widget-panel persona-relative persona-min-h-[320px]"
  );
  const launcherWidth = config?.launcher?.width ?? config?.launcherWidth;
  const width = launcherWidth ?? "min(400px, calc(100vw - 24px))";
  panel.style.width = width;
  panel.style.maxWidth = width;

  wrapper.appendChild(panel);
  return { wrapper, panel };
};

export interface PanelElements {
  container: HTMLElement;
  body: HTMLElement;
  messagesWrapper: HTMLElement;
  suggestions: HTMLElement;
  textarea: HTMLTextAreaElement;
  sendButton: HTMLButtonElement;
  sendButtonWrapper: HTMLElement;
  micButton: HTMLButtonElement | null;
  micButtonWrapper: HTMLElement | null;
  composerForm: HTMLFormElement;
  statusText: HTMLElement;
  introTitle: HTMLElement;
  introSubtitle: HTMLElement;
  closeButton: HTMLButtonElement;
  closeButtonWrapper: HTMLElement;
  clearChatButton: HTMLButtonElement | null;
  clearChatButtonWrapper: HTMLElement | null;
  iconHolder: HTMLElement;
  headerTitle: HTMLElement;
  headerSubtitle: HTMLElement;
  // Exposed for potential header replacement
  header: HTMLElement;
  footer: HTMLElement;
  // Attachment elements
  attachmentButton: HTMLButtonElement | null;
  attachmentButtonWrapper: HTMLElement | null;
  attachmentInput: HTMLInputElement | null;
  attachmentPreviewsContainer: HTMLElement | null;
  // Actions row layout elements
  actionsRow: HTMLElement;
  leftActions: HTMLElement;
  rightActions: HTMLElement;
}

export const buildPanel = (config?: AgentWidgetConfig, showClose = true): PanelElements => {
  // Use flex-1 and min-h-0 to ensure the container fills its parent and allows
  // the body (chat messages area) to scroll while header/footer stay fixed
  const container = createElement(
    "div",
    "persona-widget-container persona-flex persona-h-full persona-w-full persona-flex-1 persona-min-h-0 persona-flex-col persona-bg-persona-surface persona-text-persona-primary persona-rounded-2xl persona-overflow-hidden persona-border persona-border-persona-border"
  );

  // Build header using layout config if available, otherwise use standard builder
  const headerLayoutConfig = config?.layout?.header;
  const showHeader = config?.layout?.showHeader !== false; // default to true
  const headerElements: HeaderElements = headerLayoutConfig
    ? buildHeaderWithLayout(config!, headerLayoutConfig, { showClose })
    : buildHeader({ config, showClose });

  // Build body with intro card and messages wrapper
  const body = createElement(
    "div",
    "persona-widget-body persona-flex persona-flex-1 persona-min-h-0 persona-flex-col persona-gap-6 persona-overflow-y-auto persona-bg-persona-container persona-px-6 persona-py-6"
  );
  body.id = "persona-scroll-container";
  
  const introCard = createElement(
    "div",
    "persona-rounded-2xl persona-bg-persona-surface persona-p-6 persona-shadow-sm"
  );
  const introTitle = createElement(
    "h2",
    "persona-text-lg persona-font-semibold persona-text-persona-primary"
  );
  introTitle.textContent = config?.copy?.welcomeTitle ?? "Hello 👋";
  const introSubtitle = createElement(
    "p",
    "persona-mt-2 persona-text-sm persona-text-persona-muted"
  );
  introSubtitle.textContent =
    config?.copy?.welcomeSubtitle ??
    "Ask anything about your account or products.";
  introCard.append(introTitle, introSubtitle);

  const messagesWrapper = createElement(
    "div",
    "persona-flex persona-flex-col persona-gap-3"
  );

  const showWelcomeCard = config?.copy?.showWelcomeCard !== false;
  if (!showWelcomeCard) {
    body.classList.remove("persona-gap-6");
    body.classList.add("persona-gap-3");
    body.append(messagesWrapper);
  } else {
    body.append(introCard, messagesWrapper);
  }

  // Build composer/footer using extracted builder
  const composerElements: ComposerElements = buildComposer({ config });
  const showFooter = config?.layout?.showFooter !== false; // default to true

  // Assemble container with header, body, and footer
  if (showHeader) {
    attachHeaderToContainer(container, headerElements, config);
  } else {
    // Hide header completely
    headerElements.header.style.display = 'none';
    attachHeaderToContainer(container, headerElements, config);
  }
  
  container.append(body);
  
  if (showFooter) {
    container.append(composerElements.footer);
  } else {
    // Hide footer completely
    composerElements.footer.style.display = 'none';
    container.append(composerElements.footer);
  }

  return {
    container,
    body,
    messagesWrapper,
    suggestions: composerElements.suggestions,
    textarea: composerElements.textarea,
    sendButton: composerElements.sendButton,
    sendButtonWrapper: composerElements.sendButtonWrapper,
    micButton: composerElements.micButton,
    micButtonWrapper: composerElements.micButtonWrapper,
    composerForm: composerElements.composerForm,
    statusText: composerElements.statusText,
    introTitle,
    introSubtitle,
    closeButton: headerElements.closeButton,
    closeButtonWrapper: headerElements.closeButtonWrapper,
    clearChatButton: headerElements.clearChatButton,
    clearChatButtonWrapper: headerElements.clearChatButtonWrapper,
    iconHolder: headerElements.iconHolder,
    headerTitle: headerElements.headerTitle,
    headerSubtitle: headerElements.headerSubtitle,
    header: headerElements.header,
    footer: composerElements.footer,
    // Attachment elements
    attachmentButton: composerElements.attachmentButton,
    attachmentButtonWrapper: composerElements.attachmentButtonWrapper,
    attachmentInput: composerElements.attachmentInput,
    attachmentPreviewsContainer: composerElements.attachmentPreviewsContainer,
    // Actions row layout elements
    actionsRow: composerElements.actionsRow,
    leftActions: composerElements.leftActions,
    rightActions: composerElements.rightActions
  };
};

// Re-export builder types and functions for plugin use
export { buildHeader, buildComposer, attachHeaderToContainer };
export type { HeaderElements, HeaderBuildContext } from "./header-builder";
export type { ComposerElements, ComposerBuildContext } from "./composer-builder";
