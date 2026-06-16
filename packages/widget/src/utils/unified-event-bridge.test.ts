import { describe, it, expect } from "vitest";
import { UnifiedToLegacyBridge, isUnifiedLifecycleStart, type LegacyEvent } from "./unified-event-bridge";
import { createUnifiedEventWrite } from "./__fixtures__/unified-translator.oracle";

type Frame = Record<string, unknown> & { type: string };

/** legacy frames → api oracle → parsed unified frames */
function legacyToUnified(legacy: Frame[], executionId?: string): Frame[] {
  const unified: Frame[] = [];
  const sink = (chunk: string) => {
    for (const part of chunk.split("\n\n")) {
      const dataLine = part.split("\n").find((l) => l.startsWith("data: "));
      if (!dataLine) continue;
      const json = dataLine.slice(6);
      if (json.trim() === "[DONE]") continue;
      try {
        unified.push(JSON.parse(json) as Frame);
      } catch {
        /* ignore */
      }
    }
  };
  const write = createUnifiedEventWrite(sink, executionId ? { executionId } : undefined);
  for (const f of legacy) write(`data: ${JSON.stringify(f)}\n\n`);
  return unified;
}

/** unified frames → widget bridge → legacy' events */
function unifiedToLegacy(unified: Frame[], executionId?: string): LegacyEvent[] {
  const bridge = new UnifiedToLegacyBridge(executionId ? { executionId } : undefined);
  const out: LegacyEvent[] = [];
  for (const f of unified) out.push(...bridge.push(f.type, f));
  return out;
}

/** full round-trip: legacy → unified → legacy' */
function roundTrip(legacy: Frame[], executionId = "exec_test"): { unified: Frame[]; legacy2: LegacyEvent[] } {
  const unified = legacyToUnified(legacy, executionId);
  return { unified, legacy2: unifiedToLegacy(unified, executionId) };
}

const byType = (evs: LegacyEvent[], t: string) => evs.filter((e) => e.payloadType === t);
const field = (e: LegacyEvent | undefined, k: string): unknown => e?.payload[k];
const textOf = (evs: LegacyEvent[]) =>
  byType(evs, "agent_turn_delta")
    .filter((e) => e.payload.contentType === "text")
    .map((e) => String(e.payload.delta ?? ""))
    .join("");
const thinkingOf = (evs: LegacyEvent[]) =>
  byType(evs, "agent_turn_delta")
    .filter((e) => e.payload.contentType === "thinking")
    .map((e) => String(e.payload.delta ?? ""))
    .join("");

describe("UnifiedToLegacyBridge — round-trip against the api oracle", () => {
  it("agent text stream preserves text, turnId, and lifecycle", () => {
    const { unified, legacy2 } = roundTrip([
      { type: "agent_start", executionId: "exec_test", agentId: "virtual", startedAt: "t0" },
      { type: "agent_turn_start", turnId: "turn_1", iteration: 1 },
      { type: "agent_turn_delta", executionId: "exec_test", iteration: 1, turnId: "turn_1", contentType: "text", delta: "Hello " },
      { type: "agent_turn_delta", executionId: "exec_test", iteration: 1, turnId: "turn_1", contentType: "text", delta: "world" },
      { type: "agent_turn_complete", turnId: "turn_1", iteration: 1, stopReason: "end_turn", completedAt: "t1" },
      { type: "agent_complete", executionId: "exec_test", success: true, stopReason: "end_turn", completedAt: "t1" },
    ]);

    // the oracle really did produce the neutral vocabulary
    expect(unified[0].type).toBe("execution_start");
    expect(unified.some((f) => f.type === "text_delta")).toBe(true);

    expect(byType(legacy2, "agent_start")).toHaveLength(1);
    expect(textOf(legacy2)).toBe("Hello world");
    // turnId recovered from the open turn (unified decouples block-id from turn)
    expect(field(byType(legacy2, "agent_turn_delta")[0], "turnId")).toBe("turn_1");
    expect(field(byType(legacy2, "agent_turn_complete")[0], "stopReason")).toBe("end_turn");
    const complete = byType(legacy2, "agent_complete")[0];
    expect(field(complete, "success")).toBe(true);
    expect(field(complete, "executionId")).toBe("exec_test");
  });

  it("agent text WITHOUT an explicit turn still renders (block-id fallback)", () => {
    // the verified minimal adapter omits agent_turn_start
    const { legacy2 } = roundTrip([
      { type: "agent_start", executionId: "exec_test", agentId: "virtual" },
      { type: "agent_turn_delta", executionId: "exec_test", iteration: 1, turnId: "turn_x", contentType: "text", delta: "hi" },
      { type: "agent_complete", executionId: "exec_test", success: true },
    ]);
    expect(textOf(legacy2)).toBe("hi");
    // no turn_start → bridge falls back to the unified text block id (stable, non-empty)
    expect(field(byType(legacy2, "agent_turn_delta")[0], "turnId")).toBeTruthy();
  });

  it("agent thinking round-trips through the reasoning channel", () => {
    const { unified, legacy2 } = roundTrip([
      { type: "agent_start", executionId: "exec_test", agentId: "virtual" },
      { type: "agent_turn_start", turnId: "turn_1", iteration: 1 },
      { type: "agent_turn_delta", executionId: "exec_test", iteration: 1, turnId: "turn_1", contentType: "thinking", delta: "let me think" },
      { type: "agent_turn_complete", turnId: "turn_1", iteration: 1 },
      { type: "agent_complete", executionId: "exec_test", success: true },
    ]);
    expect(unified.some((f) => f.type === "reasoning_delta")).toBe(true);
    expect(thinkingOf(legacy2)).toBe("let me think");
  });

  it("agent tool call preserves name, args, result, and toolCallId", () => {
    const { unified, legacy2 } = roundTrip([
      { type: "agent_start", executionId: "exec_test", agentId: "virtual" },
      { type: "agent_tool_start", executionId: "exec_test", iteration: 1, toolCallId: "tc1", toolName: "search", parameters: { q: "shoes" } },
      { type: "agent_tool_delta", toolCallId: "tc1", delta: "partial" },
      { type: "agent_tool_complete", toolCallId: "tc1", result: { hits: 3 }, executionTime: 42 },
      { type: "agent_complete", executionId: "exec_test", success: true },
    ]);
    expect(unified.some((f) => f.type === "tool_start")).toBe(true);

    const start = byType(legacy2, "agent_tool_start")[0];
    expect(field(start, "toolCallId")).toBe("tc1");
    expect(field(start, "toolName")).toBe("search");
    expect(field(start, "parameters")).toEqual({ q: "shoes" });

    expect(field(byType(legacy2, "agent_tool_delta")[0], "delta")).toBe("partial");

    const done = byType(legacy2, "agent_tool_complete")[0];
    expect(field(done, "result")).toEqual({ hits: 3 });
    expect(field(done, "executionTime")).toBe(42);
  });

  it("WebMCP agent_await maps onto the 3.35.0 step_await local-tool path with the webmcp: prefix", () => {
    const { unified, legacy2 } = roundTrip([
      { type: "agent_start", executionId: "exec_test", agentId: "virtual" },
      {
        type: "agent_await",
        executionId: "exec_test",
        toolId: "runtime_add_to_cart_1",
        toolName: "add_to_cart", // BARE on the wire
        origin: "webmcp",
        toolCallId: "toolu_123",
        parameters: { sku: "SHOE-003" },
        awaitedAt: "t2",
      },
    ]);
    // the oracle collapses agent_await → the neutral `await`
    expect(unified.some((f) => f.type === "await")).toBe(true);
    expect(unified.some((f) => f.type === "agent_await")).toBe(false);

    const awaitEv = byType(legacy2, "step_await")[0];
    expect(awaitEv).toBeDefined();
    expect(field(awaitEv, "awaitReason")).toBe("local_tool_required");
    expect(field(awaitEv, "toolName")).toBe("webmcp:add_to_cart"); // prefix synthesized by the bridge
    expect(field(awaitEv, "toolCallId")).toBe("toolu_123");
    expect(field(awaitEv, "parameters")).toEqual({ sku: "SHOE-003" });
    expect(field(awaitEv, "executionId")).toBe("exec_test");
  });

  it("tool-produced media round-trips to a single agent_media", () => {
    const { unified, legacy2 } = roundTrip([
      { type: "agent_start", executionId: "exec_test", agentId: "virtual" },
      {
        type: "agent_media",
        executionId: "exec_test",
        toolCallId: "tc1",
        media: [{ type: "image-url", url: "https://x/img.png", mediaType: "image/png" }],
      },
      { type: "agent_complete", executionId: "exec_test", success: true },
    ]);
    // oracle expands to the media triad
    expect(unified.filter((f) => f.type.startsWith("media_"))).toHaveLength(3);

    const media = byType(legacy2, "agent_media");
    expect(media).toHaveLength(1);
    const parts = field(media[0], "media") as Array<Record<string, unknown>>;
    expect(parts[0].type).toBe("image-url");
    expect(parts[0].url).toBe("https://x/img.png");
    expect(parts[0].mediaType).toBe("image/png");
  });

  it("approval round-trips", () => {
    const { legacy2 } = roundTrip([
      { type: "agent_start", executionId: "exec_test", agentId: "virtual" },
      { type: "agent_approval_start", approvalId: "ap1", toolName: "delete_file", toolType: "builtin", description: "Delete?", parameters: { path: "/x" } },
      { type: "agent_approval_complete", approvalId: "ap1", decision: "approved" },
    ]);
    const start = byType(legacy2, "agent_approval_start")[0];
    expect(field(start, "approvalId")).toBe("ap1");
    expect(field(start, "toolName")).toBe("delete_file");
    expect(field(byType(legacy2, "agent_approval_complete")[0], "decision")).toBe("approved");
  });

  it("artifacts round-trip 1:1", () => {
    const { legacy2 } = roundTrip([
      { type: "agent_start", executionId: "exec_test", agentId: "virtual" },
      { type: "artifact_start", id: "a1", artifactType: "markdown", title: "Doc" },
      { type: "artifact_delta", id: "a1", delta: "# Hello" },
      { type: "artifact_complete", id: "a1" },
    ]);
    expect(field(byType(legacy2, "artifact_start")[0], "title")).toBe("Doc");
    expect(field(byType(legacy2, "artifact_delta")[0], "delta")).toBe("# Hello");
    expect(byType(legacy2, "artifact_complete")).toHaveLength(1);
  });
});

describe("UnifiedToLegacyBridge — unit: kind routing, drops, and error mapping", () => {
  it("flow-kind text routes to step_delta (not agent_turn_delta)", () => {
    const b = new UnifiedToLegacyBridge();
    b.push("execution_start", { kind: "flow", executionId: "exec_test" });
    b.push("step_start", { id: "step_1", name: "Generate" });
    const evs = b.push("text_delta", { id: "text_1", delta: "flow text" });
    expect(evs).toHaveLength(1);
    expect(evs[0].payloadType).toBe("step_delta");
    expect(evs[0].payload.id).toBe("step_1"); // recovered from the open step
    expect(evs[0].payload.text).toBe("flow text");
  });

  it("drops events with no legacy renderer", () => {
    const b = new UnifiedToLegacyBridge();
    b.push("execution_start", { kind: "agent", executionId: "exec_test" });
    expect(b.push("source", { url: "https://x" })).toHaveLength(0);
    expect(b.push("custom", { name: "runtype.fallback", value: {} })).toHaveLength(0);
    expect(b.push("step_skip", { id: "s2" })).toHaveLength(0);
    expect(b.push("tool_input_complete", { toolCallId: "tc1", parameters: {} })).toHaveLength(0);
  });

  it("unified `error` (recoverable) → agent_error{recoverable:true}, never the terminal `error`", () => {
    const b = new UnifiedToLegacyBridge();
    b.push("execution_start", { kind: "agent", executionId: "exec_test" });
    const evs = b.push("error", { recoverable: true, error: { message: "transient" } });
    expect(evs[0].payloadType).toBe("agent_error");
    expect(evs[0].payload.recoverable).toBe(true);
  });

  it("execution_error{kind:agent} → terminal agent_error{recoverable:false}", () => {
    const b = new UnifiedToLegacyBridge();
    b.push("execution_start", { kind: "agent", executionId: "exec_test" });
    const evs = b.push("execution_error", { kind: "agent", error: { message: "boom" } });
    expect(evs[0].payloadType).toBe("agent_error");
    expect(evs[0].payload.recoverable).toBe(false);
  });

  it("loop-scoped reasoning_complete folds into agent_reflection", () => {
    const b = new UnifiedToLegacyBridge();
    b.push("execution_start", { kind: "agent", executionId: "exec_test" });
    b.push("reasoning_start", { id: "reason_1", scope: "loop" });
    const evs = b.push("reasoning_complete", { id: "reason_1", text: "I should retry", scope: "loop" });
    expect(evs[0].payloadType).toBe("agent_reflection");
    expect(evs[0].payload.reflection).toBe("I should retry");
  });

  it("ask_user_question (non-webmcp local tool) await keeps its bare name", () => {
    const b = new UnifiedToLegacyBridge();
    b.push("execution_start", { kind: "agent", executionId: "exec_test" });
    const evs = b.push("await", { toolName: "ask_user_question", toolCallId: "tc9", parameters: {} });
    expect(evs[0].payloadType).toBe("step_await");
    expect(evs[0].payload.awaitReason).toBe("local_tool_required");
    expect(evs[0].payload.toolName).toBe("ask_user_question"); // no webmcp prefix
  });
});

describe("isUnifiedLifecycleStart", () => {
  it("identifies the unified vocabulary from the first lifecycle frame", () => {
    expect(isUnifiedLifecycleStart("execution_start")).toBe(true);
    expect(isUnifiedLifecycleStart("agent_start")).toBe(false);
    expect(isUnifiedLifecycleStart("flow_start")).toBe(false);
    expect(isUnifiedLifecycleStart("step_start")).toBe(false);
  });
});
