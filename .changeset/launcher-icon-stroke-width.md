---
"@runtypelabs/persona": minor
---

Add a themable launcher icon stroke width via `theme.components.launcher.iconStrokeWidth`. The unitless string (for example `"1.75"`) is applied as a CSS stroke-width on both launcher glyphs, the agent icon and the call-to-action arrow, so one pill never carries two line weights, the value wins over the attribute the icons render with, and the shipped weight of 2 stays the default. The rule applies in both the critical launcher bundle and the full widget, so both surfaces render the stroke identically across a deferred install, and sites no longer need CSS overrides against internal selectors. The theme editor exposes it as a slider in the Launcher section.
