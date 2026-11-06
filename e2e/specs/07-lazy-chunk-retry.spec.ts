import { expect, test } from "@playwright/test";
import { sel } from "../fixtures/history-page";

/**
 * Gate 10: the Messages surface ships as a lazily loaded chunk. A failed load
 * must leave the conversation intact and reachable, and the feature must
 * recover once the chunk is served again. Only a real bundle split shows this.
 *
 * Keep the chunk unavailable through every request in the first document,
 * including browser preloads and retries. Reload after restoring availability
 * to exercise recovery without depending on a browser's module-cache policy.
 */
test("a failed history chunk leaves chat intact and recovers once served", async ({
  page,
}) => {
  const attempts: string[] = [];
  let blockRequests = true;
  await page.route(/history-view.*\.js(\?.*)?$/, async (route) => {
    attempts.push(route.request().url());
    if (blockRequests) {
      return route.fulfill({ status: 503, body: "chunk unavailable" });
    }
    return route.continue();
  });

  await page.goto("/history-demo.html");
  await expect(page.locator(".persona-widget-container")).toBeVisible();

  const isHistoryVisible = () =>
    page.evaluate(() =>
      (
        window as unknown as {
          historyDemoController: { isHistoryVisible(): boolean };
        }
      ).historyDemoController.isHistoryVisible()
    );

  // First open: the chunk request fails.
  await page.locator(sel.historyToggle).click();
  await expect.poll(() => attempts.length).toBeGreaterThan(0);

  // Shell failure handling: no view mounts, and the conversation is never
  // hidden or made inert behind a surface that failed to appear.
  await expect(page.locator(sel.view)).toHaveCount(0);
  await expect.poll(isHistoryVisible).toBe(false);
  await expect(page.locator(sel.transcript)).toBeVisible();
  await expect(page.locator(sel.transcript)).not.toHaveAttribute("inert", /.*/);
  await expect(page.locator(sel.footer)).toBeVisible();
  await expect(page.locator(sel.historyToggle)).toBeEnabled();

  // WHY: A repeated click must stay safe whether the browser caches or retries the failed module.
  await page.locator(sel.historyToggle).click();
  await expect.poll(isHistoryVisible).toBe(false);
  await expect(page.locator(sel.view)).toHaveCount(0);

  // Served again: the surface loads and renders its data.
  const failedAttempts = attempts.length;
  blockRequests = false;
  await page.reload();
  await expect(page.locator(".persona-widget-container")).toBeVisible();
  await page.locator(sel.historyToggle).click();
  await expect(page.locator(sel.view)).toBeVisible();
  await expect(page.locator(sel.row)).toHaveCount(5);
  expect(attempts.length).toBeGreaterThan(failedAttempts);
});
