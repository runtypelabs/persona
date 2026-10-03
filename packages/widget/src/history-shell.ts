/**
 * Visitor conversation history shell (docs/visitor-history-implementation-plan.md
 * D6/D7/D8): placement, open/close, inertness of the obscured conversation,
 * focus orchestration, confirmations, and every session mutation. The lazily
 * loaded Messages view (`history-view` chunk) owns the list itself.
 *
 * Split out of `ui.ts` so the IIFE/CDN bundle can ship it as the lazy
 * `history-shell.js` sibling chunk (see `history-shell-loader.ts`), fetched
 * only when `features.history` is enabled or a history API is called. It runs
 * inside the widget closure's state through `ctx`: live getters (and setters
 * where the shell writes) over `createAgentExperience`'s locals, plus the
 * stateful core modules (icon registry, tooltips, chunk loaders, provider
 * registry) so the chunk never carries its own copies of them.
 */
import { type ResolvedHistoryShellCopy, resolveHistoryShellCopy } from "./components/history-shell-copy";
import { type HistoryProvider, type HistoryOperationContext } from "./internal/history-provider";
import { type HistoryRenderSurface, createHistoryRenderSurface } from "./history-render";
import { type HistoryReturnSurface, type HistoryScope, type HistoryIdentityStatus, type WidgetHistoryInternals, type ResolvedHistoryPresentation, type LoadingIndicatorRenderContext, type AgentWidgetRenderHistoryOpenErrorContext, type HistoryConversationPatch, type HistoryConversationSummary } from "./types";
import { type HistoryViewHandle, type HistoryRailSection, type HistoryHeaderPlacement, type HistoryViewOptions } from "./history-view-entry";
import { createElement, createNode, cx } from "./utils/dom";
import { parseCombo, formatCombo, ariaCombo } from "./utils/shortcuts";
import { PORTALED_OVERLAY_Z_INDEX } from "./utils/constants";
import { type HistoryConfirmOptions } from "./components/history-confirm-dialog";
import type { getHistoryProviderFactory } from "./internal/history-provider-registry";
import type { createRuntypeHistoryProvider } from "./internal/runtype-history-provider";
import type { isDockedMountMode } from "./utils/dock";
import type { renderLucideIcon } from "./utils/icons";
import type { loadHistoryView } from "./history-view-loader";
import type { createHeaderIconButton } from "./components/header-parts";
import type { attachTooltip } from "./utils/tooltip";
import type { createEventBus } from "./utils/events";
import type { AgentWidgetControllerEventMap } from "./types";

/** The widget closure state the shell reads and writes. */
export type HistoryShellContext = {
  readonly actionManager: { syncFromMetadata: () => void };
  readonly activeConversationTitle: string | null;
  readonly announceHistory: (message: string) => void;
  applyRailChrome: () => void;
  readonly artifactSplitRoot: HTMLElement | null;
  readonly body: HTMLElement;
  readonly config: import("./types").AgentWidgetConfig;
  readonly container: HTMLElement;
  conversationOpenPendingEl: HTMLElement | null;
  conversationOpenTakeover: boolean;
  readonly currentKeyPrefix: () => string;
  readonly destroyCallbacks: (() => void)[];
  readonly eventBus: ReturnType<typeof createEventBus<AgentWidgetControllerEventMap>>;
  readonly footer: HTMLElement;
  readonly header: HTMLElement;
  historyChromeSync: () => void;
  readonly historyFeatureEnabled: () => boolean;
  historyInternals: import("./types").WidgetHistoryInternals;
  historyPresentation: import("./types").ResolvedHistoryPresentation | null;
  readonly historySessionState: import("./session").SessionHistoryState;
  historyVisible: boolean;
  readonly isStreaming: boolean;
  readonly jumpToBottomInstant: () => void;
  lastAppliedMessages: import("./types").AgentWidgetMessage[] | null;
  readonly launcherEnabled: boolean;
  readonly launcherSurfaceInstance: import("./components/launcher").LauncherSurface | null;
  readonly maybeFocusInput: () => void;
  readonly messageCache: import("./utils/message-fingerprint").MessageCache;
  readonly messagesWrapper: HTMLElement;
  readonly mount: HTMLElement;
  readonly open: boolean;
  readonly panel: HTMLElement;
  readonly panelElements: import("./components/panel").PanelElements;
  persistentMetadata: Record<string, unknown>;
  readonly plugins: import("./plugins/types").AgentWidgetPlugin[];
  reapplyHistoryHostChrome: () => void;
  readonly repinAnchoredMessage: () => void;
  readonly resetAnchorState: () => void;
  readonly restoreScrollPosition: () => boolean;
  readonly resumeAutoScroll: () => void;
  readonly runStorageMutation: (mutation: () => void | Promise<void>, errorLabel: string) => void;
  readonly session: import("./session").AgentWidgetSession;
  readonly setActiveConversationSummary: (summary: import("./types").HistoryConversationSummary | null) => void;
  readonly storageAdapter: import("./types").AgentWidgetStorageAdapter | null;
  suppressScrollSend: boolean;
  readonly syncScrollToBottomButton: () => void;
  readonly updateWelcome: (messages?: import("./types").AgentWidgetMessage[] | undefined) => void;
  readonly getHistoryProviderFactory: typeof getHistoryProviderFactory;
  readonly createRuntypeHistoryProvider: typeof createRuntypeHistoryProvider;
  readonly isDockedMountMode: typeof isDockedMountMode;
  readonly renderLucideIcon: typeof renderLucideIcon;
  readonly loadHistoryView: typeof loadHistoryView;
  readonly createHeaderIconButton: typeof createHeaderIconButton;
  readonly attachTooltip: typeof attachTooltip;
};

export const createHistoryShell = (ctx: HistoryShellContext) => {
  /** Rail needs this much HOST width; below it, rail collapses to panel. */
  const RAIL_MIN_CONTAINER_WIDTH = 720;
  /** Ceiling on the view's ~160ms exit before the close proceeds regardless. */
  const HISTORY_EXIT_TIMEOUT_MS = 250;

  let historyShellCopy: ResolvedHistoryShellCopy = resolveHistoryShellCopy(
    ctx.config.features?.history?.copy
  );
  let historyProvider: HistoryProvider | null = null;
  let historyUnavailable = false;
  /** Default view + plugin render-hook arbitration. Null while closed. */
  let historySurface: HistoryRenderSurface | null = null;
  let historyOperationContext: HistoryOperationContext | null = null;
  let historyReturnSurface: HistoryReturnSurface = "conversation";
  let historyInvoker: HTMLElement | null = null;
  let historyButton: HTMLButtonElement | null = null;
  /** The inserted node: removing the button alone would orphan its wrapper. */
  let historyButtonWrapper: HTMLElement | null = null;
  let historyIdentityKey: string | null = null;
  let historyOpenToken = 0;
  let clearChatDefaultLabel: string | null = null;
  let unsubscribeHistoryAvailability: (() => void) | null = null;
  let unsubscribeHistoryIdentity: (() => void) | null = null;
  const historyRegionId = `persona-history-${Math.random().toString(36).slice(2, 8)}`;

  const historyAvailable = (): boolean =>
    ctx.historyFeatureEnabled() && !!historyProvider && !historyUnavailable;
  /** Switching conversations mid-turn would abandon a live answer. */
  const historyTurnBusy = (): boolean => {
    const status = ctx.session.getStatus();
    return ctx.isStreaming || status === "paused" || status === "resuming";
  };
  const historyScope = (): HistoryScope => {
    const configured = ctx.config.features?.history?.scope;
    if (configured) return configured;
    // Derived, not requested: narrow to what the provider advertises rather
    // than asking it for a scope it will reject.
    const derived: HistoryScope = ctx.config.getIdentityProof
      ? "verified-user"
      : "browser";
    const scopes = historyProvider?.capabilities.scopes;
    if (!scopes || scopes.includes(derived)) return derived;
    return scopes[0] ?? derived;
  };
  const historyOperationScope = (): HistoryScope =>
    historyOperationContext?.scope ?? historyScope();
  const activeHistoryTargetId = (): string | null =>
    ctx.session.getClientSession()?.targetId ?? null;

  const identityStatusKey = (status: HistoryIdentityStatus): string =>
    `${status.state}:${"reason" in status ? status.reason : ""}`;

  /** Instance-scoped only: authentication state is never broadcast page-wide. */
  const emitHistoryIdentityStatus = (status: HistoryIdentityStatus): void => {
    const key = identityStatusKey(status);
    if (key === historyIdentityKey) return;
    historyIdentityKey = key;
    ctx.eventBus.emit("history:identityStatusChanged", {
      status,
      timestamp: Date.now(),
    });
  };

  // --- provider ------------------------------------------------------------

  /** One provider build per widget instance; a new factory identity rebuilds. */
  let configuredProviderFactory: (() => HistoryProvider) | null = null;
  let configuredProviderInstance: HistoryProvider | null = null;

  const buildHistoryProvider = (): HistoryProvider | null => {
    if (!ctx.historyFeatureEnabled()) return null;
    // Demo/test override first, then the host's own provider; production
    // without one builds the Runtype provider from client-token config.
    const override = ctx.getHistoryProviderFactory();
    if (override) return override();
    const configured = ctx.config.features?.history?.provider;
    if (configured) {
      if (typeof configured !== "function") return configured;
      if (configuredProviderFactory !== configured) {
        configuredProviderFactory = configured;
        configuredProviderInstance = configured();
      }
      return configuredProviderInstance;
    }
    if (!ctx.session.isClientTokenMode()) return null;
    return ctx.createRuntypeHistoryProvider({
      client: ctx.session.getClient(),
      getIdentityProofConfigured: () =>
        typeof ctx.config.getIdentityProof === "function",
      onActivationCommitted: (clientSession) =>
        ctx.session.bindActivatedSession(clientSession),
      // Connection-config rebuilds replace the client under the provider.
      getClient: () => ctx.session.getClient(),
    });
  };

  const installHistoryProvider = (): void => {
    unsubscribeHistoryAvailability?.();
    unsubscribeHistoryAvailability = null;
    unsubscribeHistoryIdentity?.();
    unsubscribeHistoryIdentity = null;
    historyUnavailable = false;
    historyProvider = buildHistoryProvider();
    const next: WidgetHistoryInternals = { ...ctx.historyInternals };
    if (historyProvider) next.historyProvider = historyProvider;
    else delete next.historyProvider;
    ctx.historyInternals = next;
    ctx.session.setHistoryInternals(ctx.historyInternals);
    if (!historyProvider) return;
    unsubscribeHistoryAvailability =
      historyProvider.subscribeAvailability?.((available) => {
        historyUnavailable = !available;
        // A degrade must remove an ALREADY-rendered surface, not just a flag.
        if (!available) closeHistory({ restoreFocus: false });
        syncHistoryChromeImpl();
      }) ?? null;
    unsubscribeHistoryIdentity = historyProvider.subscribeIdentityStatus(
      (status) => emitHistoryIdentityStatus(status)
    );
    historyIdentityKey = identityStatusKey(historyProvider.getIdentityStatus());
  };

  // --- presentation hosts --------------------------------------------------

  /**
   * Resolved against the history HOST width, never the viewport. With the
   * artifact split mounted the split root is that host, not the container:
   * width the artifact pane borrows from the chat column is still the widget's,
   * so a drag on the split must never read as a narrow host and re-mode the
   * rail. A real window/host narrowing shrinks the split root too, and still
   * flips.
   */
  const resolveHistoryPresentation = (): ResolvedHistoryPresentation => {
    const configured = ctx.config.features?.history?.presentation ?? "panel";
    if (configured === "panel") return "panel";
    if (configured === "auto") {
      // Floating launchers stay panel-based at every width.
      const inlineOrDocked = !ctx.launcherEnabled || ctx.isDockedMountMode(ctx.config);
      if (!inlineOrDocked) return "panel";
    }
    const host = ctx.artifactSplitRoot ?? ctx.container;
    const width = host.getBoundingClientRect().width || host.clientWidth;
    return width >= RAIL_MIN_CONTAINER_WIDTH ? "rail" : "panel";
  };

  const setHistoryHostInert = (element: HTMLElement, inert: boolean): void => {
    if (inert) {
      element.setAttribute("aria-hidden", "true");
      element.setAttribute("inert", "");
    } else {
      element.removeAttribute("aria-hidden");
      element.removeAttribute("inert");
    }
  };

  /** Suppression of the shell header's own children while Messages owns the bar. */
  const HISTORY_SUPPRESSED_ATTR = "data-persona-history-suppressed";
  /** Shell-owned wrapper for the view's bar contents. Null while not hosting. */
  let historyHeaderHost: HTMLElement | null = null;
  /** Header carrying the swap-time min-height pin. Null while not hosting. */
  let historyPinnedHeader: HTMLElement | null = null;
  /** Handle + arbitrated element, tracked from before `historySurface` is assigned. */
  let historyViewHandle: HistoryViewHandle | null = null;
  let historyMountedElement: HTMLElement | null = null;
  let capturedPanelHeader: HTMLElement | null = null;
  let capturedPanelHeaderDisplay = "";

  /** The display the shell header returns to; "none" means there is no bar. */
  const shownHeaderDisplay = (): string =>
    ctx.header === capturedPanelHeader
      ? capturedPanelHeaderDisplay
      : ctx.config.layout?.showHeader === false
        ? "none"
        : "";

  /**
   * One persistent bar: the shell header hosts the view's bar contents whenever
   * the default view owns a panel and there is a visible header to host them in.
   * A plugin's full custom surface owns everything, so it falls back to hiding.
   */
  const historyHeaderExternal = (): boolean =>
    ctx.historyPresentation === "panel" &&
    !!historyViewHandle &&
    historyMountedElement === historyViewHandle.element &&
    ctx.config.layout?.showHeader !== false &&
    shownHeaderDisplay() !== "none";

  const suppressHeaderChildren = (): void => {
    for (const child of Array.from(ctx.header.children)) {
      if (child === historyHeaderHost) continue;
      child.setAttribute(HISTORY_SUPPRESSED_ATTR, "");
    }
  };

  /** By attribute, not by captured list: the header may have been rebuilt. */
  const unsuppressHeaderChildren = (): void => {
    for (const node of Array.from(
      ctx.container.querySelectorAll(`[${HISTORY_SUPPRESSED_ATTR}]`)
    )) {
      node.removeAttribute(HISTORY_SUPPRESSED_ATTR);
    }
  };

  const hostHistoryHeaderContent = (): void => {
    const view = historyViewHandle;
    if (!view) return;
    // Pin the pre-swap height so the contents swap never moves the chrome: the
    // hosted bar is usually shorter than the title cluster it replaces, and
    // constant-height chrome is what keeps the switch from reading as layout
    // shift. Measurable only while the original contents are still visible; a
    // re-entry on an already-hosted header keeps the standing pin, and a
    // rebuilt header re-measures before its own suppression below.
    const originalsVisible = Array.from(ctx.header.children).some(
      (child) =>
        child !== historyHeaderHost &&
        !child.hasAttribute(HISTORY_SUPPRESSED_ATTR)
    );
    if (originalsVisible) {
      if (historyPinnedHeader && historyPinnedHeader !== ctx.header) {
        historyPinnedHeader.style.removeProperty("min-height");
        historyPinnedHeader = null;
      }
      const measured = ctx.header.offsetHeight;
      if (measured > 0) {
        ctx.header.style.minHeight = `${measured}px`;
        historyPinnedHeader = ctx.header;
      }
    }
    if (!historyHeaderHost) {
      historyHeaderHost = createElement("div", "persona-history-header-host");
    }
    view.setHeaderPlacement("external");
    const content = view.getHeaderElement();
    if (content.parentNode !== historyHeaderHost) {
      historyHeaderHost.replaceChildren(content);
    }
    // The wrapper follows a rebuilt header binding; focus inside it survives.
    if (historyHeaderHost.parentNode !== ctx.header) {
      ctx.header.appendChild(historyHeaderHost);
    }
    suppressHeaderChildren();
  };

  const releaseHistoryHeaderContent = (): void => {
    if (historyPinnedHeader) {
      historyPinnedHeader.style.removeProperty("min-height");
      historyPinnedHeader = null;
    }
    if (!historyHeaderHost) return;
    // The view re-adopts its bar; the wrapper never owns the content's lifetime.
    historyViewHandle?.setHeaderPlacement("inline");
    historyHeaderHost.remove();
    historyHeaderHost = null;
    unsuppressHeaderChildren();
  };

  /**
   * Panel presentation obscures the conversation, so the transcript AND the
   * composer must be unreachable: a visitor must never send into a conversation
   * they cannot see. The header bar itself stays: only its contents swap, which
   * is also why it is never inert here (rail changes nothing at all: the
   * conversation stays primary).
   *
   * The widget's close (×) usually lives inside that header, but no trap
   * results: the view's back control is the initial focus target, Escape exits,
   * and both restore the header contents before focus lands. `top-right` close
   * placement parents the × to the container, so it stays reachable either way.
   *
   * Restores exactly what it captured.
   */
  let restorePanelHost: (() => void) | null = null;
  const enforcePanelHost = (): void => {
    if (!restorePanelHost) return;
    ctx.body.style.display = "none";
    setHistoryHostInert(ctx.body, true);
    // Live `footer` / `header` bindings: a composer-plugin rebuild or a
    // header-layout rebuild swaps them and re-enters here for the replacement.
    ctx.footer.hidden = true;
    setHistoryHostInert(ctx.footer, true);
    if (historyHeaderExternal()) {
      hostHistoryHeaderContent();
      ctx.header.style.display = shownHeaderDisplay();
      setHistoryHostInert(ctx.header, false);
      return;
    }
    // No bar to host in: hide the header the way the surface used to.
    releaseHistoryHeaderContent();
    ctx.header.style.display = "none";
    setHistoryHostInert(ctx.header, true);
  };
  ctx.reapplyHistoryHostChrome = enforcePanelHost;

  const mountPanelHost = (element: HTMLElement): void => {
    const previousDisplay = ctx.body.style.display;
    const previousFooterHidden = ctx.footer.hidden;
    const capturedFooter = ctx.footer;
    const capturedHeader = ctx.header;
    const previousHeaderDisplay = ctx.header.style.display;
    capturedPanelHeader = capturedHeader;
    capturedPanelHeaderDisplay = previousHeaderDisplay;
    restorePanelHost = () => {
      restorePanelHost = null;
      releaseHistoryHeaderContent();
      capturedPanelHeader = null;
      ctx.body.style.display = previousDisplay;
      setHistoryHostInert(ctx.body, false);
      capturedFooter.hidden = previousFooterHidden;
      setHistoryHostInert(capturedFooter, false);
      if (ctx.footer !== capturedFooter) {
        ctx.footer.hidden = false;
        setHistoryHostInert(ctx.footer, false);
      }
      capturedHeader.style.display = previousHeaderDisplay;
      setHistoryHostInert(capturedHeader, false);
      if (ctx.header !== capturedHeader) {
        // A replacement carries no captured state; only config decides it.
        ctx.header.style.display = ctx.config.layout?.showHeader === false ? "none" : "";
        setHistoryHostInert(ctx.header, false);
      }
    };
    ctx.footer.parentNode?.insertBefore(element, ctx.footer);
    enforcePanelHost();
  };

  let railShell: HTMLElement | null = null;
  let railHost: HTMLElement | null = null;
  let railColumn: HTMLElement | null = null;
  /** Stand-in element holding the docked column while the chunk loads. */
  let railPlaceholder: HTMLElement | null = null;
  /** Container order the rail borrows from and hands back, header first. */
  const railBorrowed = (): Array<HTMLElement | null> => [
    ctx.header,
    ctx.panelElements.closeButtonWrapper,
    ctx.panelElements.clearChatButtonWrapper,
    ctx.body,
    // Composer-bar mode keeps the footer outside the container; the parent
    // checks below then never adopt it.
    ctx.footer,
  ];

  /** Collapsed icon rail, measured from the reference sidebar. */
  const RAIL_COLLAPSED_WIDTH = 52;
  const railCollapsible = (): boolean =>
    ctx.config.features?.history?.rail?.collapsible !== false;
  const railSide = (): "left" | "right" =>
    ctx.config.features?.history?.rail?.side === "right" ? "right" : "left";
  /** The band a rail width may take, by config or by drag. */
  const RAIL_MIN_WIDTH = 200;
  const RAIL_MAX_WIDTH = 400;
  const clampRailWidth = (value: number): number =>
    Math.min(RAIL_MAX_WIDTH, Math.max(RAIL_MIN_WIDTH, Math.round(value)));

  const railResizable = (): boolean =>
    ctx.config.features?.history?.rail?.resizable === true;
  /** Resolved once per widget: storage, else nothing. */
  let railWidthChoice: number | null | undefined;

  // Same teaser pattern as the collapsed state: blocked storage throws rather
  // than fails, so the resolved value is also the in-memory fallback.
  const storedRailWidth = (): number | null => {
    if (railWidthChoice === undefined) {
      railWidthChoice = null;
      if (ctx.config.persistState !== false) {
        try {
          const stored = Number(
            window.localStorage.getItem(`${ctx.currentKeyPrefix()}rail-width`)
          );
          if (stored) railWidthChoice = stored;
        } catch {
          /* blocked storage: the config width stands */
        }
      }
    }
    return railWidthChoice;
  };

  /**
   * Expanded rail width, shared by the column and the floating overlay. A
   * dragged width outranks config, the way the collapsed state does: a live
   * `update()` must not undo what the visitor chose.
   */
  const railWidth = (): number =>
    clampRailWidth(
      storedRailWidth() ?? ctx.config.features?.history?.rail?.width ?? 260
    );

  const setStoredRailWidth = (next: number): void => {
    railWidthChoice = next;
    if (ctx.config.persistState === false) return;
    try {
      window.localStorage.setItem(`${ctx.currentKeyPrefix()}rail-width`, String(next));
    } catch {
      /* blocked storage: the in-memory value above is the fallback */
    }
  };
  /**
   * Overlay mode: the collapsed rail is a trigger in the conversation header
   * plus a floating host, so there is no icon column and no mounted view at
   * rest. `collapsed` then means "not pinned".
   */
  const railOverlayMode = (): boolean =>
    railCollapsible() &&
    ctx.config.features?.history?.rail?.collapsedBehavior === "overlay";
  /** True while the view is mounted in the floating host, not a rail column. */
  let railOverlayOpen = false;

  /** Decorative image for a config-supplied rail icon or brand URL. */
  const railIconImage = (src: string): HTMLImageElement => {
    const image = createElement("img");
    image.src = src;
    image.alt = "";
    image.setAttribute("aria-hidden", "true");
    return image;
  };

  /**
   * One brand declaration, resolved here where the lucide registry lives, into
   * the callback both rail placements call: the expanded heading and the
   * collapsed toggle's rest face. Precedence render > iconUrl > icon; the
   * icon cases resolve once (so an unknown name warns once) and each caller
   * gets its own copy, since both faces can be in the DOM at once.
   */
  const railBrandNode = ():
    | ((collapsed: boolean) => Element | null)
    | undefined => {
    const brand = ctx.config.features?.history?.rail?.brand;
    if (!brand) return undefined;
    let warned = false;
    let mark: Element | null | undefined;
    return (collapsed) => {
      if (brand.render) {
        try {
          return brand.render({ collapsed }) ?? null;
        } catch (error) {
          if (!warned) {
            warned = true;
            console.warn("[persona] history rail brand threw", error);
          }
          return null;
        }
      }
      if (mark === undefined) {
        if (brand.iconUrl) mark = railIconImage(brand.iconUrl);
        else mark = brand.icon ? ctx.renderLucideIcon(brand.icon, 20) : null;
      }
      return mark ? (mark.cloneNode(true) as Element) : null;
    };
  };

  /**
   * Config nav sections, normalized for the size-capped chunk: icon precedence
   * (renderIcon > iconUrl > icon) collapses to one memoized thunk resolved
   * here, where the lucide registry already lives, and every host callback gets
   * a warn-once-per-section guard.
   */
  const configNavSections = (): HistoryRailSection[] =>
    ctx.config.features?.history?.rail?.sections?.map((section) => {
      let warned = false;
      const warn = (error: unknown): void => {
        if (warned) return;
        warned = true;
        console.warn("[persona] history rail section threw", section.id, error);
      };
      return {
        id: section.id,
        title: section.title,
        placement: section.placement ?? "above-conversations",
        items: section.items.map((item) => {
          // Built on first paint and cached: an unknown lucide name warns once,
          // and a presentation flip reuses the node it made.
          let node: Element | null | undefined;
          return {
            id: item.id,
            label: item.label,
            badge: item.badge,
            iconNode: (): Element | null => {
              if (node !== undefined) return node;
              try {
                if (item.renderIcon) node = item.renderIcon() ?? null;
                else if (item.iconUrl) node = railIconImage(item.iconUrl);
                else node = item.icon ? ctx.renderLucideIcon(item.icon, 20) : null;
              } catch (error) {
                warn(error);
                node = null;
              }
              return node;
            },
            onSelect: () => {
              try {
                item.onSelect();
              } catch (error) {
                warn(error);
              }
            },
          };
        }),
      };
    }) ?? [];

  /** One array for the chunk: config sections first in each placement bucket. */
  const railNavSections = (
    pluginSections: HistoryRailSection[]
  ): HistoryRailSection[] | undefined => {
    const sections = configNavSections();
    for (const section of pluginSections) {
      // Config owns the id space; a colliding plugin section is dropped.
      if (sections.some((existing) => existing.id === section.id)) {
        console.warn("[persona] duplicate history rail section id", section.id);
      } else sections.push(section);
    }
    return sections.length ? sections : undefined;
  };

  /** Resolved once per widget: storage, else the configured default. */
  let railCollapsed: boolean | null = null;

  const railCollapseKey = (): string => `${ctx.currentKeyPrefix()}rail-collapsed`;

  // localStorage access throws (not just fails) in Safari private mode and
  // partitioned iframes, so the resolved value is also the in-memory fallback.
  const isRailCollapsed = (): boolean => {
    if (railCollapsed === null) {
      railCollapsed = ctx.config.features?.history?.rail?.defaultCollapsed === true;
      if (ctx.config.persistState !== false) {
        try {
          const stored = window.localStorage.getItem(railCollapseKey());
          if (stored) railCollapsed = stored === "1";
        } catch {
          /* blocked storage: the resolved default stands */
        }
      }
    }
    return railCollapsed;
  };

  const setRailCollapsed = (next: boolean): void => {
    railCollapsed = next;
    if (ctx.config.persistState === false) return;
    try {
      window.localStorage.setItem(railCollapseKey(), next ? "1" : "0");
    } catch {
      /* blocked storage: the in-memory value above is the fallback */
    }
  };

  /**
   * Collapsed only ever applies to a collapsible rail presentation, and never
   * in overlay mode, where a mounted rail is always the expanded one.
   */
  const railShowsCollapsed = (): boolean =>
    ctx.historyPresentation === "rail" &&
    railCollapsible() &&
    !railOverlayMode() &&
    isRailCollapsed();

  /** Overlay-mode counterpart, assigned with the overlay controller below. */
  let toggleRailPinned: () => void = () => {};

  const toggleRailCollapsed = (): void => {
    // The rail's own toggle sits where the trigger does, so in overlay mode it
    // is that control: it pins a floating rail and unpins a docked one.
    if (railOverlayMode()) {
      toggleRailPinned();
      return;
    }
    setRailCollapsed(!isRailCollapsed());
    historySurface?.view.setCollapsed(railShowsCollapsed());
    ctx.applyRailChrome();
    // The transcript column resizes beside the anchor; a clamp would bounce it.
    ctx.repinAnchoredMessage();
  };

  /**
   * One declaration, three artifacts: the binding below, the toggle's tooltip
   * hint chip, and its `aria-keyshortcuts`. Null when unset or unparseable.
   */
  const railCollapseShortcut = (): {
    combo: string;
    hint: string;
    aria: string;
  } | null => {
    const combo = ctx.config.features?.history?.rail?.collapseShortcut;
    if (!combo || !parseCombo(combo)) return null;
    return { combo, hint: formatCombo(combo), aria: ariaCombo(combo) };
  };

  // --- collapsed rail as a floating overlay --------------------------------
  //
  // Rest state is a trigger at the leading edge of the conversation header and
  // nothing else: no column, no mounted view, and the history chunk unloaded
  // until a hover warms it. The pointer entering floats the expanded rail over
  // the conversation; clicking pins it back into the full-height column.

  /** Grace before a pointer that left both surfaces dismisses the rail. */
  const RAIL_OVERLAY_GRACE_MS = 300;
  /**
   * Gap from the trigger, the docked edge and the bottom. A var reference, not
   * a number, so a live theme update reaches an open overlay unaided.
   */
  const RAIL_OVERLAY_MARGIN = "var(--persona-history-overlay-margin,8px)";

  let railTriggerButton: HTMLButtonElement | null = null;
  let railTriggerWrapper: HTMLElement | null = null;
  /** Docking opens awaiting the history chunk; the trigger hides for them. */
  let railPinPendingOpens = 0;
  let railOverlayHost: HTMLElement | null = null;
  let railGraceTimer: ReturnType<typeof setTimeout> | null = null;
  /** Pointer is over the trigger or over the floating rail. */
  let railPointerInside = false;
  /**
   * Uncovering the trigger re-enters it with no pointer movement at all, which
   * would undo the dismissal that just uncovered it. That synthetic enter
   * arrives within a frame or two of the unmount.
   */
  let railUncoveredUntil = 0;

  /** Touch has no hover to open with, so it taps the overlay open instead. */
  const coarsePointer = (): boolean =>
    window.matchMedia?.("(pointer: coarse)").matches === true;

  /** The trigger stands in for the collapsed rail, so it needs a rail width. */
  const railTriggerApplies = (): boolean =>
    historyAvailable() &&
    railOverlayMode() &&
    (ctx.historyPresentation ?? resolveHistoryPresentation()) === "rail";

  /** Docked in its own column rather than floating over the conversation. */
  const railPinned = (): boolean => ctx.historyVisible && !railOverlayOpen;

  const cancelRailGrace = (): void => {
    if (railGraceTimer !== null) clearTimeout(railGraceTimer);
    railGraceTimer = null;
  };

  /** Keyboard focus warms without opening; Enter and Space commit. */
  const warmHistoryChunk = (): void => {
    // A failed load just leaves the overlay closed; the loader retries later.
    void ctx.loadHistoryView().catch(() => {});
  };

  /** Leaving both surfaces dismisses, but only after a grace to come back in. */
  const scheduleRailOverlayClose = (): void => {
    cancelRailGrace();
    if (!railOverlayOpen) return;
    railGraceTimer = setTimeout(() => {
      railGraceTimer = null;
      if (railPointerInside || !railOverlayOpen) return;
      // A keyboard visitor inside the floating rail never loses it to a stray
      // pointer leaving the widget.
      if (railOverlayHost?.contains(document.activeElement)) return;
      // A pointer dismissal moves focus no more than a pointer open does.
      closeHistory({ restoreFocus: false });
    }, RAIL_OVERLAY_GRACE_MS);
  };

  /**
   * Hover keep-alive is geometric, not element-based: a pointer travelling
   * from the trigger to the rail crosses the conversation header, which is
   * neither. The safe zone is the trigger, the rail, and the bridge between
   * them: the rail's own horizontal extent, from the trigger's row down to the
   * rail's top edge. Derived from the live rects, so a right-docked rail needs
   * no separate case.
   */
  const inRailSafeZone = (x: number, y: number): boolean => {
    const rail = railOverlayHost?.getBoundingClientRect();
    if (!rail) return false;
    const row = railTriggerButton?.getBoundingClientRect();
    // The rail and the bridge are one band: the rail's own width, from the
    // trigger's row down to the rail's bottom. The trigger is its own rect.
    const top = row ? Math.min(row.top, rail.top) : rail.top;
    return (
      (x >= rail.left && x <= rail.right && y >= top && y <= rail.bottom) ||
      (!!row && x >= row.left && x <= row.right && y >= row.top && y <= row.bottom)
    );
  };

  const handleRailPointerMove = (event: PointerEvent): void => {
    if (!railOverlayOpen) return;
    railPointerInside = inRailSafeZone(event.clientX, event.clientY);
    if (railPointerInside) cancelRailGrace();
    // Re-arming on every outside move would restart the countdown forever.
    else if (railGraceTimer === null) scheduleRailOverlayClose();
  };

  /**
   * No dwell: the rail answers the pointer the moment it arrives, as fast as
   * the chunk allows (already loaded, that is the same frame). The 300ms leave
   * grace is what an accidental pass over the trigger costs.
   */
  const openRailOverlay = (opts?: { keyboard?: boolean }): void => {
    if (ctx.historyVisible || !railTriggerApplies()) return;
    railOverlayOpen = true;
    void openHistory({
      invoker: railTriggerButton,
      keyboard: opts?.keyboard === true,
    }).then(() => {
      // The chunk can resolve after the pointer left, or not resolve at all.
      if (!ctx.historyVisible) railOverlayOpen = false;
      else if (!railPointerInside && document.activeElement !== railTriggerButton) {
        closeHistory();
      }
    });
  };

  /**
   * Floating, the rail's own toggle pins instead of collapsing, so it wears
   * the expand label; docked, it says collapse again.
   */
  const syncRailToggleLabel = (): void => {
    // The mounted element, not the surface: the first ctx.mount happens inside the
    // surface constructor, before `historySurface` is assigned.
    const toggle = historyMountedElement?.querySelector(
      '[data-persona-history-focus="collapse"]'
    );
    if (!toggle) return;
    toggle.setAttribute(
      "aria-label",
      railOverlayOpen
        ? historyShellCopy.expandLabel
        : historyShellCopy.collapseLabel
    );
    toggle.setAttribute("aria-expanded", railOverlayOpen ? "false" : "true");
  };

  /**
   * Pin: the floating rail gives way to the full-height column, moving the
   * SAME view element when one is already open.
   */
  const pinRail = (): void => {
    setRailCollapsed(false);
    const surface = historySurface;
    if (!railOverlayOpen || !surface) {
      void openHistory({ invoker: railTriggerButton });
      return;
    }
    const refocus = document.activeElement === railTriggerButton;
    railOverlayOpen = false;
    unmountHistoryHosts();
    // Detach before re-hosting, exactly as the panel/rail move does.
    surface.element.remove();
    mountHistoryElement(surface.element);
    syncRailToggleLabel();
    // The trigger stands down beside the rail's own toggle, so keyboard focus
    // has to follow the control there.
    if (refocus) focusHistoryEntry();
    ctx.repinAnchoredMessage();
    syncHistoryChromeImpl();
  };

  /** Unpin: the column closes and the trigger takes the control back. */
  const unpinRail = (): void => {
    setRailCollapsed(true);
    closeHistory();
  };

  toggleRailPinned = (): void => {
    if (!ctx.historyVisible || railOverlayOpen) pinRail();
    else unpinRail();
  };

  /**
   * The sidebar glyph, plainly. `rail.brand` belongs to the icon column, which
   * has no other identity, and to the rail's own header; this control sits in
   * a conversation header that already carries the agent's.
   */
  const buildRailTrigger = (): void => {
    const shortcut = railCollapseShortcut();
    const parts = ctx.createHeaderIconButton({
      ariaLabel: historyShellCopy.expandLabel,
      iconName: "panel-left",
      wrapperClassName:
        "persona-relative persona-inline-flex persona-items-center persona-justify-center",
      extraClassName: "persona-rail-trigger",
      // Hovering answers with the rail itself; a bubble would race the flyover.
      // The combo stays discoverable on the floating rail's own toggle.
      tooltip: false,
      attrs: {
        "data-persona-rail-trigger": "",
        "aria-controls": historyRegionId,
        ...(shortcut ? { "aria-keyshortcuts": shortcut.aria } : {}),
      },
    });
    const button = parts.button;
    button.addEventListener("mouseenter", () => {
      railPointerInside = true;
      cancelRailGrace();
      if (coarsePointer() || Date.now() < railUncoveredUntil) return;
      openRailOverlay();
    });
    button.addEventListener("mouseleave", () => {
      railPointerInside = false;
      // A real departure ends the hold-off: the next enter is intent.
      railUncoveredUntil = 0;
      scheduleRailOverlayClose();
    });
    // Focus only warms: Enter and Space are how a keyboard visitor commits.
    button.addEventListener("focus", () => {
      if (!ctx.historyVisible) warmHistoryChunk();
    });
    button.addEventListener("click", (event) => {
      if (!historyAvailable()) return;
      // Touch taps the overlay open first and pins on a second tap. A pointer
      // that can hover is already looking at the rail, and Enter/Space (a click
      // with detail 0) is a commitment either way, so both pin outright.
      if (event.detail !== 0 && coarsePointer() && !ctx.historyVisible) {
        openRailOverlay();
      } else pinRail();
    });
    railTriggerButton = button;
    railTriggerWrapper = parts.wrapper;
  };

  /**
   * The trigger is chrome, not surface state: it exists whenever a collapsed
   * overlay rail could be opened, and stands down only while the rail is
   * docked, where the rail's own header toggle is the same control.
   */
  const syncRailOverlayTrigger = (): void => {
    // A header rebuild detaches it; a stale ref must not block recreation.
    if (railTriggerWrapper && !railTriggerWrapper.isConnected) {
      railTriggerWrapper = null;
      railTriggerButton = null;
    }
    if (!railTriggerApplies()) {
      railTriggerWrapper?.remove();
      railTriggerWrapper = null;
      railTriggerButton = null;
      return;
    }
    if (!railTriggerButton) buildRailTrigger();
    const wrapper = railTriggerWrapper;
    const button = railTriggerButton;
    if (!wrapper || !button) return;
    // Leading edge of the conversation header, mirrored for a right rail.
    const lead = railSide() !== "right" ? ctx.header.firstChild : null;
    if ((lead ?? ctx.header.lastChild) !== wrapper) ctx.header.insertBefore(wrapper, lead);
    wrapper.style.display =
      railPinned() || railPinPendingOpens > 0 ? "none" : "";
    button.setAttribute("aria-label", historyShellCopy.expandLabel);
    button.setAttribute("aria-expanded", ctx.historyVisible ? "true" : "false");
    // The floating rail hangs from this control, so a rebuild or a resize that
    // moved it re-anchors what is already open.
    if (railOverlayHost) ctx.applyRailChrome();
  };

  /**
   * Click outside dismisses the floating rail. Portaled surfaces it opened
   * itself (row menus, confirmations) are not "outside" it.
   */
  const handleRailOverlayPointerDown = (event: Event): void => {
    if (!railOverlayOpen) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (railOverlayHost?.contains(target) || railTriggerWrapper?.contains(target)) {
      return;
    }
    if (
      target instanceof Element &&
      target.closest('.persona-dropdown-menu,[role="alertdialog"]')
    ) {
      return;
    }
    closeHistory({ restoreFocus: false });
  };
  document.addEventListener("pointerdown", handleRailOverlayPointerDown, true);
  ctx.destroyCallbacks.push(() => {
    document.removeEventListener("pointerdown", handleRailOverlayPointerDown, true);
    // Attached only while the rail floats; removing an unattached one is free.
    document.removeEventListener("pointermove", handleRailPointerMove);
    railResizeRelease?.();
    cancelRailGrace();
  });

  // --- drag-resize of the docked rail --------------------------------------

  let railResizeHandle: HTMLElement | null = null;
  /** Ends an in-flight drag: its listeners are on the document, not the handle. */
  let railResizeRelease: (() => void) | null = null;
  /** Arrow-key step, matching the reference sidebar's coarse nudge. */
  const RAIL_RESIZE_STEP = 16;

  const commitRailWidth = (next: number): void => {
    setStoredRailWidth(clampRailWidth(next));
    ctx.applyRailChrome();
    // The transcript resized beside the anchor; a clamp would bounce it.
    ctx.repinAnchoredMessage();
  };

  /** Mirrors the artifact split handle: pointer capture, document-level drag. */
  const buildRailResizeHandle = (): HTMLElement => {
    const handle = createElement("div", "persona-rail-resizer");
    handle.tabIndex = 0;
    handle.setAttribute("role", "separator");
    handle.setAttribute("aria-orientation", "vertical");
    handle.setAttribute("aria-valuemin", String(RAIL_MIN_WIDTH));
    handle.setAttribute("aria-valuemax", String(RAIL_MAX_WIDTH));

    handle.addEventListener("pointerdown", (event) => {
      const host = railHost;
      if (!host || event.button !== 0) return;
      event.preventDefault();
      railResizeRelease?.();
      const startX = event.clientX;
      const startWidth = host.getBoundingClientRect().width || railWidth();
      // A leading rail widens as the pointer travels right; a trailing one
      // mirrors that.
      const direction = railSide() === "right" ? -1 : 1;
      let width = startWidth;
      const doc = ctx.mount.ownerDocument;
      // The collapse animation is a transition on this very basis; left on, it
      // would trail the pointer for the whole drag.
      host.style.transition = "none";
      const onMove = (move: PointerEvent): void => {
        width = clampRailWidth(startWidth + direction * (move.clientX - startX));
        // Straight onto the basis: a chrome pass per pointer move is waste.
        host.style.flex = `0 0 ${width}px`;
        handle.setAttribute("aria-valuenow", String(width));
      };
      const onUp = (): void => {
        railResizeRelease = null;
        doc.removeEventListener("pointermove", onMove);
        doc.removeEventListener("pointerup", onUp);
        doc.removeEventListener("pointercancel", onUp);
        host.style.removeProperty("transition");
        try {
          handle.releasePointerCapture(event.pointerId);
        } catch {
          /* the capture may already be gone */
        }
        commitRailWidth(width);
      };
      railResizeRelease = onUp;
      doc.addEventListener("pointermove", onMove);
      doc.addEventListener("pointerup", onUp);
      doc.addEventListener("pointercancel", onUp);
      try {
        handle.setPointerCapture(event.pointerId);
      } catch {
        /* pointer capture is an enhancement, not the mechanism */
      }
    });

    handle.addEventListener("keydown", (event) => {
      // Arrows track the visual direction, so a trailing rail inverts them.
      const step = railSide() === "right" ? -RAIL_RESIZE_STEP : RAIL_RESIZE_STEP;
      const width = railWidth();
      const next =
        event.key === "ArrowRight"
          ? width + step
          : event.key === "ArrowLeft"
            ? width - step
            : event.key === "Home"
              ? RAIL_MIN_WIDTH
              : event.key === "End"
                ? RAIL_MAX_WIDTH
                : null;
      if (next === null) return;
      event.preventDefault();
      commitRailWidth(next);
    });
    return handle;
  };

  /** Docked and expanded only: the floating rail and the icon column never resize. */
  const syncRailResizeHandle = (
    shell: HTMLElement,
    before: HTMLElement
  ): void => {
    if (!railResizable() || railShowsCollapsed()) {
      railResizeRelease?.();
      railResizeHandle?.remove();
      return;
    }
    const handle = railResizeHandle ?? buildRailResizeHandle();
    railResizeHandle = handle;
    handle.setAttribute("aria-label", historyShellCopy.resizeLabel);
    handle.setAttribute("aria-valuenow", String(railWidth()));
    // Between the two, on the edge the divider already faces.
    if (handle.nextElementSibling !== before) shell.insertBefore(handle, before);
  };

  /**
   * Rail geometry is config-derived, so it must be re-derivable: a live
   * `update()` of `rail.width` / `rail.side` lands here, not only at ctx.mount.
   */
  ctx.applyRailChrome = (): void => {
    // The bar mirrors the docked edge, so the view hears about a side flip even
    // while it is presenting as a panel.
    historySurface?.view.setRailSide(railSide());
    const trailing = railSide() === "right";
    const overlay = railOverlayHost;
    if (overlay) {
      // Hangs from the trigger's row rather than the widget's top edge, so the
      // trigger stays visible and clickable above it. Measured, since a header
      // rebuild or a resize can move the trigger.
      const below = railTriggerButton
        ? railTriggerButton.getBoundingClientRect().bottom -
          ctx.container.getBoundingClientRect().top
        : 0;
      overlay.style.top = `calc(${Math.max(0, Math.round(below))}px + ${RAIL_OVERLAY_MARGIN})`;
      overlay.style.width = `${railWidth()}px`;
      overlay.style.left = trailing ? "" : RAIL_OVERLAY_MARGIN;
      overlay.style.right = trailing ? RAIL_OVERLAY_MARGIN : "";
    }
    const host = railHost;
    const shell = railShell;
    const column = railColumn;
    if (!host || !shell || !column) return;
    host.style.flex = `0 0 ${
      railShowsCollapsed() ? RAIL_COLLAPSED_WIDTH : railWidth()
    }px`;
    // The divider always faces the conversation, whichever edge the rail took.
    const divider = "1px solid var(--persona-divider,#e5e7eb)";
    host.style.borderRight = trailing ? "" : divider;
    host.style.borderLeft = trailing ? divider : "";
    const leading = trailing ? column : host;
    // Reorder only on an actual side flip: re-parenting blurs what it moves.
    if (shell.firstElementChild !== leading) {
      shell.append(leading, trailing ? host : column);
    }
    syncRailResizeHandle(shell, trailing ? host : column);
  };

  /**
   * Rail is a shell-owned navigation column running the FULL widget height
   * beside a still-operable conversation: the shell header, `body`, the
   * in-container composer and any top-right action wrappers move into a column
   * next to the host, and the shell takes the header's old container slot.
   */
  const mountRailHost = (element: HTMLElement): void => {
    // A pending docking open already built the shell around a placeholder;
    // the arriving view takes its slot with no reflow around it.
    if (railPlaceholder && railHost) {
      railPlaceholder.replaceWith(element);
      railPlaceholder = null;
      ctx.applyRailChrome();
      return;
    }
    const shell = createElement("div", "persona-history-rail-shell");
    shell.style.cssText = "display:flex;flex-direction:row;flex:1 1 auto;min-height:0";
    const column = createElement("div", "persona-history-rail-conversation");
    // position: top-right close/clear wrappers anchor here instead of the
    // container, or they would float over the rail.
    column.style.cssText =
      "display:flex;flex-direction:column;flex:1 1 auto;min-width:0;min-height:0;position:relative";
    // The collapse transition is a rule in the history chunk's stylesheet: an
    // inline one could not carry the reduced-motion query.
    const host = createElement("div", "persona-history-rail-host");
    host.style.cssText = "display:flex;min-height:0;overflow:hidden";

    ctx.container.insertBefore(shell, ctx.header.parentNode === ctx.container ? ctx.header : ctx.body);
    for (const node of railBorrowed()) {
      if (node?.parentNode === ctx.container) column.appendChild(node);
    }
    shell.append(host, column);
    host.appendChild(element);
    railShell = shell;
    railHost = host;
    railColumn = column;
    ctx.applyRailChrome();
  };

  /**
   * Space reservation for a docking open that still awaits the chunk: the full
   * rail shell mounts around an empty stand-in at the final width, so the
   * conversation and its header paint at their docked geometry from the first
   * frame instead of being pushed over when the view lands.
   */
  const mountRailPlaceholder = (): void => {
    if (railShell) return;
    const placeholder = createElement(
      "div",
      "persona-history-rail-placeholder"
    );
    placeholder.style.cssText = "flex:1 1 auto;min-height:0";
    railPlaceholder = placeholder;
    mountRailHost(placeholder);
    ctx.repinAnchoredMessage();
  };

  /** Hands the reserved column back (failed or re-presented open). */
  const clearRailPlaceholder = (): void => {
    if (!railPlaceholder) return;
    unmountHistoryHosts();
    ctx.repinAnchoredMessage();
  };

  /**
   * Floating host for the collapsed overlay rail: the expanded view elevated
   * over a conversation that keeps its own layout, so nothing is borrowed and
   * nothing reflows around it.
   */
  const mountRailOverlayHost = (element: HTMLElement): void => {
    const host = createElement("div", "persona-history-rail-overlay");
    // Every themeable value is a var() reference with its default in the
    // fallback, so an unset token costs nothing and a live one lands at once.
    host.style.cssText =
      `position:absolute;bottom:${RAIL_OVERLAY_MARGIN};` +
      `display:flex;overflow:hidden;z-index:${PORTALED_OVERLAY_Z_INDEX - 1};` +
      "border-radius:var(--persona-history-overlay-radius,16px);" +
      "background:var(--persona-history-overlay-bg,var(--persona-container,#f7f7f8));" +
      "box-shadow:var(--persona-history-overlay-shadow,0 12px 40px rgba(0,0,0,0.25))";
    // The conversation column already relies on a positioned container.
    ctx.container.style.position = "relative";
    ctx.container.appendChild(host);
    host.appendChild(element);
    // The safe zone spans nodes the rail does not own, so hover is tracked by
    // position for as long as it is open.
    document.addEventListener("pointermove", handleRailPointerMove);
    railOverlayHost = host;
    ctx.applyRailChrome();
    syncRailToggleLabel();
  };

  const unmountHistoryHosts = (): void => {
    restorePanelHost?.();
    if (railOverlayHost) {
      // Dismissed under the pointer: hold the hover off until the synthetic
      // enter from uncovering the trigger has passed.
      if (railPointerInside) railUncoveredUntil = Date.now() + 150;
      document.removeEventListener("pointermove", handleRailPointerMove);
      railOverlayHost.remove();
      railOverlayHost = null;
    }
    const shell = railShell;
    if (shell) {
      // A drag in flight owns document listeners the host is about to lose.
      railResizeRelease?.();
      // Live bindings, in panel order, before the slot the shell took. A header
      // restored first also takes its inline action wrappers back with it, so
      // the `contains` check skips them.
      for (const node of railBorrowed()) {
        if (node && shell.contains(node)) ctx.container.insertBefore(node, shell);
      }
      shell.remove();
      railShell = null;
      railHost = null;
      railColumn = null;
      railPlaceholder = null;
    }
  };

  /** Shell-owned chrome applied to whatever element arbitration produced. */
  const prepareHistoryElement = (element: HTMLElement): void => {
    historyMountedElement = element;
    element.id = historyRegionId;
    // Host-side flex sizing: the chunk sizes itself to 100%, the shell decides
    // how it participates in the column/row it was just dropped into.
    element.style.flex = "1 1 auto";
    element.style.minHeight = "0";
  };

  /** The chunk owns its own classes/labels; the shell only picks the host. */
  const mountHistoryElement = (element: HTMLElement): void => {
    prepareHistoryElement(element);
    // The open that reserved the column can resolve to another host (a width
    // change mid-load re-presents as panel); the stand-in must not outlive it.
    if (ctx.historyPresentation !== "rail" || railOverlayOpen) {
      clearRailPlaceholder();
    }
    if (ctx.historyPresentation !== "rail") mountPanelHost(element);
    else if (railOverlayOpen) mountRailOverlayHost(element);
    else mountRailHost(element);
  };

  /**
   * Live rail <-> panel transition. ONE view instance survives the move, so the
   * list, its fixed operation context, and any pending work are preserved. A
   * custom full view is re-invoked with the new presentation value.
   */
  const syncHistoryPresentation = (): void => {
    // The trigger belongs to a rail-capable width, so it resolves here too, and
    // the header toggle stands down beside whatever it resolved to.
    syncRailOverlayTrigger();
    syncHistoryButton();
    if (!ctx.historyVisible || !historySurface) return;
    const next = resolveHistoryPresentation();
    if (next === ctx.historyPresentation) return;
    const focusKey = document.activeElement;
    // The bar's contents may be focused inside the shell header, not the view.
    const refocus =
      focusKey instanceof HTMLElement &&
      (historySurface.element.contains(focusKey) ||
        historyHeaderHost?.contains(focusKey) === true)
        ? focusKey
        : null;
    unmountHistoryHosts();
    // Detach before re-hosting so a mid-move re-arbitration cannot re-insert
    // the surface into the host it is being moved out of.
    historySurface.element.remove();
    // Rail is always inline; the panel host re-externalizes on ctx.mount.
    historySurface.view.setHeaderPlacement("inline");
    ctx.historyPresentation = next;
    historySurface.view.setPresentation(next);
    // Panel always shows the whole list; returning to rail restores the state.
    historySurface.view.setCollapsed(railShowsCollapsed());
    historySurface.requestRender();
    if (!historySurface.element.isConnected) {
      mountHistoryElement(historySurface.element);
    }
    if (refocus?.isConnected) refocus.focus();
    else focusHistoryEntry();
    ctx.syncScrollToBottomButton();
    // A one-frame layout removal above the anchored message clamps scrollTop.
    ctx.repinAnchoredMessage();
    syncHistoryChromeImpl();
  };

  // --- open / close --------------------------------------------------------

  /** The bar lives in the shell header while it is hosted there. */
  const queryHistoryOwned = <T extends HTMLElement>(
    element: HTMLElement,
    selector: string
  ): T | null =>
    historyHeaderHost?.querySelector<T>(selector) ??
    element.querySelector<T>(selector);

  const focusHistoryEntry = (): void => {
    const element = historySurface?.element ?? historyMountedElement;
    if (!element) return;
    const close = queryHistoryOwned(
      element,
      // The rail's leading control is a collapse toggle, not a close.
      '[data-persona-history-focus="close"],[data-persona-history-focus="collapse"]'
    );
    if (close) {
      close.focus();
      return;
    }
    const heading =
      queryHistoryOwned<HTMLElement>(element, ".persona-history-title") ??
      // Custom contents may expose neither: the region itself is the fallback.
      element;
    heading.tabIndex = -1;
    heading.focus();
  };

  const openHistory = async (opts?: {
    returnSurface?: HistoryReturnSurface;
    invoker?: HTMLElement | null;
    /** Rail only: an open with no keyboard behind it must not move focus. */
    keyboard?: boolean;
    /** `false` skips the entry focus entirely (programmatic/preview opens). */
    focus?: boolean;
  }): Promise<void> => {
    if (!historyAvailable() || ctx.historyVisible) return;
    const provider = historyProvider;
    if (!provider) return;
    // An unpinned overlay rail IS its trigger, so restoring that state must
    // render chrome only: no surface, and no chunk fetched for it.
    if (!railOverlayOpen && railTriggerApplies() && isRailCollapsed()) {
      syncRailOverlayTrigger();
      return;
    }
    // A reopen mid-exit finishes the outgoing teardown first: never two
    // surfaces, never a restore that lands after this one mounts.
    settleHistoryExit();
    const token = ++historyOpenToken;
    historyReturnSurface = opts?.returnSurface ?? "conversation";
    historyInvoker = opts?.invoker ?? historyButton;

    // An open that will dock the rail takes its final geometry for the chunk
    // load: the trigger hides (painted, the glyph flashes at the header's
    // leading edge and then jumps to the mounted rail's own toggle) and the
    // column is reserved (unreserved, the conversation header paints at the
    // widget edge and is pushed over when the rail lands).
    const pinPending = railTriggerApplies() && !railOverlayOpen;
    if (pinPending) {
      railPinPendingOpens += 1;
      syncRailOverlayTrigger();
      mountRailPlaceholder();
    }
    let module: Awaited<ReturnType<typeof loadHistoryView>>;
    try {
      module = await ctx.loadHistoryView();
    } catch {
      // Lazy-chunk failure keeps the invoking surface interactive and retryable.
      ctx.announceHistory(historyShellCopy.openHistoryLabel);
      if (pinPending) {
        railPinPendingOpens -= 1;
        // A superseded open leaves the shared chrome to its successor.
        if (token === historyOpenToken) {
          clearRailPlaceholder();
          syncRailOverlayTrigger();
        }
      }
      return;
    }
    if (pinPending) railPinPendingOpens -= 1;
    if (token !== historyOpenToken || ctx.historyVisible) return;

    // One scope for the whole opened view; every operation reuses it.
    historyOperationContext = { scope: historyScope() };
    ctx.historyPresentation = resolveHistoryPresentation();
    ctx.historyVisible = true;

    // Built externally when there is a shell header to host it in; the panel
    // host re-decides on ctx.mount, so this only avoids a needless first insert.
    const initialHeaderPlacement: HistoryHeaderPlacement =
      ctx.historyPresentation === "panel" &&
      ctx.config.layout?.showHeader !== false &&
      ctx.header.style.display !== "none"
        ? "external"
        : "inline";

    const rowAvatar = ctx.config.features?.history?.rowAvatar;
    const shortcut = railCollapseShortcut();
    const collapseShortcutStrings = shortcut
      ? { hint: shortcut.hint, aria: shortcut.aria }
      : null;

    const baseViewOptions: HistoryViewOptions = {
      provider,
      context: historyOperationContext,
      targetId: activeHistoryTargetId(),
      presentation: ctx.historyPresentation,
      collapsible: railCollapsible(),
      collapsed: railShowsCollapsed(),
      railSide: railSide(),
      renderRailHeader: ctx.config.features?.history?.rail?.renderHeader,
      railBrand: railBrandNode(),
      onToggleCollapse: toggleRailCollapsed,
      // Formatted strings only: the size-capped chunk never imports shortcuts.
      ...(collapseShortcutStrings
        ? { collapseShortcut: collapseShortcutStrings }
        : {}),
      headerPlacement: initialHeaderPlacement,
      showScopeStatus: ctx.config.features?.history?.showScopeStatus !== false,
      showDelete: ctx.config.features?.history?.showDelete !== false,
      showDeleteAll: ctx.config.features?.history?.showDeleteAll !== false,
      ...(ctx.config.features?.history?.listActions?.length
        ? { listActions: ctx.config.features.history.listActions }
        : {}),
      // Rows borrow the launcher's IMAGE mark only: agentIconText carries the
      // merged 💬 default, which would put a placeholder glyph on every row.
      // No mark at all means text-only rows, the assistant-list default.
      rowAvatar:
        rowAvatar === false
          ? false
          : typeof rowAvatar === "string"
            ? rowAvatar
            : ctx.config.launcher?.iconUrl,
      activeConversationId: ctx.session.getActiveConversationId(),
      ...(ctx.config.features?.history?.grouping
        ? { grouping: ctx.config.features.history.grouping }
        : {}),
      ...(ctx.config.features?.history?.copy
        ? { copy: ctx.config.features.history.copy }
        : {}),
      ...(ctx.config.features?.history?.pageSize !== undefined
        ? { pageSize: ctx.config.features.history.pageSize }
        : {}),
      // The pending/error surface owns failures (optimistic open), so the
      // row must not double-report them.
      onSelect: (conversationId) =>
        openHistoryConversation(conversationId, { focusComposer: true }).catch(
          () => {}
        ),
      onActiveConversationChange: (summary) =>
        ctx.setActiveConversationSummary(summary),
      // The chunk is size-capped, so it borrows the shell's tooltip module.
      attachTooltip: ctx.attachTooltip,
      onStartNew: () => startNewConversation({ focusComposer: true }),
      onClose: () => closeHistory(),
      onRequestDeleteConversation: (conversationId) =>
        requestDeleteConversation(conversationId),
      onRequestClearHistory: () => requestClearConversationHistory(),
      ...(provider.resetDevice
        ? { onRequestResetIdentity: () => requestResetHistoryIdentity() }
        : {}),
    };

    // Plugin hooks arbitrate around the default view; the shell keeps placement,
    // open/close, Escape, confirmations, announcements, and focus.
    historySurface = createHistoryRenderSurface({
      plugins: ctx.plugins,
      config: ctx.config,
      getPresentation: () => ctx.historyPresentation ?? "panel",
      getReturnSurface: () => historyReturnSurface,
      close: () => closeHistory(),
      createView: ({ slots, renderDom, onModelChange, railSections }) => {
        // Tracked before `historySurface` is assigned: the first ctx.mount happens
        // inside this constructor and already needs the handle.
        historyViewHandle = module.createHistoryView({
          ...baseViewOptions,
          railSections: railNavSections(railSections),
          slots,
          renderDom,
          onModelChange,
          onAnnounce: ctx.announceHistory,
        });
        return historyViewHandle;
      },
      onElementChanged: (next, previous) => {
        if (!previous?.isConnected) return mountHistoryElement(next);
        prepareHistoryElement(next);
        previous.replaceWith(next);
        // Default <-> custom re-arbitration changes who owns the bar.
        enforcePanelHost();
      },
    });
    historySurface.view.setNewConversationRequired(
      ctx.historySessionState.recovery === "new_conversation_required"
    );
    // The panel makes the conversation inert behind it, so it always takes
    // focus. The rail leaves it operable: a pointer or programmatic open would
    // only leave a keyboard ring on the toggle, so it keeps focus where it is.
    // `focus: false` opts out entirely: the caller owns focus (preview replay).
    if (
      opts?.focus !== false &&
      (ctx.historyPresentation !== "rail" || opts?.keyboard === true)
    ) {
      focusHistoryEntry();
    }
    ctx.syncScrollToBottomButton();
    ctx.repinAnchoredMessage();
    syncHistoryChromeImpl();
    ctx.eventBus.emit("history:opened", {
      presentation: ctx.historyPresentation,
      returnSurface: historyReturnSurface,
      timestamp: Date.now(),
    });
  };

  /**
   * Close is: exit animation -> unmount and restore the hidden chrome ->
   * restore focus. The teardown half is deferred behind the view's `playExit()`
   * promise, so it is exposed here for whoever preempts it (a reopen, a widget
   * teardown). Idempotent, and a no-op while nothing is leaving.
   */
  let settleHistoryExit: () => void = () => {};

  const closeHistory = (opts?: { restoreFocus?: boolean }): void => {
    if (!ctx.historyVisible) return;
    historyOpenToken += 1;
    const returnSurface = historyReturnSurface;
    const invoker = historyInvoker;
    const surface = historySurface;
    const restoreInvokerFocus = opts?.restoreFocus !== false;
    // Flipped before the animation: a second close is a no-op and a reopen
    // mounts fresh rather than re-entering the surface that is leaving.
    ctx.historyVisible = false;

    let done = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = (): void => {
      if (done) return;
      done = true;
      settleHistoryExit = () => {};
      if (timer !== null) clearTimeout(timer);
      // The floating rail is torn down with the surface it hosted.
      railOverlayOpen = false;
      cancelRailGrace();
      // Before focus restoration below: the invoker lives in the shell header,
      // which is inert until this restores it.
      unmountHistoryHosts();
      // Dispose before destroy: cleanups belong to the render being torn down.
      surface?.dispose();
      surface?.view.destroy();
      surface?.element.remove();
      // A reopen that preempted this exit already owns the shell state.
      if (historySurface === surface) {
        historySurface = null;
        historyViewHandle = null;
        historyMountedElement = null;
        ctx.historyPresentation = null;
        historyOperationContext = null;
        historyInvoker = null;
      }
      ctx.syncScrollToBottomButton();
      // Removing a full-height host above the anchored message clamps scrollTop.
      ctx.repinAnchoredMessage();
      syncHistoryChromeImpl();
      if (restoreInvokerFocus) {
        const target = invoker ?? historyButton;
        if (target?.isConnected) target.focus();
        else ctx.maybeFocusInput();
      }
      ctx.eventBus.emit("history:closed", { returnSurface, timestamp: Date.now() });
    };

    // Only the arbitrated default view animates: a plugin full view owns its
    // own element and never got an entrance either.
    const exit =
      surface && surface.element === surface.view.element
        ? surface.view.playExit()
        : null;
    if (!exit) {
      finish();
      return;
    }
    settleHistoryExit = finish;
    // A cancelled or never-settling animation must never wedge the close.
    timer = setTimeout(finish, HISTORY_EXIT_TIMEOUT_MS);
    void exit.then(finish);
  };

  /** Escape returns to the recorded invoking surface, like the back control. */
  const handleHistoryKeydown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || !ctx.historyVisible || !historySurface) return;
    // Rail leaves the conversation operable: only its own focus closes it, and
    // the floating rail's scope includes the trigger it hangs from.
    if (ctx.historyPresentation === "rail") {
      const target = event.target;
      if (
        !(target instanceof Node) ||
        !(
          historySurface.element.contains(target) ||
          (railOverlayOpen && railTriggerWrapper?.contains(target) === true)
        )
      ) {
        return;
      }
    }
    event.preventDefault();
    event.stopPropagation();
    closeHistory();
  };
  ctx.container.addEventListener("keydown", handleHistoryKeydown);
  ctx.destroyCallbacks.push(() =>
    ctx.container.removeEventListener("keydown", handleHistoryKeydown)
  );

  // --- session operations --------------------------------------------------

  // --- optimistic conversation open ---------------------------------------
  // Selection acknowledges within a frame: the composer gates immediately, the
  // stand-in takes the surface only if the fetch outlasts the show delay, and
  // the transcript hydrates when the fetch lands. The token invalidates a stale
  // resolution after a newer open, a new conversation, or a failure the visitor
  // navigated away from.
  let conversationOpenToken = 0;
  // Show delay: opens that land inside it swap straight from the welcome or the
  // previous conversation to the loaded transcript, so no skeleton ever flashes.
  const CONVERSATION_OPEN_TAKEOVER_DELAY_MS = 250;
  let conversationOpenTakeoverTimer: ReturnType<typeof setTimeout> | null = null;

  const cancelConversationOpenTakeover = (): void => {
    if (conversationOpenTakeoverTimer) clearTimeout(conversationOpenTakeoverTimer);
    conversationOpenTakeoverTimer = null;
  };
  ctx.destroyCallbacks.push(cancelConversationOpenTakeover);

  /** Hands the surface to the mounted stand-in. Idempotent by re-application. */
  const engageConversationOpenTakeover = (): void => {
    cancelConversationOpenTakeover();
    const element = ctx.conversationOpenPendingEl;
    if (!element) return;
    ctx.conversationOpenTakeover = true;
    element.hidden = false;
    ctx.messagesWrapper.style.display = "none";
    // The welcome is a sibling of the transcript, so hiding the wrapper alone
    // would leave it painted above the stand-in.
    ctx.updateWelcome();
  };

  const clearConversationOpenPending = (): void => {
    conversationOpenToken += 1;
    cancelConversationOpenTakeover();
    if (!ctx.conversationOpenPendingEl) return;
    ctx.conversationOpenPendingEl.remove();
    ctx.conversationOpenPendingEl = null;
    ctx.conversationOpenTakeover = false;
    ctx.messagesWrapper.style.removeProperty("display");
    setHistoryHostInert(ctx.footer, false);
    // Restores the welcome when navigation lands back on an empty transcript.
    ctx.updateWelcome();
  };

  /**
   * Commit fade for the reopened transcript. WAAPI, not a CSS transition: the
   * wrapper is the morph target, and post-render inline state is stripped by
   * every render inside the completion window.
   */
  const fadeInTranscript = (): void => {
    try {
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
        return;
      }
      ctx.messagesWrapper.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 150,
        easing: "ease-out",
      });
    } catch {
      /* environments without WAAPI land the transcript without motion */
    }
  };

  // The stand-in surfaces get the transcript's centered column from their
  // container classes, so the hydrated messages land exactly where they stood.
  const skeletonBubble = (width: string, trailing: boolean): HTMLElement =>
    createNode("div", {
      className: cx(
        "persona-conversation-loading-bubble",
        trailing && "persona-conversation-loading-bubble--trailing"
      ),
      attrs: { "aria-hidden": "true" },
      style: { width },
    });

  const buildConversationOpenSkeleton = (): HTMLElement =>
    createNode(
      "div",
      { className: "persona-conversation-loading-body" },
      skeletonBubble("58%", false),
      skeletonBubble("72%", true),
      skeletonBubble("44%", false)
    );

  const mountConversationOpenState = (element: HTMLElement): void => {
    ctx.conversationOpenPendingEl?.remove();
    ctx.conversationOpenPendingEl = element;
    // The takeover is deferred, so the stand-in mounts hidden; one that replaces
    // an already-engaged stand-in keeps the surface instead of blanking it.
    element.hidden = !ctx.conversationOpenTakeover;
    ctx.body.insertBefore(element, ctx.messagesWrapper);
    cancelConversationOpenTakeover();
    if (!ctx.conversationOpenTakeover) {
      conversationOpenTakeoverTimer = setTimeout(
        engageConversationOpenTakeover,
        CONVERSATION_OPEN_TAKEOVER_DELAY_MS
      );
    }
    // The composer must not send into the conversation being replaced. The
    // panel exit restores the footer after its animation, so the close path
    // re-asserts this gate (see the history:closed re-assert below).
    setHistoryHostInert(ctx.footer, true);
  };

  const showConversationOpenPending = (): void => {
    // Same plugin -> config -> default chain as the streaming indicator. The
    // hook replaces the skeleton only; the container keeps the centered
    // column, the status role, and the composer gate.
    const context: LoadingIndicatorRenderContext = {
      config: ctx.config,
      streaming: false,
      location: "conversation-open",
      defaultRenderer: buildConversationOpenSkeleton,
    };
    let content: HTMLElement | null = null;
    const loadingPlugin = ctx.plugins.find((p) => p.renderLoadingIndicator);
    if (loadingPlugin?.renderLoadingIndicator) {
      content = loadingPlugin.renderLoadingIndicator(context);
    }
    if (content === null && ctx.config.loadingIndicator?.render) {
      content = ctx.config.loadingIndicator.render(context);
    }
    mountConversationOpenState(
      createNode(
        "div",
        {
          className: "persona-conversation-loading",
          attrs: {
            role: "status",
            "aria-label": historyShellCopy.openConversationLoadingLabel,
          },
        },
        content ?? buildConversationOpenSkeleton()
      )
    );
  };

  const showConversationOpenError = (conversationId: string): void => {
    const retry = (): void => {
      void openHistoryConversation(conversationId, {
        focusComposer: true,
      }).catch(() => {});
    };
    const back = historyAvailable()
      ? (): void => {
          clearConversationOpenPending();
          void openHistory();
        }
      : undefined;
    const actionButton = (label: string, onClick: () => void): HTMLElement => {
      const button = createNode("button", {
        className: "persona-conversation-loading-error-action",
        attrs: { type: "button" },
        text: label,
      });
      button.addEventListener("click", onClick);
      return button;
    };
    const buildDefaultBlock = (): HTMLElement =>
      createNode(
        "div",
        { className: "persona-conversation-loading-error-body" },
        createNode("p", {
          className: "persona-conversation-loading-error-title",
          text: historyShellCopy.openConversationErrorTitle,
        }),
        createNode(
          "div",
          { className: "persona-conversation-loading-error-actions" },
          actionButton(historyShellCopy.openConversationRetryLabel, retry),
          back
            ? actionButton(historyShellCopy.openConversationBackLabel, back)
            : null
        )
      );
    // First non-null plugin hook wins (plugins are priority-sorted); a throw
    // is reported and skipped. The container keeps the centered column, the
    // alert role, and the composer gate around whatever the hook returns.
    const context: AgentWidgetRenderHistoryOpenErrorContext = Object.freeze({
      conversationId,
      config: ctx.config,
      copy: Object.freeze({
        title: historyShellCopy.openConversationErrorTitle,
        retryLabel: historyShellCopy.openConversationRetryLabel,
        backLabel: historyShellCopy.openConversationBackLabel,
      }),
      retry,
      ...(back ? { back } : {}),
      defaultRenderer: buildDefaultBlock,
    });
    let content: HTMLElement | null = null;
    for (const plugin of ctx.plugins) {
      if (!plugin.renderHistoryOpenError) continue;
      try {
        content = plugin.renderHistoryOpenError(context);
      } catch (error) {
        console.warn("[persona] renderHistoryOpenError threw", error);
        content = null;
      }
      if (content) break;
    }
    mountConversationOpenState(
      createNode(
        "div",
        {
          className: "persona-conversation-loading-error",
          attrs: { role: "alert" },
        },
        content ?? buildDefaultBlock()
      )
    );
    // A failure must never sit hidden behind the surface it replaces, so the
    // error skips the stand-in's show delay.
    engageConversationOpenTakeover();
  };

  // The panel exit's deferred teardown restores the footer it captured, which
  // would lift the composer gate mid-fetch; re-assert it while an open is
  // still pending.
  ctx.eventBus.on("history:closed", () => {
    if (ctx.conversationOpenPendingEl) setHistoryHostInert(ctx.footer, true);
  });

  /**
   * Optimistic reopen: navigate on the click, hydrate on the fetch. The
   * returned promise keeps the transactional contract (resolves once the
   * transcript is live, rejects on failure) for `controller.openConversation`.
   * `suppressScrollSend` covers the hydration: otherwise the last restored
   * user message triggers the anchor-top send scroll.
   */
  const openHistoryConversation = async (
    conversationId: string,
    { focusComposer = false }: { focusComposer?: boolean } = {}
  ): Promise<void> => {
    const scope = historyOperationScope();
    // Seeds the header title binding from the list row before the list leaves.
    // The surface is usually gone by hydration time (the exit outruns the
    // fetch), so this is the only moment the title can be read from the list.
    const seededFromList = !!historySurface;
    historySurface?.view.setActiveConversationId(conversationId);
    clearConversationOpenPending();
    const token = conversationOpenToken;
    showConversationOpenPending();
    if (ctx.historyVisible && (ctx.historyPresentation === "panel" || railOverlayOpen)) {
      closeHistory({ restoreFocus: false });
    }
    ctx.suppressScrollSend = true;
    try {
      await ctx.session.openConversation(conversationId, { scope });
    } catch (error) {
      if (token === conversationOpenToken) {
        showConversationOpenError(conversationId);
      }
      throw error;
    } finally {
      ctx.suppressScrollSend = false;
    }
    if (token !== conversationOpenToken) return;
    clearConversationOpenPending();
    ctx.messageCache.clear();
    ctx.resetAnchorState();
    ctx.resumeAutoScroll();
    if (!ctx.restoreScrollPosition()) ctx.jumpToBottomInstant();
    // Fades only after the scroll settles, so the motion covers the final frame.
    fadeInTranscript();
    syncEarlierMessagesPill();
    // Without a list at selection time there was no title to seed.
    if (!seededFromList) ctx.setActiveConversationSummary(null);
    ctx.eventBus.emit("history:conversationOpened", {
      conversationId,
      title: ctx.activeConversationTitle,
      scope,
      timestamp: Date.now(),
    });
    // Only interaction paths focus: focusing a programmatic open scrolls the
    // host page to the widget (same-origin iframes included).
    if (focusComposer) ctx.maybeFocusInput();
  };

  /**
   * The single commit path behind the header action, the view's `onStartNew`,
   * and `controller.startNewConversation()`, so one emit covers all three.
   */
  const startNewConversation = async ({
    focusComposer = false,
  }: { focusComposer?: boolean } = {}): Promise<void> => {
    // A new conversation supersedes any transcript fetch still in flight.
    clearConversationOpenPending();
    await ctx.session.startNewConversation({ scope: historyOperationScope() });
    ctx.setActiveConversationSummary(null);
    ctx.messageCache.clear();
    ctx.resetAnchorState();
    ctx.resumeAutoScroll();
    ctx.jumpToBottomInstant();
    syncEarlierMessagesPill();
    const conversationId = ctx.session.getActiveConversationId();
    historySurface?.view.setActiveConversationId(conversationId);
    // Emitted before the close so a host can tell a commit from a plain close.
    ctx.eventBus.emit("history:conversationStarted", {
      conversationId,
      timestamp: Date.now(),
    });
    if (ctx.historyVisible && (ctx.historyPresentation === "panel" || railOverlayOpen)) {
      closeHistory({ restoreFocus: false });
    }
    if (focusComposer) ctx.maybeFocusInput();
  };

  /** Shared rename/star path: provider update, then view + header binding. */
  const updateHistoryConversation = async (
    conversationId: string,
    patch: HistoryConversationPatch
  ): Promise<HistoryConversationSummary> => {
    const summary = await ctx.session.updateConversation(conversationId, {
      ...patch,
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
    });
    // The view re-renders and reports the active title through the reporter;
    // without a mounted view, keep the header binding fresh directly.
    historySurface?.view.applyConversationSummary(summary);
    if (!historySurface && conversationId === ctx.session.getActiveConversationId()) {
      ctx.setActiveConversationSummary(summary);
    }
    return summary;
  };

  const deleteHistoryConversation = async (
    conversationId: string
  ): Promise<void> => {
    const scope = historyOperationScope();
    const wasActive = ctx.session.getActiveConversationId() === conversationId;
    await ctx.session.deleteConversation(conversationId, { scope });
    // Prune the open list too: the view's own delete flow removes its row
    // after this resolves, but built-in/headless deletes have no view caller.
    historySurface?.view.removeConversationSummary(conversationId);
    if (wasActive) {
      ctx.setActiveConversationSummary(null);
      ctx.messageCache.clear();
      ctx.resetAnchorState();
      ctx.resumeAutoScroll();
      syncEarlierMessagesPill();
    }
    ctx.eventBus.emit("history:conversationDeleted", {
      conversationId,
      scope,
      wasActive,
      timestamp: Date.now(),
    });
  };

  const clearConversationHistory = async (opts?: {
    targetId?: string;
    /** Deliberate headless opt-in to the whole authorized client-token scope. */
    allTargets?: boolean;
    scope?: HistoryScope;
  }): Promise<{ deleted: number }> => {
    const scope = opts?.scope ?? historyOperationScope();
    // Default to the same filter the visible list uses; only an explicit
    // headless opt-in deletes conversations the visitor was never shown.
    const targetId = opts?.allTargets
      ? null
      : (opts?.targetId ?? activeHistoryTargetId());
    const result = await ctx.session.clearConversationHistory({
      ...(targetId ? { targetId } : {}),
      scope,
    });
    ctx.setActiveConversationSummary(null);
    ctx.messageCache.clear();
    ctx.resetAnchorState();
    ctx.resumeAutoScroll();
    syncEarlierMessagesPill();
    ctx.eventBus.emit("history:cleared", {
      deleted: result.deleted,
      scope,
      targetId,
      timestamp: Date.now(),
    });
    return result;
  };

  /**
   * D6: the local wipe is UNCONDITIONAL. Records survive on the server; this
   * browser is detached from them whether or not revocation was confirmed.
   */
  const resetHistoryIdentity = async (): Promise<{
    remoteRevocationConfirmed: boolean;
  }> => {
    // Rejection is reserved for misuse; remote failure resolves false.
    if (!historyProvider?.resetDevice) {
      throw new Error(
        "[Persona] resetHistoryIdentity() requires a history provider that can reset this device"
      );
    }
    let remoteRevocationConfirmed = false;
    try {
      const result = await ctx.session.resetHistoryDevice();
      remoteRevocationConfirmed = result.remoteRevocationConfirmed;
    } finally {
      ctx.setActiveConversationSummary(null);
      ctx.session.clearArtifacts();
      ctx.messageCache.clear();
      ctx.lastAppliedMessages = null;
      ctx.config.clearStoredSessionId?.();
      ctx.config.clearStoredConversationId?.();
      ctx.persistentMetadata = {};
      ctx.actionManager.syncFromMetadata();
      const storageAdapter = ctx.storageAdapter;
      if (storageAdapter?.clear) {
        ctx.runStorageMutation(
          () => storageAdapter.clear!(),
          "[AgentWidget] Failed to clear storage adapter:"
        );
      }
      ctx.resetAnchorState();
      ctx.resumeAutoScroll();
      syncEarlierMessagesPill();
      closeHistory({ restoreFocus: false });
      ctx.maybeFocusInput();
      if (!ctx.open) ctx.launcherSurfaceInstance?.launcher.element.focus();
    }
    ctx.announceHistory(
      remoteRevocationConfirmed
        ? historyShellCopy.identityResetNotice
        : historyShellCopy.identityResetUnconfirmedNotice
    );
    ctx.eventBus.emit("history:identityReset", {
      remoteRevocationConfirmed,
      timestamp: Date.now(),
    });
    return { remoteRevocationConfirmed };
  };

  // --- confirmations (shell-owned alert dialogs) ---------------------------

  // With the artifact split, `container` is only the chat column, so an
  // inset:0 overlay there would leave the artifact pane undimmed. The panel
  // wraps the whole split and is already position:relative on that path;
  // forcing `relative` onto it elsewhere would not survive the chrome
  // passes' cssText resets, so plain layouts keep the container host.
  const historyConfirmHost = (): HTMLElement =>
    ctx.artifactSplitRoot ? ctx.panel : ctx.container;

  // The dialog ships in the lazy history-view chunk (usually already warm:
  // these actions start from history UI). A failed load, or a stale CDN chunk
  // that predates the export, degrades to the native confirm so the action
  // still works.
  const showHistoryConfirm = async (
    options: HistoryConfirmOptions
  ): Promise<boolean> => {
    const module = await ctx.loadHistoryView().catch(() => null);
    if (typeof module?.showHistoryConfirm === "function") {
      return module.showHistoryConfirm(options);
    }
    return window.confirm(`${options.title}\n\n${options.description}`);
  };

  const requestDeleteConversation = async (
    conversationId: string
  ): Promise<"deleted" | "cancelled"> => {
    const confirmed = await showHistoryConfirm({
      host: historyConfirmHost(),
      title: historyShellCopy.deleteConversationConfirmTitle,
      description: historyShellCopy.deleteConversationConfirm,
      confirmLabel: historyShellCopy.deleteConversationConfirmLabel,
      cancelLabel: historyShellCopy.confirmCancelLabel,
    });
    if (!confirmed) return "cancelled";
    await deleteHistoryConversation(conversationId);
    return "deleted";
  };

  const requestClearConversationHistory = async (): Promise<
    "cleared" | "cancelled"
  > => {
    // Scope-aware copy: never imply the delete is limited to the rendered page.
    const verified = historyOperationScope() === "verified-user";
    const confirmed = await showHistoryConfirm({
      host: historyConfirmHost(),
      title: historyShellCopy.clearHistoryConfirmTitle,
      description: verified
        ? historyShellCopy.clearHistoryVerifiedConfirm
        : historyShellCopy.clearHistoryConfirm,
      confirmLabel: historyShellCopy.clearHistoryConfirmLabel,
      cancelLabel: historyShellCopy.confirmCancelLabel,
    });
    if (!confirmed) return "cancelled";
    await clearConversationHistory();
    return "cleared";
  };

  const requestResetHistoryIdentity = async (): Promise<
    { outcome: "cancelled" } | { outcome: "reset"; remoteRevocationConfirmed: boolean }
  > => {
    const confirmed = await showHistoryConfirm({
      host: historyConfirmHost(),
      title: historyShellCopy.resetIdentityConfirmTitle,
      description: historyShellCopy.resetIdentityConfirm,
      confirmLabel: historyShellCopy.resetIdentityConfirmLabel,
      cancelLabel: historyShellCopy.confirmCancelLabel,
    });
    if (!confirmed) return { outcome: "cancelled" };
    const { remoteRevocationConfirmed } = await resetHistoryIdentity();
    return { outcome: "reset", remoteRevocationConfirmed };
  };

  // --- "show earlier messages" prepend -------------------------------------

  const earlierMessagesButton = createElement(
    "button",
    "persona-history-earlier"
  ) as HTMLButtonElement;
  earlierMessagesButton.type = "button";
  earlierMessagesButton.textContent = historyShellCopy.showEarlierMessagesLabel;
  earlierMessagesButton.setAttribute("data-persona-history-earlier", "");
  Object.assign(earlierMessagesButton.style, {
    alignSelf: "center",
    minHeight: "44px",
    padding: "0 16px",
    borderRadius: "999px",
    border: "1px solid var(--persona-border, rgba(0,0,0,0.12))",
    background: "transparent",
    color: "inherit",
    font: "inherit",
    cursor: "pointer",
    flexShrink: "0",
  } satisfies Partial<CSSStyleDeclaration>);

  const syncEarlierMessagesPill = (): void => {
    const show =
      historyAvailable() &&
      !!ctx.historySessionState.nextMessageCursor &&
      !!ctx.session.getActiveConversationId();
    if (!show) {
      earlierMessagesButton.remove();
      return;
    }
    earlierMessagesButton.textContent = historyShellCopy.showEarlierMessagesLabel;
    if (earlierMessagesButton.parentNode !== ctx.body) {
      ctx.body.insertBefore(earlierMessagesButton, ctx.body.firstChild);
    }
  };

  earlierMessagesButton.addEventListener("click", () => {
    const conversationId = ctx.session.getActiveConversationId();
    const cursor = ctx.historySessionState.nextMessageCursor;
    if (!conversationId || !cursor || earlierMessagesButton.disabled) return;
    earlierMessagesButton.disabled = true;
    // Capture before the prepend so the reader's viewport stays put.
    const previousHeight = ctx.body.scrollHeight;
    const previousTop = ctx.body.scrollTop;
    void ctx.session
      .loadOlderMessages(conversationId, cursor, { scope: historyOperationScope() })
      .then(() => {
        ctx.body.scrollTop = previousTop + (ctx.body.scrollHeight - previousHeight);
        // Prepending shifts everything below the anchor.
        ctx.repinAnchoredMessage();
      })
      .catch(() => {})
      .finally(() => {
        earlierMessagesButton.disabled = false;
        syncEarlierMessagesPill();
      });
  });

  // --- header chrome -------------------------------------------------------

  // Shares the header control chrome (box + glyph from the header tokens) with
  // the close and clear-chat buttons beside it.
  const buildHistoryButton = (): {
    button: HTMLButtonElement;
    wrapper: HTMLElement;
  } => {
    const parts = ctx.createHeaderIconButton({
      ariaLabel: historyShellCopy.openHistoryLabel,
      iconName: "history",
      wrapperClassName:
        "persona-relative persona-inline-flex persona-items-center persona-justify-center",
      extraClassName: "persona-history-toggle",
      attrs: { "data-persona-history-toggle": "" },
    });
    parts.button.addEventListener("click", (event) => {
      if (!historyAvailable() || historyTurnBusy()) return;
      if (ctx.historyVisible) {
        closeHistory();
        return;
      }
      // Enter/Space synthesize a click with detail 0; a pointer press reports > 0.
      void openHistory({ invoker: parts.button, keyboard: event.detail === 0 });
    });
    return parts;
  };

  const syncHistoryButton = (): void => {
    if (!historyAvailable()) {
      historyButtonWrapper?.remove();
      historyButton = null;
      historyButtonWrapper = null;
      return;
    }
    // A header rebuild detaches the old button; a stale ref must not block
    // recreation into the replacement header.
    if (historyButtonWrapper && !historyButtonWrapper.isConnected) {
      historyButton = null;
      historyButtonWrapper = null;
    }
    if (!historyButton && ctx.header) {
      const parts = buildHistoryButton();
      historyButton = parts.button;
      historyButtonWrapper = parts.wrapper;
      const insertBefore =
        ctx.panelElements.clearChatButtonWrapper || ctx.panelElements.closeButtonWrapper;
      // Layouts may parent these wrappers in a trailing cluster rather than
      // the header itself; insert wherever they live so close stays outermost.
      if (insertBefore?.parentNode && ctx.header.contains(insertBefore)) {
        insertBefore.parentNode.insertBefore(historyButtonWrapper, insertBefore);
      } else {
        ctx.header.appendChild(historyButtonWrapper);
      }
    }
    if (!historyButton || !historyButtonWrapper) return;
    // Every rail surface carries its own toggle, and so does the trigger that
    // summons one: the header keeps a control only when neither is on screen.
    const railed =
      railTriggerApplies() || (ctx.historyVisible && ctx.historyPresentation === "rail");
    historyButtonWrapper.style.display = railed ? "none" : "";
    if (railed) {
      // Hiding the control under focus would drop it to the body; the rail's
      // own toggle is the same control, so focus follows it there.
      if (document.activeElement === historyButton) focusHistoryEntry();
      return;
    }
    const busy = historyTurnBusy();
    historyButton.disabled = busy;
    historyButton.setAttribute("aria-disabled", busy ? "true" : "false");
    const label = busy
      ? historyShellCopy.openHistoryBusyLabel
      : historyShellCopy.openHistoryLabel;
    // The factory tooltip reads the live aria-label; a title would double it.
    historyButton.setAttribute("aria-label", label);
    // Rail/auto toggles a navigation region; panel navigates to a surface.
    if ((ctx.config.features?.history?.presentation ?? "panel") === "panel") {
      historyButton.removeAttribute("aria-expanded");
      historyButton.removeAttribute("aria-controls");
    } else {
      historyButton.setAttribute("aria-expanded", ctx.historyVisible ? "true" : "false");
      historyButton.setAttribute("aria-controls", historyRegionId);
    }
  };

  /**
   * With history available the visible start-over affordance becomes
   * "New conversation" (`clearChat()` stays programmatic-only).
   */
  let clearChatRelabelled = false;
  const syncClearChatAffordance = (): void => {
    const button = ctx.panelElements.clearChatButton;
    if (!button) return;
    if (historyAvailable()) {
      if (!clearChatRelabelled) {
        clearChatDefaultLabel = button.getAttribute("aria-label") ?? "";
        clearChatRelabelled = true;
      }
      // aria-label only: the styled tooltip reads it live, and a title would
      // render a second native tooltip on top.
      button.setAttribute("aria-label", historyShellCopy.newConversationLabel);
      button.removeAttribute("title");
      // No touch-target pin: the shared header control class owns the box, and
      // a 44px floor here would desync this control from its neighbours.
      return;
    }
    // Only undo a relabel we performed; never clobber host-configured copy.
    if (!clearChatRelabelled) return;
    clearChatRelabelled = false;
    if (clearChatDefaultLabel) {
      button.setAttribute("aria-label", clearChatDefaultLabel);
    }
  };

  const syncHistoryChromeImpl = (): void => {
    historyShellCopy = resolveHistoryShellCopy(ctx.config.features?.history?.copy);
    syncHistoryButton();
    syncRailOverlayTrigger();
    syncClearChatAffordance();
    syncEarlierMessagesPill();
  };
  ctx.historyChromeSync = syncHistoryChromeImpl;

  installHistoryProvider();
  syncHistoryChromeImpl();
  ctx.destroyCallbacks.push(() => {
    unsubscribeHistoryAvailability?.();
    unsubscribeHistoryIdentity?.();
    // An open in flight (a hover this teardown raced) must not ctx.mount after it.
    historyOpenToken += 1;
    // A pending exit still owns a mounted surface and a live timer.
    settleHistoryExit();
    historySurface?.dispose();
    historySurface?.view.destroy();
    historySurface = null;
  });

  return {
    historyAvailable,
    historyScope,
    installHistoryProvider,
    syncHistoryChromeImpl,
    syncHistoryPresentation,
    syncEarlierMessagesPill,
    openHistory,
    closeHistory,
    openHistoryConversation,
    startNewConversation,
    updateHistoryConversation,
    deleteHistoryConversation,
    requestDeleteConversation,
    clearConversationHistory,
    resetHistoryIdentity,
    railCollapseShortcut,
    railCollapsible,
    railTriggerApplies,
    railOverlayMode,
    toggleRailCollapsed,
    toggleRailPinned: (): void => toggleRailPinned(),
    get historyProvider() {
      return historyProvider;
    },
    get historySurface() {
      return historySurface;
    },
    get railShell() {
      return railShell;
    },
    get railHost() {
      return railHost;
    },
    get railColumn() {
      return railColumn;
    },
  };
};

export type HistoryShell = ReturnType<typeof createHistoryShell>;
