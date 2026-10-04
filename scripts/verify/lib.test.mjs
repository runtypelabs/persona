// node --test scripts/verify/lib.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildPageUrl,
  chromiumArgs,
  demoteUnproven,
  parseArgs,
  renderReport,
  slug,
  voiceLatencies,
  wavFromPcm16,
  withoutFiles,
  wordErrorRate,
} from "./lib.mjs";

test("parseArgs keeps positionals, values, booleans and the -- tail", () => {
  assert.deepEqual(parseArgs(["open", "verify", "--scenario", "approval", "--headed", "--theme=dark"], ["headed"]), {
    _: ["open", "verify"],
    scenario: "approval",
    headed: true,
    theme: "dark",
  });
  assert.deepEqual(parseArgs(["ab", "--", "wait", "--text", "x"]), { _: ["ab", "wait", "--text", "x"] });
  assert.equal(parseArgs(["shot", "--full"]).full, true);
});

test("slug is filesystem- and URL-safe", () => {
  assert.equal(slug("Card pending (Allow/Deny)"), "card-pending-allow-deny");
  assert.equal(slug("***"), "step");
});

test("buildPageUrl maps fixture options onto query params", () => {
  const url = new URL(buildPageUrl("http://127.0.0.1:4390", "verify", { scenario: "approval", theme: "dark", config: { colorScheme: "dark" } }));
  assert.equal(url.pathname, "/verify.html");
  assert.equal(url.searchParams.get("scenario"), "approval");
  assert.equal(url.searchParams.get("theme"), "dark");
  assert.deepEqual(JSON.parse(url.searchParams.get("config")), { colorScheme: "dark" });
  assert.throws(() => buildPageUrl("http://x", "verify", { scenario: "nope" }), /unknown scenario/);
  const voice = new URL(buildPageUrl("http://x", "voice-e2e", { voiceHost: "ws://127.0.0.1:9" }));
  assert.equal(voice.searchParams.get("voiceHost"), "ws://127.0.0.1:9");
  assert.equal(voice.searchParams.get("clientDelegation"), "0");
  assert.equal(new URL(buildPageUrl("http://x", "approval-demo.html")).pathname, "/approval-demo.html");
  assert.equal(buildPageUrl("http://x", "https://persona-chat.dev/"), "https://persona-chat.dev/");
});

test("chromiumArgs only adds the fake capture device for a mic WAV", () => {
  assert.deepEqual(chromiumArgs(), ["--autoplay-policy=no-user-gesture-required"]);
  assert.ok(chromiumArgs({ micWav: "/a.wav" }).includes("--use-file-for-fake-audio-capture=/a.wav%noloop"));
});

test("wavFromPcm16 writes a valid RIFF header", () => {
  const out = wavFromPcm16(new Uint8Array(32), 16000);
  const view = new DataView(out.buffer);
  assert.equal(String.fromCharCode(...out.subarray(0, 4)), "RIFF");
  assert.equal(view.getUint32(24, true), 16000);
  assert.equal(view.getUint32(40, true), 32);
  assert.equal(out.length, 76);
});

test("voiceLatencies derives spans from timeline marks and skips missing ones", () => {
  const { marks, latenciesMs } = voiceLatencies([
    { at: 100, type: "mic", detail: { state: "recording | Stop voice recognition" } },
    { at: 110, type: "ws:open" },
    { at: 390, type: "ws:first-mic-frame-sent" },
    { at: 1900, type: "ws:first-audio-received" },
  ]);
  assert.equal(marks.micOn, 100);
  assert.deepEqual(latenciesMs, { micOnToSocketOpen: 10, socketOpenToFirstMicFrame: 280, micOnToFirstAudioReceived: 1800 });
});

test("wordErrorRate ignores case and punctuation", () => {
  assert.equal(wordErrorRate("We're open Monday to Friday.", "we're open monday to friday"), 0);
  assert.equal(wordErrorRate("a b c d", "a x c"), 0.5);
  assert.equal(wordErrorRate("", ""), 0);
});

test("renderReport groups by feature, inlines images and links the rest", () => {
  const md = renderReport({
    title: "Proof",
    identity: { branch: "b", head: "0123456789abc", dirty: true, runId: "r1", server: "dev" },
    verdicts: [{ feature: "approvals", pass: true, note: "a|b" }],
    entries: [
      { feature: "approvals", label: "card", files: ["01-a.png", "01-a.aria.txt"] },
      { feature: "voice", label: "call", note: "n", files: ["02-v.gif", "02-v.webm"] },
    ],
    assetBase: "https://h/x/",
  });
  assert.match(md, /## Proof/);
  assert.match(md, /captured at `0123456789 \+ uncommitted changes`/);
  assert.match(md, /\| approvals \| ✅ verified \| a\\\|b \|/);
  assert.match(md, /<img src="https:\/\/h\/x\/01-a\.png"/);
  assert.match(md, /\[`02-v\.webm`\]\(https:\/\/h\/x\/02-v\.webm\)/);
  assert.ok(md.indexOf("### approvals") < md.indexOf("### voice"));
});

test("withoutFiles drops unpublished files and says so on the entry", () => {
  const [kept, trimmed] = withoutFiles(
    [
      { feature: "a", label: "x", files: ["01-a.png"] },
      { feature: "b", label: "y", note: "ok", files: ["02-b.gif", "02-b.webm"] },
    ],
    ["02-b.webm"],
    "over 20 MB",
  );
  assert.deepEqual(kept.files, ["01-a.png"]);
  assert.deepEqual(trimmed.files, ["02-b.gif"]);
  assert.equal(trimmed.note, "ok; `02-b.webm` not published (over 20 MB)");
});

test("demoteUnproven stops a pass with no published proof from reading as verified", () => {
  const [unproven, proven, skipped] = demoteUnproven(
    [
      { feature: "voice", pass: true, note: "ok" },
      { feature: "approvals", pass: true },
      { feature: "streaming", pass: false, skipped: true },
    ],
    [
      { feature: "voice", files: [] },
      { feature: "approvals", files: ["01-a.png"] },
    ],
  );
  assert.equal(unproven.pass, false);
  assert.equal(unproven.unproven, true);
  assert.match(unproven.note, /^ok; proof files were too large/);
  assert.match(renderReport({ title: "t", entries: [], verdicts: [unproven] }), /⚠️ proof not published/);
  // Too large vs never captured get different reasons.
  const [tooBig, none] = demoteUnproven(
    [{ feature: "voice", pass: true }, { feature: "theme", pass: true }],
    [{ feature: "voice", files: [] }],
    [{ feature: "voice", files: ["01-v.webm"] }],
  );
  assert.match(tooBig.note, /too large/);
  assert.match(none.note, /no evidence was captured/);
  assert.equal(proven.pass, true);
  assert.equal(skipped.skipped, true);
});

test("renderReport lists a feature's entries in capture order", () => {
  const md = renderReport({
    title: "t",
    entries: [
      { feature: "f", label: "shot during recording", files: ["02-f.png"] },
      { feature: "f", label: "recording", files: ["01-f.gif"] },
    ],
  });
  assert.ok(md.indexOf("recording**") < md.indexOf("shot during recording"));
});
