/**
 * Approval, ask-user-question and WebMCP/suggest-replies resolve paths for
 * `AgentWidgetSession`.
 *
 * Split out of `session.ts` so the IIFE/CDN bundle can ship them as the lazy
 * `session-actions.js` sibling chunk (see `session-actions-loader.ts`).
 * They only run once the agent pauses for an approval or a local tool, and
 * the session prefetches the chunk as soon as such a pause arrives. The
 * session's public methods keep their signatures and delegate here through
 * a host object (`SessionActionsHost`) that exposes the internals they need.
 */
import type { AgentWidgetClient } from "./client";
import {
  SUGGEST_REPLIES_TOOL_NAME,
  suggestRepliesToolResult,
} from "./suggest-replies-tool";
import type {
  AgentWidgetConfig,
  AgentWidgetMessage,
  AgentWidgetApproval,
  AgentWidgetApprovalDecisionOptions,
} from "./types";
import type { SessionCallbacks } from "./session";

/** Session internals the moved paths touch (TS-private fields on the class). */
export type SessionActionsInternals = {
  client: AgentWidgetClient;
  config: AgentWidgetConfig;
  callbacks: SessionCallbacks;
  messages: AgentWidgetMessage[];
  abortController: AbortController | null;
  approvalTokens: Map<string, object>;
  webMcpInflightKeys: Set<string>;
  webMcpResolvedKeys: Set<string>;
  webMcpResolveControllers: Set<AbortController>;
  upsertMessage(message: AgentWidgetMessage): void;
  markAskUserQuestionResolved(
    toolMessage: AgentWidgetMessage,
    answers?: Record<string, string | string[]>
  ): void;
  connectStream(
    stream: ReadableStream<Uint8Array>,
    options?: { allowReentry?: boolean }
  ): Promise<void>;
};

/** Built once per session; wraps the `#private` members the paths need. */
export type SessionActionsHost = {
  s: SessionActionsInternals;
  setStreaming(streaming: boolean): void;
  appendMessage(message: AgentWidgetMessage): void;
  nextSequence(): number;
  settleApprovalPausedToolCall(approvalMessageId: string): void;
  /** `after` cursor for a /resume on this execution (durable streams). */
  resumeAfter(executionId: string): string | undefined;
};

const buildWebMcpErrorResult = (message: string) => ({
  isError: true,
  content: [{ type: "text" as const, text: message }],
});

const getWebMcpErrorMessage = (
  error: unknown,
  fallback = "WebMCP tool execution failed.",
): string => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return fallback;
};

/**
 * Resolve a tool approval request (approve or deny).
 * Updates the approval message status, calls the API (or custom onDecision),
 * and pipes the response stream through connectStream().
 */
export async function resolveApproval(
  h: SessionActionsHost,
  approval: AgentWidgetApproval,
  decision: 'approved' | 'denied',
  options?: AgentWidgetApprovalDecisionOptions
): Promise<void> {
  // 1. Update approval message status immediately for responsive UI
  const approvalMessageId = `approval-${approval.id}`;
  const errorMessageId = `approval-error-${approval.id}`;
  const requestToken = {};
  h.s.approvalTokens.set(approvalMessageId, requestToken);
  const updatedApproval: AgentWidgetApproval = {
    ...approval,
    status: decision,
    resolvedAt: Date.now(),
  };
  // Anchor the bubble where the agent paused for permission. An approval is a
  // timeline checkpoint, not a "now" event, so resolving it must preserve the
  // original message's createdAt/sequence: otherwise sortMessages (which
  // orders by createdAt first) would re-stamp it to now and float it past any
  // message created later (e.g. a long-pending approval resolved after more
  // conversation, or restored/replayed transcripts).
  const existing = h.s.messages.find((m) => m.id === approvalMessageId);
  const updatedMessage: AgentWidgetMessage = {
    id: approvalMessageId,
    role: "assistant",
    content: "",
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    ...(existing?.sequence !== undefined ? { sequence: existing.sequence } : {}),
    streaming: false,
    variant: "approval",
    approval: updatedApproval,
  };
  h.s.upsertMessage(updatedMessage);

  // Show the standalone typing indicator immediately while we wait for the
  // approval round-trip. Install an abortController so cancel() works during
  // the silent gap. See `resolveAskUserQuestion` for the same pattern.
  h.s.abortController?.abort();
  h.s.abortController = new AbortController();
  h.setStreaming(true);

  // 2. Call onDecision callback if provided, otherwise use client.resolveApproval()
  const approvalConfig = h.s.config.approval;
  const onDecision = approvalConfig && typeof approvalConfig === 'object' ? approvalConfig.onDecision : undefined;

  try {
    let response: Response | ReadableStream<Uint8Array> | void;

    if (onDecision) {
      response = await onDecision(
        {
          approvalId: approval.id,
          executionId: approval.executionId,
          agentId: approval.agentId,
          toolName: approval.toolName,
        },
        decision,
        options
      );
    } else {
      response = await h.s.client.resolveApproval(
        {
          agentId: approval.agentId,
          executionId: approval.executionId,
          approvalId: approval.id,
        },
        decision
      );
    }

    // 3. Pipe through connectStream if we got a response with a body
    if (response) {
      let stream: ReadableStream<Uint8Array> | null = null;
      if (response instanceof Response) {
        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          // `message` carries the visitor-facing text when present (e.g.
          // 409 APPROVAL_ALREADY_RESOLVED); 403 APPROVAL_APPROVER_NOT_END_USER
          // puts it in `error`.
          const errorText: string =
            errorData?.message ?? errorData?.error ?? `Approval request failed: ${response.status}`;
          // The decision did not apply, so the card must not claim it did.
          // A pause the server reports as gone (already resolved, or expired
          // / unknown) settles as timed out; anything else returns to
          // pending so the visitor can retry. The notice says why.
          const pauseGone =
            errorData?.code === "APPROVAL_ALREADY_RESOLVED" ||
            (response.status === 404 && /no paused execution/i.test(String(errorData?.error)));
          // Only while the card still holds this request's decision: a
          // newer request (or its approval_complete) may have settled it.
          // The token tells requests apart even within one millisecond.
          const current = h.s.messages.find((m) => m.id === approvalMessageId);
          if (
            h.s.approvalTokens.get(approvalMessageId) === requestToken &&
            current?.approval?.resolvedAt === updatedApproval.resolvedAt
          ) {
            h.s.upsertMessage({
              ...updatedMessage,
              approval: pauseGone ? { ...updatedApproval, status: "timeout" } : approval,
            });
            // A gone pause never resumes, so its tool bubble must not spin.
            if (pauseGone) h.settleApprovalPausedToolCall(approvalMessageId);
            h.s.upsertMessage({
              id: errorMessageId,
              role: "assistant",
              content: errorText,
              createdAt: new Date().toISOString(),
              streaming: false,
              sequence: h.nextSequence(),
            });
          }
          throw new Error(errorText);
        }
        stream = response.body;
      } else if (response instanceof ReadableStream) {
        stream = response;
      }

      // Accepted: a retry that succeeds supersedes the earlier failure notice.
      if (h.s.messages.some((m) => m.id === errorMessageId)) {
        h.s.messages = h.s.messages.filter((m) => m.id !== errorMessageId);
        h.s.callbacks.onMessagesChanged([...h.s.messages]);
      }

      if (stream) {
        await h.s.connectStream(stream, { allowReentry: true });
      } else {
        if (decision === 'denied') {
          // No stream body for denied: inject a denial message, and settle
          // the paused tool bubble since no approval_complete will arrive.
          h.settleApprovalPausedToolCall(approvalMessageId);
          h.appendMessage({
            id: `denial-${approval.id}`,
            role: "assistant",
            content: "Tool execution was denied by user.",
            createdAt: new Date().toISOString(),
            streaming: false,
            sequence: h.nextSequence(),
          });
        }
        // No body to pipe: drop the pre-set streaming flag so the indicator
        // doesn't linger forever.
        h.setStreaming(false);
        h.s.abortController = null;
      }
    } else {
      // onDecision returned void / no response: drop the pre-set flag.
      h.setStreaming(false);
      h.s.abortController = null;
    }
  } catch (error) {
    const isAbortError =
      error instanceof Error &&
      (error.name === 'AbortError' ||
       error.message.includes('aborted') ||
       error.message.includes('abort'));

    h.setStreaming(false);
    h.s.abortController = null;

    if (!isAbortError) {
      h.s.callbacks.onError?.(
        error instanceof Error ? error : new Error(String(error))
      );
    }
  } finally {
    // Settled: only in-flight requests keep a token.
    if (h.s.approvalTokens.get(approvalMessageId) === requestToken) {
      h.s.approvalTokens.delete(approvalMessageId);
    }
  }
}

export async function resolveAskUserQuestion(
  h: SessionActionsHost,
  toolMessage: AgentWidgetMessage,
  answer: string | Record<string, string | string[]>
): Promise<void> {
  // Idempotent: guards against rapid double-clicks on answer pills before
  // the re-render swaps the card to its collapsed/answered state.
  const live = h.s.messages.find((m) => m.id === toolMessage.id);
  if (live?.agentMetadata?.askUserQuestionAnswered === true) return;

  const executionId = toolMessage.agentMetadata?.executionId;
  const toolName = toolMessage.toolCall?.name;
  if (!executionId || !toolName) {
    h.s.callbacks.onError?.(
      new Error(
        "resolveAskUserQuestion: message is missing executionId or toolCall.name"
      )
    );
    return;
  }

  // Flip answered flag first so the next render skips the sheet re-mount,
  // avoiding the race between removeAskUserQuestionSheet's 180ms slide-out
  // timer and the renders that fire as the resume stream lands. Pass the
  // structured answer Record (when present) so it's atomically persisted
  // alongside the flag: the answered-state review card depends on
  // `agentMetadata.askUserQuestionAnswers` being populated at render time.
  //
  // For single-question payloads, callers (built-in pick handler, plugins)
  // resolve with a plain string. Derive a `{ [questionText]: answer }` Record
  // from the toolCall args so the answered-card render path is consistent
  // with grouped flows.
  let structuredAnswers: Record<string, string | string[]> | undefined =
    typeof answer === "string" ? undefined : answer;
  if (structuredAnswers === undefined && typeof answer === "string") {
    const args = toolMessage.toolCall?.args as
      | { questions?: Array<{ question?: unknown }> }
      | undefined;
    const questions = Array.isArray(args?.questions) ? args!.questions : [];
    if (questions.length === 1) {
      const qText = typeof questions[0]?.question === "string"
        ? (questions[0].question as string)
        : "";
      if (qText) structuredAnswers = { [qText]: answer };
    }
  }
  h.s.markAskUserQuestionResolved(toolMessage, structuredAnswers);

  // Show the standalone typing indicator immediately: the network round-trip
  // to /resume is otherwise silent, which reads as broken. The render
  // condition in ui.ts already shows the indicator once streaming flips true
  // and the last message is a user bubble (the answer we inject below).
  // Install an abortController so cancel() works during this silent gap.
  h.s.abortController?.abort();
  h.s.abortController = new AbortController();
  h.setStreaming(true);

  // Inject Q→A pair messages: one assistant bubble per question, one user
  // bubble per answer, so the transcript reads like a normal conversation.
  // The original ask_user_question tool message is suppressed by the
  // renderer once `askUserQuestionAnswered` is true. Skipped questions get
  // a muted italic `*Skipped*` user bubble (rendered through the standard
  // markdown pipeline).
  const toolCallId = toolMessage.toolCall!.id;
  const args = toolMessage.toolCall?.args as
    | { questions?: Array<{ question?: unknown; header?: unknown }> }
    | undefined;
  const questions = Array.isArray(args?.questions) ? args!.questions : [];
  if (questions.length === 0) {
    const fallback =
      typeof answer === "string"
        ? answer
        : Object.entries(answer)
            .map(
              ([q, v]) => `${q}: ${Array.isArray(v) ? v.join(", ") : v}`
            )
            .join(" | ");
    h.appendMessage({
      id: `ask-user-answer-${toolCallId}`,
      role: "user",
      content: fallback,
      createdAt: new Date().toISOString(),
      streaming: false,
      sequence: h.nextSequence(),
    });
  } else {
    const stored = structuredAnswers ?? {};
    questions.forEach((p, i) => {
      const qText = typeof p?.question === "string" ? p.question : "";
      if (!qText) return;
      const ans = stored[qText];
      const answerStr = Array.isArray(ans)
        ? ans.join(", ")
        : typeof ans === "string"
          ? ans
          : "";
      h.appendMessage({
        id: `ask-user-q-${toolCallId}-${i}`,
        role: "assistant",
        content: qText,
        createdAt: new Date().toISOString(),
        streaming: false,
        sequence: h.nextSequence(),
      });
      h.appendMessage({
        id: `ask-user-a-${toolCallId}-${i}`,
        role: "user",
        content: answerStr || "*Skipped*",
        createdAt: new Date().toISOString(),
        streaming: false,
        sequence: h.nextSequence(),
      });
    });
  }

  try {
    const response = await h.s.client.resumeFlow(
      executionId,
      { [toolName]: answer },
      {
        after:
          h.resumeAfter(executionId),
      },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(
        errorData?.error ?? `Resume failed: ${response.status}`
      );
    }

    if (response.body) {
      await h.s.connectStream(response.body, { allowReentry: true });
    } else {
      // No body to pipe: drop the pre-set streaming flag so the indicator
      // doesn't linger forever.
      h.setStreaming(false);
      h.s.abortController = null;
    }
  } catch (error) {
    // Mirror sendMessage: a cancel() during the await aborts the controller
    // and surfaces an AbortError: don't treat that as a real failure.
    const isAbortError =
      error instanceof Error &&
      (error.name === 'AbortError' ||
       error.message.includes('aborted') ||
       error.message.includes('abort'));

    h.setStreaming(false);
    h.s.abortController = null;

    if (!isAbortError) {
      h.s.callbacks.onError?.(
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }
}

function resolveWebMcpToolStartedAt(
  h: SessionActionsHost,
  toolMessage: AgentWidgetMessage,
): number {
  const stored = h.s.messages.find((m) => m.id === toolMessage.id);
  const candidates = [
    stored?.toolCall?.startedAt,
    toolMessage.toolCall?.startedAt,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
  }
  return Date.now();
}

/**
 * Persisted-resolution guard for `suggest_replies`. The in-memory dedupe
 * sets (`webMcpInflightKeys` / `webMcpResolvedKeys`) are cleared by
 * hydrateMessages/clearMessages/cancel, but `suggestRepliesResolved`
 * survives on the stored message, so a stale `await` re-emit after a
 * hydration must not re-POST `/resume` for an already-resolved call (the
 * historical double-resume failure mode the batching work exists to avoid).
 * Checks the LIVE message first; the handleEvent snapshot is a fresh wire
 * skeleton whose metadata never carries the flag.
 */
function isSuggestRepliesAlreadyResolved(
  h: SessionActionsHost,
  toolMessage: AgentWidgetMessage,
): boolean {
  if (toolMessage.toolCall?.name !== SUGGEST_REPLIES_TOOL_NAME) return false;
  const stored = h.s.messages.find((m) => m.id === toolMessage.id);
  return (
    (stored ?? toolMessage).agentMetadata?.suggestRepliesResolved === true
  );
}

function markWebMcpToolRunning(
  h: SessionActionsHost,
  toolMessage: AgentWidgetMessage,
): number {
  const startedAt = resolveWebMcpToolStartedAt(h, toolMessage);
  h.s.upsertMessage({
    ...toolMessage,
    streaming: true,
    agentMetadata: {
      ...toolMessage.agentMetadata,
      awaitingLocalTool: false,
    },
    toolCall: toolMessage.toolCall
      ? {
          ...toolMessage.toolCall,
          status: "running",
          startedAt,
          completedAt: undefined,
          duration: undefined,
          durationMs: undefined,
        }
      : toolMessage.toolCall,
  });
  return startedAt;
}

function markWebMcpToolComplete(
  h: SessionActionsHost,
  toolMessage: AgentWidgetMessage,
  result: unknown,
  startedAt: number,
  completedAt = Date.now(),
  extraMetadata?: Partial<
    NonNullable<AgentWidgetMessage["agentMetadata"]>
  >,
): void {
  // A teardown such as clearMessages()/hydrateMessages()/new send can remove
  // the bubble while an aborted WebMCP promise is settling. Never resurrect a
  // cleared message just to mark the old resolve complete.
  if (!h.s.messages.some((message) => message.id === toolMessage.id)) return;
  h.s.upsertMessage({
    ...toolMessage,
    streaming: false,
    agentMetadata: {
      ...toolMessage.agentMetadata,
      awaitingLocalTool: false,
      ...extraMetadata,
    },
    toolCall: toolMessage.toolCall
      ? {
          ...toolMessage.toolCall,
          status: "complete",
          result,
          startedAt,
          completedAt,
          duration: undefined,
          durationMs: Math.max(0, completedAt - startedAt),
        }
      : toolMessage.toolCall,
  });
}

/**
 * Resolve one or more parallel local-tool awaits sharing one paused
 * executionId with a SINGLE `/resume` (core#3878); `resolveWebMcpToolCall`
 * delegates size-1 resolves here after its guards. By default each call is
 * executed against the page registry concurrently: every gated call renders
 * its own native approval bubble, and a sibling's confirm Promise never
 * blocks another's execution. With `webmcp.execution: "sequential"` the
 * calls run one at a time in emission order instead (see the config docs
 * for when that matters). Outputs are keyed by per-call `webMcpToolCallId`
 * (server prefers it over tool name; name-keying remains the fallback for
 * legacy single/distinct-tool turns), so two calls to the SAME tool no longer
 * collide. The server is tolerant: any call we omit (declined-after-abort,
 * dedupe, exec failure) simply re-pauses and is retried on its re-emit.
 *
 * Owns the dedupe / abort / streaming machinery for both routes; resolved
 * keys are marked on the shared resume POST's HTTP OK.
 */
export async function resolveWebMcpToolCallBatch(
  h: SessionActionsHost,
  executionId: string,
  snapshots: AgentWidgetMessage[],
): Promise<void> {
  type ExecutedWebMcpTool = {
    dedupeKey: string;
    resumeKey: string;
    output: unknown;
    toolMessage: AgentWidgetMessage;
    startedAt: number;
    completedAt: number;
  };
  const claimedKeys: string[] = [];
  // One controller per batch, shared by every execute and the resume fetch.
  // Teardown (`abortWebMcpResolves`) only ever aborts the whole set, so
  // finer granularity buys nothing; one registration per resolve op also
  // keeps `webMcpResolveControllers.size` === in-flight resolve count.
  const batchController = new AbortController();
  h.s.webMcpResolveControllers.add(batchController);
  h.setStreaming(true);

  // Phase 1: execute every pending call. A null result means the call was
  // deduped, aborted, or threw; it's omitted from the resume and (per the
  // tolerant server) re-pauses for retry.
  const executeOne = async (
    toolMessage: AgentWidgetMessage,
  ): Promise<ExecutedWebMcpTool | null> => {
    const wireToolName = toolMessage.toolCall?.name;
    const callId = toolMessage.toolCall?.id;
    if (!wireToolName || !callId) return null;

    const dedupeKey = `${executionId}:${callId}`;
    if (
      h.s.webMcpInflightKeys.has(dedupeKey) ||
      h.s.webMcpResolvedKeys.has(dedupeKey) ||
      isSuggestRepliesAlreadyResolved(h, toolMessage)
    ) {
      return null;
    }
    h.s.webMcpInflightKeys.add(dedupeKey);
    claimedKeys.push(dedupeKey);

    // Clear the awaiting flag and keep the tool bubble running while the
    // browser-side WebMCP promise is in flight. The initial `await`
    // only means the server paused for a local tool; it is not completion.
    const startedAt = markWebMcpToolRunning(h, toolMessage);

    // Per-call id wins for resume keying; fall back to the wire tool name
    // for legacy servers that don't emit `webMcpToolCallId`.
    const resumeKey =
      toolMessage.agentMetadata?.webMcpToolCallId ?? wireToolName;

    // Built-in fire-and-forget tool: no bridge, no confirm gate, no
    // browser-side execution: the chips render from the message list and
    // the canned output joins the batch's single /resume.
    if (wireToolName === SUGGEST_REPLIES_TOOL_NAME) {
      return {
        dedupeKey,
        resumeKey,
        output: suggestRepliesToolResult(),
        toolMessage,
        startedAt,
        completedAt: Date.now(),
      };
    }

    const execPromise = h.s.client.executeWebMcpToolCall(
      wireToolName,
      toolMessage.toolCall?.args,
      batchController.signal,
    );

    let output: unknown;
    if (!execPromise) {
      output = {
        isError: true,
        content: [
          { type: "text", text: "WebMCP not enabled on this widget." },
        ],
      };
    } else {
      try {
        output = await execPromise;
      } catch (error) {
        const isAbortError =
          error instanceof Error &&
          (error.name === "AbortError" ||
            error.message.includes("aborted") ||
            error.message.includes("abort"));
        if (!isAbortError) {
          h.s.callbacks.onError?.(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
        markWebMcpToolComplete(h, 
          toolMessage,
          buildWebMcpErrorResult(
            isAbortError
              ? "Aborted by cancel()"
              : getWebMcpErrorMessage(error),
          ),
          startedAt,
        );
        // Release the dedupe claim so a re-emit can retry this call.
        h.s.webMcpInflightKeys.delete(dedupeKey);
        return null;
      }
    }
    if (batchController.signal.aborted) {
      markWebMcpToolComplete(h, 
        toolMessage,
        buildWebMcpErrorResult("Aborted by cancel()"),
        startedAt,
      );
      h.s.webMcpInflightKeys.delete(dedupeKey);
      return null;
    }
    return {
      dedupeKey,
      resumeKey,
      output,
      toolMessage,
      startedAt,
      completedAt: Date.now(),
    };
  };

  // Parallel (default): a gated sibling's approval never blocks another's
  // execution. Sequential: one at a time in emission order, so tools that
  // share page state (a canvas, a form) don't interleave; the next call
  // starts only once the previous one has settled, approval included.
  let executed: Array<ExecutedWebMcpTool | null>;
  if (h.s.config.webmcp?.execution === "sequential") {
    executed = [];
    for (const toolMessage of snapshots) {
      executed.push(await executeOne(toolMessage));
    }
  } else {
    executed = await Promise.all(snapshots.map(executeOne));
  }

  let ready: ExecutedWebMcpTool[] = [];
  try {
    ready = executed.filter((r): r is ExecutedWebMcpTool => r !== null);
    // Everything deduped/aborted/failed: nothing to post.
    if (ready.length === 0) return;

    const toolOutputs: Record<string, unknown> = {};
    for (const r of ready) {
      // Two omitted-on-collision safety: if two calls somehow resolve to the
      // same key (only possible on a legacy name fallback), last write wins:        // the server re-pauses the unrepresented call for retry.
      toolOutputs[r.resumeKey] = r.output;
    }

    const response = await h.s.client.resumeFlow(executionId, toolOutputs, {
      signal: batchController.signal,
      after:
        h.resumeAfter(executionId),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.error ?? `Resume failed: ${response.status}`);
    }
    // Server accepted the batch: mark every included call resolved so stale
    // re-emits don't re-execute the page tool, then complete each bubble.
    // Do this only after /resume HTTP success; if /resume fails, the server
    // may still be paused and the retry path must not show a final result.
    const batch = ready[0]!.dedupeKey;
    for (const r of ready) {
      h.s.webMcpResolvedKeys.add(r.dedupeKey);
      const toolName = r.toolMessage.toolCall?.name;
      const toolCallId = r.toolMessage.agentMetadata?.webMcpToolCallId;
      markWebMcpToolComplete(h, 
        r.toolMessage,
        r.output,
        r.startedAt,
        r.completedAt,
        {
          ...(toolName === SUGGEST_REPLIES_TOOL_NAME
            ? { suggestRepliesResolved: true }
            : {}),
          // Only a provider call id can be replayed: a legacy name-keyed
          // resume has nothing the model's transcript can reference.
          ...(toolName && toolCallId
            ? {
                clientToolAnswer: {
                  toolCallId,
                  toolName,
                  args: r.toolMessage.toolCall?.args,
                  result: r.output,
                  batch,
                },
              }
            : {}),
        },
      );
    }
    if (response.body) {
      await h.s.connectStream(response.body, { allowReentry: true });
    }
  } catch (error) {
    const isAbortError =
      error instanceof Error &&
      (error.name === "AbortError" ||
        error.message.includes("aborted") ||
        error.message.includes("abort"));
    if (!isAbortError) {
      h.s.callbacks.onError?.(
        error instanceof Error ? error : new Error(String(error)),
      );
    } else {
      for (const r of ready) {
        markWebMcpToolComplete(h, 
          r.toolMessage,
          buildWebMcpErrorResult("Aborted by cancel()"),
          r.startedAt,
        );
      }
    }
  } finally {
    for (const key of claimedKeys) {
      h.s.webMcpInflightKeys.delete(key);
    }
    h.s.webMcpResolveControllers.delete(batchController);
    if (h.s.webMcpResolveControllers.size === 0 && !h.s.abortController) {
      h.setStreaming(false);
    }
  }
}

/**
 * Resolve a paused auto-resolving LOCAL tool call and post the result to
 * `/resume`: `webmcp:*` calls execute against the host page's tool
 * registry; the built-in `suggest_replies` skips execution entirely and
 * resumes with a canned "shown" result (the chips render from the message
 * list, not from this resolve).
 *
 * Triggered automatically from `handleEvent` when an `await`-derived
 * message arrives for such a tool: the user does not click a pill; the
 * bridge's confirm-bubble gate (WebMCP only) is the only interactive
 * surface.
 *
 * Idempotent on the message's `toolCall.id`: re-emits of the same await
 * (e.g. from message coalescing) won't double-fire `tool.execute`. Failure
 * modes, declined, timed out, throw, unknown tool, all resolve into a
 * `{ isError: true, content: [...] }` payload that resumes the dispatch
 * cleanly so the agent can recover.
 *
 * After the malformed-wire guards this is a thin gate over
 * `resolveWebMcpToolCallBatch` with a size-1 batch: the dedupe check runs
 * synchronously here so a stale re-emit never toggles streaming.
 */
export async function resolveWebMcpToolCall(
  h: SessionActionsHost,
  toolMessage: AgentWidgetMessage,
): Promise<void> {
  const executionId = toolMessage.agentMetadata?.executionId;
  const wireToolName = toolMessage.toolCall?.name;
  const toolCallId = toolMessage.toolCall?.id;

  // Malformed await wire shapes shouldn't silently strand the
  // server-side dispatch. Three failure modes:
  //   - no executionId: no /resume target exists; surface to the host
  //     via onError so an operator can react. This is a server-side
  //     wire-shape bug: Persona can't recover it from the client.
  //   - no wireToolName: defensive guard: handleEvent only calls us
  //     for an auto-resolving local tool name (`webmcp:*` or
  //     `suggest_replies`), so this path indicates a direct caller
  //     misuse. Silent return.
  //   - no toolCallId: dedupe key falls apart, but the server can still
  //     advance if we post an isError for the wireToolName. Do that
  //     and bail before the dedupe path.
  if (!executionId) {
    h.s.callbacks.onError?.(
      new Error(
        "WebMCP await missing executionId: dispatch left paused.",
      ),
    );
    return;
  }
  if (!wireToolName) return;
  if (!toolCallId) {
    // No toolCall.id → no per-call dedupe key. Fall back to a synthetic
    // `(executionId):(wireToolName)` so identical malformed re-emits don't
    // re-POST /resume. Idempotent on duplicate bad payloads.
    const malformedKey = `${executionId}:__no_tool_id__:${wireToolName}`;
    if (
      h.s.webMcpInflightKeys.has(malformedKey) ||
      h.s.webMcpResolvedKeys.has(malformedKey)
    ) {
      return;
    }
    h.s.webMcpInflightKeys.add(malformedKey);
    try {
      await resumeWithToolOutput(h, executionId, wireToolName, {
        isError: true,
        content: [
          {
            type: "text",
            text: "WebMCP await missing toolCall.id: cannot execute the page tool.",
          },
        ],
      });
      h.s.webMcpResolvedKeys.add(malformedKey);
    } catch (error) {
      h.s.callbacks.onError?.(
        error instanceof Error ? error : new Error(String(error)),
      );
    } finally {
      h.s.webMcpInflightKeys.delete(malformedKey);
    }
    return;
  }

  // Dedupe key scoped by executionId: see `webMcpInflightKeys` doc comment
  // for the failure-recovery + cross-dispatch rationale. The persisted
  // `suggestRepliesResolved` guard backs the in-memory sets across
  // hydrations. Checked synchronously HERE so a stale re-emit stays a pure
  // no-op (no streaming toggle, no controller registration); the batch path
  // re-checks under its own inflight claim.
  const dedupeKey = `${executionId}:${toolCallId}`;
  if (
    h.s.webMcpInflightKeys.has(dedupeKey) ||
    h.s.webMcpResolvedKeys.has(dedupeKey) ||
    isSuggestRepliesAlreadyResolved(h, toolMessage)
  ) {
    return;
  }
  return resolveWebMcpToolCallBatch(h, executionId, [toolMessage]);
}

/**
 * POST `/resume` with a SINGLE tool's output and pipe the resulting SSE
 * stream back through `connectStream`. Shared by every single-call local-tool
 * resolve path (ask_user_question and single WebMCP calls). Parallel WebMCP
 * calls use `resolveWebMcpToolCallBatch`, which posts one resume for many.
 *
 * `resumeKey` is the `toolOutputs` map key: the per-call `webMcpToolCallId`
 * for WebMCP (core#3878), or the tool name for ask_user_question / legacy
 * servers. `onHttpOk` runs synchronously between the HTTP-status check and the
 * stream pipe; it lets the WebMCP resolve path commit the dedupe flag at
 * "server accepted the answer" rather than "stream finished cleanly".
 */
async function resumeWithToolOutput(
  h: SessionActionsHost,
  executionId: string,
  resumeKey: string,
  output: unknown,
  options?: { onHttpOk?: () => void; signal?: AbortSignal },
): Promise<void> {
  const response = await h.s.client.resumeFlow(
    executionId,
    { [resumeKey]: output },
    {
      signal: options?.signal,
      after:
        h.resumeAfter(executionId),
    },
  );
  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.error ?? `Resume failed: ${response.status}`);
  }
  options?.onHttpOk?.();
  if (response.body) {
    await h.s.connectStream(response.body, { allowReentry: true });
  } else if (h.s.webMcpResolveControllers.size === 0) {
    // No stream to pipe. Clear streaming only when no WebMCP resolve is in
    // flight: for a WebMCP caller the current resolve's controller is still
    // in the set, so its own `finally` (gated on the set draining) owns the
    // teardown. Non-WebMCP callers (ask_user_question) keep the old behavior.
    h.setStreaming(false);
    h.s.abortController = null;
  }
}

