---
"@runtypelabs/persona": patch
---

Fix the scroll-to-bottom affordance flickering during streaming in anchor-top mode: visibility now measures distance to the real content bottom instead of the scroll container bottom, so the anchor spacer's empty air below the latest message no longer surfaces a jump arrow while the whole reply is still in view.
