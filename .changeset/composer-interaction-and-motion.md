---
"@runtypelabs/persona": minor
---

Composer interaction history, streaming input behavior, and the motion system.

History and asynchronous interaction:

- `session.resubmitFrom(messageId, { replacement?, reason })` re-runs a user turn: it identifies the full turn boundary, cancels an active stream, truncates the active tail, and dispatches a fresh attempt with new ids. Retry replays every stored field (content parts, `llmContent`, raw content, mentions, inline segments, quote, composer options, voice flag) and persistence follows a single atomic emit.
- `messageActions.showRegenerate` renders on the final retryable assistant turn; `messageActions.showEdit` renders on text-only user messages and swaps the bubble for a morph-safe inline editor (Escape cancels, save resubmits from that turn). Both default false.
- `composer.streamingSubmitBehavior` (default `"block"`, unchanged) adds `"defer-one"`, which captures one immutable pending submission into a header card (edit and remove, auto-send on completion, held on Stop or error), and `"interrupt"`, which supersedes the running turn on the client-token transport via `submitMode` and a fresh `turnId` with stale-event suppression; other transports fall back to `"block"`.
- Draft persistence: the unsent draft (text, mention tokens, inline segments, model, modes, quote) rides the conversation storage payload, debounced, flushed on destroy and page hide, cleared on send and clear chat, governed by `persistState` and the new `persistState.persist.draft` flag. Mention tokens rehydrate only while their source still exists, otherwise the draft degrades to plain text.
- Quote and reply-to: `controller.setQuote()` and `clearQuote()` drive a dismissible banner; the sent message keeps the structured quote and the model sees a clearly delimited fenced block ahead of the user's text. `messageActions.showQuote` quotes from the transcript. Sends without a quote are byte-identical to before.

Motion:

- `theme.components.motion` tokens (`durationFast` 120ms, `durationBase` 200ms, `easing`) drive every composer transition and keyframe; `0ms` disables that motion, and everything is additionally gated behind `prefers-reduced-motion`.
- The mic publishes `data-state` (`idle`, `recording`, `processing`, `speaking`) with a default pulse ring while recording and a rotating glyph while processing. The send button keeps both glyphs mounted and crossfades by `data-mode`, making the doubled-glyph failure unreachable. Mode and mention chips animate in and out without replaying on rebuild, and mode toggles pick up a pressed tick.
- `--persona-voice-level` publishes live 0 to 1 voice amplitude on the mic wrapper and the footer while recording, quantized and skip-on-unchanged, feeding the default ring modulation and any theme-side waveform. The `runtype` provider derives it from its existing capture loop; Web Speech paths hold a fixed midpoint; a `custom` provider opts in via the new `VoiceProvider.onLevel`. The variable is data, not motion: it keeps updating under reduced motion while the ring's animation is gated. See THEME-CONFIG.md for the state hooks, the waveform example, and the footer-versus-transcript animation rule.
