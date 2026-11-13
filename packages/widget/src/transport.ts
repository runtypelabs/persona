/**
 * The stream transport seam between the session and the wire.
 *
 * Every request that yields a stream (chat dispatch, a tool-output resume, an
 * approval decision, a durable reconnect) passes through
 * {@link PersonaTransport.request}. The default transport calls `next`, which
 * performs the widget's ordinary `fetch` (or the host's `customFetch`), so a
 * widget without a transport behaves exactly as before. A transport returns a
 * `Response` whose body is unified SSE text: either the HTTP response itself
 * or a synthetic one fed from another channel such as a WebSocket. The widget
 * consumes both through the same stream pipeline, so cursor tracking,
 * `parseSSEEvent`, `onSSEEvent`, and checkpoint handling are identical.
 *
 * This module stays in the core bundle and holds only types and the error
 * class. The WebSocket implementation ships in the lazy
 * `@runtypelabs/persona/websocket-transport` chunk.
 */

/** Which widget operation produced the request. */
export type PersonaTransportRequestKind = "dispatch" | "resume" | "approve" | "reconnect";

export type PersonaTransportRequest = {
  kind: PersonaTransportRequestKind;
  /** Absolute or host-relative URL the default HTTP transport would call. */
  url: string;
  /** `fetch` init (method, headers, JSON `body`, abort `signal`). */
  init: RequestInit;
  /** Parsed JSON body, when the request has one. */
  body?: Record<string, unknown>;
  /** Durable execution this request addresses (resume, approve, reconnect). */
  executionId?: string;
  /** Reconnect only: replay strictly after this SSE `id:` cursor. */
  after?: string;
};

/** Performs the default HTTP request (honoring `customFetch`). */
export type PersonaTransportNext = (request: PersonaTransportRequest) => Promise<Response>;

/** Why the widget asks the transport to get ready ahead of a request. */
export type PersonaTransportWarmReason = "intent" | "open" | "resume" | "visible";

export interface PersonaTransport {
  /**
   * Produce the stream for one request. Return `next(request)` (possibly with
   * a modified request) to use HTTP, or a `Response` with a
   * `text/event-stream` body fed from elsewhere. Reject with a
   * {@link PersonaTransportError} for failures the widget should report.
   */
  request(request: PersonaTransportRequest, next: PersonaTransportNext): Promise<Response>;
  /** Optional: connect ahead of the first request (an intent signal). */
  warm?(reason: PersonaTransportWarmReason): void;
  /** Optional: release sockets, timers, and listeners. */
  destroy?(): void;
}

/** Normalized transport failure codes; branch on these, never on HTTP status. */
export type PersonaTransportErrorCode =
  /** The channel could not be opened or was lost and could not be restored. */
  | "unavailable"
  /** Credentials were rejected; the session must re-initialize. */
  | "unauthorized"
  /** The backend refused this channel for the session (do not retry it). */
  | "disabled"
  | "rate_limited"
  /** An inbound message could not be decoded or broke the protocol. */
  | "protocol"
  /** The backend reported an error for one stream. */
  | "stream_error"
  | "aborted";

export class PersonaTransportError extends Error {
  readonly code: PersonaTransportErrorCode;
  /** True when the same request may succeed later on the same transport. */
  readonly retryable: boolean;
  constructor(code: PersonaTransportErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "PersonaTransportError";
    this.code = code;
    this.retryable = retryable;
  }
}
