import { createAgentExperience, AgentWidgetController } from "../ui";
import { AgentWidgetConfig as _AgentWidgetConfig, AgentWidgetConfigPatch, AgentWidgetInitOptions, AgentWidgetControllerEventMap, AgentWidgetEventContext, AgentWidgetEvent as _AgentWidgetEvent } from "../types";
import { isComposerBarMountMode, isDockedMountMode } from "../utils/dock";
import { mergeConfigUpdate } from "../utils/config-merge";
import { createWidgetHostLayout } from "./host-layout";
import { moveWidgetHost } from "./move-host";
import { createLegacyDiagnosticContext, updateLegacyDiagnostics } from "../utils/legacy-diagnostics";

const ensureTarget = (target: string | HTMLElement): HTMLElement => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Chat widget can only be mounted in a browser environment");
  }

  if (typeof target === "string") {
    const element = document.querySelector<HTMLElement>(target);
    if (!element) {
      throw new Error(`Chat widget target "${target}" was not found`);
    }
    return element;
  }

  return target;
};

// CSS arrives via the installer's link[data-persona] or a consumer import of
// @runtypelabs/persona/widget.css; the widget never self-locates its stylesheet.
// A new URL(..., import.meta.url) here breaks consumer bundlers (webpack
// resolves the literal at build time), so shadow roots only clone the head link.
const mountStyles = (root: ShadowRoot | HTMLElement, ownerDocument: Document) => {
  if (!(root instanceof ShadowRoot)) {
    return;
  }

  if (root.querySelector('link[data-persona]')) {
    return;
  }

  const globalLink = ownerDocument.head.querySelector<HTMLLinkElement>(
    'link[data-persona]'
  );
  if (!globalLink) {
    return;
  }

  const clonedLink = globalLink.cloneNode(true) as HTMLLinkElement;
  root.insertBefore(clonedLink, root.firstChild);
};

export type AgentWidgetInitHandle = AgentWidgetController & {
  host: HTMLElement;
  /** Move a live direct-layout widget to a connected container in the same document. */
  moveTo: (target: string | HTMLElement, options?: { preserveFocus?: boolean }) => void;
};

// Live handles for every mounted initAgentWidget() instance, oldest first.
// `persona:chat-ready` is a one-shot broadcast and `windowKey` is opt-in, so
// code that runs after a widget mounted previously had no way to reach it.
// This registry closes that gap: late companions (selection toolbars, host
// integrations) can adopt the most recent mount via
// `getAgentWidgetHandles().at(-1)`. Handles deregister on destroy().
const activeHandles: AgentWidgetInitHandle[] = [];

/** Handles of all currently mounted widgets, oldest first. */
export const getAgentWidgetHandles = (): AgentWidgetInitHandle[] => [
  ...activeHandles,
];

export const initAgentWidget = (
  options: AgentWidgetInitOptions
): AgentWidgetInitHandle => {
  let target = ensureTarget(options.target);
  const useShadow = options.useShadowDom === true;
  const ownerDocument = target.ownerDocument;
  const instanceId = target.id || `persona-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  let config = options.config;
  const diagnostics = createLegacyDiagnosticContext(config);
  let hostLayout = createWidgetHostLayout(target, config);
  let controller: AgentWidgetController;
  let stateUnsubs: Array<() => void> = [];
  let destroyed = false;
  let relocate = (move: () => void) => move();
  const hostListeners = new Set<{
    event: keyof AgentWidgetControllerEventMap;
    handler: unknown;
    bind: () => void;
    unsubscribe: () => void;
  }>();

  const createMount = (host: HTMLElement, nextConfig?: _AgentWidgetConfig): HTMLElement => {
    const launcherEnabled = nextConfig?.launcher?.enabled ?? true;
    const shouldFillHost = !launcherEnabled || isDockedMountMode(nextConfig);
    const mount = ownerDocument.createElement("div");
    mount.setAttribute("data-persona-root", "true");

    // Initial fill styling only. On every relayout the controller's
    // applyFullHeightStyles resets mount.style.cssText and re-applies these
    // (including the shrinkable min-width:0), so it owns the runtime truth.
    if (shouldFillHost) {
      mount.style.height = "100%";
      mount.style.display = "flex";
      mount.style.flexDirection = "column";
      mount.style.flex = "1";
      mount.style.minHeight = "0";
      mount.style.minWidth = "0";
    }

    if (useShadow) {
      const shadowRoot = host.attachShadow({ mode: "open" });
      shadowRoot.appendChild(mount);
      mountStyles(shadowRoot, ownerDocument);
    } else {
      host.appendChild(mount);
      mountStyles(host, ownerDocument);
    }

    mount.setAttribute("data-persona-instance", instanceId);

    return mount;
  };

  const syncHostState = () => {
    hostLayout.syncWidgetState(controller.getState());
  };

  const bindHostState = () => {
    stateUnsubs.forEach((unsubscribe) => unsubscribe());
    stateUnsubs = [
      controller.on("widget:opened", syncHostState),
      controller.on("widget:closed", syncHostState),
    ];
    syncHostState();
  };

  const mountController = () => {
    const mount = createMount(hostLayout.host, config);
    controller = createAgentExperience(mount, config, {
      debugTools: options.debugTools,
      registerHostMove: (move) => { relocate = move; },
      diagnostics,
    });
    hostListeners.forEach((listener) => listener.bind());
    bindHostState();
  };

  const destroyCurrentController = () => {
    stateUnsubs.forEach((unsubscribe) => unsubscribe());
    stateUnsubs = [];
    controller.destroy();
  };

  mountController();
  // Fired when the controller is mounted and its API is callable.
  options.onChatReady?.();

  const rebuildLayout = (nextConfig?: _AgentWidgetConfig) => {
    destroyCurrentController();
    hostLayout.destroy();
    hostLayout = createWidgetHostLayout(target, nextConfig);
    config = nextConfig;
    mountController();
  };

  const handleBase = {
    moveTo(nextTarget: string | HTMLElement, moveOptions?: { preserveFocus?: boolean }) {
      if (destroyed) throw new Error("Cannot move a destroyed widget");
      if (hostLayout.mode !== "direct") throw new Error("Docked widgets cannot be moved");
      const destination = typeof nextTarget === "string" ? ownerDocument.querySelector(nextTarget) : nextTarget;
      if (!(destination instanceof HTMLElement) || destination.ownerDocument !== ownerDocument ||
        destination.getRootNode() !== ownerDocument || hostLayout.host.getRootNode() !== ownerDocument ||
        hostLayout.host.contains(destination)) {
        throw new Error("Invalid widget move target: expected a connected light-DOM container in the same document");
      }
      if (destination === target) return;
      relocate(() => moveWidgetHost(hostLayout.host, destination, moveOptions?.preserveFocus !== false));
      target = destination;
    },
    on<K extends keyof AgentWidgetControllerEventMap>(
      event: K,
      handler: (payload: AgentWidgetControllerEventMap[K], context: AgentWidgetEventContext) => void
    ) {
      if (destroyed) return () => {};
      const existing = [...hostListeners].find((listener) => listener.event === event && listener.handler === handler);
      if (existing) return existing.unsubscribe;
      let unbind = () => {};
      const listener = {
        event, handler,
        bind: () => { unbind = controller.on(event, handler); },
        unsubscribe: () => { unbind(); hostListeners.delete(listener); },
      };
      hostListeners.add(listener);
      listener.bind();
      return listener.unsubscribe;
    },
    off<K extends keyof AgentWidgetControllerEventMap>(
      event: K,
      handler: (payload: AgentWidgetControllerEventMap[K], context: AgentWidgetEventContext) => void
    ) {
      for (const listener of hostListeners) {
        if (listener.event === event && listener.handler === handler) listener.unsubscribe();
      }
    },
    update(nextConfig: AgentWidgetConfigPatch) {
      updateLegacyDiagnostics(diagnostics, nextConfig);
      const mergedConfig = mergeConfigUpdate(config ?? ({} as _AgentWidgetConfig), nextConfig);
      const previousDocked = isDockedMountMode(config);
      const nextDocked = isDockedMountMode(mergedConfig);
      const previousComposerBar = isComposerBarMountMode(config);
      const nextComposerBar = isComposerBarMountMode(mergedConfig);

      if (previousDocked !== nextDocked || previousComposerBar !== nextComposerBar) {
        rebuildLayout(mergedConfig);
        return;
      }

      config = mergedConfig;
      hostLayout.updateConfig(config);
      // Pass the raw patch: mergedConfig materializes explicit-undefined resets
      // as absent keys, which the controller's patch merge would preserve
      // instead of clearing. Both layers share mergeConfigUpdate, so they converge.
      controller.update(nextConfig);
      syncHostState();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      destroyCurrentController();
      hostListeners.forEach((listener) => listener.unsubscribe());
      hostLayout.destroy();
      const index = activeHandles.indexOf(handle);
      if (index !== -1) activeHandles.splice(index, 1);
      if (options.windowKey && typeof window !== "undefined") {
        delete (window as any)[options.windowKey];
      }
    }
  };

  const handle = new Proxy(handleBase as AgentWidgetInitHandle, {
    get(targetObject, prop, receiver) {
      if (prop === "host") {
        return hostLayout.host;
      }

      if (prop in targetObject) {
        return Reflect.get(targetObject, prop, receiver);
      }

      const value = (controller as Record<PropertyKey, unknown>)[prop];
      return typeof value === "function" ? (value as Function).bind(controller) : value;
    }
  }) as AgentWidgetInitHandle;

  activeHandles.push(handle);

  if (options.windowKey && typeof window !== 'undefined') {
    (window as any)[options.windowKey] = handle;
  }

  return handle;
};
