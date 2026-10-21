import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1100, height: 900 } });

// A short anchored transcript needs spacer room below its messages. Collapsing
// details must replace that room before the browser clamps the scroll position.
for (const activation of ["pointer", "keyboard"] as const) {
  for (const kind of ["reasoning", "group", "tool"] as const) {
    for (const reducedMotion of [false, true]) {
      test(`${activation} ${kind} disclosure preserves the anchored transcript (reduced motion: ${reducedMotion})`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion: reducedMotion ? "reduce" : "no-preference" });
        await page.goto("/v5-preview.html");
        await page.evaluate(async () => { await document.fonts.ready; });
        await page.locator("#v5-reset").click();

        const transcript = page.locator("#v5-host .persona-widget-body");
        await expect.poll(() => transcript.evaluate(el => el.scrollTop)).toBe(8);

        if (kind === "tool") {
          await page.locator("#v5-host [data-persona-tool-group] > button[data-expand-header]").click();
        }
        const header = kind === "reasoning"
          ? page.getByRole("button", { name: "Thought for 6s" })
          : page.locator(kind === "group"
            ? "#v5-host [data-persona-tool-group] > button[data-expand-header]"
            : '#v5-host [data-message-id="search"] > button[data-expand-header]');
        // Opening a group animates its children into view. Let that entrance
        // finish and bring the chosen control into view before measuring it.
        await page.evaluate(async () => {
          await Promise.all(document.getAnimations()
            .filter(animation => animation.effect?.getTiming().iterations !== Infinity)
            .map(animation => animation.finished.catch(() => {})));
        });
        await header.scrollIntoViewIfNeeded();
        if (activation === "keyboard") await header.focus();

        const before = await transcript.evaluate(el => el.scrollTop);
        expect(before).toBeGreaterThan(0);
        const headerY = (await header.boundingBox())!.y;

        for (let toggle = 0; toggle < 6; toggle++) {
          if (activation === "pointer") await header.click();
          else await header.press("Enter");
          await expect(header).toHaveAttribute("aria-expanded", toggle % 2 === 0 ? "true" : "false");

          // Sample several painted frames: checking only the eventual state can
          // miss a clamp followed by a delayed ResizeObserver spacer correction.
          const samples = await header.evaluate(async el => {
            const body = el.closest(".persona-widget-body")!;
            const result: Array<{ top: number; y: number }> = [];
            for (let frame = 0; frame < 16; frame++) {
              await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
              result.push({ top: body.scrollTop, y: el.getBoundingClientRect().y });
            }
            return result;
          });
          for (const sample of samples) {
            expect(Math.abs(sample.top - before), `toggle ${toggle}: ${JSON.stringify(samples)}`).toBeLessThan(1);
            expect(Math.abs(sample.y - headerY), `toggle ${toggle}: ${JSON.stringify(samples)}`).toBeLessThan(1);
          }
        }
        if (!reducedMotion) {
          // Reverse in-flight effects as a visitor rapidly opens and closes.
          for (let toggle = 0; toggle < 4; toggle++) {
            if (activation === "pointer") await header.click();
            else await header.press("Enter");
          }
          await page.evaluate(async () => {
            await Promise.all(document.getAnimations()
              .filter(animation => animation.effect?.getTiming().iterations !== Infinity)
              .map(animation => animation.finished.catch(() => {})));
          });
          expect(await transcript.evaluate(el => el.scrollTop)).toBe(before);
          expect(Math.abs((await header.boundingBox())!.y - headerY)).toBeLessThan(1);
        }
      });
    }
  }
}
