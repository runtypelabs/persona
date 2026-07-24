---
"@runtypelabs/persona": patch
---

Fix parent-level artifact overflow in embedded and docked layouts. The injected host is a filling flex surface when the launcher is disabled or docked, but it kept its default `min-width: auto` (content-based) floor, so opening a wide artifact split could grow the host past a shrinkable mount and push content outside the viewport. The host and mount now carry a `min-width: 0` baseline wherever Persona fills its container; emerge dock mode still pins the host to its intentional fixed width. Floating launcher sizing is unchanged.
