/**
 * Approval decisions and LOCAL-tool resumes for `AgentWidgetClient`. Only
 * the approval / ask-user-question / WebMCP resolve paths (themselves in the
 * lazy `session-actions` chunk) call these, so the IIFE/CDN build ships them
 * in the lazy `client-stream.js` chunk; the client's public methods keep
 * their signatures and delegate here through a `ClientResumeHost`.
 */
import type {
  AgentWidgetConfig,
  AgentWidgetHeadersFunction,
  ClientChatRequest,
  ClientSession,
  ClientToolDefinition
} from "./types";
import type { WebMcpBridge } from "./webmcp-runtime-entry";
import { builtInClientToolsForDispatch } from "./ask-user-question-tool";
import { DEFAULT_CLIENT_API_BASE } from "./utils/constants";

export type ClientResumeHost = {
  readonly config: AgentWidgetConfig;
  readonly headers: Record<string, string>;
  readonly getHeaders?: AgentWidgetHeadersFunction;
  readonly debug: boolean;
  clientApiBase(): string;
  getClientApiUrl(endpoint: "init" | "chat" | "resume"): string;
  getWebMcpBridge(): Promise<WebMcpBridge | null>;
  sendWithClientToolsDiff(
    sessionId: string,
    fullClientTools: ClientToolDefinition[] | undefined,
    doFetch: (
      toolFields: Pick<ClientChatRequest, "clientTools" | "clientToolsFingerprint">
    ) => Promise<Response>,
    opts?: { emptyMeansReplace?: boolean }
  ): Promise<{ response: Response; commit: () => void }>;
  initSession(): Promise<ClientSession>;
  readVisitorToken(): Promise<string | null>;
  isClientTokenMode(): boolean;
};

/** See `AgentWidgetClient.resolveApproval`. */
export async function resolveApproval(
  h: ClientResumeHost,
  approval: { agentId: string; executionId: string; approvalId: string },
  decision: "approved" | "denied"
): Promise<Response> {
  let headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...h.headers
  };
  if (h.getHeaders) {
    Object.assign(headers, await h.getHeaders());
  }
  const body = {
    executionId: approval.executionId,
    approvalId: approval.approvalId,
    decision,
    streamResponse: true,
  };
  const post = (path: string, extra?: Record<string, unknown>) =>
    fetch(`${h.clientApiBase()}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...extra, ...body }),
    });
  const ownerRoute = `/v1/agents/${approval.agentId}/approve`;

  if (!h.isClientTokenMode()) return post(ownerRoute);

  // Same re-validation as `resumeFlow`: an approval can sit for a long time.
  const { sessionId } = await h.initSession();
  const response = await post('/v1/client/approve', { sessionId });
  // A core without the route answers with its generic `Not Found`; an unknown
  // or expired pause 404s with its own error, which the caller surfaces.
  if (response.status === 404) {
    const data = (await response.clone().json().catch(() => null)) as { error?: string } | null;
    if (!data || data.error === 'Not Found') return post(ownerRoute);
  }
  return response;
}

/** See `AgentWidgetClient.resumeFlow`. */
export async function resumeFlow(
  h: ClientResumeHost,
  executionId: string,
  toolOutputs: Record<string, unknown>,
  options?: { streamResponse?: boolean; signal?: AbortSignal; after?: string }
): Promise<Response> {
  const isClientToken = h.isClientTokenMode();
  const url = isClientToken
    ? h.getClientApiUrl('resume')
    : `${h.config.apiUrl?.replace(/\/+$/, '') || DEFAULT_CLIENT_API_BASE}/resume`;

  // The client-token resume route authenticates the session, not a Bearer
  // key. A WebMCP approval can sit awaiting user input for a long time, so by
  // the time we resume the original session may have expired. Re-validate (and
  // silently re-init if needed) via initSession(): which returns the live
  // session when `new Date() < expiresAt`, else mints a fresh one: instead of
  // trusting the possibly-stale `this.clientSession`. (core#3889; BugBot
  // PR #214 r3367875360.)
  let resumeSessionId: string | undefined;
  let resumeVisitorToken: string | null = null;
  if (isClientToken) {
    const session = await h.initSession();
    resumeSessionId = session.sessionId;
    if (session.durableRecovery?.enabled === true) {
      resumeVisitorToken = await h.readVisitorToken();
    }
  }

  let headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(resumeVisitorToken ? { 'X-Visitor-Token': resumeVisitorToken } : {}),
    ...h.headers
  };
  if (h.getHeaders) {
    Object.assign(headers, await h.getHeaders());
  }

  const body: Record<string, unknown> = {
    executionId,
    toolOutputs,
    streamResponse: options?.streamResponse ?? true,
    ...(options?.after ? { after: options.after } : {}),
  };
  // Thread the (refreshed) sessionId through like `/v1/client/chat` does.
  if (resumeSessionId) {
    body.sessionId = resumeSessionId;
  }

  if (isClientToken && resumeSessionId) {
    // Mid-run WebMCP tool refresh (runtypelabs/core#5361): the paused tool
    // may have navigated the page, so the dispatch-time snapshot the server
    // persisted can be stale. Re-snapshot the registry — the same built-in +
    // bridge composition as the payload builders, so fingerprints computed
    // here and on chat turns describe the same tool space — and ship it via
    // the shared diff-only protocol. `emptyMeansReplace` sends an explicit
    // `clientTools: []` when the registry vanished after a non-empty send,
    // so the server replaces the persisted set instead of keeping it frozen.
    const fullClientTools = [
      ...builtInClientToolsForDispatch(h.config),
      ...((await (await h.getWebMcpBridge())?.snapshotForDispatch()) ?? []),
    ];
    const { response, commit } = await h.sendWithClientToolsDiff(
      resumeSessionId,
      fullClientTools,
      (toolFields) => {
        const resumeRequest = { ...body, ...toolFields };
        if (h.debug) {
          // eslint-disable-next-line no-console
          console.debug("[AgentWidgetClient] client token resume", resumeRequest);
        }
        return fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(resumeRequest),
          signal: options?.signal,
        });
      },
      { emptyMeansReplace: true }
    );
    // The server stores the refreshed registry before running the
    // continuation pipeline, so an OK response means it holds this set under
    // this fingerprint. Mirror chat's commit-on-success discipline: a failed
    // resume must not record a fingerprint the server never stored.
    if (response.ok) {
      commit();
    }
    return response;
  }

  return fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: options?.signal,
  });
}
