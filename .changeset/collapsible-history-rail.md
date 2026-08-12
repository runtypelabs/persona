---
"@runtypelabs/persona": patch
---

Add a collapse toggle to the Messages rail. The rail header's leading control now shrinks the rail to a 52px icon column holding the expand toggle and an icon-only new conversation button, and expands it again; the conversation beside it keeps working throughout. The chosen state is remembered per visitor with the other persistState keys, and Escape or the header Messages button still closes the rail entirely.

New config: `features.history.rail.collapsible` (default true) and `features.history.rail.defaultCollapsed` (default false). New copy keys: `collapseLabel` and `expandLabel`.
