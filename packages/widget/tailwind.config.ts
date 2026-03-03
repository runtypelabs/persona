import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.ts"],
  prefix: "persona-",
  important: "#persona-root",
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
      },
      boxShadow: {
        floating: "0 30px 60px -15px rgba(15, 23, 42, 0.35)"
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
