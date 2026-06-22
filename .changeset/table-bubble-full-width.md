---
"@runtypelabs/persona": patch
---

Markdown tables now span the full chat column. A table-bearing assistant bubble grows to fill the row (`:has(table)`) instead of shrink-wrapping to its content, which fixes the table visibly collapsing to a narrow width when the streaming column-width lock is released.
