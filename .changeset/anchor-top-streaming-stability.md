---
"@runtypelabs/persona": patch
---

Anchor-top streaming stability: the sent user message now pins at the top and stays put, with no jolts, bounces, or stray affordances while the reply streams beneath it.

- The sent message stays pinned as the header of the streaming response, matching ChatGPT, Claude, and Gemini. The handoff to the turn's first unread block still fires, but only when that block would actually start below the fold (a long user message or a tall tool prelude) instead of on every turn, which was sliding the user's message off the top as soon as a text reply began.
- Fixed viewport bounce and spacer sizing for short-content turns. The spacer derived content height from `scrollHeight`, which floors at the viewport height, so short transcripts left the spacer undersized: the anchor animation clamped early, and, pinned exactly on the clamp boundary, every transient content dip during streaming (typing-indicator swaps) visibly bounced the viewport. Content height is now measured from the scroll container's children, the spacer reserves 24px of slack past the held position, and stream end trims the spacer back so no dead scrollable air or stray scroll-to-bottom arrow is left below the last message.
- The scroll-to-bottom affordance no longer flickers during streaming: visibility measures distance to the real content bottom instead of the scroll container bottom, so the spacer's empty air can't surface a jump arrow while the whole reply is in view.
- The anchor ease re-derives its target from the bubble's live position each frame instead of chasing a stale snapshot, and a welcome surface collapsing mid-turn (the hero's dismiss fade removing its layout in one frame) re-pins the anchored message against the new layout instead of letting the browser clamp the scroll position. The pinned message rises once, settles at the anchor offset, and never moves again.
