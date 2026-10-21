import { expect, test, type Page } from "@playwright/test";

// Playwright disables bfcache and does not support cached goBack restores:
// https://playwright.dev/docs/api/class-page#page-go-back
// Exercise persisted lifecycle events on the real built demos without a
// reload, which would conceal the destroyed-widget regression. Actual Back
// navigation is additionally verified in regular Chrome outside this harness.
async function cachedPageLifecycle(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
  // Let cancelled work settle without actually freezing the renderer: this
  // catches timers/callbacks that would otherwise continue after restoration.
  await page.waitForTimeout(100);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
}

for (const version of ["v4", "v5"]) {
  test(`${version} assistant composer preserves its draft through repeated cached Back`, async ({ page }) => {
    await page.goto("/assistant-composers.html");
    await page.locator("#lab-defaults").selectOption(version);
    const input = page.locator("#lab-mount").getByRole("textbox");
    await input.fill("Keep this unfinished draft");
    for (let cycle = 1; cycle <= 2; cycle++) {
      await cachedPageLifecycle(page);
      await expect(input).toHaveValue("Keep this unfinished draft");
    }
    await input.press("Enter");
    await expect(page.locator("#lab-mount")).toContainText("local Persona preview");
  });

  test(`${version} cached Back stops a response and accepts a new message`, async ({ page }) => {
    await page.goto("/assistant-composers.html");
    await page.locator("#lab-defaults").selectOption(version);
    const host = page.locator("#lab-mount");
    const input = host.getByRole("textbox");
    await input.fill("Start a response before leaving");
    await input.press("Enter");
    await expect(host.getByRole("button", { name: "Stop generating", exact: true })).toBeVisible();
    await cachedPageLifecycle(page);
    await expect(host.getByRole("button", { name: "Stop generating", exact: true })).toHaveCount(0);
    await expect(input).toBeEnabled();
    await input.fill("A fresh response after Back");
    await input.press("Enter");
    await expect(host).toContainText("A fresh response after Back");
    await expect(host).toContainText("local Persona preview");
  });
}

test("cached Back cancels dictation and preserves the preceding draft", async ({ page }) => {
  await page.goto("/assistant-composers.html");
  const input = page.locator("#lab-mount").getByRole("textbox");
  await input.fill("Draft before recording");
  await page.locator("#lab-dictate").click();
  await expect(page.locator("#lab-dictate")).toHaveText("Finish dictation");
  await cachedPageLifecycle(page);
  await expect(input).toHaveValue("Draft before recording");
  await expect(page.locator("#lab-dictate")).toHaveText("Simulate dictation");
  await expect(page.locator("#lab-voice")).toBeEnabled();
});

test("cached Back stops simulated voice and permits a new call", async ({ page }) => {
  await page.goto("/assistant-composers.html");
  const voice = page.locator("#lab-voice");
  await voice.click();
  await expect(voice).toHaveText("End voice conversation");
  await cachedPageLifecycle(page);
  await expect(voice).toHaveText("Simulate voice");
  await expect(voice).toHaveAttribute("aria-pressed", "false");
  await voice.click();
  await expect(voice).toHaveText("End voice conversation");
  await voice.click();
  await expect(voice).toHaveText("Simulate voice");
});

for (const demo of [
  { path: "embedded-host", host: "#research" },
  { path: "v5-preview", host: "#v5-host" },
  { path: "style-migration", host: "#live-host" },
]) {
  test(`${demo.path} remains interactive after cached Back`, async ({ page }) => {
    await page.goto(`/${demo.path}.html`);
    const input = page.locator(demo.host).getByRole("textbox");
    await input.fill("A preserved demo draft");
    await cachedPageLifecycle(page);
    await expect(input).toHaveValue("A preserved demo draft");
    await input.fill("Editable after Back");
    await expect(input).toHaveValue("Editable after Back");
  });
}

test("V5 preview cancels synthetic stream timers on cached navigation", async ({ page }) => {
  await page.goto("/v5-preview.html");
  await expect(page.locator("#v5-host").getByRole("textbox")).toBeVisible();
  await page.locator("#v5-scene").selectOption("streaming");
  await page.locator("#v5-stream").click();
  await expect(page.locator("#v5-stream")).toBeDisabled();
  await cachedPageLifecycle(page);
  await expect(page.locator("#v5-stream")).toBeEnabled();
  await expect(page.locator("#v5-host").getByRole("textbox")).toBeEnabled();
  await page.locator("#v5-stream").click();
  await expect(page.locator("#v5-status")).toHaveText("Streaming…");
  await expect(page.locator("#v5-stream")).toBeEnabled();
  await expect(page.locator("#v5-status")).toBeEmpty();
});
