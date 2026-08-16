---
"@runtypelabs/persona": minor
---

Add a `components.history.motion` token group configuring the Messages surface's enter/exit animation: `enterDurationMs` (default 180), `enterEasing`, `exitDurationMs` (default 160), and `exitEasing`, emitted as `--persona-history-enter-ms`/`-easing` and `--persona-history-exit-ms`/`-easing`. Durations are bare millisecond numbers and 0 disables that leg; the CSS entrance, its fallback cleanup timer, and the WAAPI exit all read the same variables, and `prefers-reduced-motion` still wins over everything.
