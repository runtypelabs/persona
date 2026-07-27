---
"@runtypelabs/persona": minor
---

Add headless, host-persisted display preferences for tool calls, reasoning, and artifacts, plus a `createFeaturePreferenceStore` facade that owns the parse → patch → merge → apply loop. Artifact display modes are renamed to say where the body renders: `collapsed` (formerly `card`, which stays accepted as a deprecated alias that parsing and resolution canonicalize), `panel`, and `inline`. 

Display rules use one merge rule everywhere (a string replaces the subtree it names, an object refines it per key), nest MIME selectors under `files.byMediaType` with `image/*`-style wildcards, and honor a producer-supplied `presentation.preferredMode` hint that beats defaults but loses to explicit rules.

Preferences are parsed through a runtime allowlist (JSON Merge Patch semantics with `null` resets), resolution is explainable down to the matched selector and supplying layer, live widget updates re-materialize existing card and inline artifact blocks, and the theme editor exports capability-aware preference sections with reset metadata.
