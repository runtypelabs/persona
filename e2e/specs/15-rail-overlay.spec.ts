import { expect, test } from "@playwright/test";
import { fixtureUrl, sel, waitForWidget } from "../fixtures/history-page";

/**
 * Gate 12: with `collapsedBehavior: "overlay"` the collapsed rail is a header
 * trigger and nothing else. Real hover, real pointer-out, real pinning: the
 * parts jsdom can only approximate.
 */
test("the collapsed rail floats on hover and pins on click", async ({ page }) => {
  await page.goto(
    fixtureUrl({
      mode: "demo",
      presentation: "rail",
      collapsedBehavior: "overlay",
      width: 960,
    })
  );
  await waitForWidget(page);

  // Rest: the trigger stands alone, and the lazy view was never fetched.
  const trigger = page.locator(sel.railTrigger);
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(sel.view)).toHaveCount(0);
  await expect(page.locator(sel.railShell)).toHaveCount(0);

  // Hover: the expanded rail floats over a conversation that keeps its layout.
  await trigger.hover();
  const overlay = page.locator(sel.railOverlay);
  await expect(overlay).toBeVisible();
  await expect(overlay.locator(sel.row).first()).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(sel.railShell)).toHaveCount(0);
  expect(Math.round((await overlay.boundingBox())!.width)).toBe(260);

  // Pointer out of both surfaces: dismissed after the grace.
  await page.mouse.move(700, 400);
  await expect(overlay).toHaveCount(0);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");

  // Click pins it into the full-height column and stands the trigger down.
  await trigger.click();
  await expect(page.locator(sel.railShell)).toBeVisible();
  await expect(page.locator(sel.railOverlay)).toHaveCount(0);
  expect((await page.locator(sel.railHost).boundingBox())!.width).toBeGreaterThan(
    200
  );
  await expect(trigger).toBeHidden();
  // The conversation column is beside it, not under it.
  await expect(
    page.locator(`${sel.railConversation} > ${sel.shellHeader}`)
  ).toHaveCount(1);

  // Docked, the same control collapses back to the trigger.
  await expect(page.locator(sel.collapseToggle)).toHaveAttribute(
    "aria-label",
    "Collapse conversation list"
  );
  await page.locator(sel.collapseToggle).click();
  await expect(page.locator(sel.railShell)).toHaveCount(0);
  await expect(trigger).toBeVisible();
  await expect(trigger).toBeFocused();

  // Floating, that control sits where the trigger does and pins instead.
  await trigger.hover();
  await expect(page.locator(sel.railOverlay)).toBeVisible();
  await expect(page.locator(sel.collapseToggle)).toHaveAttribute(
    "aria-label",
    "Expand conversation list"
  );
  await page.locator(sel.collapseToggle).click();
  await expect(page.locator(sel.railShell)).toBeVisible();
  await expect(page.locator(sel.railOverlay)).toHaveCount(0);
  await page.locator(sel.collapseToggle).click();
  await expect(page.locator(sel.railShell)).toHaveCount(0);

  // Escape from the floating rail closes it and hands focus back.
  await trigger.hover();
  await expect(page.locator(sel.railOverlay)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(sel.railOverlay)).toHaveCount(0);
  await expect(trigger).toBeFocused();

  // A click outside dismisses it too, and the composer never stopped working.
  await trigger.hover();
  await expect(page.locator(sel.railOverlay)).toBeVisible();
  const composer = page.locator(sel.composerInput).first();
  await composer.click();
  await expect(page.locator(sel.railOverlay)).toHaveCount(0);
  await composer.fill("still operable");
  await expect(composer).toHaveValue("still operable");
});
