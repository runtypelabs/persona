---
"@runtypelabs/persona": patch
---

Fix reasoning ("thinking") text freezing mid-stream once the accordion is opened. On the sequenced streaming path the client collapses `reasoning.chunks` to a single accumulated string, so `chunks.length` stays 1 and the content-blind reasoning fingerprint never changed — leaving the render cache stuck on a stale bubble. The fingerprint now also hashes the last reasoning chunk's length and trailing 32 characters (mirroring the tool-call treatment), so the cache invalidates on every reasoning delta and the bubble streams live.
