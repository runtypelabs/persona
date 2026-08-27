import type {
  AgentWidgetConfig,
  ComposerAction,
} from "@runtypelabs/persona";

type ThemeConfig = NonNullable<AgentWidgetConfig["theme"]>;

export type ComposerRecreationProduct =
  | "chatgpt"
  | "claude"
  | "gemini"
  | "copilot"
  | "perplexity";

type ComposerPatch = Pick<
  AgentWidgetConfig,
  | "attachments"
  | "colorScheme"
  | "composer"
  | "copy"
  | "sendButton"
  | "voiceRecognition"
> & { theme: ThemeConfig };

const inertAction = (
  id: string,
  label: string,
  iconName: string,
  order: number,
  disabled = true
): ComposerAction => ({
  id,
  kind: "button",
  placement: "start",
  presentation: "overflow",
  order,
  label,
  iconName,
  disabled,
  tooltipText: `${label} is visual only in this recreation.`,
  onSelect: () => {},
});

const patches: Record<ComposerRecreationProduct, ComposerPatch> = {
  chatgpt: {
    colorScheme: "dark",
    copy: { inputPlaceholder: "Ask ChatGPT" },
    attachments: {
      enabled: true,
      buttonIconName: "image",
      buttonTooltipText: "Add photos & files",
    },
    composer: {
      layout: "single-row",
      actionOverflow: { enabled: true, includeBuiltIns: ["attachments"] },
      models: [
        { id: "light", label: "Light" },
        { id: "standard", label: "Standard" },
        { id: "high", label: "High" },
      ],
      selectedModelId: "high",
      modes: [
        {
          id: "create-image",
          label: "Create image",
          iconName: "image-plus",
          presentation: "overflow",
          placeholder: "Describe an image",
        },
        {
          id: "web-search",
          label: "Web search",
          iconName: "globe",
          presentation: "overflow",
          placeholder: "Search the web",
        },
        {
          id: "deep-research",
          label: "Deep research",
          iconName: "search",
          presentation: "overflow",
          placeholder: "What should I research?",
        },
      ],
      actions: [
        inertAction("library", "Add from library", "folder", 250),
        inertAction("canva", "Canva", "sparkles", 600),
        inertAction("github", "GitHub", "code-xml", 610),
        inertAction("gmail", "Gmail", "mail", 620),
        {
          // Inert, not disabled: the disabled fade is a fixed 50% with no
          // token, and the real circle is full-strength blue. `when-empty` is
          // the exact inverse of the send button's `when-text`.
          id: "voice-mode",
          kind: "button",
          placement: "end",
          presentation: "bar",
          order: 850,
          label: "Voice mode",
          iconName: "activity",
          iconColor: "#ffffff",
          backgroundColor: "#3d68ff",
          visibility: "when-empty",
          tooltipText: "Voice mode is visual only in this recreation.",
          onSelect: () => {},
        },
      ],
    },
    voiceRecognition: {
      enabled: true,
      backgroundColor: "transparent",
      borderWidth: "0",
      iconColor: "#ececec",
      showTooltip: false,
    },
    sendButton: {
      useIcon: true,
      iconName: "arrow-up",
      size: "36px",
      iconSize: "20px",
      showTooltip: false,
      visibility: "when-text",
    },
    theme: {
      semantic: {
        colors: {
          background: "#000000",
          container: "#000000",
          surface: "#000000",
          text: "#ececec",
          textMuted: "#8e8e8e",
          border: "transparent",
          divider: "transparent",
          primary: "#ffffff",
        },
      },
      components: {
        panel: { borderRadius: "0" },
        introCard: {
          background: "transparent",
          shadow: "none",
          title: { fontSize: "24px", fontWeight: "400", lineHeight: "28px", color: "#ffffff" },
        },
        input: { background: "#212121", borderRadius: "28px" },
        composer: {
          shadow: "rgba(255, 255, 255, 0.2) 0 0 1px inset",
          padding: "8px",
          gap: "8px",
          fontSize: "16px",
          lineHeight: "24px",
          controlSize: "36px",
          controlIconSize: "18px",
          // The "High" pill on its lighter fill; the hover value is that fill
          // lifted by the same 6% white the ghost hover uses, so the resting
          // pill never darkens under the pointer.
          modelPicker: {
            background: "#303030",
            hoverBackground: "#3b3b3b",
            borderRadius: "9999px",
          },
          // `--persona-surface` stays #000 for the footer band and hero, so
          // the menu panel carries its own elevated gray.
          overflowMenu: {
            background: "#353535",
            borderColor: "rgba(255, 255, 255, 0.08)",
          },
        },
        button: {
          primary: { background: "#3b62d9", foreground: "#ffffff", borderRadius: "9999px" },
          ghost: {
            foreground: "#ececec",
            hoverBackground: "rgba(255, 255, 255, 0.06)",
            borderRadius: "9999px",
          },
        },
        suggestion: {
          chip: {
            background: "transparent",
            foreground: "#ececec",
            border: "#3a3a3a",
            borderRadius: "9999px",
            hoverBackground: "#212121",
            hoverBorder: "#555555",
          },
        },
      },
    },
  },
  claude: {
    colorScheme: "light",
    copy: { inputPlaceholder: "Type / for skills" },
    attachments: {
      enabled: true,
      buttonIconName: "paperclip",
      buttonTooltipText: "Upload a file",
    },
    composer: {
      actionOverflow: { enabled: true, includeBuiltIns: ["attachments"], order: 0 },
      models: [
        { id: "opus-5", label: "Opus 5", description: "Powerful model for complex challenges" },
        { id: "sonnet-5", label: "Sonnet 5", description: "Smart, efficient model for everyday use" },
      ],
      selectedModelId: "opus-5",
      modelPicker: { presentation: "popover", suffix: "High" },
      modeGroups: [
        {
          id: "conversation-mode",
          selection: "single",
          presentation: "segmented",
          label: "Conversation mode",
        },
      ],
      defaultActiveModeIds: ["chat"],
      modes: [
        {
          id: "chat",
          groupId: "conversation-mode",
          label: "Chat",
          shortLabel: "Chat",
          presentation: "bar",
          persistence: "sticky",
        },
        {
          id: "cowork",
          groupId: "conversation-mode",
          label: "Cowork",
          shortLabel: "Cowork",
          presentation: "bar",
          persistence: "sticky",
          placeholder: "Describe a bigger task to work on together",
        },
      ],
      actions: [
        inertAction("connectors", "Connect apps", "link", 600),
        inertAction("drive", "Add from Google Drive", "folder", 610),
        {
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
    voiceRecognition: {
      enabled: true,
      backgroundColor: "transparent",
      borderWidth: "0",
      iconColor: "#87867f",
      showTooltip: false,
    },
    sendButton: {
      useIcon: true,
      iconName: "arrow-up",
      iconSize: "18px",
      iconStrokeWidth: 1.5,
      showTooltip: false,
      visibility: "when-text",
    },
    theme: {
      semantic: {
        colors: {
          background: "#fcfcfb",
          container: "#fcfcfb",
          surface: "#fcfcfb",
          text: "#20201f",
          textMuted: "#87867f",
          border: "#e8e6df",
          divider: "transparent",
          primary: "#83827d",
          accent: "#c15f3c",
        },
      },
      components: {
        panel: { borderRadius: "0" },
        introCard: {
          title: {
            fontFamily: 'Georgia, "Iowan Old Style", "Palatino Linotype", "Times New Roman", serif',
            fontSize: "2rem",
            fontWeight: "330",
            lineHeight: "2.5rem",
            color: "#20201f",
          },
        },
        input: { background: "rgba(255, 255, 255, 0.8)", borderRadius: "20px", backdropFilter: "blur(8px)" },
        composer: {
          shadow: "0 4px 20px rgba(0, 0, 0, 0.035), 0 0 0 0.5px rgba(32, 32, 31, 0.15)",
          padding: "14px",
          gap: "12px",
          fontSize: "15px",
          lineHeight: "20px",
          controlSize: "32px",
          controlIconSize: "18px",
          segmented: {
            trackBackground: "#f0efea",
            activeBackground: "#ffffff",
            activeForeground: "#20201f",
            inactiveForeground: "#73726c",
          },
        },
        button: {
          primary: { background: "#c15f3c", foreground: "#ffffff", borderRadius: "9999px" },
          ghost: { foreground: "#73726c", hoverBackground: "#f0efea", borderRadius: "8px" },
        },
      },
    },
  },
  gemini: {
    colorScheme: "dark",
    copy: { inputPlaceholder: "Ask Gemini" },
    attachments: {
      enabled: true,
      buttonIconName: "upload",
      buttonTooltipText: "Upload files",
    },
    composer: {
      layout: "single-row",
      actionOverflow: { enabled: true, includeBuiltIns: ["attachments"] },
      models: [
        { id: "pro", label: "Pro", description: "Reasoning, maths and code" },
        { id: "fast", label: "Fast", description: "Answers quickly" },
      ],
      selectedModelId: "pro",
      modelPicker: { presentation: "popover" },
      actions: [
        inertAction("drive", "Add from Drive", "folder", 300, false),
        inertAction("create-image", "Create image", "image", 400),
        inertAction("create-video", "Create video", "film", 410),
        inertAction("create-music", "Create music", "headphones", 420),
      ],
    },
    voiceRecognition: {
      enabled: true,
      backgroundColor: "transparent",
      borderWidth: "0",
      iconColor: "#e3e3e3",
      showTooltip: false,
    },
    sendButton: {
      useIcon: true,
      iconName: "arrow-up",
      size: "40px",
      iconSize: "20px",
      showTooltip: false,
      visibility: "when-text",
    },
    theme: {
      semantic: {
        colors: {
          background: "#0f0f0f",
          container: "#0f0f0f",
          surface: "#1e1f20",
          text: "#e3e3e3",
          textMuted: "#9aa0a6",
          border: "transparent",
          divider: "transparent",
          primary: "#0b57d0",
          accent: "#0b57d0",
        },
      },
      components: {
        panel: { borderRadius: "0" },
        introCard: {
          background: "transparent",
          shadow: "none",
          border: "none",
          title: {
            fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
            fontSize: "32px",
            fontWeight: "320",
            lineHeight: "40px",
            color: "#e3e3e3",
          },
        },
        input: { background: "#1e1f20", borderRadius: "32px" },
        composer: {
          shadow: "0 2px 8px -2px rgba(0, 0, 0, 0.16)",
          padding: "12px 16px",
          gap: "8px",
          fontSize: "17px",
          lineHeight: "24px",
          controlSize: "40px",
          controlIconSize: "22px",
          // One token paints the closed "Pro ⌄" and the row labels, so both
          // land a step below the #e3e3e3 icon glyphs, as the product reads.
          modelPicker: {
            menuBackground: "#1e1f20",
            labelColor: "#c4c7c5",
            descriptionColor: "#9aa0a6",
            rowHoverBackground: "rgba(255, 255, 255, 0.08)",
          },
        },
        button: {
          primary: { background: "#0b57d0", foreground: "#ffffff", borderRadius: "9999px" },
          ghost: {
            foreground: "#e3e3e3",
            hoverBackground: "rgba(255, 255, 255, 0.08)",
            borderRadius: "9999px",
          },
          stop: { background: "#e3e3e3", foreground: "#1f1f1f" },
        },
        suggestion: {
          list: {
            background: "transparent",
            foreground: "#e3e3e3",
            border: "transparent",
            hoverBackground: "#282a2c",
            hoverBorder: "transparent",
          },
        },
      },
    },
  },
  copilot: {
    colorScheme: "dark",
    copy: { inputPlaceholder: "Message Copilot" },
    attachments: {
      enabled: true,
      buttonIconName: "plus",
      buttonTooltipText: "Add files and more",
    },
    composer: {
      models: [
        { id: "smart", label: "Smart", icon: "sparkles", description: "Picks the right response style" },
        { id: "think-deeper", label: "Think deeper", icon: "lightbulb", description: "Takes longer on hard problems" },
        { id: "study-and-learn", label: "Study and learn", icon: "bookmark", description: "Works through topics with you" },
        { id: "search", label: "Search", icon: "search", description: "Looks things up on the web" },
      ],
      selectedModelId: "smart",
      modelPicker: { presentation: "popover" },
    },
    voiceRecognition: {
      enabled: true,
      iconName: "activity",
      backgroundColor: "transparent",
      borderWidth: "0",
      iconColor: "#8791b0",
      showTooltip: false,
    },
    sendButton: {
      useIcon: true,
      iconName: "arrow-up",
      size: "36px",
      iconSize: "20px",
      showTooltip: false,
    },
    theme: {
      semantic: {
        colors: {
          background: "#0e111b",
          container: "#0e111b",
          surface: "#0e111b",
          text: "#e5ebfa",
          textMuted: "#8791b0",
          border: "rgba(255, 255, 255, 0.08)",
          divider: "transparent",
          primary: "#dbe4fd",
          accent: "#dbe4fd",
        },
      },
      components: {
        panel: { borderRadius: "0", border: "none" },
        introCard: {
          title: { fontSize: "1.75rem", lineHeight: "2rem", fontWeight: "600", color: "#e5ebfa" },
        },
        input: { background: "rgba(25, 31, 50, 0.75)", borderRadius: "26px" },
        composer: {
          shadow: "0 12px 36px rgba(3, 6, 16, 0.5)",
          padding: "16px 16px 12px",
          gap: "14px",
          fontSize: "16px",
          lineHeight: "22px",
          controlSize: "36px",
          controlIconSize: "18px",
          modelPicker: {
            menuBackground: "#1c2338",
            labelColor: "#e5ebfa",
            descriptionColor: "#8791b0",
            rowHoverBackground: "rgba(255, 255, 255, 0.06)",
          },
        },
        button: {
          primary: { background: "#dbe4fd", foreground: "#0e111b", borderRadius: "9999px" },
          ghost: {
            background: "rgba(255, 255, 255, 0.05)",
            foreground: "#aeb8d6",
            hoverBackground: "rgba(255, 255, 255, 0.1)",
            borderRadius: "9999px",
          },
        },
        suggestion: {
          card: {
            background: "rgba(25, 31, 50, 0.75)",
            foreground: "#e5ebfa",
            border: "rgba(255, 255, 255, 0.08)",
            hoverBackground: "#242b40",
            hoverBorder: "rgba(255, 255, 255, 0.14)",
          },
        },
      },
    },
  },
  perplexity: {
    colorScheme: "dark",
    copy: { inputPlaceholder: "Ask anything..." },
    attachments: {
      enabled: true,
      buttonIconName: "paperclip",
      buttonTooltipText: "Attach files",
    },
    composer: {
      actionOverflow: { enabled: true, includeBuiltIns: ["attachments"], order: 0 },
      // Chips off: an active mode's removable chip has no product equivalent.
      modeGroups: [{ id: "surface", selection: "single", chipVisibility: "hidden" }],
      defaultActiveModeIds: ["search"],
      modes: [
        {
          id: "search",
          groupId: "surface",
          label: "Search",
          shortLabel: "Search",
          iconName: "search",
          presentation: "bar",
          persistence: "sticky",
          placeholder: "Ask anything...",
        },
        {
          id: "computer",
          groupId: "surface",
          label: "Computer",
          shortLabel: "Computer",
          iconName: "monitor",
          presentation: "bar",
          persistence: "sticky",
          placeholder: "Assign a task...",
        },
      ],
      models: [
        { id: "best", label: "Best", description: "Adapts to each query" },
        { id: "sonar", label: "Sonar", description: "Perplexity's fast model" },
        { id: "reasoning", label: "Reasoning", description: "Multi-step problem solving" },
      ],
      selectedModelId: "best",
      modelPicker: { presentation: "popover" },
      actions: [inertAction("connect-sources", "Connect sources", "link", 600)],
    },
    voiceRecognition: {
      enabled: true,
      backgroundColor: "transparent",
      borderWidth: "0",
      iconColor: "#8f8d89",
      showTooltip: false,
    },
    sendButton: {
      useIcon: true,
      iconName: "arrow-right",
      size: "36px",
      iconSize: "18px",
      iconStrokeWidth: 1.5,
      showTooltip: false,
    },
    theme: {
      semantic: {
        colors: {
          background: "#171615",
          container: "#171615",
          surface: "#171615",
          text: "#d6d5d4",
          textMuted: "#8f8d89",
          border: "rgba(214, 213, 212, 0.07)",
          divider: "transparent",
          primary: "#8f8d89",
          accent: "#20808d",
        },
      },
      components: {
        panel: { borderRadius: "0" },
        introCard: {
          background: "transparent",
          shadow: "none",
          border: "none",
          title: {
            fontSize: "32px",
            lineHeight: "40px",
            fontWeight: "350",
            letterSpacing: "-0.01em",
            color: "#d6d5d4",
          },
        },
        input: { background: "#1e1d1c", borderRadius: "16px" },
        composer: {
          shadow: "none",
          padding: "14px 12px 10px",
          gap: "12px",
          fontSize: "16px",
          lineHeight: "24px",
          controlSize: "32px",
          controlIconSize: "16px",
          modelPicker: {
            menuBackground: "#262524",
            labelColor: "#d6d5d2",
            descriptionColor: "#8f8d89",
            rowHoverBackground: "rgba(255, 255, 255, 0.06)",
          },
        },
        button: {
          primary: { background: "#20808d", foreground: "#ffffff", borderRadius: "9999px" },
          ghost: { foreground: "#8f8d89", hoverBackground: "#2a2928", borderRadius: "9999px" },
        },
        suggestion: {
          list: {
            background: "transparent",
            foreground: "#d6d5d4",
            border: "rgba(214, 213, 212, 0.10)",
            hoverBackground: "#1e1d1c",
            hoverBorder: "rgba(214, 213, 212, 0.18)",
          },
        },
      },
    },
  },
};

const mergeTheme = (base: ThemeConfig | undefined, patch: ThemeConfig): ThemeConfig => ({
  ...base,
  ...patch,
  semantic: {
    ...base?.semantic,
    ...patch.semantic,
    colors: { ...base?.semantic?.colors, ...patch.semantic?.colors },
  },
  components: { ...base?.components, ...patch.components },
});

/** Apply the composer treatment measured in the standalone current-product page. */
export function applyCurrentProductComposer(
  product: ComposerRecreationProduct,
  config: AgentWidgetConfig
): AgentWidgetConfig {
  const patch = patches[product];
  return {
    ...config,
    colorScheme: patch.colorScheme,
    copy: { ...config.copy, ...patch.copy },
    attachments: patch.attachments,
    composer: patch.composer,
    voiceRecognition: patch.voiceRecognition,
    sendButton: patch.sendButton,
    theme: mergeTheme(config.theme, patch.theme),
  };
}
