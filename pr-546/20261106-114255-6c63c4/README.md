## Visual evidence

<sub>branch `fix/run-failure-connection-status` · captured at `5a59497881`, `4401a861e2 + uncommitted changes (00d6d9cff644)` · run `20261106-114255-6c63c4` · apps/web vite dev (widget from source), keyless fixture</sub>

| Feature | Result | Note |
| --- | --- | --- |
| streaming | ✅ verified | Desktop v5 recovery, 390px compact recovery, delayed initial request, automatic reconnect and terminal execution failure driven through the real composer. One dispatch per journey; reconnect preserves execution/cursor; completion fires once after recovery. Matched merge-base screenshots use the same fixture overlay. |
| other-entry-points | ⏭️ not driven | Dark theme, voice, approval/tool UI and custom host labels were not manually driven in this capture; reconnect lifecycle and configuration variants are covered by automated regression tests. |

### streaming

**after exhausted recovery**

<img src="./01-streaming-after-exhausted-recovery.gif" alt="after exhausted recovery" width="640">

<img src="./01-streaming-after-exhausted-recovery.contact-sheet.png" alt="after exhausted recovery" width="640">

[`01-streaming-after-exhausted-recovery.webm`](./01-streaming-after-exhausted-recovery.webm)

**after recovery needed**

<img src="./02-streaming-after-recovery-needed.png" alt="after recovery needed" width="640">

[`02-streaming-after-recovery-needed.aria.txt`](./02-streaming-after-recovery-needed.aria.txt)

**after recovered response**

<img src="./03-streaming-after-recovered-response.png" alt="after recovered response" width="640">

[`03-streaming-after-recovered-response.aria.txt`](./03-streaming-after-recovered-response.aria.txt)

**after recovery requests**: 4 request(s) crossed the network boundary, 11 controller event(s)

[`04-streaming-after-recovery-requests.page.json`](./04-streaming-after-recovery-requests.page.json)

**after initial request**

<img src="./05-streaming-after-initial-request.gif" alt="after initial request" width="640">

<img src="./05-streaming-after-initial-request.contact-sheet.png" alt="after initial request" width="640">

[`05-streaming-after-initial-request.webm`](./05-streaming-after-initial-request.webm)

**after working indicator**

<img src="./06-streaming-after-working-indicator.png" alt="after working indicator" width="640">

[`06-streaming-after-working-indicator.aria.txt`](./06-streaming-after-working-indicator.aria.txt)

**after initial request**: 1 request(s) crossed the network boundary, 5 controller event(s)

[`07-streaming-after-initial-request.page.json`](./07-streaming-after-initial-request.page.json)

**after compact recovery**

<img src="./08-streaming-after-compact-recovery.gif" alt="after compact recovery" width="640">

<img src="./08-streaming-after-compact-recovery.contact-sheet.png" alt="after compact recovery" width="640">

[`08-streaming-after-compact-recovery.webm`](./08-streaming-after-compact-recovery.webm)

**after compact recovery needed**

<img src="./09-streaming-after-compact-recovery-needed.png" alt="after compact recovery needed" width="640">

[`09-streaming-after-compact-recovery-needed.aria.txt`](./09-streaming-after-compact-recovery-needed.aria.txt)

**after compact recovery requests**: 4 request(s) crossed the network boundary, 12 controller event(s)

[`10-streaming-after-compact-recovery-requests.page.json`](./10-streaming-after-compact-recovery-requests.page.json)

**after automatic reconnect**

<img src="./11-streaming-after-automatic-reconnect.gif" alt="after automatic reconnect" width="640">

<img src="./11-streaming-after-automatic-reconnect.contact-sheet.png" alt="after automatic reconnect" width="640">

[`11-streaming-after-automatic-reconnect.webm`](./11-streaming-after-automatic-reconnect.webm)

**after waiting to reconnect**

<img src="./12-streaming-after-waiting-to-reconnect.png" alt="after waiting to reconnect" width="640">

[`12-streaming-after-waiting-to-reconnect.aria.txt`](./12-streaming-after-waiting-to-reconnect.aria.txt)

**after reconnect request in flight**

<img src="./13-streaming-after-reconnect-request-in-flight.png" alt="after reconnect request in flight" width="640">

[`13-streaming-after-reconnect-request-in-flight.aria.txt`](./13-streaming-after-reconnect-request-in-flight.aria.txt)

**after automatic reconnect requests**: 3 request(s) crossed the network boundary, 9 controller event(s)

[`14-streaming-after-automatic-reconnect-requests.page.json`](./14-streaming-after-automatic-reconnect-requests.page.json)

**after execution failure**

<img src="./15-streaming-after-execution-failure.gif" alt="after execution failure" width="640">

<img src="./15-streaming-after-execution-failure.contact-sheet.png" alt="after execution failure" width="640">

[`15-streaming-after-execution-failure.webm`](./15-streaming-after-execution-failure.webm)

**after execution failure**

<img src="./16-streaming-after-execution-failure.png" alt="after execution failure" width="640">

[`16-streaming-after-execution-failure.aria.txt`](./16-streaming-after-execution-failure.aria.txt)

**after execution failure events**: 1 request(s) crossed the network boundary, 4 controller event(s)

[`17-streaming-after-execution-failure-events.page.json`](./17-streaming-after-execution-failure-events.page.json)

### baseline comparison

**before recovery needed**: Merge-base widget source with the same deterministic fixture overlay; light theme, matched configuration and viewport.

<img src="./11-streaming-before-recovery-needed.png" alt="before recovery needed" width="640">

[`11-streaming-before-recovery-needed.aria.txt`](./11-streaming-before-recovery-needed.aria.txt)

**before working indicator**: Merge-base widget source with the same deterministic fixture overlay; light theme, matched configuration and viewport.

<img src="./14-streaming-before-working-indicator.png" alt="before working indicator" width="640">

[`14-streaming-before-working-indicator.aria.txt`](./14-streaming-before-working-indicator.aria.txt)

**before compact recovery needed**: Merge-base widget source with the same deterministic fixture overlay; light theme, matched configuration and viewport.

<img src="./17-streaming-before-compact-recovery-needed.png" alt="before compact recovery needed" width="640">

[`17-streaming-before-compact-recovery-needed.aria.txt`](./17-streaming-before-compact-recovery-needed.aria.txt)

**before waiting to reconnect**: Merge-base widget source with the same deterministic fixture overlay; light theme, matched configuration and viewport.

<img src="./20-streaming-before-waiting-to-reconnect.png" alt="before waiting to reconnect" width="640">

[`20-streaming-before-waiting-to-reconnect.aria.txt`](./20-streaming-before-waiting-to-reconnect.aria.txt)

**before reconnect request in flight**: Merge-base widget source with the same deterministic fixture overlay; light theme, matched configuration and viewport.

<img src="./21-streaming-before-reconnect-request-in-flight.png" alt="before reconnect request in flight" width="640">

[`21-streaming-before-reconnect-request-in-flight.aria.txt`](./21-streaming-before-reconnect-request-in-flight.aria.txt)

