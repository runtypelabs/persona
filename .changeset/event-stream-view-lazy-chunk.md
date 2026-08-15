---
"@runtypelabs/persona": patch
---

Move the event-stream observability panel into a lazy sibling chunk (`event-stream-view.js`), shrinking every core bundle by ~4.8 kB gzipped (CDN payload 193 kB to 188.2 kB). The panel loads on the first click of the event-stream toggle, exactly like the history view chunk; a failed chunk load resets the toggle and retries on the next click. ESM/CJS consumers reach it through the new `@runtypelabs/persona/event-stream-view` subpath automatically.
