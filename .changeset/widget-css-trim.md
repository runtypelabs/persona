---
"@runtypelabs/persona": patch
---

Trim widget.css: remove stranded utility rules with no remaining call sites (persona-shadow-md/lg/2xl, persona-bg-gray-200 and its hover variant, persona-border-gray-100, persona-border-persona-secondary, persona-border-t/b-persona-border, persona-pl-7, persona-pr-7, persona-items-end, persona-h-12, persona-w-12, and an artifact copy-label selector that matched no rendered node) and drop the persona-code-block-* copy-button rules, whose markup the widget never emits (they styled a showcase-only postprocessor and now live with the showcase). Brings the stylesheet back under its 15 kB gzip budget.
