import { expect, test } from "@playwright/test";
import { installFakeHistoryApi, type FakeConversation } from "../fixtures/fake-history-api";
import {
  fixtureUrl,
  openMessages,
  sel,
  visitorToken,
  waitForWidget,
} from "../fixtures/history-page";

const seeded: FakeConversation = {
  id: "conv_seed",
  title: "Refund for the damaged mug",
  targetId: "flow_e2e",
  preview: "That should not have shipped.",
  messageCount: 2,
  createdAt: new Date(Date.now() - 3_600_000).toISOString(),
  updatedAt: new Date(Date.now() - 3_600_000).toISOString(),
  revision: "rev_1",
  messages: [
    { id: "m1", role: "user", content: "The mug arrived cracked.", displayAvailable: true },
    { id: "m2", role: "assistant", displayContent: "Here is your refund.", displayAvailable: true },
  ],
};

/**
 * Gate 9, second clause: a history response that was already in flight when a
 * sibling tab revoked the credential must be discarded before it can commit,
 * even though the HTTP status is 200. Real `storage` event, real two pages.
 */
test("a list 200 that lands after a sibling reset never populates the view", async ({
  context,
}) => {
  const api = await installFakeHistoryApi(context, { conversations: [seeded] });

  const a = await context.newPage();
  const b = await context.newPage();
  await a.goto(fixtureUrl({ mode: "intercepted" }));
  await waitForWidget(a);
  await b.goto(fixtureUrl({ mode: "intercepted" }));
  await waitForWidget(b);
  await expect.poll(async () => await visitorToken(b)).toMatch(/^cvt_/);

  // B asks for its conversations; the response is held open.
  const releaseList = api.hold("list");
  await openMessages(b);
  await expect
    .poll(() => api.requests.filter((request) => request.path === "conversations").length)
    .toBe(1);
  await expect(b.locator('[data-persona-history-state="loading"]')).toBeVisible();

  // A revokes the shared credential while B's read is still in flight.
  await a.evaluate(async () => {
    const handle = (
      window as unknown as {
        __personaE2E: { controller: { resetHistoryIdentity(): Promise<unknown> } };
      }
    ).__personaE2E;
    await handle.controller.resetHistoryIdentity();
  });
  await expect.poll(async () => await visitorToken(b)).toBeNull();

  // The stale 200 now arrives carrying real rows.
  releaseList();

  // It must not render: B lands in the clean, non-populated error state.
  await expect(b.locator(sel.state)).toHaveAttribute(
    "data-persona-history-state",
    "error"
  );
  await expect(b.locator(sel.row)).toHaveCount(0);
  await expect(b.locator(sel.view)).not.toContainText(seeded.title);
  await expect(b.locator(sel.view)).not.toContainText(seeded.preview!);

  // Clean state: the view is still usable and offers a retry.
  await expect(b.locator('[data-persona-history-focus="state-retry"]')).toBeVisible();
});
