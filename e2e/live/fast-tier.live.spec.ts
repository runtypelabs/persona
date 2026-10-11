import { expect, test } from "@playwright/test";

/**
 * LIVE (skipped unless LIVE_FAST_TIER=1): the voice fast tier against a real
 * server. One call, one WAV holding several spoken commands for the slide deck
 * on `voice-e2e.html?slides=1`. For each heard utterance it measures speech end
 * to first spoken audio, and records whether the server answered it on the direct
 * route (`client_tool_call`, then `delegation_completed.route`) or handed it to the
 * chat pipeline. Writes `fast-tier.json` next to the other artifacts.
 *
 * Env (see e2e/live/README.md, "Fast tier"):
 *   LIVE_FAST_TIER=1           run this spec
 *   LIVE_VOICE_HOST, LIVE_API_URL, LIVE_CLIENT_TOKEN, LIVE_AGENT_ID   as the main spec
 *   LIVE_UTTERANCES            expected commands, "|"-separated
 *                              (Next slide|Jump to the pricing slide|What's on slide three)
 *   LIVE_EXPECT_DIRECT=1       fail unless every heard utterance got a client_tool_call
 *   LIVE_TURN_WAIT_MS          quiet time after the last utterance before hanging up (15000)
 */

const env = (key: string, fallback: string) => process.env[key] || fallback;
const VOICE_HOST = env("LIVE_VOICE_HOST", "ws://127.0.0.1:4399");
const API_URL = env("LIVE_API_URL", "http://127.0.0.1:4399");
const CLIENT_TOKEN = env("LIVE_CLIENT_TOKEN", "ct_live_local");
const AGENT_ID = env("LIVE_AGENT_ID", "agent_live_local");
const UTTERANCES = env("LIVE_UTTERANCES", "Next slide|Jump to the pricing slide|What's on slide three")
  .split("|")
  .map((text) => text.trim())
  .filter(Boolean);
const EXPECT_DIRECT = process.env.LIVE_EXPECT_DIRECT === "1";
const TURN_WAIT_MS = Number(env("LIVE_TURN_WAIT_MS", "15000"));

type Json = Record<string, unknown>;
type Frame = { at: number; dir: "in" | "out"; json: Json };

/** One heard utterance and what followed it, until the next one (ms since call start). */
type Turn = {
  text: string;
  heardAt: number;
  /** Speech end on the server's clock (`endMs`), mapped to the page clock via session_config. */
  speechEndAt: number | null;
  firstAudioAt: number | null;
  /** Speech end (endMs when present, else the final transcript's arrival) to first audio. */
  speechEndToFirstAudioMs: number | null;
  route: string | null;
  clientToolCall: { name: unknown; arguments: unknown; at: number } | null;
  clientToolResult: { status: unknown; at: number } | null;
  delegationCompletedAt: number | null;
  answerAudioAt: number | null;
  readout: string | null;
};

test.skip(process.env.LIVE_FAST_TIER !== "1", "set LIVE_FAST_TIER=1 to run the fast-tier measurement");

test("live fast tier: spoken slide commands, direct route vs client path, speech end to first audio", async ({
  page,
}, testInfo) => {
  const t0 = Date.now();
  const frames: Frame[] = [];
  const audioInAt: number[] = [];
  page.on("websocket", (ws) => {
    if (!/\/ws\/agents\/[^/]+\/voice/.test(ws.url())) return;
    const record = (dir: "in" | "out") => (event: { payload: string | Buffer }) => {
      const at = Date.now() - t0;
      if (typeof event.payload !== "string") {
        if (dir === "in") audioInAt.push(at);
        return;
      }
      try {
        frames.push({ at, dir, json: JSON.parse(event.payload) as Json });
      } catch {
        // Not JSON: not a control frame.
      }
    };
    ws.on("framereceived", record("in"));
    ws.on("framesent", record("out"));
  });
  const json = (dir: "in" | "out", type: string) => frames.filter((f) => f.dir === dir && f.json.type === type);

  let turns: Turn[] = [];
  try {
    const params = new URLSearchParams({
      voiceHost: VOICE_HOST,
      apiUrl: API_URL,
      clientToken: CLIENT_TOKEN,
      agentId: AGENT_ID,
      slides: "1",
    });
    await page.goto(`/voice-e2e.html?${params}`);
    await expect(page.locator("#demo-slides")).toHaveText(/Slide 1 of 6/);
    await page.locator("[data-persona-composer-mic]").click();

    await expect.poll(() => json("in", "session_config").length, { timeout: 20_000 }).toBeGreaterThan(0);
    const config = json("in", "session_config")[0]!;
    const capabilities = Array.isArray(config.json.capabilities) ? (config.json.capabilities as string[]) : [];
    testInfo.annotations.push({ type: "capabilities", description: capabilities.join(",") });
    expect(capabilities, "the server did not negotiate the fast tier").toEqual(
      expect.arrayContaining(["client_delegation", "client_tools"]),
    );
    await expect.poll(() => json("out", "client_tools").length, { timeout: 10_000 }).toBeGreaterThan(0);
    const toolNames = (json("out", "client_tools")[0]!.json.tools as Array<{ name: string }>).map((t) => t.name);
    expect(toolNames).toEqual(expect.arrayContaining(["webmcp:next_slide", "webmcp:jump_to_slide", "webmcp:get_slide"]));

    // Wait for every expected utterance (GPT-Live may split or merge them), then a quiet tail.
    const heard = () =>
      [...new Map(
        json("in", "transcript_update")
          .filter((f) => f.json.role === "user" && f.json.final === true)
          .map((f) => [String(f.json.utteranceId ?? f.json.turnId), f]),
      ).values()];
    await expect
      .poll(() => heard().length, { timeout: 30_000 + UTTERANCES.length * 20_000, message: "fewer utterances heard than spoken" })
      .toBeGreaterThanOrEqual(UTTERANCES.length);
    await page.waitForTimeout(TURN_WAIT_MS);

    const sessionAt = config.at;
    const userFinals = heard().sort((a, b) => a.at - b.at);
    const utteranceOf = (f: Frame) => String(f.json.utteranceId ?? f.json.turnId);
    // Attribute each delegation (keyed by delegationId) to exactly one utterance: the one a delegation_started
    // input names, else (a direct turn) the last final user utterance heard before its client_tool_call,
    // which is the utterance the widget records for it. The first delegation to claim an utterance keeps it.
    const delegationFor = new Map<string, string>();
    for (const f of frames) {
      const delegationId = f.json.delegationId;
      if (f.dir !== "in" || typeof delegationId !== "string") continue;
      if (f.json.type !== "client_tool_call" && f.json.type !== "delegation_started") continue;
      if ([...delegationFor.values()].includes(delegationId)) continue;
      const named = (f.json.input as { userUtteranceIds?: unknown[] } | undefined)?.userUtteranceIds?.at(-1);
      const before = userFinals.filter((u) => u.at <= f.at).at(-1);
      const utterance = typeof named === "string" ? named : before ? utteranceOf(before) : undefined;
      if (utterance !== undefined && !delegationFor.has(utterance)) delegationFor.set(utterance, delegationId);
    }
    turns = userFinals.map((final, i) => {
      const end = userFinals[i + 1]?.at ?? Infinity;
      const delegationId = delegationFor.get(utteranceOf(final));
      const ofDelegation = (dir: "in" | "out", type: string) =>
        delegationId === undefined
          ? undefined
          : frames.find((f) => f.dir === dir && f.json.type === type && f.json.delegationId === delegationId);
      const call = ofDelegation("in", "client_tool_call");
      const result = ofDelegation("out", "client_tool_result");
      const started = ofDelegation("in", "delegation_started");
      const completed = ofDelegation("in", "delegation_completed");
      const route = completed?.json.route === "direct" ? "direct" : call && started ? "direct -> client" : started ? "client" : null;
      const endMs = typeof final.json.endMs === "number" ? final.json.endMs : null;
      const speechEndAt = endMs === null ? null : sessionAt + endMs;
      const anchor = speechEndAt ?? final.at;
      const firstAudioAt = audioInAt.find((at) => at > anchor && at < end) ?? null;
      const answerAudioAt = completed ? (audioInAt.find((at) => at > completed.at && at < end) ?? null) : null;
      return {
        text: String(final.json.text ?? ""),
        heardAt: final.at,
        speechEndAt,
        firstAudioAt,
        speechEndToFirstAudioMs: firstAudioAt === null ? null : firstAudioAt - anchor,
        route,
        clientToolCall: call ? { name: call.json.name, arguments: call.json.arguments, at: call.at } : null,
        clientToolResult: result ? { status: result.json.status, at: result.at } : null,
        delegationCompletedAt: completed?.at ?? null,
        answerAudioAt,
        readout: completed ? String(completed.json.text ?? "") : null,
      };
    });

    testInfo.annotations.push({ type: "utterances", description: `${turns.length} heard / ${UTTERANCES.length} spoken` });
    for (const [i, turn] of turns.entries()) {
      testInfo.annotations.push({
        type: `utterance ${i + 1}`,
        description: `"${turn.text}" route=${turn.route ?? "none"} client_tool_call=${turn.clientToolCall ? String(turn.clientToolCall.name) : "no"} result=${turn.clientToolResult ? String(turn.clientToolResult.status) : "-"} speech-end->first-audio=${turn.speechEndToFirstAudioMs ?? "?"}ms`,
      });
    }
    if (EXPECT_DIRECT) {
      expect(turns.filter((turn) => !turn.clientToolCall).map((turn) => turn.text), "utterances the server did not answer directly").toEqual([]);
    }

    await page.locator("[data-persona-composer-mic]").click({ force: true });
    expect(json("in", "error").map((f) => f.json)).toEqual([]);
  } finally {
    const fs = await import("node:fs/promises");
    await fs.writeFile(
      testInfo.outputPath("fast-tier.json"),
      JSON.stringify({ spoken: UTTERANCES, heard: turns.length, turns, audioIn: audioInAt.length, frames }, null, 2),
    );
    await page.screenshot({ path: testInfo.outputPath("final.png"), fullPage: true }).catch(() => {});
    console.log(`fast-tier artifacts: ${testInfo.outputDir}`);
  }
});
