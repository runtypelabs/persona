// Jitter-buffered AudioWorklet PCM player.
//
// A reusable playback primitive for raw PCM16 / 24 kHz / mono streams. A
// worklet-side sample queue is drained continuously by the audio thread, with a
// configurable prebuffer "waterline" that absorbs network jitter. On underrun it
// goes silent and re-buffers (the audio thread outputs pre-zeroed silence)
// rather than snapping a schedule clock — so a late chunk produces a clean pause,
// not a click. This is the production-grade alternative to hand-scheduling
// AudioBufferSourceNodes (`AudioPlaybackManager`), which is simpler but clicks
// under jitter.
//
// Two consumers:
//   - The realtime `runtype` voice provider, via `createWorkletPlaybackEngine`
//     (injected through `voiceRecognition.provider.runtype.createPlaybackEngine`).
//   - Any hosted `SpeechEngine` (e.g. server/ElevenLabs/OpenAI TTS), via
//     `createPcmStreamPlayer({ prebufferMs })` — same engine, plus pause/resume
//     and a tunable prebuffer for bursty HTTP-streamed audio.
//
// Shipped from a separate subpath (`@runtypelabs/persona/voice-worklet-player`)
// so the worklet source stays out of the main bundle.

import type { PcmStreamPlayer, VoicePlaybackEngine } from "../types";

const PLAYBACK_SAMPLE_RATE = 24000;
// Default prebuffer: ~150ms. Enough for realtime, server-paced audio; HTTP-pulled
// TTS is burstier and should pass a larger `prebufferMs`.
const DEFAULT_PREBUFFER_MS = 150;

// The worklet reads its waterline from `processorOptions.waterlineSamples`, so a
// single registered processor serves any prebuffer size.
const WORKLET_SOURCE = `
class PersonaPcmPlayerProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    const opts = (options && options.processorOptions) || {}
    this.waterline = opts.waterlineSamples > 0 ? opts.waterlineSamples : 3600
    this.chunks = []
    this.readOffset = 0
    this.buffered = 0
    this.waiting = true
    // 'drained' must mean "the reply finished playing", not "momentary
    // underrun": a jitter gap empties the buffer mid-reply too, and firing
    // there would flap the UI status and race the audio_end handler. Only
    // report drained once eos has been signalled.
    this.eosSeen = false
    // Fire 'started' once, when the prebuffer first releases into playback, so a
    // consumer can flip UI from loading→playing only when audio is truly audible.
    // A mid-reply underrun re-buffers (waiting=true) but must NOT re-signal.
    this.startedSignaled = false
    this.port.onmessage = (e) => {
      const msg = e.data
      if (msg.type === 'push') {
        this.eosSeen = false
        this.chunks.push(msg.samples)
        this.buffered += msg.samples.length
        if (this.waiting && this.buffered >= this.waterline) {
          this.waiting = false
          this.signalStarted()
        }
      } else if (msg.type === 'eos') {
        this.eosSeen = true
        if (this.waiting && this.buffered > 0) {
          this.waiting = false
          this.signalStarted()
        }
        if (this.buffered === 0) {
          this.eosSeen = false
          this.port.postMessage({ type: 'drained' })
        }
      } else if (msg.type === 'clear') {
        this.chunks = []
        this.readOffset = 0
        this.buffered = 0
        this.waiting = true
        this.eosSeen = false
        this.startedSignaled = false
      }
    }
  }
  signalStarted() {
    if (!this.startedSignaled) {
      this.startedSignaled = true
      this.port.postMessage({ type: 'started' })
    }
  }
  process(inputs, outputs) {
    const out = outputs[0][0]
    if (!out || this.waiting) return true // outputs are pre-zeroed: silence
    let i = 0
    while (i < out.length && this.buffered > 0) {
      const chunk = this.chunks[0]
      out[i++] = chunk[this.readOffset++]
      this.buffered--
      if (this.readOffset >= chunk.length) {
        this.chunks.shift()
        this.readOffset = 0
      }
    }
    if (this.buffered === 0) {
      this.waiting = true // mid-reply underrun: re-buffer silently
      if (this.eosSeen) {
        this.eosSeen = false
        this.port.postMessage({ type: 'drained' })
      }
    }
    return true
  }
}
registerProcessor('persona-pcm-player', PersonaPcmPlayerProcessor)
`;

/** Convert raw PCM16 LE mono to Float32 samples in [-1, 1]. */
function pcm16ToFloat32(pcm: Uint8Array): Float32Array {
  const count = pcm.length >> 1;
  const out = new Float32Array(count);
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  for (let i = 0; i < count; i++) {
    out[i] = view.getInt16(i * 2, true) / 0x8000;
  }
  return out;
}

export interface PcmStreamPlayerOptions {
  /**
   * Audio (ms) to buffer before the first sample, and to re-buffer after an
   * underrun. Higher = smoother on bursty/jittery streams, at the cost of a
   * slightly later first sound (latency ↔ smoothness). Default 150 — good for
   * realtime, server-paced audio; HTTP-pulled TTS often wants ~400–600.
   */
  prebufferMs?: number;
}

/**
 * Create a jitter-buffered AudioWorklet PCM player with pause/resume.
 *
 * Feed it raw PCM16 / 24 kHz / mono via `enqueue()`; it handles prebuffering,
 * gapless playback, and graceful underrun. Reuse it inside a hosted
 * {@link SpeechEngine} so streamed TTS plays smoothly:
 *
 * @example
 * import { createPcmStreamPlayer } from '@runtypelabs/persona/voice-worklet-player'
 * const player = await createPcmStreamPlayer({ prebufferMs: 500 })
 * // for each streamed chunk: player.enqueue(pcmChunk)
 * player.markStreamEnd()
 */
export async function createPcmStreamPlayer(
  options: PcmStreamPlayerOptions = {},
): Promise<PcmStreamPlayer> {
  const prebufferMs = options.prebufferMs ?? DEFAULT_PREBUFFER_MS;
  const waterlineSamples = Math.max(
    1,
    Math.round((PLAYBACK_SAMPLE_RATE * prebufferMs) / 1000),
  );

  const AudioCtx =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  // Match the context rate to the PCM rate so the worklet maps samples 1:1;
  // the browser resamples to the hardware rate at the output.
  const context: AudioContext = new AudioCtx({ sampleRate: PLAYBACK_SAMPLE_RATE });
  if (context.state === "suspended") {
    await context.resume().catch(() => {});
  }

  const moduleUrl = URL.createObjectURL(
    new Blob([WORKLET_SOURCE], { type: "application/javascript" }),
  );
  try {
    await context.audioWorklet.addModule(moduleUrl);
  } catch (err) {
    context.close().catch(() => {});
    throw err;
  } finally {
    URL.revokeObjectURL(moduleUrl);
  }

  const node = new AudioWorkletNode(context, "persona-pcm-player", {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    processorOptions: { waterlineSamples },
  });
  node.connect(context.destination);

  let finishedCallbacks: (() => void)[] = [];
  let startedCallbacks: (() => void)[] = [];
  // Carry an orphaned odd byte across chunks so a sample split at a frame
  // boundary isn't dropped.
  let remainder: Uint8Array | null = null;

  node.port.onmessage = (e: MessageEvent) => {
    const type = e.data?.type;
    if (type === "started") {
      const cbs = startedCallbacks.slice();
      startedCallbacks = [];
      cbs.forEach((cb) => cb());
    } else if (type === "drained") {
      const cbs = finishedCallbacks.slice();
      finishedCallbacks = [];
      cbs.forEach((cb) => cb());
    }
  };

  return {
    enqueue(pcm: Uint8Array) {
      let data = pcm;
      if (remainder) {
        const merged = new Uint8Array(remainder.length + pcm.length);
        merged.set(remainder);
        merged.set(pcm, remainder.length);
        data = merged;
        remainder = null;
      }
      if (data.length % 2 !== 0) {
        remainder = new Uint8Array([data[data.length - 1]]);
        data = data.subarray(0, data.length - 1);
      }
      if (data.length === 0) return;
      const samples = pcm16ToFloat32(data);
      if (samples.length === 0) return;
      node.port.postMessage({ type: "push", samples }, [samples.buffer]);
    },
    markStreamEnd() {
      node.port.postMessage({ type: "eos" });
    },
    flush() {
      remainder = null;
      finishedCallbacks = [];
      startedCallbacks = [];
      node.port.postMessage({ type: "clear" });
    },
    onFinished(callback: () => void) {
      finishedCallbacks.push(callback);
    },
    onStarted(callback: () => void) {
      startedCallbacks.push(callback);
    },
    pause() {
      // Suspending the context freezes the audio clock; queued samples stay put
      // and resume() continues exactly where playback left off.
      if (context.state === "running") void context.suspend();
    },
    resume() {
      if (context.state === "suspended") void context.resume();
    },
    destroy() {
      node.port.onmessage = null;
      try {
        node.disconnect();
      } catch {
        // ignore
      }
      return context.close().catch(() => {});
    },
  };
}

/**
 * Realtime-named alias of {@link createPcmStreamPlayer} (default prebuffer),
 * typed as a plain {@link VoicePlaybackEngine}. Pass it to the realtime voice
 * provider's `createPlaybackEngine`:
 *
 * @example
 * import { createWorkletPlaybackEngine } from '@runtypelabs/persona/voice-worklet-player'
 *
 * initAgentWidget({ config: { voiceRecognition: { enabled: true, provider: {
 *   type: 'runtype',
 *   runtype: { agentId, createPlaybackEngine: createWorkletPlaybackEngine },
 * } } } })
 */
export function createWorkletPlaybackEngine(): Promise<VoicePlaybackEngine> {
  return createPcmStreamPlayer();
}
