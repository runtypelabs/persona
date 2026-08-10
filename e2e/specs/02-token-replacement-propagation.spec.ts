import { expect, test } from "@playwright/test";
import { installFakeHistoryApi } from "../fixtures/fake-history-api";
import {
  fixtureUrl,
  sel,
  sendMessage,
  visitorToken,
  waitForWidget,
} from "../fixtures/history-page";

/**
 * Gate 9, first clause: D3 of docs/visitor-history-implementation-plan.md makes
 * the sibling tab act on the `storage` event itself. The session subscribes to
 * the visitor store, and an external clear/replacement drops the cached chat
 * session, wipes visible + persisted state, and blocks dispatch until a re-init
 * under the new store value succeeds.
 *
 * The re-init is deliberately lazy (it runs on the blocked send, not on the
 * event): an idle tab must not silently re-mint a credential the visitor just
 * deleted elsewhere.
 */
test(
  "a reset in one tab wipes the sibling and forces a fresh init",
  async ({ context }) => {
    const api = await installFakeHistoryApi(context);

    const a = await context.newPage();
    const b = await context.newPage();
    await a.goto(fixtureUrl({ mode: "intercepted" }));
    await waitForWidget(a);
    await b.goto(fixtureUrl({ mode: "intercepted" }));
    await waitForWidget(b);

    await expect.poll(async () => await visitorToken(b)).toMatch(/^cvt_/);
    const originalToken = await visitorToken(b);

    // B has a visible transcript and a live chat session.
    await sendMessage(b, "before the reset");
    await expect
      .poll(async () => await b.locator(sel.bubble).count())
      .toBeGreaterThan(1);
    const staleSessionId = api.requestsTo("chat")[0]!.body?.sessionId as string;
    expect(staleSessionId).toBeTruthy();

    // A forgets this device: remote revocation plus an unconditional local wipe,
    // which removes the shared localStorage credential.
    await a.evaluate(async () => {
      const handle = (
        window as unknown as {
          __personaE2E: { controller: { resetHistoryIdentity(): Promise<unknown> } };
        }
      ).__personaE2E;
      await handle.controller.resetHistoryIdentity();
    });
    expect(api.requestsTo("visitor/reset")).toHaveLength(1);

    // The sibling observes the storage event and wipes.
    await expect.poll(async () => await b.locator(sel.bubble).count()).toBe(0);
    await expect.poll(async () => await visitorToken(b)).not.toBe(originalToken);

    // A subsequent send re-initializes rather than reusing the old session.
    const initsBefore = api.requestsTo("init").length;
    await sendMessage(b, "after the reset");
    await expect.poll(() => api.requestsTo("chat").length).toBe(2);

    expect(api.requestsTo("init").length).toBeGreaterThan(initsBefore);
    const chatAfter = api.requestsTo("chat")[1]!;
    expect(chatAfter.body?.sessionId).not.toBe(staleSessionId);

    // The wiped transcript never leaks into the replacement conversation.
    const messages = (chatAfter.body?.messages ?? []) as unknown[];
    expect(JSON.stringify(messages)).not.toContain("before the reset");
  }
);
