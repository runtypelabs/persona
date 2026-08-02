---
"@runtypelabs/persona": minor
---

Add the `renderWelcome` plugin hook and a re-entrant composer hook.

`renderWelcome(ctx)` owns the welcome surface: first plugin returning an element
wins, `null` falls through to the default (same contract as `renderSuggestion`).
The core owns the welcome host and swaps content inside it. The ctx carries the
alias-resolved `config`, `variant`, derived `visible`, `defaultRenderer()`,
`sendMessage()`, `requestRender()`, `renderStarter()` (wired through the full
suggestion select pipeline), a synchronous `storage` facade, and `onCleanup()`.
Derived visibility governs the default renderer only: a plugin element renders
regardless and overlays the transcript via `data-persona-welcome-overlay`, so a
home screen can return over an existing conversation.

`renderComposer` gains `requestRender()` (re-runs composer arbitration and swaps
the footer in place, re-binding listeners, attachments, mentions, voice, and the
composer suggestion row) plus the same `storage` facade, available from its
first invocation. `ctx.storage` is `localStorage` keyed
`${persistState.keyPrefix ?? "persona-"}plugin:<plugin.id>:<key>`, downgrading
to an in-memory map under `persistState: false` or blocked storage.

Also adds `AttachmentManager.remountPreviews()` so pending attachments survive a
composer rebuild.

Plugin-rendered composers now own their copy: the core no longer stamps `copy.inputPlaceholder` / `copy.sendButtonLabel` onto composer content a plugin returned, so gates can keep their lock reason in the placeholder. Default and composed composers are unchanged.

Fixed a theme wipe on composer rebuild: `rebuildComposer()` (composer `requestRender()`) and the composer-bar expand/collapse toggle called the panel sizing pass directly, which resets the mount inline styles and silently dropped every theme variable (white header, borderless suggestion cards) until the next full re-render. Both now run the full chrome sync that re-applies theme, artifact, and column variables.

Fixed floating-panel height loss on composer rebuild: the panel sizing pass also wipes the panel's inline styles, and the fixed pixel height (owned by the resize recalc) was never restored, so a composer rebuild in floating launcher mode let the panel grow to fit its content, past the configured height until close/reopen. The chrome sync now re-stamps the floating height.
