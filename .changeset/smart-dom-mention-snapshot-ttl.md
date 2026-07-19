---
"@runtypelabs/persona": patch
---

Cache the smart-DOM mention source's page snapshot with a short TTL so the synchronous Shadow-DOM-piercing scan no longer re-runs on every empty query (each `@` open and backspace-to-empty), removing a per-keystroke main-thread stall on content-heavy pages.
