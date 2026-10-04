# Tool calls

When the agent runs a tool, a tool bubble shows it running (with streamed tool output), then collapses into a `Used tool for N seconds` disclosure whose details hold the parameters and the result. The final answer streams below it.

## Sub-features

- `running`: the tool bubble appears on `tool_start` and shows `tool_output_delta` text.
- `collapsed`: after `tool_complete` it becomes a `Used tool for … seconds` button (expanded=false).
- `details`: expanding it shows parameters (`city`, `unit`) and the result (`tempC`, `conditions`).
- `answer`: the follow-up turn renders "It's **22°C and sunny** in Lisbon right now."

## How to get to it (user POV)

1. The visitor asks something that makes the agent call a tool.
2. They watch it run, then optionally expand the summary.

## Driving it with control-persona + agent-browser

Preconditions: `ctl open verify --scenario tool --delay-ms 250` (slower, so the running state is visible on video).

- **Send:** `ctl record start tool-calls "weather"`, then `ctl ab find placeholder "Send a message…" fill "weather in lisbon"`, `ctl ab press Enter`.
- **Answer:** `ctl ab wait --text "sunny"`. Observe: the button `Used tool for … seconds` (expanded=false).
- **Details:** `ctl ab find role button click --name "Used tool for"`. Observe: the parameters and result JSON are visible. `ctl shot tool-calls "details expanded"`.
- **Proof:** `ctl record stop`, `ctl capture tool-calls "side effects"`. Expect one chat request and two `assistant:complete` events (the tool message, then the answer).

## Gotchas

- `features.showToolCalls: true` is set by the fixture. A config override that sets it to false hides the bubble entirely, which is expected, not a bug.
- Tool-bubble templates and loading variants live on `apps/web/tool-loading-demo.html` (keyless, driven by `inject*`); use it for template changes.

## Source

`packages/widget/src/components/tool-bubble.ts`, `components/tool-details.ts`, `apps/web/src/verify-fixture.ts` (`tool` scenario).
