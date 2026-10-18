## Phone Agent demo: live staging run

<sub>branch `feat/phone-agent-demo` · captured at `3ba7dee996 + uncommitted changes (977eafaebd94)` · run `20261018-163211-843b03` · apps/web vite dev (widget from source), keyless fixture</sub>

| Feature | Result | Note |
| --- | --- | --- |
| phone-agent | ✅ verified | Live staging dispatch via local proxy: get_current_weather (Austin, Denver) and check_office_hours tool calls, spoken-style replies, 0 reasoning events |

### phone-agent

**render-empty**

<img src="./02-phone-agent-render-empty.png" alt="render-empty" width="640">

[`02-phone-agent-render-empty.aria.txt`](./02-phone-agent-render-empty.aria.txt)

**austin-tool-call**

<img src="./03-phone-agent-austin-tool-call.gif" alt="austin-tool-call" width="640">

<img src="./03-phone-agent-austin-tool-call.contact-sheet.png" alt="austin-tool-call" width="640">

[`03-phone-agent-austin-tool-call.webm`](./03-phone-agent-austin-tool-call.webm)

**austin-reply**

<img src="./04-phone-agent-austin-reply.png" alt="austin-reply" width="640">

[`04-phone-agent-austin-reply.aria.txt`](./04-phone-agent-austin-reply.aria.txt)

**denver**

<img src="./06-phone-agent-denver.png" alt="denver" width="640">

[`06-phone-agent-denver.aria.txt`](./06-phone-agent-denver.aria.txt)

**office-hours**

<img src="./07-phone-agent-office-hours.png" alt="office-hours" width="640">

[`07-phone-agent-office-hours.aria.txt`](./07-phone-agent-office-hours.aria.txt)

