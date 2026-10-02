import { expect, test } from "@playwright/test";
import { installFakeHistoryApi, textTurnStream, type FakeHistoryApi } from "../fixtures/fake-history-api";
import {
  startFakeVoiceServer,
  type FakeVoiceCall,
  type FakeVoiceServer,
} from "../fixtures/fake-voice-server";
import {
  chatMessages,
  clickLiveMic,
  openVoicePage,
  toolThenMarkdownStream,
  transcript,
  typeMessage,
  voiceSel,
} from "../fixtures/voice-page";

/**
 * Full-duplex (GPT-Live) voice × the widget's chat pipeline, end to end in a
 * real Chromium with a fake mic. The voice socket is a scripted fake of core's
 * GPT-Live browser handler (fixtures/fake-voice-server.ts); the chat transport
 * is the route-intercepted `/v1/client/*` fake the history suite uses.
 *
 * Contract: gpt-live-contract.md (client-delegation extension + Amendment 1).
 * The flow under test: typed history → call starts → `context` frame carries
 * the history → spoken request becomes ONE user bubble → the widget submits it
 * through its normal chat pipeline exactly once → the Markdown answer (with a
 * tool call) renders as a normal assistant message → `delegation_result` goes
 * back with the matching turnId → GPT-Live's spoken read-back does not render
 * as a second bubble. Older servers keep today's behaviour.
 */

test.use({
  permissions: ["microphone"],
  launchOptions: {
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  },
});

const TYPED_QUESTION = "What breads do you bake?";
const TYPED_ANSWER = "We bake sourdough, rye, and a seeded country loaf.";
const SPOKEN_QUESTION = "What are your opening hours?";
const RESULT_MARKDOWN =
  "**Opening hours**\n\n- Monday to Friday: 8am to 6pm\n- Saturday: 9am to 4pm\n- Sunday: closed";
const RESULT_SPEECH =
  "Opening hours Monday to Friday: 8am to 6pm Saturday: 9am to 4pm Sunday: closed";
const FILLER = "Sure, let me check that for you.";
const READBACK =
  "We're open Monday to Friday from 8am to 6pm, Saturday from 9am to 4pm, and closed on Sunday.";
const HOST_CONTEXT = "The visitor is on the Locations page.";

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
      body: JSON.stringify(
        voice.calls.map((call) => ({ url: call.url.href, frames: call.frames, rejected: call.rejected })),
        null,
        2,
      ),
      contentType: "application/json",
    });
  }
  await voice.close();
});

/** Type one message and wait for its answer, so the call has history. */
async function seedTypedTurn(page: import("@playwright/test").Page, api: FakeHistoryApi) {
  api.setChatStream(textTurnStream(TYPED_ANSWER, "exec_typed"));
  await typeMessage(page, TYPED_QUESTION);
  await expect(page.locator(voiceSel.assistantBubble).filter({ hasText: TYPED_ANSWER })).toBeVisible();
  await expect.poll(() => api.requestsTo("chat").length).toBe(1);
}

/** Click the mic and wait for the call's `session_config` to go out. */
async function startCall(page: import("@playwright/test").Page): Promise<FakeVoiceCall> {
  await page.locator(voiceSel.mic).click();
  const call = await voice.nextCall();
  await call.ready;
  return call;
}

test("client delegation: spoken turn runs through the chat pipeline and is read back once", async ({
  page,
  context,
}) => {
  const api = await installFakeHistoryApi(context);
  await openVoicePage(page, { voiceHost: voice.host, callContext: HOST_CONTEXT });
  await seedTypedTurn(page, api);

  api.setChatStream(
    toolThenMarkdownStream({
      toolName: "get_opening_hours",
      parameters: { location: "main" },
      result: { weekdays: "8-18", saturday: "9-16", sunday: null },
      markdown: RESULT_MARKDOWN,
    }),
  );

  const call = await startCall(page);

  // Handshake: full duplex + client delegation declared; token rides the
  // subprotocol, never the URL.
  expect(call.url.pathname).toBe("/ws/agents/agent_e2e_voice/voice");
  expect(call.url.searchParams.get("voiceCapabilities")).toBe("full-duplex-v1");
  expect(call.clientCapabilities).toContain("client-delegation");
  expect(call.protocol).toBe("runtype.bearer");
  expect(call.token).toBe("ct_e2e_voice");
  expect(call.url.search).not.toContain("ct_e2e_voice");
  expect(call.delegationGranted).toBe(true);

  // Call-start context: the typed turn plus the host's string, one frame.
  const contextFrame = await call.waitForFrame("context");
  const contextText = String(contextFrame.text);
  expect(contextText).toContain("Conversation so far:");
  expect(contextText).toContain(`User: ${TYPED_QUESTION}`);
  expect(contextText).toContain(`Assistant: ${TYPED_ANSWER}`);
  expect(contextText).toContain(HOST_CONTEXT);
  expect(contextText.indexOf(`User: ${TYPED_QUESTION}`)).toBeLessThan(
    contextText.indexOf(`Assistant: ${TYPED_ANSWER}`),
  );
  expect(contextText.length).toBeLessThanOrEqual(8000);
  expect(call.framesOf("context")).toHaveLength(1);

  // The visitor speaks.
  await call.utterance({ role: "user", turnId: "in_1", text: SPOKEN_QUESTION, startMs: 1200 });
  await expect(page.locator(voiceSel.userBubble).filter({ hasText: SPOKEN_QUESTION })).toHaveCount(1);

  // GPT-Live delegates; its filler shows while the widget runs the turn.
  call.send({ type: "delegation_started", turnId: "dlg_1" });
  await call.utterance({ role: "assistant", turnId: "out_1", text: FILLER, startMs: 4100 });
  await call.sendAudio(200);
  call.send({
    type: "delegation_requested",
    turnId: "dlg_1",
    userText: SPOKEN_QUESTION,
    messages: [{ role: "user", content: SPOKEN_QUESTION }],
  });

  const result = await call.waitForFrame("delegation_result", (f) => f.turnId === "dlg_1");
  expect(result.ok).toBe(true);
  expect(String(result.text)).toContain("Monday to Friday: 8am to 6pm");
  expect(String(result.text)).toContain("Sunday: closed");

  // The chat endpoint saw the spoken request exactly once, in one request.
  await expect.poll(() => api.requestsTo("chat").length).toBe(2);
  const voiceTurn = chatMessages(api.requestsTo("chat")[1]!.body);
  const asked = voiceTurn.filter((m) => m.role === "user" && m.text.includes(SPOKEN_QUESTION));
  expect(asked).toHaveLength(1);
  // The delegated turn ends on the spoken request, and GPT-Live's own
  // captions (the filler) never reach the agent as conversation history.
  expect(voiceTurn.at(-1)).toMatchObject({ role: "user" });
  expect(voiceTurn.at(-1)!.text).toContain(SPOKEN_QUESTION);
  expect(voiceTurn.filter((m) => m.text.includes(FILLER))).toEqual([]);
  // ...and its history is the same conversation the typed turn started.
  expect(voiceTurn.some((m) => m.text.includes(TYPED_QUESTION))).toBe(true);

  // The answer renders as a normal Markdown assistant message.
  const answer = page.locator(voiceSel.assistantBubble).filter({ hasText: "Opening hours" });
  await expect(answer).toHaveCount(1);
  await expect(answer.locator("strong", { hasText: "Opening hours" })).toBeVisible();
  await expect(answer.locator("li")).toHaveCount(3);

  // GPT-Live reads the result back: audio plays, no second bubble appears.
  call.send({ type: "delegation_completed", turnId: "dlg_1", speak: true, text: RESULT_SPEECH });
  await call.utterance({ role: "assistant", turnId: "out_2", text: READBACK, startMs: 9000 });
  await call.sendAudio(400);
  // Let the reconciler process every read-back frame before asserting absence.
  await page.waitForTimeout(750);
  await expect(page.locator(voiceSel.bubble).filter({ hasText: "We're open Monday" })).toHaveCount(0);

  // One user bubble per request; nothing duplicated.
  await expect(page.locator(voiceSel.userBubble)).toHaveCount(2);
  await expect(page.locator(voiceSel.userBubble).filter({ hasText: SPOKEN_QUESTION })).toHaveCount(1);
  expect(await transcript(page)).toEqual([
    `user: ${TYPED_QUESTION}`,
    `assistant: ${TYPED_ANSWER}`,
    `user: ${SPOKEN_QUESTION}`,
    `assistant: ${FILLER}`,
    expect.stringContaining("assistant: Opening hours"),
  ]);

  // A follow-up utterance ends the fold: later replies render again.
  await call.utterance({ role: "user", turnId: "in_2", text: "Thanks!", startMs: 15000 });
  await call.utterance({ role: "assistant", turnId: "out_3", text: "You're welcome!", startMs: 16000 });
  await expect(page.locator(voiceSel.assistantBubble).filter({ hasText: "You're welcome!" })).toHaveCount(1);

  expect(call.rejected).toEqual([]);
  expect(call.framesOf("delegation_result")).toHaveLength(1);
  expect(call.binaryFrames).toBeGreaterThan(0);

  // Hang up: a clean close.
  await clickLiveMic(page);
  expect(await call.closed).toBe(1000);

  // A later typed turn's history keeps the delegated request and its answer,
  // but none of GPT-Live's captions: filler, read-back, or the undelegated
  // follow-up utterance and its reply.
  api.setChatStream(textTurnStream("Anything else?", "exec_after"));
  await typeMessage(page, "One more question");
  await expect.poll(() => api.requestsTo("chat").length).toBe(3);
  const later = chatMessages(api.requestsTo("chat")[2]!.body);
  expect(later.at(-1)).toMatchObject({ role: "user", text: "One more question" });
  expect(later.filter((m) => m.role === "user" && m.text.includes(SPOKEN_QUESTION))).toHaveLength(1);
  expect(later.some((m) => m.role === "assistant" && m.text.includes("Monday to Friday"))).toBe(true);
  for (const caption of [FILLER, "We're open Monday", "Thanks!", "You're welcome!"]) {
    expect(later.filter((m) => m.text.includes(caption))).toEqual([]);
  }
});

test("real GPT-Live ordering: delegation arrives before the user transcript is final", async ({
  page,
  context,
}) => {
  // Captured from a live GPT-Live call: delegation_started/requested land
  // ~100-600 ms BEFORE the user utterance's final transcript (core finalizes
  // after a 900 ms quiet window), and userText keeps GPT-Live's leading space
  // and lacks punctuation.
  const api = await installFakeHistoryApi(context);
  await openVoicePage(page, { voiceHost: voice.host });
  api.setChatStream(
    toolThenMarkdownStream({
      toolName: "get_opening_hours",
      parameters: {},
      result: { weekdays: "8-18" },
      markdown: RESULT_MARKDOWN,
    }),
  );
  const call = await startCall(page);

  for (const partial of [" What", " What are your", " What are your opening hours"]) {
    call.send({ type: "transcript_update", role: "user", text: partial, turnId: "in_live", final: false, startMs: 2200, endMs: 3800 });
  }
  call.send({ type: "delegation_started", turnId: "item_live" });
  // Live, GPT-Live's filler starts ~100 ms before the request reaches the widget.
  call.send({ type: "transcript_update", role: "assistant", text: " Yeah, I'll find out.", turnId: "out_live", final: false, startMs: 4600, endMs: 5800 });
  call.send({
    type: "delegation_requested",
    turnId: "item_live",
    userText: " What are your opening hours",
    messages: [{ role: "user", content: " What are your opening hours" }],
  });
  call.send({ type: "transcript_update", role: "user", text: " What are your opening hours", turnId: "in_live", final: true, startMs: 2200, endMs: 3800 });

  const result = await call.waitForFrame("delegation_result", (f) => f.turnId === "item_live");
  expect(result.ok).toBe(true);
  await expect.poll(() => api.requestsTo("chat").length).toBe(1);
  const sent = chatMessages(api.requestsTo("chat")[0]!.body);
  const asked = sent.filter((m) => m.role === "user" && m.text.includes("What are your opening hours"));
  expect(asked).toHaveLength(1);
  expect(sent.at(-1)).toMatchObject({ role: "user" });
  expect(sent.at(-1)!.text).toContain("What are your opening hours");
  expect(sent.filter((m) => m.text.includes("find out"))).toEqual([]);
  await expect(page.locator(voiceSel.userBubble)).toHaveCount(1);
  await expect(page.locator(voiceSel.userBubble)).toHaveText("What are your opening hours");
  await expect(page.locator(voiceSel.assistantBubble).filter({ hasText: "Opening hours" })).toHaveCount(1);
});

test("bubbles order by startMs: a late user transcript renders above the reply it prompted", async ({
  page,
  context,
}) => {
  await installFakeHistoryApi(context);
  await openVoicePage(page, { voiceHost: voice.host });
  const call = await startCall(page);

  // GPT-Live finalizes the reply's transcript before the user's: distinct
  // turnIds per utterance (as core projects them), ordered only by startMs.
  await call.utterance({ role: "assistant", turnId: "out_a", text: "Happy to help with that.", startMs: 2600 });
  await call.utterance({ role: "user", turnId: "in_a", text: "Can you help me order a cake?", startMs: 900 });
  await call.utterance({ role: "assistant", turnId: "out_b", text: "What flavour would you like?", startMs: 5200 });
  await call.utterance({ role: "user", turnId: "in_b", text: "Chocolate please.", startMs: 7000 });

  await expect.poll(() => transcript(page)).toEqual([
    "user: Can you help me order a cake?",
    "assistant: Happy to help with that.",
    "assistant: What flavour would you like?",
    "user: Chocolate please.",
  ]);
});

test("old server (no clientDelegation, no contextFrames): today's server-side behaviour", async ({
  page,
  context,
}) => {
  voice.setOptions({ clientDelegation: false, contextFrames: false });
  const api = await installFakeHistoryApi(context);
  await openVoicePage(page, { voiceHost: voice.host, callContext: HOST_CONTEXT });
  await seedTypedTurn(page, api);

  const call = await startCall(page);
  expect(call.delegationGranted).toBe(false);

  await call.utterance({ role: "user", turnId: "in_1", text: SPOKEN_QUESTION, startMs: 1200 });
  call.send({ type: "delegation_started", turnId: "dlg_1" });
  call.send({ type: "delegation_completed", turnId: "dlg_1", speak: true, text: RESULT_SPEECH });
  await call.utterance({ role: "assistant", turnId: "out_1", text: READBACK, startMs: 6000 });
  await call.sendAudio(300);

  // The spoken reply IS the answer here, so it renders as a bubble.
  await expect(page.locator(voiceSel.assistantBubble).filter({ hasText: "We're open Monday" })).toHaveCount(1);
  await expect(page.locator(voiceSel.userBubble).filter({ hasText: SPOKEN_QUESTION })).toHaveCount(1);
  await page.waitForTimeout(500);

  // No new client frames, no chat submission, and the call survived.
  expect(call.framesOf("context")).toEqual([]);
  expect(call.framesOf("delegation_result")).toEqual([]);
  expect(call.rejected).toEqual([]);
  expect(api.requestsTo("chat")).toHaveLength(1);

  await clickLiveMic(page);
  expect(await call.closed).toBe(1000);
});

test("contextFrames without delegation: context is sent, the agent turn stays on the server", async ({
  page,
  context,
}) => {
  voice.setOptions({ clientDelegation: false, contextFrames: true });
  const api = await installFakeHistoryApi(context);
  await openVoicePage(page, { voiceHost: voice.host });
  await seedTypedTurn(page, api);

  const call = await startCall(page);
  const contextFrame = await call.waitForFrame("context");
  expect(String(contextFrame.text)).toContain(`User: ${TYPED_QUESTION}`);

  await call.utterance({ role: "user", turnId: "in_1", text: SPOKEN_QUESTION, startMs: 1200 });
  call.send({ type: "delegation_started", turnId: "dlg_1" });
  call.send({ type: "delegation_completed", turnId: "dlg_1", speak: true, text: RESULT_SPEECH });
  await call.utterance({ role: "assistant", turnId: "out_1", text: READBACK, startMs: 6000 });

  await expect(page.locator(voiceSel.assistantBubble).filter({ hasText: "We're open Monday" })).toHaveCount(1);
  expect(call.framesOf("delegation_result")).toEqual([]);
  expect(call.rejected).toEqual([]);
  expect(api.requestsTo("chat")).toHaveLength(1);
});

test("clientDelegation: false opts out of the capability", async ({ page, context }) => {
  await installFakeHistoryApi(context);
  await openVoicePage(page, { voiceHost: voice.host, clientDelegation: false });
  const call = await startCall(page);
  expect(call.clientCapabilities).not.toContain("client-delegation");
  expect(call.delegationGranted).toBe(false);
});
