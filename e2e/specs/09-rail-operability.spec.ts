import { expect, test } from "@playwright/test";
import { sel } from "../fixtures/history-page";

/**
 * Gate 12: rail presentation is deliberately the opposite of panel. Beside a
 * host container of at least 720px the transcript and composer stay rendered
 * and operable, and selecting a conversation keeps the rail open.
 */
test("rail Messages keeps the conversation operable and stays open on select", async ({
  page,
}) => {
  await page.goto("/history-demo.html");
  await expect(page.locator(".persona-widget-container")).toBeVisible();

  await page.locator("[data-history-presentation]").selectOption("rail");
  await expect(page.locator(".persona-widget-container")).toBeVisible();

  // The rail only resolves above the 720px container threshold.
  const hostWidth = await page
    .locator(".persona-widget-container")
    .evaluate((el) => el.getBoundingClientRect().width);
  expect(hostWidth).toBeGreaterThanOrEqual(720);

  await page.locator(sel.historyToggle).click();
  await expect(page.locator(sel.view)).toBeVisible();
  await expect(page.locator(sel.viewPresentation)).toHaveAttribute(
    "data-persona-history-presentation",
    "rail"
  );
  await expect(page.locator(sel.railShell)).toBeVisible();

  // Conversation surface stays live: visible, not inert, composer focusable.
  const transcript = page.locator(sel.transcript);
  await expect(transcript).toBeVisible();
  await expect(transcript).not.toHaveAttribute("inert", /.*/);
  await expect(transcript).not.toHaveAttribute("aria-hidden", /.*/);
  const footer = page.locator(sel.footer);
  await expect(footer).toBeVisible();
  await expect(footer).not.toHaveAttribute("inert", /.*/);

  const composer = page.locator(sel.composerInput).first();
  await composer.click();
  await expect(composer).toBeFocused();
  await composer.fill("still operable");
  await expect(composer).toHaveValue("still operable");

  // Selecting a conversation updates the transcript without closing the rail.
  const row = page.locator('[data-persona-history-conversation="demo-conv-order-status"]');
  await row.click();
  await expect(page.locator(sel.view)).toBeVisible();
  await expect(page.locator(sel.railShell)).toBeVisible();
  await expect(row).toHaveAttribute("aria-current", "page");
  await expect(page.locator('.persona-history-row[aria-current="page"]')).toHaveCount(1);
  await expect(transcript).toContainText("Order 41822 still says processing.");
  await expect(transcript).toBeVisible();
  await expect(footer).toBeVisible();
});
