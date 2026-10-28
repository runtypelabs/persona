import { expect, test, type Locator, type Page } from "@playwright/test";

test.use({ viewport: { width: 1100, height: 900 } });

// A long sent message collapses to `maxHeight` before the anchor-top pin
// measures it, and toggling "Show more" / "Show less" while pinned keeps the
// bubble's top fixed: the scroll position never clamps or re-anchors.
const LONG_MESSAGE = Array.from(
  { length: 30 },
  (_, i) => `Line ${i + 1}: a long pasted paragraph that the reader typed or dictated.`
).join("\n");

const open = async (page: Page, reducedMotion: boolean) => {
  await page.emulateMedia({ reducedMotion: reducedMotion ? "reduce" : "no-preference" });
  const config = { launcher: { fullHeight: true }, features: { userMessageCollapse: { enabled: true } } };
  await page.goto(`/verify.html?delayMs=4&config=${encodeURIComponent(JSON.stringify(config))}`);
  await page.waitForFunction(() => Boolean((window as { __personaVerify?: { ready?: boolean } }).__personaVerify?.ready));
  await page.evaluate(async () => { await document.fonts.ready; });
};

// Several painted frames, so a clamp followed by a late correction can't hide.
const sampleTop = (bubble: Locator) =>
  bubble.evaluate(async (el) => {
    const body = el.closest<HTMLElement>("#persona-scroll-container")!;
    const samples: Array<{ scrollTop: number; top: number }> = [];
    for (let frame = 0; frame < 12; frame++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      samples.push({
        scrollTop: body.scrollTop,
        top: el.getBoundingClientRect().top - body.getBoundingClientRect().top,
      });
    }
    return samples;
  });

for (const reducedMotion of [false, true]) {
  test(`collapses a long sent message and toggles it without moving the pin (reduced motion: ${reducedMotion})`, async ({ page }) => {
    await open(page, reducedMotion);
    const composer = page.getByPlaceholder("Send a message…");
    await composer.fill(LONG_MESSAGE);
    await composer.press("Enter");
    await expect(page.getByText(/This reply is scripted by the verify fixture/)).toBeAttached({ timeout: 30_000 });

    const bubble = page.locator(".persona-message-user-bubble").first();
    const region = bubble.locator("[data-persona-user-collapse]");
    const toggle = bubble.locator("button[data-persona-user-collapse-toggle]");
    await expect(toggle).toHaveText("Show more");
    await expect(region).toHaveAttribute("data-persona-user-collapse", "collapsed");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveAttribute("aria-controls", (await region.getAttribute("id"))!);
    // Clipped to the 240px default, but the whole text is still in the DOM.
    expect((await region.boundingBox())!.height).toBeLessThanOrEqual(241);
    await expect(region).toContainText("Line 30:");

    const [{ top: pinnedTop, scrollTop: pinnedScroll }] = await sampleTop(bubble);
    // anchor-top pins the sent message 16px below the transcript top.
    expect(Math.abs(pinnedTop - 16)).toBeLessThan(2);

    for (let round = 0; round < 2; round++) {
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await expect(toggle).toHaveText("Show less");
      expect((await region.boundingBox())!.height).toBeGreaterThan(500);
      for (const sample of await sampleTop(bubble)) {
        expect(Math.abs(sample.top - pinnedTop), JSON.stringify(sample)).toBeLessThan(1);
        expect(Math.abs(sample.scrollTop - pinnedScroll), JSON.stringify(sample)).toBeLessThan(1);
      }

      // Keyboard activation goes through the same native button.
      await toggle.focus();
      await page.keyboard.press("Enter");
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(toggle).toHaveText("Show more");
      for (const sample of await sampleTop(bubble)) {
        expect(Math.abs(sample.top - pinnedTop), JSON.stringify(sample)).toBeLessThan(1);
        expect(Math.abs(sample.scrollTop - pinnedScroll), JSON.stringify(sample)).toBeLessThan(1);
      }
      await expect(toggle).toBeFocused();
    }

    // Expanded, the reply is pushed below the fold; jump-to-latest still reaches it.
    await toggle.click();
    const jump = page.locator("[data-persona-scroll-to-bottom]");
    await expect(jump).toHaveAttribute("data-persona-scroll-to-bottom-visible", "true");
    await jump.click();
    await expect(page.getByText(/This reply is scripted by the verify fixture/)).toBeInViewport();
    await expect(region).toHaveAttribute("data-persona-user-collapse", "expanded");
  });
}
