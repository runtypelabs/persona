/**
 * History render-hook arbitration (plan D7, "Public rendering customization
 * contract").
 *
 * Lives in CORE, not in the lazy view chunk: plugins must arbitrate before any
 * chunk-owned DOM exists, and the hook contexts are part of the public package
 * surface. Only type imports reach into `history-view-entry`, so nothing here
 * pulls the chunk into the main bundles.
 *
 * Arbitration:
 *   - plugins run in priority order; the first non-null `renderHistoryView` wins
 *   - null falls back to the default full view, which then applies the first
 *     non-null header/row/state hook at each slot
 *   - the full hook's `defaultRenderer()` bypasses only that hook: the default
 *     view is built and its lower slots still arbitrate, including the same
 *     plugin's. Hook-kind separation is what prevents recursion.
 *   - a thrown hook is reported and skipped; the default renderer stands in and
 *     no history state is lost.
 *
 * Contexts are frozen, field-by-field snapshots. The provider, credentials,
 * proofs, visitor ids, raw responses, and prepared commit/discard never appear:
 * every action routes back through the view's own operations, which are the
 * same ones the default DOM invokes.
 */

import type { AgentWidgetPlugin } from "./plugins/types";
import type {
  AgentWidgetConfig,
  AgentWidgetHistoryRenderActions,
  AgentWidgetRenderHistoryConversationContext,
  AgentWidgetRenderHistoryHeaderContext,
  AgentWidgetRenderHistoryStateContext,
  AgentWidgetRenderHistoryViewContext,
  HistoryConversationSummary,
  HistoryPendingAction,
  HistoryReturnSurface,
  ResolvedHistoryPresentation,
} from "./types";
import type {
  HistoryRailSection,
  HistoryViewHandle,
  HistoryViewModel,
  HistoryViewSlotRenderers,
} from "./history-view-entry";

export interface HistoryRenderSurfaceOptions {
  plugins: AgentWidgetPlugin[];
  config: AgentWidgetConfig;
  getPresentation: () => ResolvedHistoryPresentation;
  getReturnSurface: () => HistoryReturnSurface;
  /** Shell close: records the return surface and restores focus. */
  close: () => void;
  /**
   * Builds the default view with the core-owned slots wired in. Invoked once;
   * `renderDom` starts false so no slot runs before the full hook arbitrates.
   */
  createView: (options: {
    slots: HistoryViewSlotRenderers;
    renderDom: boolean;
    onModelChange: () => void;
    /** Plugin rail sections, for the core to merge behind the config ones. */
    railSections: HistoryRailSection[];
  }) => HistoryViewHandle;
  /** Mount (previous === null) or swap the arbitrated element. */
  onElementChanged: (next: HTMLElement, previous: HTMLElement | null) => void;
}

export interface HistoryRenderSurface {
  readonly view: HistoryViewHandle;
  /** Currently arbitrated element: the default view, or a plugin's. */
  readonly element: HTMLElement;
  /** Re-run arbitration with the current snapshot. Inert after dispose. */
  requestRender(): void;
  /** Runs pending cleanups and makes `requestRender()` inert. */
  dispose(): void;
}

const warn = (hook: string, error: unknown): void => {
  // eslint-disable-next-line no-console
  console.warn(`[persona] ${hook} threw`, error);
};

/** Frozen shallow copy: a plugin can neither mutate nor retain view state. */
const frozen = <T extends object>(value: T): T => Object.freeze({ ...value });

/** Field-by-field copy: an unknown provider field can never reach a plugin. */
const snapshotConversation = (
  conversation: HistoryConversationSummary
): HistoryConversationSummary =>
  Object.freeze({
    id: conversation.id,
    title: conversation.title,
    targetId: conversation.targetId,
    preview: conversation.preview,
    messageCount: conversation.messageCount,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  });

const snapshotPending = (pending: HistoryPendingAction): HistoryPendingAction =>
  pending ? frozen(pending) : null;

export function createHistoryRenderSurface(
  options: HistoryRenderSurfaceOptions
): HistoryRenderSurface {
  const { plugins, config } = options;
  let disposed = false;
  let arbitrating = false;
  /** The view constructor emits a model signal; nothing may arbitrate yet. */
  let ready = false;
  /** Lower-level slots run only when the default view owns the surface. */
  let slotsActive = false;
  let element: HTMLElement | null = null;
  const cleanups: Array<() => void> = [];

  const runCleanups = (): void => {
    for (const callback of cleanups.splice(0)) {
      try {
        callback();
      } catch (error) {
        warn("renderHistoryView cleanup", error);
      }
    }
  };

  type SlotHook =
    | "renderHistoryHeader"
    | "renderHistoryConversation"
    | "renderHistoryState";

  /** One first-non-null pass per slot; a throw is reported and skipped. */
  const arbitrateSlot = <C>(hook: SlotHook, context: C): HTMLElement | null => {
    for (const plugin of plugins) {
      const render = plugin[hook] as
        | ((context: C) => HTMLElement | null)
        | undefined;
      if (!render) continue;
      try {
        const custom = render(context);
        if (custom) return custom;
      } catch (error) {
        warn(hook, error);
      }
    }
    return null;
  };

  /** Fields every slot context carries. */
  const slotBase = (): {
    presentation: ResolvedHistoryPresentation;
    config: AgentWidgetConfig;
  } => ({ presentation: options.getPresentation(), config });

  const slots: HistoryViewSlotRenderers = {
    header: (slot) =>
      slotsActive
        ? arbitrateSlot<AgentWidgetRenderHistoryHeaderContext>(
            "renderHistoryHeader",
            Object.freeze({
              ...slotBase(),
              returnSurface: options.getReturnSurface(),
              identityStatus: frozen(slot.identityStatus),
              pendingAction: snapshotPending(slot.pendingAction),
              copy: frozen(slot.copy),
              actions: Object.freeze({
                close: actions.close,
                startNewConversation: actions.startNewConversation,
              }),
              defaultRenderer: slot.defaultRenderer,
            })
          )
        : null,
    conversation: (slot) =>
      slotsActive
        ? arbitrateSlot<AgentWidgetRenderHistoryConversationContext>(
            "renderHistoryConversation",
            Object.freeze({
              ...slotBase(),
              conversation: snapshotConversation(slot.conversation),
              active: slot.active,
              pending: slot.pending,
              open: slot.open,
              requestDelete: slot.requestDelete,
              defaultRenderer: slot.defaultRenderer,
            })
          )
        : null,
    state: (slot) =>
      slotsActive
        ? arbitrateSlot<AgentWidgetRenderHistoryStateContext>(
            "renderHistoryState",
            Object.freeze({
              ...slotBase(),
              state: frozen(slot.state),
              identityStatus: frozen(slot.identityStatus),
              copy: frozen(slot.copy),
              ...(slot.retry ? { retry: slot.retry } : {}),
              ...(slot.startNewConversation
                ? { startNewConversation: slot.startNewConversation }
                : {}),
              defaultRenderer: slot.defaultRenderer,
            })
          )
        : null,
  };

  /**
   * Plugin rail sections, in plugin order. Only the context is assembled here;
   * a throwing `render` is the view's to warn about once and drop. `actions`
   * resolves at invocation, which never happens before the view owns the DOM.
   */
  const railSections: HistoryRailSection[] = plugins.flatMap((plugin) =>
    (plugin.railSections ?? []).map((section) => ({
      ...section,
      placement: section.placement ?? "above-conversations",
      items: [],
      render: (collapsed: boolean) =>
        section.render(
          Object.freeze({
            collapsed,
            presentation: options.getPresentation(),
            actions,
          })
        ),
    }))
  );

  const view = options.createView({
    slots,
    renderDom: false,
    onModelChange: () => requestRender(),
    railSections,
  });

  /** Every action IS the operation the default DOM invokes; close is the shell's. */
  const actions: AgentWidgetHistoryRenderActions = Object.freeze({
    ...view.operations,
    close: options.close,
  });

  /** Builds (and renders) the default view; lower slots arbitrate from here on. */
  const buildDefault = (): HTMLElement => {
    slotsActive = true;
    view.setDomRenderEnabled(true);
    return view.element;
  };

  const buildViewContext = (
    model: HistoryViewModel
  ): AgentWidgetRenderHistoryViewContext =>
    Object.freeze({
      conversations: Object.freeze(
        model.conversations.map(snapshotConversation)
      ),
      activeConversationId: model.activeConversationId,
      state: frozen(model.state),
      pendingAction: snapshotPending(model.pendingAction),
      identityStatus: frozen(model.identityStatus),
      nextCursor: model.nextCursor,
      presentation: options.getPresentation(),
      returnSurface: options.getReturnSurface(),
      config,
      copy: frozen(view.copy),
      actions,
      defaultRenderer: buildDefault,
      requestRender: () => requestRender(),
      onCleanup: (callback: () => void) => {
        cleanups.push(callback);
      },
    });

  const arbitrate = (): HTMLElement => {
    slotsActive = false;
    let custom: HTMLElement | null = null;
    for (const plugin of plugins) {
      if (!plugin.renderHistoryView) continue;
      try {
        custom = plugin.renderHistoryView(buildViewContext(view.getModel()));
      } catch (error) {
        warn("renderHistoryView", error);
        custom = null;
      }
      if (custom) break;
    }
    // Returning the default view (or a wrapper around it) is composition, not
    // a takeover: it keeps rendering and its slots keep arbitrating.
    // `contains` is true for the node itself, so this covers a plain return.
    const usesDefault = !custom || custom.contains(view.element);
    slotsActive = usesDefault;
    view.setDomRenderEnabled(usesDefault);
    return custom ?? view.element;
  };

  function requestRender(): void {
    // A hook calling requestRender() from inside its own render would recurse.
    if (!ready || disposed || arbitrating) return;
    arbitrating = true;
    try {
      // Cleanups belong to the render being replaced, so they run first.
      runCleanups();
      const next = arbitrate();
      if (next === element) return;
      const previous = element;
      element = next;
      options.onElementChanged(next, previous);
    } finally {
      arbitrating = false;
    }
  }

  ready = true;
  requestRender();

  return {
    view,
    get element() {
      return element ?? view.element;
    },
    requestRender,
    dispose: () => {
      disposed = true;
      runCleanups();
    },
  };
}
