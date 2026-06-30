---
"@runtypelabs/persona": patch
---

Fix the live tool-duration counter flickering between `<0.1s` and `0.1s` while a tool stays active. The `{duration}` span is updated by a 100ms global timer, but idiomorph was re-stamping it with the render-time value on every transcript re-render (when `loadingAnimation` is `"none"`, the tool title isn't preserved across morphs), so the two writers fought around the sub-0.1s boundary. The morph now leaves a still-live `[data-tool-elapsed]` span to the timer and only re-morphs it once the tool completes (or its slot is reused).
