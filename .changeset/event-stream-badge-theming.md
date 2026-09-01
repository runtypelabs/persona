---
"@runtypelabs/persona": minor
---

Event stream badge chips now resolve through the theme token tree and follow the active color scheme. New `components.eventStream.badge.*` tokens hold a background/foreground pair per event family (flow, step, reasoning, tool, agent, error, default), emitted as `--persona-event-badge-<family>-{bg,fg}`; the built-in dark layer flips every family from a light 100-tone fill to a 900-tone fill with light text, so dark-scheme embeds no longer render near-invisible light chips. The default palette gains canonical `purple` and `teal` scales backing the tool and agent families. Also fixed: `reasoning_*` events now match the reasoning family (the old `reason_` prefix never matched and fell through to gray), `execution_error` routes to the error family, and the chip border (foreground at ~31% alpha) now composes via `color-mix()` for non-hex colors instead of emitting an invalid declaration that was silently dropped. Light-scheme chip colors are unchanged.
