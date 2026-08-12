import { expect, test } from "@playwright/test";
import { sel } from "../fixtures/history-page";

/**
 * Gate 12: the rail collapses to an icon column and back from its own header
 * toggle, without ever taking the conversation down with it. The demo runs
 * `persistState: false`, so the remembered state is the in-memory fallback:
 * asserted across a close and reopen within one page lifetime.
 */
test("the rail collapses to an icon column and remembers the choice", async ({
  page,
}) => {
  await page.goto("/history-demo.html");
  await expect(page.locator(".persona-widget-container")).toBeVisible();
  await page.locator("[data-history-presentation]").selectOption("rail");
  await expect(page.locator(".persona-widget-container")).toBeVisible();

  await page.locator(sel.historyToggle).click();
  await expect(page.locator(sel.railShell)).toBeVisible();
  const host = page.locator(sel.railHost);
  expect((await host.boundingBox())!.width).toBeGreaterThan(200);

  const toggle = page.locator(sel.collapseToggle);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await toggle.click();

  // Collapsed: a 52px icon rail with no list, and the toggle keeps focus.
  await expect
    .poll(async () => Math.round((await host.boundingBox())!.width))
    .toBe(52);
  await expect(page.locator(sel.row).first()).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();

  // The new-conversation control survives as an icon-only square.
  const newConversation = page.locator(sel.newConversation);
  await expect(newConversation).toBeVisible();
  const newBox = (await newConversation.boundingBox())!;
  expect(Math.round(newBox.width)).toBe(36);
  await expect(newConversation.locator("span")).toBeHidden();
  await newConversation.click();
  await expect(page.locator(sel.railShell)).toBeVisible();
  await expect(page.locator(sel.collapseToggle)).toHaveAttribute(
    "aria-expanded",
    "false"
  );

  // The conversation column never stopped working.
  const composer = page.locator(sel.composerInput).first();
  await composer.click();
  await composer.fill("still operable");
  await expect(composer).toHaveValue("still operable");

  // Expanding restores the full-width rail and its rows.
  await page.locator(sel.collapseToggle).click();
  await expect
    .poll(async () => (await host.boundingBox())!.width)
    .toBeGreaterThan(200);
  await expect(page.locator(sel.row).first()).toBeVisible();

  // Collapse, close Messages entirely, reopen: still collapsed.
  await page.locator(sel.collapseToggle).click();
  await expect
    .poll(async () => Math.round((await host.boundingBox())!.width))
    .toBe(52);
  await page.locator(sel.historyToggle).click();
  await expect(page.locator(sel.railShell)).toHaveCount(0);

  await page.locator(sel.historyToggle).click();
  await expect(page.locator(sel.railShell)).toBeVisible();
  await expect
    .poll(async () => Math.round((await host.boundingBox())!.width))
    .toBe(52);
  await expect(page.locator(sel.row).first()).toBeHidden();
});
