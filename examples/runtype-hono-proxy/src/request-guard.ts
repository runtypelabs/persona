import type {
  ProxyRequestGuard,
  ProxyRequestGuardContext,
} from "@runtypelabs/persona-proxy";
import type { ProxyEnv } from "./env.js";

export type DemoRequestKind = ProxyRequestGuardContext["kind"] | "tts" | "checkout";

type WindowEntry = { count: number; resetAt: number };

export type FixedWindowLimiter = {
  check: (input: {
    bucket: string;
    key: string;
    limit: number;
    windowMs: number;
  }) => { allowed: true } | { allowed: false; retryAfterSeconds: number };
  size: () => number;
};

export function createFixedWindowLimiter(options: {
  maxEntries: number;
  now?: () => number;
}): FixedWindowLimiter {
  const entries = new Map<string, WindowEntry>();
  const now = options.now ?? Date.now;

  return {
    check: ({ bucket, key, limit, windowMs }) => {
      const currentTime = now();
      for (const [entryKey, entry] of entries) {
        if (entry.resetAt <= currentTime) entries.delete(entryKey);
      }

      const entryKey = `${bucket}:${key}`;
      let entry = entries.get(entryKey);
      if (!entry) {
        while (entries.size >= options.maxEntries) {
          const oldestKey = entries.keys().next().value as string | undefined;
          if (!oldestKey) break;
          entries.delete(oldestKey);
        }
        entry = { count: 0, resetAt: currentTime + windowMs };
        entries.set(entryKey, entry);
      }

      if (entry.count >= limit) {
        return {
          allowed: false as const,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((entry.resetAt - currentTime) / 1000)
          ),
        };
      }
      entry.count += 1;
      return { allowed: true as const };
    },
    size: () => entries.size,
  };
}

export function resolveClientAddress(request: Request): string {
  const value =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("x-forwarded-for");
  return value?.split(",", 1)[0]?.trim() || "unknown";
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function configuredBodyLimit(env: ProxyEnv): number {
  const requested = positiveInteger(env.PROXY_MAX_BODY_BYTES, 16 * 1024 * 1024);
  return Math.min(64 * 1024 * 1024, Math.max(16 * 1024 * 1024, requested));
}

function tokensMatch(expected: string, actual: string): boolean {
  const encoder = new TextEncoder();
  const expectedBytes = encoder.encode(expected);
  const actualBytes = encoder.encode(actual);
  const length = Math.max(expectedBytes.length, actualBytes.length);
  let difference = expectedBytes.length ^ actualBytes.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (expectedBytes[index] ?? 0) ^ (actualBytes[index] ?? 0);
  }
  return difference === 0;
}

const sharedLimiter = createFixedWindowLimiter({ maxEntries: 10_000 });

export function guardDemoRequest(
  env: ProxyEnv,
  context: { request: Request; kind: DemoRequestKind; path: string },
  limiter: FixedWindowLimiter = sharedLimiter
): Response | undefined {
  const expectedToken = env.PROXY_BEARER_TOKEN;
  if (expectedToken) {
    const authorization = context.request.headers.get("authorization") ?? "";
    const actualToken = authorization.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : "";
    if (!tokensMatch(expectedToken, actualToken)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const expensive = context.kind === "tts" || context.kind === "checkout";
  const windowSeconds = positiveInteger(env.PROXY_RATE_LIMIT_WINDOW_SECONDS, 60);
  const limit = expensive
    ? positiveInteger(env.PROXY_EXPENSIVE_RATE_LIMIT_REQUESTS, 20)
    : positiveInteger(env.PROXY_RATE_LIMIT_REQUESTS, 60);
  const result = limiter.check({
    bucket: expensive ? "expensive" : "chat",
    key: resolveClientAddress(context.request),
    limit,
    windowMs: windowSeconds * 1000,
  });
  if (result.allowed) return undefined;

  return new Response(JSON.stringify({ error: "Too many requests" }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(result.retryAfterSeconds),
    },
  });
}

export function createDemoProxyGuard(env: ProxyEnv): ProxyRequestGuard {
  return (context) => guardDemoRequest(env, context);
}

async function readTextWithinLimit(
  request: Request,
  maxBytes: number
): Promise<{ success: true; text: string } | { success: false }> {
  if (!request.body) return { success: true, text: "" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  let done = false;
  try {
    while (!done) {
      const result = await reader.read();
      done = result.done;
      if (done) break;
      const value = result.value;
      if (!value) continue;
      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        void reader.cancel().catch(() => undefined);
        return { success: false };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { success: true, text: new TextDecoder().decode(bytes) };
}

export async function parseLimitedJson(
  request: Request,
  maxBytes: number
): Promise<
  | { success: true; value: unknown }
  | { success: false; response: Response }
> {
  const declaredLength = request.headers.get("content-length")?.trim();
  if (declaredLength && /^\d+$/.test(declaredLength)) {
    try {
      if (BigInt(declaredLength) > BigInt(maxBytes)) {
        return {
          success: false,
          response: new Response(JSON.stringify({ error: "Request body too large" }), {
            status: 413,
            headers: { "Content-Type": "application/json" },
          }),
        };
      }
    } catch {
      // Fall through to measuring the actual body.
    }
  }

  const body = await readTextWithinLimit(request, maxBytes);
  if (!body.success) {
    return {
      success: false,
      response: new Response(JSON.stringify({ error: "Request body too large" }), {
        status: 413,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }
  try {
    return { success: true, value: JSON.parse(body.text) as unknown };
  } catch {
    return {
      success: false,
      response: new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }
}
