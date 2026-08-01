---
"@runtypelabs/persona": patch
---

Suppress the launcher teaser when the panel is opened by restored `persistState` open state or by an `onStateLoaded` hook returning `open: true`. Both paths open the panel one task after the teaser's own timer, so the bubble could flash for a frame and, under the default `frequency: "once"`, consume the persisted dismissed flag for a teaser the visitor never saw. Automatic opens now also consume the teaser in memory only, so no non-user open can ever write the flag.
