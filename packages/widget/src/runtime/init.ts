import { createAgentExperience, AgentWidgetController } from "../ui";
import { AgentWidgetConfig as _AgentWidgetConfig, AgentWidgetConfigPatch, AgentWidgetInitOptions, AgentWidgetEvent as _AgentWidgetEvent } from "../types";
import { isComposerBarMountMode, isDockedMountMode } from "../utils/dock";
import { mergeConfigUpdate } from "../utils/config-merge";
import { createWidgetHostLayout } from "./host-layout";

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

export type AgentWidgetInitHandle = AgentWidgetController & { host: HTMLElement };

export const initAgentWidget = (
  options: AgentWidgetInitOptions
): AgentWidgetInitHandle => {
  const target = ensureTarget(options.target);
  const useShadow = options.useShadowDom === true;
  const ownerDocument = target.ownerDocument;
  let config = options.config;
  let hostLayout = createWidgetHostLayout(target, config);
  let controller: AgentWidgetController;
  let stateUnsubs: Array<() => void> = [];
  let mount: HTMLElement | null = null;

  // Set OR clear the fill styles per shouldFillHost so a runtime launcher toggle
  // re-syncs the mount the same way setDirectHostStyles re-syncs the host.
  // createMount alone only runs on initial mount / mountMode rebuild, so without
  // this an in-place launcher.enabled flip would leave the mount stale.
  const syncMountFillStyles = (el: HTMLElement, nextConfig?: _AgentWidgetConfig): void => {
    const launcherEnabled = nextConfig?.launcher?.enabled ?? true;
    const shouldFillHost = !launcherEnabled || isDockedMountMode(nextConfig);
    el.style.height = shouldFillHost ? "100%" : "";
    el.style.display = shouldFillHost ? "flex" : "";
    el.style.flexDirection = shouldFillHost ? "column" : "";
    el.style.flex = shouldFillHost ? "1" : "";
    el.style.minHeight = shouldFillHost ? "0" : "";
    // Match the host's shrinkable baseline so a wide artifact split shrinks
    // within the mount instead of forcing it past its content-based minimum.
    el.style.minWidth = shouldFillHost ? "0" : "";
  };

  const createMount = (host: HTMLElement, nextConfig?: _AgentWidgetConfig): HTMLElement => {
    const el = ownerDocument.createElement("div");
    el.setAttribute("data-persona-root", "true");
    syncMountFillStyles(el, nextConfig);

    if (useShadow) {
      const shadowRoot = host.attachShadow({ mode: "open" });
      shadowRoot.appendChild(el);
      mountStyles(shadowRoot, ownerDocument);
    } else {
      host.appendChild(el);
      mountStyles(host, ownerDocument);
    }

    if (target.id) {
      el.setAttribute("data-persona-instance", target.id);
    }

    return el;
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
    mount = createMount(hostLayout.host, config);
    controller = createAgentExperience(mount, config, {
      debugTools: options.debugTools
    });
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
    update(nextConfig: AgentWidgetConfigPatch) {
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
      // Re-sync the mount's fill styles: the host is updated above, but the
      // mount is only built in createMount (initial mount / mountMode rebuild),
      // so an in-place launcher.enabled flip would otherwise leave it stale.
      if (mount) syncMountFillStyles(mount, config);
      // Pass the raw patch: mergedConfig materializes explicit-undefined resets
      // as absent keys, which the controller's patch merge would preserve
      // instead of clearing. Both layers share mergeConfigUpdate, so they converge.
      controller.update(nextConfig);
      syncHostState();
    },
    destroy() {
      destroyCurrentController();
      hostLayout.destroy();
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

  if (options.windowKey && typeof window !== 'undefined') {
    (window as any)[options.windowKey] = handle;
  }

  return handle;
};
