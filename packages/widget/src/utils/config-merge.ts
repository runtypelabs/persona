import { DEFAULTS_V5, mergeWithDefaults } from "../defaults";
import type { AgentWidgetConfig, AgentWidgetConfigPatch } from "../types";
import { setPanelAliasProvenance, updatePanelAliasProvenance } from "./panel-config";
import { setStyleProvenance, updateStyleProvenance } from "./style-provenance";

import { omitInheritedDefaults, setDefaultProvenance, updateDefaultProvenance, versionedDefaultPaths } from "./defaults-provenance";

// Same predicate as utils/deep-merge.ts: plain object, non-null, non-array.
// Class instances and DOM nodes also pass here, so replace-leaf paths guard the
// ones that must not be recursed into.
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Dotted paths whose plain-object value replaces wholesale instead of recursing.
// Documented in docs/configuration.md (mounted-update replacement table).
// - user-defined key maps: recursive merge would strand stale keys from the old value
//   (headers, targetProviders, components, artifact display scopes,
//   features.streamAnimation.plugins).
// - implementation objects: partial merge splices two impls into a broken hybrid
//   (agent, storageAdapter, voiceRecognition.provider.custom).
// - preferences: the sparse slice a host passes IS its full opinion; recursive
//   merge would keep overrides the host dropped from its slice.
const REPLACE_LEAF_PATHS = new Set<string>([
  "headers",
  "agent",
  "storageAdapter",
  "components",
  "targetProviders",
  "voiceRecognition.provider.custom",
  "features.artifacts.display",
  "features.streamAnimation.plugins",
  "preferences",
  // Discriminated union: recursive merge would splice two icon variants.
  "welcome.icon",
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
  const paths = versionedDefaultPaths(DEFAULTS_V5);
  const explicit = updateDefaultProvenance(previousConfig, patch, paths);
  const merged = setDefaultProvenance(omitInheritedDefaults(
    mergePatch(previousConfig, patch, "") as Partial<AgentWidgetConfig>, paths, explicit
  ), explicit);
  setStyleProvenance(merged, updateStyleProvenance(previousConfig, patch));
  return setPanelAliasProvenance(
    mergeWithDefaults(merged) as AgentWidgetConfig,
    updatePanelAliasProvenance(previousConfig, patch)
  );
}
