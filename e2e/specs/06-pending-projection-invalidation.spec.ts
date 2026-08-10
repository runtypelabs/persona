import { expect, test } from "@playwright/test";
import { divergentTurnStream, installFakeHistoryApi } from "../fixtures/fake-history-api";
import {
  fixtureUrl,
  openMessages,
  sel,
  sendMessage,
  visitorToken,
  waitForWidget,
} from "../fixtures/history-page";

const DISPLAY = "Here are 3 shoes for you.";
const MODEL = JSON.stringify({ action: "message", text: DISPLAY, products: ["sku-1"] });

const patches = (requests: Array<{ path: string }>): number =>
  requests.filter((request) => request.path.endsWith("display-projections")).length;

/**
 * Gate 8: a display projection queued for one conversation must not be
 * committed or re-attempted once the browser credential changed underneath it.
 *
 * Scope note: the plan's "after the wipe" phrasing assumes D3's proactive
 * external-change transition, which is not wired yet (see spec 02). What ships
 * today is the credential-revision guard plus a fail-closed credential read,
 * and that is what this pins: the held 200 is discarded rather than committed,
 * and the follow-up attempt never reaches the network.
 */
test("a projection captured across a credential change is discarded, not retried", async ({
  context,
}) => {
  const api = await installFakeHistoryApi(context);

  const a = await context.newPage();
  const b = await context.newPage();
  await a.goto(fixtureUrl({ mode: "intercepted" }));
  await waitForWidget(a);

  api.setChatStream(
    divergentTurnStream({ messageId: "asst_1", display: DISPLAY, raw: MODEL })
  );

  await b.goto(fixtureUrl({ mode: "intercepted" }));
  await waitForWidget(b);
  await expect.poll(async () => await visitorToken(b)).toMatch(/^cvt_/);

  // Queue the projection and hold its PATCH open.
  const releasePatch = api.hold("projections");
  await sendMessage(b, "show me shoes");
  await expect(b.locator(sel.transcript)).toContainText(DISPLAY);
  await expect.poll(() => patches(api.requests)).toBe(1);

  const held = api.requests.find((request) =>
    request.path.endsWith("display-projections")
  )!;
  const conversationId = held.path.split("/")[1]!;

  // Continuity change: the sibling revokes the shared credential.
  await a.evaluate(async () => {
    const handle = (
      window as unknown as {
        __personaE2E: { controller: { resetHistoryIdentity(): Promise<unknown> } };
      }
    ).__personaE2E;
    await handle.controller.resetHistoryIdentity();
  });
  await expect.poll(async () => await visitorToken(b)).toBeNull();

  // The held 200 now lands. It carries a new revision the widget must not adopt.
  releasePatch();

  // Deterministic settle point: B performs its next history round trip and
  // fails closed. By the time that state renders, the projection chain is done.
  await openMessages(b);
  await expect(b.locator(sel.state)).toHaveAttribute(
    "data-persona-history-state",
    "error"
  );

  // The rejected projection is not retried, and no later attempt reaches the
  // network for the old conversation.
  expect(patches(api.requests)).toBe(1);
  expect(
    api.requests.filter(
      (request) => request.path === `conversations/${conversationId}/display-projections`
    )
  ).toHaveLength(1);
});
