/**
 * Target resolution for the normalized, backend-neutral `target` field.
 *
 * `target` is a single string that selects which backend resource a widget
 * talks to, optimized for a browser widget (always serializable, no live
 * objects). Three shapes are supported:
 *
 *   - Runtype TypeID (no prefix): `"agent_…"` / `"flow_…"` route to the
 *     Runtype agent/flow paths. The TypeID prefix is self-describing, so no
 *     wrapper is needed for the common case.
 *   - Provider-prefixed: `"<provider>:<id>"` is handed to the matching
 *     `targetProviders[provider]` resolver, which returns the dispatch payload
 *     fragment for that backend (e.g. `eve`, `langgraph`). `"runtype:…"` is a
 *     built-in that re-detects a TypeID.
 *   - Bare name: `"support"` requires a `targetProviders.default` resolver,
 *     otherwise it throws (a bare name is ambiguous without one).
 *
 * Resolvers are registered, not passed as the value, which keeps `target`
 * itself a plain string that survives script-tag installs, `data-config`,
 * persisted state, and codegen.
 */

/** Resolver for a provider-prefixed (or default) target id. */
export type TargetResolver = (id: string) => { payload: Record<string, unknown> };

/** Normalized routing produced from a `target` string. */
export type ResolvedTarget =
  | { kind: "agentId"; agentId: string }
  | { kind: "flowId"; flowId: string }
  | { kind: "payload"; payload: Record<string, unknown> };

const RUNTYPE_AGENT_PREFIX = "agent_";
const RUNTYPE_FLOW_PREFIX = "flow_";

function detectRuntypeTypeId(id: string): ResolvedTarget | null {
  if (id.startsWith(RUNTYPE_AGENT_PREFIX)) return { kind: "agentId", agentId: id };
  if (id.startsWith(RUNTYPE_FLOW_PREFIX)) return { kind: "flowId", flowId: id };
  return null;
}

/**
 * Resolve a `target` string into normalized routing. Pure and synchronous so
 * it can run on the dispatch hot path and be unit-tested in isolation.
 */
export function resolveTarget(
  target: string,
  targetProviders?: Record<string, TargetResolver>,
): ResolvedTarget {
  const trimmed = target.trim();
  if (!trimmed) {
    throw new Error("[Persona] `target` is empty.");
  }

  const colon = trimmed.indexOf(":");
  if (colon > 0) {
    const prefix = trimmed.slice(0, colon);
    const rest = trimmed.slice(colon + 1);

    // Built-in: an explicit `runtype:` prefix wrapping a TypeID.
    if (prefix === "runtype") {
      const detected = detectRuntypeTypeId(rest);
      if (detected) return detected;
      throw new Error(
        `[Persona] target "runtype:${rest}" is not a valid Runtype agent_/flow_ id.`,
      );
    }

    const resolver = targetProviders?.[prefix];
    if (!resolver) {
      throw new Error(
        `[Persona] No target provider registered for "${prefix}". ` +
          `Add a \`targetProviders.${prefix}\` resolver, or use a Runtype agent_/flow_ id.`,
      );
    }
    return { kind: "payload", payload: resolver(rest).payload };
  }

  // No prefix: a bare Runtype TypeID is self-describing.
  const detected = detectRuntypeTypeId(trimmed);
  if (detected) return detected;

  // Bare, non-TypeID name: only resolvable via an explicit default resolver.
  const fallback = targetProviders?.default;
  if (fallback) return { kind: "payload", payload: fallback(trimmed).payload };

  throw new Error(
    `[Persona] target "${trimmed}" has no provider prefix and is not a Runtype agent_/flow_ id. ` +
      `Use "<provider>:${trimmed}", a Runtype TypeID, or register a \`targetProviders.default\` resolver.`,
  );
}
