---
"@runtypelabs/persona": minor
---

Add APIs and layout options for embedded assistants and conversation continuity in both V4 and V5.

- Add instance-aware host events, transcript/run notifications, composer-mode control, managed layout slots and component lifecycles, and cancellable link routing. Isolate renderers between widgets while retaining existing event payloads and element-only renderers.
- Add frameless inline embeds with shrinkable full-height layouts and scoped transcript, fade, and composer-footer surfaces. Keep inline width independent of full height, fill the host by default, and preserve explicit widths and theme boundaries during updates.
- Add `moveTo()` for relocating a live direct-layout widget between connected containers in the same document while preserving its conversation, composer, renderers, and streaming session.
- Preserve per-conversation drafts, attachments, and reading positions. Add a stop policy for switching during a run and isolate late upload, dictation, and submission callbacks from other conversations.
- Add opt-in durable background conversations through an explicit backend adapter, scoped execution status, and read-only catch-up from matching checkpoints. Preserve existing switch and reconnect defaults.
- Use a delayed centered spinner when opening conversations, with transcript fade-in and `loadingIndicator.conversationOpenVariant` to choose skeleton placeholders. Match skeletons to transcript spacing and bubble styles.
