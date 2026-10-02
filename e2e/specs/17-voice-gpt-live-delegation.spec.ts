import { expect, test } from "@playwright/test";
import {
  installFakeHistoryApi,
  sseEvent,
  textTurnStream,
  type FakeHistoryApi,
} from "../fixtures/fake-history-api";
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

  // The context is held until the visitor's first final transcript (or the
  // first delegation): GPT-Live answers context it gets in silence. Nothing
  // at call start.
  await page.waitForTimeout(400);
  expect(call.framesOf("context")).toEqual([]);
  // A partial does not release it either: an append while the visitor is
  // mid-sentence makes GPT-Live answer early or skip the delegation.
  call.send({ type: "transcript_update", role: "user", text: "What are", turnId: "in_1", final: false, startMs: 1200, endMs: 1700 });
  await page.waitForTimeout(400);
  expect(call.framesOf("context")).toEqual([]);

  // The visitor finishes speaking: the first FINAL user transcript releases it.
  await call.utterance({ role: "user", turnId: "in_1", text: SPOKEN_QUESTION, startMs: 1200 });
  await expect(page.locator(voiceSel.userBubble).filter({ hasText: SPOKEN_QUESTION })).toHaveCount(1);

  // One frame: the typed turn plus the host's string, built before the call's
  // first utterance, so it never contains it.
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
  expect(contextText).not.toContain("What are your");
  expect(call.framesOf("context")).toHaveLength(1);

  // GPT-Live delegates; its filler shows while the widget runs the turn.
  call.send({ type: "delegation_started", turnId: "dlg_1" });
  await call.utterance({ role: "assistant", turnId: "out_1", text: FILLER, startMs: 4100 });
  await call.sendAudio(200);
  call.send({
    type: "delegation_requested",
    turnId: "dlg_1",
    userTurnId: "in_1",
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
    userTurnId: "in_live",
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
  // GPT-Live's leading space is trimmed before the text reaches the agent.
  expect(sent.at(-1)).toEqual({ role: "user", text: "What are your opening hours" });
  expect(sent.filter((m) => m.text.includes("find out"))).toEqual([]);
  await expect(page.locator(voiceSel.userBubble)).toHaveCount(1);
  await expect(page.locator(voiceSel.userBubble)).toHaveText("What are your opening hours");
  await expect(page.locator(voiceSel.assistantBubble).filter({ hasText: "Opening hours" })).toHaveCount(1);
});

test("read-back fold covers only the first new assistant turn after completion (Amendment 2)", async ({
  page,
  context,
}) => {
  // Also the text-match fallback: this request carries no userTurnId.
  // Core rotates the assistant transcript id at delegation_completed, so a
  // filler finalized after completion keeps its own id and bubble; the FIRST
  // new id after completion is the read-back; anything after that renders.
  const api = await installFakeHistoryApi(context);
  await openVoicePage(page, { voiceHost: voice.host });
  api.setChatStream(textTurnStream(RESULT_MARKDOWN, "exec_fold"));
  const call = await startCall(page);

  await call.utterance({ role: "user", turnId: "in_1", text: SPOKEN_QUESTION, startMs: 1000 });
  call.send({ type: "delegation_started", turnId: "dlg_1" });
  call.send({ type: "transcript_update", role: "assistant", text: "Sure, let me", turnId: "out_filler", final: false, startMs: 3000, endMs: 3500 });
  // No userTurnId: an older core; the client falls back to text matching.
  call.send({ type: "delegation_requested", turnId: "dlg_1", userText: SPOKEN_QUESTION, messages: [] });
  await call.waitForFrame("delegation_result", (f) => f.turnId === "dlg_1");
  call.send({ type: "delegation_completed", turnId: "dlg_1", speak: true, text: RESULT_SPEECH });
  // The filler finishes after completion under its original id.
  call.send({ type: "transcript_update", role: "assistant", text: FILLER, turnId: "out_filler", final: true, startMs: 3000, endMs: 4200 });
  await call.utterance({ role: "assistant", turnId: "out_readback", text: READBACK, startMs: 5000 });
  await call.utterance({ role: "assistant", turnId: "out_more", text: "Anything else I can help with?", startMs: 9000 });

  await expect(page.locator(voiceSel.assistantBubble).filter({ hasText: "Anything else I can help with?" })).toHaveCount(1);
  await expect(page.locator(voiceSel.assistantBubble).filter({ hasText: FILLER })).toHaveCount(1);
  await expect(page.locator(voiceSel.bubble).filter({ hasText: "We're open Monday" })).toHaveCount(0);
  await expect(page.locator(voiceSel.assistantBubble).filter({ hasText: "Opening hours" })).toHaveCount(1);
});

test("delegation_requested.userTurnId claims that exact bubble, even when the text differs", async ({
  page,
  context,
}) => {
  const api = await installFakeHistoryApi(context);
  await openVoicePage(page, { voiceHost: voice.host });
  api.setChatStream(textTurnStream(RESULT_MARKDOWN, "exec_claim"));
  const call = await startCall(page);

  await call.utterance({ role: "user", turnId: "in_a", text: "What are your opening hours", startMs: 1000 });
  await call.utterance({ role: "user", turnId: "in_b", text: "Also do you deliver", startMs: 4000 });
  // userText is the engine's (differently punctuated/cased) attribution of in_a.
  call.send({ type: "delegation_requested", turnId: "dlg_a", userTurnId: "in_a", userText: "what are your OPENING hours??", messages: [] });
  await call.waitForFrame("delegation_result", (f) => f.turnId === "dlg_a");

  await expect.poll(() => api.requestsTo("chat").length).toBe(1);
  const sent = chatMessages(api.requestsTo("chat")[0]!.body);
  expect(sent.at(-1)?.role).toBe("user");
  await expect(page.locator(voiceSel.userBubble)).toHaveCount(2);
  // in_a was submitted (no longer a caption); in_b stays a display-only caption.
  expect(sent.filter((m) => m.text.includes("Also do you deliver"))).toEqual([]);
});

test("userTurnId before its transcript: the bubble is created from userText and filled in place", async ({
  page,
  context,
}) => {
  const api = await installFakeHistoryApi(context);
  await openVoicePage(page, { voiceHost: voice.host, callContext: HOST_CONTEXT });
  api.setChatStream(textTurnStream(RESULT_MARKDOWN, "exec_early"));
  const call = await startCall(page);

  // The request lands before ANY transcript for its utterance.
  call.send({ type: "delegation_started", turnId: "dlg_e" });
  call.send({ type: "delegation_requested", turnId: "dlg_e", userTurnId: "in_e", userText: " What are your opening hours", messages: [] });
  await expect(page.locator(voiceSel.userBubble).filter({ hasText: "What are your opening hours" })).toHaveCount(1);
  await call.utterance({ role: "user", turnId: "in_e", text: " What are your opening hours?", startMs: 2000 });
  await call.waitForFrame("delegation_result", (f) => f.turnId === "dlg_e");

  // A delegation before any user transcript releases the held context, and
  // the context goes out before that delegation's result.
  const types = call.frames.map((f) => f.type);
  expect(types.filter((t) => t === "context")).toHaveLength(1);
  expect(types.indexOf("context")).toBeLessThan(types.indexOf("delegation_result"));

  await expect(page.locator(voiceSel.userBubble)).toHaveCount(1);
  await expect.poll(() => api.requestsTo("chat").length).toBe(1);
  const sent = chatMessages(api.requestsTo("chat")[0]!.body);
  expect(sent.filter((m) => m.role === "user")).toHaveLength(1);
  expect(sent.at(-1)?.role).toBe("user");
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
  // An unprompted greeting is assistant speech: it does not release the context.
  await call.utterance({ role: "assistant", turnId: "out_hi", text: "Hi there!", startMs: 200 });
  await page.waitForTimeout(400);
  expect(call.framesOf("context")).toEqual([]);

  await call.utterance({ role: "user", turnId: "in_1", text: SPOKEN_QUESTION, startMs: 1200 });
  const contextFrame = await call.waitForFrame("context");
  expect(String(contextFrame.text)).toContain(`User: ${TYPED_QUESTION}`);
  expect(String(contextFrame.text)).not.toContain(SPOKEN_QUESTION);
  expect(call.framesOf("context")).toHaveLength(1);

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

/** A turn that says a line, then parks on a `place_pickup_order` approval. */
function approvalParkStream(executionId: string): string {
  let seq = 0;
  const ev = (type: string, data: Record<string, unknown>) => sseEvent(type, { executionId, seq: ++seq, ...data });
  return (
    ev("execution_start", {
      kind: "agent",
      agentId: "agent_e2e_voice",
      agentName: "E2E",
      maxTurns: 2,
      startedAt: new Date().toISOString(),
    }) +
    ev("turn_start", { id: "turn_1", iteration: 1, role: "assistant" }) +
    ev("text_start", { id: "text_1", role: "assistant" }) +
    ev("text_delta", { id: "text_1", delta: "I can place that order for you." }) +
    ev("text_complete", { id: "text_1" }) +
    ev("approval_start", {
      approvalId: "apr_order",
      toolName: "place_pickup_order",
      toolType: "custom",
      description: "Place a pickup order at the bakery",
      reason: "The visitor asked to order for pickup",
      parameters: {
        items: [
          { name: "almond croissants", quantity: 2 },
          { name: "sourdough loaf", quantity: 1 },
        ],
        pickupTime: "today 4pm",
        customerName: "Nathan",
      },
    })
  );
}

test("approval during a call: natural ask, approve in chat, the outcome is read back (Amendment 3)", async ({
  page,
  context,
}) => {
  const ORDER_DONE = "Your order is placed: pickup today at 4pm.";
  const api = await installFakeHistoryApi(context);
  const approvals: Array<Record<string, unknown>> = [];
  await context.route("**/e2e-api/v1/agents/*/approve", async (route) => {
    approvals.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      body: textTurnStream(ORDER_DONE, "exec_order"),
    });
  });
  voice.setOptions({ followUpFrames: true });
  await openVoicePage(page, { voiceHost: voice.host });
  api.setChatStream(approvalParkStream("exec_order"));
  const call = await startCall(page);

  await call.utterance({ role: "user", turnId: "in_1", text: "Order two almond croissants and a sourdough loaf", startMs: 1000 });
  call.send({ type: "delegation_started", turnId: "dlg_order" });
  call.send({
    type: "delegation_requested",
    turnId: "dlg_order",
    userTurnId: "in_1",
    userText: "Order two almond croissants and a sourdough loaf",
    messages: [],
  });

  // The parked turn answers at once, with what is about to happen and how to
  // ask for it, not a canned line.
  const result = await call.waitForFrame("delegation_result", (f) => f.turnId === "dlg_order");
  expect(result.ok).toBe(true);
  const script = String(result.text);
  expect(script).toContain("I can place that order for you.");
  expect(script).toContain("- place pickup order (Place a pickup order at the bakery)");
  expect(script).toContain("items: 2 almond croissants, 1 sourdough loaf; pickup time: today 4pm; customer name: Nathan");
  expect(script).toContain("because: The visitor asked to order for pickup");
  expect(script).toContain("ask them to approve or decline it in the chat. Don't claim it's done.");
  expect(script.length).toBeLessThanOrEqual(1_000);

  // GPT-Live asks; that read-back is folded (the approval bubble is the ask).
  call.send({ type: "delegation_completed", turnId: "dlg_order", speak: true, text: script });
  await call.utterance({ role: "assistant", turnId: "out_ask", text: "Shall I place it? Please approve it in the chat.", startMs: 5000 });
  const approve = page.getByRole("button", { name: "Allow", exact: true });
  await expect(approve).toBeVisible();
  await page.waitForTimeout(500);
  expect(call.framesOf("delegation_followup")).toEqual([]);
  await expect(page.locator(voiceSel.bubble).filter({ hasText: "Shall I place it?" })).toHaveCount(0);

  // The visitor approves in the chat: the resumed turn's answer renders and
  // goes back to GPT-Live as a follow-up for the parked turn.
  await approve.click();
  const followUp = await call.waitForFrame("delegation_followup");
  expect(followUp).toEqual({ type: "delegation_followup", turnId: "dlg_order", text: ORDER_DONE });
  expect(approvals).toEqual([expect.objectContaining({ approvalId: "apr_order", decision: "approved" })]);
  await expect(page.locator(voiceSel.assistantBubble).filter({ hasText: ORDER_DONE })).toHaveCount(1);

  // Core reads it back under a fresh assistant id: folded like any read-back.
  call.send({ type: "delegation_completed", turnId: "dlg_order", speak: true, text: ORDER_DONE });
  await call.utterance({ role: "assistant", turnId: "out_done", text: "All set, your order is placed for 4pm.", startMs: 12000 });
  await page.waitForTimeout(750);
  await expect(page.locator(voiceSel.bubble).filter({ hasText: "All set, your order" })).toHaveCount(0);

  expect(call.framesOf("delegation_followup")).toHaveLength(1);
  expect(call.framesOf("delegation_result")).toHaveLength(1);
  expect(call.rejected).toEqual([]);
  await clickLiveMic(page);
  expect(await call.closed).toBe(1000);
});
