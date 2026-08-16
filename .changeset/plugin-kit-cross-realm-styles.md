---
"@runtypelabs/persona": patch
---

Fix `injectStyles` / `getStyleRoot` for nodes mounted into another document, such as an iframe. The root was resolved with `instanceof Document` / `instanceof ShadowRoot`, which always fails across realms, so the deferred re-injection tried to append the style tag to the iframe's Document node and threw inside a microtask. Styles carried by lazy chunks (the Messages view) never reached iframe-hosted widgets. Roots now resolve by nodeType.
