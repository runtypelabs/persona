import { expect, test, type WebSocket as PwWebSocket } from "@playwright/test";

/**
 * LIVE: a spoken question (a WAV file used as Chrome's microphone) through
 * real GPT-Live, delegated to the widget's chat pipeline (client delegation),
 * answered, and read back.
 *
 * Configure with env (defaults target the local gpt-live-host.mts):
 *   LIVE_VOICE_HOST     voice socket base  (ws://127.0.0.1:4399)
 *   LIVE_API_URL        widget apiUrl for chat (http://127.0.0.1:4399, the host's local agent)
 *   LIVE_CLIENT_TOKEN   client token        (ct_live_local)
 *   LIVE_AGENT_ID       agent id            (agent_live_local)
 *   LIVE_QUESTION       regex the user transcript must match (hours)
 *   LIVE_ANSWER         regex the rendered answer must match (Monday|hours|open)
 *   LIVE_TYPED          a message typed before the call (must reach `context`); "" skips it
 *   LIVE_CALL_CONTEXT   host callContext string; "" sends none
 *   LIVE_EXPECT_DELEGATION=0  expect the server-side path (old server) instead
 *   LIVE_EXPECT_SMALL_TALK=1  the question is small talk ("Who are you?"): GPT-Live
 *                             answers itself, nothing is delegated, the reply renders
 *   LIVE_EXPECT_USER_TURN_ID=0  core predates Amendment 2 (no userTurnId)
 *   LIVE_ALLOW_UNPROMPTED=1     tolerate GPT-Live speaking before the visitor
 *
 * Artifacts land in e2e/live/.out/results: frames.json (every voice frame both
 * ways, audio as byte counts), console.txt, chat-requests.json, final.png, and
 * a Playwright trace.
 */

const env = (key: string, fallback: string) => process.env[key] || fallback;
const VOICE_HOST = env("LIVE_VOICE_HOST", "ws://127.0.0.1:4399");
const API_URL = env("LIVE_API_URL", "http://127.0.0.1:4399");
const CLIENT_TOKEN = env("LIVE_CLIENT_TOKEN", "ct_live_local");
const AGENT_ID = env("LIVE_AGENT_ID", "agent_live_local");
const QUESTION = new RegExp(env("LIVE_QUESTION", "hours"), "i");
const ANSWER = new RegExp(env("LIVE_ANSWER", "Monday|hours|open"), "i");
// Set to "" to skip the typed turn (and with LIVE_CALL_CONTEXT="" send no context).
const TYPED = process.env.LIVE_TYPED ?? "Do you sell gift cards?";
const CALL_CONTEXT = process.env.LIVE_CALL_CONTEXT ?? "Live e2e: the visitor is testing voice.";
const EXPECT_DELEGATION = process.env.LIVE_EXPECT_DELEGATION !== "0";
const EXPECT_SMALL_TALK = process.env.LIVE_EXPECT_SMALL_TALK === "1";

type Frame = { at: number; dir: "in" | "out"; json?: Record<string, unknown>; bytes?: number };

const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

test("live: spoken question → delegated chat turn → rendered answer → spoken read-back", async ({
  page,
}, testInfo) => {
  const frames: Frame[] = [];
  // Audio is high-volume: count every binary frame, log every 50th.
  const audio = { in: { frames: 0, bytes: 0 }, out: { frames: 0, bytes: 0 } };
  // Speech-recognition wording is GPT-Live's, not ours: a mismatch is recorded,
  // never a failure. Pass = delegation → result → rendered answer.
  const warnings: string[] = [];
  const warn = (message: string) => {
    warnings.push(message);
    testInfo.annotations.push({ type: "warning", description: message });
  };
  const consoleLines: string[] = [];
  const chatRequests: Array<{ messages?: Array<{ role?: string; content?: unknown }> }> = [];
  const t0 = Date.now();
  page.on("console", (m) => consoleLines.push(`${Date.now() - t0}ms [${m.type()}] ${m.text()}`));
  page.on("request", (request) => {
    if (/\/v1\/client\/chat$/.test(new URL(request.url()).pathname)) {
      chatRequests.push(request.postDataJSON());
    }
  });
  let voiceSocket: PwWebSocket | undefined;
  page.on("websocket", (ws) => {
    if (!/\/ws\/agents\/[^/]+\/voice/.test(ws.url())) return;
    voiceSocket = ws;
    const record = (dir: "in" | "out") => (event: { payload: string | Buffer }) => {
      if (typeof event.payload === "string") {
        try {
          frames.push({ at: Date.now() - t0, dir, json: JSON.parse(event.payload) });
        } catch {
          frames.push({ at: Date.now() - t0, dir, json: { raw: event.payload } });
        }
      } else {
        audio[dir].frames += 1;
        audio[dir].bytes += event.payload.length;
        if (audio[dir].frames % 50 === 1) frames.push({ at: Date.now() - t0, dir, bytes: event.payload.length });
      }
    };
    ws.on("framereceived", record("in"));
    ws.on("framesent", record("out"));
  });
  const json = (dir: "in" | "out", type: string) =>
    frames.filter((f) => f.dir === dir && f.json?.type === type).map((f) => f.json!);

  try {
    const params = new URLSearchParams({
      voiceHost: VOICE_HOST,
      apiUrl: API_URL,
      clientToken: CLIENT_TOKEN,
      agentId: AGENT_ID,
    });
    if (CALL_CONTEXT) params.set("callContext", CALL_CONTEXT);
    await page.goto(`/voice-e2e.html?${params}`);
    await expect(page.locator(".persona-widget-container")).toBeVisible();

    // A typed turn first, so the call-start context has history to carry.
    if (TYPED) {
      const input = page.locator(".persona-widget-footer textarea").first();
      await input.fill(TYPED);
      await input.press("Enter");
      await expect.poll(() => chatRequests.length).toBe(1);
      await expect(page.locator('[data-message-id][data-persona-theme-zone="assistant-message"]')).toHaveCount(1);
    }
    const typedRequests = chatRequests.length;

    // Start the call; the WAV starts playing as the mic opens.
    await page.locator("[data-persona-composer-mic]").click();
    await expect.poll(() => json("in", "session_config").length, { timeout: 20_000 }).toBeGreaterThan(0);
    const config = json("in", "session_config")[0]!;
    expect(config.speechMode).toBe("speech_to_speech");
    expect(Boolean(config.clientDelegation)).toBe(EXPECT_DELEGATION);
    if (config.contextFrames === true && (TYPED || CALL_CONTEXT)) {
      // Held until the visitor first speaks (or the first delegation request).
      await expect.poll(() => json("out", "context").length, { timeout: 45_000 }).toBe(1);
      const contextAt = frames.findIndex((f) => f.dir === "out" && f.json?.type === "context");
      const releasedBy = frames.findIndex(
        (f) =>
          f.dir === "in" &&
          ((f.json?.type === "transcript_update" && f.json.role === "user") || f.json?.type === "delegation_requested"),
      );
      expect(releasedBy, "context went out before the visitor spoke").toBeGreaterThanOrEqual(0);
      expect(releasedBy).toBeLessThan(contextAt);
      const contextText = String(json("out", "context")[0]!.text);
      if (TYPED) {
        expect(contextText).toContain("Conversation so far:");
        expect(contextText).toContain(`User: ${TYPED}`);
        expect(contextText).toMatch(/\nAssistant: \S/);
      }
      if (CALL_CONTEXT) expect(contextText).toContain(CALL_CONTEXT);
    } else {
      expect(json("out", "context")).toEqual([]);
    }

    // GPT-Live hears the visitor (its wording may differ from the WAV).
    await expect
      .poll(() => json("in", "transcript_update").some((f) => f.role === "user" && f.final), { timeout: 45_000 })
      .toBe(true);
    const userFinals = json("in", "transcript_update").filter((f) => f.role === "user" && f.final);
    if (!userFinals.some((f) => QUESTION.test(String(f.text)))) {
      warn(`user transcript ${JSON.stringify(userFinals.map((f) => f.text))} does not match ${QUESTION}`);
    }
    // The context frame is background: GPT-Live must not answer it. Nothing
    // assistant-side may start before the visitor's first words.
    if (process.env.LIVE_ALLOW_UNPROMPTED !== "1") {
      const firstUser = frames.findIndex((f) => f.json?.type === "transcript_update" && f.json.role === "user");
      const unprompted = frames
        .slice(0, firstUser)
        .filter((f) => f.json?.type === "transcript_update" && f.json.role === "assistant")
        .map((f) => String(f.json!.text));
      expect(unprompted, "GPT-Live spoke before the visitor did").toEqual([]);
    }
    const userText = String((userFinals.find((f) => QUESTION.test(String(f.text))) ?? userFinals[0]!).text);
    await expect(page.locator('[data-message-id][data-persona-theme-zone="user-message"]')).toHaveCount(
      (TYPED ? 1 : 0) + 1,
    );

    if (EXPECT_SMALL_TALK) {
      // GPT-Live answers from its own identity: a final assistant reply that
      // renders as a bubble, and no delegation or chat submission at all.
      const userFinalAt = frames.find(
        (f) => f.json?.type === "transcript_update" && f.json.role === "user" && f.json.final,
      )!.at;
      const replyText = () =>
        frames
          .filter((f) => f.at > userFinalAt - 2_000 && f.json?.type === "transcript_update" && f.json.role === "assistant" && f.json.final)
          .map((f) => String(f.json!.text))
          .find((text) => ANSWER.test(text));
      await expect.poll(replyText, { timeout: 30_000 }).toBeTruthy();
      // A late delegation would land within seconds of the reply: wait 10 s.
      await page.waitForTimeout(10_000);
      expect(json("in", "delegation_requested")).toEqual([]);
      expect(json("in", "delegation_started")).toEqual([]);
      expect(json("out", "delegation_result")).toEqual([]);
      expect(chatRequests).toHaveLength(typedRequests);
      await expect(
        page.locator('[data-message-id][data-persona-theme-zone="assistant-message"]').filter({ hasText: ANSWER }).first(),
      ).toBeVisible();
      testInfo.annotations.push({ type: "reply", description: replyText() ?? "" });
    } else if (EXPECT_DELEGATION) {
      await expect.poll(() => json("in", "delegation_requested").length, { timeout: 45_000 }).toBeGreaterThan(0);
      const requested = json("in", "delegation_requested")[0]!;
      // Amendment 2: the request names the user utterance it came from.
      if (process.env.LIVE_EXPECT_USER_TURN_ID !== "0") {
        const userTurnIds = new Set(
          json("in", "transcript_update").filter((f) => f.role === "user").map((f) => f.turnId),
        );
        expect(requested.userTurnId).toBeTruthy();
        expect(userTurnIds.has(requested.userTurnId)).toBe(true);
        const heard = String(
          json("in", "transcript_update").find((f) => f.turnId === requested.userTurnId && f.final)?.text ??
            requested.userText,
        );
        if (!QUESTION.test(heard)) warn(`delegated utterance "${heard}" does not match ${QUESTION}`);
      }
      await expect.poll(() => json("out", "delegation_result").length, { timeout: 60_000 }).toBeGreaterThan(0);
      const result = json("out", "delegation_result")[0]!;
      expect(result.turnId).toBe(requested.turnId);
      expect(result.ok).toBe(true);
      expect(String(result.text).trim()).not.toBe("");
      if (!ANSWER.test(String(result.text))) warn(`result text does not match ${ANSWER}`);

      // Exactly one delegated chat submission (after the typed one), carrying
      // the spoken request once, as its LAST message, with none of GPT-Live's
      // own captions (filler) in the history.
      expect(chatRequests).toHaveLength(typedRequests + 1);
      const messages = (chatRequests[typedRequests]!.messages ?? []).map((m) => ({
        role: String(m.role),
        text: typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? ""),
      }));
      const spoken = normalize(String(requested.userText ?? userText));
      expect(messages.filter((m) => normalize(m.text).includes(spoken))).toHaveLength(1);
      expect(messages.at(-1)?.role).toBe("user");
      expect(normalize(messages.at(-1)!.text)).toContain(spoken);
      expect(messages.at(-1)!.text).toBe(messages.at(-1)!.text.trim());
      const captions = json("in", "transcript_update")
        .filter((f) => f.role === "assistant" && String(f.text).trim())
        .map((f) => normalize(String(f.text)));
      for (const message of messages) {
        for (const caption of captions) expect(normalize(message.text)).not.toBe(caption);
      }

      // The answer renders as a normal assistant message (the result's first
      // line, as rendered text: Markdown syntax stripped).
      const firstLine = String(result.text).split("\n").find((line) => line.trim())!.replace(/[*_`#>-]/g, "").trim();
      await expect
        .poll(async () =>
          (await page.locator('[data-message-id][data-persona-theme-zone="assistant-message"]').allTextContents())
            .map(normalize)
            .some((text) => text.includes(normalize(firstLine))),
        )
        .toBe(true);

      // GPT-Live reads it back; that read-back is folded, not a second bubble.
      await expect
        .poll(() => json("in", "delegation_completed").some((f) => f.turnId === requested.turnId), { timeout: 30_000 })
        .toBe(true);
      const completedAt = frames.find((f) => f.json?.type === "delegation_completed")!.at;
      await expect
        .poll(
          () => frames.some((f) => f.at > completedAt && f.json?.type === "transcript_update" && f.json.role === "assistant" && f.json.final),
          { timeout: 30_000 },
        )
        .toBe(true);
      const readback = frames
        .filter((f) => f.at > completedAt && f.json?.type === "transcript_update" && f.json.role === "assistant" && f.json.final)
        .map((f) => normalize(String(f.json!.text)));
      await page.waitForTimeout(1_000);
      const bubbles = await page
        .locator('[data-message-id][data-persona-theme-zone="assistant-message"]')
        .allTextContents();
      for (const spokenReadback of readback) {
        expect(bubbles.map(normalize)).not.toContain(spokenReadback);
      }
      // Amendment 2: only the FIRST new assistant turnId after completion is
      // the read-back. Any later, separate utterance (a follow-up) renders.
      const seenBefore = new Set(
        frames.filter((f) => f.at <= completedAt && f.json?.type === "transcript_update").map((f) => f.json!.turnId),
      );
      const newIds = [
        ...new Set(
          frames
            .filter((f) => f.at > completedAt && f.json?.type === "transcript_update" && f.json.role === "assistant")
            .map((f) => f.json!.turnId)
            .filter((id) => !seenBefore.has(id)),
        ),
      ];
      const followUps = newIds.slice(1).flatMap((id) => {
        const last = frames.filter((f) => f.json?.turnId === id && f.json?.role === "assistant").at(-1);
        return last && String(last.json!.text).trim() ? [normalize(String(last.json!.text))] : [];
      });
      testInfo.annotations.push({ type: "follow-ups", description: JSON.stringify(followUps) });
      for (const followUp of followUps) {
        await expect
          .poll(async () =>
            (await page.locator('[data-message-id][data-persona-theme-zone="assistant-message"]').allTextContents())
              .map(normalize)
              .some((text) => text.includes(followUp)),
          )
          .toBe(true);
      }
    } else {
      // Server-side delegation: the spoken reply is the rendered answer.
      await expect
        .poll(() => json("in", "delegation_completed").length, { timeout: 60_000 })
        .toBeGreaterThan(0);
      expect(json("out", "delegation_result")).toEqual([]);
      expect(chatRequests).toHaveLength(typedRequests);
    }

    // Hang up (force: the live level animation never lets the button settle).
    await page.locator("[data-persona-composer-mic]").click({ force: true });
    await expect.poll(() => voiceSocket?.isClosed() ?? false).toBe(true);
    expect(json("in", "error")).toEqual([]);
  } finally {
    await page.screenshot({ path: testInfo.outputPath("final.png"), fullPage: true }).catch(() => {});
    const fs = await import("node:fs/promises");
    // The local host's upstream GPT-Live event log (types + timestamps only), for
    // telling a GPT-Live no-show from a core hold-up. Absent against real core.
    let upstream: unknown = null;
    try {
      const hostFrames = await fetch(VOICE_HOST.replace(/^ws/, "http") + "/frames");
      if (hostFrames.ok) {
        const { calls } = (await hostFrames.json()) as { calls: Array<{ upstream?: Array<{ at: number }> }> };
        upstream = (calls.at(-1)?.upstream ?? []).map((event) => ({ ...event, at: event.at - t0 }));
      }
    } catch {
      // Not the local host.
    }
    await fs.writeFile(
      testInfo.outputPath("frames.json"),
      JSON.stringify({ audio, warnings, upstream, frames }, null, 2),
    );
    await fs.writeFile(testInfo.outputPath("console.txt"), consoleLines.join("\n"));
    await fs.writeFile(testInfo.outputPath("chat-requests.json"), JSON.stringify(chatRequests, null, 2));
    console.log(`live artifacts: ${testInfo.outputDir}`);
  }
});
