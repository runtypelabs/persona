---
"@runtypelabs/persona": patch
---

Hero and dismissing-card welcomes no longer jolt the transcript at the start of a streamed reply in anchor-top scroll mode. Two fixes: the anchor ease now re-derives its target from the bubble's live position each frame instead of chasing a snapshot taken before the welcome's starter row hid, which had carried the sent message up past the offset and under the header; and when the dismiss fade finishes and the welcome's layout (plus the roomier empty-state body gap) collapses in a single frame, the widget re-pins the anchored message against the new layout instead of letting the browser clamp the scroll position. The pinned message now rises once, settles at the anchor offset, and never moves again.
