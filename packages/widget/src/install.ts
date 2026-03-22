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
}

declare global {
  interface Window {
    siteAgentConfig?: SiteAgentInstallConfig;
    AgentWidget?: any;
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
        const parsedConfig = JSON.parse(configJson);
        // If it has nested 'config' property, use it; otherwise treat as widget config
        if (parsedConfig.config) {
          Object.assign(scriptConfig, parsedConfig);
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
    if (config.cssUrl && config.jsUrl) {
      return { cssUrl: config.cssUrl, jsUrl: config.jsUrl };
    }
    
    const packageName = "@runtypelabs/persona";
    const basePath = `/npm/${packageName}@${version}/dist`;
    
    if (cdn === "unpkg") {
      return {
        cssUrl: `https://unpkg.com${basePath}/widget.css`,
        jsUrl: `https://unpkg.com${basePath}/index.global.js`
      };
    } else {
      return {
        cssUrl: `https://cdn.jsdelivr.net${basePath}/widget.css`,
        jsUrl: `https://cdn.jsdelivr.net${basePath}/index.global.js`
      };
    }
  };

  const { cssUrl, jsUrl } = getCdnBase();

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

  // Initialize widget
  const initWidget = () => {
    if (!window.AgentWidget || !window.AgentWidget.initAgentWidget) {
      console.warn("AgentWidget not available. Make sure the script loaded successfully.");
      return;
    }

    const target = config.target || "body";
    // Merge top-level config options into widget config
    const widgetConfig = { ...config.config };
    
    // Merge apiUrl from top-level config into widget config if present
    if (config.apiUrl && !widgetConfig.apiUrl) {
      widgetConfig.apiUrl = config.apiUrl;
    }
    
    // Merge clientToken from top-level config into widget config if present
    if (config.clientToken && !widgetConfig.clientToken) {
      widgetConfig.clientToken = config.clientToken;
    }
    
    // Merge flowId from top-level config into widget config if present
    if (config.flowId && !widgetConfig.flowId) {
      widgetConfig.flowId = config.flowId;
    }

    // Only initialize if we have either apiUrl OR clientToken (or other config)
    const hasApiConfig = widgetConfig.apiUrl || widgetConfig.clientToken;
    if (!hasApiConfig && Object.keys(widgetConfig).length === 0) {
      return;
    }

    // Auto-apply markdown postprocessor if not explicitly set and available
    if (!widgetConfig.postprocessMessage && window.AgentWidget.markdownPostprocessor) {
      widgetConfig.postprocessMessage = ({ text }: { text: string }) => 
        window.AgentWidget.markdownPostprocessor(text);
    }

    try {
      window.AgentWidget.initAgentWidget({
        target,
        config: widgetConfig,
        // Explicitly disable shadow DOM for better CSS compatibility with host page
        useShadowDom: config.useShadowDom ?? false
      });
    } catch (error) {
      console.error("Failed to initialize AgentWidget:", error);
    }
  };

  // Main installation flow (called after hydration completes)
  const install = async () => {
    try {
      await loadCSS();
      await loadJS();
      
      // Auto-init if we have config OR apiUrl OR clientToken
      const shouldAutoInit = autoInit && (
        config.config || 
        config.apiUrl || 
        config.clientToken
      );
      
      if (shouldAutoInit) {
        // Wait a tick to ensure AgentWidget is fully initialized
        setTimeout(initWidget, 0);
      }
    } catch (error) {
      console.error("Failed to install AgentWidget:", error);
    }
  };

  // Start installation after hydration completes
  // This prevents Next.js/Nuxt/etc. from removing dynamically added CSS
  waitForHydration(install);
})();

