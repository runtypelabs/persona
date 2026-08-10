import { expect, test } from "@playwright/test";
import { sel } from "../fixtures/history-page";

/**
 * Gate 10: in panel presentation a visitor browsing Messages must not be able
 * to see or reach the composer that would send into the conversation hidden
 * underneath, and closing must return focus to the control that opened it.
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

  // Focus entered the view.
  await expect(page.locator(sel.close)).toBeFocused();

  // Keyboard traversal can never land inside the conversation or its composer.
  const reached: string[] = [];
  for (let step = 0; step < 25; step += 1) {
    await page.keyboard.press("Tab");
    reached.push(
      await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        if (!active) return "none";
        if (active.closest(".persona-widget-footer")) return "footer";
        if (active.closest("#persona-scroll-container")) return "transcript";
        if (active.closest(".persona-history-view")) return "view";
        return "outside";
      })
    );
  }
  expect(reached).not.toContain("footer");
  expect(reached).not.toContain("transcript");
  expect(reached).toContain("view");

  // A direct programmatic focus attempt is refused too: inert, not just hidden.
  const composerFocused = await page.evaluate(() => {
    const composer = document.querySelector<HTMLElement>(
      ".persona-widget-footer textarea, .persona-widget-footer input"
    );
    composer?.focus();
    return Boolean(composer && document.activeElement === composer);
  });
  expect(composerFocused).toBe(false);

  // Closing restores the conversation and returns focus to the invoker.
  await page.locator(sel.close).click();
  await expect(page.locator(sel.view)).toHaveCount(0);
  await expect(toggle).toBeFocused();
  await expect(transcript).not.toHaveAttribute("inert", /.*/);
  await expect(transcript).not.toHaveAttribute("aria-hidden", /.*/);
  await expect(footer).toBeVisible();
});
