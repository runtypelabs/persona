import { expect, test } from "@playwright/test";
import { sel } from "../fixtures/history-page";

/**
 * Gate 10: "show earlier messages" prepends a page above the visitor's reading
 * position. The message they were looking at must not move. Real layout and
 * real scroll geometry, so jsdom cannot establish this.
 */
test("prepending an older page keeps the visible message in place", async ({ page }) => {
  await page.goto("/history-demo.html");
  await expect(page.locator(".persona-widget-container")).toBeVisible();

  // The seeded 52-message conversation pages at 25, so it offers a prepend.
  await page.locator(sel.historyToggle).click();
  await page.locator('[data-persona-history-conversation="demo-conv-subscription"]').click();

  const earlier = page.locator(sel.earlier);
  await expect(earlier).toBeVisible();
  await expect(earlier).toHaveText("Show earlier messages");

  const before = await page.locator(sel.bubble).count();
  expect(before).toBe(25);

  // Anchor on the oldest currently rendered message: it sits closest to the
  // insertion point, so it is the most sensitive to a bad correction.
  const anchor = page.locator(sel.bubble).first();
  const anchorId = await anchor.getAttribute("data-message-id");
  const scrollBefore = await page
    .locator(sel.transcript)
    .evaluate((el) => el.scrollTop);
  const boxBefore = (await anchor.boundingBox())!;

  await earlier.click();
  await expect.poll(async () => await page.locator(sel.bubble).count()).toBe(50);

  const boxAfter = (await page
    .locator(`[data-message-id="${anchorId}"]`)
    .boundingBox())!;
  const scrollAfter = await page.locator(sel.transcript).evaluate((el) => el.scrollTop);

  // The anchored message holds its viewport position across the prepend.
  expect(Math.abs(boxAfter.y - boxBefore.y)).toBeLessThan(2);
  // Which is only possible because scrollTop moved by the inserted height.
  expect(scrollAfter).toBeGreaterThan(scrollBefore);
});
