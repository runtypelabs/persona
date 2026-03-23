---
"@runtypelabs/persona": minor
---

Replace shared `#persona-root` id selector with `[data-persona-root]` attribute selector to support multiple widget instances on the same page. The fixed id caused duplicate-id violations and style/selector collisions when mounting more than one widget. All CSS selectors, Tailwind scoping, and DOM traversal now use the attribute-based root marker. Each widget instance gets its own independent root without id conflicts.
