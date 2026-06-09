---
"@runtypelabs/persona": patch
---

Add an "Approval request" preview transcript preset (`approval-request`) to the theme editor, so a pending approval bubble (with parameters and Approve/Deny buttons) can be injected to test approval theming. The injected message uses the `approval-<id>` id convention so the Approve/Deny buttons transition the bubble to its approved/denied state in previews that resolve decisions locally.
