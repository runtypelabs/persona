# Voice playback regression suite

Run from the repository root:

```sh
pnpm build:widget
pnpm build:web-preview
pnpm exec playwright test --config e2e/playwright.config.ts e2e/specs/30-voice-playback.spec.ts
```

The existing E2E CI job discovers this suite automatically. No API keys, real
microphone, GPT-Live session, customer data, or external service is required.

## What runs

The tests click the real widget's microphone button and use its default Runtype
voice provider. A local scripted WebSocket server delivers PCM and `audio_clear`
frames through the normal parser. Microphone capture uses Chromium's fake device.

Only the 24 kHz speaker clock is controlled. A native `OfflineAudioContext`
renders the actual AudioBufferSourceNodes while the test pauses at specified
audio times to deliver the next frame. This removes wall-clock scheduling noise
without replacing the player, its queue, PCM conversion, or audio renderer.
The probe lives entirely in the test fixture, not the published package.

Assertions inspect the rendered sample array:

- Late 100 ms frames produce one continuous waveform with every sample present.
- After a buffer underrun, the first late chunk waits for refill and resumes in order.
- An interruption discards a short buffered reply before any of it is played.
- An interruption stops already-playing audio, and a later short reply still drains
  without an `audio_end` frame.

Each test attaches a WAV and JSON waveform summary to its Playwright result.
The samples have constant, distinguishable amplitudes so omissions, duplicates,
reordering, and unintended gaps cannot hide in natural speech silence.

## Scope

This is a functional test of the browser playback path, not of GPT-Live's speech
generation or the operating system's audio device. Live listening tests and
receive/playback timing measurements still matter before a broad rollout.
The unit suite covers the 150 ms threshold, tail timers, and playback lifecycle
edges with a controlled clock. The existing voice suites cover delegation and
call state separately.
