import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { textTurnStream } from "../fixtures/fake-history-api";

/**
 * Script-tag install methods, run in a real browser against the BUILT
 * `packages/widget/dist` exactly as a CDN would serve it.
 *
 * Covers what Node/jsdom can't: classic-script evaluation of the IIFEs, the
 * installer's sibling-URL derivation from its own `src`, the deferred launcher
 * (`launcher.global.js` → first click → `index.global.js`), and the lazy ESM
 * sibling chunks (`icons-extra.js`, `markdown-parsers.js`, `client-stream.js`)
 * that `index.global.js` / `launcher.global.js` `import()` by URL. Each scenario
 * ends with a streamed reply so the dispatch path's chunks actually execute.
 *
 * Hermetic: everything is served by Playwright route interception on a fake
 * origin (no dev server, no showcase build); every other request is aborted and
 * fails the test. The Node-level half (ESM/CJS/types/exports map) lives in
 * `packages/widget/src/install-methods-bundle.test.ts`.
 *
 * Runs with the main e2e config, or standalone (no web server) via
 * `pnpm exec playwright test --config e2e/playwright.dist.config.ts`.
 */

// PERSONA_DIST_DIR points the suite at another dist (e.g. an extracted npm tarball).
const DIST = resolve(process.env.PERSONA_DIST_DIR ?? resolve(__dirname, "../../packages/widget/dist"));
const ORIGIN = "http://persona-dist.test";
const REPLY = "Hello from the built dist";

const CONTENT_TYPES: Record<string, string> = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".map": "application/json",
  ".html": "text/html",
};

test.skip(
  !existsSync(join(DIST, "index.global.js")),
  "packages/widget/dist is not built (run `pnpm build:widget`)"
);

interface Harness {
  /** Pathnames requested from the fake origin, in order. */
  requested: string[];
  /** Fake-origin responses with status >= 400. */
  httpErrors: string[];
  /** Requests to any other origin (aborted). */
  external: string[];
  pageErrors: string[];
  consoleErrors: string[];
  chatRequests: number;
}

async function serveDist(page: Page, fixtures: Record<string, string>): Promise<Harness> {
  const h: Harness = {
    requested: [],
    httpErrors: [],
    external: [],
    pageErrors: [],
    consoleErrors: [],
    chatRequests: 0,
  };
  page.on("pageerror", (err) => h.pageErrors.push(`${err.name}: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") h.consoleErrors.push(msg.text());
  });
  page.on("response", (res) => {
    if (res.url().startsWith(ORIGIN) && res.status() >= 400) {
      h.httpErrors.push(`${res.status()} ${new URL(res.url()).pathname}`);
    }
  });

  await page.context().route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== ORIGIN) {
      h.external.push(request.url());
      return route.abort("blockedbyclient");
    }
    h.requested.push(url.pathname);

    if (url.pathname.startsWith("/api/chat")) {
      const headers = {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
        "content-type": "text/event-stream",
      };
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      h.chatRequests += 1;
      return route.fulfill({ status: 200, headers, body: textTurnStream(REPLY) });
    }

    if (url.pathname in fixtures) {
      return route.fulfill({
        status: 200,
        contentType: "text/html",
        body: fixtures[url.pathname],
      });
    }

    if (url.pathname.startsWith("/dist/")) {
      const file = join(DIST, url.pathname.slice("/dist/".length));
      if (file.startsWith(DIST) && existsSync(file) && statSync(file).isFile()) {
        return route.fulfill({
          status: 200,
          contentType: CONTENT_TYPES[extname(file)] ?? "application/octet-stream",
          headers: { "access-control-allow-origin": "*" },
          body: readFileSync(file),
        });
      }
    }
    return route.fulfill({ status: 404, body: "not found" });
  });

  // Lifecycle events from the installer, recorded from the first script on.
  await page.addInitScript(() => {
    const w = window as unknown as { __personaEvents: Array<{ name: string; deferred?: boolean }> };
    w.__personaEvents = [];
    for (const name of ["persona:script-load", "persona:launcher-shown", "persona:chat-ready", "persona:error"]) {
      window.addEventListener(name, (e) => {
        const detail = (e as CustomEvent).detail as { deferred?: boolean } | undefined;
        w.__personaEvents.push({ name, deferred: detail?.deferred });
      });
    }
  });
  return h;
}

const page_ = (body: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>dist install</title></head><body><main><h1>Host page</h1></main>${body}</body></html>`;

const sel = {
  launcherButton: "[data-persona-launcher-surface] button",
  launcherSurface: "[data-persona-launcher-surface]",
  panel: ".persona-widget-container",
  composer: "[data-persona-composer-input]",
};

const events = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __personaEvents: Array<{ name: string; deferred?: boolean }> }).__personaEvents
  );

const hasGlobal = (page: Page, name: "AgentWidget" | "AgentWidgetLauncher") =>
  page.evaluate((n) => Boolean((window as unknown as Record<string, unknown>)[n]), name);

/** Send a message and wait for the stubbed streamed reply to render. */
async function chatRoundTrip(page: Page, h: Harness) {
  const composer = page.locator(sel.composer).first();
  await expect(composer).toBeVisible();
  await composer.fill("hi");
  await composer.press("Enter");
  await expect(page.getByText(REPLY)).toBeVisible();
  expect(h.chatRequests).toBeGreaterThan(0);
  // The dispatch path's lazy siblings were fetched by URL and executed.
  expect(h.requested).toContain("/dist/client-stream.js");
  expect(h.requested).toContain("/dist/markdown-parsers.js");
}

function expectClean(h: Harness) {
  expect(h.pageErrors, "uncaught page errors").toEqual([]);
  expect(h.httpErrors, "dist/fixture requests that failed").toEqual([]);
  expect(h.external, "requests that left the fake origin").toEqual([]);
  expect(h.consoleErrors, "console.error output").toEqual([]);
}

test("IIFE: <script src=index.global.js> exposes window.AgentWidget and mounts", async ({ page }) => {
  const h = await serveDist(page, {
    "/iife.html": page_(`
      <link rel="stylesheet" href="/dist/widget.css">
      <script src="/dist/index.global.js"></script>
      <script>
        window.__handle = window.AgentWidget.initAgentWidget({
          target: "body",
          config: { apiUrl: "/api/chat" },
        });
      </script>`),
  });
  await page.goto(`${ORIGIN}/iife.html`);
  expect(h.pageErrors, "uncaught page errors while loading").toEqual([]);
  expect(await hasGlobal(page, "AgentWidget")).toBe(true);
  expect(
    await page.evaluate(() => typeof (window as unknown as { AgentWidget: { initAgentWidget: unknown } }).AgentWidget.initAgentWidget)
  ).toBe("function");

  await page.locator(sel.launcherButton).first().click();
  await expect(page.locator(sel.panel).first()).toBeVisible();
  await chatRoundTrip(page, h);
  expectClean(h);
});

test("installer: siteAgentConfig eager path (autoExpand) loads css + index.global.js from its own dir", async ({ page }) => {
  const h = await serveDist(page, {
    "/eager.html": page_(`
      <script>
        window.siteAgentConfig = {
          apiUrl: "/api/chat",
          config: { launcher: { autoExpand: true } },
        };
      </script>
      <script src="/dist/install.global.js"></script>`),
  });
  await page.goto(`${ORIGIN}/eager.html`);
  expect(h.pageErrors, "uncaught page errors while loading").toEqual([]);
  await expect(page.locator(sel.panel).first()).toBeVisible();
  expect(h.requested).toContain("/dist/widget.css");
  expect(h.requested).toContain("/dist/index.global.js");
  // Eager installs never need the critical launcher bundle.
  expect(h.requested).not.toContain("/dist/launcher.global.js");
  await expect.poll(async () => (await events(page)).map((e) => e.name)).toContain("persona:chat-ready");

  await chatRoundTrip(page, h);
  expectClean(h);
});

for (const variant of ["siteAgentConfig", "data-config attribute"] as const) {
  test(`installer: deferred launcher via ${variant} (launcher.global.js → click → index.global.js)`, async ({ page }) => {
    // An EXTRA-tier icon forces the launcher's lazy icons-extra.js sibling.
    const widgetConfig = { launcher: { agentIconName: "shopping-cart" } };
    const tag =
      variant === "siteAgentConfig"
        ? `<script>window.siteAgentConfig = ${JSON.stringify({ apiUrl: "/api/chat", config: widgetConfig })};</script>
           <script src="/dist/install.global.js"></script>`
        : `<script src="/dist/install.global.js" data-api-url="/api/chat"
             data-config='${JSON.stringify({ config: widgetConfig })}'></script>`;
    const h = await serveDist(page, { "/deferred.html": page_(tag) });
    await page.goto(`${ORIGIN}/deferred.html`);
    expect(h.pageErrors, "uncaught page errors while loading").toEqual([]);
  expect(h.pageErrors, "uncaught page errors while loading").toEqual([]);

    // Critical launcher painted from the tiny bundle; the full widget has not run.
    await expect(page.locator(sel.launcherButton).first()).toBeVisible();
    expect(h.requested).toContain("/dist/launcher.global.js");
    expect(h.requested).toContain("/dist/widget.css");
    expect(await hasGlobal(page, "AgentWidgetLauncher")).toBe(true);
    expect(await hasGlobal(page, "AgentWidget")).toBe(false);
    await expect
      .poll(async () => (await events(page)).find((e) => e.name === "persona:launcher-shown"))
      .toEqual({ name: "persona:launcher-shown", deferred: true });

    // The extra-tier icon arrives from the launcher's sibling chunk.
    await expect.poll(() => h.requested.includes("/dist/icons-extra.js")).toBe(true);
    await expect(page.locator(`${sel.launcherSurface} svg`).first()).toBeAttached();

    // First click hands off to the full widget and opens the panel.
    await page.locator(sel.launcherButton).first().click();
    await expect(page.locator(sel.panel).first()).toBeVisible();
    expect(await hasGlobal(page, "AgentWidget")).toBe(true);
    expect(h.requested).toContain("/dist/index.global.js");
    await expect.poll(async () => (await events(page)).map((e) => e.name)).toContain("persona:chat-ready");
    // The critical launcher is destroyed at handoff: exactly one launcher surface remains.
    await expect(page.locator(sel.launcherSurface)).toHaveCount(1);

    await chatRoundTrip(page, h);
    expect((await events(page)).filter((e) => e.name === "persona:error")).toEqual([]);
    expectClean(h);
  });
}

test("installer: explicit cssUrl/jsUrl override with a query string still derives sibling URLs", async ({ page }) => {
  const h = await serveDist(page, {
    "/override.html": page_(`
      <script>
        window.siteAgentConfig = {
          apiUrl: "/api/chat",
          cssUrl: "/dist/widget.css?v=test",
          jsUrl: "/dist/index.global.js?v=test",
          config: {},
        };
      </script>
      <script src="/dist/install.global.js"></script>`),
  });
  await page.goto(`${ORIGIN}/override.html`);
  expect(h.pageErrors, "uncaught page errors while loading").toEqual([]);
  await expect(page.locator(sel.launcherButton).first()).toBeVisible();
  expect(h.requested).toContain("/dist/launcher.global.js");
  await page.locator(sel.launcherButton).first().click();
  await expect(page.locator(sel.panel).first()).toBeVisible();
  await chatRoundTrip(page, h);
  expectClean(h);
});

for (const variant of ["card", "row"] as const) {
  test(`restored WebMCP ${variant}: expires approval and stops browser activity`, async ({ page }, testInfo) => {
    const h = await serveDist(page, {
      "/restored-tools.html": page_(`
        <link rel="stylesheet" href="/dist/widget.css">
        <script src="/dist/index.global.js"></script>
        <script>
          document.modelContext = {
            getTools: async () => [{ name: "purchase", title: "Purchase items", description: "Purchase items", inputSchema: { type: "object" } }],
            executeTool: async () => {
              localStorage.setItem("mutations", String(Number(localStorage.getItem("mutations") || 0) + 1));
              return JSON.stringify({ purchased: true });
            }
          };
          window.__handle = window.AgentWidget.initAgentWidget({ target: "body", config: {
            apiUrl: "/api/chat", launcher: { autoExpand: true }, webmcp: { enabled: true },
            features: { toolCallDisplay: { variant: "${variant}", grouped: false, expandable: true } },
            toolCall: { activeTextTemplate: "Using {toolName} ~{duration}~", completeTextTemplate: "Finished {toolName} ~{duration}~" },
            storageAdapter: {
              load: () => JSON.parse(localStorage.getItem("restoration-snapshot") || "null"),
              save: state => localStorage.setItem("restoration-snapshot", JSON.stringify(state)),
              clear: () => localStorage.removeItem("restoration-snapshot")
            }
          }});
        </script>`),
    });
    const requests: string[] = [];
    await page.route("**/api/chat**", async route => {
      requests.push(route.request().url());
      const resume = route.request().url().endsWith("/resume");
      await route.fulfill({ contentType: "text/event-stream", body: resume
        ? textTurnStream("Purchase confirmed", "exec_restored")
        : `event: await\ndata: ${JSON.stringify({ type: "await", executionId: "exec_restored", awaitReason: "local_tool_required", toolCallId: "purchase-call", toolName: "webmcp:purchase", parameters: { quantity: 2 } })}\n\n` });
    });
    await page.goto(`${ORIGIN}/restored-tools.html`);
    const composer = page.locator(sel.composer).first();
    await composer.fill("Buy two items"); await composer.press("Enter");
    await expect(page.getByRole("button", { name: "Allow", exact: true })).toBeVisible();
    await expect(page.locator("[data-tool-elapsed]").first()).toBeVisible();
    await composer.fill("My unsent proposal");
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("restoration-snapshot") || "{}").draft?.text)).toBe("My unsent proposal");
    await page.screenshot({ path: testInfo.outputPath(`pending-${variant}.png`) });
    await testInfo.attach(`Pending ${variant} approval`, { path: testInfo.outputPath(`pending-${variant}.png`), contentType: "image/png" });

    await page.reload();
    await expect(page.getByText(/approval expired/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Allow", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Deny", exact: true })).toHaveCount(0);
    await expect(page.locator("[data-tool-elapsed]")).toHaveCount(0);
    await expect(composer).toHaveValue("My unsent proposal");
    const restoredTool = page.locator('[data-message-id="tool-purchase-call"]');
    await expect(restoredTool).toContainText("Interrupted");
    await expect(restoredTool).not.toContainText("Finished");
    const textBefore = await restoredTool.innerText();
    // Real wall time establishes that the UI timer stays stopped after reload.
    await page.waitForTimeout(1200);
    expect(await restoredTool.innerText()).toBe(textBefore);
    const animations = await restoredTool.evaluate(el => el.getAnimations({ subtree: true }).filter(animation => animation.playState === "running").length);
    expect(animations).toBe(0);
    expect(requests).toHaveLength(1);
    expect(await page.evaluate(() => Number(localStorage.getItem("mutations") || 0))).toBe(0);
    await page.screenshot({ path: testInfo.outputPath(`restored-${variant}.png`) });
    await testInfo.attach(`Restored ${variant}: no controls or animation`, { path: testInfo.outputPath(`restored-${variant}.png`), contentType: "image/png" });

    // A fresh proposal gets a new card; allowing it still executes exactly once.
    await composer.fill("Try again"); await composer.press("Enter");
    await expect(page.getByRole("button", { name: "Allow", exact: true })).toBeVisible();
    await expect(page.getByText(/approval expired/)).toBeVisible();
    await page.getByRole("button", { name: "Allow", exact: true }).click();
    await expect(page.getByText("Purchase confirmed", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => Number(localStorage.getItem("mutations") || 0))).toBe(1);
    expect(requests.filter(url => url.endsWith("/resume"))).toHaveLength(1);
    expectClean(h);
  });
}
