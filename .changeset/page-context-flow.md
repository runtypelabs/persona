---
"@runtypelabs/persona-proxy": minor
---

Add `PAGE_CONTEXT_FLOW`, a page-aware shopping flow that injects live page content via
`{{pageContext}}`. It returns a small JSON envelope: a markdown `text` field for chat
replies, plus an optional `add_to_cart` action carrying a product handle so the assistant
can drive the host. Used by the smart-dom-reader example to demonstrate shadow-DOM-aware
page context reaching the model — and the assistant adding shadow-DOM products to the cart.
