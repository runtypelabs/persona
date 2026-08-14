import { expect, test } from "@playwright/test";
import {
  closeRail,
  fixtureUrl,
  openMessages,
  sel,
  waitForWidget,
} from "../fixtures/history-page";

/**
 * Gate 12: `features.history.rail.resizable` puts a real drag handle on the
 * docked rail's divider edge. Real pointer capture and a real committed width,
 * which jsdom can only approximate. The fixture runs `persistState: false`, so
 * the remembered width is the in-memory fallback, asserted across a close and
 * reopen within one page lifetime.
 */
test("the docked rail resizes by drag and remembers the width", async ({ page }) => {
  await page.goto(
    fixtureUrl({ mode: "demo", presentation: "rail", resizable: true, width: 960 })
  );
  await waitForWidget(page);

  await openMessages(page);
  const host = page.locator(sel.railHost);
  await expect(host).toBeVisible();
  expect(Math.round((await host.boundingBox())!.width)).toBe(260);

  const handle = page.locator(sel.railResizer);
  await expect(handle).toBeVisible();
  await expect(handle).toHaveAttribute("aria-valuenow", "260");

  // Drag the edge 60px into the conversation.
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();

  await expect
    .poll(async () => Math.round((await host.boundingBox())!.width))
    .toBe(320);
  await expect(handle).toHaveAttribute("aria-valuenow", "320");
  // The conversation column keeps the rest of the row.
  const conversation = page.locator(sel.railConversation);
  expect((await conversation.boundingBox())!.width).toBeLessThan(
    (await page.locator(".persona-widget-container").boundingBox())!.width - 320
  );

  // The keyboard moves the same edge, in 16px steps.
  await handle.focus();
  await page.keyboard.press("ArrowRight");
  await expect(handle).toHaveAttribute("aria-valuenow", "336");
  await expect
    .poll(async () => Math.round((await host.boundingBox())!.width))
    .toBe(336);

  // Close Messages entirely and reopen: the chosen width comes back.
  await closeRail(page);
  await expect(page.locator(sel.railShell)).toHaveCount(0);
  await openMessages(page);
  await expect
    .poll(async () => Math.round((await page.locator(sel.railHost).boundingBox())!.width))
    .toBe(336);
});
