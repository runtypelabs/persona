---
"@runtypelabs/persona": minor
---

New `features.history.grouping` config: `"time"` (default, unchanged) buckets the Messages list under Today/Yesterday/Previous 7 days/month headings; `"none"` renders one flat list in server order, the recents-style sidebar. Starred conversations keep their pinned group in both modes. The flat group's heading labels its list from the accessibility tree only, since the visible list heading directly above already names it.
