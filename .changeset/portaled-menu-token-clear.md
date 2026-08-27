---
"@runtypelabs/persona": patch
---

Fix stale inline menu tokens on the portaled model picker and overflow menu panels. Both panels are reused across opens, so a `components.composer.modelPicker.*` or `components.composer.overflowMenu.*` value forwarded onto one survived a theme update that unset it. An unset token now clears the panel's inline value, so the stylesheet fallback paints again. The two components now share one forwarding helper. The CJS bundle budget moves 197.5 to 197.75 kB; the bundle sat 8 B over after the recent composer waves.
