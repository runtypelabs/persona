---
"@runtypelabs/persona": minor
---

Add an `operator` message role and per-message `meta`.

- `role: "operator"` renders a human speaking on the agent's side (for example, a support agent who takes over a thread). It sits on the assistant's side with its own bubble, styled by the new `theme.components.message.operator` tokens. The V4 and V5 defaults tint the container with the theme primary, so `brand` themes follow without extra config. Operator messages are display-only: every request builder (proxy, agent and client token) drops them, so they never reach the model as `assistant` turns. They get the copy action and opted-in custom actions (`roles: ["operator"]`), never feedback, read-aloud or regenerate, and copy does not report feedback to the API. `layout.messages.avatar.operatorAvatar` sets their avatar.
- `meta` on any message (`{ label?, badges?: { label, tone? }[], note?: { text, tone? } }`) renders an author label, toned badges (`neutral`, `success`, `warning`, `danger`) and a note line under the bubble. Text is always set as plain text. Re-injecting the same `id` updates it in place, which suits live delivery status. Colors come from the new `theme.components.messageMeta` tokens, with dark-scheme defaults.

Existing roles render and send exactly as before.
