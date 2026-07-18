---
"@runtypelabs/persona": patch
---

Fix context mention chip row staying hidden after the first mention is added. Visibility was computed before the mention was tracked, so the first chip only appeared once a second mention made the row visible.
