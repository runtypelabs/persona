---
"@runtypelabs/persona": minor
---

Redesign the default tool-approval bubble as a neutral surface card

The built-in approval UI is now a neutral "permission card" — a tool icon, a
"The assistant wants to use **tool**" title, the agent-facing description and
call arguments collapsed behind a "show more" disclosure, and a primary action
anchored to the brand `--persona-primary` token. On resolve, approved approvals disappear (the tool
call takes over the transcript) and denied/timed-out ones collapse to a subtle
one-line trace.

New `config.approval.enableAlwaysAllow` (default `false`): when enabled, the
primary becomes a split **Always allow / Allow once** control with a dropdown and
keyboard shortcuts (Enter / Cmd-Ctrl+Enter / Esc), forwarding `{ remember: true }`
to your `onDecision` handler. Keep it off unless your backend persists the
don't-ask-again policy.

**Visual change for un-configured widgets:** the default look shifts from the
yellow "Approval Required / Approve / Deny" bubble to the neutral card (primary
button from green to the brand primary). All `config.approval.*` overrides still
function and the `--persona-approval-*` CSS variables are honored fallback-first,
so themed widgets are unaffected. To restore the old look, set
`config.approval.backgroundColor`/`borderColor` (or the
`components.approval.requested.*` tokens) back to the warning palette. Note:
`config.approval.title` no longer renders in the default card — use
`formatDescription` to customize the summary line. A custom `renderApproval`
plugin still fully overrides the default.
