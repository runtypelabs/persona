---
"@runtypelabs/persona": patch
---

Fixed anchor-top viewport bounce and spacer sizing for short-content turns. The spacer derived content height from `scrollHeight`, which floors at the viewport height, so when the transcript was shorter than the viewport (a welcome plus one message) the spacer came up short by the empty space below the content: the anchor animation clamped before reaching its target, the sent message stopped short of `anchorTopOffset`, and — pinned exactly on the clamp boundary — every transient content dip during streaming (typing-indicator swaps) visibly bounced the viewport. Content height is now measured from the scroll container's children, the spacer reserves 24px of slack past the held position so transient dips are absorbed silently, and when the stream ends the spacer trims back to that requirement so no dead scrollable air or stray scroll-to-bottom arrow is left below the last message.
