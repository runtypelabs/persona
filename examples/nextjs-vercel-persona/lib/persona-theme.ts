import { createTheme } from "@runtypelabs/persona";

export const personaDemoTheme = createTheme({
  palette: {
    colors: {
      primary: {
        50: "#f8fafc",
        100: "#f1f5f9",
        200: "#e2e8f0",
        300: "#cbd5e1",
        400: "#94a3b8",
        500: "#64748b",
        600: "#475569",
        700: "#334155",
        800: "#1e293b",
        900: "#0f172a",
        950: "#020617"
      },
      accent: {
        50: "#f0f9ff",
        100: "#e0f2fe",
        200: "#bae6fd",
        300: "#7dd3fc",
        400: "#38bdf8",
        500: "#0ea5e9",
        600: "#0284c7",
        700: "#0369a1",
        800: "#075985",
        900: "#0c4a6e",
        950: "#082f49"
      },
      gray: {
        50: "#f8fafc",
        100: "#f1f5f9",
        200: "#e2e8f0",
        300: "#cbd5e1",
        400: "#94a3b8",
        500: "#64748b",
        600: "#475569",
        700: "#334155",
        800: "#1e293b",
        900: "#0f172a",
        950: "#020617"
      },
      info: {
        50: "#f0f9ff",
        100: "#e0f2fe",
        200: "#bae6fd",
        300: "#7dd3fc",
        400: "#38bdf8",
        500: "#0ea5e9",
        600: "#0284c7",
        700: "#0369a1",
        800: "#075985",
        900: "#0c4a6e",
        950: "#082f49"
      }
    },
    typography: {
      fontFamily: {
        sans: "var(--font-manrope), sans-serif",
        serif: "Georgia, serif",
        mono: "var(--font-ibm-plex-mono), monospace"
      }
    },
    radius: {
      lg: "1rem",
      xl: "1.5rem",
      full: "9999px"
    }
  },
  semantic: {
    colors: {
      primary: "palette.colors.primary.950",
      secondary: "palette.colors.gray.700",
      accent: "palette.colors.accent.500",
      surface: "#ffffff",
      background: "#f6f8fc",
      container: "palette.colors.gray.100",
      text: "palette.colors.gray.900",
      textMuted: "palette.colors.gray.500",
      textInverse: "#ffffff",
      border: "palette.colors.gray.200",
      divider: "palette.colors.gray.200",
      interactive: {
        default: "palette.colors.accent.500",
        hover: "palette.colors.accent.600",
        focus: "palette.colors.accent.600",
        active: "palette.colors.accent.700",
        disabled: "palette.colors.gray.300"
      },
      feedback: {
        success: "palette.colors.success.500",
        warning: "palette.colors.warning.500",
        error: "palette.colors.error.500",
        info: "palette.colors.accent.500"
      }
    }
  },
  components: {
    panel: {
      borderRadius: "0",
      shadow: "none"
    },
    header: {
      background: "palette.colors.primary.950",
      border: "palette.colors.primary.900",
      borderRadius: "0",
      iconBackground: "palette.colors.primary.900",
      iconForeground: "palette.colors.accent.300",
      titleForeground: "#ffffff",
      subtitleForeground: "palette.colors.gray.300",
      actionIconForeground: "palette.colors.gray.200",
      shadow: "none",
      borderBottom: "1px solid rgba(255, 255, 255, 0.08)"
    },
    input: {
      background: "#ffffff",
      placeholder: "palette.colors.gray.400",
      borderRadius: "palette.radius.xl",
      focus: {
        border: "palette.colors.accent.500",
        ring: "palette.colors.accent.200"
      }
    },
    button: {
      primary: {
        background: "palette.colors.accent.500",
        foreground: "#ffffff",
        borderRadius: "palette.radius.full"
      },
      secondary: {
        background: "#ffffff",
        foreground: "palette.colors.gray.900",
        borderRadius: "palette.radius.full",
        border: "palette.colors.gray.200"
      },
      ghost: {
        background: "transparent",
        foreground: "palette.colors.gray.500",
        borderRadius: "palette.radius.full"
      }
    },
    message: {
      user: {
        background: "palette.colors.primary.950",
        text: "#ffffff",
        borderRadius: "palette.radius.xl",
        shadow: "none"
      },
      assistant: {
        background: "#ffffff",
        text: "palette.colors.gray.900",
        borderRadius: "palette.radius.xl",
        border: "palette.colors.gray.200",
        shadow: "none"
      }
    },
    markdown: {
      prose: {
        fontFamily: "var(--font-manrope), sans-serif"
      },
      inlineCode: {
        background: "palette.colors.gray.100",
        foreground: "palette.colors.gray.900"
      },
      link: {
        foreground: "palette.colors.accent.600"
      }
    },
    approval: {
      requested: {
        background: "palette.colors.warning.50",
        border: "palette.colors.warning.200",
        text: "palette.colors.gray.900"
      },
      approve: {
        background: "palette.colors.success.500",
        foreground: "#ffffff"
      },
      deny: {
        background: "#ffffff",
        foreground: "palette.colors.error.600",
        border: "palette.colors.error.200"
      }
    },
    toolBubble: {
      shadow: "none"
    },
    reasoningBubble: {
      shadow: "none"
    },
    composer: {
      shadow: "0 18px 40px -34px rgba(6, 11, 24, 0.2)"
    }
  }
});
