/**
 * Unified → legacy SSE event bridge (widget consumer side).
 *
 * The mirror image of the runtype-core `createUnifiedEventWrite` translator: it
 * takes frames in the neutral 33-event UNIFIED vocabulary (emitted by the API
 * when a caller requests `?events=unified`) and maps each back onto the LEGACY
 * `agent_*` / `flow_*` / `step_*` / `artifact_*` events the widget's existing
 * dispatch chain (`client.ts`) already renders. The dispatch chain is untouched.
 *
 * Opt-in: only engaged when `events: 'unified'` is set (or auto-detected from a
 * leading `execution_start` frame). Default `'legacy'` bypasses this module.
 *
 * Stateful: the unified vocabulary collapses agent/flow distinctions and
 * decouples text/reasoning block ids from turns, so the bridge tracks `kind`,
 * the open turn/step, and buffers the media triad — exactly inverting the api
 * translator's state. See `docs/specs/widget-unified-event-bridge.md` for the
 * full mapping table (every field rename is pinned to the handler that reads it).
 */

/** Canonical WebMCP wire prefix — mirrors `webmcp-bridge.ts` (WEBMCP_TOOL_PREFIX
 *  / isWebMcpToolName). Inlined to keep this pure mapper dependency-free. */
const WEBMCP_PREFIX = "webmcp:";

export type LegacyEvent = { payloadType: string; payload: Record<string, unknown> };

/** True when a frame's `type` identifies the unified vocabulary unambiguously.
 *  `execution_start` is unified-exclusive; `agent_start` / `flow_start` are
 *  legacy-exclusive. Used by `client.ts` to auto-detect the wire mode from the
 *  first lifecycle frame (so the `events` flag is a request, not a commitment). */
export function isUnifiedLifecycleStart(type: string): boolean {
  return type === "execution_start";
}

export class UnifiedToLegacyBridge {
  private kind: "agent" | "flow" = "agent";
  private executionId: string;
  private iteration = 1;
  /** current agent turn id (from `turn_start`) — the `turnId` agent deltas need */
  private openTurnId: string | null = null;
  /** current flow step id (from `step_start`) — the `id` flow text attaches to */
  private openStepId: string | null = null;
  private openTextBlockId: string | null = null;
  private openReasoningId: string | null = null;
  private readonly mediaBuffers = new Map<
    string,
    { mediaType?: string; role?: string; toolCallId?: unknown; parts: string[] }
  >();

  constructor(opts?: { executionId?: string }) {
    this.executionId = opts?.executionId ?? "";
  }

  /** Translate ONE decoded unified frame into 0..N legacy events, in order. */
  push(type: string, payload: Record<string, unknown>): LegacyEvent[] {
    // Every unified frame carries the envelope executionId/seq; iteration rides
    // on turn/tool frames. Capture them so legacy `agent_*` payloads can be stamped.
    if (typeof payload.executionId === "string" && payload.executionId) {
      this.executionId = payload.executionId;
    }
    if (typeof payload.iteration === "number") this.iteration = payload.iteration;

    switch (type) {
      // ===== lifecycle =====
      case "execution_start": {
        this.kind = payload.kind === "flow" ? "flow" : "agent";
        if (this.kind !== "agent") return []; // no flow_start handler; state only
        return [
          this.out("agent_start", {
            executionId: this.executionId,
            agentId: payload.agentId,
            agentName: payload.agentName,
            maxTurns: payload.maxTurns,
            startedAt: payload.startedAt,
          }),
        ];
      }
      case "turn_start": {
        this.openTurnId = typeof payload.id === "string" ? payload.id : null;
        if (this.kind !== "agent") return [];
        return [this.out("agent_turn_start", { turnId: payload.id, iteration: payload.iteration })];
      }
      case "turn_complete": {
        const out =
          this.kind === "agent"
            ? [
                this.out("agent_turn_complete", {
                  turnId: payload.id,
                  iteration: payload.iteration,
                  stopReason: payload.stopReason,
                  completedAt: payload.completedAt,
                }),
              ]
            : [];
        if (this.openTurnId === payload.id) this.openTurnId = null;
        return out;
      }
      case "execution_complete": {
        if ((payload.kind ?? this.kind) === "agent") {
          return [
            this.out("agent_complete", {
              executionId: this.executionId,
              success: payload.success,
              completedAt: payload.completedAt,
              stopReason: payload.stopReason,
            }),
          ];
        }
        return [
          this.out("flow_complete", {
            success: payload.success,
            completedAt: payload.completedAt,
            duration: payload.durationMs,
            finalOutput: payload.finalOutput,
            totalSteps: payload.totalSteps,
            successfulSteps: payload.successfulSteps,
            failedSteps: payload.failedSteps,
          }),
        ];
      }
      case "execution_error": {
        if ((payload.kind ?? this.kind) === "agent") {
          // API emits no execution_complete on agent failure; surface as a
          // terminal agent_error (recoverable:false → onEvent error in client.ts).
          return [this.out("agent_error", { recoverable: false, error: payload.error })];
        }
        return [
          this.out("flow_error", {
            error: payload.error,
            code: payload.code,
            upgradeUrl: payload.upgradeUrl,
          }),
        ];
      }
      case "error":
        // Unified `error` is the NON-terminal one. Route to agent_error
        // (recoverable → warn only), NOT legacy `error` (that branch is terminal).
        return [this.out("agent_error", { recoverable: true, error: payload.error })];
      case "ping":
        return [this.out("agent_ping", { timestamp: payload.timestamp })];

      // ===== text channel =====
      case "text_start":
        this.openTextBlockId = typeof payload.id === "string" ? payload.id : null;
        return []; // agent bubble created lazily by the first delta
      case "text_delta": {
        const delta = String(payload.delta ?? "");
        if (this.kind === "agent") {
          return [
            this.out("agent_turn_delta", {
              contentType: "text",
              delta,
              turnId: this.openTurnId ?? payload.id,
              iteration: this.iteration,
              executionId: this.executionId,
            }),
          ];
        }
        return [this.out("step_delta", { id: this.openStepId ?? payload.id, text: delta, stepType: "prompt" })];
      }
      case "text_complete":
        if (this.openTextBlockId === payload.id) this.openTextBlockId = null;
        return [];

      // ===== reasoning channel =====
      case "reasoning_start":
        this.openReasoningId = typeof payload.id === "string" ? payload.id : null;
        if (this.kind === "flow") return [this.out("reason_start", { id: payload.id })];
        return [];
      case "reasoning_delta": {
        const delta = String(payload.delta ?? "");
        if (this.kind === "agent") {
          return [
            this.out("agent_turn_delta", {
              contentType: "thinking",
              delta,
              turnId: this.openTurnId ?? payload.id,
              iteration: this.iteration,
              executionId: this.executionId,
            }),
          ];
        }
        return [this.out("reason_delta", { id: payload.id, delta })];
      }
      case "reasoning_complete": {
        const hasText = typeof payload.text === "string" && payload.text.length > 0;
        if (this.kind === "agent") {
          // E3: scope:'loop' (or a text-carrying close) is a reflection fold.
          if (payload.scope === "loop" || hasText) {
            return [
              this.out("agent_reflection", {
                reflection: payload.text ?? "",
                executionId: this.executionId,
                iteration: this.iteration,
              }),
            ];
          }
          return []; // turn-scoped thinking: closed by turn_complete
        }
        const out: LegacyEvent[] = [];
        if (hasText) out.push(this.out("reason_delta", { id: payload.id, delta: payload.text }));
        out.push(this.out("reason_complete", { id: payload.id }));
        return out;
      }

      // ===== tool channel =====
      case "tool_start": {
        if (this.kind === "agent") {
          return [
            this.out("agent_tool_start", {
              toolCallId: payload.toolCallId,
              toolName: payload.toolName,
              parameters: payload.parameters,
              executionId: this.executionId,
              iteration: payload.iteration ?? this.iteration,
              startedAt: payload.startedAt,
            }),
          ];
        }
        return [
          this.out("tool_start", {
            toolId: payload.toolCallId,
            toolName: payload.toolName,
            parameters: payload.parameters,
            executionId: this.executionId,
            iteration: payload.iteration ?? this.iteration,
            startedAt: payload.startedAt,
          }),
        ];
      }
      case "tool_input_delta": {
        if (this.kind === "agent") {
          return [
            this.out("agent_turn_delta", {
              contentType: "tool_input",
              delta: String(payload.delta ?? ""),
              toolCallId: payload.toolCallId,
            }),
          ];
        }
        return []; // flow tool-input isn't surfaced to the UI
      }
      case "tool_input_complete":
        return []; // args already set at tool_start; no handler
      case "tool_output_delta": {
        const delta = String(payload.delta ?? "");
        if (this.kind === "agent") {
          return [this.out("agent_tool_delta", { toolCallId: payload.toolCallId, delta })];
        }
        return [this.out("tool_delta", { toolId: payload.toolCallId, delta })];
      }
      case "tool_complete": {
        if (this.kind === "agent") {
          return [
            this.out("agent_tool_complete", {
              toolCallId: payload.toolCallId,
              result: payload.result,
              executionTime: payload.executionTime,
              completedAt: payload.completedAt,
            }),
          ];
        }
        return [
          this.out("tool_complete", {
            toolId: payload.toolCallId,
            result: payload.result,
            duration: payload.executionTime,
            completedAt: payload.completedAt,
          }),
        ];
      }

      // ===== media channel (triad → one agent_media) =====
      case "media_start": {
        const id = String(payload.id);
        this.mediaBuffers.set(id, {
          mediaType: typeof payload.mediaType === "string" ? payload.mediaType : undefined,
          role: typeof payload.role === "string" ? payload.role : undefined,
          toolCallId: payload.toolCallId,
          parts: [],
        });
        return [];
      }
      case "media_delta": {
        const buf = this.mediaBuffers.get(String(payload.id));
        if (buf && typeof payload.delta === "string") buf.parts.push(payload.delta);
        return [];
      }
      case "media_complete": {
        const id = String(payload.id);
        const buf = this.mediaBuffers.get(id);
        this.mediaBuffers.delete(id);
        const mediaType =
          (typeof payload.mediaType === "string" ? payload.mediaType : undefined) ??
          buf?.mediaType ??
          "application/octet-stream";
        const data = typeof payload.data === "string" ? payload.data : undefined;
        const url =
          typeof payload.url === "string"
            ? payload.url
            : buf && buf.parts.length > 0
              ? buf.parts.join("")
              : undefined;
        let part: Record<string, unknown> | null = null;
        if (data) {
          part = { type: "media", data, mediaType };
        } else if (url) {
          part = { type: mediaType.startsWith("image/") ? "image-url" : "file-url", url, mediaType };
        }
        if (!part) return [];
        return [
          this.out("agent_media", {
            media: [part],
            executionId: this.executionId,
            iteration: this.iteration,
            toolCallId: payload.toolCallId ?? buf?.toolCallId,
          }),
        ];
      }

      // ===== approvals =====
      case "approval_start":
        return [
          this.out("agent_approval_start", {
            approvalId: payload.approvalId,
            toolName: payload.toolName,
            toolType: payload.toolType,
            description: payload.description,
            reason: payload.reason,
            parameters: payload.parameters,
            executionId: this.executionId,
          }),
        ];
      case "approval_complete":
        return [
          this.out("agent_approval_complete", {
            approvalId: payload.approvalId,
            decision: payload.decision,
            executionId: this.executionId,
            toolName: payload.toolName,
            description: payload.description,
          }),
        ];

      // ===== await (local-tool / WebMCP pause) — onto the 3.35.0 step_await path =====
      case "await": {
        const raw = typeof payload.toolName === "string" ? payload.toolName : "";
        const toolName =
          payload.origin === "webmcp" && !raw.startsWith(WEBMCP_PREFIX) ? `${WEBMCP_PREFIX}${raw}` : raw;
        return [
          this.out("step_await", {
            awaitReason: "local_tool_required",
            toolName,
            parameters: payload.parameters,
            toolCallId: payload.toolCallId,
            toolId: payload.toolId,
            executionId: this.executionId,
            awaitedAt: payload.awaitedAt,
          }),
        ];
      }

      // ===== steps (flow) =====
      case "step_start":
        this.openStepId = typeof payload.id === "string" ? payload.id : null;
        return [
          this.out("step_start", {
            id: payload.id,
            name: payload.name,
            stepType: payload.stepType,
            index: payload.index,
            totalSteps: payload.totalSteps,
            startedAt: payload.startedAt,
            outputVariable: payload.outputVariable,
          }),
        ];
      case "step_complete": {
        const out = this.out("step_complete", {
          id: payload.id,
          name: payload.name,
          stepType: payload.stepType,
          success: payload.success,
          duration: payload.durationMs,
          result: payload.result,
          stopReason: payload.stopReason,
          completedAt: payload.completedAt,
          unresolvedVariables: payload.unresolvedVariables,
        });
        if (this.openStepId === payload.id) this.openStepId = null;
        return [out];
      }
      case "step_skip":
        return []; // no step_skip handler

      // ===== artifacts (1:1) =====
      case "artifact_start":
        return [
          this.out("artifact_start", {
            id: payload.id,
            artifactType: payload.artifactType,
            title: payload.title,
            component: payload.component,
          }),
        ];
      case "artifact_delta":
        return [this.out("artifact_delta", { id: payload.id, delta: payload.delta })];
      case "artifact_update":
        return [
          this.out("artifact_update", { id: payload.id, component: payload.component, props: payload.props }),
        ];
      case "artifact_complete":
        return [this.out("artifact_complete", { id: payload.id })];

      // ===== dropped (no legacy renderer) =====
      case "source":
      case "custom":
        return [];

      default:
        return [];
    }
  }

  /** Build a legacy event, dropping undefined fields so the payload is clean. */
  private out(payloadType: string, payload: Record<string, unknown>): LegacyEvent {
    const pruned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload)) {
      if (v !== undefined) pruned[k] = v;
    }
    return { payloadType, payload: pruned };
  }
}
