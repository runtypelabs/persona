import { expect, test, type Page } from "@playwright/test";
import { installFakeHistoryApi } from "../fixtures/fake-history-api";
import { startFakeVoiceServer, type FakeVoiceCall, type FakeVoiceServer } from "../fixtures/fake-voice-server";
import { clickLiveMic, openVoicePage, voiceSel } from "../fixtures/voice-page";
import { deliverPcm, finishPlayback, installPlaybackProbe } from "../fixtures/voice-playback-probe";

test.use({
  permissions: ["microphone"],
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
});

let voice: FakeVoiceServer;
test.beforeEach(async ({ context }) => {
  voice = await startFakeVoiceServer();
  await installFakeHistoryApi(context);
});
test.afterEach(async () => { await voice.close(); });

async function start(page: Page, stops: number[]): Promise<FakeVoiceCall> {
  await installPlaybackProbe(page, stops);
  await openVoicePage(page, { voiceHost: voice.host });
  await page.evaluate(() => window.__voicePlaybackProbe.start());
  await page.locator(voiceSel.mic).click();
  const call = await voice.nextCall();
  await call.ready;
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1_000));
  return call;
}

async function advance(page: Page): Promise<void> {
  const elapsed = await page.evaluate(() => window.__voicePlaybackProbe.advance());
  await page.clock.runFor(elapsed);
}

test("the default voice player renders late 100 ms chunks without holes or lost samples", async ({ page }, info) => {
  const call = await start(page, [0, 0.08, 0.22, 0.31, 0.46, 0.51]);
  for (let i = 0; i < 6; i++) {
    await deliverPcm(page, call, 100);
    if (i === 0) await new Promise((resolve) => setTimeout(resolve, 200));
    if (i < 5) await advance(page);
  }
  const runs = await finishPlayback(page, info);
  expect(runs).toHaveLength(1);
  expect(runs[0].samples).toBe(14_400);
  expect(runs[0].amplitude).toBe(0.25);
  expect(runs[0].startSample).toBeGreaterThanOrEqual(1_792);
  expect(runs[0].startSample).toBeLessThanOrEqual(1_920);
  await clickLiveMic(page);
  await expect(call.closed).resolves.toBe(1000);
});

test("an underrun re-buffers the first late chunk and resumes in order", async ({ page }, info) => {
  const call = await start(page, [0, 0.5, 0.58]);
  await deliverPcm(page, call, 200);
  await advance(page);
  await deliverPcm(page, call, 100, 0.5);
  await advance(page);
  await deliverPcm(page, call, 100, 0.5);
  const runs = await finishPlayback(page, info);
  expect(runs).toHaveLength(2);
  expect(runs[0]).toEqual({ amplitude: 0.25, startSample: 0, samples: 4_800 });
  expect(runs[1].amplitude).toBe(0.5);
  expect(runs[1].samples).toBe(4_800);
  expect(runs[1].startSample).toBeGreaterThanOrEqual(13_824);
  expect(runs[1].startSample).toBeLessThanOrEqual(13_952);
});

test("audio_clear discards a short reply held in the jitter buffer", async ({ page }, info) => {
  const call = await start(page, [0, 0.04]);
  await deliverPcm(page, call, 80);
  await advance(page);
  call.send({ type: "audio_clear" });
  await expect.poll(() => page.evaluate(() => window.__voicePlaybackProbe.clears)).toBe(1);
  await page.clock.runFor(200);
  expect(await finishPlayback(page, info)).toEqual([]);
});

test("audio_clear stops playing audio and a subsequent short reply drains without audio_end", async ({ page }, info) => {
  const call = await start(page, [0, 0.096, 0.16, 0.31]);
  await deliverPcm(page, call, 400);
  await advance(page);
  call.send({ type: "audio_clear" });
  await expect.poll(() => page.evaluate(() => window.__voicePlaybackProbe.clears)).toBe(1);
  await advance(page);
  await deliverPcm(page, call, 40, -0.25);
  await advance(page);
  await expect.poll(() => page.evaluate(() => window.__voicePlaybackProbe.sources)).toBe(2);
  const runs = await finishPlayback(page, info);
  expect(runs).toHaveLength(2);
  expect(runs[0]).toEqual({ amplitude: 0.25, startSample: 0, samples: 2_304 });
  expect(runs[1].amplitude).toBe(-0.25);
  expect(runs[1].samples).toBe(960);
  expect(runs[1].startSample).toBeGreaterThanOrEqual(7_440);
  expect(runs[1].startSample).toBeLessThanOrEqual(7_552);
  await page.clock.runFor(500);
  await expect(page.locator(voiceSel.mic)).toHaveAttribute("aria-label", "Stop voice recognition");
});
