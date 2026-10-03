---
"@runtypelabs/persona": patch
---

Delete, clear, and reset in the Messages view keep working when the CDN serves a fresh `index.global.js` with a cached `history-view.js` that predates its confirm dialog: a failed load or a chunk without `showHistoryConfirm` falls back to the native `confirm()` instead of failing silently.
