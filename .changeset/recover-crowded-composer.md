---
"@runtypelabs/persona": patch
---

Fix crowded composer action rows staying stacked while the send button is visible. Rows now return to one line when their content shrinks or the container widens, preserving the existing 16px hysteresis.
