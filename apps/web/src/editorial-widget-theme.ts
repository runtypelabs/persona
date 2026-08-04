import type { AgentWidgetConfig } from "@runtypelabs/persona";

/**
 * The Persona widget theme that matches the editorial/terminal design used
 * across the site (home page rail, demo pages): paper surfaces, square corners,
 * ink text, teal accents, Geist body + JetBrains Mono type.
 *
 * Single source of truth so every embedded widget reads identically to the home
 * page rail. Raw color/length values are allowed anywhere a token reference is:
 * the resolver passes non-token strings through unchanged.
 */
export const editorialWidgetTheme: NonNullable<AgentWidgetConfig["theme"]> = {
  palette: {
    colors: {
      primary: {
        50: "#fef9f1",
        100: "#f2ede5",
        200: "#d4cfc4",
        300: "#a39e93",
        400: "#737067",
        500: "#1d1c17",
        600: "#000000",
        700: "#000000",
        800: "#000000",
        900: "#000000",
        950: "#000000",
      },
      gray: {
        50: "#fef9f1",
        100: "#f2ede5",
        200: "#ddd6c9",
        300: "#c4bdb0",
        400: "#8a857a",
        500: "#6f6b62",
        600: "#55524a",
        700: "#444239",
        800: "#2e2c26",
        900: "#1d1c17",
        950: "#11100d",
      },
    },
    radius: {
      sm: "0px",
      md: "0px",
      lg: "0px",
      xl: "0px",
      "2xl": "0px",
    },
    typography: {
      fontFamily: {
        sans: "'Geist', -apple-system, BlinkMacSystemFont, sans-serif",
        mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
      },
    },
  },
  semantic: {
    colors: {
      accent: "#006b5b",
      surface: "#fef9f1",
      background: "#fef9f1",
      // Paper, not tan: the transcript body reads this. The assistant bubble
      // keeps its tan via the component token below.
      container: "#fef9f1",
      text: "#1d1c17",
      textMuted: "#6f6b62",
      border: "rgba(29, 28, 23, 0.18)",
      divider: "rgba(29, 28, 23, 0.1)",
    },
  },
  components: {
    button: {
      primary: { background: "#26fedc", foreground: "#1d1c17" },
    },
    introCard: {
      background: "#fef9f1",
      borderRadius: "0px",
      shadow: "none",
      border: "1px solid rgba(0, 0, 0, 0.1)",
      // The page's `.editorial-h` voice (Syne 500, 0.04em) on the greeting
      // only; body copy and composer stay on Geist.
      title: {
        fontFamily: "'Syne', sans-serif",
        fontSize: "1.375rem",
        fontWeight: "500",
        lineHeight: "1.9rem",
        letterSpacing: "0.04em",
      },
    },
    header: {
      // Same headline voice on the panel title (floating/mobile launcher);
      // the subtitle stays Geist so the bar keeps one accent, not two.
      title: {
        fontFamily: "'Syne', sans-serif",
        fontWeight: "500",
        letterSpacing: "0.04em",
      },
    },
    message: {
      user: { background: "#fef9f1", text: "#1d1c17", borderRadius: "0px" },
      assistant: { background: "#f2ede5", text: "#1d1c17", borderRadius: "0px" },
    },
    input: { background: "#fef9f1" },
    panel: { border: "none", borderRadius: "0px", shadow: "none" },
    composer: { borderColor: "rgba(29, 28, 23, 0.25)" },
    // Teal thumb on every scroller; track stays transparent.
    scrollbar: { thumb: "#00dfc1" },
    markdown: {
      // Terminal code blocks: dark ground, warm text, no border of their own
      // (the page's code-copy wrapper draws the black frame). Corner radius
      // follows the zeroed palette radius automatically.
      codeBlock: {
        background: "#0c0c0a",
        textColor: "#d8d3c8",
        borderColor: "transparent",
      },
    },
  },
};
