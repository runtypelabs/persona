import { describe, it, expect } from "vitest";
import { resolveTarget } from "./target";

describe("resolveTarget", () => {
  it("resolves a Runtype agent TypeID to agentId routing", () => {
    expect(resolveTarget("agent_01k")).toEqual({
      kind: "agentId",
      agentId: "agent_01k",
    });
  });

  it("resolves a Runtype flow TypeID to flowId routing", () => {
    expect(resolveTarget("flow_01k")).toEqual({
      kind: "flowId",
      flowId: "flow_01k",
    });
  });

  it("accepts an explicit runtype: prefix on a TypeID", () => {
    expect(resolveTarget("runtype:agent_01k")).toEqual({
      kind: "agentId",
      agentId: "agent_01k",
    });
  });

  it("routes a provider-prefixed target through its registered resolver", () => {
    const resolved = resolveTarget("eve:support", {
      eve: (id) => ({ payload: { assistant: id } }),
    });
    expect(resolved).toEqual({ kind: "payload", payload: { assistant: "support" } });
  });

  it("uses a default resolver for a bare name when registered", () => {
    const resolved = resolveTarget("support", {
      default: (id) => ({ payload: { target: id } }),
    });
    expect(resolved).toEqual({ kind: "payload", payload: { target: "support" } });
  });

  it("throws for an unknown provider prefix", () => {
    expect(() => resolveTarget("eve:support")).toThrow(/no target provider/i);
  });

  it("throws for a bare name with no TypeID and no default resolver", () => {
    expect(() => resolveTarget("support")).toThrow(/support/);
  });

  it("throws for an empty target", () => {
    expect(() => resolveTarget("   ")).toThrow(/empty/i);
  });
});
