// Windows 98 dress code for the Persona panel, so it reads as a sibling
// window to jspaint: silver chrome, navy title-bar gradient, square corners,
// beveled borders, no shadows anywhere, and the classic tooltip yellow for
// approvals. Shared by the proxy-backed demo (main.ts) and the on-device
// LiteRT variant (../litert-paint/main.ts).
export const WIN98 = {
  silver: "#c0c0c0",
  silverLight: "#dfdfdf",
  shadowGray: "#808080",
  navy: "#000080",
  tooltipYellow: "#ffffe1",
  text: "#000000",
  bevelOut: "2px outset #dfdfdf",
  bevelIn: "2px inset #dfdfdf",
  // The classic Win95/98 bevels as inset box-shadows (the 98.css recipe), for
  // components that expose a shadow token but no border token.
  raised:
    "inset -1px -1px #0a0a0a, inset 1px 1px #ffffff, inset -2px -2px #808080, inset 2px 2px #dfdfdf",
  sunken:
    "inset -1px -1px #ffffff, inset 1px 1px #0a0a0a, inset -2px -2px #dfdfdf, inset 2px 2px #808080",
};

export const paintTheme = {
  palette: {
    radius: {
      sm: "0",
      md: "0",
      lg: "0",
      xl: "0",
      "2xl": "0",
      full: "0",
    },
    typography: {
      fontFamily: {
        sans: 'Tahoma, "MS Sans Serif", "Segoe UI", sans-serif',
      },
    },
  },
  semantic: {
    colors: {
      primary: WIN98.navy,
      accent: WIN98.navy,
      surface: WIN98.silver,
      background: WIN98.silver,
      container: WIN98.silver,
      text: WIN98.text,
      textMuted: "#3f3f3f",
      textInverse: "#ffffff",
      border: WIN98.shadowGray,
      divider: WIN98.shadowGray,
      interactive: {
        default: WIN98.navy,
        hover: "#1084d0",
        focus: WIN98.navy,
        active: WIN98.navy,
      },
    },
  },
  components: {
    panel: {
      borderRadius: "0",
      border: WIN98.bevelOut,
      shadow: "none",
    },
    header: {
      borderRadius: "0",
      // Solid navy: the header background token is color-typed, so the
      // title-bar gradient the page chrome uses doesn't apply here.
      background: WIN98.navy,
      titleForeground: "#ffffff",
      subtitleForeground: "#cfe2ff",
      iconBackground: WIN98.silver,
      iconForeground: WIN98.navy,
      borderBottom: `2px solid ${WIN98.shadowGray}`,
    },
    message: {
      // Flat navy = a selected list item; the assistant bubble is a sunken
      // white field, like a read-only edit box.
      user: {
        background: WIN98.navy,
        text: "#ffffff",
        borderRadius: "0",
        shadow: "none",
      },
      assistant: {
        background: "#ffffff",
        text: WIN98.text,
        border: WIN98.shadowGray,
        borderRadius: "0",
        shadow: WIN98.sunken,
      },
    },
    button: {
      primary: {
        background: WIN98.navy,
        foreground: "#ffffff",
        borderRadius: "0",
      },
      secondary: {
        background: WIN98.silver,
        foreground: WIN98.text,
        borderRadius: "0",
      },
    },
    input: {
      background: "#ffffff",
      placeholder: WIN98.shadowGray,
      focus: {
        border: WIN98.navy,
        ring: WIN98.navy,
      },
    },
    introCard: {
      background: WIN98.silver,
      borderRadius: "0",
      shadow: WIN98.raised,
    },
    approval: {
      requested: {
        background: WIN98.tooltipYellow,
        border: WIN98.text,
        text: WIN98.text,
        shadow: "none",
      },
      approve: {
        background: WIN98.navy,
        foreground: "#ffffff",
        border: WIN98.navy,
        borderRadius: "0",
      },
      deny: {
        background: WIN98.silver,
        foreground: WIN98.text,
        border: WIN98.shadowGray,
        borderRadius: "0",
      },
    },
    toolBubble: { shadow: WIN98.raised },
    reasoningBubble: { shadow: WIN98.raised },
    composer: { shadow: WIN98.sunken },
    scrollToBottom: {
      background: WIN98.silver,
      foreground: WIN98.text,
      border: WIN98.bevelOut,
      borderRadius: "0",
      shadow: "none",
    },
  },
};
