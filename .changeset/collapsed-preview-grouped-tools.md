---
"@runtypelabs/persona": minor
---

Add opt-in collapsed preview, active min-height, configurable summary modes, and grouped sequential rendering for tool call and reasoning bubbles. Collapsed active rows now contribute real height to the transcript scroller, fixing auto-follow when multiple tool/reasoning steps stream in sequence. New SDK hooks (`renderCollapsedSummary`, `renderCollapsedPreview`, `renderGroupedSummary`) and config surfaces (`features.toolCallDisplay`, `features.reasoningDisplay`, `config.reasoning`) let consumers customize collapsed and grouped UX without replacing full bubble renderers. Theme editor gains controls and an interactive preview transcript builder for testing tool/reasoning scenarios. Tool message fingerprints now include chunk count and args length so streaming tool updates invalidate the render cache correctly.
