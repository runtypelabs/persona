# Approvals

When an agent asks to run a gated tool, the assistant turn pauses on an approval card ("The assistant wants to use **Search docs** from **Runtype**") with Allow and Deny. The visitor's decision goes to `approval.onDecision`, the card resolves, and the turn resumes: on Allow the tool runs and the reply streams, on Deny the agent continues without it.

## Sub-features

- `card`: the card renders under the paused assistant bubble with the tool name, source and Allow / Deny.
- `details`: the "Show details" disclosure expands the tool parameters.
- `allow`: Allow → `approval:resolved` → tool bubble → final reply.
- `deny`: Deny → the agent's "won't search" reply, with no tool bubble.
- `settle`: the paused bubble settles (no stuck spinner or typing indicator) at stream end.

## How to get to it (user POV)

1. The visitor sends a message that makes the agent call a gated tool; the card appears.
2. They click Allow or Deny (or open Show details first).

## Driving it with control-persona + agent-browser

Preconditions: `ctl open verify --scenario approval` (every send triggers an approval for `search_docs`).

- **Trigger:** `ctl record start approvals "allow flow"`, then `ctl ab find placeholder "Send a message…" fill "find approval docs"`, `ctl ab press Enter`, `ctl ab wait --text "Allow"`. Observe: the card with buttons `Allow`, `Deny` and `Show details` (expanded=false).
- **Card proof:** `ctl shot approvals "card pending"`.
- **Details:** `ctl ab find role button click --name "Show details"`. Observe: the parameters `query` and `numResults`, and the button renamed to `Hide details` (expanded=true).
- **Allow:** `ctl ab find role button click --name "Allow"`, then `ctl ab wait --text "Found 2 pages"`. Observe: the card is replaced by a collapsed `Used tool for … seconds` button and the reply "Found **2** pages: …". Then `ctl shot approvals "after allow"`.
- **Allow side effects:** `ctl record stop`, then `ctl capture approvals "allow side effects"`. Do both before the Deny `open`, because a fresh `open` restarts the browser. In `*.page.json`, `requests` should hold exactly one `https://verify.invalid/chat` (the user message) and one `approval:onDecision` with `decision: "approved"`. In `events`: one `approval:requested`, then `approval:resolved`.
- **Deny:** `ctl open verify --scenario approval`, `ctl record start approvals "deny flow"`, then send again (`ctl ab find placeholder "Send a message…" fill "find approval docs"`, `ctl ab press Enter`, `ctl ab wait --text "Deny"`). Then `ctl ab find role button click --name "Deny"` and `ctl ab wait --text "I won't search"`. Observe: the card collapses to a `Search docs denied` chip, with no tool bubble. Then `ctl shot approvals "after deny"`, `ctl record stop`, `ctl capture approvals "deny side effects"`; expect `decision: "denied"`.
- **Settle:** in the final `shot` of each path, check that no typing indicator or spinner remains and that the composer shows `Send message`, not `Stop generating`.

## Gotchas

- Each send replays the whole scenario, so a second message raises a second approval.
- Known finding (October 2026): one decision emits `approval:resolved` several times. Allow fired it 8 times: the first with the real `agentId`, the rest `agentId: "virtual"` as later stream frames re-render the bubble. Deny fired it 4 times. Report the count you see; don't assume 1.
- The built-in card is replaced entirely when a `renderApproval` plugin is installed (see `apps/web/approval-demo.html` "plugin" variant, which needs no backend). Drive that page separately if the change touches the plugin path.

## Source

`packages/widget/src/components/approval-bubble.ts`, `components/approval-actions.ts`, `session.ts` (approval resume), `apps/web/src/verify-fixture.ts` (`approval` scenario).
