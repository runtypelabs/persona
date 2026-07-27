import type {
  AgentWidgetFeatureFlags,
  ArtifactDisplayPreferenceTarget,
  PersonaArtifactDisplayMode,
  PersonaArtifactDisplayModeInput,
  WidgetPreferenceCapabilities,
  WidgetPreferencePatch,
  WidgetPreferenceSlice,
} from "../types";
import type { PersonaArtifactDisplayDescriptor } from "./artifact-display";
import {
  applyFeaturePreferencePatch,
  applyFeaturePreferences,
  createArtifactDisplayPreferencePatch,
  getArtifactDisplayPreference,
  parseWidgetPreferenceSlice,
  resolveArtifactDisplayPreference,
  type ArtifactDisplayPreferenceResolution,
  type WidgetPreferenceLayer,
  type WidgetPreferenceParseIssue,
} from "./feature-preferences";

export type FeaturePreferenceStoreChange = {
  /** Merged feature flags ready for `controller.update({ features })`. */
  features: AgentWidgetFeatureFlags;
  /** The writable layer as it should be persisted (JSON-safe). */
  preferences: WidgetPreferenceSlice;
};

export type FeaturePreferenceStoreOptions = {
  /** Code-owned feature configuration preferences overlay. */
  base?: AgentWidgetFeatureFlags;
  /** Read-only lower layers, lowest to highest priority (e.g. organization, surface). */
  layers?: readonly WidgetPreferenceLayer[];
  /** Persisted writable-layer JSON. Treated as untrusted and parsed on load. */
  stored?: unknown;
  /** Id used for the writable layer when explaining resolutions. Default `"user"`. */
  storedLayerId?: string;
  capabilities?: WidgetPreferenceCapabilities;
  /** Fires after every mutation with the recomputed features and the layer to persist. */
  onChange?: (change: FeaturePreferenceStoreChange) => void;
};

export type FeaturePreferenceStore = {
  /** Merged feature flags for the current preference state. */
  getFeatures(): AgentWidgetFeatureFlags;
  /** The writable layer to persist (already allowlist-parsed). */
  getPreferences(): WidgetPreferenceSlice;
  /** Issues found while parsing `stored`; useful for logging or debug UI. */
  getLoadIssues(): readonly WidgetPreferenceParseIssue[];
  /** Apply a sparse JSON Merge Patch to the writable layer. */
  apply(patch: WidgetPreferencePatch): void;
  /** Set or reset (null) one artifact display choice on the writable layer. */
  setArtifactDisplay(
    target: ArtifactDisplayPreferenceTarget,
    mode: PersonaArtifactDisplayModeInput | null
  ): void;
  /** The writable layer's explicit choice for a target, if any. */
  getArtifactDisplay(
    target: ArtifactDisplayPreferenceTarget
  ): PersonaArtifactDisplayMode | undefined;
  /** Resolve an artifact across base, lower layers, and the writable layer. */
  resolveArtifactDisplay(
    artifact: PersonaArtifactDisplayDescriptor
  ): ArtifactDisplayPreferenceResolution;
  /** Clear the writable layer entirely. */
  reset(): void;
  /** Subscribe to changes; returns an unsubscribe function. */
  subscribe(listener: (change: FeaturePreferenceStoreChange) => void): () => void;
};

/**
 * Owns the parse → patch → merge → apply loop for host-persisted display
 * preferences, so integrations reduce to: create the store, hand
 * `getFeatures()` to the widget, persist `preferences` from `onChange`.
 */
export function createFeaturePreferenceStore(
  options: FeaturePreferenceStoreOptions = {}
): FeaturePreferenceStore {
  const {
    base = {},
    layers = [],
    capabilities,
    storedLayerId = "user",
    onChange,
  } = options;
  const loaded = parseWidgetPreferenceSlice(options.stored);
  let preferences = loaded.preferences;
  const listeners = new Set<(change: FeaturePreferenceStoreChange) => void>();

  const computeFeatures = (): AgentWidgetFeatureFlags =>
    applyFeaturePreferences(
      base,
      [...layers.map((layer) => layer.preferences ?? {}), preferences],
      { capabilities }
    );
  let features = computeFeatures();

  const commit = (next: WidgetPreferenceSlice): void => {
    preferences = next;
    features = computeFeatures();
    const change: FeaturePreferenceStoreChange = { features, preferences };
    onChange?.(change);
    listeners.forEach((listener) => listener(change));
  };

  return {
    getFeatures: () => features,
    getPreferences: () => preferences,
    getLoadIssues: () => loaded.issues,
    apply(patch) {
      commit(applyFeaturePreferencePatch(preferences, patch));
    },
    setArtifactDisplay(target, mode) {
      commit(
        applyFeaturePreferencePatch(
          preferences,
          createArtifactDisplayPreferencePatch(target, mode)
        )
      );
    },
    getArtifactDisplay(target) {
      return getArtifactDisplayPreference(preferences, target);
    },
    resolveArtifactDisplay(artifact) {
      return resolveArtifactDisplayPreference(
        base.artifacts,
        [...layers, { id: storedLayerId, preferences }],
        artifact,
        { capabilities }
      );
    },
    reset() {
      commit({});
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
