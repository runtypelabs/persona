import { expect, test, type Locator } from "@playwright/test";

async function expectClickable(control: Locator) {
  await expect(control).toBeVisible();
  await expect.poll(() => control.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return hit === element || element.contains(hit);
  })).toBe(true);
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1440, height: 900 },
]) {
  test.describe(`${viewport.width}px showcase`, () => {
    test.use({ viewport });

    test("header clears the page title and navigation remains usable", async ({ page }) => {
      await page.goto("/assistant-composers.html");
      const header = page.locator(".shell-header");
      await expect(header).toBeVisible();
      const heading = page.locator(".title-strip h1");
      const headerBox = await header.boundingBox();
      const headingBox = await heading.boundingBox();
      expect(headingBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      const picker = page.getByRole("button", { name: "Search Persona examples" });
      await expectClickable(picker);
      await picker.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      if (viewport.width <= 1100) {
        await page.mouse.move(5, 300);
        await page.mouse.wheel(0, 500);
        await expect.poll(() => header.evaluate(el => el.getBoundingClientRect().bottom)).toBeLessThanOrEqual(0);
      } else {
        await expect(header).toHaveCSS("position", "fixed");
      }
    });

    test("artifact drawer close, reopen and tab controls remain accessible", async ({ page }) => {
      await page.goto("/artifact-display-preferences.html");
      const pane = page.locator(".persona-artifact-pane");
      const close = pane.getByRole("button", { name: "Close", exact: true });
      await close.scrollIntoViewIfNeeded();
      await expectClickable(close);
      await pane.getByRole("tab", { name: "README", exact: true }).click();
      await expect(pane.getByRole("tab", { name: "README", exact: true })).toHaveAttribute("aria-selected", "true");
      await close.click();
      await expect(close).not.toBeVisible();
      await page.getByRole("button", { name: "Open README in artifact panel", exact: true }).click();
      await close.scrollIntoViewIfNeeded();
      await expectClickable(close);
      await close.click();
      await expect(close).not.toBeVisible();
    });

    test("launcher panel controls stay above showcase chrome", async ({ page }) => {
      await page.goto("/agent-demo.html");
      await page.locator('.mount-toggle-button[data-mode="launcher"]').click();
      const launcher = page.getByRole("button", { name: "Travel Planner Plan a multi-day trip with an agent loop", exact: true });
      await launcher.click();
      const close = page.getByRole("button", { name: "Close chat", exact: true });
      await expectClickable(close);
      const input = page.getByRole("textbox");
      await input.fill("A local draft");
      await expect(input).toHaveValue("A local draft");
      await close.click();
      await expectClickable(launcher);
      await launcher.click();
      await expectClickable(close);
      await expect(input).toHaveValue("A local draft");
    });
  });
}
