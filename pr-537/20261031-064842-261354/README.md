## Persona verification

<sub>branch `fix/reduce-widget-dom-bundle` · captured at `396b53dbc1 + uncommitted changes (fc36195c9170)`, `396b53dbc1 + uncommitted changes (c5de4df39fec)` · run `20261031-064842-261354` · apps/web vite dev (widget from source), keyless fixture</sub>

| Feature | Result | Note |
| --- | --- | --- |
| scroll-to-bottom | ✅ verified | Regular arrow and unread-count badge render correctly; clicking reaches the latest reply. Approval-needed glyph and label also render, and clicking reaches the approval card. Captures show one user dispatch per scenario and one approved decision. Approval fixture emitted 5 approval:resolved events (documented repeated-event behavior). |
| event-stream | ⏭️ not driven | Shared control covered by existing event-stream unit tests; browser proof covered the transcript entry point only. |

### scroll-to-bottom

**approval below long message**

<img src="./01-scroll-to-bottom-approval-below-long-message.gif" alt="approval below long message" width="640">

<img src="./01-scroll-to-bottom-approval-below-long-message.contact-sheet.png" alt="approval below long message" width="640">

[`01-scroll-to-bottom-approval-below-long-message.webm`](./01-scroll-to-bottom-approval-below-long-message.webm)

**approval jump control**

<img src="./02-scroll-to-bottom-approval-jump-control.png" alt="approval jump control" width="640">

[`02-scroll-to-bottom-approval-jump-control.aria.txt`](./02-scroll-to-bottom-approval-jump-control.aria.txt)

**approval reached**

<img src="./03-scroll-to-bottom-approval-reached.png" alt="approval reached" width="640">

[`03-scroll-to-bottom-approval-reached.aria.txt`](./03-scroll-to-bottom-approval-reached.aria.txt)

**approval jump side effects**: 2 request(s) crossed the network boundary, 13 controller event(s)

[`04-scroll-to-bottom-approval-jump-side-effects.page.json`](./04-scroll-to-bottom-approval-jump-side-effects.page.json)

**regular jump to latest**

<img src="./05-scroll-to-bottom-regular-jump-to-latest.gif" alt="regular jump to latest" width="640">

<img src="./05-scroll-to-bottom-regular-jump-to-latest.contact-sheet.png" alt="regular jump to latest" width="640">

[`05-scroll-to-bottom-regular-jump-to-latest.webm`](./05-scroll-to-bottom-regular-jump-to-latest.webm)

**arrow and unread badge**

<img src="./06-scroll-to-bottom-arrow-and-unread-badge.png" alt="arrow and unread badge" width="640">

[`06-scroll-to-bottom-arrow-and-unread-badge.aria.txt`](./06-scroll-to-bottom-arrow-and-unread-badge.aria.txt)

**latest reply reached**

<img src="./07-scroll-to-bottom-latest-reply-reached.png" alt="latest reply reached" width="640">

[`07-scroll-to-bottom-latest-reply-reached.aria.txt`](./07-scroll-to-bottom-latest-reply-reached.aria.txt)

**regular jump side effects**: 1 request(s) crossed the network boundary, 5 controller event(s)

[`08-scroll-to-bottom-regular-jump-side-effects.page.json`](./08-scroll-to-bottom-regular-jump-side-effects.page.json)

