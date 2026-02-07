import "@runtypelabs/persona/widget.css";
import "./index.css";
import "./App.css";

import {
  initAgentWidget,
  createAgentExperience,
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG
} from "@runtypelabs/persona";

const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const proxyUrl =
  import.meta.env.VITE_PROXY_URL ?
    `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch` :
    `http://localhost:${proxyPort}/api/chat/dispatch`;

const inlineMount = document.getElementById("inline-widget");
if (!inlineMount) {
  throw new Error("Inline widget mount node missing");
}

createAgentExperience(inlineMount, {
  ...DEFAULT_WIDGET_CONFIG,
  apiUrl: proxyUrl,
  launcher: {
    ...DEFAULT_WIDGET_CONFIG.launcher,
    width: "100%",
    enabled: false
  },
  features: {
    showEventStreamToggle: true
  },
  theme: {
    ...DEFAULT_WIDGET_CONFIG.theme,
    primary: "#0f172a",
    accent: "#ea580c",
    surface: "#f8fafc",
    muted: "#64748b"
  },
  copy: {
    ...DEFAULT_WIDGET_CONFIG.copy,
    welcomeTitle: "Inline Demo",
    welcomeSubtitle:
      "This instance is rendered via createAgentExperience with a neutral theme.",
    inputPlaceholder: "Ask about embedding, styling, or integrations…"
  },
  suggestionChips: [
    "Do you support streaming?",
    "How do I theme the widget?",
    "Show me the proxy setup"
  ],
  postprocessMessage: ({ text }) => markdownPostprocessor(text)
});

const launcherController = initAgentWidget({
  target: "#launcher-root",
  useShadowDom: false,
  config: {
    ...DEFAULT_WIDGET_CONFIG,
    apiUrl: proxyUrl,
    features: {
      showEventStreamToggle: true
    },
    theme: {
      launcherRadius: ".5rem"
    },
    launcher: {
      ...DEFAULT_WIDGET_CONFIG.launcher,
      iconUrl: "https://dummyimage.com/96x96/111827/ffffff&text=AI",
    },
    suggestionChips: [
      "How do I embed the widget?",
      "Show me the API docs",
      "Schedule a demo"
    ],
    postprocessMessage: ({ text }) => markdownPostprocessor(text)
  }
});

const openButton = document.getElementById('open-chat')
const toggleButton = document.getElementById('toggle-chat')
if (openButton) {
  openButton.addEventListener('click', () => launcherController.open())
}
if (toggleButton) {
  toggleButton.addEventListener('click', () => launcherController.toggle())
}
