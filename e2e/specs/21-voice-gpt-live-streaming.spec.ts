import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "@playwright/test";
import { installFakeHistoryApi, sseEvent, textTurnStream } from "../fixtures/fake-history-api";
import { startFakeVoiceServer, type FakeVoiceCall, type FakeVoiceServer } from "../fixtures/fake-voice-server";
import { openVoicePage, voiceSel } from "../fixtures/voice-page";

/**
 * Streaming client delegation (GPT-Live), end to end: with `delegation_stream`
 * negotiated, the widget sends the delegated turn's answer as clause-sized
 * `delegation_delta` frames while the chat stream is still running, then one
 * terminal frame whose `streamedChars` says how much of its text already went
 * out. `delegation_progress` folds the voice model's read-back. An older
 * server (no `delegation_stream`) gets exactly today's single result.
 *
 * Contract: live-streaming-contract.md ("Wire contract", "Persona behavior").
 * The fake voice server checks every streaming frame against it
 * (`protocolErrors`).
 */

test.use({
  permissions: ["microphone"],
  launchOptions: {
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  },
});

const QUESTION = "What are your opening hours?";
/** Streamed before the hold: two confirmed pieces, then a sentence end only the idle flush releases. */
const BEFORE_HOLD = ["We're open ", "Monday to Friday, ", "from 8am to 6pm. ", "On Saturdays we open ", "from 9am to 4pm. "];
const AFTER_HOLD = ["Sundays we're closed."];
const ANSWER = [...BEFORE_HOLD, ...AFTER_HOLD].join("");

let voice: FakeVoiceServer;
let consoleLines: string[] = [];

test.beforeEach(async ({ page }) => {
  voice = await startFakeVoiceServer();
  consoleLines = [];
  page.on("console", (message) => consoleLines.push(`[${message.type()}] ${message.text()}`));
});

test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    await testInfo.attach("browser-console", { body: consoleLines.join("\n"), contentType: "text/plain" });
    await testInfo.attach("voice-frames", {
      body: JSON.stringify(voice.calls.map((call) => ({ frames: call.frames, protocolErrors: call.protocolErrors })), null, 2),
      contentType: "application/json",
    });
  }
  await voice.close();
});

/**
 * A chat endpoint that really streams: it sends `before` as text deltas, then
 * holds the response open until `release()`, then sends `after` and ends.
 * (Playwright's `route.fulfill` can only send a whole body at once.)
 */
async function startStreamingChat(before: string[], after: string[]) {
  const bodies: Array<Record<string, unknown>> = [];
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let ended = false;
  const server: Server = createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
    res.setHeader("Access-Control-Allow-Headers", String(req.headers["access-control-request-headers"] ?? "*"));
    if (req.method === "OPTIONS") return void res.writeHead(204).end();
    let raw = "";
    for await (const chunk of req) raw += chunk;
    bodies.push(JSON.parse(raw || "{}") as Record<string, unknown>);
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
    let seq = 0;
    const ev = (type: string, data: Record<string, unknown>) =>
      res.write(sseEvent(type, { executionId: "exec_stream", seq: ++seq, ...data }));
    const now = new Date().toISOString();
    ev("execution_start", { kind: "agent", agentId: "virtual", agentName: "E2E", maxTurns: 1, startedAt: now });
    ev("turn_start", { id: "turn_1", iteration: 1, role: "assistant" });
    ev("text_start", { id: "text_1", role: "assistant" });
    const deltas = async (chunks: string[]) => {
      for (const delta of chunks) {
        ev("text_delta", { id: "text_1", delta });
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
    };
    await deltas(before);
    await released;
    await deltas(after);
    ev("text_complete", { id: "text_1" });
    ev("turn_complete", { id: "turn_1", iteration: 1, role: "assistant", completedAt: now });
    ev("execution_complete", { kind: "agent", success: true, completedAt: now });
    ended = true;
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/chat`,
    bodies,
    release,
    ended: () => ended,
    close: () => {
      release();
      server.closeAllConnections();
      return new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/** A turn that says a line, then parks on a `place_pickup_order` approval. */
function approvalParkStream(executionId: string): string {
  let seq = 0;
  const ev = (type: string, data: Record<string, unknown>) => sseEvent(type, { executionId, seq: ++seq, ...data });
  return (
    ev("execution_start", { kind: "agent", agentId: "agent_e2e_voice", agentName: "E2E", maxTurns: 2, startedAt: new Date().toISOString() }) +
    ev("turn_start", { id: "turn_1", iteration: 1, role: "assistant" }) +
    ev("text_start", { id: "text_1", role: "assistant" }) +
    ev("text_delta", { id: "text_1", delta: "I can place that order for you." }) +
    ev("text_complete", { id: "text_1" }) +
    ev("approval_start", {
      approvalId: "apr_1",
      toolName: "place_pickup_order",
      toolType: "custom",
      description: "Place a pickup order at the bakery",
      parameters: { items: [{ name: "almond croissants", quantity: 2 }] },
    })
  );
}

async function startCall(page: import("@playwright/test").Page): Promise<FakeVoiceCall> {
  await page.locator(voiceSel.mic).click();
  const call = await voice.nextCall();
  await call.ready;
  return call;
}

test("streams the delegated answer as clause-sized deltas while the chat is still streaming", async ({ page, context }) => {
  await installFakeHistoryApi(context);
  const chat = await startStreamingChat(BEFORE_HOLD, AFTER_HOLD);
  try {
    // Registered after the fake API, so it wins for the chat route only.
    await context.route("**/e2e-api/v1/client/chat", (route) => route.continue({ url: chat.url }));
    await openVoicePage(page, { voiceHost: voice.host, callContext: "The visitor is on the Hours page." });
    const call = await startCall(page);
    expect(call.clientCapabilities).toContain("delegation_stream");
    expect(call.capabilities).toContain("delegation_stream");

    // The call-start context is held until the visitor's first final transcript.
    await page.waitForTimeout(300);
    expect(call.framesOf("context")).toEqual([]);
    await call.utterance({ role: "user", turnId: "in_1", text: QUESTION, startMs: 1000 });
    const contextFrame = await call.waitForFrame("context");
    expect(String(contextFrame.text)).toContain("The visitor is on the Hours page.");
    call.delegate({ delegationId: "dlg_1", text: QUESTION, userUtteranceIds: ["in_1"] });
    await call.utterance({ role: "assistant", turnId: "out_filler", text: "Let me check.", startMs: 3000 });

    // While the agent is still streaming (the response is held open), the
    // first clause and sentences are already on the voice socket: the last
    // sentence end before the pause goes out after 200 ms of quiet.
    await expect
      .poll(() => call.deltasFor("dlg_1").join(""))
      .toBe("We're open Monday to Friday, from 8am to 6pm. On Saturdays we open from 9am to 4pm.");
    expect(call.deltasFor("dlg_1")).toEqual([
      "We're open Monday to Friday, ",
      "from 8am to 6pm. ",
      "On Saturdays we open from 9am to 4pm.",
    ]);
    expect(chat.ended()).toBe(false);
    expect(call.framesOf("delegation_result")).toEqual([]);
    // The context preceded every delta.
    const types = call.frames.map((f) => f.type);
    expect(types.indexOf("context")).toBeLessThan(types.indexOf("delegation_delta"));

    // The server reports the first spoken chunk: GPT-Live's read-back starts and is folded.
    call.progress("dlg_1", "We're open Monday to Friday, from 8am to 6pm.");
    await call.utterance({ role: "assistant", turnId: "out_readback", text: "We're open weekdays from eight to six.", startMs: 5000 });

    chat.release();
    const result = await call.waitForFrame("delegation_result", (f) => f.delegationId === "dlg_1");
    const deltas = call.deltasFor("dlg_1");
    expect(result.status).toBe("completed");
    expect(result.text).toBe(ANSWER);
    expect(deltas.join("")).toBe(ANSWER);
    expect(result.streamedChars).toBe(ANSWER.length);
    expect(deltas.every((d) => d.length > 0 && d.length <= 220)).toBe(true);
    expect(deltas).toEqual([
      "We're open Monday to Friday, ",
      "from 8am to 6pm. ",
      "On Saturdays we open from 9am to 4pm.",
      " Sundays we're closed.",
    ]);

    // The delegated chat request carried the spoken-reply hint.
    expect(chat.bodies).toHaveLength(1);
    expect(chat.bodies[0].voice).toEqual({ spoken: true });

    // The phase ends; the next new utterance is not a read-back and renders.
    call.completed("dlg_1", { text: ANSWER });
    await call.utterance({ role: "assistant", turnId: "out_more", text: "Anything else I can help with?", startMs: 9000 });
    await expect(page.locator(voiceSel.assistantBubble).filter({ hasText: "Anything else I can help with?" })).toHaveCount(1);
    await expect(page.locator(voiceSel.bubble).filter({ hasText: "from eight to six" })).toHaveCount(0);
    await expect(page.locator(voiceSel.assistantBubble).filter({ hasText: "Sundays we're closed." })).toHaveCount(1);
    await expect(page.locator(voiceSel.assistantBubble).filter({ hasText: "Let me check." })).toHaveCount(1);

    expect(call.protocolErrors).toEqual([]);
    expect(call.rejected).toEqual([]);
  } finally {
    await chat.close();
  }
});

test("tag-negotiated server: an untagged read-back after delegation_progress is folded (cut-filler continuation)", async ({
  page,
  context,
}) => {
  // Live sequence against current core (delegation_read_back negotiated): core
  // cuts GPT-Live's in-flight filler, reports progress, and GPT-Live continues
  // the answer in a NEW utterance core leaves untagged.
  voice.setOptions({ delegationReadBack: true });
  const api = await installFakeHistoryApi(context);
  api.setChatStream(textTurnStream("We're open Monday to Friday from 8 to 6. Saturday 9 to 4.", "exec_tag"));
  await openVoicePage(page, { voiceHost: voice.host });
  const call = await startCall(page);
  expect(call.capabilities).toEqual(expect.arrayContaining(["delegation_read_back", "delegation_stream"]));

  await call.utterance({ role: "user", turnId: "in_1", text: QUESTION, startMs: 1000 });
  call.send({ type: "transcript_update", role: "assistant", text: "Let me check", turnId: "out_a", final: false, startMs: 3000, endMs: 3400 });
  call.delegate({ delegationId: "dlg_1", text: QUESTION, userUtteranceIds: ["in_1"] });
  await call.waitForFrame("delegation_delta", (f) => f.delegationId === "dlg_1");

  call.send({
    type: "transcript_update",
    role: "assistant",
    text: "Let me check on that for you. We're open Monday",
    turnId: "out_a",
    final: true,
    startMs: 3000,
    endMs: 4900,
  });
  call.progress("dlg_1", "We're open Monday to Friday from 8 to 6.");
  await call.utterance({ role: "assistant", turnId: "out_b", text: "to Friday, eight till six, and Saturday nine till four.", startMs: 5200 });
  await call.waitForFrame("delegation_result", (f) => f.delegationId === "dlg_1");
  call.completed("dlg_1", { text: "We're open Monday to Friday from 8 to 6. Saturday 9 to 4." });
  await call.utterance({ role: "assistant", turnId: "out_c", text: "Anything else I can help with?", startMs: 9000 });

  await expect(page.locator(voiceSel.assistantBubble).filter({ hasText: "Anything else I can help with?" })).toHaveCount(1);
  await expect(page.locator(voiceSel.bubble).filter({ hasText: "eight till six" })).toHaveCount(0);
  await expect(page.locator(voiceSel.assistantBubble).filter({ hasText: "Let me check on that for you." })).toHaveCount(1);
  await expect(page.locator(voiceSel.assistantBubble).filter({ hasText: "Saturday 9 to 4." })).toHaveCount(1); // the chat answer
  expect(call.protocolErrors).toEqual([]);
  expect(call.rejected).toEqual([]);
});

test("an approval-parked turn streams its answer; the approval script is the unstreamed suffix", async ({ page, context }) => {
  const api = await installFakeHistoryApi(context);
  api.setChatStream(approvalParkStream("exec_order"));
  await openVoicePage(page, { voiceHost: voice.host });
  const call = await startCall(page);

  await call.utterance({ role: "user", turnId: "in_1", text: "Order two almond croissants", startMs: 1000 });
  call.delegate({ delegationId: "dlg_1", text: "Order two almond croissants", userUtteranceIds: ["in_1"] });
  const update = await call.waitForFrame("delegation_update", (f) => f.delegationId === "dlg_1");

  const answer = "I can place that order for you.";
  expect(call.deltasFor("dlg_1")).toEqual([answer]);
  expect(update.status).toBe("pending_approval");
  expect(update.streamedChars).toBe(answer.length);
  const text = String(update.text);
  expect(text.startsWith(`${answer}\n\n`)).toBe(true);
  expect(text.slice(answer.length)).toContain("This action needs the user's approval in the chat");
  // Every delta precedes the update.
  const ids = call.frames.filter((f) => f.delegationId === "dlg_1").map((f) => f.type);
  expect(ids).toEqual(["delegation_delta", "delegation_update"]);
  await expect(page.getByRole("button", { name: "Allow", exact: true })).toBeVisible();
  expect(call.protocolErrors).toEqual([]);
  expect(call.rejected).toEqual([]);
});

test("a server without delegation_stream gets no deltas and no streamedChars", async ({ page, context }) => {
  voice.setOptions({ delegationStream: false });
  const api = await installFakeHistoryApi(context);
  api.setChatStream(approvalParkStream("exec_old"));
  await openVoicePage(page, { voiceHost: voice.host });
  const call = await startCall(page);
  expect(call.clientCapabilities).toContain("delegation_stream");
  expect(call.capabilities).not.toContain("delegation_stream");

  await call.utterance({ role: "user", turnId: "in_1", text: "Order two almond croissants", startMs: 1000 });
  call.delegate({ delegationId: "dlg_1", text: "Order two almond croissants", userUtteranceIds: ["in_1"] });
  const update = await call.waitForFrame("delegation_update", (f) => f.delegationId === "dlg_1");
  expect(update).not.toHaveProperty("streamedChars");
  expect(String(update.text)).toContain("I can place that order for you.");
  expect(call.framesOf("delegation_delta")).toEqual([]);
  // An unknown `delegation_progress` from a confused server is ignored, not fatal.
  call.progress("dlg_1", "x");
  await page.waitForTimeout(300);
  expect(call.rejected).toEqual([]);
  expect(call.protocolErrors).toEqual([]);
});
