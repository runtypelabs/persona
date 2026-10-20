import { expect, test, type Page } from "@playwright/test";

type CharacterStyle = { char: string; weight: string; style: string; bold: boolean; italic: boolean; code: boolean };
type MarkdownFrame = { text: string; prose: string; strong: string[]; emphasis: string[]; code: string[]; links: string[]; images: string[]; paragraph: CharacterStyle[] };
declare global {
  interface Window { markdownFrames: MarkdownFrame[] }
}

async function observeMarkdown(page: Page) {
  await page.evaluate(() => {
    window.markdownFrames = [];
    const host = document.querySelector("#lab-mount")!;
    new MutationObserver(() => {
      const content = host.querySelector('[data-persona-theme-zone="assistant-message"] .persona-message-content');
      if (!content) return;
      const prose = content.cloneNode(true) as HTMLElement;
      prose.querySelectorAll("pre, code").forEach(element => element.remove());
      const texts = (selector: string) => Array.from(content.querySelectorAll(selector), element => element.textContent ?? "");
      const paragraph: CharacterStyle[] = [];
      const firstParagraph = content.querySelector("p");
      if (firstParagraph) {
        const walker = document.createTreeWalker(firstParagraph, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const element = node.parentElement!;
          const computed = getComputedStyle(element);
          for (const char of node.textContent ?? "") {
            if (/\s/.test(char)) continue;
            paragraph.push({ char, weight: computed.fontWeight, style: computed.fontStyle,
              bold: !!element.closest("strong"), italic: !!element.closest("em"), code: !!element.closest("code") });
          }
        }
      }
      window.markdownFrames.push({
        text: content.textContent ?? "", prose: prose.textContent ?? "", strong: texts("strong"), emphasis: texts("em"), code: texts("code"),
        links: Array.from(content.querySelectorAll("a"), element => element.getAttribute("href") ?? ""),
        images: Array.from(content.querySelectorAll("img"), element => element.getAttribute("src") ?? ""),
        paragraph,
      });
    }).observe(host, { subtree: true, childList: true, characterData: true });
  });
}

function expectStableFormatting(frames: MarkdownFrame[]) {
  const final = frames[frames.length - 1].paragraph;
  expect(final.length).toBeGreaterThan(0);
  for (const [frameIndex, frame] of frames.entries()) {
    for (const [index, character] of frame.paragraph.entries()) {
      expect(character, `Frame ${frameIndex}, character ${index}: ${frame.paragraph.map(item => item.char).join("")}`)
        .toEqual(final[index]);
    }
  }
}

for (const version of ["v4", "v5"]) {
  test(`${version} streams the Markdown sample without exposing unfinished inline syntax or URLs`, async ({ page }) => {
    await page.goto("/assistant-composers.html");
    await page.locator("#lab-defaults").selectOption(version);
    await page.locator("#lab-reply").selectOption("markdown");
    await observeMarkdown(page);
    const host = page.locator("#lab-mount");
    await host.getByRole("textbox").fill("Show the Markdown sample");
    await host.getByRole("textbox").press("Enter");
    await expect(host.getByRole("button", { name: "Stop generating", exact: true })).toBeVisible();
    await expect(host.getByRole("button", { name: "Stop generating", exact: true })).toHaveCount(0);
    const frames = await page.evaluate(() => window.markdownFrames);
    expectStableFormatting(frames);
    expect(frames.some(frame => frame.emphasis.some(text => text.length > 0 && text !== "plain JavaScript"))).toBe(true);
    expect(frames.some(frame => frame.code.some(text => text.length > 0 && "persona init".startsWith(text) && text !== "persona init"))).toBe(true);
    expect(frames.every(frame => !/[*`\[\]]|https:\/\/|data:image/.test(frame.prose))).toBe(true);
    expect(frames.flatMap(frame => frame.links).every(href => href === "https://persona-chat.dev")).toBe(true);
    await expect(host.getByRole("link", { name: "the Persona docs" })).toHaveAttribute("href", "https://persona-chat.dev");
    await expect(host.locator("table")).toContainText("Tool activity, approval prompts, and voice conversations");
    await expect(host.locator("pre code")).toHaveText('npx @runtypelabs/cli@latest persona init\n');
  });

  test(`${version} shares streaming repairs with a custom message callback`, async ({ page }) => {
    await page.goto("/assistant-composers.html");
    await page.locator("#lab-defaults").selectOption(version);
    await page.locator("#lab-reply").selectOption("custom");
    await observeMarkdown(page);
    const host = page.locator("#lab-mount");
    await host.getByRole("textbox").fill("Where is my order?");
    await host.getByRole("textbox").press("Enter");
    await expect(host.getByRole("button", { name: "Stop generating", exact: true })).toBeVisible();
    await expect(host.getByRole("button", { name: "Stop generating", exact: true })).toHaveCount(0);
    const frames = await page.evaluate(() => window.markdownFrames);
    expect(frames.length).toBeGreaterThan(2);
    expectStableFormatting(frames);
    expect(frames.some(frame => frame.strong.some(text => text.length > 0 && text !== "order update"))).toBe(true);
    expect(frames.every(frame => !/[*\[\]]|order:|\/account\//.test(frame.prose))).toBe(true);
    expect(frames.flatMap(frame => frame.links).every(href => href === "/account/orders/12345")).toBe(true);
    await expect(host.getByRole("link", { name: "Order #12345" })).toHaveAttribute("href", "/account/orders/12345");
    await expect(host.locator("strong")).toHaveText("order update");
    await expect(host.locator("em")).toHaveText("delivery details");
    await expect(page.locator("#lab-config")).toContainText("preprocessStreamingMarkdown(transformed, streaming)");
    const originalUrl = page.url();
    let alertMessage = "";
    page.once("dialog", async dialog => {
      alertMessage = dialog.message();
      await dialog.accept();
    });
    await host.getByRole("link", { name: "Order #12345" }).click();
    await expect.poll(() => alertMessage).toBe("This is a sample order link. In your app, it would open the order details page.");
    await expect(page).toHaveURL(originalUrl);
    await expect(host.getByRole("link", { name: "Order #12345" })).toBeVisible();
  });

  test(`${version} formats the composer reply before the closing bold delimiter arrives`, async ({ page }) => {
    await page.goto("/assistant-composers.html");
    await page.locator("#lab-defaults").selectOption(version);
    await observeMarkdown(page);
    const host = page.locator("#lab-mount");
    await host.getByRole("textbox").fill("Preview streaming formatting");
    await host.getByRole("textbox").press("Enter");
    await expect(host.getByRole("button", { name: "Stop generating", exact: true })).toBeVisible();
    await expect(host.getByRole("button", { name: "Stop generating", exact: true })).toHaveCount(0);
    const frames = await page.evaluate(() => window.markdownFrames);
    expectStableFormatting(frames);
    expect(frames.length).toBeGreaterThan(2);
    expect(frames.some(frame => frame.strong.some(text => text.startsWith("local") && text !== "local Persona preview"))).toBe(true);
    expect(frames.every(frame => !frame.text.includes("**"))).toBe(true);
    await expect(host.locator("strong")).toHaveText("local Persona preview");
  });
}
