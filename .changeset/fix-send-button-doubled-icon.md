---
"@runtypelabs/persona": patch
---

Fix the composer send button rendering two stacked icons (e.g. a doubled send arrow) after the first send→stop→send cycle. `setMode` swapped the icon via `replaceChild(next, prev)` against a captured `prev` node reference; when an external re-render/morph (such as a host calling `controller.update()`) replaced the live icon child with a clone, that reference was detached and the `appendChild` fallback left both icons mounted. `setMode` now uses `replaceChildren(next)`, so the button always holds exactly one icon regardless of any intervening DOM morph.
