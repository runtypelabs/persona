# Voice: hosted realtime call (Runtype provider)

With `voiceRecognition.provider.type: 'runtype'`, the mic button starts a full-duplex call. The widget captures the mic (getUserMedia → 16 kHz AudioContext → PCM16 frames over a WebSocket), renders the server's streamed user and assistant transcripts as chat bubbles, and plays the server's 24 kHz PCM reply through its playback worklet. While the agent speaks, the mic reads `Speak to interrupt` (barge-in).

## Sub-features

- `connect`: click → socket opens with `voiceProtocol=runtype-browser-v1` → `session_config` arrives.
- `mic-upstream`: PCM16 frames flow from the first capture buffer on, and the server hears the spoken question.
- `transcripts`: the user and assistant transcript deltas grow one bubble each, ordered by `startMs`.
- `playback`: the reply audio plays (the output track's duration roughly matches the reply), and the mic shows `Speak to interrupt` while it plays, then `Stop voice recognition`.
- `hang-up`: clicking the mic during the call ends it, and the socket closes.

## How to get to it (user POV)

1. The visitor clicks the mic and asks a question out loud.
2. They see their words and the agent's answer appear, and hear the answer.
3. They click the mic again to hang up.

## Driving it with control-persona + agent-browser

Preconditions: `ctl open --voice runtype [--speak "What are your opening hours?"]`. This starts `scripts/verify/voice-call.mts` (legacy server: server-side turn, no client delegation) and loads `voice-e2e.html?voiceHost=…&clientDelegation=0`, with a synthesized WAV as the mic clip. To change what the agent says: `ctl voice-server stop`, then `ctl voice-server start --reply "…"`, before `open`.

- **Call:** `ctl record start voice-runtype "call"`, then `ctl ab find role button click --name "Start voice recognition"`.
- **Transcripts:** `ctl ab wait --text "eight to six"` (the default reply), then `ctl ab wait 3500` while the reply audio plays.
- **Hang up:** `ctl ab find role button click --name "Stop voice recognition" --force` (the level animation keeps the box moving), then `ctl ab wait 500`. The mic should return to `Start voice recognition`.
- **Proof:** `ctl shot voice-runtype "after call"`, `ctl record stop`, `ctl capture voice-runtype "audio round trip"`. Capturing after hang-up means the server has written the whole call, including its close code.
- **Read the capture** (`*.voice.json` is the summary):
  - `*.server-heard.png` shows the spoken question's waveform and spectrogram, not flat noise. The silence before and after the speech is the WAV's lead-in and tail.
  - `*.output.png` shows the reply speech. `output.durationMs` roughly matches `server.script.replyAudioMs`, and `output.maxDb` is well above −60 dB.
  - `latenciesMs.socketOpenToFirstMicFrame` is about one capture buffer (256 to 320 ms).
  - The timeline's mic marks run `recording | Stop voice recognition` → `recording | Speak to interrupt` → `recording | Stop voice recognition` → `idle | Start voice recognition`.
  - `sockets[0].sent.json.cancel` is 1 and `server.closeCode` is 1000: a clean hang-up.
  - `server.clientFrames` holds only the `cancel` on a legacy server, with no rejected frames.
- This page has no `__personaVerify`, so a voice-e2e capture has no `*.page.json`. That's expected. The fake mic WAV (`mic-*.wav`) is kept in the evidence dir, outside the manifest.

## Gotchas

- The clip mode starts the WAV when the widget calls getUserMedia (the WAV has a 1.5 s lead-in). `--mic-device` uses Chromium's fake device instead, which starts at browser launch, so a slow drive misses the speech and `server-heard` comes out flat. Re-run in clip mode before calling that a widget bug.
- Client delegation (GPT-Live: `delegation_started`, chat-pipeline turns) isn't scripted here. Its deterministic coverage is `e2e/specs/17-voice-gpt-live-delegation.spec.ts` (`pnpm test:e2e`); the live round trip through real GPT-Live is `e2e/live/` (manual, needs keys).
- STT of the captured output (an STT round trip with a WER figure) runs only with `whisper-cli` and `PERSONA_VERIFY_WHISPER_MODEL`; otherwise `stt.skipped` is recorded and the plots are the proof.
- Each new voice server deletes the previous server's `call-*` files from the run's `voice/` dir. Captures already copied what they needed.

## Source

`packages/widget/src/voice/runtype-voice-provider.ts` (capture, socket, downstream), `voice/worklet-playback-engine.ts`, `voice/mic-state-styles.ts`, `voice/session-voice-wiring.ts`, `apps/web/src/voice-e2e.ts`, `e2e/fixtures/fake-voice-server.ts`, `scripts/verify/voice-call.mts`, `scripts/verify/voice-init.js`.
