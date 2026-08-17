---
"@runtypelabs/persona": patch
---

Mark the selected conversation in the Messages list with a wash only, removing the left edge marker. The wash default moves from `--persona-container` (which collapses invisible on themes where container equals the surface, leaving the bare marker looking like a stray border) to the `--persona-divider` chain, which always reads against the surface. This matches how ChatGPT, Claude, and Gmail mark selected rows and aligns the panel with the rail, whose darker-wash override and marker suppression are no longer needed. `--persona-history-active-marker` is removed; `--persona-history-row-active-bg` still themes the wash.
