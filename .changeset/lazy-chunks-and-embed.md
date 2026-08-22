---
"@runtypelabs/persona": minor
---

Move the event-stream observability panel into a lazy sibling chunk (`event-stream-view.js`), keeping its roughly 13 kB gzipped off the core-bundle critical path (the CDN core payload for this release is about 191 kB gzipped). The panel loads on the first click of the event-stream toggle, same as the history view chunk. A failed chunk load resets the toggle and retries on the next click. ESM/CJS consumers import the new `@runtypelabs/persona/event-stream-view` subpath. Self-hosted deployments that copy `index.global.js` must also serve `event-stream-view.js` (and `history-view.js` when history is enabled) from the same directory.

Fix `injectStyles` / `getStyleRoot` for nodes mounted in another document, such as an iframe. `instanceof Document` / `instanceof ShadowRoot` fails across realms, so deferred re-injection tried to append a style tag to the iframe's Document node and threw. Lazy-chunk styles (the Messages view) never reached iframe-hosted widgets. Roots now resolve by `nodeType`.
