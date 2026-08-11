import { expect, test } from "@playwright/test";
import { fixtureUrl, openMessages, sel, waitForWidget } from "../fixtures/history-page";

type Handle = {
  controller: { update(patch: Record<string, unknown>): void };
};

/** Runs in the page: the layout arrives as an argument, not a closure. */
const setHeaderLayout = (layout: "default" | "minimal"): void => {
  (window as unknown as { __personaE2E: Handle }).__personaE2E.controller.update({
    layout: { header: { layout } },
  });
};

/**
 * Gate 10: a header-layout change rebuilds the shell header. With Messages open
 * in panel presentation that header is hosting the view's bar, so the rebuild
 * must re-home the bar into the replacement rather than dropping it, leaving it
 * orphaned in the detached header, or showing it twice.
 */
test("rebuilding the shell header re-homes the open Messages bar", async ({ page }) => {
  await page.goto(fixtureUrl({ mode: "demo", presentation: "panel" }));
  await waitForWidget(page);

  await openMessages(page);
  await expect(page.locator(sel.view)).toBeVisible();
  const hostedBar = page.locator(`${sel.shellHeader} ${sel.headerHost} ${sel.topbar}`);
  await expect(hostedBar).toHaveCount(1);

  // Rebuild the header underneath the open view.
  await page.evaluate(setHeaderLayout, "minimal" as const);

  // One bar, in the replacement header, and nothing left over anywhere else.
  await expect(hostedBar).toHaveCount(1);
  await expect(page.locator(sel.topbar)).toHaveCount(1);
  await expect(page.locator(`${sel.view} ${sel.topbar}`)).toHaveCount(0);
  await expect(page.locator(sel.headerHost)).toHaveCount(1);
  await expect(page.locator(`${sel.shellHeader} .persona-history-title`)).toHaveText(
    "Messages"
  );

  // The replacement header's own children are suppressed too.
  await expect(
    page.locator(`${sel.shellHeader} > [data-persona-history-suppressed]`)
  ).not.toHaveCount(0);

  // The conversation stays unreachable across the rebuild.
  await expect(page.locator(sel.transcript)).toHaveAttribute("inert", /.*/);
  await expect(page.locator(sel.footer)).toHaveAttribute("inert", /.*/);

  // And the re-homed bar is still live: it opens a conversation and closes.
  await page.locator(sel.row).first().click();
  await expect(page.locator(sel.view)).toHaveCount(0);
  await expect(page.locator(sel.headerHost)).toHaveCount(0);
  await expect(page.locator(sel.suppressed)).toHaveCount(0);
  await expect(page.locator(sel.transcript)).toBeVisible();
  await expect(page.locator(sel.footer)).toBeVisible();

  // Reopening against the rebuilt header hosts the bar again.
  await page.evaluate(setHeaderLayout, "default" as const);
  await openMessages(page);
  await expect(hostedBar).toHaveCount(1);
  await page.locator(sel.close).click();
  await expect(page.locator(sel.view)).toHaveCount(0);
  await expect(page.locator(sel.suppressed)).toHaveCount(0);
});
