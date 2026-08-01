---
"@runtypelabs/persona": minor
---

Add `launcher.teaser`: a proactive nudge bubble above the collapsed floating launcher, with `text`, `delayMs` (default 0), `frequency` (`"once"` default | `"always"`), `dismissible` (default true), and `dismissLabel`.

- Clicking the teaser opens the panel and consumes it exactly like an explicit dismissal; a launcher click consumes a teaser the user has already seen. Within one page load the teaser appears at most once under either frequency, and closing the panel never brings it back.
- `"once"` writes a dismissed flag to `localStorage` under `` `${persistState.keyPrefix ?? "persona-"}teaser-dismissed` ``; `"always"` tracks consumption in memory for the page load only. `persistState: false` downgrades `"once"` to in-memory too, and storage that throws (Safari private mode, partitioned iframes) falls back to the same in-memory path instead of breaking the launcher. Custom `storageAdapter` implementations do not participate in teaser state.
- The launcher now mounts inside a `createLauncherSurface` wrapper that owns the teaser as a sibling element, with the dismiss control as its own button. The wrapper is `display: contents` until a teaser is configured, so launchers without one render exactly as before. Both the critical `launcher.global.js` bundle and the full widget build the launcher through it, so the deferred and eager paths behave identically and the installer handoff clears any pending teaser timer.
- `controller.update({ launcher: { teaser } })` adds, retitles, or removes the teaser in place.
