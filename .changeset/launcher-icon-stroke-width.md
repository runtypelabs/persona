---
"@runtypelabs/persona": minor
---

Add a themable launcher icon stroke width via `theme.components.launcher.iconStrokeWidth`. The unitless string (for example `"1.75"`) is applied as a CSS stroke-width on both launcher glyphs, the agent icon and the call-to-action arrow, so one pill never carries two line weights and the value wins over the attribute the icons render with. The default weight changes from 2 to 1.5, matching the header's `controlStrokeWidth`, so launcher and header glyphs share one line weight out of the box: default launchers render slightly lighter after this release, and `iconStrokeWidth: "2"` restores the previous weight. The rule applies in both the critical launcher bundle and the full widget, so both surfaces render the stroke identically across a deferred install, and sites no longer need CSS overrides against internal selectors. The theme editor exposes it as a slider in the Launcher section.
