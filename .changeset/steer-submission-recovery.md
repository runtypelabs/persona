---
"@runtypelabs/persona": patch
---

Preserve drafts, attachments, mentions, and one-shot composer state until local admission succeeds, including when asynchronous preparation races with a full live-steer queue. Reject duplicate programmatic submissions while preparation is pending. Regenerating or editing a steered turn preserves the transcript even after the host changes transport or disables steer mode.
