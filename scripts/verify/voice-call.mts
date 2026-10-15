// Scripted voice-call server for the verify skill (Node 24 runs this .mts directly).
// Wraps e2e/fixtures/fake-voice-server.ts (the Playwright suite's fake of core's
// voice socket) and plays one scripted turn per call:
//   1. wait for real mic PCM from the widget (proves fake-mic -> capture -> socket)
//   2. stream the user transcript, then the assistant transcript plus synthesized
//      reply speech (PCM16 24 kHz) in real-time frames
//   3. write call-<n>.json (frames both ways, timings) and call-<n>-mic.wav (what
//      the server actually heard) to --out
// Usage: node scripts/verify/voice-call.mts --out <dir> [--user <text>] [--reply <text>]
//        [--mic-min-ms 3500] [--modern]   (default is a legacy server: no client delegation)
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFakeVoiceServer, type FakeVoiceCall } from "../../e2e/fixtures/fake-voice-server.ts";
import { wavFromPcm16 } from "./lib.mjs";

const argv = process.argv.slice(2);
const flag = (name: string, fallback?: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
if (argv.includes("--help")) {
  console.log(readFileSync(new URL(import.meta.url)).toString().split("\n").filter((l) => l.startsWith("//")).join("\n"));
  process.exit(0);
}
const out = flag("out");
if (!out) {
  console.error("voice-call: --out <dir> is required (control-persona.mjs voice-server passes the run dir)");
  process.exit(2);
}
const userText = flag("user", "What are your opening hours?")!;
const replyText = flag("reply", "We're open Monday to Friday from eight to six.")!;
const micMinMs = Number(flag("mic-min-ms", "3500"));
mkdirSync(out, { recursive: true });

function synthesize(text: string): Buffer | null {
  const dir = join(tmpdir(), `persona-voice-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  const raw = join(dir, "reply.pcm");
  try {
    const src = join(dir, "reply.aiff");
    const say = spawnSync("say", ["-o", src, text]);
    const input = say.status === 0 ? src : null;
    const espeak = input ? null : spawnSync("espeak-ng", ["-w", join(dir, "reply.wav"), text]);
    const file = input ?? (espeak?.status === 0 ? join(dir, "reply.wav") : null);
    if (!file) return null;
    const ff = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-i", file, "-ar", "24000", "-ac", "1", "-f", "s16le", raw]);
    return ff.status === 0 ? readFileSync(raw) : null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const replyPcm = synthesize(replyText);
const server = await startFakeVoiceServer({ legacy: !argv.includes("--modern") });
const t0 = Date.now();
console.log(JSON.stringify({ event: "ready", host: server.host, replyAudio: replyPcm ? "speech" : "tone" }));
writeFileSync(join(out, "voice-server.json"), JSON.stringify({ host: server.host, pid: process.pid }, null, 2));

async function play(call: FakeVoiceCall, n: number) {
  const timings: Record<string, number> = {};
  const at = (k: string) => (timings[k] = Date.now() - t0);
  await call.ready;
  at("sessionConfigSent");
  // 16 kHz PCM16 mono = 32 bytes per ms of audio.
  const deadline = Date.now() + 10_000;
  while (call.micPcm().length < micMinMs * 32 && Date.now() < deadline) await sleep(50);
  at("micAudioReceived");
  await call.utterance({ role: "user", turnId: `in_${n}`, text: userText, startMs: 500 });
  at("userTranscriptFinal");
  const speaking = replyPcm ? call.sendPcm(replyPcm) : call.sendAudio(1500);
  at("replyAudioStart");
  await call.utterance({ role: "assistant", turnId: `out_${n}`, text: replyText, startMs: 3000, gapMs: 120 });
  await speaking;
  at("replyAudioEnd");
  return timings;
}

const dump = (call: FakeVoiceCall, n: number, timings: Record<string, number>, closeCode?: number) => {
  const mic = call.micPcm();
  writeFileSync(join(out, `call-${n}-mic.wav`), wavFromPcm16(mic, 16_000));
  writeFileSync(
    join(out, `call-${n}.json`),
    JSON.stringify(
      {
        url: call.url.pathname + call.url.search.replace(/token=[^&]+/, "token=…"),
        script: { userText, replyText, replyAudio: replyPcm ? "speech" : "tone", replyAudioMs: replyPcm ? Math.round(replyPcm.length / 48) : 1500 },
        micReceived: { frames: call.binaryFrames, ms: Math.round(mic.length / 32) },
        timingsMs: timings,
        clientFrames: call.frames,
        rejected: call.rejected,
        closeCode: closeCode ?? null,
      },
      null,
      2,
    ),
  );
};

for (let n = 1; ; n += 1) {
  const call = await server.nextCall(24 * 60 * 60 * 1000);
  console.log(JSON.stringify({ event: "call", n }));
  void (async () => {
    let timings: Record<string, number> = {};
    try {
      timings = await play(call, n);
    } catch (error) {
      timings.error = -1;
      console.log(JSON.stringify({ event: "error", n, message: String(error) }));
    }
    dump(call, n, timings);
    const code = await call.closed;
    dump(call, n, timings, code);
    console.log(JSON.stringify({ event: "closed", n, code }));
  })();
}
