---
"@runtypelabs/persona": patch
---

Make the opening conversation row's pending state visible. Row selection blocks on the transcript fetch, and the awaiting row previously carried only an invisible aria-busy state: it now dims, shows a progress cursor, and swaps its timestamp for a small spinner until the conversation opens. Reduced motion keeps the static ring and the dim.
