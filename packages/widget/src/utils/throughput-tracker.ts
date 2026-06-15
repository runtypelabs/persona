// ============================================================================
// Output Throughput Tracker
// ============================================================================
//
// Derives an output tokens-per-second metric from the widget's existing SSE
// event stream, for display in the Events diagnostics screen. This is a passive
// consumer: it never mutates dispatch payloads, never forces debug mode, and
// never changes the wire contract: it only inspects the `(type, payload)`
// events that already flow through the SSE tap.
//
// Throughput is estimated live from visible text deltas while a run streams,
// then prefers exact provider usage (output tokens) when terminal events carry
// it. A run starts when the stream starts (or lazily on the first visible
// delta), stays "running" across intermediate step/turn completions, and only
// finalizes on terminal `flow_complete` / `agent_complete`. Stream errors mark
// the metric unavailable rather than leaving it stuck "running".

export type ThroughputMetricStatus = "idle" | "running" | "complete" | "error";

export type ThroughputMetricSource = "usage" | "estimate";

export interface ThroughputMetric {
  status: ThroughputMetricStatus;
  /** Output tokens per second, when computable. */
  tokensPerSecond?: number;
  /** Output tokens counted/estimated for the run. */
  outputTokens?: number;
  /** Duration window the rate was computed over (ms). */
  durationMs?: number;
  /** Whether `outputTokens` came from provider usage or a text estimate. */
  source?: ThroughputMetricSource;
}

interface ThroughputRunStats {
  startedAt: number;
  firstDeltaAt?: number;
  /**
   * Running character count of accumulated visible text, estimated via the
   * ~4 chars/token heuristic. Tracked as a counter (not the concatenated
   * string) so the estimate stays O(1) per delta over a long stream.
   */
  visibleCharCount: number;
  exactOutputTokens: number;
}

// Below this streamed window we don't trust the rate; fall back to provider
// execution time or whole-request duration instead.
const THROUGHPUT_MIN_DURATION_MS = 250;

// Request-level lifecycle events: each marks the beginning of a NEW request.
// The SSE tap fires for every payload type regardless of whether the client has
// a handler for it, so any of these that the server emits starts the run with
// an accurate `startedAt` (capturing time-to-first-token). These RESET any run
// already in progress, so a prior stream that ended without a terminal/error
// frame (e.g. `session.cancel()`) doesn't bleed its tokens into the next one.
const REQUEST_START_EVENTS = new Set([
  "flow_start",
  "flow_run_start",
  "agent_start",
  "dispatch_start",
  "run_start",
]);

// Per-step markers that fire repeatedly WITHIN a single request (a flow emits
// one per step). These only lazily begin a run: they must never reset, or a
// multi-step response would restart the metric between steps. If no request- or
// step-start event is emitted, the first visible delta lazily starts the run.
const STEP_START_EVENTS = new Set(["step_start", "execution_start"]);

const VISIBLE_DELTA_EVENTS = new Set([
  "step_delta",
  "step_chunk",
  "chunk",
  "agent_turn_delta",
]);

const INTERMEDIATE_COMPLETE_EVENTS = new Set([
  "step_complete",
  "agent_turn_complete",
]);

const TERMINAL_COMPLETE_EVENTS = new Set(["flow_complete", "agent_complete"]);

const ERROR_EVENTS = new Set([
  "step_error",
  "flow_error",
  "agent_error",
  "dispatch_error",
  "error",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toFiniteNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const getRecord = (
  value: Record<string, unknown>,
  key: string
): Record<string, unknown> | undefined => {
  const nested = value[key];
  return isRecord(nested) ? nested : undefined;
};

/** Token estimate from a character count: ~4 chars/token, floor of 1. */
function estimateTokensFromCharCount(charCount: number): number {
  return charCount > 0 ? Math.max(1, Math.ceil(charCount / 4)) : 0;
}

/** Simple token estimate matching the dashboard heuristic: ~4 chars/token. */
export function estimateOutputTokens(text: string): number {
  return estimateTokensFromCharCount(text.trim().length);
}

function calculateTokensPerSecond(
  outputTokens: number,
  durationMs: number | undefined
): number | undefined {
  if (
    outputTokens <= 0 ||
    durationMs === undefined ||
    durationMs < THROUGHPUT_MIN_DURATION_MS
  ) {
    return undefined;
  }
  return outputTokens / (durationMs / 1000);
}

function resolveEventType(
  eventType: string,
  payload: Record<string, unknown>
): string {
  return typeof payload.type === "string" ? payload.type : eventType;
}

function getTextDelta(payload: Record<string, unknown>): string {
  if (typeof payload.text === "string") return payload.text;
  if (typeof payload.delta === "string") return payload.delta;
  if (typeof payload.content === "string") return payload.content;
  if (typeof payload.chunk === "string") return payload.chunk;
  return "";
}

/**
 * Only count visible model output.
 *
 * For `agent_turn_delta`, count only a contentType of exactly `text` as
 * visible, matching the client renderer (which appends streaming assistant
 * text only when `contentType === "text"`); `thinking`, `tool_input`, any
 * other value, and a missing contentType are ignored so throughput never
 * includes deltas the chat UI doesn't render.
 *
 * For `step_delta` / `step_chunk`, skip tool and context steps: those carry
 * tool I/O, not model-visible text: mirroring the widget's own renderer.
 */
function isVisibleTextDelta(
  type: string,
  payload: Record<string, unknown>
): boolean {
  if (type === "step_delta" || type === "step_chunk") {
    return payload.stepType !== "tool" && payload.executionType !== "context";
  }

  if (type !== "agent_turn_delta") return true;

  const contentType =
    typeof payload.contentType === "string"
      ? payload.contentType
      : typeof payload.content_type === "string"
        ? payload.content_type
        : undefined;

  return contentType === "text";
}

/** Extract exact output tokens from a variety of usage payload shapes. */
function getOutputTokens(payload: Record<string, unknown>): number | undefined {
  const result = getRecord(payload, "result");
  const candidates = [
    getRecord(payload, "tokens"),
    getRecord(payload, "totalTokens"),
    result ? getRecord(result, "tokens") : undefined,
    getRecord(payload, "usage"),
    result ? getRecord(result, "usage") : undefined,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const outputTokens =
      toFiniteNumber(candidate.output) ??
      toFiniteNumber(candidate.outputTokens) ??
      toFiniteNumber(candidate.completionTokens);
    if (outputTokens !== undefined) return outputTokens;
  }

  return (
    toFiniteNumber(payload.outputTokens) ??
    toFiniteNumber(payload.completionTokens) ??
    (result
      ? (toFiniteNumber(result.outputTokens) ??
        toFiniteNumber(result.completionTokens))
      : undefined)
  );
}

/** Extract provider execution time (ms) from a variety of payload shapes. */
function getExecutionTimeMs(
  payload: Record<string, unknown>
): number | undefined {
  const result = getRecord(payload, "result");
  return (
    toFiniteNumber(payload.executionTime) ??
    toFiniteNumber(payload.executionTimeMs) ??
    toFiniteNumber(payload.execution_time) ??
    toFiniteNumber(payload.duration) ??
    (result
      ? (toFiniteNumber(result.executionTime) ??
        toFiniteNumber(result.executionTimeMs))
      : undefined)
  );
}

function defaultClock(): number {
  if (
    typeof performance !== "undefined" &&
    typeof performance.now === "function"
  ) {
    return performance.now();
  }
  return Date.now();
}

/**
 * Tracks output throughput across one streamed run at a time. Feed it every SSE
 * event via {@link processEvent}; read the current state via {@link getMetric}.
 */
export class ThroughputTracker {
  private metric: ThroughputMetric = { status: "idle" };
  private run: ThroughputRunStats | null = null;
  private readonly now: () => number;

  constructor(now: () => number = defaultClock) {
    this.now = now;
  }

  getMetric(): ThroughputMetric {
    // While a run is streaming, recompute the elapsed window (and rate) from the
    // clock on each read. The view polls this every ~200ms, so without this a
    // pause between deltas would keep showing the stale rate from the last
    // event; recomputing lets the displayed tok/s decay as time passes.
    const run = this.run;
    if (
      run &&
      this.metric.status === "running" &&
      run.firstDeltaAt !== undefined &&
      this.metric.outputTokens !== undefined
    ) {
      const durationMs = this.now() - run.firstDeltaAt;
      return {
        ...this.metric,
        durationMs,
        tokensPerSecond: calculateTokensPerSecond(
          this.metric.outputTokens,
          durationMs
        ),
      };
    }
    return this.metric;
  }

  /** Reset back to idle (e.g. when the chat is cleared). */
  reset(): void {
    this.run = null;
    this.metric = { status: "idle" };
  }

  private startRun(now: number): void {
    this.run = {
      startedAt: now,
      visibleCharCount: 0,
      exactOutputTokens: 0,
    };
    this.metric = { status: "running" };
  }

  processEvent(eventType: string, payload: unknown): void {
    if (!isRecord(payload)) {
      // Non-object payloads can still signal lifecycle (e.g. bare "error").
      if (ERROR_EVENTS.has(eventType) && this.run) {
        this.run = null;
        this.metric = { status: "error" };
      }
      return;
    }

    const type = resolveEventType(eventType, payload);
    const now = this.now();

    if (REQUEST_START_EVENTS.has(type)) {
      // New request: start fresh, discarding any incomplete prior run.
      this.startRun(now);
      return;
    }

    if (STEP_START_EVENTS.has(type)) {
      // Mid-request step marker: only begin a run if none is active.
      if (!this.run) this.startRun(now);
      return;
    }

    if (VISIBLE_DELTA_EVENTS.has(type)) {
      if (!isVisibleTextDelta(type, payload)) return;
      const text = getTextDelta(payload);
      if (!text) return;

      // Lazily start a run if the stream began without a recognized start event.
      if (!this.run) this.startRun(now);
      const stats = this.run!;

      stats.firstDeltaAt ??= now;
      stats.visibleCharCount += text.length;

      // Add the live char estimate of the CURRENT (not-yet-completed) step on
      // top of any exact usage already booked from completed steps, so the
      // count only grows: it never drops back to a bare estimate mid-run.
      const outputTokens =
        stats.exactOutputTokens +
        estimateTokensFromCharCount(stats.visibleCharCount);
      const durationMs = now - stats.firstDeltaAt;
      this.metric = {
        status: "running",
        tokensPerSecond: calculateTokensPerSecond(outputTokens, durationMs),
        outputTokens,
        durationMs,
        source: stats.exactOutputTokens > 0 ? "usage" : "estimate",
      };
      return;
    }

    if (INTERMEDIATE_COMPLETE_EVENTS.has(type)) {
      // Accumulate exact usage but keep the run going: these fire per
      // step/turn, not at the end of the whole run.
      if (!this.run) return;
      const stats = this.run;
      const exact = getOutputTokens(payload);
      if (exact !== undefined) {
        stats.exactOutputTokens += exact;
        // This step's visible text is now represented exactly by provider
        // usage: drop it from the running char estimate so the two don't
        // double-count once the next step starts streaming.
        stats.visibleCharCount = 0;
      }

      const usingExact = stats.exactOutputTokens > 0;
      const outputTokens =
        stats.exactOutputTokens +
        estimateTokensFromCharCount(stats.visibleCharCount);
      const durationMs = this.resolveDuration(stats, payload, now);
      this.metric = {
        status: "running",
        tokensPerSecond: calculateTokensPerSecond(outputTokens, durationMs),
        outputTokens,
        durationMs,
        source: usingExact ? "usage" : "estimate",
      };
      return;
    }

    if (TERMINAL_COMPLETE_EVENTS.has(type)) {
      if (!this.run) return;
      const stats = this.run;
      // Prefer exact output tokens from this terminal event, else accumulated
      // usage from intermediate completes, else the text estimate.
      const terminalExact = getOutputTokens(payload);
      // Prefer a total from the terminal event; otherwise sum exact usage booked
      // from intermediate completes plus the estimate of any still-streamed text
      // not yet covered by a usage report.
      const outputTokens =
        terminalExact ??
        stats.exactOutputTokens +
          estimateTokensFromCharCount(stats.visibleCharCount);
      const source: ThroughputMetricSource =
        terminalExact !== undefined || stats.exactOutputTokens > 0
          ? "usage"
          : "estimate";
      const durationMs = this.resolveDuration(stats, payload, now);
      this.metric = {
        status: "complete",
        tokensPerSecond: calculateTokensPerSecond(outputTokens, durationMs),
        outputTokens,
        durationMs,
        source,
      };
      this.run = null;
      return;
    }

    if (ERROR_EVENTS.has(type)) {
      if (!this.run) return;
      this.run = null;
      this.metric = { status: "error" };
    }
  }

  /**
   * Prefer the streamed visible-output window when it clears the minimum
   * threshold; otherwise fall back to provider execution time, then to the
   * whole-request duration.
   */
  private resolveDuration(
    stats: ThroughputRunStats,
    payload: Record<string, unknown>,
    now: number
  ): number {
    const streamedDurationMs =
      stats.firstDeltaAt !== undefined ? now - stats.firstDeltaAt : undefined;
    if (
      streamedDurationMs !== undefined &&
      streamedDurationMs >= THROUGHPUT_MIN_DURATION_MS
    ) {
      return streamedDurationMs;
    }
    const executionTimeMs = getExecutionTimeMs(payload);
    return executionTimeMs ?? now - stats.startedAt;
  }
}
