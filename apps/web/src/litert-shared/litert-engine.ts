// ───────────────────────────────────────────────────────────────────────────
// In-browser LLM engine for Persona, powered by LiteRT-LM.js + Gemma 4.
//
// This is the whole point of the demo: instead of Persona talking to a hosted
// agent runtime (or a local proxy), the "backend" is Gemma 4 running ENTIRELY
// in the browser over WebGPU via Google's LiteRT-LM runtime. We speak Persona's
// SSE wire protocol — the same one the Runtype API and the BYO-backend examples
// emit — so the widget never learns it isn't talking to a server.
//
// Three integration facts shape the design:
//
//   1. Persona's `customFetch` config hook only covers DISPATCH. The WebMCP
//      tool loop also POSTs to `${apiUrl}/resume`, and resume goes through the
//      widget's own `fetch` (client.ts `resumeFlow`), NOT `customFetch`. So to
//      catch BOTH halves of the loop in one place we patch `window.fetch`,
//      scoped to exactly the dispatch URL and `${dispatchUrl}/resume`. Every
//      other request (the model download, fonts, …) passes straight through.
//
//   2. Gemma 4 is trained on tool calling and LiteRT-LM exposes it natively:
//      `Preface.tools` takes JSON-Schema tool declarations, and the model's
//      calls come back as structured `Message.tool_calls` (already parsed — the
//      WASM layer handles Gemma's `<|tool>` / `<|tool_call>` control tokens for
//      us). We map WebMCP page tools → `Preface.tools`, turn each returned
//      `tool_call` into a Persona `await` frame, and feed results back as a
//      `tool_response` message. No prompt-scraping, no hand-rolled JSON protocol.
//
//   3. A real server keeps paused-run state in a DURABLE store and rebuilds the
//      run from it on /resume (it's stateless between requests). We mirror that:
//      on a tool-call pause we persist the full transcript to a durable resume
//      store (IndexedDB; see ./resume-store.ts) keyed by executionId, and on
//      /resume we reload it and continue — so a run survives a reload and is the
//      source of truth, exactly like a backend. The live LiteRT conversation is
//      kept only as a same-session warm-KV cache; when it's gone (after reload)
//      we rebuild the conversation from the stored transcript via `Preface`.
//
// Wire contract (verified against packages/widget/src/client.ts and mirrored
// from examples/ai-sdk-webmcp/app/api/chat/shim.ts, the reference adapter):
//   • run start   → execution_start  {executionId, kind:"agent", agentId, …}
//   • turn open   → turn_start        {executionId, id:"turn_…", iteration}
//   • text        → text_start / text_delta / text_complete {executionId, id, delta}
//   • WebMCP call → await             {executionId, toolName:"<bare>", origin:"webmcp",
//                                      toolId, toolCallId, parameters, awaitedAt}
//   • turn done   → turn_complete + execution_complete {executionId, success:true}
//   • failure     → execution_error   {executionId, kind:"agent", error:{message}}
// Resume body: {executionId, toolOutputs: Record<toolCallId, WebMcpToolResult>}.
//
// One `exec_…` id is carried across the whole run; `iteration` advances on each
// resume (re-invoking the model over tool results is a new reasoning turn).
// ───────────────────────────────────────────────────────────────────────────

import { createResumeStore, type ResumeStore } from "./resume-store";

// ── Minimal mirror of the @litert-lm/core surface we use ────────────────────
// (loaded from the CDN at runtime; we type just what we touch). See the package
// d.ts: conversation_config.ts (Tool/Message/ToolCall), engine.ts, etc.

interface LiteRtToolParameters {
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
}
// The runtime's Gemma chat template reads `tool['function']['name']` etc., so
// tools must be passed in the OpenAI-style wrapped shape, not flat.
interface LiteRtTool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: LiteRtToolParameters;
  };
}
interface LiteRtToolCall {
  type?: string;
  function: { name: string; arguments: Record<string, unknown> };
}
interface LiteRtMessageContentItem {
  type: string;
  text?: string;
  // For role:"tool" items, the runtime's template reads `name` + `response`
  // DIRECTLY off the content item (not a nested `tool_response`).
  name?: string;
  response?: Record<string, unknown>;
}
interface LiteRtMessage {
  role: string;
  content?: string | LiteRtMessageContentItem[];
  channels?: Record<string, string>;
  tool_calls?: LiteRtToolCall[];
}
type LiteRtMessageLike = string | LiteRtMessage;

interface LiteRtConversation {
  sendMessageStreaming(
    message: LiteRtMessageLike | LiteRtMessageLike[],
  ): ReadableStream<LiteRtMessage>;
  cancel(): void;
  // Sync in ≤0.13.x, Promise in 0.14.0 — always `await` the call so the engine
  // works against either. (Spreading the 0.14.0 Promise threw "history is not
  // iterable" and killed every text-only final turn as an execution_error.)
  getHistory(): LiteRtMessage[] | Promise<LiteRtMessage[]>;
  delete(): Promise<void>;
}
interface LiteRtEngine {
  createConversation(config?: {
    preface?: { messages?: LiteRtMessage[]; tools?: LiteRtTool[] };
    sessionConfig?: {
      samplerParams?: { temperature?: number; topK?: number; topP?: number };
      maxOutputTokens?: number;
    };
    enableConstrainedDecoding?: boolean;
    prefillPrefaceOnInit?: boolean;
  }): Promise<LiteRtConversation>;
  delete(): Promise<void>;
}
interface LiteRtModule {
  Engine: {
    create(settings: {
      model: string | ReadableStream<Uint8Array>;
      mainExecutorSettings?: { maxNumTokens?: number };
    }): Promise<LiteRtEngine>;
  };
}

// ── Model registry ──────────────────────────────────────────────────────────

export type ModelId = "e2b" | "e4b" | "12b" | "26b";

export interface ModelInfo {
  id: ModelId;
  label: string;
  /** HuggingFace `.litertlm` weights (WebGPU build). */
  url: string;
  /** Rough on-disk download size, for the UI. */
  approxSize: string;
  blurb: string;
}

// 0.14.0: same Engine/Conversation surface as 0.13.1 (engine.d.ts is
// byte-identical); the wrapped `{type:'function', function:{…}}` tool shape and
// the `{type:'tool_response', name, response}` content item we send are now the
// documented canonical forms. Bumped because the larger Gemma 4 web builds
// (12B / 26B-A4B) shipped alongside this runtime release.
const LITERT_VERSION = "0.14.0";
const HF = "https://huggingface.co/litert-community";

export const MODELS: Record<ModelId, ModelInfo> = {
  e2b: {
    id: "e2b",
    label: "Gemma 4 E2B",
    url: `${HF}/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm`,
    approxSize: "~1.4 GB",
    blurb: "Smaller / faster. Quick to load, snappier tokens.",
  },
  e4b: {
    id: "e4b",
    label: "Gemma 4 E4B",
    url: `${HF}/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it-web.litertlm`,
    approxSize: "~2.9 GB",
    blurb: "Larger. Better tool-calling / reasoning, slower.",
  },
  // The two big variants are EXPERIMENTAL: the LiteRT-LM JS API officially
  // lists only the E2B/E4B web builds, but litert-community ships -web.litertlm
  // files for both of these, and this page is a testbed. Expect long downloads,
  // heavy GPU/unified-memory use, and possible runtime rejection on some
  // machines.
  "12b": {
    id: "12b",
    label: "Gemma 4 12B (experimental)",
    url: `${HF}/gemma-4-12B-it-litert-lm/resolve/main/gemma-4-12B-it-web.litertlm`,
    approxSize: "~6.0 GB",
    blurb: "Dense 12B. Needs ~16 GB+ GPU/unified memory; strongest tool use.",
  },
  "26b": {
    id: "26b",
    label: "Gemma 4 26B-A4B (experimental)",
    url: `${HF}/gemma-4-26B-A4B-it-litert-lm/resolve/main/gemma-4-26B-A4B-it-web.litertlm`,
    approxSize: "~15.8 GB",
    blurb: "MoE, ~4B active. Huge download; needs a lot of memory + disk quota.",
  },
};

// The 17 slide tools expand to ~3–4k tokens of Gemma tool declarations, so the
// context needs real headroom on top of the system turn + page context + decode.
// 4096 left almost no room and stalled the first turn; 8192 (the docs default)
// is comfortable.
const MAX_NUM_TOKENS = 8192;
// Hard cap on tool rounds per user turn — the backstop a real agent runtime
// keeps so a model that loops on tool calls can't run forever.
const MAX_TOOL_ROUNDS = 6;

// ── Tool scope ────────────────────────────────────────────────────────────────
// A full page tool surface is thousands of tokens of declarations the small
// on-device model re-reads every turn, which slows it down and gives it more
// rope to mis-call. A curated "core" island (per demo, via the `coreToolNames`
// option) keeps the headline flows while trimming the prompt for snappier
// turns. The page can flip this at runtime — defaults to "core" for a
// responsive first impression; switch to "all" to show the full surface.
export type ToolScope = "core" | "all";
// Low temperature keeps tool-argument JSON tight and the loop deterministic —
// the right default when the goal is evaluating tool-calling, not prose flair.
const TEMPERATURE = 0.3;

// ── Metrics (consumed by the eval HUD) ──────────────────────────────────────

export type MetricEvent =
  | { type: "load_start"; modelId: ModelId }
  | { type: "load_progress"; received: number; total: number; phase: WeightsPhase }
  | { type: "load_ready"; modelId: ModelId; loadMs: number; fromCache: boolean }
  | { type: "load_error"; message: string }
  | { type: "warmup_start"; modelId: ModelId }
  | { type: "warmup_done"; modelId: ModelId; ms: number }
  | { type: "turn_start"; executionId: string; phase: "dispatch" | "resume"; iteration: number; toolCount: number }
  | { type: "ttft"; ms: number }
  | { type: "turn_end"; tokens: number; ms: number; tokensPerSec: number }
  | { type: "tool_calls"; names: string[] }
  | { type: "run_complete"; executionId: string }
  | { type: "error"; message: string };

export type MetricSink = (event: MetricEvent) => void;

// ── Model weight cache ───────────────────────────────────────────────────────
// The browser HTTP cache can NEVER reuse a weights download from HuggingFace:
// the `resolve/…` URL 302s with `cache-control: no-store` to a SIGNED CDN URL
// whose signature differs on every request, so each page load would re-pull the
// full multi-GB file. We cache the weights ourselves in Cache Storage, keyed by
// the stable canonical URL. Cache Storage is ORIGIN-scoped, so on
// persona-chat.dev every litert demo (slides / paint / shop / intake) shares
// one stored copy per model, across page reloads and sessions. It does NOT
// span origins (localhost dev re-downloads separately from prod) — that's what
// the Cross-Origin Storage proposal (github.com/tomayac/awesome-cross-origin-
// storage) would fix, but nothing ships it yet.
//
// Flow on a miss: download INTO the cache first (progress = "download"), then
// stream the committed entry from disk to the engine (progress = "cache-read").
// Download-then-serve, not res.clone(): cloning lets the engine race the
// cache-put over the same multi-GB body (unread clone data buffers in memory,
// and a navigation mid-put stores nothing). put() only commits complete
// bodies, so an entry that matches is always a whole file. Before caching we
// check quota headroom — a 15.8 GB model on a small disk streams straight to
// the engine instead of failing a half-written put — and request persistent
// storage so the browser won't quietly evict the weights under disk pressure.
const MODEL_CACHE_NAME = "litert-model-weights";

export type WeightsPhase = "download" | "cache-read";
type WeightsProgress = (received: number, total: number, phase: WeightsPhase) => void;

function countBytes(
  body: ReadableStream<Uint8Array>,
  total: number,
  phase: WeightsPhase,
  onProgress: WeightsProgress,
): ReadableStream<Uint8Array> {
  let received = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength;
        onProgress(received, total, phase);
        controller.enqueue(chunk);
      },
    }),
  );
}

async function fetchModelWeights(
  url: string,
  onProgress: WeightsProgress,
): Promise<{ body: ReadableStream<Uint8Array>; fromCache: boolean }> {
  let cache: Cache | null = null;
  try {
    cache = await caches.open(MODEL_CACHE_NAME);
  } catch {
    // Cache Storage unavailable (some private-browsing modes) — plain fetch.
  }

  const hit = await cache?.match(url);
  if (hit?.body) {
    const total = Number(hit.headers.get("content-length")) || 0;
    return { body: countBytes(hit.body, total, "cache-read", onProgress), fromCache: true };
  }

  const download = async (): Promise<{ res: Response; total: number }> => {
    const res = await fetch(url);
    if (!res.ok || !res.body) {
      throw new Error(`Model download failed: ${res.status} ${res.statusText}`);
    }
    return { res, total: Number(res.headers.get("content-length")) || 0 };
  };

  const { res, total } = await download();
  const direct = (r: Response, t: number): { body: ReadableStream<Uint8Array>; fromCache: false } => ({
    body: countBytes(r.body!, t, "download", onProgress),
    fromCache: false,
  });
  if (!cache) return direct(res, total);

  // Quota headroom check: skip caching entirely rather than fail a
  // half-written multi-GB put. 1.2× covers Cache Storage bookkeeping overhead.
  try {
    const est = await navigator.storage?.estimate?.();
    if (total > 0 && est?.quota != null && est.usage != null && est.quota - est.usage < total * 1.2) {
      return direct(res, total);
    }
  } catch {
    // estimate() unavailable — attempt the put and rely on the catch below.
  }
  // Best-effort: granted silently by Chromium heuristics, prompts on Firefox.
  // Without it the weights are still cached, just evictable under pressure.
  void navigator.storage?.persist?.().catch(() => {});

  try {
    await cache.put(
      url,
      new Response(countBytes(res.body!, total, "download", onProgress), {
        headers: {
          "content-type": res.headers.get("content-type") ?? "application/octet-stream",
          ...(total > 0 ? { "content-length": String(total) } : {}),
        },
      }),
    );
    const stored = await cache.match(url);
    if (stored?.body) {
      return { body: countBytes(stored.body, total, "cache-read", onProgress), fromCache: false };
    }
  } catch {
    // A failed streaming put never commits a partial entry, so there is
    // nothing to clean up — and deleting here could race away a valid entry
    // another tab just committed for the same URL.
  }
  // The put consumed the first response's body — re-download straight to the
  // engine so a quota failure costs a retry, never the load.
  const retry = await download();
  return direct(retry.res, retry.total);
}

// ── Persona SSE wire ────────────────────────────────────────────────────────

const encoder = new TextEncoder();
const iso = (): string => new Date().toISOString();
const uid = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`;

interface SSESender {
  send(event: string, payload: Record<string, unknown>): void;
}

/** Build a streaming SSE Response and run `handler` against a writer. */
function sseResponse(
  executionId: string,
  handler: (send: SSESender) => Promise<void>,
): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let seq = 0;
      const send: SSESender = {
        send(event, payload) {
          controller.enqueue(
            encoder.encode(
              `event: ${event}\ndata: ${JSON.stringify({ type: event, seq: seq++, ...payload })}\n\n`,
            ),
          );
        },
      };
      try {
        await handler(send);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // A throw is a terminal failure → execution_error (the bridge maps it
        // to a non-recoverable agent_error). Unified `error` is the non-terminal
        // frame, so it's the wrong one for an uncaught throw.
        send.send("execution_error", { executionId, kind: "agent", error: { message } });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}

// ── Widget payload shapes (the bits we read) ────────────────────────────────

interface DispatchClientTool {
  name: string;
  description?: string;
  parametersSchema?: Record<string, unknown>;
  origin?: string;
}
interface DispatchBody {
  messages?: Array<{ role: string; content: unknown }>;
  clientTools?: DispatchClientTool[];
  context?: Record<string, unknown>;
  inputs?: Record<string, unknown>;
}
interface ResumeBody {
  executionId?: string;
  toolOutputs?: Record<string, unknown>;
}
interface WebMcpToolResult {
  content?: Array<{ type?: string; text?: string } & Record<string, unknown>>;
  structuredContent?: unknown;
  isError?: boolean;
}

// ── Durable paused-run record (what we persist to the resume store) ─────────
// Fully JSON-serializable: the live LiteRT conversation is NOT stored — we
// rebuild it from this transcript when the warm cache is gone (e.g. a reload).

interface PausedRecord {
  /** System turn content (instructions + frozen page context from dispatch). */
  systemContent: string;
  /** Tool surface for this run (the widget omits clientTools on /resume). */
  tools: LiteRtTool[];
  /** Committed transcript WITHOUT the system turn: user / assistant / tool. */
  messages: LiteRtMessage[];
  /** Tool calls awaiting outputs, keyed for the widget's batched /resume. */
  pending: Array<{ toolCallId: string; toolName: string }>;
  /** 1-based reasoning-turn index; advances on each resume. */
  iteration: number;
  /** Signatures (name+args) of tool calls already run this run — loop guard. */
  seenCalls: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function flattenContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        part && typeof part === "object" && "text" in part
          ? String((part as { text?: unknown }).text ?? "")
          : "",
      )
      .join("");
  }
  return "";
}

/**
 * WebMCP tool descriptors → LiteRT-LM `Preface.tools`. The runtime's Gemma
 * template reads `tool['function']['name']`, so each tool is the OpenAI-style
 * wrapped shape `{type:'function', function:{name, description, parameters}}`.
 */
function toLiteRtTools(clientTools: DispatchClientTool[]): LiteRtTool[] {
  return clientTools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: (t.parametersSchema as LiteRtToolParameters) ?? {
        type: "object",
        properties: {},
      },
    },
  }));
}

/**
 * Render the prior conversation into the first user message. The widget re-sends
 * full history every dispatch; the latest user message is the live request and
 * earlier turns are context.
 */
function buildUserPrompt(messages: Array<{ role: string; content: unknown }>): string {
  const chat = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, text: flattenContent(m.content).trim() }))
    .filter((m) => m.text);
  if (chat.length === 0) return "";
  const last = chat[chat.length - 1];
  const prior = chat.slice(0, -1);
  if (prior.length === 0) return last.text;
  const transcript = prior
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`)
    .join("\n");
  return `Conversation so far:\n${transcript}\n\nCurrent request:\n${last.text}`;
}

const systemMessage = (content: string): LiteRtMessage => ({ role: "system", content });

/**
 * WebMCP result → the object we hand back to the model as a tool_response.
 * Non-text content blocks (image snapshots, audio) are summarized, never
 * inlined: JSON.stringify-ing a base64 image block would dump hundreds of KB
 * into an 8k-token context and kill the run. This engine's tool loop is
 * text-only; tools that produce media should say so in words.
 */
function toToolResponse(raw: unknown): Record<string, unknown> {
  const result = raw as WebMcpToolResult | string | undefined;
  if (typeof result === "string") return { result };
  if (result?.structuredContent && typeof result.structuredContent === "object") {
    return result.structuredContent as Record<string, unknown>;
  }
  const text =
    result?.content
      ?.map((c) => {
        if (c?.type === "text") return c.text ?? "";
        if (c?.type === "image" || c?.type === "audio") {
          return `[${c.type} content omitted — the on-device model in this demo reads text only]`;
        }
        return JSON.stringify(c);
      })
      .join("\n") ?? JSON.stringify(result ?? null);
  return result?.isError ? { error: text } : { result: text };
}

// ── Engine ────────────────────────────────────────────────────────────────────

export interface LiteRtPersonaEngine {
  readonly apiPath: string;
  loadModel(modelId: ModelId): Promise<void>;
  isLoaded(): boolean;
  loadedModelId(): ModelId | null;
  /** Active tool scope — which slice of the page's WebMCP tools the model sees. */
  getToolScope(): ToolScope;
  /** Swap the tool scope for subsequent dispatches (paused runs keep their own). */
  setToolScope(scope: ToolScope): void;
  uninstall(): void;
}

interface TurnInput {
  systemContent: string;
  tools: LiteRtTool[];
  /** Committed history (no system turn), excluding `nextMessage`. */
  priorMessages: LiteRtMessage[];
  /** The new turn to send this round: the user prompt, or the tool responses. */
  nextMessage: LiteRtMessage;
  iteration: number;
  /** Tool-call signatures already run this run (carried across resumes). */
  seenCalls: string[];
}

export function createLiteRtPersonaEngine(options: {
  /** The fake dispatch URL the widget posts to (e.g. "/litert/dispatch"). */
  apiPath: string;
  /**
   * Build the run's single system turn: the demo's instructions plus whatever
   * page context the widget rode along (contextProviders land in `ctx`).
   * Per Gemma 4's prompt-formatting guidance, ALL system instructions must be
   * consolidated into one system turn (the runtime appends the tool
   * declarations to that same turn), so return everything in one string.
   */
  buildSystemContent: (ctx: Record<string, unknown>) => string;
  onMetric?: MetricSink;
  /** Initial tool scope (default "core" — a snappier on-device first run). */
  toolScope?: ToolScope;
  /** Allowlist of tool names exposed in "core" scope. */
  coreToolNames: readonly string[];
  /**
   * Pre-pay the one-time first-turn init (GPU weight conversion + shader compile
   * + data-processor build, ~minutes on Apple Metal) by running a tiny throwaway
   * generation right after the weights load, so the user's first real prompt is
   * fast. Default true. The "Loading…" phase already reads as busy, so this is
   * the natural place to absorb the cost. Set false to load lazily.
   */
  warmUpOnLoad?: boolean;
}): LiteRtPersonaEngine {
  const { apiPath, buildSystemContent } = options;
  const metric: MetricSink = options.onMetric ?? (() => {});
  const coreToolNames = new Set(options.coreToolNames);
  const warmUpOnLoad = options.warmUpOnLoad ?? true;
  let toolScope: ToolScope = options.toolScope ?? "core";

  let engine: LiteRtEngine | null = null;
  let loadedModel: ModelId | null = null;
  let loadPromise: Promise<void> | null = null;

  // Durable resume state (the "server" datastore). Source of truth on /resume.
  const store: ResumeStore<PausedRecord> = createResumeStore<PausedRecord>();
  // Same-session warm-KV cache: reuse a live conversation so we skip re-prefill.
  // Purely an optimization — correctness rides entirely on `store`.
  const liveConversations = new Map<string, LiteRtConversation>();

  async function loadModel(modelId: ModelId): Promise<void> {
    if (loadedModel === modelId && engine) return;
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
      const info = MODELS[modelId];
      metric({ type: "load_start", modelId });
      const startedAt = performance.now();
      try {
        const mod = (await import(
          /* @vite-ignore */ `https://cdn.jsdelivr.net/npm/@litert-lm/core@${LITERT_VERSION}/+esm`
        )) as unknown as LiteRtModule;

        // Stream the weights into the runtime with live progress instead of
        // buffering the whole file: EngineSettings.model accepts a
        // ReadableStream. Cache Storage first, network on a miss (a cold load
        // reports a slow "download" pass, then a fast "cache-read" pass as the
        // committed entry streams off disk into the engine).
        const { body: progressStream, fromCache } = await fetchModelWeights(
          info.url,
          (received, total, phase) => metric({ type: "load_progress", received, total, phase }),
        );

        // Tear down any previous engine + warm conversations before swapping.
        if (engine) {
          for (const conv of liveConversations.values()) await conv.delete().catch(() => {});
          liveConversations.clear();
          await engine.delete().catch(() => {});
          engine = null;
          loadedModel = null;
        }

        engine = await mod.Engine.create({
          model: progressStream,
          mainExecutorSettings: { maxNumTokens: MAX_NUM_TOKENS },
        });
        loadedModel = modelId;
        metric({
          type: "load_ready",
          modelId,
          loadMs: Math.round(performance.now() - startedAt),
          fromCache,
        });
        if (warmUpOnLoad) await warmUp(modelId);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        metric({ type: "load_error", message });
        throw err;
      } finally {
        loadPromise = null;
      }
    })();
    return loadPromise;
  }

  /**
   * Pre-pay the first-turn init cost. The very first generation after a fresh
   * engine triggers GPU weight conversion, uncached shader compilation, and the
   * Gemma data-processor build — minutes on Apple Metal. We absorb that here,
   * during the explicit "Loading…" phase, with a tiny no-tools prompt so the
   * user's first real turn is fast. Best-effort: a warm-up failure must not block
   * a model that otherwise loaded, so we swallow errors.
   */
  async function warmUp(modelId: ModelId): Promise<void> {
    if (!engine) return;
    const startedAt = performance.now();
    metric({ type: "warmup_start", modelId });
    try {
      const conversation = await engine.createConversation({
        sessionConfig: { samplerParams: { temperature: TEMPERATURE } },
        enableConstrainedDecoding: false,
      });
      try {
        const stream = conversation.sendMessageStreaming({
          role: "user",
          content: "Reply with the single word: ready.",
        });
        const reader = stream.getReader();
        try {
          for (;;) {
            const { done } = await reader.read();
            if (done) break;
          }
        } finally {
          reader.releaseLock();
        }
      } finally {
        await conversation.delete().catch(() => {});
      }
      metric({ type: "warmup_done", modelId, ms: Math.round(performance.now() - startedAt) });
    } catch {
      // Swallow: the model is loaded; the first real turn just pays the init then.
      metric({ type: "warmup_done", modelId, ms: Math.round(performance.now() - startedAt) });
    }
  }

  /**
   * Get the conversation for this run. Reuse the warm one if it's still in this
   * session (KV cache intact); otherwise rebuild it from the stored transcript
   * by seeding `Preface.messages` — the stateless-server path that also covers
   * a page reload mid-tool-loop.
   */
  async function acquireConversation(
    executionId: string,
    systemContent: string,
    tools: LiteRtTool[],
    priorMessages: LiteRtMessage[],
  ): Promise<LiteRtConversation> {
    if (!engine) throw new Error("Model not loaded.");
    const warm = liveConversations.get(executionId);
    if (warm) return warm;
    const conversation = await engine.createConversation({
      preface: { messages: [systemMessage(systemContent), ...priorMessages], tools },
      // Prefill the rebuilt history so the model has the prior turns + tool calls.
      prefillPrefaceOnInit: priorMessages.length > 0,
      sessionConfig: { samplerParams: { temperature: TEMPERATURE } },
      // Constrained decoding builds a grammar from every tool schema up front;
      // with 17 rich slide-tool schemas that compilation stalls the first turn.
      // Gemma 4 is trained to emit valid tool calls, so leave it off.
      enableConstrainedDecoding: false,
    });
    liveConversations.set(executionId, conversation);
    return conversation;
  }

  /**
   * Run one model turn: stream text as `text_delta`, then either pause on the
   * model's tool calls (persist the run, emit an `await` per call) or finalize.
   */
  async function runTurn(send: SSESender, executionId: string, input: TurnInput): Promise<void> {
    const turnId = uid("turn");
    send.send("turn_start", { executionId, id: turnId, iteration: input.iteration });

    const conversation = await acquireConversation(
      executionId,
      input.systemContent,
      input.tools,
      input.priorMessages,
    );

    let textBlockId: string | null = null;
    let assistantText = "";
    let tokenApprox = 0;
    let firstTokenAt: number | null = null;
    const startedAt = performance.now();
    const toolCalls: LiteRtToolCall[] = [];

    const stream = conversation.sendMessageStreaming(input.nextMessage);
    const reader = stream.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        // Capture structured tool calls (already parsed by the runtime).
        if (value.tool_calls?.length) {
          toolCalls.length = 0;
          toolCalls.push(...value.tool_calls);
        }
        // Stream the visible assistant text. Thoughts (if thinking mode were on)
        // arrive on `channels`, not here.
        const delta =
          typeof value.content === "string"
            ? value.content
            : (value.content ?? [])
                .map((c) => (c.type === "text" ? (c.text ?? "") : ""))
                .join("");
        if (delta) {
          assistantText += delta;
          if (firstTokenAt === null) {
            firstTokenAt = performance.now();
            metric({ type: "ttft", ms: Math.round(firstTokenAt - startedAt) });
          }
          tokenApprox += Math.max(1, Math.round(delta.length / 4));
          if (textBlockId === null) {
            textBlockId = uid("text");
            send.send("text_start", { executionId, id: textBlockId });
          }
          send.send("text_delta", { executionId, id: textBlockId, delta, iteration: input.iteration });
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (textBlockId !== null) {
      send.send("text_complete", { executionId, id: textBlockId });
    }

    // Fall back to the authoritative history if the stream didn't surface the
    // call inline (some runtime builds only attach tool_calls to the committed
    // message).
    if (toolCalls.length === 0) {
      const history = await conversation.getHistory();
      const lastAssistant = [...history]
        .reverse()
        .find((m) => m.role !== "user" && m.tool_calls?.length);
      if (lastAssistant?.tool_calls) toolCalls.push(...lastAssistant.tool_calls);
    }

    const elapsed = Math.round(performance.now() - startedAt);
    metric({
      type: "turn_end",
      tokens: tokenApprox,
      ms: elapsed,
      tokensPerSec: elapsed > 0 ? Math.round((tokenApprox / elapsed) * 1000) : 0,
    });

    // The assistant turn we just generated, committed to the transcript.
    const assistantMessage: LiteRtMessage = {
      role: "assistant",
      ...(assistantText ? { content: assistantText } : {}),
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
    };
    const committed = [...input.priorMessages, input.nextMessage, assistantMessage];

    // Decide whether to pause for tools. Two guards stop a small model that
    // loops on tool calls: a hard round cap, and a repeat filter — re-issuing a
    // call it already ran this turn isn't progress (the result is already in
    // context), so we finish with its answer instead of pausing again.
    const sig = (tc: LiteRtToolCall): string =>
      `${tc.function.name}:${JSON.stringify(tc.function.arguments ?? {})}`;
    const freshCalls = toolCalls.filter((tc) => !input.seenCalls.includes(sig(tc)));
    const pauseForTools = freshCalls.length > 0 && input.iteration <= MAX_TOOL_ROUNDS;

    if (pauseForTools) {
      metric({ type: "tool_calls", names: freshCalls.map((c) => c.function.name) });
      const pending = freshCalls.map((tc) => ({
        toolCallId: uid("call"),
        toolName: tc.function.name,
      }));
      // Persist the run to the durable store BEFORE emitting awaits — once the
      // widget runs the tools it will /resume, and the store must already hold
      // the transcript + tools + pending set (the resume body omits clientTools).
      await store.set(executionId, {
        systemContent: input.systemContent,
        tools: input.tools,
        messages: committed,
        pending,
        iteration: input.iteration,
        seenCalls: [...input.seenCalls, ...freshCalls.map(sig)],
      });
      freshCalls.forEach((tc, i) => {
        const { toolCallId, toolName } = pending[i];
        // `await` carries a BARE tool name + origin:"webmcp"; the widget bridge
        // applies the `webmcp:` prefix, maps it onto the local-tool step_await
        // path, and keys the pause by toolCallId (parallel calls stay distinct).
        send.send("await", {
          executionId,
          toolId: `runtime_webmcp:${toolName}_${toolCallId}`,
          toolName,
          origin: "webmcp",
          toolCallId,
          parameters: tc.function.arguments ?? {},
          awaitedAt: iso(),
        });
      });
      return; // pause: no turn_complete; the widget /resumes with outputs
    }

    // Not pausing. If the model only repeated tools it already ran (or hit the
    // round cap) and gave no prose, emit a short closing line so the turn isn't
    // empty.
    if (toolCalls.length > 0 && !assistantText) {
      const blockId = uid("text");
      send.send("text_start", { executionId, id: blockId });
      send.send("text_delta", {
        executionId,
        id: blockId,
        delta: "Done — let me know what you'd like to change next.",
        iteration: input.iteration,
      });
      send.send("text_complete", { executionId, id: blockId });
    }

    // The run is done. Drop the warm conversation + durable record and close out.
    liveConversations.delete(executionId);
    await conversation.delete().catch(() => {});
    await store.delete(executionId).catch(() => {});
    const completedAt = iso();
    send.send("turn_complete", {
      executionId,
      id: turnId,
      iteration: input.iteration,
      stopReason: "end_turn",
      completedAt,
    });
    send.send("execution_complete", {
      executionId,
      kind: "agent",
      success: true,
      completedAt,
    });
    metric({ type: "run_complete", executionId });
  }

  function handleDispatch(body: DispatchBody): Response {
    const executionId = uid("exec");
    // Trim the page's advertised tools to the active scope. "core" hands the
    // small model a focused island; "all" passes everything through. We filter
    // here (not in the widget) so the scope can flip at runtime without
    // re-registering WebMCP tools. Unknown names fall back to all-pass so a tool
    // rename can't silently empty the surface.
    const advertised = body.clientTools ?? [];
    const scopedTools =
      toolScope === "core"
        ? advertised.filter((t) => coreToolNames.has(t.name))
        : advertised;
    const tools = toLiteRtTools(scopedTools.length > 0 ? scopedTools : advertised);
    const ctx = { ...(body.inputs ?? {}), ...(body.context ?? {}) };
    const systemContent = buildSystemContent(ctx);
    const userPrompt = buildUserPrompt(body.messages ?? []);
    return sseResponse(executionId, async (send) => {
      // A new dispatch supersedes any still-paused runs in this tab (the widget
      // serializes turns), so drop their warm conversations — otherwise an
      // abandoned pause (denied approval, user moved on) pins GPU/KV memory
      // until reload. Correctness is unaffected: a paused run resumed later
      // rebuilds from the durable store.
      for (const [staleId, conv] of liveConversations) {
        liveConversations.delete(staleId);
        void conv.delete().catch(() => {});
      }
      send.send("execution_start", {
        executionId,
        kind: "agent",
        agentId: "litert-gemma",
        agentName: "Gemma (on-device)",
        startedAt: iso(),
      });
      if (!engine) {
        send.send("execution_error", {
          executionId,
          kind: "agent",
          error: { message: "The on-device model is still loading. Try again in a moment." },
        });
        return;
      }
      metric({ type: "turn_start", executionId, phase: "dispatch", iteration: 1, toolCount: tools.length });
      await runTurn(send, executionId, {
        systemContent,
        tools,
        priorMessages: [],
        nextMessage: { role: "user", content: userPrompt },
        iteration: 1,
        seenCalls: [],
      });
    });
  }

  function handleResume(body: ResumeBody): Response {
    const executionId = body.executionId ?? "";
    return sseResponse(executionId, async (send) => {
      const record = await store.get(executionId);
      if (!record) {
        send.send("error", {
          message: `Unknown executionId "${executionId}" (the paused run expired from the resume store).`,
        });
        return;
      }
      if (!engine) {
        // The page reloaded after the model was unloaded: the durable record
        // survived but the engine didn't. Surface it rather than hanging.
        send.send("execution_error", {
          executionId,
          kind: "agent",
          error: { message: "The on-device model isn't loaded — reload it to resume this run." },
        });
        return;
      }
      const outputs = body.toolOutputs ?? {};
      // One tool_response content item per pending call. A batched /resume may
      // omit a call (cancelled or failed on the page); hand the model an explicit
      // error response for the missing one rather than a silent gap.
      const content: LiteRtMessageContentItem[] = record.pending.map((p) => {
        const has = p.toolCallId in outputs || p.toolName in outputs;
        const response = has
          ? toToolResponse(outputs[p.toolCallId] ?? outputs[p.toolName])
          : { error: "No output (the tool call was cancelled or failed)." };
        // The template reads `name` + `response` directly off the content item.
        return { type: "tool_response", name: p.toolName, response };
      });

      metric({
        type: "turn_start",
        executionId,
        phase: "resume",
        iteration: record.iteration + 1,
        toolCount: record.pending.length,
      });
      // Continue the run from the durable transcript (warm conversation if it's
      // still around, else rebuilt from the store), advancing the iteration.
      await runTurn(send, executionId, {
        systemContent: record.systemContent,
        tools: record.tools,
        priorMessages: record.messages,
        nextMessage: { role: "tool", content },
        iteration: record.iteration + 1,
        seenCalls: record.seenCalls ?? [],
      });
    });
  }

  // ── window.fetch interception ─────────────────────────────────────────────

  const dispatchPath = new URL(apiPath, location.href).pathname;
  const resumePath = `${dispatchPath.replace(/\/+$/, "")}/resume`;
  const originalFetch = window.fetch.bind(window);

  const matchedRoute = (input: RequestInfo | URL, init?: RequestInit): "dispatch" | "resume" | null => {
    const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (method !== "POST") return null;
    let pathname: string;
    try {
      pathname = new URL(url, location.href).pathname;
    } catch {
      return null;
    }
    if (pathname === resumePath) return "resume";
    if (pathname === dispatchPath) return "dispatch";
    return null;
  };

  const readBody = async (input: RequestInfo | URL, init?: RequestInit): Promise<unknown> => {
    let text = "";
    if (init?.body != null) text = String(init.body);
    else if (input instanceof Request) text = await input.clone().text();
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return {};
    }
  };

  const patchedFetch: typeof window.fetch = async (input, init) => {
    const route = matchedRoute(input, init);
    if (!route) return originalFetch(input, init);
    try {
      const body = await readBody(input, init);
      return route === "resume"
        ? handleResume(body as ResumeBody)
        : handleDispatch(body as DispatchBody);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      metric({ type: "error", message });
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
  };

  window.fetch = patchedFetch;

  return {
    apiPath,
    loadModel,
    isLoaded: () => engine !== null,
    loadedModelId: () => loadedModel,
    getToolScope: () => toolScope,
    setToolScope: (scope: ToolScope) => {
      toolScope = scope;
    },
    uninstall: () => {
      if (window.fetch === patchedFetch) window.fetch = originalFetch;
    },
  };
}
