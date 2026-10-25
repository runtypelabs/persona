# Human operator messages

Human replies render on the agent side with a readable author label, including when avatars are hidden. They form a boundary that retry/edit cannot erase. Attachment-only human replies retain explicitly opted-in custom actions. The fixture restores a conversation containing a customer turn, an AI reply, a named human reply, and an attachment-only human reply without author metadata.

## Sub-features

- Human identification: the named reply identifies Sam as human; the unnamed reply has the default human label. Verify in the screenshot and accessibility snapshot, with default avatars hidden.
- Retry/edit boundary: the earlier assistant has no Regenerate action and the earlier customer message has no Edit action.
- Media actions: both human replies expose Delivery details; the attachment-only action reports `operator-file`.
- Later turns: sending a new customer message permits regeneration of its AI reply and preserves both earlier human replies.
- Server-owned history: with the default model-context policy, captured requests omit operator turns; the visible transcript retains them. Model-context conversion and framework adapter coverage live in the unit/integration suites.

## How to get to it (user POV)

1. Open the restored conversation with the support replies and receipt.
2. Inspect who replied and open the receipt's Delivery details.
3. Ask when the replacement will arrive, then regenerate the new AI reply.

## Driving it with control-persona + agent-browser

Preconditions: `ctl open verify --scenario operator` (repeat with `--theme dark` and with `--config '{"future":{"v5Defaults":true}}'` for both theme generations).

- Start a recording: `ctl record start operator "Human identity and protected history"`.
- Inspect: `ctl ab snapshot -i` and `ctl shot operator "Restored human replies"`. There must be no Edit or Regenerate action yet.
- Both custom actions have the same accessible name. Use the stable message wrapper to select the receipt's action: `ctl ab click '[data-wrapper-id="operator-file"] [data-action="custom:delivery"]'`.
- Verify the page status says `Delivery details: operator-file`.
- Send: `ctl ab find placeholder "Send a message…" fill "When will my replacement arrive?"`, then `ctl ab press Enter`.
- Wait: `ctl ab wait --text "This reply is scripted by the verify fixture"`.
- Retry: `ctl ab find role button click --name "Regenerate response"`; wait for the scripted reply again. Confirm Sam's approval and the receipt remain.
- Capture: `ctl record stop`, `ctl shot operator "Human replies preserved after retry"`, `ctl capture operator "Retry and media action effects"`.
- Read the capture JSON: exactly one `fixture:delivery` event identifies `operator-file`; two chat requests represent the new send and retry. Neither default request includes operator messages.

## Gotchas

- The initial transcript is host-supplied history, not a simulated composer action. Subsequent sends, retry, and delivery actions must use rendered controls.
- This fixture verifies message rendering and transcript preservation. It does not pause an external agent or exercise a framework's approval/resume API.
- A screenshot alone does not establish the context policy; inspect captured request bodies.

## Source

`packages/widget/src/components/message-bubble.ts`, `utils/resubmit-turn.ts`, `session.ts`, `client-dispatch.ts`, `apps/web/src/verify-fixture.ts`.
