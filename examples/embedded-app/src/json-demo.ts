import "@runtypelabs/persona/widget.css";
import "./index.css";
import "./App.css";

import {
  createAgentExperience,
  initAgentWidget,
  componentRegistry,
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG
} from "@runtypelabs/persona";

import { DynamicForm } from "./components";

// Register the DynamicForm component
componentRegistry.register("DynamicForm", DynamicForm);

const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const proxyUrl =
  import.meta.env.VITE_PROXY_URL ?
    `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch-directive` :
    `http://localhost:${proxyPort}/api/chat/dispatch-directive`;

const inlineMount = document.getElementById("json-inline");
if (!inlineMount) {
  throw new Error("JSON demo mount node missing");
}

createAgentExperience(inlineMount, {
  ...DEFAULT_WIDGET_CONFIG,
  apiUrl: proxyUrl,
  parserType: "json", // Use JSON parser for component directives
  enableComponentStreaming: true,
  launcher: { enabled: false, width: "100%" },
  formEndpoint: "/form",
  theme: {
    ...DEFAULT_WIDGET_CONFIG.theme,
    primary: "#111827",
    accent: "#6366f1",
    surface: "#ffffff",
    muted: "#64748b"
  },
  features: {
    ...DEFAULT_WIDGET_CONFIG.features,
    showReasoning: true,
    showToolCalls: true
  },
  copy: {
    ...DEFAULT_WIDGET_CONFIG.copy,
    welcomeTitle: "Dynamic Form Demo",
    welcomeSubtitle:
      "Ask about scheduling or try the suggested prompts to see dynamic forms in action."
  },
  suggestionChips: [
    "Can you schedule a demo for me?",
    "What does the dynamic form do?",
    "Show me a form for extra context"
  ],
  postprocessMessage: ({ text }) => markdownPostprocessor(text)
});

initAgentWidget({
  target: "#json-launcher",
  useShadowDom: false,
  config: {
    ...DEFAULT_WIDGET_CONFIG,
    apiUrl: proxyUrl,
    parserType: "json",
    enableComponentStreaming: true,
    formEndpoint: "/form",
    launcher: {
      ...DEFAULT_WIDGET_CONFIG.launcher,
      enabled: true,
      title: "Form Demo",
      subtitle: "Opens the dynamic form example",
      agentIconText: "📋",
      autoExpand: false,
      width: 'min(420px, 95vw)'
    },
    features: {
      ...DEFAULT_WIDGET_CONFIG.features,
      showReasoning: true,
      showToolCalls: true
    },
    theme: {
      ...DEFAULT_WIDGET_CONFIG.theme,
      primary: "#020617",
      accent: "#6366f1",
      surface: "#ffffff",
      muted: "#64748b"
    },
    suggestionChips: [
      "Collect my details with a form",
      "I have extra requirements",
      "What's next after the form?"
    ],
    postprocessMessage: ({ text }) => markdownPostprocessor(text)
  }
});
