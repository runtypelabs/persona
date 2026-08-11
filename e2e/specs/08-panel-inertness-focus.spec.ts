import { expect, test } from "@playwright/test";
import { sel } from "../fixtures/history-page";

/**
 * Gate 10: in panel presentation a visitor browsing Messages must not be able
 * to see or reach the composer that would send into the conversation hidden
 * underneath, and closing must return focus to the control that opened it.
 *
 * The shell header itself stays: Messages hosts its bar contents inside it and
 * suppresses the header's own children, so there is still exactly one bar. The
 * suppressed controls are as unreachable as the composer.
 * jsdom can assert the attributes; only a browser can prove real focusability.
 */
test("panel Messages makes the conversation unreachable and returns focus", async ({
  page,
}) => {
  await page.goto("/history-demo.html");
  await expect(page.locator(".persona-widget-container")).toBeVisible();

  const toggle = page.locator(sel.historyToggle);
  const transcript = page.locator(sel.transcript);
  const footer = page.locator(sel.footer);
  const header = page.locator(sel.shellHeader);

  await toggle.focus();
  await toggle.click();
  await expect(page.locator(sel.view)).toBeVisible();
  await expect(page.locator(sel.viewPresentation)).toHaveAttribute(
    "data-persona-history-presentation",
    "panel"
  );

  // Transcript and composer are hidden, aria-hidden and inert.
  await expect(transcript).toHaveAttribute("aria-hidden", "true");
  await expect(transcript).toHaveAttribute("inert", /.*/);
  expect(await transcript.evaluate((el) => getComputedStyle(el).display)).toBe("none");
  await expect(footer).toHaveAttribute("aria-hidden", "true");
  await expect(footer).toHaveAttribute("inert", /.*/);
  expect(await footer.evaluate((el) => (el as HTMLElement).hidden)).toBe(true);

  // The header bar stays: only its contents swap, so it is never inert.
  await expect(header).toBeVisible();
  await expect(header).not.toHaveAttribute("aria-hidden", /.*/);
  await expect(header).not.toHaveAttribute("inert", /.*/);
  expect(await header.evaluate((el) => getComputedStyle(el).display)).not.toBe("none");

  // Its own children are suppressed, including the control that opened this.
  await expect(
    page.locator(`${sel.shellHeader} > [data-persona-history-suppressed]`)
  ).not.toHaveCount(0);
  await expect(toggle).toBeHidden();
  expect(
    await toggle.evaluate((el) =>
      Boolean(el.closest("[data-persona-history-suppressed]"))
    )
  ).toBe(true);

  // Still one bar, and it is the view's, hosted inside the shell header.
  const hostedBar = page.locator(`${sel.shellHeader} ${sel.headerHost} ${sel.topbar}`);
  await expect(hostedBar).toHaveCount(1);
  await expect(hostedBar).toHaveClass(/persona-history-topbar--shell/);
  await expect(page.locator(`${sel.view} ${sel.topbar}`)).toHaveCount(0);
  await expect(page.locator(`${sel.shellHeader} .persona-history-title`)).toHaveText(
    "Messages"
  );
  await expect(page.locator(`${sel.shellHeader} ${sel.close}`)).toBeVisible();

  // Focus entered the bar the shell now hosts.
  await expect(page.locator(sel.close)).toBeFocused();

  // Keyboard traversal can never land inside the conversation, its composer, or
  // a suppressed header control; the hosted bar is reachable and is not a trap.
  const reached: string[] = [];
  for (let step = 0; step < 25; step += 1) {
    await page.keyboard.press("Tab");
    reached.push(
      await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        if (!active) return "none";
        if (active.closest("[data-persona-history-suppressed]")) return "suppressed";
        if (active.closest(".persona-widget-footer")) return "footer";
        if (active.closest("#persona-scroll-container")) return "transcript";
        if (active.closest(".persona-history-view, .persona-history-header-host"))
          return "view";
        return "outside";
      })
    );
  }
  expect(reached).not.toContain("footer");
  expect(reached).not.toContain("transcript");
  expect(reached).not.toContain("suppressed");
  expect(reached).toContain("view");
  // No trap: traversal does leave the widget.
  expect(reached).toContain("outside");

  // A direct programmatic focus attempt is refused too: inert, not just hidden.
  const composerFocused = await page.evaluate(() => {
    const composer = document.querySelector<HTMLElement>(
      ".persona-widget-footer textarea, .persona-widget-footer input"
    );
    composer?.focus();
    return Boolean(composer && document.activeElement === composer);
  });
  expect(composerFocused).toBe(false);

  // Closing restores the conversation, the header's own children, and focus.
  await page.locator(sel.close).click();
  await expect(page.locator(sel.view)).toHaveCount(0);
  await expect(toggle).toBeFocused();
  await expect(transcript).not.toHaveAttribute("inert", /.*/);
  await expect(transcript).not.toHaveAttribute("aria-hidden", /.*/);
  await expect(footer).toBeVisible();
  await expect(header).toBeVisible();
  await expect(header).not.toHaveAttribute("inert", /.*/);
  await expect(header).not.toHaveAttribute("aria-hidden", /.*/);
  await expect(page.locator("[data-persona-history-suppressed]")).toHaveCount(0);
  await expect(page.locator(sel.headerHost)).toHaveCount(0);
  await expect(toggle).toBeVisible();
});
