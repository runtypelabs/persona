import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createPersonaSSEStream as canonicalStream } from "../../../packages/persona-wire/src/index";
import { createPersonaSSEStream as specializedStream } from "../../../examples/ai-sdk-next/app/lib/persona-wire";
import type { RuntypeExecutionStreamEvent } from "../../../packages/widget/src/generated/runtype-openapi-contract";

// Required fields for the reference adapter's subset of the public union.
// The output type is checked against the pinned generated API contract. No
// network or extra runtime dependency is needed by any copied example.
const envelope = { executionId: z.string(), seq: z.number() };
const turn = { ...envelope, id: z.string(), role: z.enum(["user", "assistant", "system"]) };
const eventSchema: z.ZodType<RuntypeExecutionStreamEvent> = z.discriminatedUnion("type", [
  z.object({ ...envelope, type: z.literal("execution_start"), kind: z.enum(["agent", "flow"]), startedAt: z.string() }),
  z.object({ ...envelope, type: z.literal("execution_complete"), kind: z.enum(["agent", "flow"]), success: z.boolean() }),
  z.object({ ...envelope, type: z.literal("execution_error"), kind: z.enum(["agent", "flow"]), error: z.union([z.string(), z.object({ code: z.string(), message: z.string() })]) }),
  z.object({ ...turn, type: z.literal("turn_start") }),
  z.object({ ...turn, type: z.literal("turn_complete") }),
  z.object({ ...envelope, type: z.literal("text_start"), id: z.string() }),
  z.object({ ...envelope, type: z.literal("text_delta"), id: z.string(), delta: z.string() }),
  z.object({ ...envelope, type: z.literal("text_complete"), id: z.string() }),
  z.object({ ...envelope, type: z.literal("tool_start"), toolCallId: z.string(), toolName: z.string(), toolType: z.string(), parameters: z.record(z.unknown()).optional() }),
  z.object({ ...envelope, type: z.literal("tool_complete"), toolCallId: z.string(), success: z.boolean() }),
]);

async function frames(response: Response) {
  return (await response.text()).trim().split("\n\n").map(block => {
    const data = JSON.parse(block.split("\n").find(line => line.startsWith("data: "))!.slice(6));
    expect(block.split("\n")[0]).toBe(`event: ${data.type}`);
    eventSchema.parse(data);
    return data as RuntypeExecutionStreamEvent;
  });
}

describe.each([["canonical", canonicalStream], ["specialized", specializedStream]] as const)("%s example stream contract", (_name, stream) => {
  it("emits valid text/tool/text frames and closes channels in order", async () => {
    const emitted = await frames(stream(({ emit }) => {
      emit.textDelta("Before");
      emit.toolCall("lookup", { query: "hello" }, { toolCallId: "call_a" });
      emit.textDelta("After");
      emit.complete();
    }));
    expect(emitted.map(frame => frame.type)).toEqual([
      "execution_start", "turn_start", "text_start", "text_delta", "text_complete",
      "tool_start", "tool_complete", "text_start", "text_delta", "text_complete", "turn_complete", "execution_complete",
    ]);
    expect(new Set(emitted.map(frame => frame.executionId)).size).toBe(1);
    expect(emitted.map(frame => frame.seq)).toEqual(emitted.map((_, index) => index));
  });

  it("emits a schema-valid terminal error for a failed handler", async () => {
    const emitted = await frames(stream(() => { throw new Error("offline"); }));
    expect(emitted.map(frame => frame.type)).toEqual(["execution_start", "execution_error"]);
    expect(emitted[1]).toMatchObject({ error: { code: "adapter_error", message: "offline" } });
  });
});
