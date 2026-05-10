import "@runtypelabs/persona/widget.css";
import "./index.css";
import "./App.css";

import {
  createAgentExperience,
  initAgentWidget,
  componentRegistry,
  createLocalStorageAdapter,
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

const inlineMount = document.getElementById("dynamic-form-inline");
if (!inlineMount) {
  throw new Error("Dynamic form demo mount node missing");
}

const inlineController = createAgentExperience(inlineMount, {
  ...DEFAULT_WIDGET_CONFIG,
  apiUrl: proxyUrl,
  storageAdapter: createLocalStorageAdapter("persona-state-dynamic-form-inline"),
  parserType: "json", // Use JSON parser for component directives
  enableComponentStreaming: true,
  // The DynamicForm renders its own card chrome (border, padding, shadow),
  // so disable Persona's default bubble wrap to avoid a card-on-card look.
  wrapComponentDirectiveInBubble: false,
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

// `injectComponentDirective` renders a registered component as if the LLM had
// streamed `{ "text": "...", "component": "DynamicForm", "props": {...} }`.
// Same path, no API round-trip — useful for QA, design previews, debug
// toggles, and local tools that want to render a component inline.
const previewBtn = document.getElementById("dynamic-form-preview");
if (previewBtn) {
  let previewIndex = 0;
  previewBtn.addEventListener("click", () => {
    previewIndex += 1;
    inlineController.injectComponentDirective({
      id: `preview-form-${previewIndex}`,
      component: "DynamicForm",
      text: "Preview: this is the same DynamicForm the AI would emit.",
      props: {
        title: "Schedule a demo",
        description: "Share your details — we'll follow up to confirm.",
        fields: [
          { label: "First Name", type: "text", required: true, width: "half" },
          { label: "Last Name", type: "text", required: true, width: "half" },
          { label: "Email", type: "email", required: true },
          { label: "Phone", type: "tel", width: "half" },
          { label: "Company", type: "text", width: "half" },
          {
            label: "Notes",
            type: "textarea",
            placeholder: "Anything we should know?"
          }
        ],
        submit_text: "Request meeting"
      },
      llmContent:
        "[Demo: previewed booking form via injectComponentDirective. Not a user request.]"
    });
  });
}

initAgentWidget({
  target: "#dynamic-form-launcher",
  useShadowDom: false,
  config: {
    ...DEFAULT_WIDGET_CONFIG,
    apiUrl: proxyUrl,
    storageAdapter: createLocalStorageAdapter("persona-state-dynamic-form-launcher"),
    parserType: "json",
    enableComponentStreaming: true,
    wrapComponentDirectiveInBubble: false,
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
    formStyles: {
      borderRadius: "6px",
      borderWidth: "1px",
      borderColor: "#e5e7eb",
      padding: "1.25rem",
      titleFontSize: "1.25rem",
      buttonBorderRadius: "6px"
    },
    postprocessMessage: ({ text }) => markdownPostprocessor(text)
  }
});
