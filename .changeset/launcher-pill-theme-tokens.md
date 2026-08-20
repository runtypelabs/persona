---
"@runtypelabs/persona": minor
---

Wire the launcher pill to its launcher-specific theme tokens. `theme.components.launcher.background`, `.foreground`, and `.border` were accepted and compiled into `--persona-launcher-bg` / `--persona-launcher-fg` / `--persona-launcher-border` but nothing consumed them: the pill rendered from the shared `surface` / `primary` / `muted` / `border` tokens, so recoloring the launcher also recolored the panel. The pill now reads the launcher tokens, whose defaults are re-pointed at the same semantic tokens it previously rendered from, so the default look is unchanged. A custom `foreground` colors the title directly and the subtitle at 70% strength via the new `--persona-launcher-fg-muted` variable.
