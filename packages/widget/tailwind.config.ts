import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.ts"],
  prefix: "tvw-",
  important: "#persona-root",
  theme: {
    extend: {
      colors: {
        "cw-primary": "var(--cw-primary, #111827)",
        "cw-secondary": "var(--cw-secondary, #4b5563)",
        "cw-surface": "var(--cw-surface, #ffffff)",
        "cw-muted": "var(--cw-muted, #9ca3af)",
        "cw-accent": "var(--cw-accent, #2563eb)"
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
