#!/usr/bin/env node
// control-persona: the lever behind .claude/skills/verify. Launches the showcase
// (apps/web, widget from source) on an owned port, drives it through one
// agent-browser session, captures evidence into .verify/runs/<id>/evidence/, and
// publishes that evidence to a PR. Run with --help for commands.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  REPORT_MARKER,
  buildPageUrl,
  chromiumArgs,
  parseArgs,
  renderReport,
  slug,
  voiceLatencies,
  wordErrorRate,
} from "./lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const VERIFY_DIR = path.resolve(process.env.PERSONA_VERIFY_DIR ?? path.join(ROOT, ".verify"));
const CURRENT = path.join(VERIFY_DIR, "current.json");
const EVIDENCE_BRANCH = "verify-evidence";

const HELP = `control-persona: drive the Persona showcase for verification (see .claude/skills/verify/SKILL.md)

  launch [--port N]                       start apps/web (vite dev, widget from source) on an owned port
  doctor                                  read-only health check of the current run; prints a remedy per failure
  open [page] [opts]                      (re)launch the browser session and load a page
        page: verify (default) | voice-e2e | any apps/web page name | absolute URL
        --scenario echo|markdown|tool|reasoning|approval|error   --mode inline|launcher
        --theme light|dark   --config '<json>'   --viewport 1100x900   --headed
        --voice browser      mock Web Speech recognition + speechSynthesis (verify page)
        --voice runtype      fake mic WAV -> real capture -> scripted voice socket (voice-e2e page)
        --speak "<text>"     what the fake mic says (default "What are your opening hours?")
        --mic-wav <file>     use an existing 48 kHz mono PCM16 WAV as the mic
        --mic-device         feed the WAV through Chromium's fake capture device (starts at launch) instead of on getUserMedia
  ab <agent-browser args...>              run agent-browser against this run's session
  shot <feature> <label> [--note s] [--full]          screenshot + ARIA snapshot into evidence
  record start <feature> <label> | record stop        video (.webm) + contact sheet + .gif
  capture <feature> <label> [--expect-reply s]        page side effects (requests, events) and, on voice
                                                      pages, timeline, latencies, captured audio + plots
  verdict <feature> pass|fail|skip [note]             record the outcome for the report table
  voice-server start [--user s] [--reply s] | stop    scripted voice socket (open --voice runtype starts it)
  mic-wav "<text>" [--out file]           synthesize a fake-mic WAV (macOS say or espeak-ng, plus ffmpeg)
  report [--title s]                      write evidence/README.md from the manifest
  publish --pr N [--dry-run] [--title s]  push evidence to the ${EVIDENCE_BRANCH} branch and upsert one PR comment
  cleanup                                 close the browser, stop processes this run started; keeps evidence
  status                                  print the current run state

Every command accepts --json. Evidence lives in .verify/runs/<id>/evidence/ (gitignored) and survives cleanup.`;

// ---------------------------------------------------------------- utilities

const args = parseArgs(process.argv.slice(2), ["json", "headed", "full", "dry-run", "help", "modern", "allow-merged", "mic-device", "delegation"]);
const [command, ...rest] = args._;
const asJson = Boolean(args.json);

class Fail extends Error {
  constructor(message, remedy) {
    super(message);
    this.remedy = remedy;
  }
}

function emit(human, data) {
  if (asJson) console.log(JSON.stringify(data ?? { ok: true, message: human }, null, 2));
  else if (human) console.log(human);
}

function run(cmd, argv, opts = {}) {
  const res = spawnSync(cmd, argv, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts });
  if (res.error?.code === "ENOENT") throw new Fail(`${cmd} not found on PATH`, remedyFor(cmd));
  return { ok: res.status === 0, status: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

function must(cmd, argv, opts) {
  const res = run(cmd, argv, opts);
  if (!res.ok) throw new Fail(`${cmd} ${argv.join(" ")} failed: ${(res.stderr || res.stdout).trim().slice(0, 600)}`);
  return res.stdout;
}

function remedyFor(cmd) {
  return (
    {
      "agent-browser": "npm i -g agent-browser && agent-browser install",
      ffmpeg: "brew install ffmpeg (macOS) or apt-get install ffmpeg",
      gh: "brew install gh && gh auth login",
      "whisper-cli": "optional: brew install whisper-cpp and set PERSONA_VERIFY_WHISPER_MODEL=<ggml model path>",
    }[cmd] ?? `install ${cmd}`
  );
}

const has = (cmd) => spawnSync("sh", ["-c", `command -v ${cmd}`], { encoding: "utf8" }).status === 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}
const writeJson = (file, data) => fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);

function loadState({ required = true } = {}) {
  const pointer = readJson(CURRENT);
  const state = pointer && readJson(path.join(pointer.runDir, "state.json"));
  if (!state && required) throw new Fail("no active verify run", "node scripts/verify/control-persona.mjs launch");
  return state;
}
const saveState = (state) => writeJson(path.join(state.runDir, "state.json"), state);
const evidenceDir = (state) => path.join(state.runDir, "evidence");
const manifestPath = (state) => path.join(evidenceDir(state), "manifest.json");
const loadManifest = (state) => readJson(manifestPath(state), { entries: [], verdicts: [] });

function sourceIdentity() {
  const head = run("git", ["rev-parse", "HEAD"]).stdout.trim();
  const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim();
  const status = run("git", ["status", "--porcelain"]).stdout;
  const diff = run("git", ["diff", "HEAD"]).stdout;
  return {
    head,
    branch,
    dirty: status.trim().length > 0,
    diffHash: createHash("sha256").update(status).update(diff).digest("hex").slice(0, 12),
  };
}

function addEntry(state, entry) {
  const manifest = loadManifest(state);
  const id = sourceIdentity();
  manifest.entries.push({ ...entry, at: new Date().toISOString(), head: id.head, diffHash: id.diffHash });
  writeJson(manifestPath(state), manifest);
}

function nextPrefix(state, feature, label) {
  // A running recording already holds the next number.
  const n = loadManifest(state).entries.length + (state.recording ? 2 : 1);
  return `${String(n).padStart(2, "0")}-${slug(feature)}-${slug(label)}`;
}

async function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.listen(port, "127.0.0.1", () => srv.close(() => resolve(true)));
  });
}

async function waitFor(fn, timeoutMs, what) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {}
    if (Date.now() > deadline) throw new Fail(`timed out after ${timeoutMs} ms waiting for ${what}`);
    await sleep(300);
  }
}

function spawnGroup(cmd, argv, logFile, extraEnv = {}) {
  const fd = fs.openSync(logFile, "a");
  const child = spawn(cmd, argv, { cwd: ROOT, detached: true, stdio: ["ignore", fd, fd], env: { ...process.env, ...extraEnv } });
  child.unref();
  fs.closeSync(fd);
  return { pid: child.pid, pgid: child.pid, log: logFile };
}

async function stopGroup(proc, label) {
  if (!proc?.pgid || !alive(proc.pid)) return `${label}: not running`;
  // Only signal a group this run started: the leader must still be the recorded pid.
  const pgid = run("ps", ["-o", "pgid=", "-p", String(proc.pid)]).stdout.trim();
  if (Number(pgid) !== proc.pgid) return `${label}: pid ${proc.pid} no longer leads group ${proc.pgid}; left alone`;
  process.kill(-proc.pgid, "SIGTERM");
  for (let i = 0; i < 20 && alive(proc.pid); i += 1) await sleep(250);
  if (alive(proc.pid)) process.kill(-proc.pgid, "SIGKILL");
  return `${label}: stopped (pgid ${proc.pgid})`;
}

// ---------------------------------------------------------------- browser

function ab(state, argv, opts = {}) {
  if (!state.browser?.session) throw new Fail("no browser session in this run", "control-persona open");
  return run("agent-browser", ["--session", state.browser.session, ...argv], opts);
}

function abJson(state, argv) {
  const res = ab(state, ["--json", ...argv]);
  let parsed = null;
  try {
    parsed = JSON.parse(res.stdout);
  } catch {}
  if (!res.ok || parsed?.success === false) {
    throw new Fail(`agent-browser ${argv[0]} failed: ${parsed?.error ?? (res.stderr || res.stdout).trim().slice(0, 400)}`);
  }
  return parsed?.data ?? {};
}

function pageScript(state, js) {
  const data = abJson(state, ["eval", "-b", Buffer.from(js).toString("base64")]);
  return data.result ?? data.value ?? data;
}

// ---------------------------------------------------------------- audio

function synthesizeMicWav(text, out) {
  const tmp = `${out}.src.aiff`;
  let src = null;
  if (has("say") && run("say", ["-v", "Samantha", "-o", tmp, text]).ok) src = tmp;
  else if (has("say") && run("say", ["-o", tmp, text]).ok) src = tmp;
  else if (has("espeak-ng") && run("espeak-ng", ["-w", `${out}.src.wav`, text]).ok) src = `${out}.src.wav`;
  if (!src) throw new Fail("no speech synthesizer found", "macOS has `say`; on Linux apt-get install espeak-ng");
  // 1.5 s lead-in (the socket opens after the mic does) and an 8 s silent tail so VAD ends the turn.
  must("ffmpeg", ["-loglevel", "error", "-y", "-i", src, "-af", "adelay=1500|1500,apad=pad_dur=8", "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", out]);
  fs.rmSync(src, { force: true });
  return out;
}

function audioStats(file) {
  const res = run("ffmpeg", ["-hide_banner", "-i", file, "-af", "volumedetect", "-f", "null", "-"]);
  const text = res.stderr;
  const num = (re) => {
    const m = text.match(re);
    return m ? Number(m[1]) : null;
  };
  const dur = text.match(/Duration: (\d+):(\d+):([\d.]+)/);
  return {
    durationMs: dur ? Math.round((Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3])) * 1000) : null,
    meanDb: num(/mean_volume: (-?[\d.]+) dB/),
    maxDb: num(/max_volume: (-?[\d.]+) dB/),
  };
}

function plotAudio(wav, png) {
  must("ffmpeg", [
    "-loglevel", "error", "-y", "-i", wav,
    "-filter_complex",
    // Waveform over spectrogram. No drawtext (many ffmpeg builds lack freetype); the report captions it.
    "[0:a]aformat=channel_layouts=mono,asplit[a][b];[a]showwavespic=s=1200x160:colors=0x2563eb[w];[b]showspectrumpic=s=1200x300:legend=0:color=intensity[s];[w][s]vstack=inputs=2",
    "-frames:v", "1", png,
  ]);
}

function transcribe(wav) {
  const model = process.env.PERSONA_VERIFY_WHISPER_MODEL;
  if (!model || !has("whisper-cli")) return null;
  const wav16 = `${wav}.16k.wav`;
  must("ffmpeg", ["-loglevel", "error", "-y", "-i", wav, "-ar", "16000", "-ac", "1", wav16]);
  const res = run("whisper-cli", ["-m", model, "-f", wav16, "-nt", "-np"]);
  fs.rmSync(wav16, { force: true });
  return res.ok ? res.stdout.replace(/\s+/g, " ").trim() : null;
}

async function startVoiceServer(state, { user, reply, modern } = {}) {
  if (state.voiceServer && alive(state.voiceServer.pid)) return state.voiceServer;
  const out = path.join(state.runDir, "voice");
  fs.mkdirSync(out, { recursive: true });
  // A new server numbers calls from 1 again: drop the previous server's files (captures already copied them).
  for (const f of fs.readdirSync(out)) if (/^(voice-server\.json|call-\d+(-mic\.wav|\.json))$/.test(f)) fs.rmSync(path.join(out, f));
  const argv = [path.join(HERE, "voice-call.mts"), "--out", out];
  if (typeof user === "string") argv.push("--user", user);
  if (typeof reply === "string") argv.push("--reply", reply);
  if (modern) argv.push("--modern");
  const proc = spawnGroup(process.execPath, argv, path.join(state.runDir, "voice-server.log"));
  const info = await waitFor(() => readJson(path.join(out, "voice-server.json")), 15_000, "voice server ready");
  state.voiceServer = { ...proc, host: info.host, out, user: user ?? null, reply: reply ?? null };
  saveState(state);
  return state.voiceServer;
}

// ---------------------------------------------------------------- commands

const commands = {
  async launch() {
    const prev = loadState({ required: false });
    if (prev && !prev.stoppedAt && alive(prev.server?.pid)) {
      throw new Fail(`run ${prev.runId} is still live at ${prev.server.url}`, "control-persona cleanup (or keep using it)");
    }
    let port = args.port ? Number(args.port) : null;
    if (port && !(await portFree(port))) throw new Fail(`port ${port} is in use`, "pick another --port; never take over a server this run did not start");
    if (!port) {
      for (let p = 4390; p < 4420 && !port; p += 1) if (await portFree(p)) port = p;
    }
    if (!port) throw new Fail("no free port in 4390-4419", "pass --port N");
    if (!fs.existsSync(path.join(ROOT, "apps/web/node_modules"))) {
      throw new Fail("apps/web dependencies are missing", "pnpm install --frozen-lockfile (add --ignore-scripts if a native postinstall such as sharp fails)");
    }
    const runId = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
    const runDir = path.join(VERIFY_DIR, "runs", runId);
    fs.mkdirSync(path.join(runDir, "evidence"), { recursive: true });
    const url = `http://127.0.0.1:${port}`;
    const server = spawnGroup("pnpm", ["--filter", "web", "exec", "vite", "--port", String(port), "--strictPort", "--host", "127.0.0.1"], path.join(runDir, "vite.log"));
    const state = { runId, runDir, root: ROOT, createdAt: new Date().toISOString(), identity: sourceIdentity(), server: { ...server, port, url }, browser: null, voiceServer: null, recording: null };
    saveState(state);
    writeJson(CURRENT, { runId, runDir });
    writeJson(manifestPath(state), { runId, entries: [], verdicts: [] });
    await waitFor(async () => {
      if (!alive(server.pid)) throw new Fail(`vite exited; see ${server.log}`);
      const res = await fetch(`${url}/verify.html`);
      return res.ok && (await res.text()).includes("verify-fixture");
    }, 90_000, `${url}/verify.html`).catch((error) => {
      throw new Fail(`${error.message}\n${fs.readFileSync(server.log, "utf8").slice(-1500)}`, `inspect ${server.log}; then control-persona cleanup`);
    });
    emit(`launched run ${runId}\n  server   ${url} (pgid ${server.pgid}, log ${server.log})\n  fixture  ${url}/verify.html\n  evidence ${evidenceDir(state)}`, { ok: true, runId, url, evidence: evidenceDir(state), pgid: server.pgid });
  },

  async doctor() {
    const checks = [];
    const check = (name, ok, detail, remedy) => checks.push({ name, ok, detail, ...(ok ? {} : { remedy }) });
    const state = loadState({ required: false });
    check("run", Boolean(state), state ? `${state.runId} (${state.runDir})` : "no current run", "control-persona launch");
    check("agent-browser", has("agent-browser"), has("agent-browser") ? run("agent-browser", ["--version"]).stdout.trim() : "missing", remedyFor("agent-browser"));
    check("ffmpeg", has("ffmpeg"), has("ffmpeg") ? "present" : "missing (video gifs and voice plots need it)", remedyFor("ffmpeg"));
    if (state) {
      const up = alive(state.server.pid);
      check("server process", up, `pid ${state.server.pid}`, "control-persona cleanup && control-persona launch");
      const listeners = run("lsof", ["-nP", `-iTCP:${state.server.port}`, "-sTCP:LISTEN", "-t"]).stdout.split(/\s+/).filter(Boolean);
      const groups = listeners.map((pid) => Number(run("ps", ["-o", "pgid=", "-p", pid]).stdout.trim()));
      const owned = listeners.length > 0 && groups.every((g) => g === state.server.pgid);
      check("port owned", owned, `:${state.server.port} listeners ${listeners.join(",") || "none"} (pgid ${groups.join(",") || "-"}, ours ${state.server.pgid})`, "another process holds the port: control-persona cleanup, then launch on a different --port");
      if (listeners[0]) {
        const cwd = (run("lsof", ["-a", "-p", listeners[0], "-d", "cwd", "-Fn"]).stdout.match(/^n(.*)$/m) ?? [])[1] ?? "?";
        check("serves this checkout", cwd.startsWith(ROOT), `server cwd ${cwd}`, `the server is not this checkout (${ROOT}); cleanup and relaunch from here`);
      }
      let fixture = false;
      try {
        const res = await fetch(`${state.server.url}/verify.html`);
        fixture = res.ok && (await res.text()).includes("verify-fixture");
      } catch {}
      check("fixture served", fixture, `${state.server.url}/verify.html`, `see ${state.server.log}`);
      const now = sourceIdentity();
      check("source identity", true, `${now.branch}@${now.head.slice(0, 10)}${now.dirty ? ` dirty:${now.diffHash}` : ""}${now.head !== state.identity.head ? ` (launched at ${state.identity.head.slice(0, 10)}; vite serves live source, evidence records the revision per capture)` : ""}`);
      if (state.browser) {
        const res = ab(state, ["--json", "get", "url"]);
        check("browser session", res.ok, res.ok ? `${state.browser.session} at ${JSON.parse(res.stdout).data?.url ?? "?"}` : res.stderr.trim(), "control-persona open");
      }
      if (state.voiceServer) check("voice server", alive(state.voiceServer.pid), `${state.voiceServer.host} (pid ${state.voiceServer.pid})`, "control-persona voice-server start");
    }
    const failed = checks.filter((c) => !c.ok);
    if (asJson) console.log(JSON.stringify({ ok: failed.length === 0, checks }, null, 2));
    else for (const c of checks) console.log(`${c.ok ? "ok  " : "FAIL"} ${c.name.padEnd(20)} ${c.detail ?? ""}${c.ok ? "" : `\n     remedy: ${c.remedy}`}`);
    if (failed.length) process.exitCode = 1;
  },

  async "voice-server"() {
    const state = loadState();
    if ((rest[0] ?? "start") === "stop") {
      emit(await stopGroup(state.voiceServer, "voice server"));
      state.voiceServer = null;
      saveState(state);
      return;
    }
    const server = await startVoiceServer(state, { user: args.user, reply: args.reply, modern: args.modern });
    emit(`voice server up at ${server.host} (pgid ${server.pgid}); calls are written to ${server.out}`, { ok: true, ...server });
  },

  async "mic-wav"() {
    const text = rest.join(" ") || "What are your opening hours?";
    const state = loadState({ required: false });
    const out = path.resolve(args.out ?? path.join(state ? evidenceDir(state) : VERIFY_DIR, `mic-${slug(text)}.wav`));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    synthesizeMicWav(text, out);
    emit(out, { ok: true, file: out, text });
  },

  async open() {
    const state = loadState();
    const voice = args.voice === true ? "browser" : args.voice;
    if (voice && !["browser", "runtype"].includes(voice)) throw new Fail(`unknown --voice ${voice}`, "--voice browser or --voice runtype");
    let page = rest[0] ?? (voice === "runtype" ? "voice-e2e" : "verify");
    let micWav = args["mic-wav"] ? path.resolve(args["mic-wav"]) : null;
    if (voice === "runtype") {
      await startVoiceServer(state, { user: args.user, reply: args.reply, modern: args.modern });
      if (!micWav) {
        const text = typeof args.speak === "string" ? args.speak : "What are your opening hours?";
        micWav = synthesizeMicWav(text, path.join(evidenceDir(state), `mic-${slug(text)}.wav`));
      }
    } else if (state.voiceServer) {
      // A leftover socket would otherwise feed stale call data into this page's captures.
      await stopGroup(state.voiceServer, "voice server");
      state.voiceServer = null;
      saveState(state);
    }
    const url = buildPageUrl(state.server.url, page, {
      scenario: args.scenario,
      mode: args.mode,
      theme: args.theme,
      config: args.config,
      delayMs: args["delay-ms"],
      voice,
      voiceHost: state.voiceServer?.host,
      delegation: Boolean(args.delegation),
    });
    // Launch flags only apply when the session starts, so every open is a fresh session.
    const session = `persona-verify-${state.runId}`;
    if (state.browser) run("agent-browser", ["--session", session, "close"]);
    // Default mic is the clip mode (voice-init.js starts the WAV when getUserMedia
    // is called). --mic-device uses Chromium's fake capture device instead, which
    // starts at browser launch: real device path, but timing-sensitive.
    const micDevice = Boolean(args["mic-device"]) && micWav;
    const launch = ["--session", session, "--args", chromiumArgs({ micWav: micDevice ? micWav : null }).join(",")];
    if (micWav && !micDevice) {
      const micInit = path.join(state.runDir, "mic-init.js");
      fs.writeFileSync(micInit, `window.__personaVoiceMic = "data:audio/wav;base64,${fs.readFileSync(micWav).toString("base64")}";\n`);
      launch.push("--init-script", micInit);
    }
    if (voice) launch.push("--init-script", path.join(HERE, "voice-init.js"));
    if (args.headed) launch.push("--headed");
    const [w, h] = String(args.viewport ?? "1100x900").split("x").map(Number);
    state.browser = { session, url, page, voice: voice ?? null, micWav, headed: Boolean(args.headed) };
    saveState(state);
    const opened = run("agent-browser", [...launch, "open", url]);
    if (!opened.ok) throw new Fail(`agent-browser open failed: ${(opened.stderr || opened.stdout).trim()}`, "agent-browser doctor");
    ab(state, ["set", "viewport", String(w), String(h)]);
    const fixture = /\/(verify|voice-e2e)\.html/.test(url);
    const ready = fixture
      ? ab(state, ["wait", "--fn", "Boolean(window.__personaVerify?.ready || window.__personaE2E)"])
      : ab(state, ["wait", "--load", "networkidle"]);
    if (!ready.ok) throw new Fail(`page never became ready: ${url}`, `control-persona ab console; control-persona ab errors`);
    emit(`session ${session} at ${url}${micWav ? `\n  fake mic: ${micWav}` : ""}${voice ? `\n  voice instrumentation: ${voice}` : ""}\n  drive with: node scripts/verify/control-persona.mjs ab snapshot -i`, { ok: true, session, url, micWav });
  },

  async ab() {
    const state = loadState();
    // Forward raw argv: agent-browser's own flags (--text, --name, ...) must not be parsed here.
    const raw = process.argv.slice(process.argv.indexOf("ab", 2) + 1);
    const res = spawnSync("agent-browser", ["--session", state.browser?.session ?? `persona-verify-${state.runId}`, ...raw], { stdio: "inherit" });
    process.exitCode = res.status ?? 1;
  },

  async shot() {
    const state = loadState();
    const [feature, label] = rest;
    if (!feature || !label) throw new Fail("usage: shot <feature> <label>", "feature is a features/ file name, e.g. approvals");
    const prefix = nextPrefix(state, feature, label);
    const png = path.join(evidenceDir(state), `${prefix}.png`);
    abJson(state, ["screenshot", ...(args.full ? ["--full"] : []), png]);
    const aria = ab(state, ["snapshot", "-c"]).stdout;
    fs.writeFileSync(path.join(evidenceDir(state), `${prefix}.aria.txt`), aria);
    addEntry(state, { feature, label, note: args.note ?? null, files: [`${prefix}.png`, `${prefix}.aria.txt`], url: state.browser.url });
    emit(png, { ok: true, files: [png] });
  },

  async record() {
    const state = loadState();
    const sub = rest[0];
    if (sub === "start") {
      const [, feature, label] = rest;
      if (!feature || !label) throw new Fail("usage: record start <feature> <label>");
      if (state.recording) throw new Fail("a recording is already running", "control-persona record stop");
      const prefix = nextPrefix(state, feature, label);
      const webm = path.join(evidenceDir(state), `${prefix}.webm`);
      abJson(state, ["record", "start", webm, "--contact-sheet"]);
      state.recording = { feature, label, prefix, webm, note: args.note ?? null };
      saveState(state);
      return emit(`recording ${webm}`, { ok: true, file: webm });
    }
    if (sub === "stop") {
      const rec = state.recording;
      if (!rec) throw new Fail("no recording is running", "control-persona record start <feature> <label>");
      abJson(state, ["record", "stop"]);
      state.recording = null;
      saveState(state);
      const files = [`${rec.prefix}.webm`];
      const sheet = `${rec.prefix}.contact-sheet.png`;
      const gif = `${rec.prefix}.gif`;
      if (has("ffmpeg")) {
        must("ffmpeg", ["-loglevel", "error", "-y", "-i", rec.webm, "-vf", "fps=8,scale=720:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer", path.join(evidenceDir(state), gif)]);
        files.unshift(gif);
      }
      if (fs.existsSync(path.join(evidenceDir(state), sheet))) files.push(sheet);
      addEntry(state, { feature: rec.feature, label: rec.label, note: rec.note, files, url: state.browser?.url });
      return emit(files.map((f) => path.join(evidenceDir(state), f)).join("\n"), { ok: true, files });
    }
    throw new Fail("usage: record start <feature> <label> | record stop");
  },

  async capture() {
    const state = loadState();
    const [feature, label] = rest;
    if (!feature || !label) throw new Fail("usage: capture <feature> <label>");
    const prefix = nextPrefix(state, feature, label);
    const dir = evidenceDir(state);
    const raw = pageScript(
      state,
      `(async () => {
        const v = window.__personaVerify;
        const page = v ? { scenario: v.scenario, mode: v.mode, theme: v.theme, voice: v.voice, requests: v.requests, events: v.events } : null;
        const voice = window.__personaVoice ? JSON.parse(await window.__personaVoice.export()) : null;
        return JSON.stringify({ page, voice });
      })()`,
    );
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    const files = [];
    const notes = [];
    if (data.page) {
      writeJson(path.join(dir, `${prefix}.page.json`), data.page);
      files.push(`${prefix}.page.json`);
      notes.push(`${data.page.requests.length} request(s) crossed the network boundary, ${data.page.events.length} controller event(s)`);
    }
    let summary = null;
    if (data.voice) {
      const { audio, ...voice } = data.voice;
      summary = { ...voiceLatencies(voice.timeline), utterances: voice.utterances, sockets: voice.sockets };
      // One track per AudioContext that reached the speakers; silent ones (the mic
      // context's keep-alive) are reported but not plotted.
      summary.outputTracks = [];
      let wav = null;
      for (const track of audio ?? []) {
        if (!has("ffmpeg")) break;
        const webm = path.join(dir, `${prefix}.ctx${track.context}.webm`);
        const out = path.join(dir, `${prefix}.ctx${track.context}.wav`);
        fs.writeFileSync(webm, Buffer.from(track.base64, "base64"));
        must("ffmpeg", ["-loglevel", "error", "-y", "-i", webm, "-ac", "1", "-ar", "24000", out]);
        fs.rmSync(webm);
        const stats = { context: track.context, sampleRate: track.sampleRate, ...audioStats(out) };
        summary.outputTracks.push(stats);
        if (stats.maxDb === null || stats.maxDb < -60 || wav) {
          fs.rmSync(out);
          continue;
        }
        wav = path.join(dir, `${prefix}.output.wav`);
        fs.renameSync(out, wav);
        plotAudio(wav, path.join(dir, `${prefix}.output.png`));
        summary.output = stats;
        files.push(`${prefix}.output.png`, `${prefix}.output.wav`);
        notes.push(`\`output.png\` is the audio the widget played, tapped in-page (waveform over spectrogram): ${stats.durationMs} ms (mean ${stats.meanDb} dB, peak ${stats.maxDb} dB)`);
      }
      if (audio?.length && !wav) notes.push(`audio tap: ${audio.length} context(s) reached the speakers but all were silent`);
      if (wav) {
        const expect = args["expect-reply"] ?? state.voiceServer?.reply ?? null;
        const heard = transcribe(wav);
        if (heard !== null) {
          summary.stt = { heard, expected: expect, wer: expect ? wordErrorRate(expect, heard) : null };
          notes.push(`STT heard "${heard}"${expect ? ` (WER ${summary.stt.wer.toFixed(2)})` : ""}`);
        } else {
          summary.stt = { skipped: "whisper-cli or PERSONA_VERIFY_WHISPER_MODEL not available" };
        }
      }
      if (state.voiceServer && state.browser?.voice === "runtype") {
        const mtime = (f) => fs.statSync(path.join(state.voiceServer.out, f)).mtimeMs;
        const calls = fs.readdirSync(state.voiceServer.out).filter((f) => /^call-\d+\.json$/.test(f)).sort((a, b) => mtime(a) - mtime(b));
        const last = calls.at(-1);
        if (last) {
          const call = readJson(path.join(state.voiceServer.out, last));
          // Written at the end of the scripted turn and again on socket close: capture after
          // hang-up for the full call and its closeCode.
          summary.server = { script: call.script, micReceived: call.micReceived, timingsMs: call.timingsMs, clientFrames: call.clientFrames.map((f) => f.type), closeCode: call.closeCode };
          const micWav = path.join(state.voiceServer.out, last.replace(".json", "-mic.wav"));
          if (fs.existsSync(micWav) && has("ffmpeg") && call.micReceived.ms > 0) {
            fs.copyFileSync(micWav, path.join(dir, `${prefix}.server-heard.wav`));
            plotAudio(micWav, path.join(dir, `${prefix}.server-heard.png`));
            files.push(`${prefix}.server-heard.png`, `${prefix}.server-heard.wav`);
          }
          notes.push(`\`server-heard.png\` is the mic PCM the voice socket received: ${call.micReceived.ms} ms in ${call.micReceived.frames} frames`);
        }
      }
      writeJson(path.join(dir, `${prefix}.voice.json`), { ...summary, timeline: voice.timeline });
      files.push(`${prefix}.voice.json`);
      const lat = Object.entries(summary.latenciesMs).map(([k, v]) => `${k} ${v} ms`);
      if (lat.length) notes.push(lat.join(", "));
      if (voice.utterances.length) notes.push(`speechSynthesis spoke: ${voice.utterances.map((u) => `"${u.text}"`).join(", ")}`);
    }
    if (!files.length) throw new Fail("nothing to capture on this page", "capture works on verify.html and voice pages (open --voice ...)");
    const note = [args.note, ...notes].filter(Boolean).join("; ");
    addEntry(state, { feature, label, note, files, url: state.browser.url });
    emit(`${note}\n${files.map((f) => path.join(dir, f)).join("\n")}`, { ok: true, files, summary });
  },

  async verdict() {
    const state = loadState();
    const [feature, result, ...noteParts] = rest;
    if (!feature || !["pass", "fail", "skip"].includes(result)) throw new Fail("usage: verdict <feature> pass|fail|skip [note]");
    const manifest = loadManifest(state);
    manifest.verdicts = manifest.verdicts.filter((v) => v.feature !== feature);
    manifest.verdicts.push({ feature, pass: result === "pass", skipped: result === "skip", note: noteParts.join(" ") });
    writeJson(manifestPath(state), manifest);
    emit(`${feature}: ${result}`);
  },

  async report() {
    const state = loadState({ required: false }) ?? readJson(path.join(VERIFY_DIR, "runs", String(args.run), "state.json"));
    if (!state) throw new Fail("no run to report on", "control-persona launch (or --run <id>)");
    const manifest = loadManifest(state);
    const md = renderReport({ title: args.title ?? "Persona verification", identity: identityFor(state), entries: manifest.entries, verdicts: manifest.verdicts });
    const file = path.join(evidenceDir(state), "README.md");
    fs.writeFileSync(file, `${md}\n`);
    emit(file, { ok: true, file });
  },

  async publish() {
    const state = loadState({ required: false }) ?? readJson(path.join(VERIFY_DIR, "runs", String(args.run), "state.json"));
    if (!state) throw new Fail("no run to publish", "control-persona launch");
    const pr = Number(args.pr);
    if (!pr) throw new Fail("--pr <number> is required", "gh pr view --json number");
    const info = JSON.parse(must("gh", ["pr", "view", String(pr), "--json", "state,url,headRefName"]));
    const repo = must("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]).trim();
    const manifest = loadManifest(state);
    if (!manifest.entries.length) throw new Fail("the manifest is empty", "capture evidence first (shot / record / capture)");
    const prefix = `pr-${pr}/${state.runId}`;
    const dir = evidenceDir(state);
    const MAX = 20 * 1024 * 1024;
    const files = fs.readdirSync(dir).filter((f) => fs.statSync(path.join(dir, f)).size <= MAX);
    const title = args.title ?? "Persona verification";
    if (args["dry-run"]) {
      const md = renderReport({ title, identity: identityFor(state), entries: manifest.entries, verdicts: manifest.verdicts, assetBase: `https://raw.githubusercontent.com/${repo}/<commit>/${prefix}` });
      const warn = info.state === "OPEN" ? "" : `(PR #${pr} is ${info.state}: a real publish refuses it without --allow-merged)\n`;
      return emit(`${warn}[dry-run] would push ${files.length} file(s) to ${repo}@${EVIDENCE_BRANCH}:${prefix} and upsert this comment on ${info.url}:\n\n${md}`, { ok: true, dryRun: true, files, body: md });
    }
    if (info.state !== "OPEN" && !args["allow-merged"]) throw new Fail(`PR #${pr} is ${info.state}`, "publish to an open PR, or pass --allow-merged to annotate this one anyway");
    let commit = null;
    for (let attempt = 0; attempt < 3 && !commit; attempt += 1) {
      run("git", ["fetch", "--quiet", "origin", `+refs/heads/${EVIDENCE_BRANCH}:refs/remotes/origin/${EVIDENCE_BRANCH}`]);
      const parent = run("git", ["rev-parse", "-q", "--verify", `refs/remotes/origin/${EVIDENCE_BRANCH}^{commit}`]).stdout.trim() || null;
      const index = path.join(state.runDir, `publish.index`);
      fs.rmSync(index, { force: true });
      const env = { ...process.env, GIT_INDEX_FILE: index };
      must("git", parent ? ["read-tree", parent] : ["read-tree", "--empty"], { env });
      const readme = renderReport({ title, identity: identityFor(state), entries: manifest.entries, verdicts: manifest.verdicts });
      const readmeFile = path.join(state.runDir, "publish-README.md");
      fs.writeFileSync(readmeFile, `${readme}\n`);
      for (const [name, source] of [...files.filter((f) => f !== "README.md").map((f) => [f, path.join(dir, f)]), ["README.md", readmeFile]]) {
        const sha = must("git", ["hash-object", "-w", source]).trim();
        must("git", ["update-index", "--add", "--cacheinfo", `100644,${sha},${prefix}/${name}`], { env });
      }
      const tree = must("git", ["write-tree"], { env }).trim();
      fs.rmSync(index, { force: true });
      const created = must("git", ["commit-tree", tree, ...(parent ? ["-p", parent] : []), "-m", `evidence: PR #${pr} run ${state.runId}`]).trim();
      if (run("git", ["push", "--quiet", "origin", `${created}:refs/heads/${EVIDENCE_BRANCH}`]).ok) commit = created;
    }
    if (!commit) throw new Fail(`could not push to ${EVIDENCE_BRANCH} after 3 attempts`, "check push access: git push --dry-run origin HEAD");
    const assetBase = `https://raw.githubusercontent.com/${repo}/${commit}/${prefix}`;
    const browse = `https://github.com/${repo}/tree/${commit}/${prefix}`;
    const body = `${REPORT_MARKER}\n${renderReport({ title, identity: identityFor(state), entries: manifest.entries, verdicts: manifest.verdicts, assetBase })}\n\n<sub>All artifacts (video, audio, JSON): ${browse} · generated by \`.claude/skills/verify\`</sub>\n`;
    const bodyFile = path.join(state.runDir, "publish-comment.md");
    fs.writeFileSync(bodyFile, body);
    const comments = JSON.parse(must("gh", ["api", "--paginate", "--slurp", `repos/${repo}/issues/${pr}/comments`])).flat();
    const existing = comments.find((c) => c.body?.includes(REPORT_MARKER));
    const res = existing
      ? JSON.parse(must("gh", ["api", "-X", "PATCH", `repos/${repo}/issues/comments/${existing.id}`, "-F", `body=@${bodyFile}`]))
      : JSON.parse(must("gh", ["api", "-X", "POST", `repos/${repo}/issues/${pr}/comments`, "-F", `body=@${bodyFile}`]));
    emit(`published ${files.length} file(s) to ${browse}\n${existing ? "updated" : "posted"} ${res.html_url}`, { ok: true, commit, browse, comment: res.html_url });
  },

  async cleanup() {
    const state = loadState({ required: false });
    if (!state) return emit("no current run; nothing to clean up");
    const lines = [];
    if (state.recording) {
      ab(state, ["record", "stop"]);
      lines.push("recording: stopped (kept in evidence)");
    }
    if (state.browser) {
      const res = run("agent-browser", ["--session", state.browser.session, "close"]);
      lines.push(`browser: ${res.ok ? "closed" : "already closed"} (${state.browser.session})`);
    }
    lines.push(await stopGroup(state.voiceServer, "voice server"));
    lines.push(await stopGroup(state.server, "server"));
    state.stoppedAt = new Date().toISOString();
    state.recording = null;
    saveState(state);
    fs.rmSync(CURRENT, { force: true });
    const evidence = fs.existsSync(evidenceDir(state)) ? fs.readdirSync(evidenceDir(state)).length : 0;
    lines.push(`evidence kept: ${evidenceDir(state)} (${evidence} file(s))`);
    emit(lines.join("\n"), { ok: true, evidence: evidenceDir(state), lines });
  },

  async status() {
    const state = loadState({ required: false });
    emit(state ? JSON.stringify(state, null, 2) : "no current run", state ?? { ok: true, run: null });
  },
};

function identityFor(state) {
  const id = sourceIdentity();
  return { ...id, runId: state.runId, server: "apps/web vite dev (widget from source), keyless fixture" };
}

if (!command || args.help || command === "help") {
  console.log(HELP);
} else if (!commands[command]) {
  console.error(`unknown command "${command}"\n\n${HELP}`);
  process.exitCode = 2;
} else {
  try {
    await commands[command]();
  } catch (error) {
    if (asJson) console.log(JSON.stringify({ ok: false, error: error.message, remedy: error.remedy ?? null }, null, 2));
    else console.error(`error: ${error.message}${error.remedy ? `\nremedy: ${error.remedy}` : ""}`);
    process.exitCode = 1;
  }
}
