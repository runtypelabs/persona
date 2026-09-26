// Drives the AudioWorklet processor source directly (no Web Audio): these tests
// assert what each render quantum outputs, which is where the prebuffer lives.
import { describe, it, expect } from "vitest";
import { WORKLET_SOURCE } from "./worklet-playback-engine";

type Processor = {
  port: { onmessage: (e: { data: unknown }) => void; posted: unknown[] };
  process(inputs: unknown, outputs: Float32Array[][]): boolean;
};

function createProcessor(waterlineSamples: number): Processor {
  let ctor: (new (options: unknown) => Processor) | null = null;
  class FakeAudioWorkletProcessor {
    port = {
      onmessage: (() => {}) as (e: { data: unknown }) => void,
      posted: [] as unknown[],
      postMessage(msg: unknown) {
        this.posted.push(msg);
      },
    };
  }
  new Function("AudioWorkletProcessor", "registerProcessor", WORKLET_SOURCE)(
    FakeAudioWorkletProcessor,
    (_name: string, c: new (options: unknown) => Processor) => {
      ctor = c;
    },
  );
  return new ctor!({ processorOptions: { waterlineSamples } });
}

const QUANTUM = 128;
const send = (p: Processor, data: unknown) => p.port.onmessage({ data });
const push = (p: Processor, n: number) =>
  send(p, { type: "push", samples: new Float32Array(n).fill(0.5) });
function render(p: Processor): Float32Array {
  const out = new Float32Array(QUANTUM);
  p.process([], [[out]]);
  return out;
}
const audible = (out: Float32Array) => out.filter((v) => v !== 0).length;

describe("worklet PCM player processor", () => {
  it("holds a tail below the waterline until eos when not continuous", () => {
    const p = createProcessor(400);
    push(p, 100);
    for (let i = 0; i < 10; i++) expect(audible(render(p))).toBe(0);
    send(p, { type: "eos" });
    expect(audible(render(p))).toBe(100);
  });

  it("continuous mode releases a held tail after one waterline of quiet", () => {
    const p = createProcessor(300);
    send(p, { type: "continuous", enabled: true });
    push(p, 100);
    expect(audible(render(p))).toBe(0); // 128 quiet samples < 300
    expect(audible(render(p))).toBe(0); // 256 < 300
    expect(audible(render(p))).toBe(100); // 384 >= 300: tail plays
  });

  it("continuous mode keeps prebuffering while input keeps arriving, and stays usable", () => {
    const p = createProcessor(300);
    send(p, { type: "continuous", enabled: true });
    push(p, 100);
    render(p);
    render(p);
    push(p, 100); // new input restarts the quiet window
    expect(audible(render(p))).toBe(0);
    push(p, 200); // crosses the waterline
    expect(audible(render(p))).toBe(QUANTUM);
    render(p);
    render(p);
    expect(audible(render(p))).toBe(400 - 3 * QUANTUM); // drained; the processor waits again

    push(p, 50); // the next reply's short burst still plays
    render(p);
    render(p);
    expect(audible(render(p))).toBe(50);
    // No eos was ever sent, so no drained message was posted.
    expect(p.port.posted).not.toContainEqual({ type: "drained" });
  });
});
