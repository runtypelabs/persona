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
Playwright's clock also controls the short-tail timer and advances with each
audio step. The late-chunk test deliberately stalls the runner longer than the
tail timeout to verify that host scheduling cannot release audio early.
The probe lives entirely in the test fixture, not the published package.

Assertions inspect the rendered sample array:

- Late 100 ms frames produce one continuous waveform with every sample present.
- After a buffer underrun, the first late chunk waits for refill and resumes in order.
- An interruption discards a short buffered reply before any of it is played.
- An interruption stops already-playing audio, and a later short reply still drains
  without an `audio_end` frame.

Each test saves a WAV and JSON waveform summary under `test-results/` and
attaches both to its Playwright result. CI keeps the `voice-playback-waveforms`
artifact for seven days, including passing runs.
The samples have constant, distinguishable amplitudes so omissions, duplicates,
reordering, and unintended gaps cannot hide in natural speech silence.

## Scope

This is a functional test of the browser playback path, not of GPT-Live's speech
generation or the operating system's audio device. Live listening tests and
receive/playback timing measurements still matter before a broad rollout.
The unit suite covers the 150 ms threshold, tail timers, and playback lifecycle
edges with a controlled clock. The existing voice suites cover delegation and
call state separately.

## Playback measurements

The browser suite also checks the public `voiceRecognition.onPlaybackMetrics`
callback against the rendered audio. Late frames absorbed by the reserve report
zero underruns. A forced depletion reports one underrun and the measured refill
wait. Interruptions empty the queue without recording a completed refill.

```ts
voiceRecognition: {
  enabled: true,
  provider: { type: "runtype", runtype: { agentId: "your-agent-id" } },
  onPlaybackMetrics(metrics) {
    // Forward numeric metadata to your own diagnostics if needed.
    console.debug("Voice playback", metrics);
  },
}
```

The built-in player emits local snapshots, separate from server `onMetrics`:

- `queuedAudioMs`: held samples plus scheduled audio not yet played, excluding
  sound-device/output latency.
- `underrunCount`: a chunk arrived after scheduled audio ran out, before an
  explicit stream end or interruption. One count per depletion, not per late chunk.
- `refillCount`, `lastRefillMs`, `totalRefillMs`: completed refill waits, measured
  from the first late chunk until the player schedules the held batch. Startup
  buffering and cancelled waits are excluded. Time waiting for that first late
  chunk is not refill time.
- `buffering`, `continuous`, `reason`: context for each snapshot. Queue snapshots
  are limited to one per 250 ms during activity. Underrun, refill, flush, and drain
  snapshots bypass that limit. There is no periodic timer while idle.

Counters last for one player instance, normally one call, and survive interruptions.
A new call starts fresh. The callback is optional, contains no audio or transcript,
and sends nothing to a server. A custom playback engine can implement the optional
`onPlaybackMetrics` method or leave it unsupported. Slow callbacks still run on the
main thread, so avoid synchronous storage or expensive processing inside them.

For GPT Live, `continuous` is true. The stream has no end-of-reply markers, so
`underrunCount` also includes natural pauses between utterances or around delegation.
It is a scheduler-depletion measure, not proof of an audible glitch or a network
fault. Correlate it with received audio and call activity before drawing conclusions.
No adaptive buffer tuning is enabled; the default remains 150 ms.
