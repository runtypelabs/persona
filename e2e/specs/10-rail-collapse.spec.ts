import { expect, test, type Page } from "@playwright/test";
import { fixtureUrl, openMessages, sel, waitForWidget } from "../fixtures/history-page";

type Handle = {
  provider: { setLatency(ms: number): void };
  setHostWidth(px: number): void;
};

const focusRegion = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    if (!active || active === document.body) return "none";
    if (active.closest(".persona-history-view")) return "view";
    if (active.closest(".persona-widget-footer")) return "footer";
    if (active.closest("#persona-scroll-container")) return "transcript";
    return "outside";
  });

/**
 * Gate 12: crossing the 720px container threshold with Messages open is a live
 * host move, not a remount. The same view element must travel between the rail
 * and panel hosts with its list, its pending action, and focus intact.
 */
test("crossing 720px moves the open view without losing state or focus", async ({
  page,
}) => {
  await page.goto(fixtureUrl({ mode: "demo", presentation: "rail", width: 960 }));
  await waitForWidget(page);

  await openMessages(page);
  await expect(page.locator(sel.viewPresentation)).toHaveAttribute(
    "data-persona-history-presentation",
    "rail"
  );
  const rowCount = await page.locator(sel.row).count();
  expect(rowCount).toBeGreaterThan(1);

  // Mark the live element so a remount is detectable.
  await page.locator(sel.view).evaluate((el) => {
    (el as HTMLElement).dataset.e2eMark = "original-view";
  });

  // Put a row into a pending state that outlives the move.
  await page.evaluate(() => {
    (window as unknown as { __personaE2E: Handle }).__personaE2E.provider.setLatency(5_000);
  });
  const row = page.locator(sel.row).first();
  const rowId = await row.getAttribute("data-persona-history-conversation");
  await row.click();
  await expect(row).toHaveAttribute("aria-busy", "true");
  await expect(row).toBeFocused();

  // Collapse below the threshold while the view is open and busy.
  await page.evaluate(() => {
    (window as unknown as { __personaE2E: Handle }).__personaE2E.setHostWidth(600);
  });

  await expect(page.locator(sel.viewPresentation)).toHaveAttribute(
    "data-persona-history-presentation",
    "panel"
  );
  // Same element, not a rebuild.
  await expect(page.locator(sel.view)).toHaveAttribute("data-e2e-mark", "original-view");
  await expect(page.locator(sel.view)).toHaveCount(1);
  // List state, pending state and focus all survived the host move.
  await expect(page.locator(sel.row)).toHaveCount(rowCount);
  await expect(page.locator(sel.rowFor(rowId!))).toHaveAttribute("aria-busy", "true");
  // Focus ownership stays inside Messages. Re-parenting a focused node blurs it
  // in every engine, so the shell's contract is that focus lands back on the
  // view's entry control rather than escaping to the body or into the now-inert
  // conversation underneath.
  expect(await focusRegion(page)).toBe("view");

  // And back again, still the same element.
  await page.evaluate(() => {
    (window as unknown as { __personaE2E: Handle }).__personaE2E.setHostWidth(960);
  });
  await expect(page.locator(sel.viewPresentation)).toHaveAttribute(
    "data-persona-history-presentation",
    "rail"
  );
  await expect(page.locator(sel.view)).toHaveAttribute("data-e2e-mark", "original-view");
  await expect(page.locator(sel.row)).toHaveCount(rowCount);
});
