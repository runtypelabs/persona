import { expect, test } from "@playwright/test";
import { sel } from "../fixtures/history-page";

/**
 * Gate 10: the Messages surface ships as a lazily loaded chunk. A failed load
 * must leave the conversation intact and reachable, and the feature must
 * recover once the chunk is served again. Only a real bundle split shows this.
 *
 * The retry is a reload rather than a second click by necessity: HTML records a
 * failed module fetch as a null module-map entry for that URL, so Chrome never
 * re-requests the identical chunk URL inside the same document. The loader
 * (`utils/chunk-loader.ts`) does clear its in-flight promise and re-attempt the
 * import — the browser answers from its cached failure, which is why the second
 * click below produces no new request and no view.
 */
test("a failed history chunk leaves chat intact and recovers once served", async ({
  page,
}) => {
  const attempts: string[] = [];
  let blockNext = true;
  await page.route(/history-view.*\.js(\?.*)?$/, async (route) => {
    attempts.push(route.request().url());
    if (blockNext) {
      blockNext = false;
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
  await expect.poll(() => attempts.length).toBe(1);

  // Shell failure handling: no view mounts, and the conversation is never
  // hidden or made inert behind a surface that failed to appear.
  await expect(page.locator(sel.view)).toHaveCount(0);
  await expect.poll(isHistoryVisible).toBe(false);
  await expect(page.locator(sel.transcript)).toBeVisible();
  await expect(page.locator(sel.transcript)).not.toHaveAttribute("inert", /.*/);
  await expect(page.locator(sel.footer)).toBeVisible();
  await expect(page.locator(sel.historyToggle)).toBeEnabled();

  // Clicking again is safe: the loader re-attempts, the browser answers from
  // its cached module failure, and the widget stays in the same clean state.
  await page.locator(sel.historyToggle).click();
  await expect.poll(isHistoryVisible).toBe(false);
  await expect(page.locator(sel.view)).toHaveCount(0);

  // Served again: the surface loads and renders its data.
  await page.reload();
  await expect(page.locator(".persona-widget-container")).toBeVisible();
  await page.locator(sel.historyToggle).click();
  await expect(page.locator(sel.view)).toBeVisible();
  await expect(page.locator(sel.row)).toHaveCount(5);
  expect(attempts).toHaveLength(2);
});
