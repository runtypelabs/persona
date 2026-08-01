---
"@runtypelabs/persona": patch
---

Suggestions DX: the follow-ups config conflict warning now fires outside debug mode, once per distinct conflict per page load so a live `controller.update()` cannot spam it. Debug builds hint when a completed turn never produced a `suggest_replies` call and when `overflow` is set on a non-chip variant, and the `expose` doc comment now describes the real double-declaration behavior. The never-called hint stays quiet on restored transcripts with no dispatch yet and when the host drives the surface with `setFollowUpSuggestions`.
