---
"@runtypelabs/persona": minor
---

Anchor-top now parks the transcript on the **first unread attention-worthy block** of a response rather than holding the sent user message for the whole turn.

Tool calls and reasoning are treated as progress chrome and are never anchor targets, so a response that opens with a run of tool calls scrolls that chrome past and lands the reader on the answer. Prose, artifacts, component blocks, multi-modal parts, and approval requests all count as output — artifacts and components carry their payload in `rawContent` with empty text, and approval requests block the turn on the reader, so none of them may sit off-screen.

The positioning is a guess made on behalf of a reader who isn't watching the stream, so it stands down as soon as one is: a wheel tick, touch drag, pointer press, transcript keyboard navigation, focus of an interactive element, or active text selection freezes the anchor for the rest of the turn. Sending re-arms it. (Anchor-top previously tracked no reader intent at all, since its scroll handling short-circuits before the follow-state machine.)

Intent is deliberately read from input events rather than scroll deltas: a transcript growing under a pinned anchor makes the browser clamp scrollTop and then restore it, which is indistinguishable from a deliberate scroll if only the scroll event is examined.

This is a behavior change to the default scroll mode, with no configuration flag: `scrollBehavior.mode` (`"anchor-top"` / `"follow"` / `"none"`) and `anchorTopOffset` are unchanged.
