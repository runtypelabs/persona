import { expect, test, type Page } from "@playwright/test";
import { startFakeRuntypeServer, type FakeRuntypeServer } from "../fixtures/fake-runtype-server";

/**
 * `realtime-compare.html`: a socket widget and an SSE widget on one page
 * against the fake API. One shared send reaches both; the per-turn readout
 * reports the transport each turn actually used; the two widgets are separate
 * visitors and conversations, so neither renders the other's turn.
 */

const ASSISTANT = '[data-message-id][data-persona-theme-zone="assistant-message"]';
const USER = '[data-message-id][data-persona-theme-zone="user-message"]';
const COMPOSER = ".persona-widget-footer textarea, .persona-widget-footer input[type='text']";

let server: FakeRuntypeServer;

test.beforeEach(async () => {
  server = await startFakeRuntypeServer({ frameDelayMs: 40 });
});

test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    await testInfo.attach("server", {
      body: JSON.stringify({ http: server.http, sockets: server.sockets }, null, 2),
      contentType: "application/json",
    });
  }
  await server.close();
});

const side = (page: Page, name: "socket" | "sse") => page.locator(`.compare-side[data-side="${name}"]`);
const texts = (page: Page, name: "socket" | "sse", selector: string) =>
  side(page, name).locator(selector).evaluateAll((nodes) => nodes.map((n) => (n.textContent ?? "").trim()).filter(Boolean));
const turnRow = (page: Page, name: "socket" | "sse", index: number) => side(page, name).locator(`tr[data-turn="${index}"]`);

async function open(page: Page) {
  const query = new URLSearchParams({ apiUrl: server.url, clientToken: "ct_fake_e2e" });
  await page.goto(`/realtime-compare.html?${query}`);
  await page.waitForFunction(() => Boolean((window as unknown as { __personaE2E?: unknown }).__personaE2E));
}

test("one shared send streams on both sides: socket on the left, SSE on the right, no crossover", async ({ page }, testInfo) => {
  await open(page);
  // The left widget connects at page load; nothing on either widget is touched before the first send.
  await expect(side(page, "socket").locator('[data-role="status"]')).toHaveAttribute("data-state", "open");
  expect(server.http.filter((h) => h.path.endsWith("/v1/client/init")).length).toBeGreaterThanOrEqual(2);
  await page.locator("#compare-input").fill("hello both");
  await page.locator("#compare-send button").click();

  for (const name of ["socket", "sse"] as const) {
    await expect.poll(() => texts(page, name, ASSISTANT), { timeout: 15_000 }).toEqual(["Echo: hello both"]);
    expect(await texts(page, name, USER)).toEqual(["hello both"]);
    await expect(turnRow(page, name, 1).locator("td").nth(4)).not.toHaveText("…");
  }
  await expect(turnRow(page, "socket", 1)).toHaveAttribute("data-transport", "socket");
  await expect(turnRow(page, "sse", 1)).toHaveAttribute("data-transport", "SSE");

  const chats = server.http.filter((h) => h.path.endsWith("/v1/client/chat"));
  expect(chats.map((h) => h.status).sort()).toEqual([200, 202]);
  const sessions = new Set(chats.map((h) => h.body?.sessionId));
  expect(sessions.size).toBe(2);

  // A turn sent from one widget's own composer stays on that side.
  const own = side(page, "sse").locator(COMPOSER).first();
  await own.fill("only right");
  await own.press("Enter");
  await expect.poll(() => texts(page, "sse", ASSISTANT), { timeout: 15_000 }).toEqual(["Echo: hello both", "Echo: only right"]);
  await expect(turnRow(page, "sse", 2)).toHaveAttribute("data-transport", "SSE");
  await page.waitForTimeout(500);
  expect(await texts(page, "socket", ASSISTANT)).toEqual(["Echo: hello both"]);
  expect(await texts(page, "socket", USER)).toEqual(["hello both"]);
  await page.screenshot({ path: testInfo.outputPath("compare.png"), fullPage: true });
});

test("the shared send waits while either side is mid-run and keeps the typed prompt", async ({ page }) => {
  await open(page);
  const own = side(page, "sse").locator(COMPOSER).first();
  await own.fill("long right");
  await own.press("Enter");
  const send = page.locator("#compare-send button");
  await expect(send).toBeDisabled();
  await page.locator("#compare-input").fill("after the long turn");
  await page.locator("#compare-input").press("Enter");
  await expect(page.locator("#compare-input")).toHaveValue("after the long turn");
  expect(await texts(page, "socket", USER)).toEqual([]);

  await expect(send).toBeEnabled({ timeout: 15_000 });
  await send.click();
  await expect(page.locator("#compare-input")).toHaveValue("");
  for (const name of ["socket", "sse"] as const) {
    await expect.poll(() => texts(page, name, USER), { timeout: 15_000 }).toContain("after the long turn");
  }
});

test("a socket-side turn sent before the socket opens is labelled as such, not as a fallback", async ({ page }) => {
  server.rejectUpgrades(503);
  await open(page);
  await page.locator("#compare-input").fill("no socket yet");
  await page.locator("#compare-send button").click();
  await expect.poll(() => texts(page, "socket", ASSISTANT), { timeout: 15_000 }).toEqual(["Echo: no socket yet"]);
  await expect(turnRow(page, "socket", 1)).toHaveAttribute("data-transport", "SSE, socket not open yet");
  await expect(side(page, "socket").locator('[data-role="status"]')).not.toHaveAttribute("data-state", "fallback (SSE)");
});
