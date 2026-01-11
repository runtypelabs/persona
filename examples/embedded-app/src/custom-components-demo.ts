import "@runtypelabs/persona/widget.css";
import "./index.css";
import "./App.css";

import {
  createAgentExperience,
  initAgentWidget,
  componentRegistry,
  DEFAULT_WIDGET_CONFIG
} from "@runtypelabs/persona";

import {
  ProductCard,
  SimpleChart,
  StatusBadge,
  InfoCard
} from "./components";

const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const proxyUrl =
  import.meta.env.VITE_PROXY_URL
    ? `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch-component`
    : `http://localhost:${proxyPort}/api/chat/dispatch-component`;

// Register custom components
componentRegistry.register("ProductCard", ProductCard);
componentRegistry.register("SimpleChart", SimpleChart);
componentRegistry.register("StatusBadge", StatusBadge);
componentRegistry.register("InfoCard", InfoCard);

const inlineMount = document.getElementById("components-inline");
if (!inlineMount) {
  throw new Error("Components demo mount node missing");
}

createAgentExperience(inlineMount, {
  ...DEFAULT_WIDGET_CONFIG,
  apiUrl: proxyUrl,
  parserType: "json", // Use JSON parser to handle component directives
  enableComponentStreaming: true, // Enable component streaming (default: true)
  launcher: { enabled: false },
  theme: {
    ...DEFAULT_WIDGET_CONFIG.theme,
    primary: "#333",
    accent: "#2196f3",
    surface: "#ffffff",
    muted: "#666"
  },
  copy: {
    ...DEFAULT_WIDGET_CONFIG.copy,
    welcomeTitle: "Custom Components Demo",
    welcomeSubtitle: "Ask me to show you a product card, chart, or status badge!"
  },
  suggestionChips: [
    "Show me a product card",
    "Display a chart with data",
    "Create a status badge",
    "Show an info card"
  ]
});

initAgentWidget({
  target: "#components-launcher",
  useShadowDom: false,
  config: {
    ...DEFAULT_WIDGET_CONFIG,
    apiUrl: proxyUrl,
    parserType: "json",
    enableComponentStreaming: true,
    launcher: {
      ...DEFAULT_WIDGET_CONFIG.launcher,
      enabled: true,
      title: "Components Demo",
      subtitle: "Opens the custom components example",
      agentIconText: "🎨",
      autoExpand: false,
      width: 'min(420px, 95vw)'
    },
    theme: {
      ...DEFAULT_WIDGET_CONFIG.theme,
      primary: "#333",
      accent: "#2196f3",
      surface: "#ffffff",
      muted: "#666"
    },
    suggestionChips: [
      "Show me a product card",
      "Display a chart with data",
      "Create a status badge",
      "Show an info card"
    ]
  }
});
