# Voice: browser dictation and read-aloud

With `voiceRecognition.enabled` and the default browser provider, the mic button dictates into the composer through the Web Speech API. Interim words appear live, and after `pauseDuration` of silence the transcript is submitted as a normal turn. With `textToSpeech: { provider: 'browser' }` the reply is spoken through `speechSynthesis` (Markdown stripped).

## Sub-features

- `dictate`: the mic goes `Start voice recognition` → `Stop voice recognition`, and interim and final words fill the composer.
- `auto-submit`: after the pause the transcript is sent (one chat request) and the mic returns to idle.
- `read-aloud`: the assistant reply is spoken; the spoken text is the reply with Markdown removed.
- `stop`: clicking the mic while recording stops dictation; today that submits what was heard so far.

## How to get to it (user POV)

1. The visitor clicks the mic in the composer and speaks.
2. They stop talking; the message sends itself, and the reply is read aloud.

## Driving it with control-persona + agent-browser

Preconditions: `ctl open verify --voice browser` (the fixture sets `pauseDuration: 800` and browser TTS). The scripted recognizer says `window.__personaVoice.speech`, "What are your opening hours?" by default. To change it before clicking: `ctl ab eval 'window.__personaVoice.speech = "Do you deliver?"'`.

- **Dictate:** `ctl record start voice-browser "dictation"`, then `ctl ab find role button click --name "Start voice recognition"`.
- **Answer:** `ctl ab wait --text "You said"`, then `ctl ab wait 2500`, which lets the TTS clock finish.
- **Proof:** `ctl record stop`, `ctl shot voice-browser "dictated turn answered"`, `ctl capture voice-browser "timeline"`.
- **Stop** (fresh `open`): `ctl ab find role button click --name "Start voice recognition"`, `ctl ab wait 400`, then `ctl ab find role button click --name "Stop voice recognition"`. Observe (October 2026 behavior): the mic returns to `Start voice recognition` and the partial transcript is **submitted**. `ctl capture voice-browser "stopped"` shows one request carrying "What are", and TTS speaks the reply to it. If a change means to keep the partial text in the composer instead, this step is where it shows.
- **Read the capture:** `*.voice.json` timeline should show `recognition:start` → `mic recording | Stop voice recognition` → `recognition:interim`… → `recognition:final` → `recognition:end` → `mic idle` → `tts:start`. `utterances[0].text` is the Markdown-free reply. `latenciesMs.recognitionFinalToTtsStart` should be roughly pauseDuration plus the stream. `*.page.json` should have one request whose last user message is the dictated text.

## Gotchas

- This layer can't prove real recognition or real audio: headless Chromium has no speech backend, and `speechSynthesis` audio can't be tapped. It proves the widget's handling of recognizer events and what it asks the synth to say. Real recognition needs a headed Chrome with a virtual mic (BlackHole on macOS, a PulseAudio null sink on Linux): a manual check.
- The mock reports no voices (as headless Chrome does), because `utterance.voice` only accepts a real `SpeechSynthesisVoice`.
- The mic is disabled while a reply streams; start a second dictation only after `Send message` is back.

## Source

`packages/widget/src/ui.ts` (`startVoiceRecognition`, the browser dictation path), `voice/browser-voice-provider.ts`, `voice/browser-speech-engine.ts`, `voice/read-aloud-controller.ts`, `session.ts` (`speakLatestAssistantMessage`), `scripts/verify/voice-init.js`.
