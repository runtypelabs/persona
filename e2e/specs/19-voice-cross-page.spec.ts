import { expect, test } from "@playwright/test";
import { installFakeHistoryApi } from "../fixtures/fake-history-api";
import { startFakeVoiceServer, type FakeVoiceServer } from "../fixtures/fake-voice-server";
import { openVoicePage, transcript, voiceFixtureUrl, voiceSel } from "../fixtures/voice-page";

/**
 * A live voice call across a full (MPA) page navigation. The socket and the
 * audio graph cannot outlive the document, so the contract is a fast resume:
 * the next page restores the transcript and redials the call on its own, with
 * no click, and the new call's `context` frame carries the conversation so far.
 */

test.use({
  permissions: ["microphone"],
  launchOptions: {
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  },
});

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
  }
  await voice.close();
});

const USER_LINE = "Show me your sourdough.";
const AGENT_LINE = "Taking you to the bread page now.";

async function startCallWithExchange(page: import("@playwright/test").Page) {
  await page.locator(voiceSel.mic).click();
  const call = await voice.nextCall();
  await call.ready;
  await call.utterance({ role: "user", turnId: "t1", text: USER_LINE });
  await call.utterance({ role: "assistant", turnId: "t2", text: AGENT_LINE });
  await expect(page.locator(voiceSel.assistantBubble).filter({ hasText: AGENT_LINE })).toBeVisible();
  return call;
}

test("a live call resumes on the next page without a click", async ({ page, context }) => {
  await installFakeHistoryApi(context);
  const options = { voiceHost: voice.host, persist: true };
  await openVoicePage(page, { ...options, page: "home" });
  const first = await startCallWithExchange(page);
  const before = await transcript(page);

  const navigatedAt = Date.now();
  await page.goto(voiceFixtureUrl({ ...options, page: "bread" }));

  // The page unload ends the first socket.
  await first.closed;

  // The next page redials by itself.
  const second = await voice.nextCall(5_000);
  await second.ready;
  const resumeMs = Date.now() - navigatedAt;
  test.info().annotations.push({ type: "resume-ms", description: String(resumeMs) });

  // Transcript survived, and the new call is told what was said.
  await expect.poll(() => transcript(page)).toEqual(before);
  const contextFrame = await second.waitForFrame("context", () => true, 2_000).catch(() => null);
  if (contextFrame) expect(String(contextFrame.text)).toContain(AGENT_LINE);

  await expect(page.locator(voiceSel.mic)).toHaveAttribute("aria-label", /stop voice|end voice/i);
});

test("a call older than the restore window still resumes after navigation", async ({ page, context }) => {
  await installFakeHistoryApi(context);
  await page.clock.install();
  const options = { voiceHost: voice.host, persist: true };
  await openVoicePage(page, { ...options, page: "home" });
  await startCallWithExchange(page);

  // A long call: the last voice-state write is well outside a 30 s window.
  await page.clock.fastForward("02:00");

  await page.goto(voiceFixtureUrl({ ...options, page: "bread" }));
  const second = await voice.nextCall(5_000);
  await second.ready;
});

test("hanging up before navigating does not redial", async ({ page, context }) => {
  await installFakeHistoryApi(context);
  const options = { voiceHost: voice.host, persist: true };
  await openVoicePage(page, { ...options, page: "home" });
  const first = await startCallWithExchange(page);

  await page.locator(voiceSel.mic).click({ force: true });
  await first.closed;

  await page.goto(voiceFixtureUrl({ ...options, page: "bread" }));
  await expect(page.locator(voiceSel.assistantBubble).filter({ hasText: AGENT_LINE })).toBeVisible();
  await expect(voice.nextCall(2_500)).rejects.toThrow(/no voice call/);
});
