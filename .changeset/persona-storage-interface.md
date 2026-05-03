---
"@runtypelabs/persona": minor
---

Add `PersonaStorage` — a small async key-value abstraction inspired by [unstorage](https://github.com/unjs/unstorage) — and expose `createStorage`, `createMemoryDriver`, `createLocalStorageDriver`, `createIndexedDBDriver`, `prefixStorage`, `withBroadcastChannel`, and `createStorageAdapter` from the public API. The widget config now accepts a `storage` option (a `PersonaStorage` instance) and an optional `storageKey`, so embedders can swap the persistence backend — and add cross-tab sync — without writing a custom adapter:

```ts
import {
  createAgentExperience,
  createStorage,
  createIndexedDBDriver,
  withBroadcastChannel
} from "@runtypelabs/persona";

createAgentExperience(mount, {
  apiUrl: "...",
  storage: withBroadcastChannel(
    createStorage({ driver: createIndexedDBDriver() })
  )
});
```

The new interface is the foundation for unifying the widget's existing storage paths (localStorage state, IndexedDB event stream) behind a single pluggable shape. The legacy `createLocalStorageAdapter` and `storageAdapter` config option are unchanged and remain the default.
