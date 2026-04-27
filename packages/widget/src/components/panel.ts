import { createElement } from "../utils/dom";
import { DEFAULT_FLOATING_LAUNCHER_WIDTH } from "../defaults";
import { AgentWidgetConfig } from "../types";
import { positionMap } from "../utils/positioning";
import { isDockedMountMode } from "../utils/dock";
import { DEFAULT_OVERLAY_Z_INDEX } from "../utils/constants";
import { buildHeader, attachHeaderToContainer, HeaderElements } from "./header-builder";
import { buildHeaderWithLayout } from "./header-layouts";
import { buildComposer, ComposerElements } from "./composer-builder";

export interface PanelWrapper {
  wrapper: HTMLElement;
  panel: HTMLElement;
}

export const createWrapper = (config?: AgentWidgetConfig): PanelWrapper => {
  const launcherEnabled = config?.launcher?.enabled ?? true;
  const dockedMode = isDockedMountMode(config);

  if (dockedMode) {
    const wrapper = createElement(
      "div",
      "persona-relative persona-h-full persona-w-full persona-flex persona-flex-1 persona-min-h-0 persona-flex-col"
    );
    const panel = createElement(
      "div",
      "persona-relative persona-h-full persona-w-full persona-flex persona-flex-1 persona-min-h-0 persona-flex-col"
    );

    wrapper.appendChild(panel);
    return { wrapper, panel };
  }

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
    `persona-widget-wrapper persona-fixed ${position} persona-transition`
  );
  wrapper.style.zIndex = String(config?.launcher?.zIndex ?? DEFAULT_OVERLAY_Z_INDEX);

  const panel = createElement(
    "div",
    "persona-widget-panel persona-relative persona-min-h-[320px]"
  );
  const launcherWidth = config?.launcher?.width ?? config?.launcherWidth;
  const width = launcherWidth ?? DEFAULT_FLOATING_LAUNCHER_WIDTH;
  panel.style.width = width;
  panel.style.maxWidth = width;

  wrapper.appendChild(panel);
  return { wrapper, panel };
};

export interface PanelElements {
  container: HTMLElement;
  body: HTMLElement;
  messagesWrapper: HTMLElement;
  /**
   * Absolute-positioned slot above the composer footer. Interactive sheets
   * (e.g. the answer-pill sheet for the ask_user_question tool) mount here
   * so they slide in without reflowing the chat transcript.
   */
  composerOverlay: HTMLElement;
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
  /** Swap the send button between its send and stop appearances. */
  setSendButtonMode: (mode: "send" | "stop") => void;
}

export const buildPanel = (config?: AgentWidgetConfig, showClose = true): PanelElements => {
  // Use flex-1 and min-h-0 to ensure the container fills its parent and allows
  // the body (chat messages area) to scroll while header/footer stay fixed
  const container = createElement(
    "div",
    "persona-widget-container persona-flex persona-h-full persona-w-full persona-flex-1 persona-min-h-0 persona-flex-col persona-bg-persona-surface persona-text-persona-primary persona-rounded-2xl persona-overflow-hidden persona-border persona-border-persona-border"
  );
  container.setAttribute("data-persona-theme-zone", "container");

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
  body.setAttribute("data-persona-theme-zone", "messages");
  
  const introCard = createElement(
    "div",
    "persona-rounded-2xl persona-bg-persona-surface persona-p-6"
  );
  // Box-shadow flows through the themable `components.introCard.shadow` token
  // (--persona-intro-card-shadow). Docked mode keeps a flat look by default;
  // floating mode falls back to the legacy `persona-shadow-sm` value when no
  // token is set.
  introCard.style.boxShadow = isDockedMountMode(config)
    ? "none"
    : "var(--persona-intro-card-shadow, 0 5px 15px rgba(15, 23, 42, 0.08))";
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

  const contentMaxWidth = config?.layout?.contentMaxWidth;
  if (contentMaxWidth) {
    messagesWrapper.style.maxWidth = contentMaxWidth;
    messagesWrapper.style.marginLeft = "auto";
    messagesWrapper.style.marginRight = "auto";
    messagesWrapper.style.width = "100%";
  }

  introCard.setAttribute("data-persona-intro-card", "");
  const showWelcomeCard = config?.copy?.showWelcomeCard !== false;
  if (!showWelcomeCard) {
    introCard.style.display = "none";
    body.classList.remove("persona-gap-6");
    body.classList.add("persona-gap-3");
  }
  body.append(introCard, messagesWrapper);

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
  
  // Composer overlay slot: sits between body and footer, absolutely positioned
  // above the composer so sheets (e.g. the ask_user_question answer-pill sheet)
  // can slide up without reflowing the chat transcript above. Uses inline
  // styles for left/right/bottom because widget.css is hand-authored and
  // doesn't ship `.persona-left-0` / `.persona-right-0` rules — without
  // them the overlay shrink-wraps to content and collapses the sheet width.
  const composerOverlay = createElement(
    "div",
    "persona-composer-overlay persona-pointer-events-none"
  );
  composerOverlay.setAttribute("data-persona-composer-overlay", "");
  composerOverlay.style.position = "absolute";
  composerOverlay.style.left = "0";
  composerOverlay.style.right = "0";
  composerOverlay.style.bottom = "0";
  // Above .persona-scroll-to-bottom-indicator (z-index 10, sibling in the
  // container) so suggestion chips and the ask-user-question sheet are not
  // covered by the "jump to latest" button.
  composerOverlay.style.zIndex = "20";

  if (showFooter) {
    container.append(composerElements.footer);
  } else {
    // Hide footer completely
    composerElements.footer.style.display = 'none';
    container.append(composerElements.footer);
  }

  // Append overlay last so it stacks above the footer / body content.
  container.append(composerOverlay);

  return {
    container,
    body,
    messagesWrapper,
    composerOverlay,
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
    rightActions: composerElements.rightActions,
    setSendButtonMode: composerElements.setSendButtonMode
  };
};

// Re-export builder types and functions for plugin use
export { buildHeader, buildComposer, attachHeaderToContainer };
export type { HeaderElements, HeaderBuildContext } from "./header-builder";
export type { ComposerElements, ComposerBuildContext } from "./composer-builder";
