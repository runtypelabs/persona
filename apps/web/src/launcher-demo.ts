import "@runtypelabs/persona/widget.css";
import {
  initAgentWidget,
  createLocalStorageAdapter,
  DEFAULT_WIDGET_CONFIG,
} from "@runtypelabs/persona";

const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const proxyUrl =
  import.meta.env.VITE_PROXY_URL
    ? `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch`
    : `http://localhost:${proxyPort}/api/chat/dispatch`;

initAgentWidget({
  target: "#launcher-root",
  config: {
    ...DEFAULT_WIDGET_CONFIG,
    apiUrl: proxyUrl,
    storageAdapter: createLocalStorageAdapter("persona-state-launcher-demo"),
    launcher: {
      ...DEFAULT_WIDGET_CONFIG.launcher,
      // "always" so the teaser returns on every reload of this demo; the
      // shipped default is "once" per browser.
      teaser: {
        text: "Hi, need a hand finding anything?",
        delayMs: 2500,
        frequency: "always",
      },
    },
  },
});
