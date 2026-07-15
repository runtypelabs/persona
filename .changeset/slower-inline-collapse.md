---
"@runtypelabs/persona": patch
---

Fix the inline artifact collapse-to-card animation never playing, and rework it into a staged handoff. Previously the artifact_complete props embed re-rendered the block's message, which rebuilt the bubble and replaced the streaming block with an already-complete card render, so the collapse was always instant.

The message renderer now grafts the live registry-driven block into the rebuilt bubble, the animation runs on the Web Animations API so it survives the DOM churn around stream completion (CSS transitions cancel on any element move), and a buffering updater owns the block until the animation settles so mid-collapse registry emissions cannot cut the card fade.

The collapse itself is a staged handoff: the streamed body fades out in place (180ms), then the block height collapses (distance-scaled 300-500ms on the M3 standard curve) while the card fades in. Timings are tunable via the COLLAPSE_* constants; degrades to an instant swap under prefers-reduced-motion.
