// Pure helpers for control-persona.mjs (no I/O, so lib.test.mjs covers them).

export const SCENARIOS = ["echo", "markdown", "tool", "reasoning", "approval", "error"];

/** Parse `cmd sub --flag value --bool positional` into { _: [...], flag: value, bool: true }. */
export function parseArgs(argv, booleans = []) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") {
      out._.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith("--")) {
      const [key, inline] = arg.slice(2).split(/=(.*)/s, 2);
      if (inline !== undefined) out[key] = inline;
      else if (booleans.includes(key) || i + 1 >= argv.length || argv[i + 1].startsWith("--")) out[key] = true;
      else out[key] = argv[(i += 1)];
    } else {
      out._.push(arg);
    }
  }
  return out;
}

/** Lowercase, dash-separated, filesystem- and URL-safe. */
export function slug(text) {
  return (
    String(text)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "step"
  );
}

/**
 * The page URL `open` navigates to. `page` is a showcase page name
 * (`verify`, `approval-demo`, `voice-e2e`), a path, or an absolute URL.
 */
export function buildPageUrl(base, page = "verify", opts = {}) {
  if (/^https?:\/\//.test(page)) return page;
  const path = page.startsWith("/") ? page : `/${page.replace(/\.html$/, "")}.html`;
  const url = new URL(path, base);
  const set = (key, value) => value !== undefined && value !== null && value !== "" && url.searchParams.set(key, String(value));
  if (path === "/verify.html") {
    if (opts.scenario && !SCENARIOS.includes(opts.scenario)) {
      throw new Error(`unknown scenario "${opts.scenario}"; one of: ${SCENARIOS.join(", ")}`);
    }
    set("scenario", opts.scenario);
    set("mode", opts.mode);
    set("theme", opts.theme);
    set("delayMs", opts.delayMs);
    if (opts.voice === "browser") set("voice", "browser");
    if (opts.config) set("config", typeof opts.config === "string" ? opts.config : JSON.stringify(opts.config));
  }
  if (path === "/voice-e2e.html") {
    set("voiceHost", opts.voiceHost);
    if (!opts.delegation) set("clientDelegation", "0");
  }
  return url.toString();
}

/** Chromium args for a verify session. A mic WAV turns on the fake capture device. */
export function chromiumArgs({ micWav } = {}) {
  const args = ["--autoplay-policy=no-user-gesture-required"];
  if (micWav) {
    args.push(
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${micWav}%noloop`,
    );
  }
  return args;
}

/** 44-byte RIFF header + PCM16 mono samples. */
export function wavFromPcm16(pcm, sampleRate) {
  const header = new Uint8Array(44);
  const view = new DataView(header.buffer);
  const ascii = (offset, text) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  ascii(0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true);
  ascii(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length);
  out.set(header, 0);
  out.set(pcm, 44);
  return out;
}

/** Per-feature latencies (ms) from a voice-init.js timeline. Missing marks are omitted. */
export function voiceLatencies(timeline = []) {
  const first = (type, pred = () => true) => timeline.find((e) => e.type === type && pred(e))?.at;
  const micOn = first("mic", (e) => /^recording/.test(e.detail?.state ?? ""));
  const marks = {
    micOn,
    socketOpen: first("ws:open"),
    firstMicFrameSent: first("ws:first-mic-frame-sent"),
    firstTranscript: first("ws:recv", (e) => e.detail?.type === "transcript_update"),
    firstAudioReceived: first("ws:first-audio-received"),
    recognitionFinal: first("recognition:final"),
    ttsStart: first("tts:start"),
  };
  const lat = {};
  const diff = (name, a, b) => {
    if (marks[a] !== undefined && marks[b] !== undefined) lat[name] = marks[b] - marks[a];
  };
  diff("micOnToSocketOpen", "micOn", "socketOpen");
  diff("socketOpenToFirstMicFrame", "socketOpen", "firstMicFrameSent");
  diff("micOnToFirstAudioReceived", "micOn", "firstAudioReceived");
  diff("recognitionFinalToTtsStart", "recognitionFinal", "ttsStart");
  return { marks, latenciesMs: lat };
}

const IMAGE = /\.(png|gif|jpe?g)$/i;

/** Markdown report from the evidence manifest. Paths are joined onto `assetBase`. */
export function renderReport({ title, identity, entries, verdicts = [], assetBase = "." }) {
  const href = (file) => `${assetBase.replace(/\/$/, "")}/${file}`;
  const lines = [`## ${title}`, ""];
  if (identity) {
    lines.push(
      `<sub>branch \`${identity.branch}\` · captured at ${(identity.captured?.length ? identity.captured : [`${identity.head?.slice(0, 10)}${identity.dirty ? " + uncommitted changes" : ""}`]).map((c) => `\`${c}\``).join(", ")} · run \`${identity.runId}\` · ${identity.server}</sub>`,
      "",
    );
  }
  if (verdicts.length) {
    lines.push("| Feature | Result | Note |", "| --- | --- | --- |");
    for (const v of verdicts) lines.push(`| ${v.feature} | ${v.pass ? "✅ verified" : v.unproven ? "⚠️ proof not published" : v.skipped ? "⏭️ not driven" : "❌ failed"} | ${(v.note ?? "").replace(/\|/g, "\\|")} |`);
    lines.push("");
  }
  const byFeature = new Map();
  // Capture order, by the NN- file prefix: a recording is added on stop but numbered at start.
  const order = (entry) => Number.parseInt(entry.files[0], 10) || 0;
  for (const entry of [...entries].sort((a, b) => order(a) - order(b))) {
    if (!byFeature.has(entry.feature)) byFeature.set(entry.feature, []);
    byFeature.get(entry.feature).push(entry);
  }
  for (const [feature, items] of byFeature) {
    lines.push(`### ${feature}`, "");
    for (const item of items) {
      const caption = `**${item.label}**${item.note ? `: ${item.note}` : ""}`;
      const images = item.files.filter((f) => IMAGE.test(f));
      const others = item.files.filter((f) => !IMAGE.test(f));
      lines.push(caption, "");
      for (const f of images) lines.push(`<img src="${href(f)}" alt="${item.label}" width="${item.width ?? 640}">`, "");
      if (others.length) lines.push(others.map((f) => `[\`${f}\`](${href(f)})`).join(" · "), "");
    }
  }
  return lines.join("\n");
}

export const REPORT_MARKER = "<!-- persona-verify-evidence -->";

/** A passing verdict whose feature has no published proof left is shown as unproven, not verified. */
export function demoteUnproven(verdicts, entries) {
  const proven = new Set(entries.filter((e) => e.files.length).map((e) => e.feature));
  return verdicts.map((v) =>
    v.pass && !proven.has(v.feature)
      ? { ...v, pass: false, unproven: true, note: `${v.note ? `${v.note}; ` : ""}proof files were too large to publish` }
      : v,
  );
}

/** Drop files that were not published from manifest entries, noting each omission on its entry. */
export function withoutFiles(entries, omitted, reason) {
  const gone = new Set(omitted);
  return entries.map((entry) => {
    const dropped = entry.files.filter((f) => gone.has(f));
    if (!dropped.length) return entry;
    const note = `${dropped.map((f) => `\`${f}\``).join(", ")} not published (${reason})`;
    return { ...entry, files: entry.files.filter((f) => !gone.has(f)), note: entry.note ? `${entry.note}; ${note}` : note };
  });
}

/** Word error rate of `hypothesis` against `reference` (case- and punctuation-insensitive). */
export function wordErrorRate(reference, hypothesis) {
  const words = (s) => String(s).toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean);
  const ref = words(reference);
  const hyp = words(hypothesis);
  if (!ref.length) return hyp.length ? 1 : 0;
  let prev = Array.from({ length: hyp.length + 1 }, (_, j) => j);
  for (let i = 1; i <= ref.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= hyp.length; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[hyp.length] / ref.length;
}
