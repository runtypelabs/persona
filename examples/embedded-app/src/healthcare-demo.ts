import "@runtypelabs/persona/widget.css";
import "./index.css";

import {
  initAgentWidget,
  createTheme,
  accessibilityPlugin,
  highContrastPlugin,
  reducedMotionPlugin,
  componentRegistry,
  createLocalStorageAdapter,
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetConfig,
} from "@runtypelabs/persona";

import { DynamicForm, type DynamicFormStyles } from "./components";

// ---------------------------------------------------------------------------
// Riverside Community Health — Accessible Patient Assistant
//
// A "high-accessibility" configuration of Persona, built almost entirely from
// config. The goal is clarity first: large readable type, high contrast,
// plain-language copy, predictable layout, full keyboard + screen-reader
// support, and *multiple ways to complete the same task* (chat, voice, big
// page buttons, and labeled forms). It targets the heuristics from healthcare
// accessibility guidance (WCAG 2.1 AA): 16px+ scalable text, 4.5:1+ contrast,
// plain language, structured choices instead of a chat-only interface, and
// low-friction error recovery.
//
// Forms are rendered with the existing `DynamicForm` component so common tasks
// (booking, refills, messaging a care team) are completable by tabbing through
// labeled controls rather than by composing free text.
// ---------------------------------------------------------------------------

componentRegistry.register("DynamicForm", DynamicForm);

const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const proxyUrl =
  import.meta.env.VITE_PROXY_URL
    ? `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch-healthcare`
    : `http://localhost:${proxyPort}/api/chat/dispatch-healthcare`;

// Honor the OS "reduce motion" setting — accessibility, not decoration.
const prefersReducedMotion =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// A calm, clinical teal. The 500 shade is dark enough to clear 4.5:1 against
// white text in user bubbles and buttons; high-contrast plugin darkens text,
// borders, and dividers further. Built once via the theme API so the built-in
// accessibility plugins do the heavy lifting (focus rings, contrast) for us.
const theme = createTheme(
  {
    palette: {
      colors: {
        primary: {
          50: "#e7f4f3",
          100: "#c5e6e3",
          200: "#9bd5d0",
          300: "#69bdb7",
          400: "#369e98",
          500: "#0b6360", // base — strong teal, ~5.3:1 with white text
          600: "#094d4b",
          700: "#073b3a",
          800: "#052b2a",
          900: "#03201f",
          950: "#021413",
        },
      },
      typography: {
        // Larger, scalable base type. Everything is rem-based so browser zoom
        // and OS text-size settings reflow without breaking the layout.
        fontSize: {
          xs: "0.8125rem",
          sm: "0.9375rem",
          base: "1.0625rem", // ~17px body text
          lg: "1.25rem",
          xl: "1.5rem",
          "2xl": "1.875rem",
          "3xl": "2.25rem",
          "4xl": "3rem",
        },
        lineHeight: {
          tight: "1.3",
          normal: "1.6", // generous spacing aids low-vision + dyslexic readers
          relaxed: "1.75",
        },
      },
    },
  },
  {
    plugins: [
      accessibilityPlugin(), // stronger focus indicators + disabled states
      highContrastPlugin(), // near-black text, high-contrast borders/dividers
      ...(prefersReducedMotion ? [reducedMotionPlugin()] : []),
    ],
  },
);

// `formStyles` is read by the example `DynamicForm` component (via
// `context.config.formStyles`), not by the widget core, so we widen the type.
const config: AgentWidgetConfig & { formStyles?: DynamicFormStyles } = {
  ...DEFAULT_WIDGET_CONFIG,
  apiUrl: proxyUrl,
  persistState: true,
  storageAdapter: createLocalStorageAdapter("persona-state-healthcare-demo"),

  // Render assistant-emitted forms as accessible, labeled controls.
  parserType: "json",
  enableComponentStreaming: true,
  wrapComponentDirectiveInBubble: false,
  formEndpoint: "/form",

  // Respect the system light/dark preference instead of forcing a scheme.
  colorScheme: "auto",
  theme,

  launcher: {
    ...DEFAULT_WIDGET_CONFIG.launcher,
    enabled: true,
    title: "Riverside Health Assistant",
    subtitle: "Help with appointments, refills, and more",
    agentIconText: "✚",
    width: "min(460px, 95vw)",
    // Large, clearly-labeled close affordance for motor + low-vision users.
    closeButtonShowTooltip: true,
    closeButtonTooltipText: "Close chat",
  },

  copy: {
    ...DEFAULT_WIDGET_CONFIG.copy,
    welcomeTitle: "How can we help you today?",
    welcomeSubtitle:
      "Ask a question in your own words, or pick a button below. You can type or use the microphone. This assistant does not give medical advice — call 911 for emergencies.",
    inputPlaceholder: "Type your question here…",
    sendButtonLabel: "Send",
  },

  // Multiple obvious entry points to the most common tasks ("multiple ways to
  // complete the same task"). Phrased as plain-language actions.
  suggestionChips: [
    "Book an appointment",
    "Refill a prescription",
    "Message my care team",
    "Find clinic hours and location",
  ],
  suggestionChipsConfig: {
    fontWeight: "600",
    paddingX: "1rem",
    paddingY: "0.625rem",
  },

  // A text "Send" button reads more clearly than an icon for low digital
  // literacy and screen-reader users.
  sendButton: {
    useIcon: false,
    showTooltip: true,
    tooltipText: "Send message",
  },

  // Voice-to-text as an alternate input method.
  voiceRecognition: {
    enabled: true,
    autoResume: "assistant",
    showTooltip: true,
    tooltipText: "Speak your message",
  },

  // Clear, plain-language connection status.
  statusIndicator: {
    visible: true,
    idleText: "Ready to help",
    connectingText: "Connecting…",
    connectedText: "Connected",
    errorText: "Connection problem — please try again",
  },

  // Copy is always visible (not hover-only) so it works for keyboard, touch,
  // and screen-reader users without a hover state.
  messageActions: {
    enabled: true,
    showCopy: true,
    visibility: "always",
    align: "left",
  },

  // Large, comfortable form controls — easy targets, readable labels.
  formStyles: {
    borderRadius: "12px",
    padding: "1.25rem",
    titleFontSize: "1.25rem",
    descriptionFontSize: "1rem",
    labelFontSize: "1rem",
    labelFontWeight: "600",
    inputFontSize: "1.0625rem",
    inputPadding: "0.75rem 0.875rem",
    inputBorderRadius: "10px",
    buttonFontSize: "1.0625rem",
    buttonPadding: "0.875rem 1.25rem",
    buttonBorderRadius: "10px",
  },

  postprocessMessage: ({ text }) => markdownPostprocessor(text),
};

const widgetController = initAgentWidget({
  target: "#launcher-root",
  config,
});

// Host-page quick-action buttons open the assistant and send a plain-language
// request — the same tasks are reachable from the page, the chat, or voice.
document.querySelectorAll<HTMLElement>("[data-assistant-prompt]").forEach((el) => {
  el.addEventListener("click", () => {
    const prompt = el.getAttribute("data-assistant-prompt");
    if (!prompt) return;
    widgetController.open();
    widgetController.submitMessage(prompt);
  });
});

// Expose for debugging / manual testing.
(window as unknown as { healthcareWidget?: typeof widgetController }).healthcareWidget =
  widgetController;
