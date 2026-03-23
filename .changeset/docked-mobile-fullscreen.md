---
"@runtypelabs/persona": minor
---

Docked mode: on viewports at or below `launcher.mobileBreakpoint` (default 640), when `launcher.mobileFullscreen` is not `false` and the panel is open, the dock slot switches to `position: fixed` with `inset: 0` and `z-index: 9999` so the assistant paints above host page chrome. Same opt-out as floating mode via `mobileFullscreen: false`. Host layout re-evaluates on window `resize`.
