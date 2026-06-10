---
"@runtypelabs/persona-proxy": patch
---

Ground the WebMCP slides flow for vague restyle requests ("make the title slide pop"): treat them as a small focused style pass (4-5 mutations, prefer update_element, at most one new decorative element, theme tokens only) ending in a summary, instead of an open-ended add_element spree that hits the runtime's per-turn tool-call cap and strands the user with "Stopped after calling a tool."
