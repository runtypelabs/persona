---
"@runtypelabs/persona": minor
---

Add an `operator` message role.

`role: "operator"` renders a human speaking on the agent's side (for example, a support agent who takes over a thread). It sits on the assistant's side with its own bubble, sized to its content, styled by the new `theme.components.message.operator` tokens. The V4 defaults tint the container with the theme primary; the V5 defaults outline the bubble instead (a `brand` accent tints the outline), so it never blends into the user bubble. The `flat` layout keeps the operator background. Operator messages are display-only: every request builder (proxy, agent and client token) leaves them out, since the API accepts only user, assistant and system turns. They get the copy action and opted-in custom actions (`roles: ["operator"]`), never feedback, read-aloud or regenerate, copy does not report feedback to the API, and they fire no `assistant:*` events. `layout.messages.avatar.operatorAvatar` sets their avatar. To draw per-message details such as delivery status under a message, use a `renderMessage` plugin slot.

Existing roles render and send exactly as before.
