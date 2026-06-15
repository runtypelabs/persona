// ───────────────────────────────────────────────────────────────────────────
// Paused-execution store for the WebMCP dispatch → /resume round-trip.
//
// The widget pauses on a tool call (dispatch) and POSTs the result later
// (/resume) as a SEPARATE request. On serverless those two requests can land on
// different function instances, so the in-flight conversation must live in a
// store both can reach: NOT a module-level Map (which is per-instance).
//
// ⚠️  PRODUCTION: SWAP THIS OUT FOR A REAL DATA STORE.  ⚠️
// This uses the **Vercel Runtime Cache** (`@vercel/functions` getCache), which
// is an *ephemeral, region-scoped cache*: entries can be evicted at any time and
// are not guaranteed to persist or to be strongly consistent across regions.
// That is acceptable for a demo / preview deployment (the pause→resume window is
// only seconds), but for production you MUST replace it with a durable,
// strongly-consistent store keyed by executionId: e.g. Redis/Upstash, Vercel
// KV, a database row, or a Durable Object. The interface below
// (save/load/delete) is deliberately tiny so swapping the backend is a one-file
// change.
//
// Locally, getCache() transparently falls back to an in-memory cache; we add our
// own Map fallback too so `next dev` never depends on cache availability.
// ───────────────────────────────────────────────────────────────────────────

import { getCache } from "@vercel/functions";
import type { ClientToolDefinition } from "./shim";
import type { ModelMessage } from "ai";

export interface PausedExecution {
  messages: ModelMessage[];
  pending: Array<{ toolCallId: string; toolName: string }>;
  clientTools: ClientToolDefinition[];
}

// How long a paused execution may sit before the shopper resumes it.
const TTL_SECONDS = 600;
const NAMESPACE = "webmcp-exec";

// Defensive per-instance fallback if getCache() is unavailable for any reason.
const memory = new Map<string, PausedExecution>();

function cache() {
  try {
    return getCache({ namespace: NAMESPACE });
  } catch {
    return null;
  }
}

export async function savePausedExecution(
  executionId: string,
  value: PausedExecution,
): Promise<void> {
  const c = cache();
  if (c) {
    await c.set(executionId, value, { ttl: TTL_SECONDS });
    return;
  }
  memory.set(executionId, value);
}

export async function loadPausedExecution(
  executionId: string,
): Promise<PausedExecution | undefined> {
  const c = cache();
  if (c) {
    const v = (await c.get(executionId)) as PausedExecution | null;
    return v ?? undefined;
  }
  return memory.get(executionId);
}

export async function deletePausedExecution(executionId: string): Promise<void> {
  const c = cache();
  if (c) {
    await c.delete(executionId);
    return;
  }
  memory.delete(executionId);
}
