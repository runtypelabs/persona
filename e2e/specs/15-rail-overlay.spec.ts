import { expect, test } from "@playwright/test";
import { fixtureUrl, sel, waitForWidget } from "../fixtures/history-page";

/**
 * Gate 12: with `collapsedBehavior: "overlay"` the collapsed rail is a header
 * trigger and nothing else, and the pointer arriving on it is what opens the
 * rail. Real hover, real pointer-out, real pinning: the parts jsdom can only
 * approximate.
 */
test("the collapsed rail floats on hover and pins from its toggle", async ({
  page,
}) => {
  await page.goto(
    fixtureUrl({
      mode: "demo",
      presentation: "rail",
      collapsedBehavior: "overlay",
      width: 960,
    })
  );
  await waitForWidget(page);
  const trigger = page.locator(sel.railTrigger);
  const overlay = page.locator(sel.railOverlay);
  /** Away from both surfaces, so the next entry is a real pointer entry. */
  const leave = () => page.mouse.move(700, 400);
  /**
   * The pointer arriving on the trigger. Not `locator.hover()`: the rail it
   * opens covers the trigger, so hover's own hit test never settles.
   */
  const enter = async () => {
    const box = (await trigger.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  };

  // Rest: the trigger stands alone, and the lazy view was never fetched. The
  // header keeps no history toggle of its own beside it.
  await expect(trigger).toBeVisible();
  await expect(page.locator(sel.historyToggle)).toBeHidden();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(sel.view)).toHaveCount(0);
  await expect(page.locator(sel.railShell)).toHaveCount(0);

  // Hover: the expanded rail floats over a conversation that keeps its layout,
  // and answers on its own rather than behind a tooltip.
  await enter();
  await expect(overlay).toBeVisible();
  await expect(overlay.locator(sel.row).first()).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".persona-control-tooltip")).toHaveCount(0);
  await expect(page.locator(sel.railShell)).toHaveCount(0);
  expect(Math.round((await overlay.boundingBox())!.width)).toBe(260);

  // The header above the rail is the bridge between the two: crossing it keeps
  // the rail, and passing the rail's right edge in that same row drops it.
  const railBox = (await overlay.boundingBox())!;
  const rowY = (await trigger.boundingBox())!.y + 4;
  await page.mouse.move(railBox.x + railBox.width / 2, rowY);
  await page.waitForTimeout(450);
  await expect(overlay).toBeVisible();
  await page.mouse.move(railBox.x + railBox.width + 60, rowY);
  await expect(overlay).toHaveCount(0);

  // Pointer out of both surfaces: dismissed after the grace.
  await enter();
  await expect(overlay).toBeVisible();
  await leave();
  await expect(overlay).toHaveCount(0);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");

  // The rail hangs below the trigger's row, which stays visible and clickable
  // above it, one margin off the docked edge.
  await enter();
  await expect(overlay).toBeVisible();
  await expect(trigger).toBeVisible();
  const triggerBox = (await trigger.boundingBox())!;
  const overlayBox = (await overlay.boundingBox())!;
  // The measured trigger row is rounded to whole pixels, so the gap is the 8px
  // margin plus at most that rounding.
  const gap = overlayBox.y - (triggerBox.y + triggerBox.height);
  expect(gap).toBeGreaterThanOrEqual(8);
  expect(gap).toBeLessThanOrEqual(9);
  const containerBox = (await page
    .locator(".persona-widget-container")
    .boundingBox())!;
  // Measured from the container's border box, so its own 1px border rides on
  // top of the margin.
  const inset = overlayBox.x - containerBox.x;
  expect(inset).toBeGreaterThanOrEqual(8);
  expect(inset).toBeLessThanOrEqual(9);

  // Clicking the trigger pins, now that the rail never covers it.
  await trigger.click();
  await expect(page.locator(sel.railShell)).toBeVisible();
  await expect(overlay).toHaveCount(0);
  await expect(trigger).toBeHidden();
  await page.locator(sel.collapseToggle).click();
  await expect(page.locator(sel.railShell)).toHaveCount(0);
  await expect(trigger).toBeVisible();

  // Floating, the rail's own toggle docks it too.
  await leave();
  await enter();
  await expect(overlay).toBeVisible();
  await expect(page.locator(sel.collapseToggle)).toHaveAttribute(
    "aria-label",
    "Expand conversation list"
  );
  await page.locator(sel.collapseToggle).click();
  await expect(page.locator(sel.railShell)).toBeVisible();
  await expect(overlay).toHaveCount(0);
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

  // Escape from the floating rail closes it and hands focus back.
  await leave();
  await enter();
  await expect(overlay).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(overlay).toHaveCount(0);
  await expect(trigger).toBeFocused();

  // A click outside dismisses it too, and the composer never stopped working.
  await leave();
  await enter();
  await expect(overlay).toBeVisible();
  const composer = page.locator(sel.composerInput).first();
  await composer.click();
  await expect(overlay).toHaveCount(0);
  await composer.fill("still operable");
  await expect(composer).toHaveValue("still operable");
});
