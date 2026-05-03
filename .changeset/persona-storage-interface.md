---
"@runtypelabs/persona": minor
---

Add `PersonaStorage` — a small async key-value abstraction inspired by [unstorage](https://github.com/unjs/unstorage) — and expose `createStorage`, `createMemoryDriver`, `createLocalStorageDriver`, `prefixStorage`, and `createStorageAdapter` from the public API. The new interface is the foundation for unifying the widget's existing storage paths (localStorage state, IndexedDB event stream) behind a single pluggable shape, and lets embedders supply custom drivers (HTTP, memory, etc.). The legacy `createLocalStorageAdapter` is unchanged and remains synchronous.
