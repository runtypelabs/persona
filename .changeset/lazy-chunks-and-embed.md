---
"@runtypelabs/persona": patch
---

Move the event-stream observability panel into a lazy sibling chunk (`event-stream-view.js`). Core bundles drop about 4.8 kB gzipped (CDN payload 193 kB to 188.2 kB). The panel loads on the first click of the event-stream toggle, same as the history view chunk. A failed chunk load resets the toggle and retries on the next click. ESM/CJS consumers import `@runtypelabs/persona/event-stream-view`.

Fix `injectStyles` / `getStyleRoot` for nodes mounted in another document, such as an iframe. `instanceof Document` / `instanceof ShadowRoot` fails across realms, so deferred re-injection tried to append a style tag to the iframe's Document node and threw. Lazy-chunk styles (the Messages view) never reached iframe-hosted widgets. Roots now resolve by `nodeType`.
