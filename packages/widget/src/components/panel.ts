import { createElement, createNode } from "../utils/dom";
import { DEFAULT_FLOATING_LAUNCHER_WIDTH } from "../defaults";
import { AgentWidgetConfig } from "../types";
import { positionMap } from "../utils/positioning";
import { isComposerBarMountMode, isDockedMountMode } from "../utils/dock";
import { DEFAULT_OVERLAY_Z_INDEX } from "../utils/constants";
import { buildHeader, attachHeaderToContainer, HeaderElements } from "./header-builder";
import { buildHeaderWithLayout } from "./header-layouts";
import { createCloseButton, createClearChatButton } from "./header-parts";
import { buildComposer, ComposerElements } from "./composer-builder";
import { buildPillComposer, buildPillPeekBanner } from "./pill-composer-builder";

export interface PanelWrapper {
  wrapper: HTMLElement;
  panel: HTMLElement;
  /**
   * Composer-bar mode only: viewport-fixed sibling of `wrapper` that owns
   * the persistent pill (`footer`) and peek banner. Lives outside the
   * wrapper so it never inherits the wrapper's geometry transitions:   * critical for modal mode where the wrapper is `transform: translate(-50%, -50%)`
   * (a transformed ancestor establishes a containing block for `position: fixed`
   * descendants, which would trap the pill inside the wrapper otherwise).
   */
  pillRoot?: HTMLElement;
}

export const createWrapper = (config?: AgentWidgetConfig): PanelWrapper => {
  const launcherEnabled = config?.launcher?.enabled ?? true;
  const dockedMode = isDockedMountMode(config);
  const composerBarMode = isComposerBarMountMode(config);

  if (composerBarMode) {
    const cb = config?.launcher?.composerBar ?? {};
    // Geometry (left/transform/bottom/top/width/max-width) is intentionally
    // NOT set here: it's owned entirely by `applyComposerBarGeometry()` in
    // ui.ts so that collapsed → expanded transitions can clear the previous
    // state's inline styles cleanly. Setting geometry here would persist
    // across state changes and override the per-state values, which
    // previously caused expanded panels to render at collapsed dimensions.
    const wrapper = createElement(
      "div",
      "persona-widget-wrapper persona-fixed persona-transition"
    );
    wrapper.setAttribute("data-persona-composer-bar", "");
    wrapper.dataset.state = "collapsed";
    wrapper.dataset.expandedSize = cb.expandedSize ?? "anchored";
    wrapper.style.zIndex = String(
      config?.launcher?.zIndex ?? DEFAULT_OVERLAY_Z_INDEX
    );

    const panel = createElement(
      "div",
      "persona-widget-panel persona-relative persona-flex persona-flex-1 persona-min-h-0 persona-flex-col"
    );
    panel.style.width = "100%";
    wrapper.appendChild(panel);

    // Pill lives in a separate viewport-fixed sibling: see PanelWrapper
    // docs above. ui.ts appends `peekBanner` and `footer` here, then
    // appends pillRoot to `mount` immediately after the wrapper.
    const pillRoot = createElement("div", "persona-widget-pill-root");
    pillRoot.setAttribute("data-persona-composer-bar", "");
    pillRoot.dataset.state = "collapsed";
    pillRoot.dataset.expandedSize = cb.expandedSize ?? "anchored";
    pillRoot.style.zIndex = String(
      config?.launcher?.zIndex ?? DEFAULT_OVERLAY_Z_INDEX
    );

    return { wrapper, panel, pillRoot };
  }

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
  /**
   * Composer-bar peek banner: the chrome-less row above the pill that
   * shows a trailing preview of the most recent assistant message.
   * Undefined for non-composer-bar modes.
   */
  peekBanner?: HTMLButtonElement;
  peekTextNode?: HTMLElement;
}

/**
 * Composer-bar panel: minimal close-only header (× in the top-right of the
 * chat chrome). The pill (`footer`) and `peekBanner` are NOT children of
 * the panel: caller (`ui.ts`) appends them to the `pillRoot` returned by
 * `createWrapper`, which is a viewport-fixed sibling of the wrapper.
 * This decouples the pill from the wrapper's geometry transitions (so the
 * pill stays anchored at the viewport bottom regardless of expanded mode).
 */
const buildComposerBarPanel = (
  config: AgentWidgetConfig | undefined,
  showClose: boolean,
): PanelElements => {
  // Container = the chat panel chrome (border + bg + radius + shadow applied
  // inline by `applyFullHeightStyles` in ui.ts). `position: relative` anchors
  // the absolute close button + composerOverlay.
  const container = createElement(
    "div",
    "persona-widget-container persona-relative persona-flex persona-flex-1 persona-min-h-0 persona-flex-col persona-text-persona-primary"
  );
  container.setAttribute("data-persona-theme-zone", "container");

  // Minimal header: just an absolutely-positioned close button.
  // The wrapper uses inline styles (top/right/z-index values) because the
  // widget's hand-authored CSS doesn't ship every Tailwind utility.
  // Composer-bar's defaults are roughly half the floating-launcher's
  // (button 16px, icon 14px) to match the minimal aesthetic; the user can
  // still override via `launcher.closeButtonSize`.
  const { button: closeButton, wrapper: closeButtonWrapper } = createCloseButton(
    config,
    {
      showClose,
      wrapperClassName: "persona-composer-bar-close",
      buttonSize: "16px",
      iconSize: "14px",
    }
  );
  closeButtonWrapper.style.position = "absolute";
  closeButtonWrapper.style.top = "8px";
  closeButtonWrapper.style.right = "8px";
  closeButtonWrapper.style.zIndex = "10";

  // Clear / "start over" button: sits immediately to the left of the close
  // button in the panel chrome's top-right corner. Same minimal sizing as
  // the close icon (16px button, 14px icon) so the two read as a paired
  // action group rather than a header strip. Wired by `setupClearChatButton()`
  // in ui.ts via the `clearChatButton` field on PanelElements.
  //
  // Right offset = close button right (8px) + close button width (16px) +
  // 8px inter-button gap = 32px.
  const clearChatEnabled = config?.launcher?.clearChat?.enabled ?? true;
  let clearChatButton: HTMLButtonElement | null = null;
  let clearChatButtonWrapper: HTMLElement | null = null;
  if (clearChatEnabled) {
    const parts = createClearChatButton(config, {
      wrapperClassName: "persona-composer-bar-clear-chat",
      buttonSize: "16px",
      iconSize: "14px",
    });
    clearChatButton = parts.button;
    clearChatButtonWrapper = parts.wrapper;
    clearChatButtonWrapper.style.position = "absolute";
    clearChatButtonWrapper.style.top = "8px";
    clearChatButtonWrapper.style.right = "32px";
    clearChatButtonWrapper.style.zIndex = "10";
  }
  // Placeholder header element so PanelElements.header exists (some downstream
  // code reads it). It carries `data-persona-widget-header` for plugin /
  // selector parity but renders nothing visible: the close button is the only
  // header chrome in composer-bar mode.
  const headerPlaceholder = createNode("span", {
    className: "persona-widget-header",
    attrs: { "data-persona-theme-zone": "header" },
    style: { display: "none" },
  });

  // Body: extra top padding (set inline so the hand-authored widget.css
  // doesn't need a `pt-12` utility) so the absolute close button doesn't
  // overlap the welcome card / first message.
  const body = createNode("div", {
    className:
      "persona-widget-body persona-flex persona-flex-1 persona-min-h-0 persona-flex-col persona-gap-6 persona-overflow-y-auto persona-bg-persona-container persona-px-6 persona-py-6",
    attrs: { id: "persona-scroll-container", "data-persona-theme-zone": "messages" },
    style: { paddingTop: "48px" },
  });
  // Reserve the scrollbar gutter so the transcript doesn't shift horizontally
  // when streaming content first overflows and the scrollbar appears.
  body.style.setProperty("scrollbar-gutter", "stable");

  const introTitle = createNode("h2", {
    className: "persona-text-lg persona-font-semibold persona-text-persona-primary",
    text: config?.copy?.welcomeTitle ?? "Hello 👋",
  });
  const introSubtitle = createNode("p", {
    className: "persona-mt-2 persona-text-sm persona-text-persona-muted",
    text:
      config?.copy?.welcomeSubtitle ??
      "Ask anything about your account or products.",
  });
  const introCard = createNode(
    "div",
    {
      className: "persona-rounded-2xl persona-bg-persona-surface persona-p-6",
      attrs: { "data-persona-intro-card": "" },
      style: {
        boxShadow:
          "var(--persona-intro-card-shadow, 0 5px 15px rgba(15, 23, 42, 0.08))",
      },
    },
    introTitle,
    introSubtitle
  );

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

  const showWelcomeCard = config?.copy?.showWelcomeCard !== false;
  if (!showWelcomeCard) {
    introCard.style.display = "none";
    body.classList.remove("persona-gap-6");
    body.classList.add("persona-gap-3");
  }
  body.append(introCard, messagesWrapper);

  // Composer overlay (interactive sheets like ask_user_question slide up here).
  // Anchored to the bottom of the container (which is `position: relative`),
  // so sheets render at the bottom of the chat chrome: just above the gap +
  // pill that sit below the container.
  const composerOverlay = createNode("div", {
    className: "persona-composer-overlay persona-pointer-events-none",
    attrs: { "data-persona-composer-overlay": "" },
    style: { position: "absolute", left: "0", right: "0", bottom: "0", zIndex: "20" },
  });

  // Pill composer: caller appends as a sibling of container in the panel.
  const composerElements: ComposerElements = buildPillComposer({ config });

  // Peek banner: caller inserts as a sibling of container/footer between
  // them in the panel. Hidden by default; ui.ts toggles visibility.
  const { root: peekBanner, textNode: peekTextNode } = buildPillPeekBanner();

  // Container = [close button (absolute), placeholder header, body, overlay].
  // Footer (pill) is intentionally NOT appended here.
  container.append(headerPlaceholder, closeButtonWrapper, body, composerOverlay);
  if (clearChatButtonWrapper) {
    container.appendChild(clearChatButtonWrapper);
  }

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
    closeButton,
    closeButtonWrapper,
    clearChatButton,
    clearChatButtonWrapper,
    iconHolder: createElement("span"),
    headerTitle: createElement("span"),
    headerSubtitle: createElement("span"),
    header: headerPlaceholder,
    footer: composerElements.footer,
    attachmentButton: composerElements.attachmentButton,
    attachmentButtonWrapper: composerElements.attachmentButtonWrapper,
    attachmentInput: composerElements.attachmentInput,
    attachmentPreviewsContainer: composerElements.attachmentPreviewsContainer,
    actionsRow: composerElements.actionsRow,
    leftActions: composerElements.leftActions,
    rightActions: composerElements.rightActions,
    setSendButtonMode: composerElements.setSendButtonMode,
    peekBanner,
    peekTextNode,
  };
};

export const buildPanel = (config?: AgentWidgetConfig, showClose = true): PanelElements => {
  // Composer-bar mode renders a purpose-built panel: minimal close-only
  // header (small × in the top-right of the chat panel chrome), and the
  // pill (footer) is a SIBLING of the container so it stays visible/usable
  // when the chat is expanded above it.
  if (isComposerBarMountMode(config)) {
    return buildComposerBarPanel(config, showClose);
  }

  const container = createNode("div", {
    className:
      "persona-widget-container persona-flex persona-h-full persona-w-full persona-flex-1 persona-min-h-0 persona-flex-col persona-text-persona-primary persona-bg-persona-surface persona-rounded-2xl persona-overflow-hidden persona-border persona-border-persona-border",
    attrs: { "data-persona-theme-zone": "container" },
  });

  // Build header using layout config if available, otherwise use standard builder
  const headerLayoutConfig = config?.layout?.header;
  const showHeader = config?.layout?.showHeader !== false; // default to true
  const headerElements: HeaderElements = headerLayoutConfig
    ? buildHeaderWithLayout(config!, headerLayoutConfig, { showClose })
    : buildHeader({ config, showClose });

  // Build body with intro card and messages wrapper
  const body = createNode("div", {
    className:
      "persona-widget-body persona-flex persona-flex-1 persona-min-h-0 persona-flex-col persona-gap-6 persona-overflow-y-auto persona-bg-persona-container persona-px-6 persona-py-6",
    attrs: { id: "persona-scroll-container", "data-persona-theme-zone": "messages" },
  });
  // Reserve the scrollbar gutter so the transcript doesn't shift horizontally
  // when streaming content first overflows and the scrollbar appears.
  body.style.setProperty("scrollbar-gutter", "stable");

  const introTitle = createNode("h2", {
    className: "persona-text-lg persona-font-semibold persona-text-persona-primary",
    text: config?.copy?.welcomeTitle ?? "Hello 👋",
  });
  const introSubtitle = createNode("p", {
    className: "persona-mt-2 persona-text-sm persona-text-persona-muted",
    text:
      config?.copy?.welcomeSubtitle ??
      "Ask anything about your account or products.",
  });
  // Box-shadow flows through the themable `components.introCard.shadow` token
  // (--persona-intro-card-shadow). Docked mode keeps a flat look by default;
  // floating mode falls back to the legacy `persona-shadow-sm` value when no
  // token is set.
  const introCard = createNode(
    "div",
    {
      className: "persona-rounded-2xl persona-bg-persona-surface persona-p-6",
      attrs: { "data-persona-intro-card": "" },
      style: {
        boxShadow: isDockedMountMode(config)
          ? "none"
          : "var(--persona-intro-card-shadow, 0 5px 15px rgba(15, 23, 42, 0.08))",
      },
    },
    introTitle,
    introSubtitle
  );

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

  const showWelcomeCard = config?.copy?.showWelcomeCard !== false;
  if (!showWelcomeCard) {
    introCard.style.display = "none";
    body.classList.remove("persona-gap-6");
    body.classList.add("persona-gap-3");
  }
  body.append(introCard, messagesWrapper);

  // composer-bar mode early-returned above with its own pill builder; this
  // path always uses the standard column-stacked composer card.
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
  // doesn't ship `.persona-left-0` / `.persona-right-0` rules: without
  // them the overlay shrink-wraps to content and collapses the sheet width.
  // zIndex 20 sits above .persona-scroll-to-bottom-indicator (z-index 10,
  // sibling in the container) so suggestion chips and the ask-user-question
  // sheet are not covered by the "jump to latest" button.
  const composerOverlay = createNode("div", {
    className: "persona-composer-overlay persona-pointer-events-none",
    attrs: { "data-persona-composer-overlay": "" },
    style: { position: "absolute", left: "0", right: "0", bottom: "0", zIndex: "20" },
  });

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
