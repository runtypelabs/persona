## Disclosure scroll proof (captured before final rebase)

<sub>branch `fix/activity-disclosure-scroll` · captured at `44c759fb50 + uncommitted changes (860ea69d7f9c)`, `44c759fb50 + uncommitted changes (8dd3528948a0)` · run `20261021-080843-aaf513` · apps/web vite dev (widget from source), keyless fixture</sub>

| Feature | Result | Note |
| --- | --- | --- |
| streaming | ✅ verified | Final main-based source: 12 browser cases pass, including mouse/keyboard, animated/reduced motion and rapid reversals. Actual session proof: one request, one user message, two assistant completions and matching run start/finish. Build, lint, typecheck and gzip checks pass; lazy activity allowance +50 bytes, CDN unchanged. |

### streaming

**Current main reasoning open and close**

<img src="./01-streaming-current-main-reasoning-open-and-close.gif" alt="Current main reasoning open and close" width="640">

<img src="./01-streaming-current-main-reasoning-open-and-close.contact-sheet.png" alt="Current main reasoning open and close" width="640">

[`01-streaming-current-main-reasoning-open-and-close.webm`](./01-streaming-current-main-reasoning-open-and-close.webm)

**Current main inset reasoning expanded**

<img src="./02-streaming-current-main-inset-reasoning-expanded.png" alt="Current main inset reasoning expanded" width="640">

[`02-streaming-current-main-inset-reasoning-expanded.aria.txt`](./02-streaming-current-main-inset-reasoning-expanded.aria.txt)

**Reasoning through the real session**

<img src="./03-streaming-reasoning-through-the-real-session.gif" alt="Reasoning through the real session" width="640">

<img src="./03-streaming-reasoning-through-the-real-session.contact-sheet.png" alt="Reasoning through the real session" width="640">

[`03-streaming-reasoning-through-the-real-session.webm`](./03-streaming-reasoning-through-the-real-session.webm)

**Completed reasoning after toggling**

<img src="./04-streaming-completed-reasoning-after-toggling.png" alt="Completed reasoning after toggling" width="640">

[`04-streaming-completed-reasoning-after-toggling.aria.txt`](./04-streaming-completed-reasoning-after-toggling.aria.txt)

**Reasoning request and events**: 1 request(s) crossed the network boundary, 6 controller event(s)

[`05-streaming-reasoning-request-and-events.page.json`](./05-streaming-reasoning-request-and-events.page.json)

