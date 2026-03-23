---
"@runtypelabs/persona": patch
---

Fix DOMPurify hook to fully remove dangerous data: URI attributes instead of leaving empty `src`/`href`, and add a dev-mode warning when a custom `postprocessMessage` is used with the default sanitizer.
