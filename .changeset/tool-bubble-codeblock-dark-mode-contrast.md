---
"@runtypelabs/persona": patch
---

Improve tool-bubble readability in dark themes.

- The code blocks (Arguments / Activity / Result) were rendered with a hardcoded white background (`persona-bg-white`) paired with `persona-text-persona-primary` text, so the brand-tinted primary color — which is typically light in a dark theme — landed on a fixed white box (~2:1 contrast). The blocks now default to a matched, theme-aware token set (`--persona-container` background, `--persona-text` foreground, `--persona-border` border) that flips together with the active color scheme, restoring readable contrast in both light and dark modes. An explicit `toolCall.codeBlockBackgroundColor` / `codeBlockTextColor` / `codeBlockBorderColor` still takes precedence.
- The collapse/expand chevron defaulted to `currentColor`, which often rendered darker than the tool-call title. It now defaults to the title color (`var(--persona-primary)`, the same fallback the title uses), so the toggle stays as readable as the title unless `toolCall.toggleTextColor` / `headerTextColor` overrides it.
