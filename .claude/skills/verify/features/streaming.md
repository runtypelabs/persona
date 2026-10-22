# Streaming messages

Assistant replies stream into a bubble delta by delta and render as sanitized Markdown (headings, lists, links, tables, code, block quotes). Reasoning streams into a collapsible "Thought for N seconds" disclosure above the answer. A failed request renders an error bubble instead of hanging.

## Sub-features

- `echo`: plain streamed reply; the typing indicator becomes text; the composer re-enables at the end.
- `markdown`: heading, ordered list, inline code, a link, a table, a fenced code block, a block quote.
- `reasoning`: the `Thought for … seconds` disclosure (collapsed by default) and the answer below it.
- `error`: a 500 from the backend becomes the "Sorry: the chat service couldn't complete the request…" bubble.
- `internal-error`: a scripted TypeError becomes the "Sorry: the chat encountered an unexpected error…" bubble without backend troubleshooting advice.
- `stop`: during a stream the send button becomes `Stop generating`.

## How to get to it (user POV)

1. The visitor types into "Send a message…" and presses Enter or clicks `Send message`.
2. They watch the reply stream, and optionally expand the reasoning disclosure.

## Driving it with control-persona + agent-browser

Preconditions: `ctl open verify --scenario <echo|markdown|reasoning|error|internal-error>` (add `--delay-ms 150` to slow the stream for video).

- **Send:** `ctl ab find placeholder "Send a message…" fill "hello"`, then `ctl ab press Enter`.
- **Mid-stream:** `ctl ab snapshot -i`. Observe: `Stop generating` replaces `Send message`, and `Start voice recognition` is disabled.
- **End state, echo:** `ctl ab wait --text "You said"`. Markdown: `ctl ab wait --text "Block quotes render too"`. Reasoning: `ctl ab wait --text "After thinking it over"`, then `ctl ab find role button click --name "Thought for"` to expand it. Error: `ctl ab wait --text "chat service couldn't complete"`. Internal error: `ctl ab wait --text "chat encountered an unexpected error"`.
- **Proof:** `ctl record start streaming "<scenario>"` before sending, `ctl record stop` after, then `ctl shot streaming "<scenario> final" --full` and `ctl capture streaming "<scenario>"`. The request body holds the typed message, and `events` has one `user:message` and one `assistant:complete` per turn.

## Gotchas

- ARIA snapshots drop inline `<strong>` text (`the answer is` without `42`); check the screenshot for formatting, not the snapshot.
- `Thought for 0.2 seconds` comes from wall-clock timing, so match on `Thought for`.
- Error scenarios retain the underlying detail. Only recognized fetch failures use connectivity copy; a server rejection or internal fault must not claim the service was unreachable.

## Source

`packages/widget/src/client.ts` and `client-stream.ts` (SSE parsing), `components/message-bubble.ts`, `components/reasoning-bubble.ts`, `postprocessors.ts`, `utils/sanitize.ts`, `apps/web/src/verify-fixture.ts`.
