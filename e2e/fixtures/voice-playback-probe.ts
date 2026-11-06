import { expect, type Page, type TestInfo } from "@playwright/test";
import type { FakeVoiceCall } from "./fake-voice-server";

interface PlaybackProbe {
  received: number;
  clears: number;
  sources: number;
  start(): Promise<void>;
  advance(): Promise<void>;
  finish(): Promise<number[]>;
}

declare global {
  interface Window {
    __voicePlaybackProbe: PlaybackProbe;
  }
}

/** Keep the widget and socket real; replace only the speaker clock with native offline rendering. */
export async function installPlaybackProbe(page: Page, stops: number[]): Promise<void> {
  await page.addInitScript((times) => {
    const context = new OfflineAudioContext(1, 24_000 * 2, 24_000);
    const resume = context.resume.bind(context);
    const pauses = times.map((time) => context.suspend(time));
    let index = 0;
    let rendered: Promise<AudioBuffer>;
    const probe: PlaybackProbe = {
      received: 0,
      clears: 0,
      sources: 0,
      async start() {
        rendered = context.startRendering();
        await pauses[0];
      },
      async advance() {
        const paused = pauses[++index];
        if (!paused) throw new Error("No next audio-clock stop");
        await resume();
        await paused;
      },
      async finish() {
        if (index !== pauses.length - 1) throw new Error("Unvisited audio-clock stop");
        await resume();
        return Array.from((await rendered).getChannelData(0));
      },
    };
    // WHY(e2e/specs/30-voice-playback.spec.ts): only the test driver advances the offline speaker clock.
    context.resume = async () => {};
    Object.defineProperty(context, "close", { value: async () => {} });
    const createSource = context.createBufferSource.bind(context);
    context.createBufferSource = () => {
      probe.sources++;
      return createSource();
    };
    window.AudioContext = new Proxy(window.AudioContext, {
      construct(target, args) {
        return args[0]?.sampleRate === 24_000 ? context : Reflect.construct(target, args);
      },
    });
    window.WebSocket = new Proxy(window.WebSocket, {
      construct(target, args) {
        const socket = Reflect.construct(target, args) as WebSocket;
        if (new URL(socket.url).pathname.endsWith("/voice")) {
          socket.addEventListener("message", (event) => {
            if (typeof event.data !== "string") probe.received++;
            else if (JSON.parse(event.data).type === "audio_clear") probe.clears++;
          });
        }
        return socket;
      },
    });
    window.__voicePlaybackProbe = probe;
  }, stops);
}

/** Constant-valued PCM tags make lost, duplicated, reordered, or interrupted samples observable. */
export async function deliverPcm(page: Page, call: FakeVoiceCall, ms: number, amplitude = 0.25): Promise<void> {
  const count = await page.evaluate(() => window.__voicePlaybackProbe.received);
  const pcm = Buffer.alloc(ms * 24 * 2);
  for (let i = 0; i < pcm.length; i += 2) pcm.writeInt16LE(amplitude * 32768, i);
  call.sendPcmFrame(pcm);
  await expect.poll(() => page.evaluate(() => window.__voicePlaybackProbe.received)).toBe(count + 1);
}

export interface AudioRun {
  amplitude: number;
  startSample: number;
  samples: number;
}

/** Measure the rendered waveform, not the player's scheduling calls. */
export async function finishPlayback(page: Page, testInfo: TestInfo): Promise<AudioRun[]> {
  const samples = await page.evaluate(() => window.__voicePlaybackProbe.finish());
  const runs: AudioRun[] = [];
  for (let i = 0; i < samples.length; i++) {
    const amplitude = samples[i];
    if (Math.abs(amplitude) < 0.00001) continue;
    const last = runs.at(-1);
    if (last && last.amplitude === amplitude && last.startSample + last.samples === i) last.samples++;
    else runs.push({ amplitude, startSample: i, samples: 1 });
  }
  const wav = Buffer.alloc(44 + samples.length * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(24_000, 24);
  wav.writeUInt32LE(48_000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((sample, i) => wav.writeInt16LE(Math.round(sample * 32767), 44 + i * 2));
  await testInfo.attach("rendered-playback.wav", { body: wav, contentType: "audio/wav" });
  await testInfo.attach("rendered-playback.json", { body: JSON.stringify(runs), contentType: "application/json" });
  return runs;
}
