---
"@runtypelabs/persona": minor
---

`components.header.foreground` now works and anchors the header text ladders. When `border`, `titleForeground`, `subtitleForeground`, and `actionIconForeground` are unset, the widget derives them from the header's background/foreground pair with `color-mix`: text at a 72% foreground mix, the hairline border at 14%. Explicit keys still win at every rung, so a host that recolors only `background` and `foreground` gets a coherent band instead of stranded defaults. The default header looks the same apart from its hairline border, which now derives from the pair. `HeaderTokens` widens `border`, `titleForeground`, `subtitleForeground`, and `actionIconForeground` from required to optional, a non-breaking change for theme authors. The theme editor gains a header foreground field, and its header role now writes `foreground` alongside its explicit per-key shades.
