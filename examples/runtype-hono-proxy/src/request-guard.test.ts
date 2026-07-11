import assert from "node:assert/strict";
import test from "node:test";
import {
  createFixedWindowLimiter,
  guardDemoRequest,
  parseLimitedJson,
  resolveClientAddress,
} from "./request-guard.js";
import { createRuntypeProxyApp } from "./app.js";

const request = (headers: Record<string, string> = {}) =>
  new Request("https://proxy.example/api", { headers });

test("fixed windows return Retry-After and roll over without sleeping", () => {
  let now = 1_000;
  const limiter = createFixedWindowLimiter({ maxEntries: 10, now: () => now });
  assert.deepEqual(
    limiter.check({ bucket: "chat", key: "ip", limit: 1, windowMs: 10_000 }),
    { allowed: true }
  );
  assert.deepEqual(
    limiter.check({ bucket: "chat", key: "ip", limit: 1, windowMs: 10_000 }),
    { allowed: false, retryAfterSeconds: 10 }
  );
  now = 11_000;
  assert.deepEqual(
    limiter.check({ bucket: "chat", key: "ip", limit: 1, windowMs: 10_000 }),
    { allowed: true }
  );
});

test("limiter bounds entries and keeps buckets separate", () => {
  const limiter = createFixedWindowLimiter({ maxEntries: 2, now: () => 0 });
  limiter.check({ bucket: "chat", key: "one", limit: 1, windowMs: 10_000 });
  limiter.check({ bucket: "chat", key: "two", limit: 1, windowMs: 10_000 });
  limiter.check({ bucket: "chat", key: "three", limit: 1, windowMs: 10_000 });
  assert.equal(limiter.size(), 2);
  assert.deepEqual(
    limiter.check({ bucket: "expensive", key: "three", limit: 1, windowMs: 10_000 }),
    { allowed: true }
  );
});

test("client address uses Cloudflare, then Vercel, then forwarded-for", () => {
  assert.equal(
    resolveClientAddress(
      request({
        "CF-Connecting-IP": "cf",
        "X-Vercel-Forwarded-For": "vercel",
        "X-Forwarded-For": "forwarded, proxy",
      })
    ),
    "cf"
  );
  assert.equal(
    resolveClientAddress(
      request({ "X-Vercel-Forwarded-For": "vercel", "X-Forwarded-For": "forwarded" })
    ),
    "vercel"
  );
  assert.equal(resolveClientAddress(request({ "X-Forwarded-For": "first, second" })), "first");
  assert.equal(resolveClientAddress(request()), "unknown");
});

test("unknown callers share a conservative bucket", () => {
  const limiter = createFixedWindowLimiter({ maxEntries: 10, now: () => 0 });
  const env = { PROXY_RATE_LIMIT_REQUESTS: "1" };
  assert.equal(
    guardDemoRequest(env, { request: request(), kind: "dispatch", path: "/dispatch" }, limiter),
    undefined
  );
  const denied = guardDemoRequest(
    env,
    { request: request(), kind: "resume", path: "/dispatch/resume" },
    limiter
  );
  assert.equal(denied?.status, 429);
});

test("optional bearer token is enforced before rate limiting", () => {
  const limiter = createFixedWindowLimiter({ maxEntries: 10, now: () => 0 });
  const env = { PROXY_BEARER_TOKEN: "expected" };
  const denied = guardDemoRequest(
    env,
    { request: request({ Authorization: "Bearer wrong" }), kind: "dispatch", path: "/" },
    limiter
  );
  assert.equal(denied?.status, 401);
  assert.equal(limiter.size(), 0);
  assert.equal(
    guardDemoRequest(
      env,
      {
        request: request({ Authorization: "Bearer expected" }),
        kind: "dispatch",
        path: "/",
      },
      limiter
    ),
    undefined
  );
});

test("chat and expensive requests use separate configured limits", () => {
  const limiter = createFixedWindowLimiter({ maxEntries: 10, now: () => 0 });
  const env = {
    PROXY_RATE_LIMIT_REQUESTS: "2",
    PROXY_EXPENSIVE_RATE_LIMIT_REQUESTS: "1",
  };
  assert.equal(
    guardDemoRequest(
      env,
      { request: request({ "X-Forwarded-For": "ip" }), kind: "dispatch", path: "/" },
      limiter
    ),
    undefined
  );
  assert.equal(
    guardDemoRequest(
      env,
      { request: request({ "X-Forwarded-For": "ip" }), kind: "tts", path: "/tts" },
      limiter
    ),
    undefined
  );
  assert.equal(
    guardDemoRequest(
      env,
      { request: request({ "X-Forwarded-For": "ip" }), kind: "tts", path: "/tts" },
      limiter
    )?.status,
    429
  );
  assert.equal(
    guardDemoRequest(
      env,
      { request: request({ "X-Forwarded-For": "ip" }), kind: "resume", path: "/resume" },
      limiter
    ),
    undefined
  );
});

test("limited JSON measures UTF-8 bytes and accepts the exact boundary", async () => {
  const body = JSON.stringify({ text: "💬" });
  const bytes = new TextEncoder().encode(body).byteLength;
  const oversized = await parseLimitedJson(
    new Request("https://proxy.example", { method: "POST", body }),
    bytes - 1
  );
  assert.equal(oversized.success, false);
  if (!oversized.success) assert.equal(oversized.response.status, 413);

  const accepted = await parseLimitedJson(
    new Request("https://proxy.example", { method: "POST", body }),
    bytes
  );
  assert.equal(accepted.success, true);
});

test("limited JSON cancels a chunked stream immediately after crossing the cap", async () => {
  let cancelled = false;
  let pullCount = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pullCount += 1;
      controller.enqueue(new Uint8Array(8));
    },
    cancel() {
      cancelled = true;
    },
  });
  const chunkedRequest = new Request("https://proxy.example", {
    method: "POST",
    body: stream,
    duplex: "half",
  } as never);

  const result = await parseLimitedJson(chunkedRequest, 10);
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.response.status, 413);
  assert.equal(cancelled, true);
  assert.ok(pullCount <= 3);
});

const corsHeaders = (origin: string, clientAddress: string) => ({
  Origin: origin,
  "Content-Type": "application/json",
  "X-Forwarded-For": clientAddress,
});

const assertCors = (response: Response, origin: string) => {
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
  assert.match(response.headers.get("Vary") ?? "", /(?:^|,\s*)Origin(?:,|$)/i);
};

test("TTS rate-limit denials preserve response CORS headers", async () => {
  const origin = "https://tts.example";
  const app = createRuntypeProxyApp({
    ALLOWED_ORIGINS: origin,
    OPENAI_API_KEY: "test-key",
    PROXY_EXPENSIVE_RATE_LIMIT_REQUESTS: "1",
  });

  const first = await app.request("/api/tts", {
    method: "POST",
    headers: corsHeaders(origin, "cors-tts-rate-test"),
    body: "{",
  });
  assert.equal(first.status, 400);

  const denied = await app.request("/api/tts", {
    method: "POST",
    headers: corsHeaders(origin, "cors-tts-rate-test"),
    body: JSON.stringify({ text: "hello" }),
  });
  assert.equal(denied.status, 429);
  assertCors(denied, origin);
});

test("checkout invalid and oversized JSON errors preserve response CORS headers", async () => {
  const origin = "https://checkout.example";
  const app = createRuntypeProxyApp({
    ALLOWED_ORIGINS: origin,
    STRIPE_SECRET_KEY: "sk_test_not_used",
    PROXY_EXPENSIVE_RATE_LIMIT_REQUESTS: "10",
  });

  const invalid = await app.request("/api/checkout", {
    method: "POST",
    headers: corsHeaders(origin, "cors-checkout-invalid-test"),
    body: "{",
  });
  assert.equal(invalid.status, 400);
  assertCors(invalid, origin);

  const oversized = await app.request("/api/checkout", {
    method: "POST",
    headers: corsHeaders(origin, "cors-checkout-oversized-test"),
    body: JSON.stringify({ value: "x".repeat(65 * 1024) }),
  });
  assert.equal(oversized.status, 413);
  assertCors(oversized, origin);
});
