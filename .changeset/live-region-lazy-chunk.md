---
"@runtypelabs/persona": patch
---

Create the context-mention live regions inside the lazy engine chunk instead of eagerly in the core bundle. Announcements cannot fire before the engine mounts, so behavior is unchanged; the live-region helper no longer ships in index.js. The orchestrator option pair announce/announceError is replaced by liveRegionHost (internal API).
