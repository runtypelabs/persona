import "@runtypelabs/persona/widget.css";
import {
  DEFAULT_WIDGET_CONFIG,
  initAgentWidget,
  type AgentWidgetConfig,
  type AgentWidgetController,
  type AgentWidgetPlugin,
} from "@runtypelabs/persona";
// Source-only demo seam, exactly as history-demo.ts uses it: the in-memory
// provider is not exported by the package and only resolves through the
// apps/web Vite alias.
import { setHistoryProviderFactory } from "@runtypelabs/persona/internal/history-provider-registry";
import { createDemoHistoryProvider } from "@runtypelabs/persona/internal/demo-history-provider";

/**
 * Internal fixture page for the Playwright history suite (see e2e/).
 *
 * Not registered in examples-nav: it exists to give the browser tests a host
 * container whose width they control, a plugin that throws from
 * `renderHistoryView`, and a clientToken widget whose transport the suite fakes
 * with route interception. Shipped demos live in history-demo.html and
 * home-screen-demo.html.
 */

const params = new URLSearchParams(window.location.search);
const mode = params.get("mode") === "intercepted" ? "intercepted" : "demo";
const presentation = (params.get("presentation") ?? "panel") as
  "panel" | "rail" | "auto";
const apiUrl = params.get("apiUrl") ?? "/e2e-api";
const clientToken = params.get("clientToken") ?? "ct_e2e_history";
const keyPrefix = params.get("keyPrefix") ?? "persona-e2e-";
const persist = params.get("persist") !== "0";

const host = document.getElementById("e2e-host") as HTMLElement;
const status = document.getElementById("e2e-status") as HTMLElement;

const initialWidth = params.get("width");
if (initialWidth) host.style.width = `${Number(initialWidth)}px`;

const provider = createDemoHistoryProvider();

/** Proves the shell falls back to the default view after a hook throws. */
const throwingViewPlugin: AgentWidgetPlugin = {
  id: "e2e-throwing-history-view",
  renderHistoryView: () => {
    throw new Error("e2e renderHistoryView failure");
  },
};

const plugins: AgentWidgetPlugin[] = [];
if (params.get("throwRenderView") === "1") plugins.push(throwingViewPlugin);

const base: AgentWidgetConfig = {
  ...DEFAULT_WIDGET_CONFIG,
  features: { history: { enabled: true, presentation } },
  suggestionChips: [],
  plugins,
  launcher: { ...DEFAULT_WIDGET_CONFIG.launcher, enabled: false, width: "100%" },
  // A welcome hero would sit between the tests and the transcript.
  welcome: { variant: "none" },
  copy: { ...DEFAULT_WIDGET_CONFIG.copy, inputPlaceholder: "Send a message…" },
};

const config: AgentWidgetConfig =
  mode === "intercepted"
    ? {
        ...base,
        clientToken,
        apiUrl,
        persistState: persist ? { keyPrefix } : false,
      }
    : { ...base, persistState: false };

// The Runtype provider is built from clientToken config in intercepted mode;
// only the demo mode overrides the registry.
setHistoryProviderFactory(mode === "intercepted" ? null : () => provider);

const controller: AgentWidgetController = initAgentWidget({
  target: host,
  useShadowDom: false,
  config,
});

status.textContent = `ready mode=${mode} presentation=${presentation}`;

// Test handles. Everything the suite drives goes through public controller
// methods; only the container width and the demo provider are fixture-owned.
Object.assign(window as unknown as Record<string, unknown>, {
  __personaE2E: {
    controller,
    provider: mode === "demo" ? provider : null,
    setHostWidth(px: number) {
      host.style.width = `${px}px`;
    },
    hostWidth: () => host.getBoundingClientRect().width,
  },
});
