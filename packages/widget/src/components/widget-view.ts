import { AgentWidgetConfig } from "../types";
import { AgentWidgetPlugin } from "../plugins/types";
import { createWrapper, buildPanel, PanelElements } from "./panel";
import { HeaderElements } from "./header-builder";
import { createLauncherButton, LauncherButton } from "./launcher";

/**
 * Widget view assembly layer.
 *
 * `ui.ts` owns behavior (session dispatch, streaming, scroll, voice, events);
 * this module owns the one-time structural assembly of the widget's DOM and
 * groups the resulting element references into named regions so callers read
 * `view.composer.textarea` instead of destructuring a ~30-field flat object.
 *
 * The grouped refs are a view over the same nodes returned by `buildPanel`;
 * the raw flat `PanelElements` is still exposed as `view.panelElements` for
 * incremental migration. No framework, no virtual DOM: these are the real
 * elements built by the existing `panel.ts` / `composer-*` / `header-*`
 * builders.
 */

export interface WidgetShellRefs {
  wrapper: HTMLElement;
  panel: HTMLElement;
  /** Composer-bar mode only: viewport-fixed sibling that owns the pill. */
  pillRoot?: HTMLElement;
}

export interface WidgetTranscriptRefs {
  container: HTMLElement;
  body: HTMLElement;
  messagesWrapper: HTMLElement;
  /** Absolute slot above the composer where interactive sheets mount. */
  composerOverlay: HTMLElement;
  introTitle: HTMLElement;
  introSubtitle: HTMLElement;
}

export interface WidgetHeaderRefs {
  /** The header root element currently mounted in the container. */
  element: HTMLElement;
  iconHolder: HTMLElement;
  headerTitle: HTMLElement;
  headerSubtitle: HTMLElement;
  closeButton: HTMLButtonElement;
  closeButtonWrapper: HTMLElement | null;
  clearChatButton: HTMLButtonElement | null;
  clearChatButtonWrapper: HTMLElement | null;
}

export interface WidgetComposerRefs {
  /** The footer root element currently mounted in the panel. */
  footer: HTMLElement;
  form: HTMLFormElement;
  textarea: HTMLTextAreaElement;
  sendButton: HTMLButtonElement;
  sendButtonWrapper: HTMLElement;
  micButton: HTMLButtonElement | null;
  micButtonWrapper: HTMLElement | null;
  statusText: HTMLElement;
  suggestions: HTMLElement;
  attachmentButton: HTMLButtonElement | null;
  attachmentButtonWrapper: HTMLElement | null;
  attachmentInput: HTMLInputElement | null;
  attachmentPreviewsContainer: HTMLElement | null;
  actionsRow: HTMLElement;
  leftActions: HTMLElement;
  rightActions: HTMLElement;
  setSendButtonMode: (mode: "send" | "stop") => void;
  /** Composer-bar peek banner (undefined for non-composer-bar modes). */
  peekBanner?: HTMLButtonElement;
  peekTextNode?: HTMLElement;
}

export interface WidgetView {
  shell: WidgetShellRefs;
  /** Raw flat refs from `buildPanel`, retained for incremental migration. */
  panelElements: PanelElements;
  transcript: WidgetTranscriptRefs;
  header: WidgetHeaderRefs;
  composer: WidgetComposerRefs;
  /**
   * Swap the mounted header element for `next.header` and mirror the header
   * sub-refs (icon/title/subtitle/close) onto `view.header`. Used by the
   * header-layout rebuild path. Returns the new `HeaderElements` for the
   * caller to mirror into its own locals during incremental migration.
   */
  replaceHeader: (next: HeaderElements) => HeaderElements;
  /**
   * Swap the mounted footer element for `nextFooter` and update
   * `view.composer.footer`. The remaining composer sub-refs become stale
   * after a plugin-provided composer replaces the footer; callers re-derive
   * them from the new footer (see `bindComposerRefsFromFooter` in ui.ts).
   */
  replaceComposer: (nextFooter: HTMLElement) => void;
}

export interface CreateWidgetViewOptions {
  config: AgentWidgetConfig;
  /** Whether the panel renders a close affordance (panel is toggleable). */
  showClose: boolean;
}

/**
 * Build the widget shell + panel once and group the element references into
 * named regions. Equivalent to the previous `createWrapper(config)` +
 * `buildPanel(config, showClose)` pair, plus the grouping/replacement helpers.
 */
export const createWidgetView = ({
  config,
  showClose,
}: CreateWidgetViewOptions): WidgetView => {
  const { wrapper, panel, pillRoot } = createWrapper(config);
  const panelElements = buildPanel(config, showClose);

  const shell: WidgetShellRefs = { wrapper, panel, pillRoot };

  const transcript: WidgetTranscriptRefs = {
    container: panelElements.container,
    body: panelElements.body,
    messagesWrapper: panelElements.messagesWrapper,
    composerOverlay: panelElements.composerOverlay,
    introTitle: panelElements.introTitle,
    introSubtitle: panelElements.introSubtitle,
  };

  const header: WidgetHeaderRefs = {
    element: panelElements.header,
    iconHolder: panelElements.iconHolder,
    headerTitle: panelElements.headerTitle,
    headerSubtitle: panelElements.headerSubtitle,
    closeButton: panelElements.closeButton,
    closeButtonWrapper: panelElements.closeButtonWrapper,
    clearChatButton: panelElements.clearChatButton,
    clearChatButtonWrapper: panelElements.clearChatButtonWrapper,
  };

  const composer: WidgetComposerRefs = {
    footer: panelElements.footer,
    form: panelElements.composerForm,
    textarea: panelElements.textarea,
    sendButton: panelElements.sendButton,
    sendButtonWrapper: panelElements.sendButtonWrapper,
    micButton: panelElements.micButton,
    micButtonWrapper: panelElements.micButtonWrapper,
    statusText: panelElements.statusText,
    suggestions: panelElements.suggestions,
    attachmentButton: panelElements.attachmentButton,
    attachmentButtonWrapper: panelElements.attachmentButtonWrapper,
    attachmentInput: panelElements.attachmentInput,
    attachmentPreviewsContainer: panelElements.attachmentPreviewsContainer,
    actionsRow: panelElements.actionsRow,
    leftActions: panelElements.leftActions,
    rightActions: panelElements.rightActions,
    setSendButtonMode: panelElements.setSendButtonMode,
    peekBanner: panelElements.peekBanner,
    peekTextNode: panelElements.peekTextNode,
  };

  const replaceHeader = (next: HeaderElements): HeaderElements => {
    header.element.replaceWith(next.header);
    header.element = next.header;
    header.iconHolder = next.iconHolder;
    header.headerTitle = next.headerTitle;
    header.headerSubtitle = next.headerSubtitle;
    header.closeButton = next.closeButton;
    header.closeButtonWrapper = next.closeButtonWrapper;
    header.clearChatButton = next.clearChatButton;
    header.clearChatButtonWrapper = next.clearChatButtonWrapper;
    return next;
  };

  const replaceComposer = (nextFooter: HTMLElement): void => {
    composer.footer.replaceWith(nextFooter);
    composer.footer = nextFooter;
  };

  return {
    shell,
    panelElements,
    transcript,
    header,
    composer,
    replaceHeader,
    replaceComposer,
  };
};

export interface ResolveLauncherOptions {
  config: AgentWidgetConfig;
  plugins: AgentWidgetPlugin[];
  /** Toggles the panel open/closed; wired to the launcher's click. */
  onToggle: () => void;
}

export interface ResolvedLauncher {
  /**
   * The default launcher controller (with `update`/`destroy`), or null when a
   * plugin supplied a custom launcher element.
   */
  instance: LauncherButton | null;
  /** The element to mount: either the default button or the plugin's element. */
  element: HTMLElement;
}

/**
 * Resolve the launcher element, honoring a `renderLauncher` plugin if present.
 * De-duplicates the identical default-or-plugin logic that previously lived at
 * both the initial-build and re-enable call sites in ui.ts.
 *
 * When a plugin returns a custom element, `instance` is null (the plugin owns
 * its own updates); otherwise the default `LauncherButton` controller is
 * returned so the caller can drive `update()`/`destroy()`.
 */
export const resolveLauncher = ({
  config,
  plugins,
  onToggle,
}: ResolveLauncherOptions): ResolvedLauncher => {
  const launcherPlugin = plugins.find((p) => p.renderLauncher);
  if (launcherPlugin?.renderLauncher) {
    const customLauncher = launcherPlugin.renderLauncher({
      config,
      defaultRenderer: () => createLauncherButton(config, onToggle).element,
      onToggle,
    });
    if (customLauncher) {
      return { instance: null, element: customLauncher };
    }
  }

  const instance = createLauncherButton(config, onToggle);
  return { instance, element: instance.element };
};
