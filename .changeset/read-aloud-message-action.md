---
"@runtypelabs/persona": minor
---

Add a per-message "Read aloud" action button (text-to-speech) to assistant messages, next to copy/feedback. Enable via `messageActions.showReadAloud: true`. Clicking cycles play → pause → resume (or play → stop when the engine can't pause); the button icon reflects state and survives DOM morphs.

Speech is produced by a pluggable `SpeechEngine`. The browser Web Speech API engine (`BrowserSpeechEngine`) is the zero-backend default; supply a hosted engine (e.g. Runtype TTS, ElevenLabs, a server proxy) via `textToSpeech.createEngine` to use server-side voices — such an engine can stream audio through the realtime voice `VoicePlaybackEngine`. Voice, rate and pitch come from the existing `textToSpeech` config. The spoken text is resolved from the message body: an action-format envelope (`{"action":"message","text":"…"}`, optionally fenced) speaks its `text` field, otherwise Markdown is stripped to plain prose.

New public API: controller methods `widget.toggleReadAloud(id)`, `widget.stopReadAloud()`, `widget.getReadAloudState(id)`, `widget.onReadAloudChange(cb)`; a `message:read-aloud` controller event (`widget.on('message:read-aloud', e => …)`, parallel to `message:copy`/`message:feedback`) that fires on every state transition — `loading` (press) → `playing` → `paused`/`playing` → `idle` — with the message id preserved even on the terminal `idle`; exported types `ReadAloudState`, `SpeechEngine`, `SpeechRequest`, `SpeechCallbacks`, `AgentWidgetReadAloudEvent`; exported `BrowserSpeechEngine`, `ReadAloudController`, `pickBestVoice`. The existing auto-speak path (`textToSpeech.enabled`) now routes through the same controller, so a message can't be double-spoken and the button reflects auto-speak playback.

The theme editor (`@runtypelabs/persona/theme-editor`) gains a "Show Read Aloud" toggle in its Message Actions section.
