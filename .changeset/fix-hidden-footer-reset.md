---
"@runtypelabs/persona": patch
---

Keep the footer hidden when `layout.showFooter` is `false`. The mount-layout pass reset the footer's inline styles (and the sidebar pass replaced them), and a composer rebuild swapped in a fresh footer, each of which brought back the composer that read-only transcripts had hidden.
