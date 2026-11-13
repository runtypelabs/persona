import { chromium, expect, test, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";

/**
 * The Runtype client-session socket against a REAL Runtype API (a local
 * `pnpm control:api` fleet, or any API you hold a management key for), driven
 * through the `realtime-mpa*.html` demo pair. Skipped unless a target is set:
 *
 *   REAL_API_URL + REAL_API_KEY            any API (management key, `rt_...`)
 *   CONTROL_API_SESSION + CORE_DIR          a control:api session's embed credential
 *
 * Creates (and deletes) its own agents, a product with a WebMCP chat surface,
 * and three client tokens. Models default to the fleet's mock models
 * (`mock/echo-fast`, `mock/stream-slow`); `[[mock:tool ...]]` directives make
 * the mock call the page tools. Override with REAL_API_MODEL / REAL_API_SLOW_MODEL.
 * Run with `e2e/live/playwright.realtime.config.ts`. Evidence per test
 * (wire.json with every socket frame from CDP and every /v1/client/* exchange,
 * final.png, console.txt, a trace) lands in the test's output directory.
 */

type Target = { apiUrl: string; apiKey: string };

function resolveTarget(): Target | null {
  if (process.env.REAL_API_URL && process.env.REAL_API_KEY) {
    return { apiUrl: process.env.REAL_API_URL.replace(/\/$/, ""), apiKey: process.env.REAL_API_KEY };
  }
  const session = process.env.CONTROL_API_SESSION;
  const core = process.env.CORE_DIR;
  if (!session || !core) return null;
  const file = path.join(core, "node_modules/.cache/control-api/sessions", session, "embed-credential.json");
  const credential = JSON.parse(readFileSync(file, "utf8")) as Target;
  return { apiUrl: credential.apiUrl.replace(/\/$/, ""), apiKey: credential.apiKey };
}

const target = resolveTarget();
test.skip(!target, "Set REAL_API_URL + REAL_API_KEY, or CONTROL_API_SESSION + CORE_DIR");

const PORT = Number(process.env.E2E_PORT ?? 4317);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const FAST_MODEL = process.env.REAL_API_MODEL ?? "mock/echo-fast";
const SLOW_MODEL = process.env.REAL_API_SLOW_MODEL ?? "mock/stream-slow";
const ASSISTANT = '[data-message-id][data-persona-theme-zone="assistant-message"]';
const COMPOSER = ".persona-widget-footer textarea, .persona-widget-footer input[type='text']";

// ---- Management and client HTTP ------------------------------------------------

type ApiResponse = { status: number; headers: Headers; text: string; json: () => Record<string, unknown> };

async function api(
  route: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string>; management?: boolean } = {}
): Promise<ApiResponse> {
  const response = await fetch(`${target!.apiUrl}${route}`, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: {
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      ...(init.management ? { authorization: `Bearer ${target!.apiKey}` } : { origin: ORIGIN }),
      ...init.headers,
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  const text = await response.text();
  return { status: response.status, headers: response.headers, text, json: () => JSON.parse(text) };
}

async function created(route: string, body: unknown): Promise<Record<string, unknown>> {
  const response = await api(route, { management: true, body });
  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`POST ${route} ${response.status}: ${response.text.slice(0, 500)}`);
  }
  return response.json();
}

const fixtures = {
  agents: [] as string[],
  tokens: [] as string[],
  products: [] as string[],
  fast: "",
  slow: "",
  durable: "",
  plain: "",
  elsewhere: "",
};

async function createAgent(name: string, model: string): Promise<string> {
  const agent = await created("/v1/agents", {
    name: `${name} ${Date.now()}`,
    agentType: "runtype",
    config: {
      model,
      temperature: 0,
      systemPrompt: "You are a concise assistant in a website chat widget.",
      durability: { forced: "durable" },
      // The mock model otherwise calls page tools on its own; only `[[mock:tool]]` prompts should.
      tools: { toolCallStrategy: "none" },
    },
  });
  const id = String(agent.id);
  fixtures.agents.push(id);
  return id;
}

async function createToken(name: string, options: { origins: string[]; surfaceId: string }) {
  const token = await created("/v1/client-tokens", {
    name: `${name} ${Date.now()}`,
    agentIds: [fixtures.fast, fixtures.slow],
    allowedOrigins: options.origins,
    productSurfaceId: options.surfaceId,
    rateLimitPerMinute: 120,
    rateLimitPerHour: 2000,
  });
  fixtures.tokens.push(String((token.clientToken as { id: string }).id));
  return String(token.token);
}

// A surface-bound token takes its durable-turns policy from the surface, never from its own config.
async function createSurface(productId: string, name: string, durable: boolean) {
  const surface = await created(`/v1/products/${productId}/surfaces`, {
    name,
    type: "chat",
    status: "active",
    config: { webmcp: { enabled: true }, ...(durable ? { durableTurns: { enabled: true } } : {}) },
  });
  return String(surface.id);
}

test.beforeAll(async () => {
  fixtures.fast = await createAgent("Socket live fast", FAST_MODEL);
  fixtures.slow = await createAgent("Socket live slow", SLOW_MODEL);
  const product = await created("/v1/products", { name: `Socket live ${Date.now()}` });
  const productId = String(product.id);
  fixtures.products.push(productId);
  const durableSurface = await createSurface(productId, "Socket live durable chat", true);
  const plainSurface = await createSurface(productId, "Socket live plain chat", false);
  fixtures.durable = await createToken("socket live durable", { origins: [ORIGIN], surfaceId: durableSurface });
  fixtures.plain = await createToken("socket live plain", { origins: [ORIGIN], surfaceId: plainSurface });
  fixtures.elsewhere = await createToken("socket live elsewhere", {
    origins: ["https://elsewhere.example"],
    surfaceId: durableSurface,
  });
});

test.afterAll(async () => {
  for (const id of fixtures.tokens) await api(`/v1/client-tokens/${id}`, { method: "DELETE", management: true });
  for (const id of fixtures.products) await api(`/v1/products/${id}`, { method: "DELETE", management: true });
  for (const id of fixtures.agents) await api(`/v1/agents/${id}`, { method: "DELETE", management: true });
});

// ---- Wire recording (CDP socket frames + /v1/client/* exchanges) ---------------

type WireSocket = { page: string; id: string; url: string; created: number; closed?: number };
type WireFrame = { page: string; socket: string; dir: "in" | "out"; t: number; data: string };
type WireHttp = {
  page: string;
  t: number;
  method: string;
  url: string;
  status: number;
  contentType: string;
  executionIdHeader: string | null;
  requestBody: unknown;
  responseBody?: unknown;
};
type Wire = { sockets: WireSocket[]; frames: WireFrame[]; http: WireHttp[]; console: string[] };

let wire: Wire;
const pending: Promise<unknown>[] = [];

async function record(page: Page, label: string): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  cdp.on("Network.webSocketCreated", (e) => wire.sockets.push({ page: label, id: e.requestId, url: e.url, created: Date.now() }));
  cdp.on("Network.webSocketClosed", (e) => {
    const socket = wire.sockets.find((s) => s.id === e.requestId);
    if (socket) socket.closed = Date.now();
  });
  cdp.on("Network.webSocketFrameReceived", (e) =>
    wire.frames.push({ page: label, socket: e.requestId, dir: "in", t: Date.now(), data: e.response.payloadData })
  );
  cdp.on("Network.webSocketFrameSent", (e) =>
    wire.frames.push({ page: label, socket: e.requestId, dir: "out", t: Date.now(), data: e.response.payloadData })
  );
  page.on("console", (m) => wire.console.push(`[${label}] [${m.type()}] ${m.text()}`));
  page.on("response", (response) => {
    const url = response.url();
    if (!url.includes("/v1/client/")) return;
    const request = response.request();
    let requestBody: unknown = request.postData();
    try {
      requestBody = requestBody ? JSON.parse(String(requestBody)) : undefined;
    } catch {
      // Not JSON: keep the raw body.
    }
    const entry: WireHttp = {
      page: label,
      t: Date.now(),
      method: request.method(),
      url,
      status: response.status(),
      contentType: response.headers()["content-type"] ?? "",
      executionIdHeader: response.headers()["x-runtype-execution-id"] ?? null,
      requestBody,
    };
    wire.http.push(entry);
    if (entry.contentType.includes("json")) {
      pending.push(response.json().then((body) => (entry.responseBody = body), () => undefined));
    }
  });
}

const socketJson = (page?: string) =>
  wire.frames
    .filter((f) => page === undefined || f.page === page)
    .map((f) => {
      try {
        return { ...f, json: JSON.parse(f.data) as Record<string, unknown> };
      } catch {
        return { ...f, json: {} as Record<string, unknown> };
      }
    });
const inFrames = (type: string, executionId?: string, page?: string) =>
  socketJson(page).filter(
    (f) => f.dir === "in" && f.json.type === type && (executionId === undefined || f.json.executionId === executionId)
  );
const outFrames = (type: string, page?: string) => socketJson(page).filter((f) => f.dir === "out" && f.json.type === type);
const exchanges = (route: string, page?: string) =>
  wire.http.filter((h) => new URL(h.url).pathname.endsWith(route) && (page === undefined || h.page === page));
const textDeltas = (executionId: string) =>
  inFrames("frame", executionId).filter((f) => String(f.json.sse).includes("text_delta")).length;

async function settle(): Promise<void> {
  await Promise.allSettled(pending.splice(0));
}

function executionOf(entry: WireHttp | undefined): string {
  const body = entry?.responseBody as { executionId?: string } | undefined;
  const id = body?.executionId ?? entry?.executionIdHeader;
  if (!id) throw new Error(`no execution id on ${entry?.url ?? "(missing exchange)"}`);
  return id;
}

// ---- Page helpers ----------------------------------------------------------------

function query(extra: Record<string, string> = {}): string {
  return new URLSearchParams({
    apiUrl: target!.apiUrl,
    clientToken: fixtures.durable,
    agentId: fixtures.fast,
    ...extra,
  }).toString();
}

async function instrument(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const Native = window.WebSocket;
    const w = window as unknown as { __rtHello: number; __rtSockets: WebSocket[]; __rtPersisted: boolean[] };
    w.__rtHello = 0;
    w.__rtSockets = [];
    w.__rtPersisted = [];
    window.addEventListener("pageshow", (event) => w.__rtPersisted.push(event.persisted));
    window.WebSocket = class extends Native {
      constructor(url: string | URL, protocols?: string | string[]) {
        // `__rtBlock` makes the socket endpoint unreachable: the connect fails with close 1006.
        const blocked = (window as unknown as { __rtBlock?: boolean }).__rtBlock && String(url).includes("/ws/client/");
        super(blocked ? "ws://127.0.0.1:9/ws/client/unreachable" : url, protocols);
        w.__rtSockets.push(this);
        this.addEventListener("close", (event) => {
          const codes = ((window as unknown as { __rtCloseCodes?: number[] }).__rtCloseCodes ??= []);
          codes.push(event.code);
        });
        this.addEventListener("message", (event) => {
          if (typeof event.data === "string" && event.data.includes('"type":"hello"')) w.__rtHello += 1;
        });
      }
    } as typeof WebSocket;
  });
}

async function open(page: Page, extra: Record<string, string> = {}, file = "realtime-mpa.html", origin = ORIGIN) {
  await page.goto(`${origin}/${file}?${query(extra)}`);
  await page.waitForFunction(() => Boolean((window as unknown as { __personaE2E?: unknown }).__personaE2E));
}

/** First keystroke inits the session (`sessionInit: "input"`); the socket opens once it lands. */
async function warm(page: Page): Promise<void> {
  const input = page.locator(COMPOSER).first();
  await input.click();
  await input.pressSequentially("x");
  await page.waitForFunction(() => (window as unknown as { __rtHello: number }).__rtHello > 0, undefined, {
    timeout: 30_000,
  });
  await input.fill("");
}

let replySeq = 0;

/** A reply the mock model streams verbatim; long enough to still be streaming on the slow model after several seconds. */
function directedReply(): string {
  replySeq += 1;
  lastDirectedReply = `reply-${replySeq}-` + Array.from({ length: 14 }, (_, i) => `word${i}`).join("-");
  return lastDirectedReply;
}
let lastDirectedReply = "";

// WHY(e2e/live/README.md): the mock model calls the first offered page tool unless the prompt directs its output.
async function send(page: Page, text: string): Promise<void> {
  const input = page.locator(COMPOSER).first();
  await input.fill(text.includes("[[mock:") ? text : `[[mock:text value=${directedReply()}]] ${text}`);
  await input.press("Enter");
}

const domAssistantTexts = (page: Page) =>
  page.locator(ASSISTANT).evaluateAll((nodes) => nodes.map((n) => (n.textContent ?? "").trim()).filter(Boolean));

function lastInit(page?: string): { sessionId: string; conversationId: string; visitorToken: string; realtime?: unknown } {
  const init = [...exchanges("/v1/client/init", page)].reverse().find((h) => h.status === 200 && h.responseBody);
  if (!init) throw new Error("no successful /v1/client/init");
  const body = init.responseBody as Record<string, unknown>;
  // A returning visitor's init echoes no token: it is the one the request carried.
  const minted = (body.visitor as { token?: string } | undefined)?.token;
  const sent = (init.requestBody as { visitorToken?: string } | undefined)?.visitorToken;
  return {
    sessionId: String(body.sessionId),
    conversationId: String(body.conversationId),
    visitorToken: String(minted ?? sent),
    realtime: body.realtime,
  };
}

const contentText = (content: unknown): string =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.map((part) => (part as { text?: string }).text ?? "").join("")
      : "";

/** A history read the server refused, such as a conversation that does not exist until its first turn is admitted. */
class HistoryReadFailed extends Error {}

/** The persisted assistant texts of the page's conversation, read the way the widget reads history. */
async function persistedAssistantTexts(page?: string): Promise<string[]> {
  await settle();
  if (!exchanges("/v1/client/init", page).some((h) => h.status === 200)) return [];
  const init = lastInit(page);
  const pageInit = [...exchanges("/v1/client/init", page)].reverse().find((h) => h.status === 200)!;
  const { token, flowId } = pageInit.requestBody as { token: string; flowId: string };
  // The page's session does not ask for history, so read through a session that does.
  const reader = await api("/v1/client/init", {
    body: {
      token,
      flowId,
      durableRecovery: true,
      visitorHistory: true,
      visitorToken: init.visitorToken,
      conversationId: init.conversationId,
    },
  });
  if (reader.status !== 200) throw new HistoryReadFailed(`reader init ${reader.status} ${reader.text.slice(0, 200)}`);
  const response = await api(
    `/v1/client/conversations/${init.conversationId}?sessionId=${encodeURIComponent(String(reader.json().sessionId))}`,
    { headers: { "X-Visitor-Token": init.visitorToken } }
  );
  if (response.status !== 200) throw new HistoryReadFailed(`conversation GET ${response.status} ${response.text.slice(0, 200)}`);
  const body = response.json();
  const messages = ((body.conversation as { messages?: unknown[] } | undefined)?.messages ?? body.messages ?? []) as Array<{
    role?: string;
    content?: unknown;
  }>;
  return messages.filter((m) => m.role === "assistant").map((m) => contentText(m.content).trim()).filter(Boolean);
}

/** The reply on screen equals the persisted reply, exactly, with one bubble per persisted reply. */
async function expectScreenMatchesPersisted(page: Page, replies: number, label?: string): Promise<string[]> {
  let persisted: string[] = [];
  await expect
    .poll(
      async () => {
        try {
          persisted = await persistedAssistantTexts(label);
        } catch (error) {
          if (error instanceof HistoryReadFailed) return error.message;
          throw error;
        }
        return persisted.length;
      },
      { timeout: 60_000, message: "persisted assistant replies" }
    )
    .toBe(replies);
  await expect.poll(() => domAssistantTexts(page), { timeout: 30_000, message: "screen equals persisted" }).toEqual(persisted);
  return persisted;
}

async function waitForDeltas(executionId: string, count: number): Promise<void> {
  await expect.poll(() => textDeltas(executionId), { timeout: 30_000, message: "text frames on the socket" }).toBeGreaterThanOrEqual(count);
}

const chatAt = (index: number, page?: string) => exchanges("/v1/client/chat", page)[index];

// ---- Lifecycle -------------------------------------------------------------------

test.beforeEach(async ({ context }) => {
  wire = { sockets: [], frames: [], http: [], console: [] };
  await instrument(context);
});

test.afterEach(async ({ page }, testInfo: TestInfo) => {
  await settle();
  writeFileSync(testInfo.outputPath("wire.json"), JSON.stringify(wire, null, 2));
  writeFileSync(testInfo.outputPath("console.txt"), wire.console.join("\n"));
  await page.screenshot({ path: testInfo.outputPath("final.png") }).catch(() => undefined);
  await testInfo.attach("wire", { path: testInfo.outputPath("wire.json"), contentType: "application/json" });
});

// ---- Cases ----------------------------------------------------------------------

test("1. a reply streams over the socket and persists", async ({ page }) => {
  await record(page, "a");
  await open(page);
  await warm(page);
  await send(page, "Say hello over the socket.");
  await expect.poll(() => exchanges("/v1/client/chat").length).toBe(1);
  await settle();
  const chat = chatAt(0)!;
  expect(chat.status).toBe(202);
  expect(chat.responseBody).toMatchObject({ delivery: "socket", conversationId: lastInit().conversationId });
  const executionId = executionOf(chat);
  const [reply] = await expectScreenMatchesPersisted(page, 1);
  expect(inFrames("frame", executionId).length).toBeGreaterThan(0);
  expect(wire.http.filter((h) => h.contentType.includes("text/event-stream"))).toHaveLength(0);
  expect(inFrames("attach_end", executionId).map((f) => f.json.reason)).toContain("terminal");

  await page.reload();
  await page.waitForFunction(() => Boolean((window as unknown as { __personaE2E?: unknown }).__personaE2E));
  await expect.poll(() => domAssistantTexts(page)).toEqual([reply]);
});

test("2. a new visitor's first send streams over SSE, the second over the socket", async ({ page }) => {
  await record(page, "a");
  await open(page);
  await page.locator(COMPOSER).first().click();
  await send(page, "First message.");
  await expectScreenMatchesPersisted(page, 1);
  const first = chatAt(0)!;
  expect(first.status).toBe(200);
  expect(first.contentType).toContain("text/event-stream");

  await page.waitForFunction(() => (window as unknown as { __rtHello: number }).__rtHello > 0, undefined, { timeout: 30_000 });
  await send(page, "Second message.");
  await expectScreenMatchesPersisted(page, 2);
  const second = chatAt(1)!;
  expect(second.status).toBe(202);
  expect(inFrames("frame", executionOf(second)).length).toBeGreaterThan(0);
});

test("3. a reply keeps streaming across a full-page navigation, no duplicate and no gap", async ({ page }) => {
  await record(page, "a");
  await open(page, { agentId: fixtures.slow });
  await warm(page);
  await send(page, "Tell me something at length.");
  await expect.poll(() => exchanges("/v1/client/chat").length).toBe(1);
  await settle();
  const executionId = executionOf(chatAt(0));
  await waitForDeltas(executionId, 2);
  const beforeNav = inFrames("attach_end", executionId).length;
  expect(beforeNav).toBe(0);
  await page.locator("#mpa-link").click();
  await page.waitForURL(/realtime-mpa-next\.html/);

  await expectScreenMatchesPersisted(page, 1);
  const reattach = outFrames("attach").find((f) => f.json.executionId === executionId);
  const eventsRoute = exchanges("/events").length;
  await test.info().attach("recovery", {
    body: JSON.stringify({ reattach: reattach?.json ?? null, eventsRouteRequests: eventsRoute }, null, 2),
    contentType: "application/json",
  });
  expect(reattach?.json.after ?? eventsRoute).toBeTruthy();
});

test("4. a navigating page tool runs once and page two answers it via /resume", async ({ page }) => {
  await record(page, "a");
  await open(page);
  await warm(page);
  await send(page, '[[mock:tool name=webmcp:go_to_page args={"page":"next"}]] Take me to the next page.');
  await page.waitForURL(/realtime-mpa-next\.html/, { timeout: 30_000 });
  await expectScreenMatchesPersisted(page, 1);

  expect(await page.evaluate(() => localStorage.getItem("realtime-mpa:go_to_page-runs"))).toBe("1");
  const resumes = exchanges("/v1/client/resume");
  expect(resumes).toHaveLength(1);
  const outputs = (resumes[0]!.requestBody as { toolOutputs?: Record<string, unknown> }).toolOutputs ?? {};
  expect(Object.values(outputs)).toEqual([
    expect.objectContaining({ navigated: true, url: expect.stringContaining("realtime-mpa-next.html") }),
  ]);
  // The arrival answer goes over the socket when its hello lands within the request's connect wait, else over SSE.
  const resume = resumes[0]!;
  if (resume.status === 202) {
    await expect.poll(() => inFrames("frame", executionOf(chatAt(0))).filter((f) => f.t >= resume.t).length).toBeGreaterThan(0);
  } else {
    expect(resume.status).toBe(200);
    expect(resume.contentType).toContain("text/event-stream");
  }
  await expect(page.getByText(/Resume failed/i)).toHaveCount(0);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => localStorage.getItem("realtime-mpa:go_to_page-runs"))).toBe("1");
});

test("5. a page-tool pause resumes on the same socket", async ({ page }) => {
  await record(page, "a");
  await open(page);
  await warm(page);
  await send(page, "[[mock:tool name=webmcp:read_page_title]] What page am I on?");
  await expectScreenMatchesPersisted(page, 1);
  await settle();
  const executionId = executionOf(chatAt(0));
  const paused = inFrames("attach_end", executionId).find((f) => f.json.reason === "paused");
  expect(paused).toBeTruthy();
  const resume = exchanges("/v1/client/resume")[0]!;
  expect(resume.status).toBe(202);
  const after = inFrames("frame", executionId).filter((f) => f.t >= resume.t);
  expect(after.length).toBeGreaterThan(0);
  expect(new Set(after.map((f) => f.socket))).toEqual(new Set([paused!.socket]));
  expect(await page.evaluate(() => localStorage.getItem("realtime-mpa:read_page_title-runs"))).toBe("1");
});

for (const variant of ["reattach", "events-route"] as const) {
  test(`6. a socket killed mid-stream recovers (${variant})`, async ({ page }) => {
    await record(page, "a");
    await open(page, { agentId: fixtures.slow });
    await warm(page);
    await send(page, "Tell me something at length.");
    await expect.poll(() => exchanges("/v1/client/chat").length).toBe(1);
    await settle();
    const executionId = executionOf(chatAt(0));
    await waitForDeltas(executionId, 2);
    if (variant === "events-route") {
      await page.evaluate(() => ((window as unknown as { __rtBlock: boolean }).__rtBlock = true));
    }
    const killedAt = Date.now();
    await page.evaluate(() => (window as unknown as { __rtSockets: WebSocket[] }).__rtSockets.at(-1)!.close(3001, "test kill"));

    await expectScreenMatchesPersisted(page, 1);
    if (variant === "reattach") {
      const reattach = outFrames("attach").find((f) => f.t >= killedAt && f.json.executionId === executionId);
      expect(reattach?.json.after).toBeTruthy();
    } else {
      expect(exchanges("/events").filter((h) => h.t >= killedAt).length).toBeGreaterThan(0);
    }
  });
}

test("7. a second tab on the conversation shows the first tab's turn live", async ({ context, page }) => {
  await record(page, "a");
  await open(page, { agentId: fixtures.slow });
  await warm(page);
  const tabB = await context.newPage();
  await record(tabB, "b");
  await open(tabB, { agentId: fixtures.slow });
  await warm(tabB);
  expect(lastInit("b").conversationId).toBe(lastInit("a").conversationId);

  await send(page, "Tell me something at length.");
  await expect.poll(() => exchanges("/v1/client/chat", "a").length).toBe(1);
  await settle();
  const executionId = executionOf(chatAt(0, "a"));
  await expect.poll(() => inFrames("frame", executionId, "b").length, { timeout: 30_000 }).toBeGreaterThan(0);
  const [reply] = await expectScreenMatchesPersisted(page, 1, "a");
  await expect.poll(() => domAssistantTexts(tabB), { timeout: 30_000 }).toEqual([reply]);
  expect(exchanges("/v1/client/chat", "b")).toHaveLength(0);
});

test("8. back/forward mid-conversation (bfcache allowed)", async ({}, testInfo) => {
  // Playwright's Chromium disables the bfcache by default; launch one that keeps it.
  // The headless shell's delegate disables the bfcache; the full Chromium build keeps it.
  const browser = await chromium.launch({ channel: "chromium", ignoreDefaultArgs: ["--disable-back-forward-cache"] });
  const context = await browser.newContext();
  await instrument(context);
  const page = await context.newPage();
  const notRestored: unknown[] = [];
  const cdp = await context.newCDPSession(page);
  await cdp.send("Page.enable");
  cdp.on("Page.backForwardCacheNotUsed", (event) => notRestored.push(event));
  try {
    await record(page, "a");
    await open(page, { agentId: fixtures.slow });
    await warm(page);
    await send(page, "Tell me something at length.");
    await expect.poll(() => exchanges("/v1/client/chat").length).toBe(1);
    await settle();
    await waitForDeltas(executionOf(chatAt(0)), 2);
    await page.locator("#mpa-link").click();
    await page.waitForURL(/realtime-mpa-next\.html/);
    // A bfcache restore fires pageshow, never load.
    await page.goBack({ waitUntil: "commit" });
    await page.waitForURL(/realtime-mpa\.html/, { waitUntil: "commit" });
    await page.waitForFunction(() => (window as unknown as { __rtPersisted: boolean[] }).__rtPersisted.length > 0);
    const persisted = await page.evaluate(() => (window as unknown as { __rtPersisted: boolean[] }).__rtPersisted);
    await testInfo.attach("pageshow-persisted", { body: JSON.stringify(persisted), contentType: "application/json" });
    writeFileSync(
      testInfo.outputPath("pageshow-persisted.json"),
      JSON.stringify({ persisted, backForwardCacheNotUsed: notRestored }, null, 2)
    );
    await expectScreenMatchesPersisted(page, 1);
  } finally {
    await page.screenshot({ path: testInfo.outputPath("final-bfcache.png") }).catch(() => undefined);
    await browser.close();
  }
});

test("9a. realtime: false keeps every stream on SSE", async ({ page }) => {
  await record(page, "a");
  await open(page, { realtime: "0" });
  await page.locator(COMPOSER).first().click();
  await send(page, "No socket please.");
  await expectScreenMatchesPersisted(page, 1);
  await send(page, "Still no socket.");
  await expectScreenMatchesPersisted(page, 2);
  expect(wire.sockets).toHaveLength(0);
  expect(exchanges("/v1/client/chat").map((h) => h.status)).toEqual([200, 200]);
  expect(exchanges("/v1/client/chat").every((h) => !(h.requestBody as Record<string, unknown>).delivery)).toBe(true);
});

test("9b. a token without durable turns gets no advertisement and stays on SSE", async ({ page }) => {
  await record(page, "a");
  await open(page, { clientToken: fixtures.plain });
  await page.locator(COMPOSER).first().click();
  await send(page, "Plain token.");
  // Without durable turns the session has no visitor credential to reopen history with.
  await expect.poll(() => domAssistantTexts(page), { timeout: 30_000 }).toEqual([lastDirectedReply]);
  expect(lastInit().realtime).toBeUndefined();
  expect(wire.sockets).toHaveLength(0);
  expect(chatAt(0)!.status).toBe(200);
});

test("9c. a wrong origin is refused cleanly, over HTTP and at the socket upgrade", async ({ page }) => {
  await record(page, "a");
  // Same server, other origin: the token admits only 127.0.0.1.
  await open(page, {}, "realtime-mpa.html", `http://localhost:${PORT}`);
  await page.locator(COMPOSER).first().click();
  await send(page, "Wrong origin.");
  await expect.poll(() => exchanges("/v1/client/init").map((h) => h.status)).toContain(403);
  expect(wire.sockets).toHaveLength(0);

  // A real session (right origin), then the upgrade with a wrong Origin.
  const init = await api("/v1/client/init", {
    body: { token: fixtures.durable, flowId: fixtures.fast, durableRecovery: true, visitorHistory: true },
  });
  const body = init.json();
  const realtime = body.realtime as { url: string };
  const visitorToken = String((body.visitor as { token: string }).token);
  const url = new URL(realtime.url.replace(/^ws/, "http"));
  url.searchParams.set("protocol", "runtype-client-session-v1");
  url.searchParams.set("sessionId", String(body.sessionId));
  url.searchParams.set("clientVersion", "persona/live-test");
  const refusal = await new Promise<{ status: number; body: string }>((resolve, reject) => {
    const request = (url.protocol === "https:" ? https : http).request(url, {
      headers: {
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
        "Sec-WebSocket-Protocol": `runtype.bearer, ${fixtures.durable}, ${visitorToken}`,
        Origin: "https://elsewhere.example",
      },
    });
    request.on("response", (response) => {
      let text = "";
      response.on("data", (chunk) => (text += chunk));
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body: text }));
    });
    request.on("upgrade", (_response, socket) => {
      socket.destroy();
      resolve({ status: 101, body: "" });
    });
    request.on("error", reject);
    request.end();
  });
  await test.info().attach("wrong-origin-upgrade", { body: JSON.stringify(refusal, null, 2), contentType: "application/json" });
  expect(refusal.status).toBe(403);
});

test("10. the socket closes after the hidden-page idle window and reopens on intent", async ({ page }) => {
  await record(page, "a");
  await open(page, { idleCloseMs: "1500" });
  await warm(page);
  await send(page, "Short one.");
  await expectScreenMatchesPersisted(page, 1);
  const first = wire.sockets.at(-1)!;
  expect(first.closed).toBeUndefined();

  const hiddenAt = Date.now();
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => wire.sockets.find((s) => s.id === first.id)?.closed, { timeout: 10_000 }).toBeTruthy();
  const closedAfterMs = wire.sockets.find((s) => s.id === first.id)!.closed! - hiddenAt;
  await test.info().attach("idle", { body: JSON.stringify({ closedAfterMs }), contentType: "application/json" });
  expect(closedAfterMs).toBeGreaterThanOrEqual(1400);

  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.locator(COMPOSER).first().hover();
  await page.locator(COMPOSER).first().focus();
  await expect.poll(() => wire.sockets.length, { timeout: 15_000 }).toBeGreaterThan(1);
  await page.waitForFunction(() => (window as unknown as { __rtHello: number }).__rtHello > 1, undefined, { timeout: 15_000 });
});

test("11. a visitor reset closes the socket with 4401 and the widget re-inits without a reconnect loop", async ({ page }, testInfo) => {
  await record(page, "a");
  await open(page);
  await warm(page);
  await send(page, "Before the reset.");
  await expectScreenMatchesPersisted(page, 1);
  const before = lastInit();
  const socketsBefore = wire.sockets.length;
  const initsBefore = exchanges("/v1/client/init").length;

  // The reset comes from elsewhere (another tab of this visitor), so the widget learns of it only from the close.
  const reset = await api(`/v1/client/visitor/reset?sessionId=${encodeURIComponent(before.sessionId)}`, {
    method: "POST",
    headers: { "X-Visitor-Token": before.visitorToken },
  });
  expect(reset.status).toBe(200);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __rtCloseCodes?: number[] }).__rtCloseCodes ?? []), {
      timeout: 10_000,
    })
    .toContain(4401);
  await page.waitForTimeout(8000);

  await settle();
  const inits = exchanges("/v1/client/init").slice(initsBefore);
  const socketsAfter = wire.sockets.length - socketsBefore;
  writeFileSync(
    testInfo.outputPath("reset.json"),
    JSON.stringify(
      { resetStatus: reset.status, initsAfter: inits.map((h) => [h.status, h.responseBody]), socketsOpenedAfter: socketsAfter },
      null,
      2
    )
  );
  expect(inits.length).toBeGreaterThanOrEqual(1);
  expect(socketsAfter).toBeLessThanOrEqual(2);

  await send(page, "After the reset.");
  await expect.poll(() => domAssistantTexts(page), { timeout: 30_000 }).toContain(lastDirectedReply);
});
