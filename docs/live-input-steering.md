# Live input steering

For client-token chat with a saved native Runtype agent, opt in to additive input:

```ts
const config = {
  clientToken: 'YOUR_PUBLIC_CLIENT_TOKEN',
  composer: { streamingSubmitBehavior: 'steer' },
};
```

The token must target a chat surface with durable turns enabled. Client init must
advertise `durableRecovery.steer: true`. This mode does not support flows, external
agents, or proxy/custom transports. Unsupported sessions fail explicitly rather
than silently interrupting the response. The default remains `block`.

While the agent works, **Send** and Enter submit another user message without
cancelling the response, tool execution, question sheet, or reconnect. A separate
**Stop response** button cancels the durable run. Closing or unmounting the widget
only disconnects its browser stream; it does not stop the durable execution.

Each message has its own delivery state:

- **Sending**: waiting for admission acknowledgement.
- **Waiting for the agent**: accepted, pending a safe model checkpoint.
- **Received by the agent**: applied to model input.
- **Delivered**: applied input belongs to a settled execution; this is not a
  promise that the agent answered every request successfully.
- **Not applied**: the run ended before consuming this input. **Send again** makes
  a new delivery, retaining the original transcript.
- **Delivery unconfirmed** or **Message not delivered**: **Retry delivery** reuses
  the original identity, or rechecks an already acknowledged receipt. It never
  silently replaces the active response.

Edits and regeneration of completed steered turns append a new message instead of
erasing prior conversation, even if the host later disables steer mode or changes
transport. Pending admissions are FIFO and bounded at eight; when full, the
composer keeps its draft, attachments, mentions, and one-shot state.
Programmatic `submitMessage()` returns `false` when admission is already full or
another submission is still preparing. A `true` return starts preparation; it
does not guarantee delivery. If capacity fills during an asynchronous
`onBeforeSend` hook or history transition, the draft stays intact and the composer
shows a retry notice. Composer content is consumed only after local admission.
A steered message cannot change the active run's model, tools, authorization, or
budgets. Those changes may be refused until the current run ends.

Only the submitted user delta is sent. Runtype supplies trusted model history;
Persona retains visitor-facing display content separately. The transport sends no
API key and binds receipt reads and cancellation to the current visitor session.

### Loading and bundle budget

Receipt parsing, visitor-scoped delivery/cancel requests, frozen retry payloads,
and status polling load from the optional `live-input` subpath. Self-hosted
script-tag deployments must serve `live-input.js` beside `index.global.js`.
ESM and CJS consumers resolve it through the package export map.

Synchronous FIFO reservation, admission ownership, Stop intent, and composer
controls remain in the core so a delayed chunk cannot reorder messages or lose
a cancellation. The feature adds 3 kB of gzip budget to the four core-containing
bundles; the independent receipt chunk has a 2 kB gzip ceiling. Measured locally
after rebasing onto the current defaults and session-renewal changes: IIFE
196.34 kB, ESM 209.08 kB, CJS 209.88 kB, and preview 175.61 kB. The browser
Brotli budget is 158 KiB (measured 156.64 KiB). The launcher and stylesheet
budgets are unchanged. A bundle test keeps receipt-only code out of those core
bundles. See `packages/widget/SIZE-BUDGETS.md` for the baseline comparison.
