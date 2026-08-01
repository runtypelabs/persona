/**
 * Five commercial welcome states, recreated with nothing but public Persona
 * config: `suggestions.starters`, `copy.welcome*`, and theme tokens. No plugin
 * hooks, no CSS reaching into widget internals.
 *
 * Each recreation is a separate widget instance
 * with its own theme, so the page also doubles as a multi-instance test.
 */

import "@runtypelabs/persona/widget.css";
import {
  createAgentExperience,
  type AgentWidgetConfig,
  type AgentWidgetController,
} from "@runtypelabs/persona";

import { createDemoEchoFetch } from "./demo-echo-fetch";
import { renderExamplesShell } from "./examples-nav";

renderExamplesShell("suggestion-recreations");

const recreationFetch = createDemoEchoFetch({
  chunkSize: 6,
  delayMs: 22,
  reply: (userText) =>
    `You picked “${userText}”. Nothing here talks to a model: these five panels are the same Persona widget with five different config objects, so the welcome state is the whole demo.`,
});

/**
 * Shared skeleton. Every recreation runs headerless (a "Chat Assistant" bar
 * would break the impression), inline, with no persistence and no network.
 */
const base = (): AgentWidgetConfig => ({
  apiUrl: "https://noop.test/chat",
  customFetch: recreationFetch,
  persistState: false,
  colorScheme: "light",
  // `fullHeight` is the inline-fill contract: the widget stretches to the
  // sized `.recreation-stage` box instead of taking the floating panel width.
  launcher: { enabled: false, fullHeight: true, width: "100%" },
  layout: { showHeader: false },
  statusIndicator: { visible: false },
  voiceRecognition: { enabled: false },
  messageActions: { enabled: false },
});

// ── 1. ChatGPT (2025) ───────────────────────────────────────────────────
// Centered question, no subtitle, a wrapped row of fully rounded category
// pills. Their chips prefill a prompt stem rather than sending, so the labels
// are 2 to 3 word categories and `prompt` carries the stem.
const chatgpt = (): AgentWidgetConfig => ({
  ...base(),
  copy: {
    welcomeTitle: "What can I help with?",
    // Token gap: there is no way to omit the subtitle element. An empty string
    // still renders the <p>, so the greeting keeps ~8px of dead space under it.
    welcomeSubtitle: "",
    inputPlaceholder: "Ask anything",
  },
  // Composer tune-up: the closest available config to ChatGPT's pill.
  // Their input-on-top, action-row-below layout and the labeled "Tools"
  // button are not expressible; this gets the leading "+", the trailing
  // mic, and the round arrow-up send.
  attachments: { enabled: true, buttonIconName: "plus" },
  // Live feature, not chrome: clicking the mic starts real browser speech
  // recognition. Enabled here for visual parity with ChatGPT's empty state.
  voiceRecognition: {
    enabled: true,
    backgroundColor: "transparent",
    borderWidth: "0",
    iconColor: "#5d5d5d",
    showTooltip: false,
  },
  sendButton: {
    useIcon: true,
    iconName: "arrow-up",
    size: "36px",
    showTooltip: false,
  },
  suggestions: {
    starters: {
      variant: "chip",
      overflow: "wrap",
      behavior: "fill",
      placement: "welcome",
      maxItems: 5,
      // Per-pill accent glyphs on neutral text, ChatGPT's signature trait:
      // `iconColor` tints only the icon, so borders and labels stay gray.
      items: [
        { id: "image", label: "Create image", prompt: "Create an image of ", icon: "image", iconColor: "#43a25a" },
        { id: "summarize", label: "Summarize text", prompt: "Summarize this text: ", icon: "file-text", iconColor: "#e0843a" },
        { id: "write", label: "Help me write", prompt: "Help me write ", icon: "pen-line", iconColor: "#8e6ee6" },
        { id: "brainstorm", label: "Brainstorm", prompt: "Brainstorm ideas for ", icon: "lightbulb", iconColor: "#e2b93b" },
        { id: "analyze", label: "Analyze data", prompt: "Analyze this data: ", icon: "chart-column", iconColor: "#4a9fd8" },
      ],
    },
  },
  theme: {
    semantic: {
      colors: {
        background: "#ffffff",
        container: "#ffffff",
        surface: "#ffffff",
        text: "#0d0d0d",
        textMuted: "#5d5d5d",
        border: "#e3e3e3",
        primary: "#0d0d0d",
        // ChatGPT's home state has no rule between transcript and composer.
        divider: "transparent",
      },
    },
    components: {
      panel: { borderRadius: "0" },
      // 28px, not 9999px: the two-row bar in the May 2025 shot is a rounded
      // rectangle; a stadium only matches their old single-row state.
      input: { background: "#ffffff", borderRadius: "28px" },
      // Measured off the ChatGPT composer: 16px type on a 24px line, the
      // textarea row sitting 16px above the action row. Keep lineHeight <= 24px
      // or it eats into the textarea's 60px max-height. The edge is drawn by
      // the soft shadow, not the hairline border.
      composer: {
        shadow: "0 4px 24px rgba(0, 0, 0, 0.05), 0 1px 1px rgba(0, 0, 0, 0.03)",
        padding: "18px 16px 12px",
        gap: "16px",
        fontSize: "16px",
        lineHeight: "24px",
      },
      // `semantic.colors.primary` does not reach the send button: the button
      // token defaults straight to the palette ramp, so brand it here.
      button: {
        primary: {
          background: "#0d0d0d",
          foreground: "#ffffff",
          borderRadius: "9999px",
        },
      },
      suggestion: {
        chip: {
          background: "transparent",
          foreground: "#0d0d0d",
          border: "#e3e3e3",
          borderRadius: "9999px",
          padding: "0.5rem 0.875rem",
          gap: "0.5rem",
          minHeight: "36px",
          fontSize: "0.8125rem",
          iconSize: "16px",
          hoverBackground: "#f3f3f3",
          hoverBorder: "#d9d9d9",
        },
      },
    },
  },
});

// ── 2. Claude.ai ────────────────────────────────────────────────────────
// The minimalist school: warm cream paper, a time-of-day greeting set in a
// serif, and zero starters. The welcome tone is the entire recreation.
const claude = (): AgentWidgetConfig => ({
  ...base(),
  copy: {
    welcomeTitle: "Good evening",
    welcomeSubtitle: "What are we working on?",
    inputPlaceholder: "How can I help you today?",
  },
  // Claude's submit is a small terracotta arrow-up, not a paper plane. No
  // attachment or mic row here: the recreation is the calm card, not the tools.
  sendButton: {
    useIcon: true,
    iconName: "arrow-up",
    size: "32px",
    showTooltip: false,
  },
  suggestions: {
    // Explicitly empty, not omitted: with no `items` the resolver falls back to
    // the legacy `suggestionChips` defaults and three filler chips appear.
    starters: { items: [] },
  },
  theme: {
    palette: {
      typography: {
        fontFamily: {
          // Token gap: the greeting has no font token of its own, so matching
          // Claude's serif headline means setting the family for the whole
          // widget (their composer and body copy are sans). A per-element
          // welcome typography token would fix this.
          sans: 'Georgia, "Iowan Old Style", "Palatino Linotype", "Times New Roman", serif',
        },
      },
    },
    semantic: {
      colors: {
        background: "#faf9f5",
        container: "#faf9f5",
        // `surface` paints the composer footer band, so it stays cream and the
        // white card comes from `components.input.background`.
        surface: "#faf9f5",
        text: "#3d3929",
        textMuted: "#83827d",
        border: "#e5e2d9",
        primary: "#c96442",
      },
    },
    components: {
      panel: { borderRadius: "0" },
      input: { background: "#ffffff", borderRadius: "0.75rem" },
      // Claude's card is the roomiest of the five: 16px type on 24px, and a
      // deep top inset so the caret sits well below the card edge.
      composer: {
        shadow: "0 1px 2px rgba(61, 57, 41, 0.08)",
        padding: "18px 16px 14px",
        gap: "14px",
        fontSize: "16px",
        lineHeight: "24px",
      },
      button: {
        primary: { background: "#c96442", foreground: "#ffffff", borderRadius: "0.5rem" },
      },
    },
  },
});

// ── 3. Gemini (2025) ────────────────────────────────────────────────────
// Vertical stack of tool-flavored prompts with the icons deleted in the 2025
// simplification. Rows are transparent until hover; blue accent, pill composer.
const gemini = (): AgentWidgetConfig => ({
  ...base(),
  copy: {
    welcomeTitle: "Hello, there",
    welcomeSubtitle: "",
    inputPlaceholder: "Ask Gemini",
  },
  // Gemini's bar carries a leading "+" and a trailing mic; the labeled "Tools"
  // button between them is not expressible in config.
  attachments: { enabled: true, buttonIconName: "plus" },
  // Live feature, not chrome: clicking the mic starts real browser speech
  // recognition. Enabled here for visual parity with Gemini's input bar.
  voiceRecognition: {
    enabled: true,
    backgroundColor: "transparent",
    borderWidth: "0",
    iconColor: "#444746",
    showTooltip: false,
  },
  sendButton: {
    useIcon: true,
    iconName: "arrow-up",
    size: "36px",
    showTooltip: false,
  },
  suggestions: {
    starters: {
      variant: "list",
      behavior: "fill",
      placement: "welcome",
      maxItems: 5,
      items: [
        { id: "image", label: "Create an image of...", prompt: "Create an image of " },
        { id: "research", label: "Do deep research on a topic" },
        { id: "learn", label: "Help me learn something new" },
        { id: "draft", label: "Draft an email I keep putting off" },
        { id: "summarize", label: "Summarize a long document" },
      ],
    },
  },
  theme: {
    semantic: {
      colors: {
        background: "#ffffff",
        container: "#ffffff",
        surface: "#ffffff",
        text: "#1f1f1f",
        textMuted: "#444746",
        border: "#e3e3e3",
        primary: "#0b57d0",
        accent: "#0b57d0",
      },
    },
    components: {
      panel: { borderRadius: "0" },
      // 28px, not 9999px: with the two-row action layout Gemini's bar is a
      // rounded rectangle; a stadium shape only fits their single-row state.
      input: { background: "#f0f4f9", borderRadius: "28px" },
      // The wider horizontal inset keeps the caret clear of the rounded ends;
      // 16px type on 24px matches Gemini's bar.
      composer: {
        shadow: "none",
        padding: "16px 20px 12px",
        gap: "14px",
        fontSize: "16px",
        lineHeight: "24px",
      },
      button: {
        primary: { background: "#0b57d0", foreground: "#ffffff", borderRadius: "9999px" },
      },
      suggestion: {
        list: {
          // Token gap: the space BETWEEN rows is a fixed 8px. `gap` here is the
          // icon-to-copy gap inside a row, so Gemini's tighter stack is out of
          // reach through config.
          background: "transparent",
          foreground: "#1f1f1f",
          border: "transparent",
          borderRadius: "0.75rem",
          padding: "0.6875rem 0.75rem",
          minHeight: "44px",
          fontSize: "0.875rem",
          hoverBackground: "#f0f4f9",
          hoverBorder: "transparent",
          pressedBackground: "#e3eaf3",
        },
      },
    },
  },
});

// ── 4. Microsoft Copilot ────────────────────────────────────────────────
// The rich-card school: a 2x2 of icon plus short title plus muted description,
// the two-line pattern M365 kept when everyone else dropped it. Click sends.
const copilot = (): AgentWidgetConfig => ({
  ...base(),
  copy: {
    welcomeTitle: "How can I help you today?",
    welcomeSubtitle: "I can work across your mail, meetings, and documents.",
    inputPlaceholder: "Message Copilot",
  },
  // M365 Copilot's box shows a leading "+" and a trailing mic.
  attachments: { enabled: true, buttonIconName: "plus" },
  // Live feature, not chrome: clicking the mic starts real browser speech
  // recognition. Enabled here for visual parity with Copilot's input box.
  voiceRecognition: {
    enabled: true,
    backgroundColor: "transparent",
    borderWidth: "0",
    iconColor: "#616161",
    showTooltip: false,
  },
  sendButton: {
    useIcon: true,
    iconName: "arrow-up",
    size: "32px",
    showTooltip: false,
  },
  suggestions: {
    starters: {
      variant: "card",
      behavior: "send",
      placement: "welcome",
      maxItems: 4,
      items: [
        {
          id: "catch-up",
          label: "Catch me up on this week",
          description: "Meetings, mentions, and unread mail",
          icon: "mail",
        },
        {
          id: "status",
          label: "Draft a project status update",
          description: "Pulls from your recent docs and chats",
          icon: "file-text",
        },
        {
          id: "meeting",
          label: "Summarize my last meeting",
          description: "Decisions, owners, and next steps",
          icon: "calendar-days",
        },
        {
          id: "find",
          label: "Find files I worked on last month",
          description: "Searches Word, Excel, and PowerPoint",
          icon: "search",
        },
      ],
    },
  },
  theme: {
    semantic: {
      colors: {
        background: "#f7f7f9",
        container: "#f7f7f9",
        surface: "#ffffff",
        text: "#242424",
        textMuted: "#616161",
        border: "#e1dfdd",
        primary: "#0f6cbd",
        accent: "#0f6cbd",
      },
    },
    components: {
      panel: { borderRadius: "0" },
      input: { background: "#ffffff", borderRadius: "0.75rem" },
      // Roomier than the Persona default but tighter than Claude's card:
      // Copilot's box is a soft rectangle with 16px type on 24px.
      composer: {
        shadow: "0 1px 2px rgba(0, 0, 0, 0.06)",
        padding: "16px 16px 12px",
        gap: "12px",
        fontSize: "16px",
        lineHeight: "24px",
      },
      button: {
        primary: { background: "#0f6cbd", foreground: "#ffffff", borderRadius: "9999px" },
      },
      suggestion: {
        card: {
          background: "#ffffff",
          foreground: "#242424",
          border: "#e1dfdd",
          borderRadius: "0.75rem",
          padding: "0.875rem",
          gap: "0.625rem",
          minHeight: "84px",
          fontSize: "0.875rem",
          iconSize: "18px",
          shadow: "0 1px 2px rgba(0, 0, 0, 0.06)",
          hoverBackground: "#f3f2f1",
          hoverBorder: "#c7c5c3",
          pressedBackground: "#ebe9e7",
        },
      },
    },
  },
});

// ── 5. Perplexity ───────────────────────────────────────────────────────
// Search-flavored: hairline rows of full questions that send on click, teal
// accent, offwhite paper.
const perplexity = (): AgentWidgetConfig => ({
  ...base(),
  copy: {
    welcomeTitle: "Where knowledge begins",
    welcomeSubtitle: "Ask anything and get an answer with sources.",
    inputPlaceholder: "Ask anything...",
  },
  // Search-box submit: a teal circle with a right-pointing arrow. No attachment
  // or mic control, so the box reads as a search field rather than a chat bar.
  sendButton: {
    useIcon: true,
    iconName: "arrow-right",
    size: "36px",
    showTooltip: false,
  },
  suggestions: {
    starters: {
      variant: "list",
      behavior: "send",
      placement: "welcome",
      maxItems: 5,
      items: [
        // Token gap: the leading glyph inherits the label color, so the teal
        // search icon Perplexity uses is not reachable per item. The only
        // accent path is `emphasis: "primary"`, which also tints the border
        // and background.
        { id: "black-holes", label: "How do black holes form?", icon: "search" },
        { id: "tech-week", label: "What happened in tech this week?", icon: "search" },
        { id: "heat-pump", label: "How does a heat pump actually work?", icon: "search" },
        { id: "market", label: "Why did the market drop today?", icon: "search" },
        { id: "housing", label: "Is the housing market cooling off?", icon: "search" },
      ],
    },
  },
  theme: {
    semantic: {
      colors: {
        background: "#fcfcf9",
        container: "#fcfcf9",
        surface: "#fcfcf9",
        text: "#13343b",
        textMuted: "#64645f",
        border: "#e8e8e3",
        primary: "#20808d",
        accent: "#20808d",
      },
    },
    components: {
      panel: { borderRadius: "0" },
      input: { background: "#ffffff", borderRadius: "0.75rem" },
      // Search-field proportions: a tall box with 16px type on 24px and the
      // submit control dropped onto its own row below the query.
      composer: {
        shadow: "0 1px 2px rgba(19, 52, 59, 0.06)",
        padding: "16px 16px 12px",
        gap: "14px",
        fontSize: "16px",
        lineHeight: "24px",
      },
      button: {
        primary: { background: "#20808d", foreground: "#ffffff", borderRadius: "9999px" },
      },
      suggestion: {
        list: {
          background: "transparent",
          foreground: "#13343b",
          border: "#e8e8e3",
          borderRadius: "0.5rem",
          padding: "0.75rem 0.875rem",
          gap: "0.625rem",
          minHeight: "44px",
          fontSize: "0.875rem",
          iconSize: "16px",
          hoverBackground: "#f3f3ee",
          hoverBorder: "#20808d",
          pressedBackground: "#ebebe4",
        },
      },
    },
  },
});

const RECREATIONS: ReadonlyArray<{ id: string; build: () => AgentWidgetConfig }> = [
  { id: "chatgpt", build: chatgpt },
  { id: "claude", build: claude },
  { id: "gemini", build: gemini },
  { id: "copilot", build: copilot },
  { id: "perplexity", build: perplexity },
];

const controllers: AgentWidgetController[] = [];

RECREATIONS.forEach(({ id, build }) => {
  const mount = document.querySelector<HTMLElement>(`[data-recreation="${id}"]`);
  if (!mount) {
    console.warn(`[suggestion-recreations] No mount found for "${id}".`);
    return;
  }
  controllers.push(createAgentExperience(mount, build()));
});

window.addEventListener("beforeunload", () => {
  controllers.forEach((controller) => controller.destroy());
});

// Handy for poking at any instance from the console.
Object.defineProperty(window, "suggestionRecreations", {
  configurable: true,
  get: () => controllers,
});
