---
"@runtypelabs/persona": patch
---

Wire the `theme.components.introCard.background` token to the welcome card. The token (`--persona-intro-card-bg`) was already computed from config but never applied to the element, which hardcoded the `--persona-surface` utility — so `introCard.background` was silently ignored. The card now reads `--persona-intro-card-bg` (falling back to `--persona-surface` when unset), matching how `introCard.shadow` already works and keeping existing pages visually unchanged.
