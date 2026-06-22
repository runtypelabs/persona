---
"@runtypelabs/persona": patch
---

Simplify and fix the event stream toolbar so it no longer overflows in narrow panels. The total event count now lives in the "All events (N)" filter option (matching the per-type options) instead of a separate count badge, and the redundant "Events" and "Throughput" labels are removed (the tok/s value is self-describing and the throughput's accessible name is preserved via aria-label). At very narrow widths the "Copy All" button collapses to icon-only as a last resort.
