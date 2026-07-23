import { mergeWithDefaults } from "../defaults";
import type { AgentWidgetConfig, AgentWidgetConfigPatch } from "../types";

// Same predicate as utils/deep-merge.ts: plain object, non-null, non-array.
// Class instances and DOM nodes also pass here, so replace-leaf paths guard the
// ones that must not be recursed into.
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Dotted paths whose plain-object value replaces wholesale instead of recursing.
// - user-defined key maps: recursive merge would strand stale keys from the old value
//   (headers, targetProviders, components, features.streamAnimation.plugins).
// - implementation objects: partial merge splices two impls into a broken hybrid
//   (agent, storageAdapter, voiceRecognition.provider.custom).
const REPLACE_LEAF_PATHS = new Set<string>([
  "headers",
  "agent",
  "storageAdapter",
  "components",
  "targetProviders",
  "voiceRecognition.provider.custom",
  "features.streamAnimation.plugins",
]);

// Recursive patch merge. A key merges recursively iff both previous and patch
// values are plain objects and the path is not a replace-leaf; otherwise the
// patch value replaces. A key present in the patch with value undefined is
// deleted from the result (an own undefined property would shadow defaults in
// mergeWithDefaults' spreads); absent keys are never visited, so they are
// preserved. theme/darkTheme need no special case: the both-sides-plain-object
// rule already reproduces mergeThemePartials/deepMerge (defaults.ts:225-236).
const mergePatch = (previous: unknown, patch: unknown, path: string): unknown => {
  if (!isPlainObject(previous) || !isPlainObject(patch)) return patch;
  if (REPLACE_LEAF_PATHS.has(path)) return patch;

  const result: Record<string, unknown> = { ...previous };
  for (const key of Object.keys(patch)) {
    if (patch[key] === undefined) {
      delete result[key];
      continue;
    }
    const childPath = path ? `${path}.${key}` : key;
    result[key] = mergePatch(previous[key], patch[key], childPath);
  }
  return result;
};

/**
 * Merge a config patch over the previous widget config with one consistent
 * recursive policy, then re-apply mergeWithDefaults so a cleared
 * (explicit-undefined) key resets to its default. The stored controller config
 * is already post-mergeWithDefaults, so re-applying it is idempotent and keeps
 * initial mount, live update, and rebuild on the same merge policy.
 */
export function mergeConfigUpdate(
  previousConfig: AgentWidgetConfig,
  patch: AgentWidgetConfigPatch
): AgentWidgetConfig {
  const merged = mergePatch(previousConfig, patch, "") as Partial<AgentWidgetConfig>;
  return mergeWithDefaults(merged) as AgentWidgetConfig;
}
