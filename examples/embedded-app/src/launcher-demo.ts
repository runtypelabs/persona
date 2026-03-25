import "@runtypelabs/persona/widget.css";
import { initAgentWidget, DEFAULT_WIDGET_CONFIG } from "@runtypelabs/persona";

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
  },
});
