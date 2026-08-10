import { expect, test } from "@playwright/test";
import { installFakeHistoryApi } from "../fixtures/fake-history-api";
import { fixtureUrl, visitorEntries, waitForWidget } from "../fixtures/history-page";

/**
 * Gate 9, first clause: two real same-origin pages starting from an empty
 * visitor store must converge on ONE visitor over the Web Locks path.
 *
 * jsdom can only pin the branch; the lock itself is a browser primitive.
 */
test("two pages booting with an empty store mint exactly one visitor", async ({
  context,
}) => {
  const api = await installFakeHistoryApi(context);

  const a = await context.newPage();
  const b = await context.newPage();

  // Both start from the same empty origin storage and race into first init.
  await Promise.all([
    a.goto(fixtureUrl({ mode: "intercepted" })),
    b.goto(fixtureUrl({ mode: "intercepted" })),
  ]);
  await Promise.all([waitForWidget(a), waitForWidget(b)]);

  // Web Locks is what makes this deterministic: the loser re-reads the store
  // inside the lock and joins the winner's visitor instead of minting.
  expect(await a.evaluate(() => Boolean(navigator.locks))).toBe(true);

  await expect
    .poll(async () => (await visitorEntries(a)).length, {
      message: "page A stores exactly one visitor credential",
    })
    .toBe(1);
  await expect
    .poll(async () => (await visitorEntries(b)).length)
    .toBe(1);

  // Exactly one init response carried `visitor.token` across both pages.
  await expect.poll(() => api.mints.length).toBe(1);

  const [tokenA] = await visitorEntries(a);
  const [tokenB] = await visitorEntries(b);
  expect(tokenA!.value).toMatch(/^cvt_/);
  expect(tokenA!.value).toBe(tokenB!.value);
  expect(tokenA!.key).toBe(tokenB!.key);

  // Every init after the mint presented the shared credential.
  const inits = api.requestsTo("init");
  // Mint, the immediate ownership claim, and the sibling joining the visitor.
  expect(inits.length).toBeGreaterThanOrEqual(3);
  const withoutToken = inits.filter((request) => !request.body?.visitorToken);
  expect(withoutToken).toHaveLength(1);
});
