/**
 * SSE stream processor for `AgentWidgetClient`: turns a dispatch response
 * body into widget events (messages, reasoning, tools, artifacts, approvals).
 *
 * Split out of `client.ts` so the IIFE/CDN bundle can ship it as the lazy
 * `client-stream.js` sibling chunk (see `client-stream-loader.ts`). It is
 * only needed once a reply starts streaming; the client starts loading it
 * when a dispatch begins, in parallel with the network request.
 */
import type { RuntypeExecutionStreamEvent } from "./generated/runtype-openapi-contract";
import type {
  AgentWidgetConfig,
  AgentWidgetMessage,
  AgentWidgetStreamParser,
  AgentWidgetStreamParserResult,
  AgentWidgetSSEEventParser,
  StopReasonKind,
  ContentPart,
  PersonaArtifactKind,
  PersonaArtifactFileMeta
} from "./types";
import type { SSEEventCallback, SSEHandler } from "./client";
import { isWebMcpToolName } from "./webmcp-bridge";
import {
  buildArtifactRefRawContent,
  resolveArtifactDisplayMode
} from "./utils/artifact-display";
import { extractTextFromJson } from "./utils/formatting";

/**
 * Derive a download filename for `agent_media` parts that are delivered
 * without one. Maps a few well-known MIME types to friendly extensions and
 * falls back to `attachment.<subtype>` (or just `attachment` for opaque
 * types like `application/octet-stream`).
 */
function filenameFromMediaType(mediaType: string): string {
  // MIME types are case-insensitive (RFC 7231); compare against a lowercased
  // copy so callers that pass mixed casing still hit the friendly extensions.
  const lower = mediaType.toLowerCase();
  const knownExtensions: Record<string, string> = {
    "application/pdf": "pdf",
    "application/json": "json",
    "application/zip": "zip",
    "text/plain": "txt",
    "text/csv": "csv",
    "text/markdown": "md"
  };
  const ext = knownExtensions[lower];
  if (ext) return `attachment.${ext}`;
  const slash = lower.indexOf("/");
  if (slash > 0) {
    const subtype = lower.slice(slash + 1).split(";")[0]?.trim() ?? "";
    if (subtype && subtype !== "octet-stream" && /^[a-z0-9.+-]+$/i.test(subtype)) {
      return `attachment.${subtype}`;
    }
  }
  return "attachment";
}

const looksStructured = (value: string) =>
  value.startsWith("{") || value.startsWith("[") || value.startsWith("<");

/**
 * Choose the best content source for sealed-segment reconciliation.
 * Prefers the final structured payload from step_complete when the raw
 * buffer is only a partial/unparseable prefix of the same structured format.
 */
export function preferFinalStructuredContent(
  rawBuffer: string | undefined,
  finalString: string
): string {
  if (!rawBuffer) return finalString;

  const rawTrimmed = rawBuffer.trim();
  const finalTrimmed = finalString.trim();
  if (rawTrimmed.length === 0) return finalString;
  if (finalTrimmed.length === 0) return rawBuffer;

  const rawLooksStructured = looksStructured(rawTrimmed);
  const finalLooksStructured = looksStructured(finalTrimmed);

  if (!finalLooksStructured) return rawBuffer;
  if (!rawLooksStructured) return finalString;
  if (finalTrimmed === rawTrimmed) return finalString;
  if (finalTrimmed.startsWith(rawTrimmed)) return finalString;

  const rawJsonText = extractTextFromJson(rawBuffer);
  const finalJsonText = extractTextFromJson(finalString);
  if (finalJsonText !== null && rawJsonText === null) return finalString;

  return rawBuffer;
}

export type StreamContext = {
  /** Read live: `updateConfig()` may swap the config mid-stream. */
  config: () => AgentWidgetConfig;
  createStreamParser: () => AgentWidgetStreamParser;
  parseSSEEvent?: AgentWidgetSSEEventParser;
  onSSEEvent?: SSEEventCallback;
};

/**
 * Handle custom SSE event parsing via parseSSEEvent callback
 * Returns true if event was handled, false otherwise
 */
async function handleCustomSSEEvent(
  ctx: StreamContext,
  payload: unknown,
  onEvent: SSEHandler,
  assistantMessageRef: { current: AgentWidgetMessage | null },
  emitMessage: (msg: AgentWidgetMessage) => void,
  nextSequence: () => number,
  partIdState: { current: string | null }
): Promise<boolean> {
  if (!ctx.parseSSEEvent) return false;

  try {
    const result = await ctx.parseSSEEvent(payload);
    if (result === null) return false; // Event should be ignored

    const createNewAssistant = (partId?: string): AgentWidgetMessage => {
      const msg: AgentWidgetMessage = {
        id: `assistant-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
        streaming: true,
        variant: "assistant",
        sequence: nextSequence(),
        ...(partId !== undefined && { partId })
      };
      assistantMessageRef.current = msg;
      emitMessage(msg);
      return msg;
    };

    const ensureAssistant = (partId?: string) => {
      if (assistantMessageRef.current) return assistantMessageRef.current;
      return createNewAssistant(partId);
    };

    if (result.text !== undefined) {
      // partId-based message segmentation: when partId changes, seal current
      // message and start a new one for chronological tool/text interleaving
      if (result.partId !== undefined && partIdState.current !== null && result.partId !== partIdState.current) {
        // Seal the current assistant message
        if (assistantMessageRef.current) {
          assistantMessageRef.current.streaming = false;
          emitMessage(assistantMessageRef.current);
        }
        // Create a new assistant message for the new text segment
        createNewAssistant(result.partId);
      }

      // Update partId tracking (only when partId is provided: backward compatible)
      if (result.partId !== undefined) {
        partIdState.current = result.partId;
      }

      const assistant = ensureAssistant(result.partId);
      // Tag the message with partId if present and not already set
      if (result.partId !== undefined && !assistant.partId) {
        assistant.partId = result.partId;
      }
      assistant.content += result.text;
      emitMessage(assistant);
    }

    if (result.done) {
      if (assistantMessageRef.current) {
        assistantMessageRef.current.streaming = false;
        emitMessage(assistantMessageRef.current);
      }
      partIdState.current = null;
      onEvent({ type: "status", status: "idle" });
    }

    if (result.error) {
      partIdState.current = null;
      onEvent({
        type: "error",
        error: new Error(result.error)
      });
    }

    return true; // Event was handled
  } catch (error) {
    if (typeof console !== "undefined") {
      // eslint-disable-next-line no-console
      console.error("[AgentWidget] parseSSEEvent error:", error);
    }
    return false;
  }
}

export async function streamResponse(
  ctx: StreamContext,
  body: ReadableStream<Uint8Array>,
  onEvent: SSEHandler,
  assistantMessageId?: string,
  // Durable reconnect: seed the assistant accumulator with the text already
  // shown before the drop, so replayed post-cursor deltas APPEND to it
  // instead of a fresh stream clobbering it (the replay carries only
  // `seq > after`, i.e. the new deltas, not the full text).
  seedContent?: string
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const baseSequence = Date.now();
  let sequenceCounter = 0;
  const nextSequence = () => baseSequence + sequenceCounter++;

  const cloneMessage = (msg: AgentWidgetMessage): AgentWidgetMessage => {
    const reasoning = msg.reasoning
      ? {
          ...msg.reasoning,
          chunks: [...msg.reasoning.chunks]
        }
      : undefined;
    const toolCall = msg.toolCall
      ? {
          ...msg.toolCall,
          chunks: msg.toolCall.chunks ? [...msg.toolCall.chunks] : undefined
        }
      : undefined;
    const tools = msg.tools
      ? msg.tools.map((tool) => ({
          ...tool,
          chunks: tool.chunks ? [...tool.chunks] : undefined
        }))
      : undefined;

    return {
      ...msg,
      reasoning,
      toolCall,
      tools
    };
  };

  const shouldEmitMessage = (msg: AgentWidgetMessage): boolean => {
    if (msg.role !== "assistant" || msg.variant) return true;

    const hasContentParts =
      Array.isArray(msg.contentParts) && msg.contentParts.length > 0;
    const hasRawContent =
      typeof msg.rawContent === "string" && msg.rawContent.trim() !== "";
    const hasVisibleText =
      typeof msg.content === "string" && msg.content.trim() !== "";

    // Do not surface assistant text bubbles that only contain whitespace.
    // Some providers emit newline-only text parts around a leading tool call;
    // rendering those as normal messages creates an empty bubble above the
    // tool card. Keep media/component/stop-reason messages renderable.
    return hasVisibleText || hasContentParts || hasRawContent || Boolean(msg.stopReason);
  };

  const emitMessage = (msg: AgentWidgetMessage) => {
    if (!shouldEmitMessage(msg)) return;
    onEvent({
      type: "message",
      message: cloneMessage(msg)
    });
  };

  let assistantMessage: AgentWidgetMessage | null = null;
  // Tracks the most recently touched assistant text message for the
  // current agent turn so `turn_complete.stopReason` can attach
  // to the final visible text segment even after `assistantMessage`
  // has been finalized at a tool-call boundary within the turn.
  let lastAssistantInTurn: AgentWidgetMessage | null = null;
  // Reference to track assistant message for custom event handler
  const assistantMessageRef = { current: null as AgentWidgetMessage | null };
  // Segmentation state for the `parseSSEEvent` extensibility callback (the
  // consumer's own `partId` field) — independent of the wire.
  const customParsePartId = { current: null as string | null };
  // Unified text-channel block id (from `text_start`/`text_delta` `id`). Drives
  // bubble-id segmentation on the wire in place of the legacy `partId`:
  // a new block id means a new bubble, sealed at `text_complete`/tool boundaries.
  let currentTextBlockId: string | null = null;
  // Raw text accumulated for the open text block, on both the flow and agent
  // paths — lets a whitespace-only flow block resolve without a stray bubble,
  // and gives the structured-content parser the whole block on either path.
  let pendingTextRaw = "";
  // Nested flow-as-tool attribution (PR #4602): a text/reasoning block whose
  // `parentToolCallId` matches a `tool_start.toolCallId` belongs to a flow
  // running as that tool. Keyed by the wire block id, these route the block's
  // deltas into a message tagged `agentMetadata.parentToolId` (the parent tool's
  // row) instead of the top-level assistant/reasoning channel.
  const nestedBlockParent = new Map<string, string>();
  const nestedBlockMessages = new Map<string, AgentWidgetMessage>();
  const nestedBlockRaw = new Map<string, string>();
  const reasoningMessages = new Map<string, AgentWidgetMessage>();
  const toolMessages = new Map<string, AgentWidgetMessage>();
  const baseAssistantId = assistantMessageId;
  let assistantIdConsumed = false;

  const ensureAssistantMessage = () => {
    if (assistantMessage) return assistantMessage;
    let id: string;
    let initialContent = "";
    const segment = currentTextBlockId;
    if (!assistantIdConsumed && baseAssistantId) {
      id = baseAssistantId;
      assistantIdConsumed = true;
      // First (and only) time we reuse the caller-supplied id: this is the
      // bubble a durable reconnect resumes into, so continue its text.
      initialContent = seedContent ?? "";
    } else if (baseAssistantId && segment) {
      id = `${baseAssistantId}_${segment}`;
    } else {
      id = `assistant-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
    assistantMessage = {
      id,
      role: "assistant",
      content: initialContent,
      createdAt: new Date().toISOString(),
      streaming: true,
      sequence: nextSequence()
    };
    emitMessage(assistantMessage);
    return assistantMessage;
  };

  const ensureReasoningMessage = (reasoningId: string) => {
    const existing = reasoningMessages.get(reasoningId);
    if (existing) {
      return existing;
    }

    const message: AgentWidgetMessage = {
      id: `reason-${reasoningId}`,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      streaming: true,
      variant: "reasoning",
      sequence: nextSequence(),
      reasoning: {
        id: reasoningId,
        status: "streaming",
        chunks: []
      }
    };

    reasoningMessages.set(reasoningId, message);
    emitMessage(message);
    return message;
  };

  // Track tool call IDs for artifact emit tools so we can suppress their UI
  const artifactToolCallIds = new Set<string>();
  // Track artifact block messages (reference card or inline block) so we can
  // update them on artifact_complete
  const artifactCardMessages = new Map<string, AgentWidgetMessage>();
  // Track artifact IDs that already have a reference card
  const artifactIdsWithCards = new Set<string>();
  // Accumulate artifact markdown content (and component props) for embedding
  // in block props on complete. `props` accumulates across `artifact_update`
  // events so an inline component block hydrates with its real props after a
  // refresh (the session artifact registry, which also tracks them live, is
  // not persisted).
  const artifactContent = new Map<
    string,
    {
      markdown: string;
      title?: string;
      file?: PersonaArtifactFileMeta;
      props?: Record<string, unknown>;
    }
  >();
  const isArtifactEmitToolName = (name: string | undefined): boolean => {
    if (!name) return false;
    const normalized = name.replace(/_+/g, "_").replace(/^_|_$/g, "");
    return normalized === "emit_artifact_markdown" || normalized === "emit_artifact_component";
  };

  const ensureToolMessage = (toolId: string) => {
    const existing = toolMessages.get(toolId);
    if (existing) {
      return existing;
    }

    const message: AgentWidgetMessage = {
      id: `tool-${toolId}`,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      streaming: true,
      variant: "tool",
      sequence: nextSequence(),
      toolCall: {
        id: toolId,
        status: "pending"
      }
    };

    toolMessages.set(toolId, message);
    emitMessage(message);
    return message;
  };

  const resolveTimestamp = (value: unknown) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
        return parsed;
      }
      const dateParsed = Date.parse(value);
      if (!Number.isNaN(dateParsed)) {
        return dateParsed;
      }
    }
    return Date.now();
  };

  const ensureStringContent = (value: unknown): string => {
    if (typeof value === "string") {
      return value;
    }
    if (value === null || value === undefined) {
      return "";
    }
    // Convert objects/arrays to JSON string
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  };

  // Maintain stateful stream parsers per message for incremental parsing
  const streamParsers = new Map<string, AgentWidgetStreamParser>();
  // Track accumulated raw content for structured formats (JSON, XML, etc.)
  const rawContentBuffers = new Map<string, string>();
  /** Reconcile a sealed text block with its authoritative structured response. */
  const reconcileSealedAssistantWithFinalResponse = (
    msg: AgentWidgetMessage,
    finalContent: unknown
  ) => {
    const finalString = ensureStringContent(finalContent);
    const rawBuffer = rawContentBuffers.get(msg.id);
    const contentToProcess = preferFinalStructuredContent(rawBuffer, finalString);
    msg.rawContent = contentToProcess;
    const parser = streamParsers.get(msg.id);

    const mergeIfBetter = (mergedDisplay: string) => {
      const cur = msg.content ?? "";
      if (mergedDisplay.trim() === "") return;
      // Only replace when empty, or when the stream left a strict prefix of the
      // authoritative final (truncation). Do not use length alone: multi-segment
      // flows can have a short last bubble whose content is not a prefix of the
      // full step response.
      if (
        cur.trim().length === 0 ||
        mergedDisplay.startsWith(cur) ||
        mergedDisplay.trimStart().startsWith(cur.trim())
      ) {
        msg.content = mergedDisplay;
      }
    };

    const finalizeCleanup = () => {
      if (parser) {
        const closeResult = parser.close?.();
        if (closeResult instanceof Promise) closeResult.catch(() => {});
      }
      streamParsers.delete(msg.id);
      rawContentBuffers.delete(msg.id);
      msg.streaming = false;
      emitMessage(msg);
    };

    if (!parser) {
      mergeIfBetter(finalString);
      finalizeCleanup();
      return;
    }

    // Prefer JSON fast path when the final payload is JSON-shaped
    const extractedFromJson = extractTextFromJson(contentToProcess);
    if (extractedFromJson !== null && extractedFromJson.trim() !== "") {
      mergeIfBetter(extractedFromJson);
      finalizeCleanup();
      return;
    }

    const bestDisplayText = (
      result: AgentWidgetStreamParserResult | string | null
    ): string => {
      const text =
        typeof result === "string" ? result : result?.text ?? null;
      if (text !== null && text.trim() !== "") return text;
      const extracted = parser.getExtractedText();
      if (extracted !== null && extracted.trim() !== "") return extracted;
      return finalString;
    };

    let parsedResult: ReturnType<typeof parser.processChunk>;
    try {
      parsedResult = parser.processChunk(contentToProcess);
    } catch {
      mergeIfBetter(finalString);
      finalizeCleanup();
      return;
    }

    if (parsedResult instanceof Promise) {
      parsedResult
        .then((result) => {
          mergeIfBetter(bestDisplayText(result));
          finalizeCleanup();
        })
        .catch(() => {
          mergeIfBetter(finalString);
          finalizeCleanup();
        });
      return;
    }

    mergeIfBetter(bestDisplayText(parsedResult));
    finalizeCleanup();
  };

  // === Unified text channel ===
  // Prompt-step and agent text both stream as `text_delta` blocks (segmented by
  // `text_start`/`text_complete`) and can be structured JSON, so each block runs
  // through the per-bubble structured-content parser. This is the legacy
  // step_delta parser core, re-keyed from `partId` to the wire block-id bubble.
  // The caller materializes the bubble lazily (whitespace-only blocks around
  // tool boundaries never leave a stray bubble) and `step_complete.result.response`
  // reconciles the authoritative final.
  let lastSealedFlowBubble: AgentWidgetMessage | null = null;

  // Stream one accumulated chunk of block text through the parser, setting
  // display `content` (extracted) + `rawContent` (raw) and emitting. Mirrors the
  // legacy step_delta chunk path; plain text bypasses the structured parser.
  const applyTextChunk = (
    assistant: AgentWidgetMessage,
    accumulatedRaw: string,
    chunk: string,
    chunkSeq: number | undefined
  ) => {
    assistant.rawContent = accumulatedRaw;
    if (!streamParsers.has(assistant.id)) {
      streamParsers.set(assistant.id, ctx.createStreamParser());
    }
    const parser = streamParsers.get(assistant.id)!;
    const looksLikeJson =
      accumulatedRaw.trim().startsWith("{") || accumulatedRaw.trim().startsWith("[");
    if (looksLikeJson) {
      rawContentBuffers.set(assistant.id, accumulatedRaw);
    }
    const isPlainTextParser = (parser as any).__isPlainTextParser === true;
    if (isPlainTextParser) {
      assistant.content =
        chunkSeq !== undefined ? accumulatedRaw : assistant.content + chunk;
      rawContentBuffers.delete(assistant.id);
      streamParsers.delete(assistant.id);
      assistant.rawContent = undefined;
      emitMessage(assistant);
      return;
    }
    const parsedResult = parser.processChunk(accumulatedRaw);
    if (parsedResult instanceof Promise) {
      parsedResult
        .then((result) => {
          const text = typeof result === "string" ? result : result?.text ?? null;
          if (text !== null && text.trim() !== "") {
            assistant.content = text;
            emitMessage(assistant);
          } else if (!looksLikeJson && !accumulatedRaw.trim().startsWith("<")) {
            assistant.content =
              chunkSeq !== undefined ? accumulatedRaw : assistant.content + chunk;
            rawContentBuffers.delete(assistant.id);
            streamParsers.delete(assistant.id);
            assistant.rawContent = undefined;
            emitMessage(assistant);
          }
        })
        .catch(() => {
          assistant.content =
            chunkSeq !== undefined ? accumulatedRaw : assistant.content + chunk;
          rawContentBuffers.delete(assistant.id);
          streamParsers.delete(assistant.id);
          assistant.rawContent = undefined;
          emitMessage(assistant);
        });
    } else {
      const text =
        typeof parsedResult === "string" ? parsedResult : parsedResult?.text ?? null;
      if (text !== null && text.trim() !== "") {
        assistant.content = text;
        emitMessage(assistant);
      } else if (!looksLikeJson && !accumulatedRaw.trim().startsWith("<")) {
        assistant.content =
          chunkSeq !== undefined ? accumulatedRaw : assistant.content + chunk;
        rawContentBuffers.delete(assistant.id);
        streamParsers.delete(assistant.id);
        assistant.rawContent = undefined;
        emitMessage(assistant);
      }
    }
  };

  // Seal a flow text block at `text_complete`: run final structured extraction
  // off the accumulated raw buffer (U2: `text_complete.text` mirrors that raw
  // buffer, so we never double-count), then finalize the bubble. The structured
  // `step_complete.result.response` reconciles afterward.
  const finalizeFlowTextBlock = (
    assistant: AgentWidgetMessage,
    finalContent?: unknown
  ) => {
    const effectiveFinal =
      finalContent !== undefined && finalContent !== null
        ? finalContent
        : assistant.content;
    if (
      effectiveFinal === undefined ||
      effectiveFinal === null ||
      effectiveFinal === ""
    ) {
      assistant.streaming = false;
      emitMessage(assistant);
      return;
    }
    const rawBuffer = rawContentBuffers.get(assistant.id);
    const contentToProcess = rawBuffer ?? ensureStringContent(effectiveFinal);
    assistant.rawContent = contentToProcess;
    const parser = streamParsers.get(assistant.id);
    let extractedText: string | null = null;
    let asyncPending = false;
    if (parser) {
      extractedText = parser.getExtractedText();
      if (extractedText === null) {
        extractedText = extractTextFromJson(contentToProcess);
      }
      if (extractedText === null) {
        const parsedResult = parser.processChunk(contentToProcess);
        if (parsedResult instanceof Promise) {
          asyncPending = true;
          parsedResult
            .then((result) => {
              const text =
                typeof result === "string" ? result : result?.text ?? null;
              if (text !== null) {
                assistant.content = text;
                assistant.streaming = false;
                streamParsers.delete(assistant.id);
                rawContentBuffers.delete(assistant.id);
                emitMessage(assistant);
              }
            })
            .catch(() => {});
        } else {
          extractedText =
            typeof parsedResult === "string"
              ? parsedResult
              : parsedResult?.text ?? null;
        }
      }
    }
    if (!asyncPending) {
      if (extractedText !== null && extractedText.trim() !== "") {
        assistant.content = extractedText;
      } else if (!rawContentBuffers.has(assistant.id)) {
        assistant.content = ensureStringContent(effectiveFinal);
      }
      const parserToClose = streamParsers.get(assistant.id);
      if (parserToClose) {
        const closeResult = parserToClose.close?.();
        if (closeResult instanceof Promise) closeResult.catch(() => {});
        streamParsers.delete(assistant.id);
      }
      rawContentBuffers.delete(assistant.id);
      assistant.streaming = false;
      emitMessage(assistant);
    }
  };

  // Materialize (lazily) the message for a nested flow-as-tool block, tagged
  // with the parent tool-call id so the UI renders it in the parent tool's row.
  const ensureNestedBlockMessage = (
    blockId: string,
    parentToolCallId: string,
    variant?: "reasoning"
  ): AgentWidgetMessage => {
    const existing = nestedBlockMessages.get(blockId);
    if (existing) return existing;
    const message: AgentWidgetMessage = {
      id: `nested-${parentToolCallId}-${blockId}`,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      streaming: true,
      sequence: nextSequence(),
      ...(variant ? { variant } : {}),
      ...(variant === "reasoning"
        ? { reasoning: { id: blockId, status: "streaming", chunks: [] } }
        : {}),
      agentMetadata: { parentToolId: parentToolCallId },
    };
    nestedBlockMessages.set(blockId, message);
    emitMessage(message);
    return message;
  };

  // Ready queue of parsed wire frames awaiting a drain. The API streams the
  // unified wire vocabulary; each frame is parsed in the SSE loop
  // below and rendered directly by the handler (no translation bridge), then
  // pushed here. The wire stream is a single, in-order SSE connection, so
  // frames drain straight through with no reordering.
  const eventQueue: RuntypeExecutionStreamEvent[] = [];
  // Declared here so later closures can reference it; assigned after all
  // handler-scoped variables are initialised (before the SSE loop).
  let drainReadyQueue: () => void;
  // Per-stream media-block buffer: the media triad
  // (media_start/media_delta/media_complete) is reassembled here into a single
  // synthetic message at media_complete, keyed by the block id.
  const mediaBuffers = new Map<
    string,
    { mediaType?: string; toolCallId?: string; parts: string[] }
  >();
  // Tracks the last iteration surfaced as a per-iteration message boundary, so
  // `turn_start` advancing the iteration rotates the bubble in 'separate' mode.
  let lastIterationSeen = 0;
  // Execution kind, resolved from the leading `execution_start` frame. Drives
  // the agent-vs-flow branches that the single wire vocabulary collapses.
  let executionKind: "agent" | "flow" = "agent";
  // Whether `executionKind` was set authoritatively by an `execution_start`
  // frame. Continuation streams (e.g. a tool-driven `/resume`) do NOT re-emit
  // `execution_start`, so a fresh `streamResponse` for the continuation starts
  // with the default `"agent"`. For a flow that mis-routes the final
  // prompt-step finalization and duplicates the last message (the streamed
  // text block is sealed, then `step_complete.result.response` re-renders it as
  // a second bubble). When `execution_start` is absent we recover the flow kind
  // from the first flow `step_*` frame below.
  let executionKindResolved = false;
  // Open turn id (from `turn_start`). Unified text/reasoning deltas carry their
  // own block id, not the turn id, so the turn id is threaded onto agentMetadata
  // from here.
  let openTurnId: string | null = null;
  // Agent execution state tracking
  let agentExecution: { executionId: string; agentId: string; agentName: string } | null = null;
  const iterationDisplay = ctx.config().iterationDisplay ?? 'separate';

  // Drains the queued native events through the main event handler.
  // Also invoked after the SSE loop exits so any events queued at
  // end-of-stream are processed.
  drainReadyQueue = () => {
    for (let i = 0; i < eventQueue.length; i++) {
      const payload = eventQueue[i];

      // Recover the execution kind on continuation streams that omit
      // `execution_start` (e.g. a tool-driven `/resume`). Flow `step_*` frames
      // carry a `stepType`; agent loops never do (they use `turn_*`). Without
      // this, the continuation defaults to `"agent"` and a flow's final
      // prompt-step finalization is duplicated. We only infer when no
      // `execution_start` resolved the kind, so an explicit `agent` is never
      // overridden.
      if (
        !executionKindResolved &&
        executionKind !== "flow" &&
        typeof (payload as { stepType?: unknown }).stepType === "string"
      ) {
        executionKind = "flow";
      }

      if (payload.type === "reasoning_start") {
        // Nested flow-as-tool thinking (PR #4602): route to the parent tool's row.
        const rStartBlockId = typeof payload.id === "string" ? payload.id : null;
        const rStartParent =
          typeof payload.parentToolCallId === "string" && payload.parentToolCallId
            ? payload.parentToolCallId
            : null;
        if (rStartBlockId && rStartParent) {
          nestedBlockParent.set(rStartBlockId, rStartParent);
          ensureNestedBlockMessage(rStartBlockId, rStartParent, "reasoning");
          continue;
        }
        const reasoningId = payload.id;
        const reasoningMessage = ensureReasoningMessage(reasoningId);
        reasoningMessage.reasoning = reasoningMessage.reasoning ?? {
          id: reasoningId,
          status: "streaming",
          chunks: []
        };
        reasoningMessage.reasoning.startedAt =
          reasoningMessage.reasoning.startedAt ??
          Date.now();
        reasoningMessage.reasoning.completedAt = undefined;
        reasoningMessage.reasoning.durationMs = undefined;
        if (payload.scope === "loop" || payload.scope === "turn") {
          reasoningMessage.reasoning.scope = payload.scope;
        }
        reasoningMessage.streaming = true;
        reasoningMessage.reasoning.status = "streaming";
        emitMessage(reasoningMessage);
      } else if (payload.type === "reasoning_delta") {
        // Nested flow-as-tool thinking: append to the parent-tool-row message.
        const rDeltaBlockId = typeof payload.id === "string" ? payload.id : null;
        if (
          rDeltaBlockId &&
          nestedBlockParent.has(rDeltaBlockId) &&
          nestedBlockMessages.has(rDeltaBlockId)
        ) {
          const nested = nestedBlockMessages.get(rDeltaBlockId)!;
          const nestedChunk = payload.delta;
          if (nestedChunk && nested.reasoning) {
            nested.reasoning.chunks.push(String(nestedChunk));
            emitMessage(nested);
          }
          continue;
        }
        const reasoningId = payload.id;
        const reasoningMessage = ensureReasoningMessage(reasoningId);
        reasoningMessage.reasoning = reasoningMessage.reasoning ?? {
          id: reasoningId,
          status: "streaming",
          chunks: []
        };
        reasoningMessage.reasoning.startedAt =
          reasoningMessage.reasoning.startedAt ??
          Date.now();
        if (payload.delta) reasoningMessage.reasoning.chunks.push(payload.delta);
        reasoningMessage.reasoning.status = "streaming";
        reasoningMessage.streaming = true;
        emitMessage(reasoningMessage);
      } else if (payload.type === "reasoning_complete") {
        // Nested flow-as-tool thinking close: seal the parent-tool-row message.
        const rCompleteBlockId = typeof payload.id === "string" ? payload.id : null;
        if (
          rCompleteBlockId &&
          nestedBlockParent.has(rCompleteBlockId) &&
          nestedBlockMessages.has(rCompleteBlockId)
        ) {
          const nested = nestedBlockMessages.get(rCompleteBlockId)!;
          if (nested.reasoning) {
            const nestedReflection =
              typeof payload.text === "string" ? payload.text : "";
            if (nestedReflection && nested.reasoning.chunks.length === 0) {
              nested.reasoning.chunks.push(nestedReflection);
            }
            nested.reasoning.status = "complete";
            nested.streaming = false;
            emitMessage(nested);
          }
          nestedBlockParent.delete(rCompleteBlockId);
          nestedBlockMessages.delete(rCompleteBlockId);
          continue;
        }
        const reasoningId = payload.id;
        // A close carrying text (or scope:"loop") is a cross-iteration
        // reflection fold (merged spec §4 E3): the API streams nothing for the
        // block, then delivers the whole reflection as `text` on the close.
        // Materialize a reasoning bubble even if no reasoning_start/delta opened
        // one, and adopt the close text when the block streamed no chunks (the
        // common reflection case, where reasoning_start opened an empty bubble).
        const reflectionText = typeof payload.text === "string" ? payload.text : "";
        if (!reasoningMessages.get(reasoningId) && (reflectionText || payload.scope === "loop")) {
          ensureReasoningMessage(reasoningId);
        }
        const reasoningMessage = reasoningMessages.get(reasoningId);
        if (reasoningMessage?.reasoning) {
          if (payload.scope === "loop" || payload.scope === "turn") {
            reasoningMessage.reasoning.scope = payload.scope;
          }
          if (reflectionText && reasoningMessage.reasoning.chunks.length === 0) {
            reasoningMessage.reasoning.chunks.push(reflectionText);
          }
          reasoningMessage.reasoning.status = "complete";
          reasoningMessage.reasoning.completedAt = Date.now();
          const start = reasoningMessage.reasoning.startedAt ?? Date.now();
          reasoningMessage.reasoning.durationMs = Math.max(
            0,
            (reasoningMessage.reasoning.completedAt ?? Date.now()) - start
          );
          reasoningMessage.streaming = false;

          emitMessage(reasoningMessage);
        }
      } else if (payload.type === "tool_start") {
        // Unified tool family (agent + flow). Seal any open assistant bubble so
        // text→tool→text interleaves chronologically (the API also emits a
        // text_complete here, so this is usually a no-op — kept for safety).
        if (assistantMessage) {
          (assistantMessage as AgentWidgetMessage).streaming = false;
          emitMessage(assistantMessage as AgentWidgetMessage);
          assistantMessage = null;
        }
        // Unified denormalizes `iteration` onto tool frames too (merged spec §2).
        // Track it so media/reflection blocks — which carry no iteration of their
        // own — can be stamped with the enclosing iteration even on tool-only
        // turns that never emit a `turn_start`.
        if (typeof payload.iteration === "number") lastIterationSeen = payload.iteration;
        const toolId = payload.toolCallId;
        const toolName = payload.toolName;
        // Suppress tool UI for artifact emit tools: artifacts are handled via artifact_* events
        if (isArtifactEmitToolName(toolName)) {
          artifactToolCallIds.add(toolId);
          continue;
        }
        const toolMessage = ensureToolMessage(toolId);
        const tool = toolMessage.toolCall ?? {
          id: toolId,
          status: "pending"
        };
        tool.name = toolName ?? tool.name;
        tool.status = "running";
        tool.success = undefined;
        tool.error = undefined;
        tool.duration = undefined;
        if (payload.parameters !== undefined) {
          tool.args = payload.parameters;
        }
        tool.startedAt =
          tool.startedAt ??
          resolveTimestamp(payload.startedAt);
        tool.completedAt = undefined;
        tool.durationMs = undefined;
        toolMessage.toolCall = tool;
        toolMessage.streaming = true;
        if (payload.executionId) {
          toolMessage.agentMetadata = {
            executionId: payload.executionId,
            iteration: payload.iteration,
          };
        }
        emitMessage(toolMessage);
      } else if (payload.type === "tool_output_delta") {
        const toolId = payload.toolCallId;
        if (artifactToolCallIds.has(toolId)) continue;
        const toolMessage = ensureToolMessage(toolId);
        const tool = toolMessage.toolCall ?? {
          id: toolId,
          status: "running"
        };
        tool.startedAt =
          tool.startedAt ??
          Date.now();
        const chunkText = payload.delta;
        if (chunkText) {
          tool.chunks = tool.chunks ?? [];
          tool.chunks.push(String(chunkText));
        }
        tool.status = "running";
        toolMessage.toolCall = tool;
        toolMessage.streaming = true;
        if (payload.executionId) {
          toolMessage.agentMetadata = toolMessage.agentMetadata ?? {
            executionId: payload.executionId,
            iteration: lastIterationSeen,
          };
        }
        emitMessage(toolMessage);
      } else if (payload.type === "tool_complete") {
        const toolId = payload.toolCallId;
        if (artifactToolCallIds.has(toolId)) {
          artifactToolCallIds.delete(toolId);
          continue;
        }
        const toolMessage = ensureToolMessage(toolId);
        const tool = toolMessage.toolCall ?? {
          id: toolId,
          status: "running"
        };
        tool.status = "complete";
        if (payload.result !== undefined) {
          tool.result = payload.result;
        }
        tool.name = payload.toolName ?? tool.name;
        tool.success = payload.success;
        tool.error = payload.error;
        tool.completedAt = Date.now();
        const durationValue = payload.executionTime;
        if (typeof durationValue === "number") {
          tool.durationMs = durationValue;
          tool.duration = durationValue;
        } else {
          const start = tool.startedAt ?? Date.now();
          tool.durationMs = Math.max(
            0,
            (tool.completedAt ?? Date.now()) - start
          );
        }
        toolMessage.toolCall = tool;
        toolMessage.streaming = false;
        if (payload.executionId) {
          toolMessage.agentMetadata = toolMessage.agentMetadata ?? {
            executionId: payload.executionId,
            iteration: payload.iteration ?? lastIterationSeen,
          };
        }
        emitMessage(toolMessage);
      } else if (payload.type === "await" && payload.toolName) {
        // Unified LOCAL tool pause for either dispatch kind. The execution
        // waits for /resume with toolOutputs. Page tools with origin "webmcp"
        // may carry a bare name, normalized to the internal webmcp: prefix.
        //
        // Upsert a fully-populated tool-variant message so the existing
        // ask_user_question bubble + sheet paths fire. Mark the message with
        // `awaitingLocalTool: true` so the UI knows to resolve via
        // resumeFlow rather than the legacy sendMessage fallback.
        //
        // Key the message by the per-call `toolCallId` (provider `toolu_…`;
        // core#3878) when present. Two PARALLEL calls to the SAME tool in one
        // turn collapse to an identical `toolId` (`runtime_webmcp:<name>_<ms>`)
        // and `index: 0`: only `toolCallId` distinguishes them. Keying on it
        // (a) keeps the two awaits as DISTINCT messages with their own args
        // instead of the second clobbering the first, and (b) merges each
        // await into the matching `tool_start` bubble (also keyed by
        // `toolCallId`). Fall back to the collapsed `toolId` for legacy
        // servers that don't emit `toolCallId`.
        const toolCallId: string | undefined =
          typeof payload.toolCallId === "string" && payload.toolCallId.length > 0
            ? (payload.toolCallId as string)
            : undefined;
        const toolId =
          toolCallId ?? (payload.toolId as string) ?? `local-${nextSequence()}`;
        const toolMessage = ensureToolMessage(toolId);
        const rawToolName = payload.toolName as string;
        // Page tools may arrive with a bare name; synthesize the
        // `webmcp:` prefix so isWebMcpToolName (and the bridge's prefix-strip on
        // resume) treat them identically to a flow `await`.
        const toolName =
          payload.origin === "webmcp" &&
          !isWebMcpToolName(rawToolName)
            ? `webmcp:${rawToolName}`
            : rawToolName;
        const webMcpTool = isWebMcpToolName(toolName);
        const tool = toolMessage.toolCall ?? { id: toolId, status: "pending" as const };
        tool.name = toolName;
        tool.args = payload.parameters;
        // WebMCP tools are executed asynchronously by the browser AFTER this
        // `await` arrives. Keep them running until session.ts resolves
        // the page tool and records its actual elapsed time. Other local
        // tools (for example ask_user_question) keep the existing complete
        // state because they are waiting for a user interaction, not an
        // automatic page-tool execution.
        tool.status = webMcpTool ? "running" : "complete";
        tool.chunks = tool.chunks ?? [];
        tool.startedAt =
          tool.startedAt ??
          resolveTimestamp(payload.awaitedAt);
        if (webMcpTool) {
          tool.completedAt = undefined;
          tool.duration = undefined;
          tool.durationMs = undefined;
        } else {
          tool.completedAt = tool.completedAt ?? tool.startedAt;
        }
        toolMessage.toolCall = tool;
        toolMessage.streaming = false;
        toolMessage.agentMetadata = {
          ...toolMessage.agentMetadata,
          executionId: (payload.executionId as string) ?? toolMessage.agentMetadata?.executionId,
          awaitingLocalTool: true,
          // Only set when the server emitted a real per-call id; its presence
          // is what tells session.ts to batch + key `/resume` by id rather
          // than by tool name (which can't represent two same-tool calls).
          ...(toolCallId ? { webMcpToolCallId: toolCallId } : {}),
        };
        emitMessage(toolMessage);
      } else if (payload.type === "text_start") {
        // Nested flow-as-tool text (PR #4602): a `parentToolCallId` means this
        // block belongs to a flow running as that tool — record the mapping and
        // leave the top-level assistant bubble untouched (the nested deltas route
        // into the parent tool's row).
        const startBlockId = typeof payload.id === "string" ? payload.id : null;
        const startParent =
          typeof payload.parentToolCallId === "string" && payload.parentToolCallId
            ? payload.parentToolCallId
            : null;
        if (startBlockId && startParent) {
          nestedBlockParent.set(startBlockId, startParent);
          continue;
        }
        // Unified text-channel block open. A new block id means a new bubble, so
        // seal any open assistant bubble; the next text_delta creates a fresh one
        // (lazily). The API emits a fresh block at every tool/media/approval/await
        // boundary, so block-id keying drives segmentation — no partId.
        const prev = assistantMessage as AgentWidgetMessage | null;
        if (prev) {
          // Normally text_complete already sealed the prior block; this is the
          // defensive path if a producer opens a new block without closing.
          if (executionKind === "flow") {
            finalizeFlowTextBlock(prev);
            lastSealedFlowBubble = prev;
          } else {
            prev.streaming = false;
            emitMessage(prev);
          }
          assistantMessage = null;
        }
        currentTextBlockId =
          typeof payload.id === "string" ? payload.id : currentTextBlockId;
        pendingTextRaw = "";
      } else if (payload.type === "text_delta") {
        // Nested flow-as-tool text: route to the parent tool's row, through the
        // same structured-content parser, never the top-level assistant channel.
        const deltaBlockId = typeof payload.id === "string" ? payload.id : null;
        const nestedParent = deltaBlockId
          ? nestedBlockParent.get(deltaBlockId)
          : undefined;
        if (deltaBlockId && nestedParent) {
          const nestedDelta =
            typeof payload.delta === "string" ? payload.delta : "";
          const nestedRaw = (nestedBlockRaw.get(deltaBlockId) ?? "") + nestedDelta;
          nestedBlockRaw.set(deltaBlockId, nestedRaw);
          if (nestedRaw.trim() === "") continue;
          const nested = ensureNestedBlockMessage(deltaBlockId, nestedParent);
          nested.agentMetadata = {
            ...nested.agentMetadata,
            executionId: payload.executionId,
            parentToolId: nestedParent,
          };
          applyTextChunk(nested, nestedRaw, nestedDelta, undefined);
          continue;
        }
        currentTextBlockId =
          typeof payload.id === "string" ? payload.id : currentTextBlockId;
        if (executionKind === "flow") {
          // Flow prompt-step text can be structured JSON: accumulate the raw
          // block and run it through the structured-content parser, keyed by the
          // block-id bubble. Materialize lazily so a whitespace-only block
          // (newlines around a tool boundary) never leaves a stray bubble.
          const delta = typeof payload.delta === "string" ? payload.delta : "";
          pendingTextRaw += delta;
          if (pendingTextRaw.trim() === "") continue;
          const assistant = ensureAssistantMessage();
          assistant.agentMetadata = {
            executionId: payload.executionId,
            iteration: lastIterationSeen,
          };
          applyTextChunk(assistant, pendingTextRaw, delta, undefined);
          lastAssistantInTurn = assistant;
          continue;
        }
        // Agent text can be structured JSON too, whenever the host configures a
        // custom `streamParser` (e.g. the page-context demo's `{"text": ...}` /
        // `{"action": "add_to_cart", ...}` envelope). Accumulate the open block's
        // raw text and run it through the same structured-content path the flow
        // branch uses, so the parser sees the whole block and `rawContent` stays
        // populated for the action manager. With the default plain-text parser
        // this is byte-identical to appending the delta, so agent demos that
        // stream prose are unaffected.
        const agentDelta = typeof payload.delta === "string" ? payload.delta : "";
        pendingTextRaw += agentDelta;
        const assistant = ensureAssistantMessage();
        assistant.agentMetadata = {
          executionId: payload.executionId,
          iteration: lastIterationSeen,
          turnId: openTurnId ?? undefined,
          agentName: agentExecution?.agentName
        };
        applyTextChunk(assistant, pendingTextRaw, agentDelta, undefined);
        lastAssistantInTurn = assistant;
      } else if (payload.type === "text_complete") {
        // Nested flow-as-tool text block close: seal its parent-tool-row message.
        const completeBlockId = typeof payload.id === "string" ? payload.id : null;
        if (completeBlockId && nestedBlockParent.has(completeBlockId)) {
          const nested = nestedBlockMessages.get(completeBlockId);
          if (nested) finalizeFlowTextBlock(nested);
          nestedBlockParent.delete(completeBlockId);
          nestedBlockRaw.delete(completeBlockId);
          nestedBlockMessages.delete(completeBlockId);
          continue;
        }
        // Seal the current text block's bubble.
        const prev = assistantMessage as AgentWidgetMessage | null;
        if (prev) {
          if (executionKind === "flow") {
            // Final structured extraction off the accumulated raw buffer; the
            // authoritative step_complete.result.response reconciles next.
            finalizeFlowTextBlock(prev);
            lastSealedFlowBubble = prev;
          } else {
            // U2: text_complete carries the assembled text, but the bubble already
            // holds it from the deltas — only fall back to payload.text when no
            // delta content was seen, never double-count.
            if ((prev.content ?? "") === "" && typeof payload.text === "string") {
              prev.content = payload.text;
            }
            prev.streaming = false;
            emitMessage(prev);
          }
          assistantMessage = null;
        }
        currentTextBlockId = null;
        pendingTextRaw = "";
      } else if (payload.type === "step_complete") {
        // Only process completions for prompt steps, not tool/context steps
        if (payload.stepType === "tool") {
          // Skip tool-related completions - they're handled by tool_complete
          continue;
        }

        // A failed step (`success:false`) — including the legacy `step_error`
        // event, which the wire encoder folds into a failed `step_complete`
        // — surfaces as a terminal error and finalizes the stream.
        if (payload.success === false) {
          const message = payload.error || "Step failed";
          onEvent({ type: "error", error: new Error(message) });
          const finalMsg = assistantMessage as AgentWidgetMessage | null;
          if (finalMsg && finalMsg.streaming) {
            finalMsg.streaming = false;
            emitMessage(finalMsg);
          }
          onEvent({ type: "status", status: "idle" });
          continue;
        }

        // Unified flow: reconcile the just-sealed text block with the
        // authoritative structured final (`result.response`). Displayed content
        // stays as streamed — a multi-segment step keeps each bubble's own text;
        // reconcile only fills/repairs the last sealed block and sets rawContent.
        // A pure-tool / text-less step (no sealed flow bubble) completes silently.
        {
          const sealed = lastSealedFlowBubble;
          lastSealedFlowBubble = null;
          const flowStopReason = payload.stopReason as
            | StopReasonKind
            | undefined;
          const result = payload.result && typeof payload.result === "object"
            ? payload.result as Record<string, unknown>
            : null;
          const finalResponse = result?.response;
          if (sealed) {
            if (flowStopReason) sealed.stopReason = flowStopReason;
            if (finalResponse !== undefined && finalResponse !== null) {
              reconcileSealedAssistantWithFinalResponse(sealed, finalResponse);
            } else if (sealed.streaming !== false) {
              streamParsers.delete(sealed.id);
              rawContentBuffers.delete(sealed.id);
              sealed.streaming = false;
              emitMessage(sealed);
            }
          } else {
            // Buffered / dispatch-mode step: no streamed text block, but the step
            // carries the final response (and/or a stopReason) — render it as the
            // assistant message. An empty response + stopReason still surfaces a
            // sealed bubble so the UI can show an affordance.
            const hasResponse =
              finalResponse !== undefined &&
              finalResponse !== null &&
              finalResponse !== "";
            if (hasResponse || flowStopReason) {
              const assistant = ensureAssistantMessage();
              if (flowStopReason) assistant.stopReason = flowStopReason;
              if (hasResponse) {
                finalizeFlowTextBlock(assistant, finalResponse);
              } else {
                assistant.streaming = false;
                emitMessage(assistant);
              }
            }
          }
          continue;
        }
      // ================================================================
      // Agent Loop Execution Events
      // ================================================================
      } else if (payload.type === "execution_start") {
        executionKind = payload.kind === "flow" ? "flow" : "agent";
        executionKindResolved = true;
        if (executionKind === "agent") {
          agentExecution = {
            executionId: payload.executionId,
            agentId: payload.agentId ?? 'virtual',
            agentName: payload.agentName ?? ''
          };
        }
      } else if (payload.type === "turn_start") {
        // Unified collapsed `agent_iteration_*` into a denormalized `iteration`
        // field on the turn (merged spec §2). Reconstruct the per-iteration
        // message boundary the 'separate' renderer keys off: when the iteration
        // advances, seal the previous iteration's bubble and rotate to a new one.
        const iteration =
          typeof payload.iteration === "number" ? payload.iteration : lastIterationSeen;
        if (iteration !== lastIterationSeen) {
          if (iterationDisplay === 'separate' && iteration > 1) {
            const prevMsg = assistantMessage as AgentWidgetMessage | null;
            if (prevMsg) {
              prevMsg.streaming = false;
              emitMessage(prevMsg);
              assistantMessage = null;
            }
          }
          lastIterationSeen = iteration;
        }
        openTurnId = typeof payload.id === "string" ? payload.id : null;
        // Reset the per-turn assistant tracker. lastAssistantInTurn is used by
        // turn_complete to attach stopReason to the final text segment of the
        // turn even if that segment was sealed by an intervening tool boundary.
        lastAssistantInTurn = null;
      } else if (payload.type === "tool_input_delta") {
        // Streamed tool arguments (display-only; authoritative args ride
        // tool_input_complete / tool_start).
        const toolId = payload.toolCallId;
        if (toolId) {
          const toolMessage = toolMessages.get(toolId);
          if (toolMessage?.toolCall) {
            toolMessage.toolCall.chunks = toolMessage.toolCall.chunks ?? [];
            toolMessage.toolCall.chunks.push(payload.delta ?? '');
            emitMessage(toolMessage);
          }
        }
      } else if (payload.type === "tool_input_complete") {
        if (artifactToolCallIds.has(payload.toolCallId)) continue;
        const toolMessage = ensureToolMessage(payload.toolCallId);
        const tool = toolMessage.toolCall!;
        tool.args = payload.parameters;
        tool.name = payload.toolName ?? tool.name;
        emitMessage(toolMessage);
      } else if (payload.type === "turn_complete") {
        // Reasoning is sealed by its own reasoning_complete on the wire
        // vocabulary; this only attaches the turn-level stopReason to the
        // assistant message produced by this turn. Falls back to
        // lastAssistantInTurn when the bubble was sealed at a tool boundary
        // mid-turn, so the notice still attaches to the final visible segment.
        const turnStopReason = payload.stopReason as
          | StopReasonKind
          | undefined;
        const stopReasonTarget = assistantMessage ?? lastAssistantInTurn;
        if (turnStopReason && stopReasonTarget !== null) {
          const turnId = payload.id;
          const matchesTurn =
            !turnId || stopReasonTarget.agentMetadata?.turnId === turnId;
          if (matchesTurn) {
            stopReasonTarget.stopReason = turnStopReason;
            emitMessage(stopReasonTarget);
          }
        }
        if (openTurnId === payload.id) openTurnId = null;
      } else if (payload.type === "media_start") {
        // Open a media block; buffer fragments until media_complete.
        const id = String(payload.id);
        mediaBuffers.set(id, {
          mediaType: typeof payload.mediaType === "string" ? payload.mediaType : undefined,
          toolCallId: payload.toolCallId,
          parts: [],
        });
      } else if (payload.type === "media_delta") {
        const buf = mediaBuffers.get(String(payload.id));
        if (buf && typeof payload.delta === "string") buf.parts.push(payload.delta);
      } else if (payload.type === "media_complete") {
        // Reassemble the buffered media triad into a single AI SDK–aligned
        // `MediaContentPart`, then render it as a synthetic assistant message
        // inserted between the tool bubble and the next text turn:
        //   { type: 'media', data, mediaType }                // AI SDK v6: base64
        //   { type: 'image-url', url, mediaType? }            // AI SDK v3/v4
        //   { type: 'file-url', url, mediaType }              // AI SDK v3/v4
        const mediaBlockId = String(payload.id);
        const buf = mediaBuffers.get(mediaBlockId);
        mediaBuffers.delete(mediaBlockId);
        const completeMediaType =
          (typeof payload.mediaType === "string" ? payload.mediaType : undefined) ??
          buf?.mediaType ??
          "application/octet-stream";
        const completeData = typeof payload.data === "string" ? payload.data : undefined;
        const completeUrl =
          typeof payload.url === "string"
            ? payload.url
            : buf && buf.parts.length > 0
              ? buf.parts.join("")
              : undefined;
        let reconstructed: Record<string, unknown> | null = null;
        if (completeData) {
          reconstructed = { type: "media", data: completeData, mediaType: completeMediaType };
        } else if (completeUrl) {
          // The wire is mediaType-only; a URL part with no declared MIME
          // arrives as the bare bucket hint "image" (per the API encoder). Treat
          // that — and any real `image/*` — as a hosted image so we don't misroute
          // generated images into the file bucket.
          const lower = completeMediaType.toLowerCase();
          const isImage = lower === "image" || lower.startsWith("image/");
          reconstructed = {
            type: isImage ? "image-url" : "file-url",
            url: completeUrl,
            mediaType: completeMediaType,
          };
        }
        const mediaToolCallId = payload.toolCallId ?? buf?.toolCallId;
        const rawMedia = reconstructed ? [reconstructed] : [];
        const mediaContentParts: ContentPart[] = [];
        for (const part of rawMedia) {
          if (!part || typeof part !== "object") continue;
          const rec = part as Record<string, unknown>;
          const partType = typeof rec.type === "string" ? rec.type : undefined;

          // Resolve `(src, mediaType)` for the part.
          // RFC 7231 says MIME types are case-insensitive, so we canonicalize
          // to lowercase once here. That makes the `startsWith("image/")` /
          // `"audio/"` / `"video/"` bucket checks robust to upstream tools
          // that emit non-canonical casing like `Image/PNG`.
          const rawMediaType =
            typeof rec.mediaType === "string" ? rec.mediaType.toLowerCase() : "";
          let src: string | null = null;
          let mediaType = "";
          if (partType === "media") {
            const data = typeof rec.data === "string" ? rec.data : undefined;
            if (!data) continue;
            // Empty/missing mediaType yields `data:;base64,...` which RFC 2397
            // resolves to `text/plain`: stamp a default so the data URI is
            // well-formed and the part lands in the file bucket.
            mediaType = rawMediaType.length > 0 ? rawMediaType : "application/octet-stream";
            src = `data:${mediaType};base64,${data}`;
          } else if (partType === "image-url") {
            const url = typeof rec.url === "string" ? rec.url : undefined;
            if (!url) continue;
            mediaType = rawMediaType;
            src = url;
          } else if (partType === "file-url") {
            const url = typeof rec.url === "string" ? rec.url : undefined;
            if (!url) continue;
            mediaType = rawMediaType;
            src = url;
          } else {
            continue;
          }
          if (!src) continue;

          // Pick the right rendering bucket based on mediaType.
          if (partType === "image-url" || mediaType.startsWith("image/")) {
            mediaContentParts.push({
              type: "image",
              image: src,
              // Only a real MIME (`image/png`) is a usable mimeType; the bare
              // bucket hint "image" (a hosted URL with no declared type) is not.
              ...(mediaType.includes("/") ? { mimeType: mediaType } : {}),
            });
          } else if (mediaType.startsWith("audio/")) {
            mediaContentParts.push({
              type: "audio",
              audio: src,
              mimeType: mediaType,
            });
          } else if (mediaType.startsWith("video/")) {
            mediaContentParts.push({
              type: "video",
              video: src,
              mimeType: mediaType,
            });
          } else {
            const resolvedMediaType = mediaType || "application/octet-stream";
            mediaContentParts.push({
              type: "file",
              data: src,
              mimeType: resolvedMediaType,
              filename: filenameFromMediaType(resolvedMediaType),
            });
          }
        }

        if (mediaContentParts.length > 0) {
          // Uniquify per emission. A tool may emit multiple `agent_media`
          // events for the same `toolCallId` (e.g. streamed/batched media);
          // sharing an id would let `emitMessage` merge them by id and
          // overwrite the prior `contentParts`.
          const seq = nextSequence();
          const toolCallIdRaw = mediaToolCallId;
          const mediaIdSuffix =
            typeof toolCallIdRaw === "string" && toolCallIdRaw.length > 0
              ? `${toolCallIdRaw}-${seq}`
              : String(seq);
          const mediaMessage: AgentWidgetMessage = {
            id: `agent-media-${mediaIdSuffix}`,
            role: "assistant",
            content: "",
            contentParts: mediaContentParts,
            createdAt: new Date().toISOString(),
            streaming: false,
            sequence: seq,
            agentMetadata: {
              executionId: payload.executionId,
              // Media blocks carry no iteration of their own; stamp the
              // enclosing iteration tracked from turn/tool frames.
              iteration: lastIterationSeen,
            },
          };
          emitMessage(mediaMessage);

          // Seal any in-flight assistant text bubble before splitting the
          // stream. Without this, an orphan bubble retains `streaming: true`
          // forever: `execution_complete` only finalizes the latest
          // `assistantMessage`, so the typing/caret indicator would stay on
          // the prior bubble even though no more deltas will arrive.
          const prevAssistant = assistantMessage as AgentWidgetMessage | null;
          if (prevAssistant) {
            prevAssistant.streaming = false;
            emitMessage(prevAssistant);
          }
          assistantMessage = null;
          assistantMessageRef.current = null;
        }
      } else if (payload.type === "execution_complete") {
        // Finalize any still-open assistant message. Per-step reconciliation
        // (step_complete.result.response) normally sealed the flow blocks
        // already; this is the defensive close for an unterminated block, and
        // for flow it runs the final structured extraction off the raw buffer.
        const finalMsg = assistantMessage as AgentWidgetMessage | null;
        if (finalMsg) {
          if (payload.kind === "flow" && finalMsg.streaming !== false) {
            finalizeFlowTextBlock(finalMsg);
          } else {
            finalMsg.streaming = false;
            emitMessage(finalMsg);
          }
          assistantMessage = null;
        }
        currentTextBlockId = null;
        pendingTextRaw = "";
        lastSealedFlowBubble = null;

        // `terminal: true` marks this as a graceful finish (not a drop). The
        // session uses it to distinguish the real end-of-turn from the plain
        // `idle` the dispatch wrappers emit in their `finally` when a durable
        // connection drops mid-stream (durable-reconnect drop detection).
        onEvent({ type: "status", status: "idle", terminal: true });
      } else if (payload.type === "execution_error") {
        // Terminal failure. The non-terminal `error` is handled
        // separately (recoverable → warn).
        const errorMessage = typeof payload.error === 'string'
          ? payload.error
          : payload.error?.message ?? 'Execution error';
        onEvent({
          type: "error",
          error: new Error(errorMessage)
        });
      } else if (payload.type === "ping") {
        // Keep-alive heartbeat - no action needed
      // ================================================================
      // Tool Approval Events
      // ================================================================
      } else if (payload.type === "approval_start") {
        const approvalId = payload.approvalId ?? `approval-${nextSequence()}`;
        const approvalMessage: AgentWidgetMessage = {
          id: `approval-${approvalId}`,
          role: "assistant",
          content: "",
          createdAt: new Date().toISOString(),
          streaming: false,
          variant: "approval",
          sequence: nextSequence(),
          approval: {
            id: approvalId,
            status: "pending",
            agentId: agentExecution?.agentId ?? 'virtual',
            executionId: payload.executionId ?? agentExecution?.executionId ?? '',
            toolName: payload.toolName ?? '',
            toolType: payload.toolType,
            description: payload.description ?? `Execute ${payload.toolName ?? 'tool'}`,
            ...(typeof payload.reason === "string" && payload.reason
              ? { reason: payload.reason }
              : {}),
            parameters: payload.parameters,
            ...(typeof payload.toolCallId === "string" && payload.toolCallId
              ? { toolCallId: payload.toolCallId }
              : {}),
          },
        };
        emitMessage(approvalMessage);
      } else if (payload.type === "approval_complete") {
        const approvalId = payload.approvalId;
        if (approvalId) {
          // Find and update the existing approval message
          const approvalMessageId = `approval-${approvalId}`;
          const existingMessage: AgentWidgetMessage = {
            id: approvalMessageId,
            role: "assistant",
            content: "",
            createdAt: new Date().toISOString(),
            streaming: false,
            variant: "approval",
            sequence: nextSequence(),
            approval: {
              id: approvalId,
              status: (payload.decision as "approved" | "denied") ?? "approved",
              agentId: agentExecution?.agentId ?? 'virtual',
              executionId: payload.executionId ?? agentExecution?.executionId ?? '',
              toolName: '',
              description: '',
              resolvedAt: Date.now(),
            },
          };
          emitMessage(existingMessage);
        }
      } else if (
        payload.type === "artifact_start" ||
        payload.type === "artifact_delta" ||
        payload.type === "artifact_update" ||
        payload.type === "artifact_complete"
      ) {
        if (payload.type === "artifact_start") {
          const at = payload.artifactType as PersonaArtifactKind;
          const artId = String(payload.id);
          const artTitle = typeof payload.title === "string" ? payload.title : undefined;
          // Additive `file` metadata: validate shape (object with string path +
          // string mimeType; optional string language). Drop silently if malformed
          // so old/new backends and unexpected payloads never break the stream.
          const rawFile = payload.file;
          let artFile: PersonaArtifactFileMeta | undefined;
          if (
            rawFile &&
            typeof rawFile === "object" &&
            !Array.isArray(rawFile) &&
            typeof rawFile.path === "string" &&
            typeof rawFile.mimeType === "string"
          ) {
            artFile = {
              path: rawFile.path,
              mimeType: rawFile.mimeType,
              ...(typeof rawFile.language === "string" ? { language: rawFile.language } : {}),
            };
          }
          onEvent({
            type: "artifact_start",
            id: artId,
            artifactType: at,
            title: artTitle,
            component: typeof payload.component === "string" ? payload.component : undefined,
            ...(artFile ? { file: artFile } : {})
          });
          artifactContent.set(artId, {
            markdown: "",
            title: artTitle,
            file: artFile,
          });
          // Insert the in-thread artifact block once per ID.
          // The resolved display mode picks the component:
          // "card"/"panel" inject the reference card; "inline" injects the
          // inline preview block. Both share the rawContent JSON-component
          // shape so transcript persistence and hydration work unchanged.
          if (!artifactIdsWithCards.has(artId)) {
            artifactIdsWithCards.add(artId);
            const displayMode = resolveArtifactDisplayMode(
              ctx.config().features?.artifacts,
              {
                artifactType: at,
                ...(artFile ? { file: artFile } : {}),
              }
            );
            const artComponent =
              typeof payload.component === "string" ? payload.component : undefined;
            const cardMsg: AgentWidgetMessage = {
              id: `artifact-ref-${artId}`,
              role: "assistant",
              content: "",
              createdAt: new Date().toISOString(),
              streaming: true,
              sequence: nextSequence(),
              rawContent: buildArtifactRefRawContent(displayMode, {
                artifactId: artId,
                title: artTitle,
                artifactType: at,
                status: "streaming",
                ...(artFile ? { file: artFile } : {}),
                ...(artComponent ? { component: artComponent } : {}),
              }),
            };
            artifactCardMessages.set(artId, cardMsg);
            emitMessage(cardMsg);
          }
        } else if (payload.type === "artifact_delta") {
          const deltaId = String(payload.id);
          const deltaText = typeof payload.delta === "string" ? payload.delta : String(payload.delta ?? "");
          onEvent({
            type: "artifact_delta",
            id: deltaId,
            artDelta: deltaText
          });
          const acc = artifactContent.get(deltaId);
          if (acc) acc.markdown += deltaText;
        } else if (payload.type === "artifact_update") {
          const props =
            payload.props && typeof payload.props === "object" && !Array.isArray(payload.props)
              ? (payload.props as Record<string, unknown>)
              : {};
          onEvent({
            type: "artifact_update",
            id: String(payload.id),
            props,
            component: typeof payload.component === "string" ? payload.component : undefined
          });
          // Accumulate for hydration: embedded on artifact_complete so an
          // inline component block re-renders with its real props after a
          // refresh.
          const updateAcc = artifactContent.get(String(payload.id));
          if (updateAcc) {
            updateAcc.props = { ...(updateAcc.props ?? {}), ...props };
          }
        } else if (payload.type === "artifact_complete") {
          const artCompleteId = String(payload.id);
          onEvent({ type: "artifact_complete", id: artCompleteId });
          // Update the inline card to show completed state
          const refMsg = artifactCardMessages.get(artCompleteId);
          if (refMsg) {
            refMsg.streaming = false;
            try {
              const parsed = JSON.parse(refMsg.rawContent ?? "{}");
              if (parsed.props) {
                parsed.props.status = "complete";
                // Store markdown content in card props so download works after page refresh
                const acc = artifactContent.get(artCompleteId);
                if (acc?.markdown) {
                  parsed.props.markdown = acc.markdown;
                }
                // Persist file metadata too so the download path unfences correctly after refresh.
                if (acc?.file) {
                  parsed.props.file = acc.file;
                }
                // Embed accumulated component props so an inline component
                // block hydrates with its real props after a refresh. Only
                // the inline block reads them; the card never does.
                if (
                  parsed.component === "PersonaArtifactInline" &&
                  acc?.props &&
                  Object.keys(acc.props).length > 0
                ) {
                  parsed.props.componentProps = acc.props;
                }
              }
              refMsg.rawContent = JSON.stringify(parsed);
            } catch { /* ignore parse errors */ }
            artifactContent.delete(artCompleteId);
            emitMessage(refMsg);
            artifactCardMessages.delete(artCompleteId);
          }
        }
      } else if (payload.type === "error") {
        // Unified non-terminal error (merged spec). A bare `error` is
        // recoverable by default — a transient notice such as "rate limited,
        // retrying" — and the execution continues, so it must NOT surface as a
        // fatal error or finalize the stream. The API routes terminal failures
        // through `execution_error`. Only an explicit `recoverable: false`
        // promotes an `error` to terminal.
        if (
          payload.recoverable === false &&
          payload.error != null &&
          payload.error !== ""
        ) {
          const errorMessage =
            typeof payload.error === "string"
              ? payload.error
              : (payload.error as { message?: unknown })?.message != null
                ? String((payload.error as { message?: unknown }).message)
                : "Execution error";
          onEvent({ type: "error", error: new Error(errorMessage) });
          const finalMsg = assistantMessage as AgentWidgetMessage | null;
          if (finalMsg && finalMsg.streaming) {
            finalMsg.streaming = false;
            emitMessage(finalMsg);
          }
          onEvent({ type: "status", status: "idle" });
        }

      }
    }
    eventQueue.length = 0;
  };

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      const lines = event.split("\n");
      let eventType = "message";
      let data = "";
      // Durable-reconnect cursor: the SSE `id:` line (the durable row seq).
      // Only durable, resumable agent executions stamp these (e.g. Claude
      // Managed agents, or any async/background run the backend persists and
      // can replay); other streams carry no cursor. We emit a `cursor`
      // event AFTER the frame is fully parsed and dispatched, so the session's
      // `lastEventId` only advances past frames it has actually applied, so the
      // happy path has no dupes against the server's `seq > after` replay.
      let frameId: string | null = null;

      for (const line of lines) {
        if (line.startsWith("event:")) {
          eventType = line.replace("event:", "").trim();
        } else if (line.startsWith("data:")) {
          data += line.replace("data:", "").trim();
        } else if (line.startsWith("id:")) {
          frameId = line.slice(3).trim();
        }
      }

      const advanceCursor = () => {
        if (frameId !== null && frameId !== "") {
          onEvent({ type: "cursor", id: frameId });
        }
      };

      // A frame with an `id:` but no `data:` (e.g. a bare keepalive line) is
      // still a received durable row, so advance the cursor past it.
      if (!data) {
        advanceCursor();
        continue;
      }
      let payload: unknown;
      try {
        payload = JSON.parse(data);
      } catch (error) {
        // Parse failure: the frame was NOT applied. Do NOT advance the cursor
        // so a reconnect re-fetches this row.
        onEvent({
          type: "error",
          error:
            error instanceof Error
              ? error
              : new Error("Failed to parse chat stream payload")
        });
        continue;
      }

      const record = payload !== null && typeof payload === "object" && !Array.isArray(payload)
        ? payload as Record<string, unknown>
        : null;
      const payloadType = eventType !== "message"
        ? eventType
        : typeof record?.type === "string" ? record.type : "message";

      // Tap: capture raw SSE event for event stream inspector
      ctx.onSSEEvent?.(payloadType, payload);

      // If custom SSE event parser is provided, try it first
      if (ctx.parseSSEEvent) {
        // Keep assistant message ref in sync
        assistantMessageRef.current = assistantMessage;
        const handled = await handleCustomSSEEvent(
            ctx,
          payload,
          onEvent,
          assistantMessageRef,
          emitMessage,
          nextSequence,
          customParsePartId
        );
        // Update assistantMessage from ref (in case it was created or replaced by partId segmentation)
        if (assistantMessageRef.current && assistantMessageRef.current !== assistantMessage) {
          assistantMessage = assistantMessageRef.current;
        }
        if (handled) {
          advanceCursor();
          continue; // Skip default handling if custom handler processed it
        }
      }

      // The wire is the wire vocabulary; the handler consumes it
      // natively. The stream is single-connection and in order, so each frame
      // drains straight through.
      if (record) {
        // The raw tap and custom parser above retain the original payload.
        // Known native branches use the generated union; unknown event types
        // fall through without rejecting a custom backend's stream.
        eventQueue.push({ ...record, type: payloadType } as RuntypeExecutionStreamEvent);
        drainReadyQueue();
      }
      advanceCursor();
    }
  }

  drainReadyQueue();
}
