import { expect, test, type Page } from "@playwright/test";
import {
  divergentTurnStream,
  installFakeHistoryApi,
  textTurnStream,
} from "../fixtures/fake-history-api";
import {
  fixtureUrl,
  sel,
  sendMessage,
  visitorToken,
  waitForWidget,
} from "../fixtures/history-page";

const DISPLAY = "Here are 3 shoes for you.";
const MODEL = JSON.stringify({ action: "message", text: DISPLAY, products: ["sku-1"] });
/** Plain turn: it needs no projection of its own, so PATCH counts stay legible. */
const NEXT_TURN = "A fresh turn under the new credential.";

const patches = (requests: Array<{ path: string }>): number =>
  requests.filter((request) => request.path.endsWith("display-projections")).length;

/** Persisted pending-projection markers, whatever storage key they ride in. */
const pendingMarkers = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    Object.keys(localStorage).filter((key) =>
      (localStorage.getItem(key) ?? "").includes("pendingDisplayProjections")
    )
  );

/**
 * Gate 8: a display projection queued for one conversation must not be
 * committed or re-attempted once the browser credential changed underneath it.
 *
 * Both halves of the plan's "after the wipe" phrasing are live now that D3's
 * proactive external-change transition is wired (spec 02): the transition
 * invalidates the pending marker outright, and the credential-revision guard
 * discards the held 200 rather than committing its new revision.
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
  await expect.poll(async () => await pendingMarkers(b)).toHaveLength(1);

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

  // The transition wipes B and drops the marker, so no boot or dispatch can
  // replay the projection into a record this browser no longer owns.
  await expect.poll(async () => await b.locator(sel.bubble).count()).toBe(0);
  await expect.poll(async () => await pendingMarkers(b)).toHaveLength(0);

  // The held 200 now lands. It carries a new revision the widget must not adopt.
  releasePatch();

  // Deterministic settle: B re-inits under a fresh credential and completes a
  // whole new turn. The discarded projection is never retried along the way.
  api.setChatStream(textTurnStream(NEXT_TURN, "exec_2"));
  await sendMessage(b, "show me boots");
  await expect(b.locator(sel.transcript)).toContainText(NEXT_TURN);

  expect(patches(api.requests)).toBe(1);
  expect(
    api.requests.filter(
      (request) => request.path === `conversations/${conversationId}/display-projections`
    )
  ).toHaveLength(1);
});
