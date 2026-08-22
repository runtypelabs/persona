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
 * Gate 9, third clause: revoking a visitor credential does not revoke an
 * already-minted chat session, so D3 requires the sibling to block dispatch
 * until it has re-inited. The external-change transition clears the client's
 * cached session, and `sendMessage` awaits the re-init before dispatching, so
 * no request can carry the formerly live session id.
 */
test(
  "after a sibling reset, a send cannot go through the formerly live session",
  async ({ context }) => {
    const api = await installFakeHistoryApi(context);

    const a = await context.newPage();
    const b = await context.newPage();
    await a.goto(fixtureUrl({ mode: "intercepted" }));
    await waitForWidget(a);
    await b.goto(fixtureUrl({ mode: "intercepted" }));
    await waitForWidget(b);
    await expect.poll(async () => await visitorToken(b)).toMatch(/^cvt_/);

    await sendMessage(b, "first turn");
    await expect
      .poll(async () => await b.locator(sel.bubble).count())
      .toBeGreaterThan(1);
    const staleSessionId = api.requestsTo("chat")[0]!.body?.sessionId as string;

    await a.evaluate(async () => {
      const handle = (
        window as unknown as {
          __personaE2E: { controller: { resetHistoryIdentity(): Promise<unknown> } };
        }
      ).__personaE2E;
      await handle.controller.resetHistoryIdentity();
    });
    await expect.poll(async () => await visitorToken(b)).toBeNull();

    const initsBefore = api.requestsTo("init").length;
    await sendMessage(b, "second turn");
    await expect.poll(() => api.requestsTo("chat").length).toBe(2);

    // Re-init happened first, and nothing reached the old session.
    expect(api.requestsTo("init").length).toBeGreaterThan(initsBefore);
    const afterReset = api.requests.slice(
      api.requests.findIndex((request) => request.path === "visitor/reset")
    );
    expect(
      afterReset.filter(
        (request) =>
          request.body?.sessionId === staleSessionId ||
          request.query.sessionId === staleSessionId
      )
    ).toHaveLength(0);
  }
);
