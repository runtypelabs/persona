---
"@runtypelabs/persona": minor
---

Add display preferences for tool calls, reasoning, and artifacts. The new `preferences` config key takes a JSON-safe `WidgetPreferenceSlice` of per-instance overrides, applied over `features` through a runtime allowlist (security and capability keys cannot pass), live-updatable via `controller.update({ preferences })`, and cleared back to the base features with an explicit-undefined patch. `parseWidgetPreferenceSlice`, `applyFeaturePreferences`, and `resolveConfigPreferences` are exported for hosts that persist or precompute preference slices themselves.

Artifact display modes are renamed to say where the body renders: `collapsed` (formerly `card`, which stays accepted as a deprecated alias that parsing and resolution canonicalize), `panel`, and `inline`. Display rules use one merge rule everywhere (a string replaces the subtree it names, an object refines it per key), nest MIME selectors under `files.byMediaType` with `image/*`-style wildcards, and honor a producer-supplied `presentation.preferredMode` hint that beats defaults but loses to explicit rules.

Resolution is explainable down to the matched selector, live display changes re-materialize existing card and inline artifact blocks without a remount, and the theme editor exports capability-aware preference sections with reset metadata.
