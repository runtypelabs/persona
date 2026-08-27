---
"@runtypelabs/persona": minor
---

Add `visibility` to composer actions: `"always"` (default), `"when-empty"`, or `"when-text"`. It reads the same draft state as `sendButton.visibility`, so a text draft, a pending attachment, or a live stream all count as "drafting". A hidden action is removed from the DOM, so it leaves layout and tab order rather than fading. This makes the voice-then-send swap in the composer bar pure config: give the voice action `visibility: "when-empty"` and the send button `visibility: "when-text"`, and the two controls trade places on the same state. `visibility` combines with the existing `visible` predicate, which still has the final say.

The CDN and ESM bundle budgets move up one 0.25 kB step (184.25 to 184.5 kB, 196.5 to 196.75 kB gzipped) to cover the added draft-state gate.
