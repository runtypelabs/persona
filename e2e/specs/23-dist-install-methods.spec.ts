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

for (const useShadowDom of [false, true]) {
  test(`cold renderers reveal together (${useShadowDom ? "shadow" : "light"} DOM)`, async ({ page }) => {
    let releaseControls!: () => void, releaseActivity!: () => void;
    const controls = new Promise<void>(resolve => { releaseControls = resolve; });
    const activity = new Promise<void>(resolve => { releaseActivity = resolve; });
    const h = await serveDist(page, {
      "/atomic.html": page_(`
        <link data-persona rel="stylesheet" href="/dist/widget.css">
        <div id="widget"></div>
        <script src="/dist/index.global.js"></script>
        <script>
          window.__handle = AgentWidget.initAgentWidget({ target: "#widget", useShadowDom: ${useShadowDom},
            config: { apiUrl: "/api/chat", persistState: false, autoFocusInput: true, launcher: { enabled: false },
              composer: { actions: [{ id: "custom", label: "Custom action", icon: "search", kind: "button", placement: "start", presentation: "bar", onSelect() {} }] }
            }
          });
        </script>`),
    });
    for (const [name, barrier] of [["composer-actions-runtime.js", controls], ["activity-ui.js", activity]] as const) {
      await page.route(`**/dist/${name}`, async route => {
        await barrier;
        await route.fulfill({ contentType: "text/javascript", body: readFileSync(join(DIST, name)) });
      });
    }
    await page.goto(`${ORIGIN}/atomic.html`, { waitUntil: "domcontentloaded" });
    const root = page.locator("[data-persona-root]");
    const composer = page.locator(sel.composer).first();
    await expect(root).toHaveAttribute("data-persona-preparing", "");
    await expect(composer).not.toBeVisible();
    const controlsDownloaded = page.waitForResponse("**/dist/composer-actions-runtime.js");
    releaseControls();
    await controlsDownloaded;
    // Controls have arrived, but activity has not: no intermediate reveal.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(composer).not.toBeVisible();
    releaseActivity();
    await page.evaluate(() => (window as unknown as { __handle: { ready: Promise<void> } }).__handle.ready);
    await expect(composer).toBeVisible();
    await expect(composer).toBeFocused();
    await expect(page.getByRole("button", { name: "Custom action" })).toBeVisible();
    await expect(root).not.toHaveAttribute("data-persona-preparing");
    expect(await root.evaluate(el => (el as HTMLElement).inert)).toBe(false);
    await chatRoundTrip(page, h);
    expectClean(h);
  });
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

for (const mode of ["embedded", "pill", "circle"]) {
  const embedded = mode === "embedded";
  test(`delayed installer feedback stays in place until ready (${mode})`, async ({ page }) => {
    const h = await serveDist(page, {
      "/loading.html": page_(`
        <div id="widget" style="width:600px;height:500px"></div>
        <script>window.siteAgentConfig = { target: "#widget", config: { apiUrl: "/api/chat", persistState: false, future: { v5Defaults: ${mode === "circle"} }, launcher: { enabled: ${!embedded} } } };</script>
        <script src="/dist/install.global.js"></script>`),
    });
    let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    // Embedded feedback must work before CSS and JS, launcher feedback while
    // the main bundle is still loading. Prefetch is deliberately held too.
    const file = embedded ? "widget.css" : "index.global.js";
    await page.route(`**/dist/${file}`, async route => {
      await barrier;
      await route.fulfill({ contentType: embedded ? "text/css" : "text/javascript", body: readFileSync(join(DIST, file)) });
    });
    await page.goto(`${ORIGIN}/loading.html`, { waitUntil: "domcontentloaded" });
    const target = page.locator(embedded ? "#widget" : sel.launcherButton);
    if (!embedded) {
      // Let the existing two-pixel hover lift settle before measuring layout.
      await target.hover();
      await expect(target).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, -2)");
      await target.click();
    }
    const before = await target.boundingBox();
    const loading = page.getByRole("status", { name: "Loading assistant" });
    await expect(loading).toBeVisible();
    await expect(target).toHaveAttribute("aria-busy", "true");
    expect(await target.boundingBox()).toEqual(before);
    await page.screenshot({ path: `/tmp/persona-loading-${mode}.png` });
    await expect(page.locator(sel.composer)).not.toBeVisible();
    release();
    await expect(page.locator(sel.composer)).toBeVisible();
    await expect(loading).toHaveCount(0);
    await expect(page.locator("[aria-busy=true]")).toHaveCount(0);
    if (embedded) expect(await target.boundingBox()).toEqual(before);
    expectClean(h);
  });
}

for (const embedded of [true, false]) {
  test(`installer manages custom loading UI (${embedded ? "embedded" : "launcher"})`, async ({ page }) => {
    const h = await serveDist(page, {
      "/custom-loading.html": page_(`
        <div id="widget" style="width:600px;height:500px"></div>
        <script>
          window.__cleanupCount = 0;
          window.siteAgentConfig = {
            target: "#widget",
            config: { apiUrl: "/api/chat", persistState: false, launcher: { enabled: ${!embedded} } },
            renderLoading({ container, target, kind }) {
              window.__loadingKind = kind;
              window.__loadingConnected = container.isConnected && container.parentNode === target;
              container.textContent = "Preparing your assistant";
              return () => { window.__cleanupCount++; };
            }
          };
        </script><script src="/dist/install.global.js"></script>`),
    });
    let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/dist/activity-ui.js", async route => {
      await barrier;
      await route.fulfill({ contentType: "text/javascript", body: readFileSync(join(DIST, "activity-ui.js")) });
    });
    await page.goto(`${ORIGIN}/custom-loading.html`, { waitUntil: "domcontentloaded" });
    if (!embedded) await page.locator(sel.launcherButton).click();
    const loading = page.getByText("Preparing your assistant");
    await expect(loading).toBeVisible();
    await expect(loading).toHaveCSS("animation-name", "none");
    await expect(page.locator('[data-persona-loading="default"]')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __loadingKind: string }).__loadingKind)).toBe(embedded ? "embedded" : "launcher");
    expect(await page.evaluate(() => (window as unknown as { __loadingConnected: boolean }).__loadingConnected)).toBe(true);
    release();
    await expect(page.locator(sel.composer)).toBeVisible();
    await expect(loading).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __cleanupCount: number }).__cleanupCount)).toBe(1);
    expectClean(h);
  });
}

test("a failed renderer keeps the launcher and retries without an incomplete panel", async ({ page }) => {
  const h = await serveDist(page, {
    "/retry-renderer.html": page_(`
      <script>window.siteAgentConfig = { apiUrl: "/api/chat", config: { persistState: false } };</script>
      <script src="/dist/install.global.js"></script>`),
  });
  let attempts = 0;
  let fail!: () => void;
  const failure = new Promise<void>(resolve => { fail = resolve; });
  await page.route("**/dist/activity-ui.js*", async route => {
    attempts++;
    if (attempts === 1) {
      await failure;
      return route.fulfill({ status: 503, body: "temporarily unavailable" });
    }
    return route.fulfill({ contentType: "text/javascript", body: readFileSync(join(DIST, "activity-ui.js")) });
  });
  await page.goto(`${ORIGIN}/retry-renderer.html`);
  await page.locator(sel.launcherButton).first().click();
  await expect(page.getByRole("status", { name: "Loading assistant" })).toBeVisible();
  fail();
  await expect.poll(async () => (await events(page)).map(e => e.name)).toContain("persona:error");
  await expect(page.locator("[data-persona-loading]")).toHaveCount(0);
  await expect(page.locator(sel.launcherButton)).not.toHaveAttribute("aria-busy");
  await expect(page.locator(sel.composer)).toHaveCount(0);
  await expect(page.locator(sel.launcherButton)).toBeVisible();
  await page.locator(sel.launcherButton).click();
  await expect(page.locator(sel.composer)).toBeVisible();
  expect(attempts).toBe(2);
  expect((await events(page)).filter(e => e.name === "persona:chat-ready")).toHaveLength(1);
  expect(h.pageErrors).toEqual([]);
});

test("shadow widget waits for its stylesheet even after renderer modules arrive", async ({ page }) => {
  let releaseCss!: () => void;
  const css = new Promise<void>(resolve => { releaseCss = resolve; });
  const h = await serveDist(page, {
    "/slow-style.html": page_(`
      <div id="widget"></div><script src="/dist/index.global.js"></script>
      <script>
        const link = document.createElement("link");
        link.rel = "stylesheet"; link.href = "/dist/widget.css"; link.dataset.persona = "";
        document.head.append(link);
        window.__handle = AgentWidget.initAgentWidget({ target: "#widget", useShadowDom: true,
          config: { apiUrl: "/api/chat", persistState: false, launcher: { enabled: false } }
        });
        window.__ready = false;
        window.__handle.ready.then(() => { window.__ready = true; });
      </script>`),
  });
  await page.route("**/dist/widget.css", async route => {
    await css;
    await route.fulfill({ contentType: "text/css", body: readFileSync(join(DIST, "widget.css")) });
  });
  await page.goto(`${ORIGIN}/slow-style.html`, { waitUntil: "domcontentloaded" });
  await expect.poll(() => h.requested.includes("/dist/activity-ui.js")).toBe(true);
  await expect(page.locator(sel.composer)).not.toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __ready: boolean }).__ready)).toBe(false);
  // Updating while styles are pending must keep the original readiness waiter
  // and hidden surface behind the stylesheet, even if modules are now cached.
  await page.evaluate(() => {
    (window as unknown as { __handle: { update: (config: object) => void } }).__handle.update({ copy: { placeholder: "Updated prompt" } });
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.locator(sel.composer)).not.toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __ready: boolean }).__ready)).toBe(false);
  releaseCss();
  await page.evaluate(() => (window as unknown as { __handle: { ready: Promise<void> } }).__handle.ready);
  await expect(page.locator(sel.composer)).toBeVisible();
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

for (const shadow of [false, true]) {
  test(`lazy composer and artifact styles survive relocation (shadow=${shadow})`, async ({ page }) => {
    const h = await serveDist(page, {
      "/optional.html": page_(`
        <link rel="stylesheet" href="/dist/widget.css">
        <div id="first" style="height:600px"></div><div id="second" style="height:600px"></div>
        <script src="/dist/index.global.js"></script>
        <script>
          window.__handle = window.AgentWidget.initAgentWidget({ target: '#first', useShadowDom: ${shadow}, config: {
            apiUrl: '/api/chat', persistState: false, launcher: { enabled: false }, layout: { embedded: true },
            composer: { actionOverflow: { enabled: true }, actions: [{ id: 'sample', kind: 'button', label: 'Sample action', placement: 'start', presentation: 'overflow', onSelect() {} }] },
            features: { artifacts: { enabled: true } }
          } });
          window.__handle.upsertArtifact({ id: 'doc', artifactType: 'markdown', title: 'Sample document', content: '# A document' });
          window.__handle.showArtifacts();
        </script>`),
    });
    await page.goto(`${ORIGIN}/optional.html`);
    const trigger = page.locator('[data-persona-composer-overflow-trigger]');
    await trigger.click();
    const menu = page.locator('[data-persona-composer-overflow-menu]');
    await expect(menu).toBeVisible();
    expect(await menu.evaluate(node => getComputedStyle(node).display)).toBe('flex');
    expect(await menu.evaluate(node => getComputedStyle(node).flexDirection)).toBe('column');
    await expect(page.locator('.persona-artifact-pane').first()).toBeVisible();
    expect(h.requested).toContain('/dist/composer-actions-runtime.js');
    expect(h.requested).toContain('/dist/artifacts-ui.js');
    await page.keyboard.press('Escape');
    const stylesheetRoots = await page.evaluate(() => {
      const handle = (window as unknown as { __handle: { host: HTMLElement; moveTo(target: string): void } }).__handle;
      handle.moveTo('#second');
      const root = handle.host.shadowRoot ?? document;
      return Array.from(root.querySelectorAll('style')).map(style => style.textContent).join('\n');
    });
    expect(stylesheetRoots).toContain('.persona-composer-overflow-menu');
    expect(stylesheetRoots).toContain('.persona-artifact-split-root');
    await trigger.click();
    await expect(menu).toBeVisible();
    expect(await menu.evaluate(node => getComputedStyle(node).display)).toBe('flex');
    expectClean(h);
  });
}
