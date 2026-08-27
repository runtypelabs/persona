/**
 * Five commercial welcome states paired with the current composer presets
 * measured in the standalone recreations. The authored surface is public
 * Persona config throughout (`suggestions.starters`, `welcome`, `composer`,
 * and theme tokens); the page stylesheet carries page chrome plus the heading
 * reset that undoes this site's own global heading font.
 *
 * Each recreation is a separate widget instance
 * with its own theme, so the page also doubles as a multi-instance test.
 *
 * Two ordering rules shape every composer below, so they are stated once here
 * instead of five times:
 *
 * 1. The built-in order anchors are fixed: mention 100, attachment 200, modes
 *    300 to 499, host actions 500 by default, the overflow `+` trigger 900, all
 *    in the start cluster; model picker 700, mic 800, send 1000 in the end one.
 *    A product whose real `+` sits LEFT of its mode toggles cannot be matched
 *    exactly: fold the attachment button into the menu and the trigger trails
 *    the modes, or leave it in the bar and there is no menu to open.
 * 2. No config preselects a mode. `activeModeIds` is restored state, never an
 *    authored default, so every exclusive group here starts empty and the
 *    product's default selection has to be clicked.
 *
 * The ChatGPT and Claude presets also carry a live "/" menu (a
 * `contextMentions` slash channel; the other three products have none). Its
 * popover mounts on document.body, outside the per-instance theme variables, so
 * on this multi-instance page both menus keep the widget's default chrome
 * instead of their product palette; the standalone pages paint theirs.
 *
 * One rendering asymmetry follows from the same design: a folded built-in keeps
 * its live element (that is what preserves the file input), so it lands in the
 * menu as an icon-only row while contributed rows carry an icon and a label.
 * `attachments.buttonTooltipText` is the closest thing it has to a menu label.
 */

import "@runtypelabs/persona/widget.css";
import {
  createAgentExperience,
  type AgentWidgetConfig,
  type AgentWidgetController,
  type ComposerAction,
} from "@runtypelabs/persona";

import { createDemoEchoFetch } from "./demo-echo-fetch";
import { renderExamplesShell } from "./examples-nav";
import { applyCurrentProductComposer } from "./recreation-composer-presets";

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

/**
 * A row that exists for shape only. The real products list drive pickers and
 * connectors in their `+` menus; nothing is wired up on this page, so the row
 * ships disabled with the reason on its `title`. Disabled is the honest state:
 * a live-looking row that swallows the click would read as a broken menu.
 */
const inertMenuAction = (
  id: string,
  label: string,
  iconName: string,
  order: number
): ComposerAction => ({
  id,
  kind: "button",
  placement: "start",
  presentation: "overflow",
  order,
  label,
  iconName,
  disabled: true,
  tooltipText: `${label} is a placeholder here: this recreation wires up no connectors.`,
  onSelect: () => {},
});

// ── 1. ChatGPT (2025) ───────────────────────────────────────────────────
// Centered question, no subtitle, a wrapped row of fully rounded category
// pills. Their chips prefill a prompt stem rather than sending, so the labels
// are 2 to 3 word categories and `prompt` carries the stem.
const chatgpt = (): AgentWidgetConfig => applyCurrentProductComposer("chatgpt", {
  ...base(),
  welcome: {
    variant: "hero",
    title: "What can I help with?",
    // An empty string omits the subtitle paragraph, its margin included.
    subtitle: "",
  },
  copy: {
    inputPlaceholder: "Ask anything",
  },
  // Composer: one rounded pill. A single leading "+" opens the tool menu, so
  // every start-cluster control is folded into it: the attachment built-in
  // through `includeBuiltIns`, and each tool as a mode at `presentation:
  // "overflow"`. Picking one from the menu is a real mode toggle, so it drops a
  // removable chip above the input and swaps the placeholder. End cluster: mic,
  // then the voice-mode affordance, then the black circular send.
  //
  // Their in-composer model label and the full-screen dictation waveform are
  // not expressible; this gets the two buttons that open them.
  attachments: {
    enabled: true,
    buttonIconName: "paperclip",
    buttonTooltipText: "Add photos and files",
  },
  composer: {
    // The trigger only appears once the menu would hold something, and folding
    // a built-in is always explicit: enabling the menu never moves the
    // attachment button by itself.
    actionOverflow: { enabled: true, includeBuiltIns: ["attachments"] },
    // Menu order follows the action order anchors: the folded attachment
    // (200) leads, then the modes in `modes` order from 300.
    modes: [
      {
        id: "create-image",
        label: "Create image",
        iconName: "image",
        presentation: "overflow",
        placeholder: "Describe an image",
      },
      {
        id: "deep-research",
        label: "Deep research",
        iconName: "search",
        presentation: "overflow",
        placeholder: "What should I research?",
      },
      {
        id: "web-search",
        label: "Web search",
        iconName: "globe",
        presentation: "overflow",
        placeholder: "Search the web",
      },
      {
        id: "think-longer",
        label: "Think longer",
        iconName: "lightbulb",
        presentation: "overflow",
        placeholder: "Ask something worth thinking about",
      },
      {
        id: "agent-mode",
        label: "Agent mode",
        iconName: "bot",
        presentation: "overflow",
        placeholder: "Give the agent a task",
      },
    ],
    actions: [
      {
        // Their voice mode opens a separate full-screen surface, which config
        // has no seam for; this is the button that would open it, held
        // disabled so the panel never pretends to listen. The registry has no
        // audio-lines glyph, so `activity` stands in for the waveform.
        id: "voice-mode",
        kind: "button",
        placement: "end",
        presentation: "bar",
        order: 850,
        label: "Voice mode",
        iconName: "activity",
        disabled: true,
        tooltipText: "Voice mode is visual only in this recreation.",
        onSelect: () => {},
      },
    ],
  },
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
    // Sparse arrow glyph: the 50% default box reads lost; 25px matches the ref.
    iconSize: "20px",
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
        // One token sizes the "+" trigger, the mic, and the voice-mode button
        // together; `sendButton.size` still wins for send.
        controlSize: "36px",
        controlIconSize: "20px",
      },
      // `semantic.colors.primary` does not reach the send button: the button
      // token defaults straight to the palette ramp, so brand it here.
      button: {
        primary: {
          background: "#0d0d0d",
          foreground: "#ffffff",
          borderRadius: "9999px",
        },
        // Every composer icon control and the overflow menu rows read the
        // ghost tokens: gray glyphs on a near-white hover, ChatGPT's chrome.
        ghost: {
          foreground: "#5d5d5d",
          hoverBackground: "#f3f3f3",
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
// The minimalist school: warm cream paper, a single serif question centered
// over the composer, and zero starters. The welcome tone is the recreation.

// Greeting face only. Claude's composer and body copy stay on the sans stack.
const CLAUDE_SERIF =
  'Georgia, "Iowan Old Style", "Palatino Linotype", "Times New Roman", serif';

const claude = (): AgentWidgetConfig => applyCurrentProductComposer("claude", {
  ...base(),
  // Hero variant: one centered serif question over the composer, sparkle
  // above, no subtitle. This is the current claude.ai composition, not the
  // older top-left "Good evening" block.
  welcome: {
    variant: "hero",
    title: "What shall we think through?",
    subtitle: "",
    icon: { type: "text", text: "✳" },
  },
  copy: {
    inputPlaceholder: "How can I help you today?",
  },
  // Composer: a rounded card with the input on top and one action row under it.
  // Start cluster: a "Research" mode toggle as a labeled pill, then the "+"
  // menu holding the upload button, the web-search mode, and a connectors
  // placeholder. End cluster: the model picker, then the terracotta send.
  //
  // Two mismatches worth naming. Their "+" sits left of Research; the trigger
  // is anchored at order 900, after the mode range, so it trails instead. And
  // the effort selector that hangs off their model picker has no config seam:
  // effort would have to be modeled as its own single-select mode group.
  attachments: {
    enabled: true,
    buttonIconName: "paperclip",
    buttonTooltipText: "Upload a file",
  },
  composer: {
    actionOverflow: { enabled: true, includeBuiltIns: ["attachments"] },
    models: [
      { id: "sonnet-4-6", label: "Sonnet 4.6" },
      { id: "opus-4-5", label: "Opus 4.5" },
    ],
    selectedModelId: "sonnet-4-6",
    modes: [
      {
        id: "research",
        label: "Research",
        // `shortLabel` is what makes the bar button a labeled pill rather than
        // an icon-only box, and it is the chip text once the mode is on.
        shortLabel: "Research",
        iconName: "search",
        presentation: "bar",
        placeholder: "What should I research?",
      },
      {
        id: "web-search",
        label: "Web search",
        iconName: "globe",
        presentation: "overflow",
        placeholder: "Search the web and answer",
      },
    ],
    actions: [inertMenuAction("connectors", "Connect apps", "link", 600)],
  },
  // Claude's submit is a small terracotta arrow-up, not a paper plane.
  // No explicit size: send rides the 34px control-size token so the right
  // rail (picker, send) sits on one height, matching the real product.
  sendButton: {
    useIcon: true,
    iconName: "arrow-up",
    // Sparse arrow glyph: the 50% default box reads lost; 20px matches the ref.
    // Stroke is lighter for the icon
    iconSize: "20px",
    iconStrokeWidth: 1.25,
    showTooltip: false,
  },
  suggestions: {
    // Explicitly empty, not omitted: with no `items` the resolver falls back to
    // the legacy `suggestionChips` defaults and three filler chips appear.
    starters: { items: [] },
  },
  theme: {
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
        // No rule between transcript and composer: greeting and card float on
        // one cream field.
        divider: "transparent",
        primary: "#c96442",
        // The welcome icon holder reads `--persona-accent`: terracotta sparkle.
        accent: "#c96442",
      },
    },
    components: {
      panel: { borderRadius: "0" },
      // `introCard.title` scopes the serif to the greeting, off the composer.
      // The greeting is warm ink; `color` overrides the `primary` default.
      // 1.625rem holds the question to one line at the 460px stage width.
      introCard: {
        title: {
          fontFamily: CLAUDE_SERIF,
          fontSize: "1.625rem",
          fontWeight: "400",
          lineHeight: "2.125rem",
          color: "#3d3929",
        },
      },
      input: { background: "#ffffff", borderRadius: "1.5rem" },
      // Claude's card is the roomiest of the five: 16px type on 24px, and a
      // deep top inset so the caret sits well below the card edge. The card
      // floats on a diffuse warm shadow; the hairline border barely registers.
      composer: {
        shadow:
          "0 8px 24px rgba(61, 57, 41, 0.07), 0 1px 2px rgba(61, 57, 41, 0.05)",
        padding: "18px 16px 14px",
        gap: "14px",
        fontSize: "16px",
        lineHeight: "24px",
        controlSize: "34px",
        controlIconSize: "18px",
      },
      button: {
        primary: { background: "#c96442", foreground: "#ffffff", borderRadius: "10px" },
        // Warm ink on a cream hover, and the softly rounded rectangle Claude
        // uses for the Research pill rather than a stadium.
        ghost: {
          foreground: "#83827d",
          hoverBackground: "#f0eee6",
          borderRadius: "8px",
        },
      },
    },
  },
});

// ── 3. Gemini (2025) ────────────────────────────────────────────────────
// Vertical stack of tool-flavored prompts with the icons deleted in the 2025
// simplification. Rows are transparent until hover; blue accent, pill composer.
const gemini = (): AgentWidgetConfig => applyCurrentProductComposer("gemini", {
  ...base(),
  welcome: {
    variant: "hero",
    title: "Hello, there",
    subtitle: "",
  },
  copy: {
    inputPlaceholder: "Ask Gemini",
  },
  // Composer: a rounded bar carrying their signature pair of tool toggles,
  // Deep Research and Canvas, as labeled mode pills that chip and swap the
  // placeholder. The "+" menu holds the upload button and an inert drive row.
  // End cluster: model picker, mic, send.
  //
  // Gemini prints the model in the app header, not the composer, and config has
  // no header seam for it; `composer.models` in the end cluster is the closest
  // expression, and it is also the only one that rides the send as
  // `selectedModelId`. Their "+" leads the bar; the trigger is anchored at
  // order 900, so here it trails the two toggles.
  attachments: {
    enabled: true,
    buttonIconName: "paperclip",
    buttonTooltipText: "Upload files",
  },
  composer: {
    actionOverflow: { enabled: true, includeBuiltIns: ["attachments"] },
    models: [
      { id: "flash-2-5", label: "2.5 Flash" },
      { id: "pro-2-5", label: "2.5 Pro" },
    ],
    selectedModelId: "flash-2-5",
    modes: [
      {
        id: "deep-research",
        label: "Deep Research",
        shortLabel: "Deep Research",
        iconName: "search",
        presentation: "bar",
        placeholder: "Research any topic",
      },
      {
        id: "canvas",
        label: "Canvas",
        shortLabel: "Canvas",
        iconName: "file-text",
        presentation: "bar",
        placeholder: "Draft or build something in Canvas",
      },
    ],
    actions: [inertMenuAction("drive", "Add from Drive", "folder", 600)],
  },
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
    // Sparse arrow glyph: the 50% default box reads lost; 25px matches the ref.
    iconSize: "22px",
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
        controlSize: "36px",
        controlIconSize: "20px",
      },
      button: {
        primary: { background: "#0b57d0", foreground: "#ffffff", borderRadius: "9999px" },
        // Material's fully rounded tool chips: the active toggle picks up the
        // hover tint, which is what `aria-pressed` paints with.
        ghost: {
          foreground: "#444746",
          hoverBackground: "#dde3ea",
          borderRadius: "9999px",
        },
      },
      suggestion: {
        list: {
          // `itemGap` is the space BETWEEN rows (`gap` is icon-to-copy inside
          // one row). 4px gives Gemini's near-flush stack instead of the 8px
          // default.
          itemGap: "4px",
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
const copilot = (): AgentWidgetConfig => applyCurrentProductComposer("copilot", {
  ...base(),
  welcome: {
    variant: "hero",
    title: "How can I help you today?",
    subtitle: "I can work across your mail, meetings, and documents.",
  },
  copy: {
    inputPlaceholder: "Message Copilot",
  },
  // Composer: the signature control is the response-mode selector, which is one
  // single-select mode group rendered as three labeled bar toggles. Sticky
  // persistence is the point: the choice survives every send, the way theirs
  // survives a chat. Around it, the leading "+" is the attachment button (no
  // menu here, so it keeps the bar position their box uses) and the end cluster
  // is mic then send.
  //
  // Their selector opens as a dropdown with one option always chosen; config
  // authors no initial `activeModeIds`, so the group starts empty and the first
  // click is the user's.
  attachments: {
    enabled: true,
    buttonIconName: "plus",
    buttonTooltipText: "Add files",
  },
  composer: {
    modeGroups: [{ id: "response-mode", selection: "single" }],
    modes: [
      {
        id: "quick",
        groupId: "response-mode",
        label: "Quick response",
        shortLabel: "Quick",
        iconName: "zap",
        presentation: "bar",
        persistence: "sticky",
        placeholder: "Ask for a quick answer",
      },
      {
        id: "think-deeper",
        groupId: "response-mode",
        label: "Think deeper",
        shortLabel: "Think deeper",
        iconName: "lightbulb",
        presentation: "bar",
        persistence: "sticky",
        placeholder: "Ask something worth thinking about",
      },
      {
        id: "deep-research",
        groupId: "response-mode",
        label: "Deep research",
        shortLabel: "Research",
        iconName: "search",
        presentation: "bar",
        persistence: "sticky",
        placeholder: "Give it a topic to research",
      },
    ],
  },
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
    // Sparse arrow glyph: the 50% default box reads lost; 22px matches the ref.
    iconSize: "22px",
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
      // The greeting is neutral ink in M365; the title color otherwise
      // defaults to `semantic.colors.primary`, which is the Copilot blue.
      introCard: { title: { color: "#242424" } },
      input: { background: "#ffffff", borderRadius: "0.75rem" },
      // Roomier than the Persona default but tighter than Claude's card:
      // Copilot's box is a soft rectangle with 16px type on 24px.
      composer: {
        shadow: "0 1px 2px rgba(0, 0, 0, 0.06)",
        padding: "16px 16px 12px",
        gap: "12px",
        fontSize: "16px",
        lineHeight: "24px",
        // Three labeled toggles plus "+" plus mic plus send is a full bar, so
        // the controls run a size below the 40px default to keep it on one row.
        controlSize: "32px",
        controlIconSize: "18px",
      },
      button: {
        primary: { background: "#0f6cbd", foreground: "#ffffff", borderRadius: "9999px" },
        // Fluent's soft rectangles, and a blue-tinted active state: the pressed
        // toggle paints with the ghost hover token.
        ghost: {
          foreground: "#616161",
          hoverBackground: "#e8f1fa",
          borderRadius: "6px",
        },
      },
      suggestion: {
        card: {
          background: "#ffffff",
          foreground: "#242424",
          border: "#e1dfdd",
          borderRadius: "0.75rem",
          padding: "0.875rem",
          gap: "0.625rem",
          // Grid gutter between the four cards, matching M365's roomier 2x2.
          itemGap: "12px",
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
const perplexity = (): AgentWidgetConfig => applyCurrentProductComposer("perplexity", {
  ...base(),
  welcome: {
    variant: "hero",
    title: "Where knowledge begins",
    subtitle: "Ask anything and get an answer with sources.",
  },
  copy: {
    inputPlaceholder: "Ask anything...",
  },
  // Composer: the inverted hierarchy. The modes ARE the primary control, so the
  // exclusive Search / Research / Labs group leads the bar as labeled pills,
  // each swapping the placeholder, and everything else trails: the "+" menu
  // holding the folded attachment button, then the model picker and the teal
  // send in the end cluster.
  //
  // Modes lead only because the attachment button is folded: the built-in sits
  // at order 200, ahead of the mode range, so leaving it in the bar would put a
  // paperclip in front of the tabs. Their segmented control also always has one
  // segment lit; a mode group starts empty, and an active one adds a removable
  // chip above the input that their tabs have no equivalent for.
  attachments: {
    enabled: true,
    buttonIconName: "paperclip",
    buttonTooltipText: "Attach a file",
  },
  composer: {
    actionOverflow: { enabled: true, includeBuiltIns: ["attachments"] },
    modeGroups: [{ id: "search-mode", selection: "single" }],
    modes: [
      {
        id: "search",
        groupId: "search-mode",
        label: "Search",
        shortLabel: "Search",
        iconName: "search",
        presentation: "bar",
        persistence: "sticky",
        placeholder: "Ask anything...",
      },
      {
        id: "research",
        groupId: "search-mode",
        label: "Research",
        shortLabel: "Research",
        iconName: "globe",
        presentation: "bar",
        persistence: "sticky",
        placeholder: "Research a topic...",
      },
      {
        id: "labs",
        groupId: "search-mode",
        label: "Labs",
        shortLabel: "Labs",
        iconName: "sparkles",
        presentation: "bar",
        persistence: "sticky",
        placeholder: "Build something...",
      },
    ],
    // Generic tier labels, deliberately: the picker shape is the recreation,
    // and no other vendor's model names belong in it.
    models: [
      { id: "best", label: "Best" },
      { id: "sonar", label: "Sonar" },
      { id: "reasoning", label: "Reasoning" },
    ],
    selectedModelId: "best",
  },
  // Search-box submit: a teal circle with a right-pointing arrow.
  // No explicit size: send rides the 34px control-size token so the model
  // picker and submit share one rail height.
  sendButton: {
    useIcon: true,
    iconName: "arrow-right",
    // Sparse arrow glyph: the 50% default box reads lost; 22px matches the ref.
    iconSize: "22px",
    iconStrokeWidth: 1.25,
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
      // The headline is dark ink, not the teal accent the title color
      // otherwise inherits from `semantic.colors.primary`.
      introCard: { title: { color: "#13343b" } },
      input: { background: "#ffffff", borderRadius: "0.75rem" },
      // Search-field proportions: a tall box with 16px type on 24px and the
      // submit control dropped onto its own row below the query.
      composer: {
        shadow: "0 1px 2px rgba(19, 52, 59, 0.06)",
        padding: "16px 16px 12px",
        gap: "14px",
        fontSize: "16px",
        lineHeight: "24px",
        controlSize: "34px",
        controlIconSize: "18px",
      },
      button: {
        primary: { background: "#20808d", foreground: "#ffffff", borderRadius: "9999px" },
        // Teal-tinted active state on the mode pills: `aria-pressed` paints
        // with the ghost hover token, which is the only handle on it.
        ghost: {
          foreground: "#64645f",
          hoverBackground: "#e3efef",
          borderRadius: "8px",
        },
      },
      suggestion: {
        list: {
          // Perplexity's true look is a hairline-divided stack. `itemGap: 0`
          // cannot produce it: `border` is the whole row box, so touching rows
          // double their shared rule. Bordered rows at the 8px default stay.
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

/**
 * Per-panel utility row: reset the transcript (welcome visibility is derived,
 * so clearing brings the hero back) and a config view rendered through
 * Persona's own artifact pane: the JSON opens as a file-backed code artifact
 * that takes over the whole widget (the narrow-host drawer is forced on the
 * mounted config below), with the pane's built-in copy control. `file` meta
 * is what makes copy extract the raw JSON instead of the fenced markdown.
 * The JSON comes from a fresh `build()` so it shows the authored shape.
 */
const attachPanelControls = (
  article: HTMLElement,
  build: () => AgentWidgetConfig,
  controller: AgentWidgetController
): void => {
  // Demo plumbing, not part of the recreation: an integrator's embed already
  // carries its own dispatch target, and the echo `customFetch` (a function,
  // unserializable anyway) exists only to fake a backend on this page.
  const shareable = build();
  delete shareable.apiUrl;
  delete shareable.customFetch;
  const json = JSON.stringify(
    shareable,
    (_key, value) => (typeof value === "function" ? "[function]" : value),
    2
  );

  const makeAction = (label: string): HTMLButtonElement => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "recreation-action";
    button.textContent = label;
    return button;
  };

  const resetButton = makeAction("Reset chat");
  resetButton.addEventListener("click", () => controller.clearChat());

  const viewButton = makeAction("View config");
  const setConfigOpen = (open: boolean) => {
    viewButton.textContent = open ? "Hide config" : "View config";
  };
  // The label must track every close path, including the drawer's own X:
  // the drawer signals open purely through its classes, so observe them.
  let paneSynced = false;
  const ensurePaneSync = () => {
    if (paneSynced) return;
    const pane = article.querySelector<HTMLElement>(".persona-artifact-pane");
    if (!pane) return;
    paneSynced = true;
    new MutationObserver(() => {
      setConfigOpen(
        pane.classList.contains("persona-artifact-drawer-open") &&
          !pane.classList.contains("persona-hidden")
      );
    }).observe(pane, { attributes: true, attributeFilter: ["class"] });
  };
  viewButton.addEventListener("click", () => {
    if (viewButton.textContent === "Hide config") {
      controller.hideArtifacts();
      setConfigOpen(false);
      return;
    }
    // Idempotent: a stable id updates the record in place, and the explicit
    // showArtifacts() reopens the drawer after the user closed it.
    controller.upsertArtifact({
      id: "recreation-config",
      artifactType: "markdown",
      title: "persona.config.json",
      content: "```json\n" + json + "\n```",
      file: {
        path: "persona.config.json",
        mimeType: "application/json",
        language: "json",
      },
      transcript: false,
    });
    // Deferred: showArtifacts() force-opens the drawer only when the pane
    // already sees an artifact, and the upsert's state callback lands async.
    window.setTimeout(() => {
      controller.showArtifacts();
      ensurePaneSync();
    }, 0);
    setConfigOpen(true);
  });

  const actions = document.createElement("div");
  actions.className = "recreation-actions";
  actions.append(resetButton, viewButton);
  article.appendChild(actions);
};

RECREATIONS.forEach(({ id, build }) => {
  const mount = document.querySelector<HTMLElement>(`[data-recreation="${id}"]`);
  if (!mount) {
    console.warn(`[suggestion-recreations] No mount found for "${id}".`);
    return;
  }
  const config = build();
  // Demo-only augmentation, kept out of `build()` so the config export stays
  // the pure recreation: artifacts power the config viewer, and the huge
  // narrow-host threshold forces the in-panel drawer at any stage width so
  // the JSON takes over the widget instead of opening a cramped side split.
  const controller = createAgentExperience(mount, {
    ...config,
    features: {
      ...config.features,
      artifacts: {
        enabled: true,
        layout: {
          // Force the drawer at any stage width, and let it cover the whole
          // widget: the config viewer is a takeover, not a side split. The
          // toolbar copy control is the export's copy affordance (file meta
          // makes it copy the raw JSON, not the fenced markdown).
          narrowHostMaxWidth: 10000,
          drawerWidth: "100%",
          showCopyButton: true,
        },
      },
    },
  });
  controllers.push(controller);
  const article = mount.closest<HTMLElement>(".recreation");
  if (article) attachPanelControls(article, build, controller);
});

window.addEventListener("beforeunload", () => {
  controllers.forEach((controller) => controller.destroy());
});

// Handy for poking at any instance from the console.
Object.defineProperty(window, "suggestionRecreations", {
  configurable: true,
  get: () => controllers,
});
