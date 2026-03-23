import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.ts"],
  prefix: "persona-",
  important: "[data-persona-root]",
  theme: {
    extend: {
      colors: {
        "persona-primary": "var(--persona-primary, #111827)",
        "persona-secondary": "var(--persona-secondary, #4b5563)",
        "persona-surface": "var(--persona-surface, #ffffff)",
        "persona-muted": "var(--persona-muted, #9ca3af)",
        "persona-accent": "var(--persona-accent, #2563eb)",
        "persona-container": "var(--persona-container, #f3f4f6)",
        "persona-border": "var(--persona-border, #e5e7eb)",
        "persona-divider": "var(--persona-divider, #e5e7eb)",
        "persona-message-border": "var(--persona-semantic-colors-border, #e5e7eb)",
        "persona-input-background": "var(--persona-semantic-colors-surface, #ffffff)",
        "persona-voice-recording-indicator": "var(--persona-voice-recording-indicator, #ef4444)",
        "persona-voice-recording-bg": "var(--persona-voice-recording-bg, #fef2f2)",
        "persona-voice-processing-icon": "var(--persona-voice-processing-icon, #3b82f6)",
        "persona-voice-speaking-icon": "var(--persona-voice-speaking-icon, #22c55e)",
        "persona-approval-bg": "var(--persona-approval-bg, #fefce8)",
        "persona-approval-border": "var(--persona-approval-border, #fef08a)",
        "persona-approval-text": "var(--persona-approval-text, #111827)",
        "persona-approval-approve-bg": "var(--persona-approval-approve-bg, #22c55e)",
        "persona-approval-deny-bg": "var(--persona-approval-deny-bg, #ef4444)",
        "persona-attachment-image-bg": "var(--persona-attachment-image-bg, #f3f4f6)",
        "persona-attachment-image-border": "var(--persona-attachment-image-border, #e5e7eb)",
        "persona-palette-colors-black-alpha-50": "rgba(0, 0, 0, 0.05)",
        "persona-palette-colors-black-alpha-60": "rgba(0, 0, 0, 0.6)",
      },
      boxShadow: {
        floating: "0 30px 60px -15px rgba(15, 23, 42, 0.35)",
        "persona-shadow": "var(--persona-palette-shadows-lg, 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1))",
      },
      spacing: {
        18: "4.5rem"
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.5rem"
      }
    }
  },
  corePlugins: {
    preflight: false
  },
  plugins: []
};

export default config;
