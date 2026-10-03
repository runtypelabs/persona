import { expect, test } from "@playwright/test";
import { installFakeHistoryApi } from "../fixtures/fake-history-api";
import { startFakeVoiceServer, type FakeVoiceServer } from "../fixtures/fake-voice-server";
import { openVoicePage, voiceFixtureUrl, voiceSel } from "../fixtures/voice-page";

/**
 * The cross-page voice resume (19-voice-cross-page) under a stricter autoplay
 * policy, Safari-like: every new document needs its own user gesture before
 * audio can start. The restore must not hang on a suspended AudioContext; it
 * asks for a tap, and the tap redials.
 *
 * Chromium carries activation across a same-origin navigation for autoplay, and
 * its `--autoplay-policy` flag doesn't change that, so the stricter policy is
 * emulated: until this document sees a user gesture, AudioContexts start
 * suspended and `resume()` stays pending, as the spec'd "not allowed to start"
 * behaviour does.
 */

test.use({
  permissions: ["microphone"],
  launchOptions: {
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
    ],
  },
});

let voice: FakeVoiceServer;

test.beforeEach(async ({ context }) => {
  voice = await startFakeVoiceServer();
  // A string, not a function: Playwright's transpile of class private fields
  // would reference helpers that don't exist in the page.
  await context.addInitScript(`
    const Native = window.AudioContext;
    // Per document: Chromium's navigator.userActivation reports activation
    // carried over from the previous same-origin page.
    let gestured = false;
    for (const type of ["pointerdown", "keydown"]) {
      window.addEventListener(type, () => { gestured = true; }, { capture: true });
    }
    const activated = () => gestured;
    const blocked = new WeakSet();
    class GestureGatedAudioContext extends Native {
      constructor(...args) {
        super(...args);
        if (!activated()) blocked.add(this);
      }
      get state() {
        return blocked.has(this) && super.state !== "closed" ? "suspended" : super.state;
      }
      resume() {
        if (blocked.has(this) && !activated()) return new Promise(() => {});
        blocked.delete(this);
        return super.resume();
      }
    }
    window.AudioContext = GestureGatedAudioContext;
  `);
});

test.afterEach(async () => {
  await voice.close();
});

test("a blocked restore asks for a tap instead of hanging, and a mic tap resumes", async ({
  page,
  context,
}) => {
  await installFakeHistoryApi(context);
  const options = { voiceHost: voice.host, persist: true };
  await openVoicePage(page, { ...options, page: "home" });
  await page.locator(voiceSel.mic).click();
  const first = await voice.nextCall();
  await first.ready;

  await page.goto(voiceFixtureUrl({ ...options, page: "bread" }));
  await expect(page.getByText("Tap the mic to resume your voice call")).toBeVisible();
  expect(voice.calls.length).toBe(1);

  await page.locator(voiceSel.mic).click();
  const resumed = await voice.nextCall(5_000);
  await resumed.ready;
});
