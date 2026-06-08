---
"@runtypelabs/persona": minor
---

Unify box-shadow theming across the launcher, approval bubble, and tool-call bubble so every `config.*.shadow` override works the same way: set it globally via the component's theme token (`components.launcher.shadow`, `components.approval.requested.shadow`, `components.toolBubble.shadow`) or the matching CSS variable (`--persona-launcher-shadow`, `--persona-approval-shadow`, `--persona-tool-bubble-shadow`), or per-widget via `config.launcher.shadow` / `config.approval.shadow` / `config.toolCall.shadow` (pass `"none"` to remove the shadow). New: the approval bubble's shadow is now themeable, and `config.toolCall.shadow` is applied directly to the bubble (it previously rewrote the root CSS variable).
