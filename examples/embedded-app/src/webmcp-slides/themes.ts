import type { Theme } from "./types";

// Element color/font props may hold theme tokens ('theme.accent',
// 'theme.heading') instead of literals. Tokens resolve at render time, so
// `apply_theme` restyles every token-colored element across the deck: the
// system prompt tells the model to prefer tokens for exactly this reason.

export const THEMES: Theme[] = [
  {
    id: "paper",
    name: "Paper",
    fonts: {
      heading: "'Avenir Next', 'Segoe UI', system-ui, sans-serif",
      body: "'Avenir Next', 'Segoe UI', system-ui, sans-serif",
    },
    colors: {
      background: "#fafaf7",
      surface: "#ffffff",
      text: "#1f2933",
      accent: "#c2410c",
      accentText: "#ffffff",
    },
  },
  {
    id: "midnight",
    name: "Midnight",
    fonts: {
      heading: "'Avenir Next', 'Segoe UI', system-ui, sans-serif",
      body: "Georgia, 'Times New Roman', serif",
    },
    colors: {
      background: "#0f172a",
      surface: "#1e293b",
      text: "#e2e8f0",
      accent: "#38bdf8",
      accentText: "#0f172a",
    },
  },
  {
    id: "terracotta",
    name: "Terracotta",
    fonts: {
      heading: "Georgia, 'Times New Roman', serif",
      body: "'Segoe UI', system-ui, sans-serif",
    },
    colors: {
      background: "#fdf6f0",
      surface: "#ffffff",
      text: "#43302b",
      accent: "#9a3412",
      accentText: "#fff7ed",
    },
  },
  {
    id: "mint",
    name: "Mint",
    fonts: {
      heading: "'Trebuchet MS', 'Segoe UI', system-ui, sans-serif",
      body: "'Segoe UI', system-ui, sans-serif",
    },
    colors: {
      background: "#f0fdf4",
      surface: "#ffffff",
      text: "#14532d",
      accent: "#059669",
      accentText: "#ffffff",
    },
  },
];

export const getTheme = (themeId: string): Theme =>
  THEMES.find((t) => t.id === themeId) ?? THEMES[0];

const COLOR_TOKENS = new Set([
  "background",
  "surface",
  "text",
  "accent",
  "accentText",
]);

/** Resolve 'theme.accent' → the active theme's accent; pass literals through. */
export const resolveColor = (
  value: string | undefined,
  theme: Theme,
): string | undefined => {
  if (!value) return value;
  if (!value.startsWith("theme.")) return value;
  const key = value.slice("theme.".length);
  if (COLOR_TOKENS.has(key)) {
    return theme.colors[key as keyof Theme["colors"]];
  }
  return undefined;
};

/** Resolve 'theme.heading' / 'theme.body' → font stack; pass literals through. */
export const resolveFont = (
  value: string | undefined,
  theme: Theme,
): string | undefined => {
  if (!value) return value;
  if (value === "theme.heading") return theme.fonts.heading;
  if (value === "theme.body") return theme.fonts.body;
  return value;
};
