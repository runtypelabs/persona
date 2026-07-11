---
"@runtypelabs/persona": minor
---

Add artifact display modes (`features.artifacts.display`): choose `"panel"` (card in transcript + pane auto-opens; the previous default behavior), `"card"` (card only, pane opens on click), or `"inline"` (the artifact preview renders directly in the transcript via the new `PersonaArtifactInline` built-in component, no pane involvement), globally or per artifact type via `{ default, byType }`. A `renderInline` hook mirrors `renderCard` for custom inline blocks, and the pane's body rendering is now shared through `renderArtifactPreviewBody()`.

Behavior change: `session.upsertArtifact()` now also injects the matching transcript block (card or inline) so the programmatic path matches the streamed UX. Pass `transcript: false` to keep the pre-existing registry/pane-only behavior.
