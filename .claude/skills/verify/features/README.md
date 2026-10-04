# Persona verification map

The maintained source for verifying Persona's user-facing behavior. Read this index, then use the matching feature file as the recipe. `ctl` = `node scripts/verify/control-persona.mjs`.

## Baseline preconditions

- A live run: `ctl launch`, then `ctl doctor` reports no FAIL.
- The keyless fixture `verify.html` unless the feature file says otherwise. It answers every send with the scenario's scripted stream; each load starts empty (`persistState: false`).
- Never drive a server or browser session another run started.

## Driving conventions

- Start each recipe with `ctl open …`, which gives a fresh session and an empty conversation.
- Use accessible names and placeholders (`ctl ab find role button click --name "…"`, `ctl ab find placeholder "Send a message…" fill "…"`), then `ctl ab wait --text "…"`. Avoid CSS selectors except the stable `data-persona-*` attributes named here.
- Keep quoted names literal, including the `…` ellipsis in the placeholder.
- The mic button's accessible name *is* its state: `Start voice recognition` (idle) · `Stop voice recognition` (recording) · `Processing voice input` · `Speak to interrupt` (agent speaking, barge-in).

## Proof and skip reporting

- UI proof: `record` around the action, plus a `shot` (PNG and ARIA snapshot) of the end state.
- Side-effect proof: `capture`, then read `*.page.json` (requests that crossed the boundary, controller events) and, for voice, `*.voice.json`.
- Every artifact carries its feature id (the file name below) and the source revision it was captured at.
- Record the outcome with `ctl verdict <feature> pass|fail|skip "note"`. An entry point you didn't drive is `skip` with the reason, never `pass` through another path.

## Feature entry contract

Each feature file has an H1, a paragraph on the user-visible behavior, then these H2s in order: `Sub-features`, `How to get to it (user POV)`, `Driving it with control-persona + agent-browser`, `Gotchas`, then `Source`.

## Features

- [approvals](./approvals.md): tool approval card, Allow / Deny, resolution and resume.
- [streaming](./streaming.md): streamed text, Markdown (tables, code), reasoning disclosure, error bubble.
- [tool-calls](./tool-calls.md): tool bubble lifecycle and the collapsed "Used tool" summary.
- [launcher-and-theme](./launcher-and-theme.md): floating launcher open/close, inline mount, dark scheme, config overrides.
- [voice-browser](./voice-browser.md): Web Speech dictation into the composer, auto-submit, browser read-aloud.
- [voice-runtype](./voice-runtype.md): hosted realtime voice call: mic → socket → transcripts → spoken reply playback.
