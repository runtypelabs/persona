/**
 * Standalone installer script for easy script tag installation
 * This script automatically loads CSS and JS, then initializes the widget
 * if configuration is provided via window.siteAgentConfig
 */

export {};

interface SiteAgentInstallConfig {
  version?: string;
  cdn?: "unpkg" | "jsdelivr";
  cssUrl?: string;
  jsUrl?: string;
  target?: string | HTMLElement;
  config?: any;
  autoInit?: boolean;
  // Client token mode options (can also be set via data attributes)
  clientToken?: string;
  flowId?: string;
  apiUrl?: string;
  // Optional query param key that gates widget installation in preview mode
  previewQueryParam?: string;
  // Shadow DOM option (defaults to false for better CSS compatibility)
  useShadowDom?: boolean;
  // Expose the widget handle on window[windowKey] for programmatic access
  windowKey?: string;
  /**
   * Fired as soon as the installer script executes, before it loads or gates
   * anything. For diagnostics / load-timing baselines ("did my embed run").
   */
  onScriptLoad?: (info: { version: string }) => void;
  /**
   * Fired when the floating launcher is painted on the page: at page-load time.
   * Deferred installs: the critical launcher mounts. Eager floating installs:
   * the full widget's launcher mounts. Use this for "widget appeared" analytics.
   * Does NOT fire for inline / docked / composer-bar installs (no floating
   * launcher): use `onChatReady` there.
   */
  onLauncherShown?: (info: { deferred: boolean; element?: HTMLElement }) => void;
  /**
   * Fired when the full widget is initialized and its controller API is
   * callable. Deferred installs: after the user first opens the panel. Eager
   * installs: on page load.
   */
  onChatReady?: (handle: any) => void;
  /**
   * @deprecated Use `onChatReady`. Retained as a working alias; it will be
   * removed in the next major version.
   */
  onReady?: (handle: any) => void;
  /**
   * Fired when a load step fails (stylesheet, full bundle, or init), so you can
   * detect ad-blocked / timed-out installs instead of failing silently.
   */
  onError?: (info: { phase: "css" | "bundle" | "init"; error: unknown }) => void;
}

declare global {
  interface Window {
    siteAgentConfig?: SiteAgentInstallConfig;
    AgentWidget?: any;
    AgentWidgetLauncher?: any;
  }
}

(function() {
  "use strict";

  // Prevent double installation
  if ((window as any).__siteAgentInstallerLoaded) {
    return;
  }
  (window as any).__siteAgentInstallerLoaded = true;

  /**
   * Read configuration from data attributes on the current script tag.
   * Supports: data-config (JSON), data-runtype-token, data-flow-id, data-api-url
   */
  const getConfigFromScript = (): Partial<SiteAgentInstallConfig> => {
    // Try to get the current script element
    const script = document.currentScript as HTMLScriptElement | null;
    if (!script) return {};

    const scriptConfig: Partial<SiteAgentInstallConfig> = {};

    // Full config from data-config attribute (JSON string)
    const configJson = script.getAttribute('data-config');
    if (configJson) {
      try {
        // HTML attributes preserve literal newlines/tabs which are invalid
        // control characters inside JSON string literals: strip them.
        const normalizedJson = configJson.replace(/[\r\n]+\s*/g, '');
        const parsedConfig = JSON.parse(normalizedJson);
        // If it has nested 'config' property, use it; otherwise treat as widget config
        if (parsedConfig.config) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { __proto__: _a, constructor: _b, prototype: _c, ...safeConfig } = parsedConfig;
          Object.assign(scriptConfig, safeConfig);
        } else {
          // Treat the entire object as widget config
          scriptConfig.config = parsedConfig;
        }
      } catch (e) {
        console.error("Failed to parse data-config JSON:", e);
      }
    }

    // Client token from data attribute (primary method for client token mode)
    const token = script.getAttribute('data-runtype-token');
    if (token) {
      scriptConfig.clientToken = token;
    }

    // Optional flow ID
    const flowId = script.getAttribute('data-flow-id');
    if (flowId) {
      scriptConfig.flowId = flowId;
    }

    // Optional API URL override
    const apiUrl = script.getAttribute('data-api-url');
    if (apiUrl) {
      scriptConfig.apiUrl = apiUrl;
    }

    // Optional preview query param gate
    const previewQueryParam = script.getAttribute('data-preview-param');
    if (previewQueryParam) {
      scriptConfig.previewQueryParam = previewQueryParam;
    }

    return scriptConfig;
  };

  // Get config from script attributes (must be called synchronously during script execution)
  const scriptConfig = getConfigFromScript();

  // Merge script attributes with window config (script attributes take precedence)
  const windowConfig: SiteAgentInstallConfig = window.siteAgentConfig || {};
  const config: SiteAgentInstallConfig = { ...windowConfig, ...scriptConfig };

  // --- Lifecycle helpers -----------------------------------------------------
  // A throwing user callback must never break the installer.
  const safeCall = <T>(fn: ((arg: T) => void) | undefined, arg: T): void => {
    try {
      fn?.(arg);
    } catch (e) {
      console.error("[Persona] lifecycle callback threw:", e);
    }
  };
  const dispatchLifecycle = (name: string, detail: unknown): void => {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    } catch {
      /* CustomEvent unsupported: ignore */
    }
  };
  const fail = (phase: "css" | "bundle" | "init", error: unknown): void => {
    console.error("Failed to install AgentWidget:", error);
    safeCall(config.onError, { phase, error });
    dispatchLifecycle("persona:error", { phase, error });
  };
  // `onReady` is the deprecated alias of `onChatReady`; warn once if it's used.
  let warnedOnReadyDeprecated = false;
  const resolveChatReady = (): ((handle: any) => void) | undefined => {
    if (config.onChatReady) return config.onChatReady;
    if (config.onReady) {
      if (!warnedOnReadyDeprecated) {
        warnedOnReadyDeprecated = true;
        console.warn(
          "[Persona] `onReady` is deprecated: use `onChatReady`. `onReady` still works but is removed in the next major."
        );
      }
      return config.onReady;
    }
    return undefined;
  };
  // True when the config renders a standard floating launcher button: the only
  // case that paints a clickable launcher at load. Shared by the deferral gate
  // and the eager-path `onLauncherShown` so the event name stays honest.
  const hasFloatingLauncher = (widgetConfig: any): boolean => {
    const launcher = widgetConfig.launcher ?? {};
    if (launcher.enabled === false) return false;             // inline embed
    return (launcher.mountMode ?? "floating") === "floating"; // not docked / composer-bar
  };

  // Earliest signal: the installer has executed. Fire before any loading or
  // preview-gating so it's a reliable "did my embed run" beacon for diagnostics.
  safeCall(config.onScriptLoad, { version: config.version || "latest" });
  dispatchLifecycle("persona:script-load", { version: config.version || "latest" });

  const isPreviewModeEnabled = (): boolean => {
    if (!config.previewQueryParam) {
      return true;
    }

    const params = new URLSearchParams(window.location.search);
    const value = params.get(config.previewQueryParam);
    return value !== null && value !== "" && value.toLowerCase() !== "false" && value !== "0";
  };

  if (!isPreviewModeEnabled()) {
    return;
  }
  
  const version = config.version || "latest";
  const cdn = config.cdn || "jsdelivr";
  const autoInit = config.autoInit !== false; // Default to true

  // Determine CDN base URL
  const getCdnBase = () => {
    // For a custom URL override, derive the sibling launcher URL when the
    // override mirrors the dist layout (…/index.global.js → …/launcher.global.js)
    // so self-hosted deployments still get the optimization. A non-standard
    // jsUrl yields null → eager-load fallback.
    if (config.cssUrl && config.jsUrl) {
      const derivedLauncherUrl = config.jsUrl.replace(/index\.global\.js($|\?)/, "launcher.global.js$1");
      return {
        cssUrl: config.cssUrl,
        jsUrl: config.jsUrl,
        launcherUrl: (derivedLauncherUrl !== config.jsUrl ? derivedLauncherUrl : null) as string | null,
      };
    }

    const packageName = "@runtypelabs/persona";
    const basePath = `/npm/${packageName}@${version}/dist`;
    const host = cdn === "unpkg" ? "https://unpkg.com" : "https://cdn.jsdelivr.net";

    return {
      cssUrl: `${host}${basePath}/widget.css`,
      jsUrl: `${host}${basePath}/index.global.js`,
      launcherUrl: `${host}${basePath}/launcher.global.js` as string | null,
    };
  };

  const { cssUrl, jsUrl, launcherUrl } = getCdnBase();

  // Check if CSS is already loaded
  const isCssLoaded = () => {
    return !!document.head.querySelector('link[data-persona]') ||
           !!document.head.querySelector(`link[href*="widget.css"]`);
  };

  // Check if JS is already loaded
  const isJsLoaded = () => {
    return !!(window as any).AgentWidget;
  };

  /**
   * Wait for framework hydration to complete (Next.js, Nuxt, etc.)
   * This prevents the framework from removing dynamically added CSS during reconciliation.
   * Uses requestIdleCallback + double requestAnimationFrame for reliable detection.
   */
  const waitForHydration = (callback: () => void): void => {
    let executed = false;
    
    const execute = () => {
      if (executed) return;
      executed = true;
      callback();
    };

    const afterDom = () => {
      // Strategy 1: Use requestIdleCallback if available (best for detecting idle after hydration)
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => {
          // Double requestAnimationFrame ensures at least one full paint cycle completed
          requestAnimationFrame(() => {
            requestAnimationFrame(execute);
          });
        }, { timeout: 3000 }); // Max wait 3 seconds, then proceed anyway
      } else {
        // Strategy 2: Fallback for Safari (no requestIdleCallback)
        // 300ms is typically enough for hydration on most pages
        setTimeout(execute, 300);
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', afterDom);
    } else {
      // DOM already ready, but still wait for potential hydration
      afterDom();
    }
  };

  // Load CSS
  const loadCSS = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (isCssLoaded()) {
        resolve();
        return;
      }

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = cssUrl;
      link.setAttribute("data-persona", "true");
      
      link.onload = () => resolve();
      link.onerror = () => reject(new Error(`Failed to load CSS from ${cssUrl}`));
      document.head.appendChild(link);
    });
  };

  // Load JS
  const loadJS = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (isJsLoaded()) {
        resolve();
        return;
      }

      const script = document.createElement("script");
      script.src = jsUrl;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load JS from ${jsUrl}`));
      document.head.appendChild(script);
    });
  };

  // Load the tiny launcher-only critical bundle (launcher.global.js)
  const isLauncherLoaded = () => !!window.AgentWidgetLauncher;

  const loadLauncher = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (isLauncherLoaded() || !launcherUrl) {
        resolve();
        return;
      }

      const script = document.createElement("script");
      script.src = launcherUrl;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load launcher from ${launcherUrl}`));
      document.head.appendChild(script);
    });
  };

  // Warm the full bundle in the background (download-only, not executed) so the
  // first open is quick. Runs at idle so it never competes with the launcher.
  const prefetchFullBundle = (): void => {
    const addPrefetch = () => {
      if (isJsLoaded()) return;
      const link = document.createElement("link");
      link.rel = "prefetch";
      link.as = "script";
      link.href = jsUrl;
      document.head.appendChild(link);
    };
    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(addPrefetch, { timeout: 4000 });
    } else {
      setTimeout(addPrefetch, 1200);
    }
  };

  // Merge top-level installer options into the widget config. Shared by the
  // eager init path and the deferred-launcher path.
  const buildWidgetInit = (): { target: string | HTMLElement; widgetConfig: any; hasApiConfig: boolean } => {
    const target = config.target || "body";
    const widgetConfig: any = { ...config.config };

    if (config.apiUrl && !widgetConfig.apiUrl) widgetConfig.apiUrl = config.apiUrl;
    if (config.clientToken && !widgetConfig.clientToken) widgetConfig.clientToken = config.clientToken;
    if (config.flowId && !widgetConfig.flowId) widgetConfig.flowId = config.flowId;

    const hasApiConfig = !!(widgetConfig.apiUrl || widgetConfig.clientToken);
    return { target, widgetConfig, hasApiConfig };
  };

  // Initialize the full widget. When `openAfter` is true (the deferred-launcher
  // handoff), open the panel immediately via the public controller API so the
  // user's click on the critical launcher carries through.
  const initWidget = (openAfter = false): any => {
    if (!window.AgentWidget || !window.AgentWidget.initAgentWidget) {
      console.warn("AgentWidget not available. Make sure the script loaded successfully.");
      return;
    }

    const { target, widgetConfig, hasApiConfig } = buildWidgetInit();

    // Only initialize if we have either apiUrl OR clientToken (or other config)
    if (!hasApiConfig && Object.keys(widgetConfig).length === 0) {
      return;
    }

    // Auto-apply markdown postprocessor if not explicitly set and available
    if (!widgetConfig.postprocessMessage && window.AgentWidget.markdownPostprocessor) {
      widgetConfig.postprocessMessage = ({ text }: { text: string }) =>
        window.AgentWidget.markdownPostprocessor(text);
    }

    try {
      const handle = window.AgentWidget.initAgentWidget({
        target,
        config: widgetConfig,
        // Explicitly disable shadow DOM for better CSS compatibility with host page
        useShadowDom: config.useShadowDom ?? false,
        windowKey: config.windowKey
      });

      // Handoff from the critical launcher: the user already clicked, so open
      // the panel via the existing public controller method.
      if (openAfter && handle && typeof handle.open === "function") {
        handle.open();
      }

      // Eager floating installs paint their launcher at load time too: emit the
      // same page-load "appeared" signal as the deferred path. The deferred
      // handoff (openAfter) already fired it at launcher mount, and non-floating
      // modes have no launcher, so guard on both.
      if (!openAfter && hasFloatingLauncher(widgetConfig)) {
        safeCall(config.onLauncherShown, { deferred: false });
        dispatchLifecycle("persona:launcher-shown", { deferred: false });
      }

      // The full widget is initialized and its controller API is callable.
      safeCall(resolveChatReady(), handle);
      dispatchLifecycle("persona:chat-ready", handle);
      dispatchLifecycle("persona:ready", handle); // deprecated alias: removed next major
      return handle;
    } catch (error) {
      fail("init", error);
    }
  };

  // A persisted "open" state reopens the panel on reload with no click
  // (ui.ts:7513). The installer can't see that from config, so it reads the very
  // same storage key the widget writes. Mirrors normalizePersistStateConfig
  // (ui.ts:213): openState persistence defaults on, storage to sessionStorage,
  // key prefix to "persona-".
  const hasPersistedOpenState = (widgetConfig: any): boolean => {
    const persistState = widgetConfig.persistState;
    if (!persistState) return false; // persistence off → nothing to restore
    const asObject = typeof persistState === "object" ? persistState : null;
    if (asObject && asObject.persist?.openState === false) return false; // open-state persistence opted out
    const keyPrefix = (asObject && asObject.keyPrefix) || "persona-";
    const storageType = (asObject && asObject.storage) || "session";
    try {
      const storage = storageType === "local" ? window.localStorage : window.sessionStorage;
      return storage.getItem(`${keyPrefix}widget-open`) === "true";
    } catch {
      return false; // storage blocked (private mode) → the widget can't restore either
    }
  };

  // The deferred-launcher optimization only applies to the common floating case
  // that paints a collapsed launcher and waits for a click. Anything that starts
  // open or renders differently eager-loads the full bundle exactly as before:  // including the two open triggers config alone can't express: a host
  // onStateLoaded hook that may request open, and a restored "was open" state.
  const shouldDeferPanel = (widgetConfig: any): boolean => {
    if (!launcherUrl) return false;                                      // custom bundle URL override: can't derive launcher URL
    if (!hasFloatingLauncher(widgetConfig)) return false;                // inline / docked / composer-bar
    const launcher = widgetConfig.launcher ?? {};
    if (launcher.autoExpand === true) return false;                      // starts open
    if (typeof widgetConfig.onStateLoaded === "function") return false;  // hook may request open
    if (hasPersistedOpenState(widgetConfig)) return false;               // restored "was open"
    return true;
  };

  // Render the real launcher from the tiny critical bundle; load + mount the
  // full widget on first click, then remove the critical launcher.
  const mountDeferredLauncher = (target: string | HTMLElement, widgetConfig: any): void => {
    let phase: "idle" | "loading" | "done" = "idle";
    let launcherHandle: { destroy: () => void } | undefined;

    const onOpen = () => {
      if (phase !== "idle") return; // already loading or handed off
      phase = "loading";
      loadJS()
        .then(() => {
          initWidget(true);          // mount the full widget + open the panel
          launcherHandle?.destroy();  // remove the critical launcher (same component → invisible)
          phase = "done";
        })
        .catch((error) => {
          phase = "idle";            // allow the click to be retried
          console.error("Failed to load AgentWidget on open:", error);
          safeCall(config.onError, { phase: "bundle", error });
          dispatchLifecycle("persona:error", { phase: "bundle", error });
        });
    };

    const mounted = window.AgentWidgetLauncher.mount({ target, config: widgetConfig, onOpen });
    launcherHandle = mounted;

    // The real launcher is now painted at page-load time: emit the page-load
    // "appeared" signal (distinct from `onChatReady`, which waits for first open).
    safeCall(config.onLauncherShown, { deferred: true, element: mounted.element });
    dispatchLifecycle("persona:launcher-shown", { deferred: true, element: mounted.element });

    // Warm the full bundle so the first open is quick.
    prefetchFullBundle();
  };

  // Main installation flow (called after hydration completes)
  const install = async () => {
    try {
      // Auto-init if we have config OR apiUrl OR clientToken
      const shouldAutoInit = autoInit && (
        config.config ||
        config.apiUrl ||
        config.clientToken
      );

      // Fast path: render the real launcher from the ~13 KB critical bundle and
      // defer the full widget until first open. Only for the common floating
      // case; everything else falls through to the eager path below.
      if (shouldAutoInit) {
        const { target, widgetConfig } = buildWidgetInit();
        if (shouldDeferPanel(widgetConfig)) {
          try {
            // CSS + launcher in parallel so the launcher paints correctly styled.
            await Promise.all([loadCSS(), loadLauncher()]);
            if (window.AgentWidgetLauncher && window.AgentWidgetLauncher.mount) {
              mountDeferredLauncher(target, widgetConfig);
              return;
            }
          } catch (error) {
            console.warn("Deferred launcher failed; falling back to eager load.", error);
          }
          // Fall through to the eager path on any failure.
        }
      }

      // Eager path (unchanged behavior): load the full bundle, then init.
      try {
        await loadCSS();
      } catch (error) {
        return fail("css", error);
      }
      try {
        await loadJS();
      } catch (error) {
        return fail("bundle", error);
      }
      if (shouldAutoInit) {
        // Wait a tick to ensure AgentWidget is fully initialized
        setTimeout(() => initWidget(false), 0);
      }
    } catch (error) {
      // Safety net for anything unexpected before the eager loads above.
      fail("init", error);
    }
  };

  // Start installation after hydration completes
  // This prevents Next.js/Nuxt/etc. from removing dynamically added CSS
  waitForHydration(install);
})();

