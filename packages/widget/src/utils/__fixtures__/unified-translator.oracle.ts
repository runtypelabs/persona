/**
 * TEST ORACLE — vendored copy of the runtype-core `createUnifiedEventWrite`
 * translator (the api-side legacy → unified 33-event encoder).
 *
 * NOT shipped. Used only by `unified-event-bridge.test.ts` as the inverse
 * reference: `legacy frames → THIS oracle → unified frames → UnifiedToLegacyBridge
 * → legacy frames'` must be semantically equal to the original. Keeping a real
 * copy here means the round-trip test fails loudly if the api mapping and the
 * widget bridge ever drift.
 *
 * The only edit vs the api source is the removed `getLogger` import (the
 * per-frame error log is a no-op here).
 */

type Json = Record<string, unknown>;

type ExecutionKind = "agent" | "flow";

interface UnifiedEventWriteOptions {
  executionId?: string;
}

const ENVELOPE_KEYS = new Set(["type", "executionId", "seq"]);

function omitEnvelope(data: Json): Json {
  const out: Json = {};
  for (const [k, v] of Object.entries(data)) {
    if (!ENVELOPE_KEYS.has(k)) out[k] = v;
  }
  return out;
}

class UnifiedEventTranslator {
  private executionId: string;
  private seq = 0;
  private kind: ExecutionKind = "flow";
  private blockCounter = 0;
  private openText: string | null = null;
  private openTextBuffer = "";
  private openReasoning: string | null = null;
  private openReasoningBuffer = "";

  constructor(
    private readonly sink: (chunk: string) => void,
    options?: UnifiedEventWriteOptions
  ) {
    this.executionId = options?.executionId ?? "";
  }

  private mint(prefix: string): string {
    this.blockCounter += 1;
    return `${prefix}_${this.blockCounter}`;
  }

  private out(type: string, payload: Json): void {
    const frame: Json = { type, executionId: this.executionId, seq: this.seq, ...payload };
    this.seq += 1;
    this.sink(`event: ${type}\ndata: ${JSON.stringify(frame)}\n\n`);
  }

  /**
   * Parent model tool-call id stamped by the `tool_nested` FilteredStream as
   * `toolContext.toolId` (a flow running as a tool enriches its frames this way).
   * Surfaced on the text/reasoning channel as `parentToolCallId` so consumers can
   * route nested streamed output into the parent tool's row (PR #4602). Undefined
   * for top-level output.
   */
  private parentToolCallId(data: Json): string | undefined {
    const toolContext = data.toolContext;
    if (toolContext && typeof toolContext === "object") {
      const toolId = (toolContext as Json).toolId;
      if (typeof toolId === "string" && toolId) return toolId;
    }
    return undefined;
  }

  private emitTextDelta(delta: unknown, parentToolCallId?: string): void {
    if (delta == null || delta === "") return;
    if (!this.openText) {
      this.openText = this.mint("text");
      this.openTextBuffer = "";
      this.out("text_start", {
        id: this.openText,
        ...(this.kind === "agent" ? { role: "assistant" } : {}),
        ...(parentToolCallId ? { parentToolCallId } : {}),
      });
    }
    const text = String(delta);
    this.openTextBuffer += text;
    this.out("text_delta", { id: this.openText, delta: text });
  }

  private closeText(): void {
    if (!this.openText) return;
    // U2: carry the assembled text so a non-streaming consumer can read the
    // finished message off `text_complete` instead of re-concatenating deltas.
    this.out("text_complete", {
      id: this.openText,
      ...(this.openTextBuffer ? { text: this.openTextBuffer } : {}),
    });
    this.openText = null;
    this.openTextBuffer = "";
  }

  private ensureReasoningOpen(scope?: "turn" | "loop", parentToolCallId?: string): void {
    if (this.openReasoning) return;
    this.openReasoning = this.mint("reason");
    this.openReasoningBuffer = "";
    this.out("reasoning_start", {
      id: this.openReasoning,
      ...(scope ? { scope } : {}),
      ...(parentToolCallId ? { parentToolCallId } : {}),
    });
  }

  private emitReasoningDelta(delta: unknown, parentToolCallId?: string): void {
    if (delta == null || delta === "") return;
    this.ensureReasoningOpen(undefined, parentToolCallId);
    const text = String(delta);
    this.openReasoningBuffer += text;
    this.out("reasoning_delta", { id: this.openReasoning, delta: text });
  }

  private closeReasoning(): void {
    if (!this.openReasoning) return;
    // U2: carry the assembled reasoning text (parity with text_complete).
    this.out("reasoning_complete", {
      id: this.openReasoning,
      ...(this.openReasoningBuffer ? { text: this.openReasoningBuffer } : {}),
    });
    this.openReasoning = null;
    this.openReasoningBuffer = "";
  }

  private closeChannels(): void {
    this.closeText();
    this.closeReasoning();
  }

  private fallbackInfo(data: Json): Json | undefined {
    const used = data.usedFallback === true;
    const executions = Array.isArray(data.fallbackExecutions) ? data.fallbackExecutions : [];
    if (!used && executions.length === 0) return undefined;
    const attempts = executions.map((entry: unknown, index: number) => {
      const e = (entry ?? {}) as Json;
      return {
        attempt: typeof e.attempt === "number" ? e.attempt : index + 1,
        type: typeof e.fallbackType === "string" ? e.fallbackType : "model",
        ...(e.fallbackModel != null ? { model: e.fallbackModel } : {}),
        success: true,
      };
    });
    return {
      fallback: {
        used,
        ...(data.modelUsed != null
          ? { model: data.modelUsed }
          : data.fallbackModel != null
            ? { model: data.fallbackModel }
            : {}),
        attempts,
        exhausted: false,
      },
    };
  }

  private handle(type: string, data: Json): void {
    switch (type) {
      case "agent_start":
        this.kind = "agent";
        if (typeof data.executionId === "string") this.executionId = data.executionId;
        this.out("execution_start", {
          kind: "agent",
          startedAt: data.startedAt ?? new Date().toISOString(),
          agentId: data.agentId,
          agentName: data.agentName,
          maxTurns: data.maxTurns,
          config: data.config,
        });
        break;
      case "agent_iteration_start":
      case "agent_iteration_complete":
        break;
      case "agent_turn_start":
        this.closeChannels();
        this.out("turn_start", {
          id: data.turnId,
          iteration: data.iteration,
          turnIndex: data.turnIndex,
          role: data.role ?? "assistant",
        });
        break;
      case "agent_turn_delta": {
        const contentType = data.contentType;
        if (contentType === "thinking") this.emitReasoningDelta(data.delta);
        else if (contentType === "tool_input")
          this.out("tool_input_delta", {
            toolCallId: data.turnId ?? this.mint("toolinput"),
            delta: String(data.delta ?? ""),
          });
        else this.emitTextDelta(data.delta);
        break;
      }
      case "agent_turn_complete":
        this.closeChannels();
        this.out("turn_complete", {
          id: data.turnId,
          iteration: data.iteration,
          role: data.role ?? "assistant",
          content: data.content,
          tokens: data.tokens,
          cost: data.cost,
          stopReason: data.stopReason,
          completedAt: data.completedAt,
        });
        break;
      case "agent_tool_start":
        this.out("tool_start", {
          toolCallId: data.toolCallId,
          toolName: data.toolName,
          toolType: data.toolType ?? "builtin",
          iteration: data.iteration,
          parameters: data.parameters,
          hiddenParameterNames: data.hiddenParameterNames,
          origin: data.origin,
          pageOrigin: data.pageOrigin,
        });
        break;
      case "agent_tool_delta":
        this.out("tool_output_delta", {
          toolCallId: data.toolCallId,
          delta: String(data.delta ?? ""),
        });
        break;
      case "agent_tool_input_delta":
        this.out("tool_input_delta", {
          toolCallId: data.toolCallId,
          delta: String(data.delta ?? ""),
        });
        break;
      case "agent_tool_input_complete":
        this.out("tool_input_complete", {
          toolCallId: data.toolCallId,
          toolName: data.toolName,
          parameters: (data.parameters as Json) ?? {},
          hiddenParameterNames: data.hiddenParameterNames,
        });
        break;
      case "agent_tool_complete":
        this.out("tool_complete", {
          toolCallId: data.toolCallId,
          toolName: data.toolName,
          success: data.success ?? true,
          result: data.result,
          executionTime: data.executionTime,
          iteration: data.iteration,
        });
        break;
      case "agent_media":
        this.emitMedia(data);
        break;
      case "agent_approval_start":
        this.out("approval_start", {
          approvalId: data.approvalId,
          toolCallId: data.toolCallId,
          toolName: data.toolName,
          toolType: data.toolType,
          description: data.description,
          reason: data.reason,
          parameters: data.parameters,
          timeout: data.timeout,
          startedAt: data.startedAt,
          iteration: data.iteration,
        });
        break;
      case "agent_approval_complete":
        this.out("approval_complete", {
          approvalId: data.approvalId,
          decision: data.decision,
          completedAt: data.completedAt,
          resolvedBy: data.resolvedBy,
        });
        break;
      case "agent_await":
        this.out("await", {
          toolId: data.toolId,
          toolCallId: data.toolCallId,
          toolName: data.toolName,
          parameters: data.parameters,
          awaitedAt: data.awaitedAt,
          origin: data.origin,
          pageOrigin: data.pageOrigin,
        });
        break;
      case "agent_reflection": {
        const id = this.mint("reason");
        this.out("reasoning_start", { id, scope: "loop" });
        this.out("reasoning_complete", { id, text: data.reflection, scope: "loop" });
        break;
      }
      case "agent_skill_loaded": {
        const toolCallId = (data.toolCallId as string) ?? this.mint("skill");
        const toolName = `skill:${String(data.skill ?? "unknown")}`;
        this.out("tool_start", {
          toolCallId,
          toolName,
          toolType: "builtin",
          iteration: data.iteration,
        });
        this.out("tool_complete", {
          toolCallId,
          toolName,
          success: true,
          result: {
            kind: "skill_loaded",
            skill: data.skill,
            activatedCapabilities: data.activatedCapabilities ?? [],
          },
          iteration: data.iteration,
        });
        break;
      }
      case "agent_skill_proposed": {
        const toolCallId = (data.toolCallId as string) ?? this.mint("propose");
        this.out("tool_start", {
          toolCallId,
          toolName: "propose_skill",
          toolType: "builtin",
          iteration: data.iteration,
        });
        this.out("tool_complete", {
          toolCallId,
          toolName: "propose_skill",
          success: true,
          result: {
            kind: "skill_proposed",
            skill: data.skill,
            outcome: data.outcome,
            proposalId: data.proposalId,
          },
          iteration: data.iteration,
        });
        break;
      }
      case "agent_complete":
        this.closeChannels();
        if (data.success === false || data.stopReason === "error") {
          this.out("execution_error", {
            kind: "agent",
            error: this.toErrorPayload(data.error ?? "Agent execution failed"),
            completedAt: data.completedAt,
          });
        } else {
          this.out("execution_complete", {
            kind: "agent",
            success: data.success ?? true,
            iterations: data.iterations,
            stopReason: data.stopReason,
            completedAt: data.completedAt,
            durationMs: data.duration,
            finalOutput: data.finalOutput,
            totalCost: data.totalCost,
            totalTokens: data.totalTokens,
          });
        }
        break;
      case "agent_error":
        if (data.recoverable)
          this.out("error", { error: this.toErrorPayload(data.error), recoverable: true });
        else this.out("execution_error", { kind: this.kind, error: this.toErrorPayload(data.error) });
        break;
      case "agent_ping":
        this.out("ping", { timestamp: data.timestamp ?? new Date().toISOString() });
        break;

      case "flow_start":
        this.kind = "flow";
        if (typeof data.executionId === "string") this.executionId = data.executionId;
        this.out("execution_start", {
          kind: "flow",
          startedAt: data.startedAt ?? new Date().toISOString(),
          flowId: data.flowId,
          flowName: data.flowName,
          totalSteps: data.totalSteps,
          source: data.source,
        });
        break;
      case "flow_complete":
        this.closeChannels();
        this.out("execution_complete", {
          kind: "flow",
          success: data.success ?? true,
          completedAt: data.completedAt,
          durationMs: data.duration ?? data.executionTime,
          finalOutput: data.finalOutput,
          totalSteps: data.totalSteps,
          successfulSteps: data.successfulSteps,
          failedSteps: data.failedSteps,
        });
        break;
      case "flow_error":
        this.closeChannels();
        this.out("execution_error", {
          kind: "flow",
          error: this.toErrorPayload(data.error),
          code: data.code,
          upgradeUrl: data.upgradeUrl,
        });
        break;
      case "flow_await":
        this.out("await", {
          toolId: data.toolId,
          toolCallId: data.toolCallId,
          toolName: data.toolName,
          parameters: data.parameters,
          awaitedAt: data.awaitedAt,
          origin: data.origin,
          pageOrigin: data.pageOrigin,
        });
        break;
      case "step_start":
        this.closeChannels();
        this.out("step_start", {
          id: data.id ?? data.stepId,
          name: data.name ?? data.stepName,
          stepType: data.stepType,
          index: data.index,
          totalSteps: data.totalSteps,
          startedAt: data.startedAt,
          outputVariable: data.outputVariable,
        });
        break;
      case "step_delta":
        this.emitTextDelta(data.text ?? data.delta, this.parentToolCallId(data));
        break;
      case "step_complete":
        this.closeChannels();
        this.out("step_complete", {
          id: data.id ?? data.stepId,
          name: data.name ?? data.stepName,
          stepType: data.stepType,
          success: data.success ?? true,
          durationMs: data.duration ?? data.durationMs ?? data.executionTime,
          result: data.result ?? data.output,
          stopReason: data.stopReason,
          completedAt: data.completedAt,
          unresolvedVariables: data.unresolvedVariables,
          ...(this.fallbackInfo(data) ?? {}),
        });
        break;
      case "step_error":
        this.closeChannels();
        this.out("step_complete", {
          id: data.id ?? data.stepId,
          name: data.name,
          stepType: data.stepType,
          success: false,
          error: data.error,
          durationMs: data.executionTime,
        });
        break;
      case "step_skip":
        this.out("step_skip", {
          id: data.id,
          name: data.name,
          stepType: data.stepType,
          index: data.index,
          totalSteps: data.totalSteps,
          when: data.when,
          skippedAt: data.skippedAt,
        });
        break;
      case "step_await":
        this.out("await", {
          toolId: data.toolId,
          toolCallId: data.toolCallId,
          toolName: data.toolName,
          parameters: data.parameters,
          awaitedAt: data.awaitedAt,
        });
        break;

      case "tool_start":
        this.out("tool_start", {
          toolCallId: data.toolCallId ?? data.toolId,
          toolName: data.toolName ?? data.name,
          toolType: data.toolType ?? "builtin",
          stepId: data.stepId,
          parameters: data.parameters,
          hiddenParameterNames: data.hiddenParameterNames,
          startedAt: data.startedAt,
        });
        break;
      case "tool_delta":
        this.out("tool_output_delta", {
          toolCallId: data.toolId ?? data.toolCallId,
          delta: String(data.delta ?? ""),
        });
        break;
      case "tool_input_delta":
        this.out("tool_input_delta", {
          toolCallId: data.toolCallId ?? data.toolId,
          delta: String(data.delta ?? ""),
        });
        break;
      case "tool_input_complete":
        this.out("tool_input_complete", {
          toolCallId: data.toolCallId ?? data.toolId,
          toolName: data.toolName,
          parameters: (data.parameters as Json) ?? {},
          hiddenParameterNames: data.hiddenParameterNames,
        });
        break;
      case "tool_complete":
        this.out("tool_complete", {
          toolCallId: data.toolCallId ?? data.toolId,
          toolName: data.toolName ?? data.name,
          success: data.success ?? true,
          result: data.result,
          error: data.error,
          executionTime: data.executionTime,
          stepId: data.stepId,
        });
        break;
      case "tool_error":
        this.out("tool_complete", {
          toolCallId: data.toolId ?? data.toolCallId,
          toolName: data.name,
          success: false,
          error: data.error,
          executionTime: data.executionTime,
        });
        break;
      case "chunk":
        this.emitTextDelta(data.text, this.parentToolCallId(data));
        break;

      case "text_start":
        if (!this.openText) {
          this.openText = (data.id as string) ?? this.mint("text");
          this.openTextBuffer = "";
          const parentToolCallId = this.parentToolCallId(data);
          this.out("text_start", {
            id: this.openText,
            ...(parentToolCallId ? { parentToolCallId } : {}),
          });
        }
        break;
      case "text_end":
        this.closeText();
        break;
      case "reason_start":
        this.ensureReasoningOpen(undefined, this.parentToolCallId(data));
        break;
      case "reason_delta":
        this.emitReasoningDelta(
          data.reasoningText ?? data.delta ?? data.text,
          this.parentToolCallId(data)
        );
        break;
      case "reason_complete":
        this.closeReasoning();
        break;
      case "source":
        this.out("source", omitEnvelope(data));
        break;

      case "fallback_start":
        this.out("custom", {
          name: "runtype.fallback",
          value: { phase: "start", ...omitEnvelope(data) },
        });
        break;
      case "fallback_complete":
        this.out("custom", {
          name: "runtype.fallback",
          value: { phase: "complete", ...omitEnvelope(data) },
        });
        break;
      case "fallback_exhausted":
        this.out("custom", {
          name: "runtype.fallback",
          value: { phase: "exhausted", ...omitEnvelope(data) },
        });
        break;

      case "artifact_start":
        this.out("artifact_start", {
          id: data.id,
          artifactType: data.artifactType,
          title: data.title,
          component: data.component,
        });
        break;
      case "artifact_delta":
        this.out("artifact_delta", { id: data.id, delta: data.delta });
        break;
      case "artifact_update":
        this.out("artifact_update", { id: data.id, component: data.component, props: data.props });
        break;
      case "artifact_complete":
        this.out("artifact_complete", { id: data.id });
        break;
      case "artifact":
        this.out("artifact_start", {
          id: data.id,
          artifactType: data.artifactType ?? "markdown",
          title: data.title,
          component: data.component,
        });
        this.out("artifact_complete", { id: data.id });
        break;

      case "dispatch_error":
        this.closeChannels();
        this.out("execution_error", {
          kind: this.kind,
          error: this.toErrorPayload(data),
          code: data.code,
          upgradeUrl: data.upgradeUrl,
        });
        break;

      default:
        break;
    }
  }

  private emitMedia(data: Json): void {
    const media = Array.isArray(data.media) ? data.media : [];
    for (const raw of media) {
      const item = (raw ?? {}) as Json;
      const id = this.mint("media");
      const mediaType =
        typeof item.mediaType === "string"
          ? item.mediaType
          : item.type === "image-url"
            ? "image"
            : "application/octet-stream";
      this.out("media_start", {
        id,
        mediaType,
        role: "assistant",
        toolCallId: data.toolCallId,
      });
      const fragment =
        typeof item.url === "string" ? item.url : typeof item.data === "string" ? item.data : "";
      if (fragment) this.out("media_delta", { id, delta: fragment });
      this.out("media_complete", {
        id,
        mediaType,
        url: item.url,
        data: item.data,
        toolCallId: data.toolCallId,
      });
    }
  }

  private toErrorPayload(error: unknown): Json | string {
    if (typeof error === "string") return error;
    if (error && typeof error === "object") {
      const e = error as Json;
      if (typeof e.code === "string" && typeof e.message === "string") {
        return {
          code: e.code,
          message: e.message,
          ...(e.details ? { details: e.details } : {}),
        };
      }
      if (typeof e.error === "string") return e.error;
      if (typeof e.message === "string")
        return { code: typeof e.code === "string" ? e.code : "error", message: e.message };
    }
    return { code: "error", message: "Execution failed" };
  }

  write(chunk: string): void {
    const parts = chunk.split("\n\n");
    for (const part of parts) {
      if (!part.trim()) continue;
      let dataStr: string | null = null;
      for (const line of part.split("\n")) {
        if (line.startsWith("data: ")) dataStr = line.slice(6);
      }
      if (dataStr === null) {
        this.sink(`${part}\n\n`);
        continue;
      }
      if (dataStr.trim() === "[DONE]") {
        this.sink("data: [DONE]\n\n");
        continue;
      }
      let data: Json;
      try {
        data = JSON.parse(dataStr) as Json;
      } catch {
        this.sink(`${part}\n\n`);
        continue;
      }
      const type = data?.type;
      if (typeof type !== "string") continue;
      try {
        this.handle(type, data);
      } catch {
        // oracle fixture: swallow per-frame translation errors (prod logs via getLogger)
      }
    }
  }
}

export function createUnifiedEventWrite(
  sink: (chunk: string) => void,
  options?: UnifiedEventWriteOptions
): (chunk: string) => void {
  const translator = new UnifiedEventTranslator(sink, options);
  return (chunk: string) => translator.write(chunk);
}
