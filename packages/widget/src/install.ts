/**
 * Standalone installer script for easy script tag installation
 * This script automatically loads CSS and JS, then initializes the widget
 * if configuration is provided via window.siteAgentConfig
 */

import { pinCdnRelease } from "./utils/cdn-release";

import type { BrandConfig } from "./types/theme";
import { delayInstallLoading } from "./utils/install-loading";
import type { InstallLoadingRenderer } from "./types/install-loading";

interface SiteAgentInstallConfig {
  // Setting `cdn` explicitly opts into npm-CDN asset URLs (jsDelivr/unpkg),
  // and `version` pins the asset version. When neither is set, assets load
  // from the directory the installer script itself was served from. On the
  // first-party CDN (cdn.runtype.com) a `version` stays first-party
  // (…/persona/<version>/); elsewhere it opts into npm-CDN URLs. Prefer
  // pinning via the installer script URL itself — see getCdnBase().
  version?: string;
  cdn?: "unpkg" | "jsdelivr";
  cssUrl?: string;
  jsUrl?: string;
  target?: string | HTMLElement;
  config?: any;
  /** Opt in to the staged v5 defaults when using top-level installer options. */
  future?: { v5Defaults?: boolean };
  brand?: BrandConfig;
  autoInit?: boolean;
  // Client token mode options (can also be set via data attributes)
  clientToken?: string;
  flowId?: string;
  agentId?: string;
  apiUrl?: string;
  // Optional query param key that gates widget installation in preview mode
  previewQueryParam?: string;
  // Shadow DOM option (defaults to false for better CSS compatibility)
  useShadowDom?: boolean;
  // Expose the widget handle on window[windowKey] for programmatic access
  windowKey?: string;
  /** Replace the delayed loading ring. Persona owns timing and cleanup. */
  renderLoading?: InstallLoadingRenderer;
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
   * Supports: data-config (JSON), data-runtype-token, data-flow-id, data-agent-id, data-api-url
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
        console.error("Invalid data-config JSON:", e);
      }
    }

    for (const [key, attribute] of [
      ["clientToken", "runtype-token"], ["flowId", "flow-id"],
      ["agentId", "agent-id"], ["apiUrl", "api-url"],
      ["previewQueryParam", "preview-param"],
    ] as const) {
      const value = script.getAttribute(`data-${attribute}`);
      if (value) scriptConfig[key] = value;
    }

    return scriptConfig;
  };

  // Get config from script attributes (must be called synchronously during script execution)
  const scriptConfig = getConfigFromScript();

  // The installer's own URL, captured now because document.currentScript is
  // null once synchronous execution ends (and always inside modules).
  const installerSrc = (document.currentScript as HTMLScriptElement | null)?.src || "";

  // Merge script attributes with window config (script attributes take precedence)
  const windowConfig: SiteAgentInstallConfig = window.siteAgentConfig || {};
  const config: SiteAgentInstallConfig = { ...windowConfig, ...scriptConfig };

  // --- Lifecycle helpers -----------------------------------------------------
  // A throwing user callback must never break the installer.
  const safeCall = <T>(fn: ((arg: T) => void) | undefined, arg: T): void => {
    try {
      fn?.(arg);
    } catch (e) {
      console.error("Lifecycle callback failed:", e);
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
    console.error("Widget install failed:", error);
    safeCall(config.onError, { phase, error });
    dispatchLifecycle("persona:error", { phase, error });
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

  // Directory the installer itself was served from. Every published layout
  // (npm CDN dist/, first-party CDN, self-hosted copies) keeps the sibling
  // assets next to install.global.js, so this base is valid wherever the
  // installer loaded from — and always satisfies the same CSP/origin rules
  // that let the installer through. Non-http(s) sources (inline, blob:) and
  // module contexts (no currentScript) yield null.
  const getInstallerBase = (): string | null => {
    if (!installerSrc) return null;
    try {
      const url = new URL(pinCdnRelease(installerSrc), document.baseURI);
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      return url.origin + url.pathname.slice(0, url.pathname.lastIndexOf("/"));
    } catch {
      return null;
    }
  };

  // Determine CDN base URL. Precedence:
  //   1. explicit cssUrl + jsUrl
  //   2. explicit `cdn` / `version` → npm CDN construction
  //   3. the installer's own directory (default)
  //   4. npm CDN construction (currentScript unavailable)
  const assetUrls = (base: string) => ({
    cssUrl: `${base}/widget.css`,
    jsUrl: `${base}/index.global.js`,
    launcherUrl: `${base}/launcher.global.js`,
  });
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

    // Default: load assets from wherever the installer was served, so a page
    // whose CSP allows only its own CDN (e.g. cdn.runtype.com) never has
    // sibling requests fan out to a third-party host. An explicit `cdn`
    // keeps the documented npm-CDN behavior.
    if (!config.cdn) {
      const selfBase = getInstallerBase();
      if (selfBase) {
        if (!config.version) {
          return assetUrls(selfBase);
        }
        // A `version` on the first-party CDN stays first-party: the bucket
        // mirrors every release at /persona/<version>/, and rerouting to a
        // npm CDN would be blocked by the CSP that allowed the installer.
        const selfOrigin = new URL(selfBase).origin;
        if (selfOrigin === "https://cdn.runtype.com") {
          return assetUrls(`${selfOrigin}/persona/${config.version}`);
        }
      }
    }

    const packageName = "@runtypelabs/persona";
    // jsDelivr namespaces npm packages under /npm/; unpkg serves them at the root.
    const basePath = cdn === "unpkg"
      ? `/${packageName}@${version}/dist`
      : `/npm/${packageName}@${version}/dist`;
    const host = cdn === "unpkg" ? "https://unpkg.com" : "https://cdn.jsdelivr.net";

    return assetUrls(`${host}${basePath}`);
  };

  const { cssUrl, jsUrl, launcherUrl } = getCdnBase();

  // Surface silent CSP breakage: when `cdn`/`version` reroutes assets to a
  // different origin than the one that served the installer, a strict CSP
  // (e.g. Runtype-hosted apps) blocks them with no visible error. Explicit
  // cssUrl/jsUrl overrides are a deliberate choice, so they don't warn.
  if (!(config.cssUrl && config.jsUrl)) {
    const selfBase = getInstallerBase();
    try {
      if (selfBase && new URL(selfBase).origin !== new URL(jsUrl, document.baseURI).origin) {
        console.warn(
          `${jsUrl}: strict CSP may silently block cross-origin assets; pin the installer URL.`,
        );
      }
    } catch {
      // URL parsing is best-effort; never let diagnostics break installation.
    }
  }

  // Check if CSS is already loaded
  const isCssLoaded = () => {
    return !!document.head.querySelector('link[data-persona],link[href*="widget.css"]');
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
    const afterDom = () => {
      // Strategy 1: Use requestIdleCallback if available (best for detecting idle after hydration)
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => {
          // Double requestAnimationFrame ensures at least one full paint cycle completed
          requestAnimationFrame(() => {
            requestAnimationFrame(callback);
          });
        }, { timeout: 3000 }); // Max wait 3 seconds, then proceed anyway
      } else {
        // Strategy 2: Fallback for Safari (no requestIdleCallback)
        // 300ms is typically enough for hydration on most pages
        setTimeout(callback, 300);
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', afterDom, { once: true });
    } else {
      // DOM already ready, but still wait for potential hydration
      afterDom();
    }
  };

  // Stylesheet and script requests share lifecycle and failure handling.
  const loadAsset = (url: string | null, loaded: boolean, css = false): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (loaded || !url) { resolve(); return; }
      const node = document.createElement(css ? "link" : "script");
      Object.assign(node, css ? { rel: "stylesheet", href: url } : { src: url, async: true });
      if (css) node.setAttribute("data-persona", "true");
      node.onload = () => resolve();
      node.onerror = () => reject(new Error(`Failed to load ${url}`));
      document.head.appendChild(node);
    });
  };
  const loadCSS = () => loadAsset(cssUrl, isCssLoaded(), true);
  const loadJS = () => loadAsset(jsUrl, isJsLoaded());
  const loadLauncher = () => loadAsset(launcherUrl, !!window.AgentWidgetLauncher);

  // Warm the full bundle in the background (download-only, not executed) so the
  // first open is quick. Runs at idle so it never competes with the launcher.
  const prefetchFullBundle = (): void => {
    const addPrefetch = () => {
      const urls = isJsLoaded() ? [] : [jsUrl];
      for (const chunk of ["markdown-parsers.js", "client-stream.js"]) {
        const url = jsUrl.replace(/index\.global\.js($|\?)/, `${chunk}$1`);
        if (url !== jsUrl) urls.push(url);
      }
      for (const href of urls) {
        const link = document.createElement("link");
        Object.assign(link, { rel: "prefetch", as: "script", href });
        document.head.appendChild(link);
      }
    };
    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(addPrefetch, { timeout: 4000 });
    } else {
      setTimeout(addPrefetch, 1200);
    }
  };

  // Merge top-level installer options into the widget config. Shared by the
  // eager init path and the deferred-launcher path.
  const buildWidgetInit = (): { target: string | HTMLElement; widgetConfig: any } => {
    const target = config.target || "body";
    const widgetConfig: any = { ...config.config };

    for (const key of ["apiUrl", "clientToken", "flowId", "agentId", "future", "brand"] as const) {
      if (config[key] && !widgetConfig[key]) widgetConfig[key] = config[key];
    }

    return { target, widgetConfig };
  };

  // Initialize the full widget. When `openAfter` is true (the deferred-launcher
  // handoff), open the panel immediately via the public controller API so the
  // user's click on the critical launcher carries through.
  const initWidget = async (openAfter = false): Promise<any> => {
    if (!window.AgentWidget?.initAgentWidget) throw new Error("Widget unavailable");

    const { target, widgetConfig } = buildWidgetInit();

    // Only initialize if we have either apiUrl OR clientToken (or other config)
    if (Object.keys(widgetConfig).length === 0) {
      return;
    }

    // Auto-apply markdown postprocessor if not explicitly set and available
    if (!widgetConfig.postprocessMessage && window.AgentWidget.markdownPostprocessor) {
      widgetConfig.postprocessMessage = ({ text }: { text: string }) =>
        window.AgentWidget.markdownPostprocessor(text);
    }

    let handle: any;
    try {
      handle = window.AgentWidget.initAgentWidget({
        target,
        config: widgetConfig,
        // Explicitly disable shadow DOM for better CSS compatibility with host page
        useShadowDom: config.useShadowDom ?? false,
        windowKey: config.windowKey
      });

      await handle?.ready;

      // Handoff from the critical launcher: the user already clicked, so open
      // the panel via the existing public controller method.
      if (openAfter) handle?.open?.();

      // Eager floating installs paint their launcher at load time too: emit the
      // same page-load "appeared" signal as the deferred path. The deferred
      // handoff (openAfter) already fired it at launcher mount, and non-floating
      // modes have no launcher, so guard on both.
      if (!openAfter && hasFloatingLauncher(widgetConfig)) {
        safeCall(config.onLauncherShown, { deferred: false });
        dispatchLifecycle("persona:launcher-shown", { deferred: false });
      }

      // The full widget is initialized and its controller API is callable.
      safeCall(config.onChatReady, handle);
      dispatchLifecycle("persona:chat-ready", handle);
      return handle;
    } catch (error) {
      handle?.destroy?.();
      throw error;
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
    let launcherHandle: { destroy: () => void; element: HTMLButtonElement } | undefined;

    const onOpen = () => {
      if (phase !== "idle") return; // already loading or handed off
      phase = "loading";
      let errorPhase: "bundle" | "init" = "bundle";
      const stopLoading = delayInstallLoading(launcherHandle?.element ?? null, true, config.renderLoading);
      loadJS()
        .then(async () => {
          errorPhase = "init";
          await initWidget(true);    // keep the critical launcher until the panel is complete
          stopLoading();
          launcherHandle?.destroy();  // remove the critical launcher (same component → invisible)
          phase = "done";
        })
        .catch((error) => {
          stopLoading();
          phase = "idle";            // allow the click to be retried
          fail(errorPhase, error);
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
    let stopLoading = () => {};
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
            if (window.AgentWidgetLauncher?.mount) {
              mountDeferredLauncher(target, widgetConfig);
              return;
            }
          } catch (error) {
            console.warn("Launcher failed; loading widget.", error);
          }
          // Fall through to the eager path on any failure.
        }
      }

      // Only an actual visible embedded surface needs initial feedback. A
      // collapsed floating launcher must not put a spinner over the host page.
      if (shouldAutoInit) {
        const { target, widgetConfig } = buildWidgetInit();
        if (widgetConfig.launcher?.enabled === false) {
          stopLoading = delayInstallLoading(typeof target === "string" ? document.querySelector(target) : target, false, config.renderLoading);
        }
      }
      // Eager path: retain feedback through all renderer/style preparation.
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
        await initWidget(false);
      }
    } catch (error) {
      // Safety net for anything unexpected before the eager loads above.
      fail("init", error);
    } finally {
      stopLoading();
    }
  };

  // Start installation after hydration completes
  // This prevents Next.js/Nuxt/etc. from removing dynamically added CSS
  waitForHydration(install);
})();
