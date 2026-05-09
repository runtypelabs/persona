---
"@runtypelabs/persona": minor
---

Make `persistState: false` an explicit kill-switch for chat-history persistence. Previously, setting `persistState: false` only suppressed UI state (open/closed, voice mode, focus) — message history was still written to the default `localStorage["persona-state"]` adapter. Now `persistState: false` also short-circuits the storage adapter: the default localStorage adapter is never created, and any user-supplied `storageAdapter` is ignored. This is the strict semantic — passing `persistState: false` means "no chat history is read or written, period." Pass `persistState: true` (or omit it) to keep the prior behavior of persisting messages via the configured `storageAdapter` (or the built-in localStorage adapter).

Why this matters: multiple widgets on the same origin (e.g. several demos served from `localhost:5173`) used to share a single `localStorage` key by default, so injecting a tool call or message in one demo would leak into the next. Setting `persistState: false` now prevents that leakage; for cases that *want* persistence, pass an explicit `storageAdapter: createLocalStorageAdapter("my-unique-key")`.
