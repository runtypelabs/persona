---
"@runtypelabs/persona": minor
---

Composer keyboard UX improvements:

- **Enter no longer stops a streaming response.** Pressing Enter while a response streams is now inert (it never aborts generation). Use the visible Stop button or press Escape to stop.
- **Escape stops streaming.** While a response streams, pressing Escape within the widget aborts it (scoped to the widget; the composer-bar Escape-to-collapse behavior still applies when not streaming).
- **Up/Down arrows navigate message history.** In the composer, Up recalls previously sent user messages for quick re-entry or editing and Down walks back toward the in-progress draft (shell / Slack style). History is only entered when the caret is at the start of the input, preserving normal multi-line cursor movement. Disable via `features.composerHistory: false`.
