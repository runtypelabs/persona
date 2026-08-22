import { expect, test } from "@playwright/test";
import { fixtureUrl, openMessages, sel, waitForWidget } from "../fixtures/history-page";

/**
 * Gate 12: a plugin that replaces the whole Messages surface must never be able
 * to take the feature down with it. A throwing `renderHistoryView` is reported
 * once and the default view renders with its data intact.
 */
test("a throwing renderHistoryView warns and falls back to the default view", async ({
  page,
}) => {
  const warnings: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning") warnings.push(message.text());
  });

  await page.goto(fixtureUrl({ mode: "demo", throwRenderView: true }));
  await waitForWidget(page);

  await openMessages(page);

  // Default view, fully populated.
  await expect(page.locator(sel.view)).toBeVisible();
  await expect(page.locator(".persona-history-title")).toHaveText("Messages");
  await expect(page.locator(sel.row)).toHaveCount(5);
  await expect(page.locator(sel.row).first()).toContainText("Where is my order?");
  await expect(page.locator(sel.close)).toBeVisible();

  // The failure is reported, not swallowed.
  await expect
    .poll(() => warnings.filter((text) => text.includes("renderHistoryView threw")).length)
    .toBeGreaterThan(0);

  // Still fully operable through the default renderer.
  await page.locator('[data-persona-history-conversation="demo-conv-order-status"]').click();
  await expect(page.locator(sel.transcript)).toContainText(
    "Order 41822 still says processing."
  );
});
