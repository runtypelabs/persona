---
name: verify
description: Drive the Persona chat widget the way a user does and produce visual evidence for a PR. Launches the apps/web showcase (widget from source) on an owned port, drives it with Vercel's agent-browser, captures screenshots, video/GIF, ARIA snapshots, network/controller side effects and, for voice, real audio both ways (fake mic in, captured speaker out, waveform/spectrogram plots, latencies), then publishes a single evidence comment to the PR. Use after changing packages/widget (UI, streaming, approvals, tools, launcher, theming, voice) or when asked to verify, demo, screenshot or prove a Persona change.
---

# Verify Persona

The lever is `scripts/verify/control-persona.mjs` (zero-dependency Node; `--help` lists every command, every command takes `--json`). It owns one **run** at a time: a vite dev server for `apps/web` (which resolves `@runtypelabs/persona` from `packages/widget/src`, so edits show up live), one agent-browser session, an optional scripted voice socket, and an evidence directory. Below, `ctl` means `node scripts/verify/control-persona.mjs`.

The default target is **`apps/web/verify.html`**: a keyless fixture whose `customFetch` scripts the backend in-page (Persona's real SSE vocabulary), so the real client, session and UI code run and only the network boundary is faked. It records every request that crossed that boundary and every controller event on `window.__personaVerify`. Any other showcase page (`approval-demo`, `launcher-demo`, …) can be opened by name; most need the Runtype proxy (`pnpm dev`, keys in `examples/runtype-hono-proxy/.env`), so prefer the fixture and say when a proof needed a live page.

Read `features/README.md` before driving, then the feature file for what your change touches.

## Launch

```bash
pnpm install --frozen-lockfile        # add --ignore-scripts if sharp's postinstall fails (it is not needed here)
npm i -g agent-browser && agent-browser install   # once per machine; ffmpeg must be on PATH
node scripts/verify/control-persona.mjs launch    # free port in 4390-4419, or --port N
```

Ready when it prints `launched run <id>`: it waits until `/verify.html` serves the fixture (up to 90 s; on failure it prints the vite log tail). One run at a time per checkout; `launch` refuses while a run is live, and never takes a port it did not find free. Two checkouts can run side by side (different ports, separate `.verify/` dirs, sessions named `persona-verify-<run id>`).

## Doctor

```bash
node scripts/verify/control-persona.mjs doctor
```

Read-only. Checks the run exists, agent-browser and ffmpeg are installed, the server process is alive, every listener on the port belongs to the process group this run started, the server's cwd is this checkout, the fixture is served, the browser session answers, and the voice server is alive. Prints a remedy for each failure and exits 1. It also prints the source identity (branch, HEAD, dirty-diff hash); every evidence entry records the revision it was captured at. Run it first whenever anything looks off.

## Drive

```bash
ctl open verify --scenario approval            # echo|markdown|tool|reasoning|approval|error
ctl open verify --mode launcher --theme dark   # floating launcher, dark scheme
ctl open verify --config '{"launcher":{"title":"Help"}}'   # deep-merged over the fixture config: exercise a new option
ctl open approval-demo                         # any apps/web page by name, or an absolute URL
ctl ab snapshot -i                             # then drive with agent-browser, scoped to this run's session
ctl ab find placeholder "Send a message…" fill "hello"
ctl ab press Enter
ctl ab find role button click --name "Allow"
ctl ab wait --text "Found 2 pages"
```

`open` always starts a fresh browser session (launch flags only apply at start), sets a 1100x900 viewport (`--viewport WxH`) and waits for `window.__personaVerify.ready`. Use `--headed` to watch. `ctl ab …` forwards everything verbatim to `agent-browser --session persona-verify-<run>`. Prefer accessible names (`find role button --name`, `find placeholder`), then `wait --text`; never coordinates. The handles per feature are in `features/`.

### Voice: a second approach

A screenshot can't show that audio flowed, and headless Chromium can't run real speech recognition: it has no Google speech backend, and the fake mic never reaches `SpeechRecognition`. Voice proofs therefore fake only what the browser cannot do, and record everything else. This mirrors how voice-AI teams test: deterministic turn scripts plus a TTS→mic→STT round trip, as in Pipecat evals, Vapi, Hamming and LiveKit. `open --voice …` injects `scripts/verify/voice-init.js` before any page script, which records into `window.__personaVoice`:

- **mic-button transitions:** every class / `aria-label` change of `[data-persona-composer-mic]`.
- **WebSocket frames:** per-socket counts and bytes of binary (mic PCM) and JSON frames, and the first-frame times. Vite's HMR socket is ignored.
- **speaker output:** every AudioContext that reaches the speakers, captured with one MediaRecorder per context.
- **TTS:** `speechSynthesis` utterances (text, rate), fired on a word-count clock.
- **dictation:** `SpeechRecognition` replaced by a scripted recognizer that emits interim and then final results from `window.__personaVoice.speech`.

| Layer | Command | Real | Faked |
|---|---|---|---|
| Browser dictation + read-aloud | `ctl open verify --voice browser` | composer fill, pause-timer auto-submit, chat turn, TTS text selection | recognizer results, synth audio |
| Hosted (Runtype) realtime call | `ctl open --voice runtype [--speak "…"]` | getUserMedia consumer, capture AudioContext + PCM16 encoding, socket protocol, transcript bubbles, PCM playback worklet, mic state machine | mic source (a synthesized WAV clip started when the widget opens the mic) and the server (`scripts/verify/voice-call.mts`, wrapping `e2e/fixtures/fake-voice-server.ts`) |
| Live round trip (manual, not CI) | `e2e/live/` harness (see its README) | everything, including GPT-Live | nothing |

`--voice runtype` starts the scripted voice socket (`ctl voice-server start --user "…" --reply "…"` to change the script). The socket waits until it has received 3.5 s of mic PCM, streams the user transcript, then streams the assistant transcript plus **synthesized reply speech** as PCM16 24 kHz in real time. It saves exactly what it heard. `--mic-device` uses Chromium's `--use-file-for-fake-audio-capture` device instead of the clip. That covers the real device path, but the file starts playing at browser launch, so a slow drive can miss the speech: check the `server-heard` plot.

To drive a call: `ctl ab find role button click --name "Start voice recognition"`, then `ctl ab wait --text "<reply text>"`, then wait about 3 s for playback. Hang up with `ctl ab find role button click --name "Stop voice recognition" --force`, then `ctl capture voice-runtype "<label>"` (after hang-up, so the server has written the whole call). `features/voice-runtype.md` has the full recipe and what to check.

## Evidence

```bash
ctl shot <feature> "<label>" [--note "…"] [--full]   # PNG + ARIA snapshot (.aria.txt)
ctl record start <feature> "<label>"                 # video of the whole action…
ctl record stop                                      # → .webm, .gif (inline in PRs), contact sheet
ctl capture <feature> "<label>"                      # side effects: requests + controller events; on voice
                                                    #   pages also .voice.json (timeline, latencies), output.png/.wav
                                                    #   (what the widget played), server-heard.png/.wav (what the socket got)
ctl verdict <feature> pass|fail|skip "note"          # one row in the report table
ctl report                                           # .verify/runs/<id>/evidence/README.md
ctl publish --pr <N> [--dry-run]                     # push evidence to the verify-evidence branch, upsert ONE PR comment
```

Evidence lives in `.verify/runs/<id>/evidence/` (gitignored), numbered in capture order, listed in `manifest.json` with the URL, HEAD and dirty-diff hash at capture time.

Proof standards (a proof that skips one is incomplete; say which in the verdict note):

- Exercise the real user path: type into the composer, click the rendered buttons. Never call controller setters or inject messages to fake a state the user would reach by acting.
- Capture the action and the result: a `record` around the interaction plus a `shot` of the end state, not just a final screenshot.
- Verify side effects with `capture`: the request body that crossed the network boundary, the controller events and their counts, and, for voice, frames and audio in both directions. Read the JSON; a count that looks wrong is a finding.
- For voice, a non-silent `output` track whose duration matches the reply (`peak` well above −60 dB) and a `server-heard` plot that shows the spoken question. A silent plot is a failed proof, not evidence.
- Mocks only at the network boundary (the fixture's `customFetch`, the scripted voice socket) and at browser capabilities headless Chromium lacks (speech recognition, synth audio).
- A feature with several entry points (`features/*.md` lists them) is verified only for the entry points you drove; record the rest as `skip`.

`publish` needs `gh` auth and push access. It refuses a merged or closed PR (unless `--allow-merged`), writes evidence with git plumbing (no checkout; your working tree is untouched) under `verify-evidence:pr-<N>/<run id>/`, and edits the PR's existing `<!-- persona-verify-evidence -->` comment instead of adding another. Images are pinned to the evidence commit. Use `--dry-run` first to see the exact comment. Publishing is outward-facing on a public repo: publish when the user asked for PR evidence or a PR is the deliverable.

STT round trip (optional): with `whisper-cli` (`brew install whisper-cpp`) and `PERSONA_VERIFY_WHISPER_MODEL=<ggml model>`, `capture` transcribes the captured output and reports the word error rate (WER) against the scripted reply. Without them it records `stt.skipped`.

## Cleanup

```bash
node scripts/verify/control-persona.mjs cleanup
```

Stops an open recording (keeping it), closes the browser session, and sends SIGTERM (then SIGKILL) to the voice server's and vite's process groups. It signals a group only if its recorded leader pid still leads it, and it never kills by name or port. Evidence is kept and its path printed. Run it after every failed attempt too, so ports and processes don't leak.

## Helpers

- `scripts/verify/control-persona.mjs`: the CLI above. Its pure logic is in `scripts/verify/lib.mjs`; run the tests with `node --test scripts/verify/lib.test.mjs`.
- `scripts/verify/voice-init.js`: the voice instrumentation init script. Its header lists everything it fakes and records.
- `scripts/verify/voice-call.mts`: the scripted voice socket (`--help`). Node 24 runs it directly.
- `apps/web/verify.html` + `apps/web/src/verify-fixture.ts`: the fixture page. Its header comment documents the query parameters.
- `e2e/`: the Playwright suites (history, voice) for regression tests. This skill is for evidence; add a spec there when a behavior needs a permanent guard.

To keep the map honest as the widget changes, use `/maintain-verification-skill` (pstack).
