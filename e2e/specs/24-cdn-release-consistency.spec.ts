import { existsSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { textTurnStream } from "../fixtures/fake-history-api";

const DIST = resolve(__dirname, "../../packages/widget/dist");
const { version } = JSON.parse(readFileSync(join(DIST, "../package.json"), "utf8")) as { version: string };
const CDN = "https://cdn.runtype.com";
const HOST = "https://persona-cdn-test.invalid";
const REPLY = "The cached entry used matching release chunks.";
test.skip(!existsSync(join(DIST, "index.global.js")), "Build the widget first");

for (const entry of ["index", "install", "launcher"] as const) {
  test(`cached latest ${entry} loads only versioned dependencies`, async ({ page }) => {
    const requested: string[] = [], errors: string[] = [];
    let requests = 0;
    page.on("pageerror", error => errors.push(error.message));
    const entryPath = `/persona/latest/${entry}.global.js`;
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin === HOST && url.pathname === "/chat") {
        requests++;
        return route.fulfill({ contentType: "text/event-stream", body: textTurnStream(REPLY) });
      }
      if (url.origin === CDN) {
        requested.push(url.pathname);
        // Simulate a deployment moving latest after the entry was cached:
        // no dependency under latest is compatible or available anymore.
        const prefix = `/persona/${version}/`;
        const file = url.pathname === entryPath ? `${entry}.global.js`
          : url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : null;
        if (!file || !existsSync(join(DIST, file))) return route.fulfill({ status: 404, body: "incompatible latest chunk" });
        return route.fulfill({
          headers: { "access-control-allow-origin": "*" },
          contentType: extname(file) === ".css" ? "text/css" : "text/javascript",
          body: readFileSync(join(DIST, file)),
        });
      }
      if (url.origin !== HOST) return route.abort();
      const config = `{ apiUrl: '/chat', persistState: false, launcher: { enabled: ${entry !== "index"}, agentIconName: 'shopping-cart' } }`;
      const markup = entry === "install" ? `
        <script>window.siteAgentConfig = { config: ${config} };</script>
        <script src="${CDN}${entryPath}"></script>`
        : entry === "launcher" ? `
        <link rel="stylesheet" href="${CDN}/persona/${version}/widget.css">
        <script src="${CDN}${entryPath}"></script>
        <script>AgentWidgetLauncher.mount({ target: document.body, config: ${config}, onOpen() {} });</script>`
        : `<link rel="stylesheet" href="${CDN}/persona/${version}/widget.css">
        <div id="chat"></div><script src="${CDN}${entryPath}"></script>
        <script>AgentWidget.initAgentWidget({ target: '#chat', config: ${config} });</script>`;
      return route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><meta charset="utf-8"></head><body>${markup}</body></html>` });
    });
    await page.goto(HOST);
    if (entry === "launcher") {
      await expect.poll(() => requested).toContain(`/persona/${version}/icons-extra.js`);
      await expect(page.locator('[data-persona-launcher-surface] button')).toBeVisible();
    } else {
      if (entry === "install") await page.locator('[data-persona-launcher-surface] button').click();
      const composer = page.locator('[data-persona-composer-input]').first();
      await composer.fill("Hello");
      await composer.press("Enter");
      await expect(page.getByText(REPLY)).toBeVisible();
      expect(requests).toBe(1);
      expect(requested).toContain(`/persona/${version}/client-stream.js`);
      expect(requested).toContain(`/persona/${version}/markdown-parsers.js`);
      if (entry === "install") {
        for (const name of ['widget.css', 'launcher.global.js', 'index.global.js']) {
          expect(requested).toContain(`/persona/${version}/${name}`);
        }
      }
    }
    expect(requested.filter(path => path.includes('/latest/'))).toEqual([entryPath]);
    expect(errors).toEqual([]);
  });
}
