import { expect, test } from "@playwright/test";

/**
 * LIVE (skipped unless LIVE_BENTO=1): the Bento Slides example's voice
 * presenter against a real server. Loads a five-slide deck, starts the show,
 * opens the GPT-Live call through the page's own Copilot (`?runtype=<preset>`
 * picks the agent), and feeds a WAV of spoken presenter commands through the
 * fake mic. For each delegation the server opens it records whether it was answered
 * on the direct route (`client_tool_call`, then `delegation_completed{route:
 * 'direct'}` with the spoken readout) or handed it to the chat pipeline.
 * Writes `bento-direct-tools.json` next to the other artifacts, including each
 * outbound mic frame's send time and RMS level so speech end can be located.
 *
 * Serve the example first (the config reuses a server already on E2E_PORT):
 *   pnpm --filter bento-slides dev --port 4471 --strictPort --host 127.0.0.1
 *
 * Env:
 *   LIVE_BENTO=1             run this spec
 *   E2E_PORT=4471            where the example is served
 *   LIVE_BENTO_PRESET        `?runtype=` preset (staging)
 *   LIVE_UTTERANCES          expected commands, "|"-separated
 *   LIVE_EXPECT_DIRECT=1     fail unless every delegation was answered directly
 *   LIVE_TURN_WAIT_MS        quiet time after the last utterance before hanging up (15000)
 */

const env = (key: string, fallback: string) => process.env[key] || fallback;
const PRESET = env("LIVE_BENTO_PRESET", "staging");
const UTTERANCES = env(
  "LIVE_UTTERANCES",
  "Next slide|Go to the pricing slide|What's on this slide|Give me the deck overview|Exit presenter mode",
)
  .split("|")
  .map((text) => text.trim())
  .filter(Boolean);
const EXPECT_DIRECT = process.env.LIVE_EXPECT_DIRECT === "1";
const TURN_WAIT_MS = Number(env("LIVE_TURN_WAIT_MS", "15000"));

const text = (html: string, y: number, fontSize: number) => ({ type: "text", html, x: 96, y, w: 1088, fontSize });
const DECK = {
  compact: true,
  title: "Crumb & Co pitch",
  slides: [
    { name: "Welcome", elements: [text("Crumb &amp; Co", 220, 72), text("Neighbourhood bakery, est. 2019", 360, 32)] },
    { name: "Agenda", elements: [text("Agenda", 96, 56), text("Who we are<br>What we bake<br>Pricing<br>Next steps", 220, 32)] },
    { name: "Product tour", elements: [text("Product tour", 96, 56), text("Sourdough, almond croissants, seasonal tarts and the new rye loaf", 220, 32)] },
    { name: "Pricing", elements: [text("Pricing", 96, 56), text("Loaf 6 dollars. Box of six pastries 18 dollars. Weekly bread club 20 dollars", 220, 32)] },
    { name: "Thank you", elements: [text("Thank you", 260, 72)] },
  ],
};

type Json = Record<string, unknown>;
type Frame = { at: number; dir: "in" | "out"; json: Json };

test.skip(process.env.LIVE_BENTO !== "1", "set LIVE_BENTO=1 to run the Bento direct-tools measurement");

test("live Bento presenter: spoken commands answered on the direct route", async ({ page }, testInfo) => {
  test.setTimeout(60_000 + UTTERANCES.length * 30_000);
  const t0 = Date.now();
  const frames: Frame[] = [];
  const audioInAt: number[] = [];
  /** Each outbound mic frame: when it was sent and its RMS level (PCM16), to find where speech ends. */
  const audioOut: Array<{ at: number; rms: number }> = [];
  page.on("websocket", (ws) => {
    if (!/\/ws\/agents\/[^/]+\/voice/.test(ws.url())) return;
    const record = (dir: "in" | "out") => (event: { payload: string | Buffer }) => {
      const at = Date.now() - t0;
      if (typeof event.payload !== "string") {
        if (dir === "in") audioInAt.push(at);
        else audioOut.push({ at, rms: rms16(event.payload) });
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

  /** One delegation the server opened: answered directly, or handed to the chat pipeline. */
  type Delegation = {
    delegationId: string;
    route: "direct" | "direct -> client" | "client";
    tool: unknown;
    arguments: unknown;
    toolStatus: unknown;
    callToCompletedMs: number | null;
    completedToAudioMs: number | null;
    readout: string | null;
  };
  let heardTexts: string[] = [];
  let delegations: Delegation[] = [];
  try {
    await page.goto(`/?runtype=${PRESET}`);
    await page.waitForFunction(() => Boolean((window as unknown as { bento?: { ai?: unknown } }).bento?.ai));
    const report = await page.evaluate(
      (deck) => (window as unknown as { bento: { loadDoc(json: string): unknown } }).bento.loadDoc(JSON.stringify(deck)),
      DECK,
    );
    expect(report, "the test deck did not load").toBeTruthy();

    await page.getByRole("button", { name: /slideshow/i }).first().click();
    await page.waitForTimeout(1_000);
    const started = await page.evaluate(() => (window as unknown as { bento: { ai: { call(): boolean } } }).bento.ai.call());
    expect(started, "the Copilot call did not start").toBe(true);

    await expect.poll(() => json("in", "session_config").length, { timeout: 20_000 }).toBeGreaterThan(0);
    const capabilities = (json("in", "session_config")[0]!.json.capabilities as string[] | undefined) ?? [];
    expect(capabilities).toEqual(expect.arrayContaining(["client_delegation", "client_tools"]));
    await expect.poll(() => json("out", "client_tools").length, { timeout: 10_000 }).toBeGreaterThan(0);
    const offered = (json("out", "client_tools").at(-1)!.json.tools as Array<{ name: string }>).map((t) => t.name);
    testInfo.annotations.push({ type: "tools", description: offered.join(",") });
    expect(offered).toEqual(expect.arrayContaining(["webmcp:next_slide", "webmcp:jump_to_slide", "webmcp:get_slide"]));

    const heard = () =>
      [...new Map(
        json("in", "transcript_update")
          .filter((f) => f.json.role === "user" && f.json.final === true)
          .map((f) => [String(f.json.utteranceId ?? f.json.turnId), f]),
      ).values()].sort((a, b) => a.at - b.at);
    await expect
      .poll(() => heard().length, { timeout: 30_000 + UTTERANCES.length * 20_000, message: "fewer utterances heard than spoken" })
      .toBeGreaterThanOrEqual(UTTERANCES.length);
    await page.waitForTimeout(TURN_WAIT_MS);

    heardTexts = heard().map((f) => String(f.json.text ?? ""));
    const ids = [...new Set(
      frames
        .filter((f) => f.dir === "in" && (f.json.type === "client_tool_call" || f.json.type === "delegation_started"))
        .map((f) => String(f.json.delegationId)),
    )];
    const first = (dir: "in" | "out", type: string, id: string) =>
      frames.find((f) => f.dir === dir && f.json.type === type && f.json.delegationId === id);
    delegations = ids.map((id) => {
      const call = first("in", "client_tool_call", id);
      const completed = first("in", "delegation_completed", id);
      const direct = completed?.json.route === "direct";
      const audio = direct ? audioInAt.find((at) => at > completed!.at) : undefined;
      return {
        delegationId: id,
        route: direct ? "direct" : call ? "direct -> client" : "client",
        tool: call?.json.name ?? null,
        arguments: call?.json.arguments ?? null,
        toolStatus: first("out", "client_tool_result", id)?.json.status ?? null,
        callToCompletedMs: call && completed ? completed.at - call.at : null,
        completedToAudioMs: direct && audio !== undefined ? audio - completed!.at : null,
        readout: direct && typeof completed!.json.text === "string" ? completed!.json.text : null,
      };
    });
    testInfo.annotations.push({ type: "heard", description: heardTexts.join(" | ") });
    for (const d of delegations) {
      testInfo.annotations.push({
        type: d.route,
        description: `${String(d.tool ?? "-")} ${JSON.stringify(d.arguments)} status=${String(d.toolStatus)} readout=${JSON.stringify(d.readout)}`,
      });
    }
    expect(delegations.some((d) => d.route === "direct"), "no utterance was answered on the direct route").toBe(true);
    if (EXPECT_DIRECT) {
      expect(delegations.filter((d) => d.route !== "direct").map((d) => d.tool)).toEqual([]);
    }
    await page.evaluate(() => (window as unknown as { bento: { ai: { hangUp(): boolean } } }).bento.ai.hangUp());
    expect(json("in", "error").map((f) => f.json)).toEqual([]);
  } finally {
    const fs = await import("node:fs/promises");
    await fs.writeFile(
      testInfo.outputPath("bento-direct-tools.json"),
      JSON.stringify({ spoken: UTTERANCES, heard: heardTexts, delegations, audioInAt, audioOut, frames }, null, 2),
    );
    await page.screenshot({ path: testInfo.outputPath("final.png") }).catch(() => {});
    console.log(`bento artifacts: ${testInfo.outputDir}`);
  }
});

/** RMS of a little-endian PCM16 frame. */
function rms16(payload: Buffer): number {
  const samples = Math.floor(payload.length / 2);
  if (samples === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples; i++) {
    const v = payload.readInt16LE(i * 2);
    sum += v * v;
  }
  return Math.round(Math.sqrt(sum / samples));
}
