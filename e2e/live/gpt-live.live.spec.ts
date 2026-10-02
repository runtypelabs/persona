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
 *   LIVE_EXPECT_DELEGATION=0  expect the server-side path (old server) instead
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
const EXPECT_DELEGATION = process.env.LIVE_EXPECT_DELEGATION !== "0";

type Frame = { at: number; dir: "in" | "out"; json?: Record<string, unknown>; bytes?: number };

const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

test("live: spoken question → delegated chat turn → rendered answer → spoken read-back", async ({
  page,
}, testInfo) => {
  const frames: Frame[] = [];
  // Audio is high-volume: count every binary frame, log every 50th.
  const audio = { in: { frames: 0, bytes: 0 }, out: { frames: 0, bytes: 0 } };
  const consoleLines: string[] = [];
  const chatRequests: unknown[] = [];
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
      callContext: "Live e2e: the visitor is testing voice.",
    });
    await page.goto(`/voice-e2e.html?${params}`);
    await expect(page.locator(".persona-widget-container")).toBeVisible();

    // Start the call; the WAV starts playing as the mic opens.
    await page.locator("[data-persona-composer-mic]").click();
    await expect.poll(() => json("in", "session_config").length, { timeout: 20_000 }).toBeGreaterThan(0);
    const config = json("in", "session_config")[0]!;
    expect(config.speechMode).toBe("speech_to_speech");
    expect(Boolean(config.clientDelegation)).toBe(EXPECT_DELEGATION);
    if (config.contextFrames === true) {
      await expect.poll(() => json("out", "context").length).toBe(1);
    } else {
      expect(json("out", "context")).toEqual([]);
    }

    // GPT-Live transcribes the question.
    await expect
      .poll(() => json("in", "transcript_update").some((f) => f.role === "user" && f.final && QUESTION.test(String(f.text))), {
        timeout: 45_000,
      })
      .toBe(true);
    const userText = String(
      json("in", "transcript_update").find((f) => f.role === "user" && f.final && QUESTION.test(String(f.text)))!.text,
    );
    await expect(
      page.locator('[data-message-id][data-persona-theme-zone="user-message"]').filter({ hasText: QUESTION }),
    ).toHaveCount(1);

    if (EXPECT_DELEGATION) {
      await expect.poll(() => json("in", "delegation_requested").length, { timeout: 45_000 }).toBeGreaterThan(0);
      const requested = json("in", "delegation_requested")[0]!;
      await expect.poll(() => json("out", "delegation_result").length, { timeout: 60_000 }).toBeGreaterThan(0);
      const result = json("out", "delegation_result")[0]!;
      expect(result.turnId).toBe(requested.turnId);
      expect(result.ok).toBe(true);
      expect(String(result.text)).toMatch(ANSWER);

      // Exactly one chat submission, carrying the spoken request once.
      expect(chatRequests).toHaveLength(1);
      const sent = JSON.stringify(chatRequests[0]);
      const spoken = String(requested.userText ?? userText);
      expect(sent.split(spoken).length - 1).toBe(1);

      // The answer renders as a normal assistant message.
      const answer = page
        .locator('[data-message-id][data-persona-theme-zone="assistant-message"]')
        .filter({ hasText: ANSWER });
      await expect(answer.first()).toBeVisible();

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
    } else {
      // Server-side delegation: the spoken reply is the rendered answer.
      await expect
        .poll(() => json("in", "delegation_completed").length, { timeout: 60_000 })
        .toBeGreaterThan(0);
      expect(json("out", "delegation_result")).toEqual([]);
      expect(chatRequests).toHaveLength(0);
    }

    // Hang up (force: the live level animation never lets the button settle).
    await page.locator("[data-persona-composer-mic]").click({ force: true });
    await expect.poll(() => voiceSocket?.isClosed() ?? false).toBe(true);
    expect(json("in", "error")).toEqual([]);
  } finally {
    await page.screenshot({ path: testInfo.outputPath("final.png"), fullPage: true }).catch(() => {});
    const fs = await import("node:fs/promises");
    await fs.writeFile(testInfo.outputPath("frames.json"), JSON.stringify({ audio, frames }, null, 2));
    await fs.writeFile(testInfo.outputPath("console.txt"), consoleLines.join("\n"));
    await fs.writeFile(testInfo.outputPath("chat-requests.json"), JSON.stringify(chatRequests, null, 2));
    console.log(`live artifacts: ${testInfo.outputDir}`);
  }
});
