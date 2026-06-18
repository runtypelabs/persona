---
"@runtypelabs/persona": minor
---

Stabilize markdown tables during streaming (Telegram-style space reservation). While a message streams, tables-in-progress now render as a real `<table>` from the first row with a stable column count instead of flipping from a paragraph and reflowing on every chunk: the delimiter row is completed as soon as it starts arriving, the trailing partial row is padded to the header's column count, and `table-layout: fixed` locks column widths so rows append vertically without horizontal jiggle. Columns relax to natural content-fit widths once streaming completes. The final, non-streaming render is unchanged.
