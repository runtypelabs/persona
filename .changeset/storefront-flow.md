---
"@runtypelabs/persona-proxy": minor
---

Add `STOREFRONT_ASSISTANT_FLOW` for product-discovery demos. The flow emits three JSON actions:

- `{"action": "show_products", "text": "...", "products": [{"id", "title", "price", "image", "description"}]}` — the host page renders these as a product card grid alongside the chat.
- `{"action": "add_to_cart", "text": "...", "item": {"id", "title", "price"}}` — the host adds the item to its cart.
- `{"action": "message", "text": "..."}` — plain conversational reply that stays in the chat panel.

Wired into `examples/persistent-composer.html` as the "Everspun" storefront demo, where asking the agent for products dynamically populates a host-page product grid below the existing hero.
