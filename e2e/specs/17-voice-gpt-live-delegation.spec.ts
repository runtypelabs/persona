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
 * Contract: gpt-live-contract.md, wire vocabulary v1 (Amendment 5).
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
  expect(call.url.searchParams.get("voiceProtocol")).toBe("runtype-browser-v1");
  expect(call.url.searchParams.get("clientVersion")).toMatch(/^persona\/\d+\.\d+\.\d+/);
  expect(call.clientCapabilities).toEqual(
    expect.arrayContaining(["client_delegation", "context", "delegation_update", "partial_transcript"]),
  );
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
  call.delegate({ delegationId: "dlg_1", text: SPOKEN_QUESTION, userUtteranceIds: ["in_1"] });
  await call.utterance({ role: "assistant", turnId: "out_1", text: FILLER, startMs: 4100 });
  // A caption is display-only: no copy (or any other) message action.
  const filler = page.locator(voiceSel.assistantBubble).filter({ hasText: FILLER });
  await expect(filler).toHaveCount(1);
  await filler.hover();
  await expect(filler.locator(".persona-message-actions button")).toHaveCount(0);
  await call.sendAudio(200);

  // One terminal result, v1 shape: delegationId + status, no `ok`.
  const result = await call.waitForFrame("delegation_result", (f) => f.delegationId === "dlg_1");
  expect(result.status).toBe("completed");
  expect(result).not.toHaveProperty("ok");
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
  call.completed("dlg_1", { text: RESULT_SPEECH });
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
  // Live, GPT-Live's filler starts ~100 ms before the request reaches the widget.
  call.send({ type: "transcript_update", role: "assistant", text: " Yeah, I'll find out.", turnId: "out_live", final: false, startMs: 4600, endMs: 5800 });
  call.delegate({ delegationId: "item_live", text: " What are your opening hours", userUtteranceIds: ["in_live"] });
  call.send({ type: "transcript_update", role: "user", text: " What are your opening hours", turnId: "in_live", final: true, startMs: 2200, endMs: 3800 });

  const result = await call.waitForFrame("delegation_result", (f) => f.delegationId === "item_live");
  expect(result.status).toBe("completed");
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
  // Also the text-match fallback: this request carries no userUtteranceIds.
  // Core rotates the assistant transcript id at delegation_completed, so a
  // filler finalized after completion keeps its own id and bubble; the FIRST
  // new id after completion is the read-back; anything after that renders.
  const api = await installFakeHistoryApi(context);
  await openVoicePage(page, { voiceHost: voice.host });
  api.setChatStream(textTurnStream(RESULT_MARKDOWN, "exec_fold"));
  const call = await startCall(page);

  await call.utterance({ role: "user", turnId: "in_1", text: SPOKEN_QUESTION, startMs: 1000 });
  call.send({ type: "transcript_update", role: "assistant", text: "Sure, let me", turnId: "out_filler", final: false, startMs: 3000, endMs: 3500 });
  // No userUtteranceIds: the client falls back to text matching.
  call.delegate({ delegationId: "dlg_1", text: SPOKEN_QUESTION });
  await call.waitForFrame("delegation_result", (f) => f.delegationId === "dlg_1");
  call.completed("dlg_1", { text: RESULT_SPEECH });
  // The filler finishes after completion under its original id.
  call.send({ type: "transcript_update", role: "assistant", text: FILLER, turnId: "out_filler", final: true, startMs: 3000, endMs: 4200 });
  await call.utterance({ role: "assistant", turnId: "out_readback", text: READBACK, startMs: 5000 });
  await call.utterance({ role: "assistant", turnId: "out_more", text: "Anything else I can help with?", startMs: 9000 });

  await expect(page.locator(voiceSel.assistantBubble).filter({ hasText: "Anything else I can help with?" })).toHaveCount(1);
  await expect(page.locator(voiceSel.assistantBubble).filter({ hasText: FILLER })).toHaveCount(1);
  await expect(page.locator(voiceSel.bubble).filter({ hasText: "We're open Monday" })).toHaveCount(0);
  await expect(page.locator(voiceSel.assistantBubble).filter({ hasText: "Opening hours" })).toHaveCount(1);
});

test("input.userUtteranceIds claims that exact bubble, even when the text differs", async ({
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
  call.delegate({ delegationId: "dlg_a", text: "what are your OPENING hours??", userUtteranceIds: ["in_a"] });
  await call.waitForFrame("delegation_result", (f) => f.delegationId === "dlg_a");

  await expect.poll(() => api.requestsTo("chat").length).toBe(1);
  const sent = chatMessages(api.requestsTo("chat")[0]!.body);
  expect(sent.at(-1)?.role).toBe("user");
  await expect(page.locator(voiceSel.userBubble)).toHaveCount(2);
  // in_a was submitted (no longer a caption); in_b stays a display-only caption.
  expect(sent.filter((m) => m.text.includes("Also do you deliver"))).toEqual([]);
});

test("an utterance id before its transcript: the bubble is created from the request text and filled in place", async ({
  page,
  context,
}) => {
  const api = await installFakeHistoryApi(context);
  await openVoicePage(page, { voiceHost: voice.host, callContext: HOST_CONTEXT });
  api.setChatStream(textTurnStream(RESULT_MARKDOWN, "exec_early"));
  const call = await startCall(page);

  // The request lands before ANY transcript for its utterance.
  call.delegate({ delegationId: "dlg_e", text: " What are your opening hours", userUtteranceIds: ["in_e"] });
  await expect(page.locator(voiceSel.userBubble).filter({ hasText: "What are your opening hours" })).toHaveCount(1);
  await call.utterance({ role: "user", turnId: "in_e", text: " What are your opening hours?", startMs: 2000 });
  await call.waitForFrame("delegation_result", (f) => f.delegationId === "dlg_e");

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

test("old server (no session_config.capabilities): server-side delegation, no new client frames", async ({
  page,
  context,
}) => {
  voice.setOptions({ legacy: true });
  const api = await installFakeHistoryApi(context);
  await openVoicePage(page, { voiceHost: voice.host, callContext: HOST_CONTEXT });
  await seedTypedTurn(page, api);

  const call = await startCall(page);
  expect(call.delegationGranted).toBe(false);

  await call.utterance({ role: "user", turnId: "in_1", text: SPOKEN_QUESTION, startMs: 1200 });
  call.send({ type: "delegation_started", delegationId: "dlg_1", turnId: "dlg_1" });
  call.completed("dlg_1", { text: RESULT_SPEECH });
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

test("context negotiated without client_delegation: context is sent, the agent turn stays on the server", async ({
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

  call.send({ type: "delegation_started", delegationId: "dlg_1", turnId: "dlg_1" });
  call.completed("dlg_1", { text: RESULT_SPEECH });
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
  expect(call.clientCapabilities).not.toContain("client_delegation");
  expect(call.clientCapabilities).not.toContain("delegation_update");
  expect(call.delegationGranted).toBe(false);
});

/** A turn that says a line, then parks on a `place_pickup_order` approval. */
function approvalParkStream(executionId: string, approvalId = "apr_order"): string {
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
      approvalId,
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

/**
 * A call with the approval decision endpoint recorded. The page is a
 * client-token widget, so Allow / Deny post to `/v1/client/approve` (with the
 * live sessionId); the owner route `/v1/agents/:id/approve` is recorded too,
 * so a decision sent anywhere else, or twice, shows up.
 */
async function approvalCall(
  page: import("@playwright/test").Page,
  context: import("@playwright/test").BrowserContext,
  options: { approvalTimeoutMs?: number } = {},
) {
  const api = await installFakeHistoryApi(context);
  const decisions: Array<Record<string, unknown>> = [];
  await context.route(/\/e2e-api\/v1\/(client\/approve|agents\/[^/]+\/approve)$/, async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    decisions.push({ ...body, route: new URL(route.request().url()).pathname.replace("/e2e-api", "") });
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      body: textTurnStream(body.decision === "approved" ? "Order placed: JB-1234." : "Okay, I won't place it.", "exec_order"),
    });
  });
  await openVoicePage(page, { voiceHost: voice.host, ...options });
  const call = await startCall(page);
  let turn = 0;
  /** One spoken order that parks on an approval; resolves with its delegation_update. */
  const order = async (approvalId: string) => {
    turn += 1;
    api.setChatStream(approvalParkStream("exec_order", approvalId));
    await call.utterance({ role: "user", turnId: `in_${turn}`, text: "Order two almond croissants", startMs: turn * 10_000 });
    call.delegate({ delegationId: `dlg_${turn}`, text: "Order two almond croissants", userUtteranceIds: [`in_${turn}`] });
    return call.waitForFrame("delegation_update", (f) => f.delegationId === `dlg_${turn}`);
  };
  const resultFor = (delegationId: string, timeoutMs?: number) =>
    call.waitForFrame("delegation_result", (f) => f.delegationId === delegationId, timeoutMs);
  return { api, call, decisions, order, resultFor };
}

test("approval lifecycle: delegation_update asks naturally, Allow, one terminal delegation_result, both read-backs folded", async ({
  page,
  context,
}) => {
  const { call, decisions, order, resultFor } = await approvalCall(page, context);
  // A speech-to-speech call says it's an AI, in the composer status line.
  await expect(page.locator("[data-persona-composer-status]")).toHaveText(
    "You're talking to an AI assistant. Voice is processed by OpenAI.",
  );

  // Parked: the non-terminal update carries the approval script (not a canned line).
  const update = await order("apr_1");
  expect(update.status).toBe("pending_approval");
  const script = String(update.text);
  expect(script).toContain("I can place that order for you.");
  expect(script).toContain("- place pickup order (Place a pickup order at the bakery)");
  expect(script).toContain("items: 2 almond croissants, 1 sourdough loaf; pickup time: today 4pm; customer name: Nathan");
  expect(script).toContain("because: The visitor asked to order for pickup");
  expect(script).toContain("ask them to approve or decline it in the chat. Don't claim it's done.");
  expect(script.length).toBeLessThanOrEqual(1_000);
  expect(call.framesOf("delegation_result")).toEqual([]);

  // GPT-Live asks; that read-back is folded (the approval card is the ask).
  call.completed("dlg_1", { final: false, text: script });
  await call.utterance({ role: "assistant", turnId: "out_ask", text: "Shall I place it? Please approve it in the chat.", startMs: 15_000 });
  const allow = page.getByRole("button", { name: "Allow", exact: true });
  await expect(allow).toBeVisible();
  await page.waitForTimeout(500);
  expect(call.framesOf("delegation_result")).toEqual([]);
  await expect(page.locator(voiceSel.bubble).filter({ hasText: "Shall I place it?" })).toHaveCount(0);

  await allow.click();
  expect(await resultFor("dlg_1")).toEqual({
    type: "delegation_result",
    delegationId: "dlg_1",
    status: "completed",
    text: "Order placed: JB-1234.",
  });
  // One card, one decision: the client-token route, with the live session (#462).
  expect(decisions).toEqual([
    expect.objectContaining({
      route: "/v1/client/approve",
      approvalId: "apr_1",
      decision: "approved",
      sessionId: expect.any(String),
    }),
  ]);
  await expect(page.locator(voiceSel.assistantBubble).filter({ hasText: "Order placed: JB-1234." })).toHaveCount(1);

  // The late result's read-back gets a fresh assistant id: folded like any other.
  call.completed("dlg_1", { final: true, text: "Order placed." });
  await call.utterance({ role: "assistant", turnId: "out_done", text: "All set, your order is placed.", startMs: 25_000 });
  await page.waitForTimeout(750);
  await expect(page.locator(voiceSel.bubble).filter({ hasText: "All set, your order" })).toHaveCount(0);

  // The whole wire for the delegation, in order.
  expect(call.frames.filter((f) => f.delegationId === "dlg_1").map((f) => `${f.type}:${f.status}`)).toEqual([
    "delegation_update:pending_approval",
    "delegation_result:completed",
  ]);
  expect(call.rejected).toEqual([]);
  await clickLiveMic(page);
  expect(await call.closed).toBe(1000);
});

test("approval: Deny in the chat closes the delegation as denied, stated plainly", async ({ page, context }) => {
  const { order, resultFor } = await approvalCall(page, context);
  await order("apr_1");
  await page.getByRole("button", { name: "Deny", exact: true }).click();
  expect(await resultFor("dlg_1")).toMatchObject({
    status: "denied",
    text: "The user declined the place pickup order request in the chat, so nothing was done.",
  });
});

test("disclosureText false hides the AI-disclosure notice", async ({ page, context }) => {
  await installFakeHistoryApi(context);
  await openVoicePage(page, { voiceHost: voice.host, disclosureText: false });
  await startCall(page);
  await page.waitForTimeout(500);
  await expect(page.locator("[data-persona-composer-status]")).not.toContainText("AI assistant");
});

test("a spoken \"cancel that\" denies the one pending approval; nothing is approved by voice", async ({
  page,
  context,
}) => {
  const { api, call, decisions, order, resultFor } = await approvalCall(page, context);
  await order("apr_1");
  const chats = api.requestsTo("chat").length;

  // "Yes" is never an approval: it runs as a normal turn and the card stays.
  api.setChatStream(textTurnStream("Please tap Allow in the chat.", "exec_yes"));
  await call.utterance({ role: "user", turnId: "in_yes", text: "Yes, do it", startMs: 20_000 });
  call.delegate({ delegationId: "dlg_yes", text: "Yes, do it", userUtteranceIds: ["in_yes"] });
  expect(await resultFor("dlg_yes")).toMatchObject({ status: "completed" });
  expect(decisions).toEqual([]);
  await expect(page.getByRole("button", { name: "Allow", exact: true })).toBeVisible();

  await call.utterance({ role: "user", turnId: "in_no", text: "No, cancel that.", startMs: 30_000 });
  call.delegate({ delegationId: "dlg_no", text: "No, cancel that.", userUtteranceIds: ["in_no"] });
  expect(await resultFor("dlg_no")).toEqual({
    type: "delegation_result",
    delegationId: "dlg_no",
    status: "denied",
    text: "Okay, I cancelled the place pickup order request. Nothing was done.",
  });
  await expect.poll(() => decisions).toEqual([expect.objectContaining({ approvalId: "apr_1", decision: "denied" })]);
  expect(api.requestsTo("chat").length).toBe(chats + 1); // only the "yes" turn ran
  // The parked delegation still closes, once, with nothing more to say.
  expect(await resultFor("dlg_1")).toEqual({ type: "delegation_result", delegationId: "dlg_1", status: "denied", text: "" });
  await page.waitForTimeout(300);
  expect(call.framesOf("delegation_result").filter((f) => f.delegationId === "dlg_1")).toHaveLength(1);
});

test("a new order for the same tool cancels the earlier pending one", async ({ page, context }) => {
  const { decisions, order, resultFor } = await approvalCall(page, context);
  await order("apr_1");
  expect(await order("apr_2")).toMatchObject({ status: "pending_approval" });
  await expect.poll(() => decisions).toEqual([expect.objectContaining({ approvalId: "apr_1", decision: "denied" })]);
  expect(await resultFor("dlg_1")).toEqual({
    type: "delegation_result",
    delegationId: "dlg_1",
    status: "cancelled",
    text: "The earlier place pickup order request was replaced by the new one; it was not done.",
  });
  // Only the newer card is still actionable.
  await expect(page.getByRole("button", { name: "Allow", exact: true })).toHaveCount(1);
});

test("an unanswered voice approval times out after approvalTimeoutMs", async ({ page, context }) => {
  const { decisions, order, resultFor } = await approvalCall(page, context, { approvalTimeoutMs: 1_500 });
  await order("apr_1");
  expect(await resultFor("dlg_1", 10_000)).toEqual({
    type: "delegation_result",
    delegationId: "dlg_1",
    status: "timeout",
    text: "That place pickup order request expired, so nothing was done.",
  });
  await expect.poll(() => decisions).toEqual([expect.objectContaining({ approvalId: "apr_1", decision: "denied" })]);
  await expect(page.getByRole("button", { name: "Allow", exact: true })).toHaveCount(0);
});

test("delegation_cancelled past the deadline: no frames for that delegation, and its approval card is declined", async ({
  page,
  context,
}) => {
  const { api, call, decisions } = await approvalCall(page, context);
  api.setChatStream(approvalParkStream("exec_order", "apr_1"));
  await call.utterance({ role: "user", turnId: "in_1", text: "Order two almond croissants", startMs: 1_000 });
  call.send({ type: "delegation_cancelled", delegationId: "dlg_unknown", reason: "session_ending" }); // unknown id: ignored
  call.delegate({ delegationId: "dlg_1", text: "Order two almond croissants", userUtteranceIds: ["in_1"] });
  const update = await call.waitForFrame("delegation_update", (f) => f.delegationId === "dlg_1");
  expect(update.status).toBe("pending_approval");
  // Unknown frames and fields from a newer server are ignored, and a warning keeps the call.
  call.send({ type: "agent_state", state: "listening" });
  call.send({ type: "warning", code: "UNKNOWN_FRAME", message: "Unknown frame: x" });

  call.send({ type: "delegation_cancelled", delegationId: "dlg_1", reason: "deadline" });
  // Like the approval TTL: the card is declined, and nothing more goes out for the id.
  await expect.poll(() => decisions).toEqual([expect.objectContaining({ approvalId: "apr_1", decision: "denied" })]);
  await expect(page.getByRole("button", { name: "Allow", exact: true })).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(call.framesOf("delegation_result")).toEqual([]);
  // The call is still up: hanging up closes it cleanly.
  await clickLiveMic(page);
  expect(await call.closed).toBe(1000);
});

test("delegation_cancelled as the call ends: the approval card stays usable", async ({ page, context }) => {
  const { call, decisions, order } = await approvalCall(page, context);
  await order("apr_1");
  call.send({ type: "delegation_cancelled", delegationId: "dlg_1", reason: "session_ending" });
  await page.waitForTimeout(300);
  expect(decisions).toEqual([]);
  await page.getByRole("button", { name: "Allow", exact: true }).click();
  await expect.poll(() => decisions).toEqual([expect.objectContaining({ approvalId: "apr_1", decision: "approved" })]);
  await expect(page.locator(voiceSel.assistantBubble).filter({ hasText: "Order placed: JB-1234." })).toHaveCount(1);
  await page.waitForTimeout(500);
  expect(call.framesOf("delegation_result")).toEqual([]);
});
