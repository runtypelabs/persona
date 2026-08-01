---
"@runtypelabs/persona": patch
---

Scope legacy `suggestionChipsConfig` inline font and padding styles to the chip variant. They previously applied to card and list suggestions too, where the always-present defaults (12px/6px) silently overrode the variants' padding tokens.
