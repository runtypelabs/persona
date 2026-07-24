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

  const createMount = (host: HTMLElement, nextConfig?: _AgentWidgetConfig): HTMLElement => {
    const launcherEnabled = nextConfig?.launcher?.enabled ?? true;
    const shouldFillHost = !launcherEnabled || isDockedMountMode(nextConfig);
    const mount = ownerDocument.createElement("div");
    mount.setAttribute("data-persona-root", "true");

    if (shouldFillHost) {
      mount.style.height = "100%";
      mount.style.display = "flex";
      mount.style.flexDirection = "column";
      mount.style.flex = "1";
      mount.style.minHeight = "0";
      // Match the host's shrinkable baseline so a wide artifact split shrinks
      // within the mount instead of forcing it past its content-based minimum.
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

    if (target.id) {
      mount.setAttribute("data-persona-instance", target.id);
    }

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
