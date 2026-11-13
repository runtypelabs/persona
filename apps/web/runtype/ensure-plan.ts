/**
 * Pure planning for `ensure-agents.ts`: what to write to a client token so it
 * matches its entry. No I/O, so the dry-run plan and the write path agree.
 */

/** Durable-turn opt-in on a client token with no product surface. */
export type TokenConfig = { durableTurns?: { enabled?: boolean } };

/** The parts of an existing client token the plan compares. */
export type ExistingToken = {
  agentIds: string[];
  allowedOrigins: string[];
  config?: object | null;
};

export type TokenPlan = {
  action: "create" | "update" | "none";
  changed: Array<"agentIds" | "allowedOrigins" | "config">;
};

const sameSet = (a: readonly string[], b: readonly string[]) =>
  [...a].sort().join() === [...b].sort().join();

const sameConfig = (existing: ExistingToken["config"], wanted: TokenConfig) =>
  Object.entries(wanted).every(
    ([key, value]) => JSON.stringify((existing as Record<string, unknown> | null | undefined)?.[key] ?? null) === JSON.stringify(value)
  );

/** `agentId` is undefined in a dry run for an agent that does not exist yet. */
export function planToken(
  existing: ExistingToken | undefined,
  wanted: { agentId: string | undefined; allowedOrigins: readonly string[]; config?: TokenConfig }
): TokenPlan {
  if (!existing) return { action: "create", changed: [] };
  const changed: TokenPlan["changed"] = [];
  if (wanted.agentId === undefined || existing.agentIds.join() !== wanted.agentId) changed.push("agentIds");
  if (!sameSet(existing.allowedOrigins, wanted.allowedOrigins)) changed.push("allowedOrigins");
  if (wanted.config && !sameConfig(existing.config, wanted.config)) changed.push("config");
  return { action: changed.length ? "update" : "none", changed };
}

/** The token's config with the entry's keys applied; other keys (theme, copy) are kept. */
export function mergeTokenConfig(
  existing: ExistingToken["config"],
  wanted: TokenConfig | undefined
): Record<string, unknown> | undefined {
  return wanted ? { ...existing, ...wanted } : undefined;
}
