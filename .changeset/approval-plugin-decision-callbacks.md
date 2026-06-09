---
"@runtypelabs/persona": minor
---

Add `approve` / `deny` callbacks to the `renderApproval` plugin hook so a fully custom approval renderer can resolve the approval (previously only the built-in bubble's buttons could). Both route through the same path as the built-in buttons (optimistic update, `onDecision`, in-place anchoring, WebMCP gate handling).

Each callback accepts an optional `{ remember?: boolean }` — for "Always allow"-style affordances — that is forwarded to `config.approval.onDecision` (now `(data, decision, options?)`) and to the controller's `resolveApproval(approvalId, decision, options?)`. The current approval resolves identically whether or not `remember` is set; the flag lets integrators persist a don't-ask-again policy for future approvals. Exposes the new `AgentWidgetApprovalDecisionOptions` type.

Also fixes `renderApproval` plugin elements losing their event listeners on transcript re-renders. Custom approval bubbles are now mounted via the same stub-and-hydrate path as `renderAskUserQuestion` and component directives (the transcript morph imports nodes via `document.importNode`, which strips listeners), so interactive custom UI — Approve/Deny buttons, an expandable parameters accordion, etc. — stays interactive. Interactive state is preserved across re-renders while the approval is pending and rebuilt when its status changes.
