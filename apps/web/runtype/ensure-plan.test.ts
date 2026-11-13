import { describe, expect, it } from "vitest";
import { mergeTokenConfig, planToken } from "./ensure-plan.ts";

const origins = ["https://example.com", "http://localhost:5173"];
const durable = { durableTurns: { enabled: true } };

describe("planToken", () => {
  it("creates a token that does not exist", () => {
    expect(planToken(undefined, { agentId: "agent_1", allowedOrigins: origins })).toEqual({
      action: "create",
      changed: [],
    });
  });

  it("leaves a matching token alone, whatever the origin order", () => {
    const existing = { agentIds: ["agent_1"], allowedOrigins: [...origins].reverse(), config: { ...durable } };
    expect(planToken(existing, { agentId: "agent_1", allowedOrigins: origins, config: durable })).toEqual({
      action: "none",
      changed: [],
    });
  });

  it("names every field that differs", () => {
    const existing = { agentIds: ["agent_old"], allowedOrigins: ["https://example.com"], config: null };
    expect(planToken(existing, { agentId: "agent_1", allowedOrigins: origins, config: durable })).toEqual({
      action: "update",
      changed: ["agentIds", "allowedOrigins", "config"],
    });
  });

  it("treats an agent with no id yet (dry run of a new agent) as a change", () => {
    const existing = { agentIds: ["agent_1"], allowedOrigins: origins };
    expect(planToken(existing, { agentId: undefined, allowedOrigins: origins }).changed).toEqual(["agentIds"]);
  });

  it("ignores token config when the entry declares none", () => {
    const existing = { agentIds: ["agent_1"], allowedOrigins: origins, config: { welcomeMessage: "hi" } };
    expect(planToken(existing, { agentId: "agent_1", allowedOrigins: origins }).action).toBe("none");
  });
});

describe("mergeTokenConfig", () => {
  it("adds the entry's keys and keeps the token's others", () => {
    expect(mergeTokenConfig({ welcomeMessage: "hi" }, durable)).toEqual({ welcomeMessage: "hi", ...durable });
    expect(mergeTokenConfig({ welcomeMessage: "hi" }, undefined)).toBeUndefined();
  });
});
