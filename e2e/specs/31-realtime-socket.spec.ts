import { expect, test, type Page } from "@playwright/test";
import { startFakeRuntypeServer, type FakeRuntypeServer } from "../fixtures/fake-runtype-server";

/**
 * The Runtype client-session socket (`runtype-client-session-v1`) end to end:
 * the built widget on the `realtime-mpa*.html` page pair against a real
 * HTTP + WebSocket fake of the API (`fixtures/fake-runtype-server.ts`).
 * Covers what jsdom cannot: real sockets, real full-page navigations with
 * persisted state, and the page lifecycle.
 */

const ASSISTANT = '[data-message-id][data-persona-theme-zone="assistant-message"]';
const COMPOSER = ".persona-widget-footer textarea, .persona-widget-footer input[type='text']";

let server: FakeRuntypeServer;
let consoleLines: string[] = [];

test.beforeEach(async ({ page, context }) => {
  server = await startFakeRuntypeServer({ frameDelayMs: 60 });
  consoleLines = [];
  page.on("console", (message) => consoleLines.push(`[${message.type()}] ${message.text()}`));
  // Expose socket readiness (hello received) without reaching into the widget.
  await context.addInitScript(() => {
    const Native = window.WebSocket;
    const w = window as unknown as { __rtHello: number };
    w.__rtHello = 0;
    window.WebSocket = class extends Native {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        this.addEventListener("message", (event) => {
          if (typeof event.data === "string" && event.data.includes('"type":"hello"')) w.__rtHello += 1;
        });
      }
    } as typeof WebSocket;
  });
});

test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    await testInfo.attach("browser-console", { body: consoleLines.join("\n"), contentType: "text/plain" });
    await testInfo.attach("server", {
      body: JSON.stringify({ http: server.http, sockets: server.sockets }, null, 2),
      contentType: "application/json",
    });
  }
  await server.close();
});

const query = (extra: Record<string, string> = {}) =>
  new URLSearchParams({ apiUrl: server.url, clientToken: "ct_fake_e2e", ...extra }).toString();

async function open(page: Page, extra: Record<string, string> = {}) {
  await page.goto(`/realtime-mpa.html?${query(extra)}`);
  await page.waitForFunction(() => Boolean((window as unknown as { __personaE2E?: unknown }).__personaE2E));
}

/**
 * Composer focus is intent, but warming never starts a session: the first
 * keystroke does (`sessionInit: "input"`), and the socket opens once it lands.
 * Resolves once hello arrived.
 */
async function warm(page: Page) {
  const input = page.locator(COMPOSER).first();
  await input.click();
  await input.pressSequentially("x");
  await page.waitForFunction(() => (window as unknown as { __rtHello: number }).__rtHello > 0);
  await input.fill("");
}

async function send(page: Page, text: string) {
  const input = page.locator(COMPOSER).first();
  await input.fill(text);
  await input.press("Enter");
}

const lastExecution = () => {
  const ids = server.executionIds();
  return ids[ids.length - 1]!;
};

const assistantTexts = (page: Page) =>
  page.locator(ASSISTANT).evaluateAll((nodes) => nodes.map((n) => (n.textContent ?? "").trim()).filter(Boolean));

const chats = () => server.http.filter((r) => r.path.endsWith("/v1/client/chat"));
const eventsGets = () => server.http.filter((r) => r.path.endsWith("/events"));

test("streams a reply over the socket", async ({ page }) => {
  await open(page);
  await warm(page);
  await send(page, "hello there");
  await expect(page.locator(ASSISTANT).filter({ hasText: "Echo: hello there" })).toBeVisible();

  expect(chats()).toHaveLength(1);
  expect(chats()[0]!.body).toMatchObject({ delivery: "socket" });
  expect(chats()[0]!.status).toBe(202);
  expect(eventsGets()).toHaveLength(0);
  const socket = server.sockets[0]!;
  expect(socket.offeredProtocols.slice(0, 2)).toEqual(["runtype.bearer", "ct_fake_e2e"]);
  expect(socket.offeredProtocols[2]).toMatch(/^cvt_/);
  expect(socket.offeredProtocols).toHaveLength(3);
  expect(Object.fromEntries(socket.url.searchParams)).toEqual({
    protocol: "runtype-client-session-v1",
    sessionId: expect.stringMatching(/^cs_/),
    clientVersion: expect.stringMatching(/^persona\//),
  });
});

test("a reply keeps streaming across an MPA navigation with no duplicated or missing text", async ({ page }) => {
  await open(page);
  await warm(page);
  await send(page, "long story");
  await expect.poll(() => server.executionIds().length).toBe(1);
  await server.deltas(lastExecution(), 8);
  await page.locator("#mpa-link").click();
  await page.waitForURL(/realtime-mpa-next\.html/);

  const expected = server.expectedText(lastExecution());
  await expect.poll(() => assistantTexts(page), { timeout: 15_000 }).toEqual([expected]);
  await expect(page.locator(ASSISTANT).filter({ hasText: "w30" })).toHaveCount(1);

  const reattach = server.sockets.slice(1).flatMap((s) => s.frames).find((f) => f.type === "attach");
  expect(reattach).toMatchObject({ executionId: lastExecution(), after: expect.stringMatching(/^\d+$/) });
  expect(eventsGets()).toHaveLength(0);
});

for (const realtime of ["1", "0"]) {
  test(`a navigating page tool runs once and is answered on arrival (socket ${realtime === "1" ? "on" : "off"})`, async ({ page }) => {
    await open(page, { realtime });
    if (realtime === "1") await warm(page);
    await send(page, "navigate please");
    await page.waitForURL(/realtime-mpa-next\.html/);
    await expect(page.locator(ASSISTANT).filter({ hasText: "Arrived on Realtime MPA demo: checkout." })).toBeVisible();

    expect(await page.evaluate(() => localStorage.getItem("realtime-mpa:go_to_page-runs"))).toBe("1");
    const resumes = server.http.filter((r) => r.path.endsWith("/v1/client/resume"));
    expect(resumes).toHaveLength(1);
    expect(resumes[0]!.body).toMatchObject({
      executionId: lastExecution(),
      toolOutputs: {
        call_nav_1: {
          navigated: true,
          url: expect.stringContaining("realtime-mpa-next.html"),
          title: "Realtime MPA demo: checkout",
        },
      },
    });
    if (realtime === "1") {
      const navigating = server.sockets[0]!.frames.find((f) => f.type === "navigating");
      expect(navigating).toMatchObject({ executionId: lastExecution(), url: expect.stringContaining("realtime-mpa-next.html") });
    } else {
      expect(server.sockets).toHaveLength(0);
    }
  });
}

test("a second tab watches a page-tool turn through its pause and the next turn, and never runs the tool", async ({ page, context }) => {
  await open(page);
  await warm(page);
  const watcher = await context.newPage();
  await open(watcher);
  await warm(watcher);

  await send(page, "navigate please");
  await page.waitForURL(/realtime-mpa-next\.html/);
  await expect(page.locator(ASSISTANT).filter({ hasText: "Arrived on Realtime MPA demo: checkout." })).toBeVisible();
  await expect(watcher.locator(ASSISTANT).filter({ hasText: "Arrived on Realtime MPA demo: checkout." })).toBeVisible();

  await send(page, "hello from the owner");
  await expect(watcher.locator(ASSISTANT).filter({ hasText: "Echo: hello from the owner" })).toBeVisible();

  expect(watcher.url()).not.toMatch(/realtime-mpa-next\.html/);
  expect(await page.evaluate(() => localStorage.getItem("realtime-mpa:go_to_page-runs"))).toBe("1");
  expect(server.http.filter((r) => r.path.endsWith("/v1/client/resume"))).toHaveLength(1);

  // A question the owner must answer: the watcher shows it read-only, then the outcome.
  await send(page, "ask me");
  const watcherSheet = watcher.locator("[data-persona-ask-sheet-for]");
  await expect(watcherSheet).toBeVisible();
  await expect(watcherSheet).toHaveAttribute("inert", "");
  await expect(page.locator("[data-persona-ask-sheet-for]")).not.toHaveAttribute("inert", /.*/);

  // Both sockets drop mid-question; the watcher reattaches the paused turn from its start. A replay is not an answer.
  const socketsBefore = server.sockets.length;
  server.killSockets();
  await expect.poll(() => server.sockets.slice(socketsBefore).flatMap((s) => s.frames).filter((f) => f.type === "attach").length).toBeGreaterThan(0);
  await watcher.waitForTimeout(300);
  await expect(watcherSheet).toBeVisible();
  await expect(watcherSheet).toHaveAttribute("inert", "");

  // The watcher writes the shared transcript last (its draft save), then the owner reloads mid-question.
  await watcher.locator(COMPOSER).fill("watcher draft");
  await expect.poll(() => page.evaluate(() => Object.values(localStorage).some((v) => v.includes("watcher draft")))).toBe(true);
  expect(await page.evaluate(() => Object.values(localStorage).some((v) => v.includes('"observed"') || v.includes('"askUserQuestionAnswered":true')))).toBe(false);
  await page.reload();
  await page.waitForFunction(() => Boolean((window as unknown as { __personaE2E?: unknown }).__personaE2E));
  await expect(page.locator(COMPOSER)).toHaveValue("watcher draft");
  await expect(page.locator("[data-persona-ask-sheet-for]")).toBeVisible();
  await expect(page.locator("[data-persona-ask-sheet-for]")).not.toHaveAttribute("inert", /.*/);
  await page.locator('[data-ask-user-action="pick"][data-option-label="Pro"]').click();
  await expect(watcher.locator(ASSISTANT).filter({ hasText: "You picked" })).toBeVisible();
  await expect(watcherSheet).toHaveCount(0);

  expect(server.http.filter((r) => r.path.endsWith("/v1/client/resume"))).toHaveLength(2);
  expect(chats()).toHaveLength(3);
});

test("bfcache: pagehide closes the socket and a persisted pageshow reattaches", async ({ page }) => {
  await open(page);
  await warm(page);
  await send(page, "long story");
  await expect.poll(() => server.executionIds().length).toBe(1);
  await server.deltas(lastExecution(), 8);
  // Playwright disables the real bfcache (see 25-demo-back-navigation.spec.ts).
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
  await expect.poll(() => server.sockets[0]!.closed).toBe(true);
  await page.waitForTimeout(150);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));

  const expected = server.expectedText(lastExecution());
  await expect.poll(() => assistantTexts(page), { timeout: 15_000 }).toEqual([expected]);
  const reattach = server.sockets.slice(1).flatMap((s) => s.frames).find((f) => f.type === "attach");
  expect(reattach).toMatchObject({ executionId: lastExecution(), after: expect.stringMatching(/^\d+$/) });
});

test("a socket killed mid-stream reconnects and attaches after its cursor", async ({ page }) => {
  await open(page);
  await warm(page);
  await send(page, "long story");
  await expect.poll(() => server.executionIds().length).toBe(1);
  await server.deltas(lastExecution(), 8);
  server.killSockets();

  const expected = server.expectedText(lastExecution());
  await expect.poll(() => assistantTexts(page), { timeout: 15_000 }).toEqual([expected]);
  const reattach = server.sockets.slice(1).flatMap((s) => s.frames).find((f) => f.type === "attach");
  expect(reattach).toMatchObject({ executionId: lastExecution(), after: expect.stringMatching(/^\d+$/) });
  expect(eventsGets()).toHaveLength(0);
});

test("a 1012 reauthenticate close mid-stream reconnects and attaches after its cursor, no duplicate text", async ({ page }) => {
  await open(page);
  await warm(page);
  await send(page, "long story");
  await expect.poll(() => server.executionIds().length).toBe(1);
  await server.deltas(lastExecution(), 8);
  const initsBefore = server.http.filter((h) => h.path.endsWith("/init")).length;
  server.closeSockets(1012, "Reconnect to reauthenticate");

  const expected = server.expectedText(lastExecution());
  await expect.poll(() => assistantTexts(page), { timeout: 15_000 }).toEqual([expected]);
  expect(server.sockets[0]!.closeCode).toBe(1012);
  const reattach = server.sockets.slice(1).flatMap((s) => s.frames).find((f) => f.type === "attach");
  expect(reattach).toMatchObject({ executionId: lastExecution(), after: expect.stringMatching(/^\d+$/) });
  // 1012 reconnects with the same credentials: no re-init.
  expect(server.http.filter((h) => h.path.endsWith("/init"))).toHaveLength(initsBefore);
  expect(eventsGets()).toHaveLength(0);
});

test("an attach refused with execution_not_found falls back to the SSE events route", async ({ page }) => {
  await server.close();
  server = await startFakeRuntypeServer({ frameDelayMs: 60, refuseAttach: true });
  await open(page);
  await warm(page);
  await send(page, "long story");
  await expect.poll(() => server.executionIds().length).toBe(1);
  await server.deltas(lastExecution(), 8);
  server.killSockets();

  const expected = server.expectedText(lastExecution());
  await expect.poll(() => assistantTexts(page), { timeout: 20_000 }).toEqual([expected]);
  const refusedAttaches = server.sockets.slice(1).flatMap((s) => s.frames).filter((f) => f.type === "attach");
  expect(refusedAttaches.length).toBeGreaterThan(0);
  expect(eventsGets().length).toBeGreaterThan(0);
});

test("a socket that cannot come back falls back to the SSE events route", async ({ page }) => {
  await open(page);
  await warm(page);
  await send(page, "long story");
  await expect.poll(() => server.executionIds().length).toBe(1);
  await server.deltas(lastExecution(), 8);
  server.rejectUpgrades(503);
  server.killSockets();

  const expected = server.expectedText(lastExecution());
  await expect.poll(() => assistantTexts(page), { timeout: 30_000 }).toEqual([expected]);
  expect(eventsGets().length).toBeGreaterThan(0);
  expect(eventsGets()[0]!.query.after).toMatch(/^\d+$/);
});

test("no advertisement means pure SSE", async ({ page }) => {
  await server.close();
  server = await startFakeRuntypeServer({ advertise: false, frameDelayMs: 20 });
  await open(page);
  await page.locator(COMPOSER).first().click();
  await send(page, "plain please");
  await expect(page.locator(ASSISTANT).filter({ hasText: "Echo: plain please" })).toBeVisible();
  expect(server.sockets).toHaveLength(0);
  expect(chats()[0]!.body).not.toHaveProperty("delivery");
  expect(chats()[0]!.status).toBe(200);
});
