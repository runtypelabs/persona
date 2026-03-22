import { createAgentExperience, AgentWidgetController } from "../ui";
import { AgentWidgetConfig as _AgentWidgetConfig, AgentWidgetInitOptions, AgentWidgetEvent as _AgentWidgetEvent } from "../types";
import { isDockedMountMode } from "../utils/dock";
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

const widgetCssHref = (): string | null => {
  try {
    // This works in ESM builds but not in IIFE builds
    if (typeof import.meta !== "undefined" && import.meta.url) {
      return new URL("../widget.css", import.meta.url).href;
    }
  } catch {
    // Fallback for IIFE builds where CSS should be loaded separately
  }
  return null;
};

const mountStyles = (root: ShadowRoot | HTMLElement, ownerDocument: Document) => {
  const href = widgetCssHref();

  const adoptExistingStylesheet = () => {
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

  if (root instanceof ShadowRoot) {
    // For shadow DOM, we need to load CSS into the shadow root
    if (href) {
      const link = ownerDocument.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.setAttribute("data-persona", "true");
      root.insertBefore(link, root.firstChild);
    } else {
      adoptExistingStylesheet();
    }
    // If href is null (IIFE build), CSS should already be loaded globally
  } else {
    // For non-shadow DOM, check if CSS is already loaded
    const existing = ownerDocument.head.querySelector<HTMLLinkElement>(
      "link[data-persona]"
    );
    if (!existing) {
      if (href) {
        // ESM build - load CSS dynamically
        const link = ownerDocument.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        link.setAttribute("data-persona", "true");
        ownerDocument.head.appendChild(link);
      }
      // IIFE build - CSS should be loaded via <link> tag before script
      // If not found, we'll assume it's loaded globally or warn in dev
    }
  }
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
    mount.id = "persona-root";

    if (shouldFillHost) {
      mount.style.height = "100%";
      mount.style.display = "flex";
      mount.style.flexDirection = "column";
      mount.style.flex = "1";
      mount.style.minHeight = "0";
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
  options.onReady?.();

  const rebuildLayout = (nextConfig?: _AgentWidgetConfig) => {
    destroyCurrentController();
    hostLayout.destroy();
    hostLayout = createWidgetHostLayout(target, nextConfig);
    config = nextConfig;
    mountController();
  };

  const handleBase = {
    update(nextConfig: _AgentWidgetConfig) {
      const mergedConfig = {
        ...config,
        ...nextConfig,
        launcher: {
          ...(config?.launcher ?? {}),
          ...(nextConfig?.launcher ?? {}),
          dock: {
            ...(config?.launcher?.dock ?? {}),
            ...(nextConfig?.launcher?.dock ?? {}),
          },
        },
      } as _AgentWidgetConfig;
      const previousDocked = isDockedMountMode(config);
      const nextDocked = isDockedMountMode(mergedConfig);

      if (previousDocked !== nextDocked) {
        rebuildLayout(mergedConfig);
        return;
      }

      config = mergedConfig;
      hostLayout.updateConfig(config);
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
