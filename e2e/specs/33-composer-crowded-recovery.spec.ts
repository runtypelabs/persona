import { expect, test, type Locator } from "@playwright/test";
import type { AgentWidgetController } from "../../packages/widget/src/ui";

const sameRow = async (start: Locator, end: Locator) => {
  const a = (await start.boundingBox())!;
  const b = (await end.boundingBox())!;
  return Math.abs(a.y + a.height / 2 - b.y - b.height / 2) < 1;
};

for (const visibility of ["always", "when-text"] as const) {
  for (const direction of ["ltr", "rtl"] as const) {
    test(`crowded composer recovers with ${visibility} send (${direction})`, async ({ page }) => {
      const config = {
        composer: { layout: "stacked", placement: "block" },
        sendButton: { visibility },
      };
      await page.goto(`/verify.html?config=${encodeURIComponent(JSON.stringify(config))}`);
      await page.waitForFunction(() => Boolean((window as { __personaVerify?: { ready?: boolean } }).__personaVerify?.ready));
      await page.evaluate(async (direction) => {
        await document.fonts.ready;
        document.documentElement.dir = direction;
        document.querySelector<HTMLElement>("#verify-host")!.style.width = "380px";
        const { controller } = (window as unknown as { __personaVerify: { controller: AgentWidgetController } }).__personaVerify;
        controller.update({ composer: { actions: [{
          id: "context", kind: "custom", label: "Toggle context", placement: "start",
          render: () => {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = "Toggle context";
            button.style.cssText = "width:80px;height:40px;flex-shrink:0";
            button.onclick = () => { button.style.width = button.style.width === "80px" ? "300px" : "80px"; };
            return { element: button };
          },
        }] } });
      }, direction);

      const draft = page.getByPlaceholder("Send a message…");
      if (visibility === "when-text") await draft.fill("Keep send visible");
      const footer = page.locator(".persona-widget-footer");
      const context = page.getByRole("button", { name: "Toggle context" });
      const send = page.locator("[data-persona-composer-submit]");
      const sendWrapper = page.locator(".persona-send-button-wrapper:has(> [data-persona-composer-submit])");
      await expect(send).toBeVisible();
      await expect(footer).not.toHaveAttribute("data-persona-composer-crowded");
      await expect.poll(() => sameRow(context, send)).toBe(true);

      // Exercise repeated content changes without ever hiding/remounting send.
      for (let cycle = 0; cycle < 2; cycle++) {
        await context.click();
        await expect(footer).toHaveAttribute("data-persona-composer-crowded", "");
        await expect.poll(() => sendWrapper.evaluate(el => parseFloat(getComputedStyle(el).marginInlineStart))).toBeGreaterThan(100);
        await expect.poll(() => sameRow(context, send)).toBe(false);
        await context.click();
        await expect(footer).not.toHaveAttribute("data-persona-composer-crowded");
        await expect.poll(() => sameRow(context, send)).toBe(true);
        await expect(send).toBeVisible();
      }

      // A host resize must also recover, with the wide action still mounted.
      await context.click();
      await expect(footer).toHaveAttribute("data-persona-composer-crowded", "");
      await page.locator("#verify-host").evaluate(el => { el.style.width = "720px"; });
      await expect(footer).not.toHaveAttribute("data-persona-composer-crowded");
      await expect.poll(() => sameRow(context, send)).toBe(true);
      await expect(send).toBeVisible();
      await expect(draft).toHaveValue(visibility === "when-text" ? "Keep send visible" : "");
    });
  }
}
