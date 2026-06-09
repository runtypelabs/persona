---
"@runtypelabs/persona": minor
---

Make tool approval bubbles user-friendly by default. The agent-facing tool description and raw parameters JSON are now collapsed behind a "Show details" toggle, and the bubble leads with a humanized summary line ("The assistant wants to use “Add to cart”."). New `approval` config options: `detailsDisplay` (`"collapsed"` | `"expanded"` | `"hidden"`), `formatDescription` for custom summary copy, and `showDetailsLabel`/`hideDetailsLabel`.
