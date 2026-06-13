// Optional AudioWorklet playback engine for the realtime voice provider.
//
// This is an opt-in alternative to the default `AudioPlaybackManager`. It runs a
// worklet-side sample queue that the audio thread drains continuously, with a
// ~150ms waterline prebuffer that absorbs network jitter (the default engine
// hand-schedules AudioBufferSourceNodes instead, which is simpler but can gap
// under a jittery connection). It is shipped from a separate subpath
// (`@runtypelabs/persona/voice-worklet-player`) so its worklet source stays out
// of the main bundle, and is injected via `runtype.createPlaybackEngine`.

import type { VoicePlaybackEngine } from "../types";

const PLAYBACK_SAMPLE_RATE = 24000;
// Buffer ~150ms before starting playback so jitter doesn't cause mid-word
// dropouts; the worklet re-buffers automatically after an underrun.
const WATERLINE_SAMPLES = 3600;

const WORKLET_SOURCE = `
class RuntypePcmPlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.chunks = []
    this.readOffset = 0
    this.buffered = 0
    this.waiting = true
    // 'drained' must mean "the reply finished playing", not "momentary
    // underrun" — a jitter gap empties the buffer mid-reply too, and firing
    // there would flap the UI status and race the audio_end handler. Only
    // report drained once eos has been signalled.
    this.eosSeen = false
    this.port.onmessage = (e) => {
      const msg = e.data
      if (msg.type === 'push') {
        this.eosSeen = false
        this.chunks.push(msg.samples)
        this.buffered += msg.samples.length
        if (this.waiting && this.buffered >= ${WATERLINE_SAMPLES}) {
          this.waiting = false
        }
      } else if (msg.type === 'eos') {
        this.eosSeen = true
        if (this.waiting && this.buffered > 0) this.waiting = false
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
      }
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
registerProcessor('runtype-pcm-player', RuntypePcmPlayerProcessor)
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

/**
 * Create a jitter-buffered AudioWorklet playback engine.
 *
 * @example
 * import { createWorkletPlaybackEngine } from '@runtypelabs/persona/voice-worklet-player'
 *
 * initAgentWidget({ config: { voiceRecognition: { enabled: true, provider: {
 *   type: 'runtype',
 *   runtype: { agentId, createPlaybackEngine: createWorkletPlaybackEngine },
 * } } } })
 */
export async function createWorkletPlaybackEngine(): Promise<VoicePlaybackEngine> {
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

  const node = new AudioWorkletNode(context, "runtype-pcm-player", {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  });
  node.connect(context.destination);

  let finishedCallbacks: (() => void)[] = [];
  // Carry an orphaned odd byte across chunks so a sample split at a frame
  // boundary isn't dropped.
  let remainder: Uint8Array | null = null;

  node.port.onmessage = (e: MessageEvent) => {
    if (e.data?.type === "drained") {
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
      node.port.postMessage({ type: "clear" });
    },
    onFinished(callback: () => void) {
      finishedCallbacks.push(callback);
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
