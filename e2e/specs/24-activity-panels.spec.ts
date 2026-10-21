import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { createTheme, themeToCssVariables } from "../../packages/widget/src/utils/tokens";
import type { DeepPartial, PersonaTheme } from "../../packages/widget/src/types/theme";

test("V5 nested tool rows stay compact without shrinking parent or touch controls", async ({ page, browser }) => {
  const markup = `<main data-persona-root data-persona-defaults="v5" style="font:14px/1.5 sans-serif">
    <div class="persona-tool-bubble persona-activity-row" data-persona-tool-group>
      <button id="parent" class="persona-activity-header">Searched docs, read files</button>
      <div data-persona-tool-group-stack>
        <div class="persona-activity-group-child"><div class="persona-tool-bubble persona-activity-row">
          <button id="child" class="persona-activity-header"><span class="persona-activity-label">Read a file</span></button>
        </div></div>
      </div>
    </div>
    <div class="persona-tool-bubble persona-activity-row"><button id="standalone" class="persona-activity-header">Searched docs</button></div>
  </main>`;
  const css = readFileSync(resolve(__dirname, "../../packages/widget/src/styles/widget.css"), "utf8");
  const apply = async (target: typeof page, components: DeepPartial<PersonaTheme>["components"] = {}) => {
    const variables = themeToCssVariables(createTheme({ components }, { future: { v5Defaults: true }, validate: false }));
    await target.locator("main").evaluate((root, values) => {
      const element = root as HTMLElement;
      element.style.cssText = "font:14px/1.5 sans-serif";
      for (const [key, value] of Object.entries(values)) element.style.setProperty(key, value);
    }, variables);
  };
  await page.setContent(markup);
  await page.addStyleTag({ content: css });
  await apply(page);
  const child = page.locator("#child");
  await expect(child).toHaveCSS("height", "28px");
  await expect(child).toHaveCSS("padding-top", "2px");
  for (const id of ["parent", "standalone"]) await expect(page.locator(`#${id}`)).toHaveCSS("height", "32px");
  await page.locator("main").evaluate(root => root.setAttribute("data-persona-defaults", "v4"));
  await expect(child).toHaveCSS("height", "32px");
  await expect(child).toHaveCSS("padding-top", "4px");
  await page.locator("main").evaluate(root => root.setAttribute("data-persona-defaults", "v5"));
  await apply(page, { activity: { rowHeight: "40px" } });
  await expect(child).toHaveCSS("height", "40px");
  await apply(page, { toolBubble: { rowHeight: "36px" } });
  await expect(child).toHaveCSS("height", "36px");
  await child.evaluate(header => {
    header.classList.add("persona-theme-padding");
    (header as HTMLElement).style.setProperty("--persona-theme-padding", "10px 12px");
  });
  await expect(child).toHaveCSS("padding", "10px 12px");
  await child.evaluate(header => {
    header.classList.remove("persona-theme-padding");
    (header as HTMLElement).style.width = "100px";
    header.textContent = "Read a file with a long descriptive tool label";
  });
  await apply(page);
  expect((await child.boundingBox())!.height).toBeGreaterThan(28);
  expect(await child.evaluate(header => header.scrollHeight <= header.clientHeight)).toBe(true);

  const touchContext = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  try {
    const touch = await touchContext.newPage();
    await touch.setContent(markup);
    await touch.addStyleTag({ content: css });
    await apply(touch);
    expect(await touch.evaluate(() => matchMedia("(any-pointer: coarse)").matches)).toBe(true);
    await expect(touch.locator("#child")).toHaveCSS("height", "44px");
    await expect(touch.locator("#parent")).toHaveCSS("height", "32px");
    await apply(touch, { activity: { rowHeight: "48px" } });
    await expect(touch.locator("#child")).toHaveCSS("height", "48px");
  } finally { await touchContext.close(); }
});

// Actual browser CSS inheritance is intentional: jsdom leaves nested var()
// expressions unresolved. Rendering/legacy style projection has unit coverage.
test("activity panel inheritance, explicit zero, live resets and independent surfaces", async ({ page }) => {
  await page.setContent(`<main id="root">
    <div class="persona-tool-bubble persona-activity-row"><section id="tool" class="persona-tool-detail" data-persona-tool-detail="response">Response</section></div>
    <div class="persona-reasoning-bubble persona-activity-row" data-appearance="panel"><div class="persona-border-t"><div id="reasoning">Reasoning</div></div></div>
    <div class="persona-reasoning-bubble persona-activity-row" data-appearance="plain"><div class="persona-border-t"><div id="plain">Plain</div></div></div>
    <div class="persona-reasoning-bubble persona-activity-row" data-appearance="inset"><div class="persona-border-t"><div id="inset">Inset</div></div></div>
    <div class="persona-reasoning-bubble" data-appearance="panel"><div class="persona-border-t"><div id="card">Card</div></div></div>
    <div id="approval" class="persona-tool-detail">Approval</div>
  </main>`);
  await page.addStyleTag({ content: readFileSync(resolve(__dirname, "../../packages/widget/src/styles/widget.css"), "utf8") });
  const apply = async (theme?: DeepPartial<PersonaTheme>) => {
    const css = themeToCssVariables(createTheme(theme, { future: { v5Defaults: true }, validate: false }));
    await page.locator("#root").evaluate((root, variables) => {
      const element = root as HTMLElement;
      element.removeAttribute("style");
      for (const [key, value] of Object.entries(variables)) element.style.setProperty(key, value);
    }, css);
  };
  await apply({ components: {
    activity: { panel: { background: "#f0f1f2", borderColor: "#123456", borderWidth: "1px", borderRadius: "15px", padding: "16px 18px" } },
    toolBubble: { panel: { background: "#ffeedd", borderWidth: "0px" } },
    reasoningBubble: { panel: { borderRadius: "3px" } },
  } });
  await expect(page.locator("#tool")).toHaveCSS("background-color", "rgb(255, 238, 221)");
  await expect(page.locator("#tool")).toHaveCSS("border-width", "0px");
  await expect(page.locator("#tool")).toHaveCSS("border-color", "rgb(18, 52, 86)");
  await expect(page.locator("#tool")).toHaveCSS("border-radius", "15px");
  await expect(page.locator("#tool")).toHaveCSS("padding", "16px 18px");
  await expect(page.locator("#reasoning")).toHaveCSS("background-color", "rgb(240, 241, 242)");
  await expect(page.locator("#reasoning")).toHaveCSS("border-width", "1px");
  await expect(page.locator("#reasoning")).toHaveCSS("border-radius", "3px");
  await expect(page.locator("#reasoning")).toHaveCSS("padding", "16px 18px");
  for (const id of ["plain", "inset", "card"]) {
    await expect(page.locator(`#${id}`)).not.toHaveCSS("padding", "16px 18px");
    await expect(page.locator(`#${id}`)).not.toHaveCSS("background-color", "rgb(240, 241, 242)");
  }
  await expect(page.locator("#approval")).toHaveCSS("padding", "10px 12px");
  await expect(page.locator("#approval")).toHaveCSS("border-radius", "8px");
  await apply({ components: { activity: { bodySurface: "#aabbcc", panel: { borderColor: "red", padding: "18px" } }, toolBubble: { bodySurface: "#112233", panel: undefined } } });
  await expect(page.locator("#tool")).toHaveCSS("background-color", "rgb(17, 34, 51)");
  await expect(page.locator("#reasoning")).toHaveCSS("background-color", "rgb(170, 187, 204)");
  for (const id of ["tool", "reasoning"]) {
    await expect(page.locator(`#${id}`)).toHaveCSS("border-width", "0px");
    await expect(page.locator(`#${id}`)).toHaveCSS("border-radius", "8px");
    await expect(page.locator(`#${id}`)).toHaveCSS("padding", "18px");
  }
  await apply();
  for (const turn of [false, true]) {
    await page.locator("#root").evaluate((root, nested) => root.classList.toggle("persona-turn-activity-body", nested), turn);
    for (const id of ["tool", "reasoning"]) {
      await expect(page.locator(`#${id}`)).toHaveCSS("padding", "10px 12px");
      await expect(page.locator(`#${id}`)).toHaveCSS("border-width", "0px");
      await expect(page.locator(`#${id}`)).toHaveCSS("border-radius", "8px");
    }
  }
  await expect(page.locator("#tool")).toHaveCSS("background-color", await page.locator("#reasoning").evaluate(element => getComputedStyle(element).backgroundColor));
});


test("reasoning typography preserves V4 and applies readable V5 defaults and live overrides", async ({ page }) => {
  await page.setContent(`<main id="root" data-persona-root data-persona-defaults="v5">
    <div class="persona-reasoning-bubble persona-activity-row"><div class="persona-border-t persona-activity-body"><div id="row" class="persona-whitespace-pre-wrap">Row reasoning</div></div></div>
    <div class="persona-reasoning-bubble"><div class="persona-border-t"><div id="card" class="persona-whitespace-pre-wrap">Card reasoning</div></div></div>
  </main>`);
  await page.addStyleTag({ content: readFileSync(resolve(__dirname, "../../packages/widget/src/styles/widget.css"), "utf8") });
  for (const id of ["row", "card"]) {
    await expect(page.locator(`#${id}`)).toHaveCSS("font-size", "14px");
    await expect(page.locator(`#${id}`)).toHaveCSS("line-height", "21.7px");
  }
  await page.locator("#root").evaluate(root => {
    const element = root as HTMLElement;
    element.style.setProperty("--persona-muted", "#123abc");
    element.style.setProperty("--persona-components-activity-bodySize", "16px");
    element.style.setProperty("--persona-components-activity-bodyLineHeight", "1.75");
  });
  for (const id of ["row", "card"]) {
    await expect(page.locator(`#${id}`)).toHaveCSS("color", "rgb(18, 58, 188)");
    await expect(page.locator(`#${id}`)).toHaveCSS("font-size", "16px");
    await expect(page.locator(`#${id}`)).toHaveCSS("line-height", "28px");
  }
  await page.locator("#root").evaluate(root => {
    root.removeAttribute("style");
    root.setAttribute("data-persona-defaults", "v4");
  });
  await expect(page.locator("#card")).toHaveCSS("font-size", "12px");
  await expect(page.locator("#card")).toHaveCSS("line-height", "16.5px");
  await expect(page.locator("#row")).toHaveCSS("font-size", "12px");
  await expect(page.locator("#row")).toHaveCSS("line-height", "18px");
});


test("shared activity overflow, per-property overrides, V4 fallbacks and unmasked controls", async ({ page }) => {
  await page.setContent(`<main id="root" data-persona-root data-persona-defaults="v5">
    <div class="persona-tool-bubble"><section id="tool-frame" class="persona-tool-detail" data-persona-tool-detail="request"><div id="label" class="persona-tool-detail-label">Request</div><pre id="request" class="persona-tool-detail-value persona-activity-scroll" tabindex="0" data-persona-scroll-bottom>Request content</pre><button id="copy">Copy</button></section>
      <section class="persona-tool-detail" data-persona-tool-detail="response"><pre id="response" class="persona-tool-detail-value persona-activity-scroll">Response content</pre></section></div>
    ${["row", "card"].flatMap(layout => ["plain", "inset", "panel"].map(appearance => `<div class="persona-reasoning-bubble ${layout === "row" ? "persona-activity-row" : ""}" data-appearance="${appearance}"><div class="persona-border-t persona-activity-body"><div class="persona-whitespace-pre-wrap"><div class="persona-activity-scroll reasoning" tabindex="0">Reasoning</div></div></div></div>`)).join("")}
  </main>`);
  await page.addStyleTag({ content: readFileSync(resolve(__dirname, "../../packages/widget/src/styles/widget.css"), "utf8") });
  const apply = async (theme?: DeepPartial<PersonaTheme>, v5 = true) => {
    const variables = themeToCssVariables(createTheme(theme, { future: { v5Defaults: v5 }, validate: false }));
    await page.locator("#root").evaluate((root, { variables, v5 }) => {
      const el = root as HTMLElement;
      el.removeAttribute("style"); el.dataset.personaDefaults = v5 ? "v5" : "v4";
      for (const [key, value] of Object.entries(variables)) el.style.setProperty(key, value);
    }, { variables, v5 });
  };
  const check = async (height: string, fade: string, selector = ".persona-activity-scroll") => {
    for (const el of await page.locator(selector).all()) {
      await expect(el).toHaveCSS("max-height", height);
      await expect(el).toHaveCSS("--persona-activity-fade-height", fade);
    }
  };
  await apply(); await check("240px", "12px");
  await expect(page.locator("#request")).toHaveCSS("mask-image", /12px/);
  for (const id of ["tool-frame", "label", "copy"]) await expect(page.locator(`#${id}`)).toHaveCSS("mask-image", "none");
  await page.locator("#request").focus();
  await expect(page.locator("#tool-frame")).toHaveCSS("outline-style", "solid");
  await expect(page.locator("#request")).toHaveCSS("outline-style", "none");
  await apply({ components: {
    activity: { overflow: { maxHeight: "360px", fadeHeight: "16px" } },
    toolBubble: { overflow: { maxHeight: "140px" } }, reasoningBubble: { overflow: { fadeHeight: "0px" } },
  } });
  await check("140px", "16px", ".persona-tool-bubble .persona-activity-scroll");
  await check("360px", "0px", ".reasoning");
  await apply({ components: { activity: { overflow: { maxHeight: "none", fadeHeight: "0px" } } } });
  await check("none", "0px");
  await apply(); await check("240px", "12px");
  await apply(undefined, false);
  await check("none", "0px", ".reasoning");
  await check("174px", "0px", ".persona-tool-bubble .persona-activity-scroll");
  await apply({ components: { activity: { overflow: { maxHeight: "120px", fadeHeight: "8px" } }, toolBubble: { overflow: { maxHeight: "none" } } } }, false);
  await check("120px", "8px", ".reasoning");
  await check("none", "8px", ".persona-tool-bubble .persona-activity-scroll");
  await page.locator(".reasoning").first().evaluate(el => { (el as HTMLElement).style.maxHeight = "90px"; });
  await expect(page.locator(".reasoning").first()).toHaveCSS("max-height", "90px");
});
