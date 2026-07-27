import type {
  AgentWidgetArtifactsFeature,
  AgentWidgetFeatureFlags,
  ArtifactDisplayPreferenceTarget,
  PersonaArtifactDisplayMode,
  PersonaArtifactDisplayModeInput,
  PersonaArtifactDisplayRules,
  PersonaArtifactFilesDisplayRules,
  PersonaArtifactKind,
  WidgetArtifactLayoutPreference,
  WidgetPreferenceCapabilities,
  WidgetPreferencePatch,
  WidgetPreferenceSlice,
} from "../types";
import {
  canonicalArtifactDisplayMode,
  normalizeMediaType,
  resolveArtifactDisplay,
  type PersonaArtifactDisplayDescriptor,
  type PersonaArtifactDisplayResolution,
} from "./artifact-display";

export { normalizeMediaType };

export type WidgetPreferenceParseIssueCode =
  | "invalid_type"
  | "invalid_value"
  | "unknown_key"
  | "deprecated_key";

export type WidgetPreferenceParseIssue = {
  path: string;
  code: WidgetPreferenceParseIssueCode;
  message: string;
};

export type WidgetPreferenceParseResult = {
  preferences: WidgetPreferenceSlice;
  issues: WidgetPreferenceParseIssue[];
};

export type WidgetPreferenceLayer = {
  /** Stable identifier used when explaining which layer supplied a value. */
  id: string;
  preferences?: WidgetPreferenceSlice;
};

export type ArtifactDisplayPreferenceSource =
  | { type: "preference"; layerId: string }
  | { type: "base" }
  /** The artifact's own `presentation.preferredMode` hint supplied the mode. */
  | { type: "artifact" }
  | { type: "persona" };

export type ArtifactDisplayPreferenceResolution =
  PersonaArtifactDisplayResolution & {
    source: ArtifactDisplayPreferenceSource;
  };

const BLOCKED_KEYS = new Set(["__proto__", "prototype", "constructor"]);
// Accepted input values; "card" is the deprecated alias of "collapsed" and
// parsing canonicalizes it.
const DISPLAY_MODES = new Set<PersonaArtifactDisplayModeInput>([
  "collapsed",
  "card",
  "panel",
  "inline",
]);
const ARTIFACT_KINDS = new Set<PersonaArtifactKind>([
  "markdown",
  "component",
]);
// Exact "type/subtype" or major-type wildcard "type/*"; "*/*" is rejected
// because it duplicates files.default.
const MEDIA_TYPE_SELECTOR_PATTERN =
  /^[a-z0-9][a-z0-9!#$&^_.+-]*\/(\*|[a-z0-9!#$&^_.+-]+)$/;
const TOOL_COLLAPSED_MODES = new Set([
  "tool-call",
  "tool-name",
  "tool-preview",
]);
const TOOL_GROUPED_MODES = new Set(["stack", "summary"]);
const TOOL_LOADING_ANIMATIONS = new Set([
  "none",
  "pulse",
  "shimmer",
  "shimmer-color",
  "rainbow",
]);
const ARTIFACT_LAYOUT_STRING_KEYS = new Set([
  "paneWidth",
  "paneMaxWidth",
  "paneMinWidth",
  "expandedPanelWidth",
  "resizableMinWidth",
  "resizableMaxWidth",
]);
const ARTIFACT_LAYOUT_BOOLEAN_KEYS = new Set([
  "expandLauncherPanelWhenOpen",
  "resizable",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isSafeKey = (key: string): boolean => !BLOCKED_KEYS.has(key);

const isDisplayMode = (
  value: unknown
): value is PersonaArtifactDisplayModeInput =>
  typeof value === "string" &&
  DISPLAY_MODES.has(value as PersonaArtifactDisplayModeInput);

const hasKeys = (value: object): boolean => Object.keys(value).length > 0;

function issue(
  issues: WidgetPreferenceParseIssue[],
  path: string,
  code: WidgetPreferenceParseIssueCode,
  message: string
): void {
  issues.push({ path, code, message });
}

function unknownKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  issues: WidgetPreferenceParseIssue[]
): void {
  for (const key of Object.keys(value)) {
    if (!isSafeKey(key) || !allowed.has(key)) {
      issue(
        issues,
        path ? `${path}.${key}` : key,
        "unknown_key",
        "Ignored because this key is not part of the persisted preference schema."
      );
    }
  }
}

function parseBoolean(
  value: unknown,
  path: string,
  issues: WidgetPreferenceParseIssue[]
): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  issue(issues, path, "invalid_type", "Expected a boolean.");
  return undefined;
}

function parseEnum<T extends string>(
  value: unknown,
  values: ReadonlySet<string>,
  path: string,
  issues: WidgetPreferenceParseIssue[]
): T | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string" && values.has(value)) return value as T;
  issue(issues, path, "invalid_value", "Ignored an unsupported value.");
  return undefined;
}

function parseDisplayModeMap<K extends string>(
  value: unknown,
  keys: ReadonlySet<K>,
  path: string,
  issues: WidgetPreferenceParseIssue[]
): Partial<Record<K, PersonaArtifactDisplayMode>> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    issue(issues, path, "invalid_type", "Expected an object.");
    return undefined;
  }

  const result: Partial<Record<K, PersonaArtifactDisplayMode>> = {};
  for (const [key, mode] of Object.entries(value)) {
    if (!isSafeKey(key) || !keys.has(key as K)) {
      issue(issues, `${path}.${key}`, "unknown_key", "Ignored an unsupported selector.");
      continue;
    }
    if (!isDisplayMode(mode)) {
      issue(
        issues,
        `${path}.${key}`,
        "invalid_value",
        "Expected collapsed, panel, or inline."
      );
      continue;
    }
    result[key as K] = canonicalArtifactDisplayMode(mode);
  }
  return hasKeys(result) ? result : undefined;
}

function parseMediaTypeMap(
  value: unknown,
  path: string,
  issues: WidgetPreferenceParseIssue[]
): Record<string, PersonaArtifactDisplayMode> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    issue(issues, path, "invalid_type", "Expected an object.");
    return undefined;
  }

  const result: Record<string, PersonaArtifactDisplayMode> = {};
  for (const [candidate, mode] of Object.entries(value)) {
    const mediaType = normalizeMediaType(candidate);
    if (!isSafeKey(candidate) || !MEDIA_TYPE_SELECTOR_PATTERN.test(mediaType)) {
      issue(
        issues,
        `${path}.${candidate}`,
        "invalid_value",
        'Expected a MIME type such as "text/html" or a wildcard such as "image/*".'
      );
      continue;
    }
    if (!isDisplayMode(mode)) {
      issue(
        issues,
        `${path}.${candidate}`,
        "invalid_value",
        "Expected collapsed, panel, or inline."
      );
      continue;
    }
    result[mediaType] = canonicalArtifactDisplayMode(mode);
  }
  return hasKeys(result) ? result : undefined;
}

function parseFilesValue(
  value: unknown,
  path: string,
  issues: WidgetPreferenceParseIssue[]
): PersonaArtifactDisplayMode | PersonaArtifactFilesDisplayRules | undefined {
  if (value === undefined) return undefined;
  if (isDisplayMode(value)) return canonicalArtifactDisplayMode(value);
  if (!isRecord(value)) {
    issue(
      issues,
      path,
      "invalid_type",
      "Expected collapsed, panel, inline, or a file display rules object."
    );
    return undefined;
  }
  unknownKeys(value, new Set(["default", "byMediaType"]), path, issues);
  const defaultMode = parseEnum<PersonaArtifactDisplayModeInput>(
    value.default,
    DISPLAY_MODES,
    `${path}.default`,
    issues
  );
  const byMediaType = parseMediaTypeMap(
    value.byMediaType,
    `${path}.byMediaType`,
    issues
  );
  const result: PersonaArtifactFilesDisplayRules = {
    ...(defaultMode
      ? { default: canonicalArtifactDisplayMode(defaultMode) }
      : {}),
    ...(byMediaType ? { byMediaType } : {}),
  };
  return hasKeys(result) ? result : undefined;
}

function parseDisplayRules(
  value: unknown,
  path: string,
  issues: WidgetPreferenceParseIssue[]
): PersonaArtifactDisplayMode | PersonaArtifactDisplayRules | undefined {
  if (value === undefined) return undefined;
  // A bare mode is a meaningful stored value: when layers merge it replaces
  // every lower-layer display rule instead of refining them.
  if (isDisplayMode(value)) return canonicalArtifactDisplayMode(value);
  if (!isRecord(value)) {
    issue(issues, path, "invalid_type", "Expected an artifact display rules object.");
    return undefined;
  }

  unknownKeys(value, new Set(["default", "files", "byKind", "byType"]), path, issues);

  const defaultMode = parseEnum<PersonaArtifactDisplayModeInput>(
    value.default,
    DISPLAY_MODES,
    `${path}.default`,
    issues
  );
  const files = parseFilesValue(value.files, `${path}.files`, issues);
  const legacyByType = parseDisplayModeMap(
    value.byType,
    ARTIFACT_KINDS,
    `${path}.byType`,
    issues
  );
  if (value.byType !== undefined) {
    issue(
      issues,
      `${path}.byType`,
      "deprecated_key",
      "Use byKind. The legacy selector was normalized automatically."
    );
  }
  const byKind = parseDisplayModeMap(
    value.byKind,
    ARTIFACT_KINDS,
    `${path}.byKind`,
    issues
  );

  const result: PersonaArtifactDisplayRules = {
    ...(defaultMode
      ? { default: canonicalArtifactDisplayMode(defaultMode) }
      : {}),
    ...(files !== undefined ? { files } : {}),
    ...(legacyByType || byKind
      ? { byKind: { ...legacyByType, ...byKind } }
      : {}),
  };
  return hasKeys(result) ? result : undefined;
}

function parseToolCallDisplay(
  value: unknown,
  path: string,
  issues: WidgetPreferenceParseIssue[]
): WidgetPreferenceSlice["toolCallDisplay"] {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    issue(issues, path, "invalid_type", "Expected an object.");
    return undefined;
  }
  unknownKeys(
    value,
    new Set([
      "collapsedMode",
      "expandable",
      "grouped",
      "groupedMode",
      "loadingAnimation",
    ]),
    path,
    issues
  );
  const result: NonNullable<WidgetPreferenceSlice["toolCallDisplay"]> = {};
  const collapsedMode = parseEnum<
    NonNullable<
      NonNullable<WidgetPreferenceSlice["toolCallDisplay"]>["collapsedMode"]
    >
  >(
    value.collapsedMode,
    TOOL_COLLAPSED_MODES,
    `${path}.collapsedMode`,
    issues
  );
  const groupedMode = parseEnum<
    NonNullable<
      NonNullable<WidgetPreferenceSlice["toolCallDisplay"]>["groupedMode"]
    >
  >(
    value.groupedMode,
    TOOL_GROUPED_MODES,
    `${path}.groupedMode`,
    issues
  );
  const loadingAnimation = parseEnum<
    NonNullable<
      NonNullable<WidgetPreferenceSlice["toolCallDisplay"]>["loadingAnimation"]
    >
  >(
    value.loadingAnimation,
    TOOL_LOADING_ANIMATIONS,
    `${path}.loadingAnimation`,
    issues
  );
  const expandable = parseBoolean(value.expandable, `${path}.expandable`, issues);
  const grouped = parseBoolean(value.grouped, `${path}.grouped`, issues);
  if (collapsedMode) result.collapsedMode = collapsedMode;
  if (groupedMode) result.groupedMode = groupedMode;
  if (loadingAnimation) result.loadingAnimation = loadingAnimation;
  if (expandable !== undefined) result.expandable = expandable;
  if (grouped !== undefined) result.grouped = grouped;
  return hasKeys(result) ? result : undefined;
}

function parseReasoningDisplay(
  value: unknown,
  path: string,
  issues: WidgetPreferenceParseIssue[]
): WidgetPreferenceSlice["reasoningDisplay"] {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    issue(issues, path, "invalid_type", "Expected an object.");
    return undefined;
  }
  unknownKeys(value, new Set(["expandable", "activePreview"]), path, issues);
  const result: NonNullable<WidgetPreferenceSlice["reasoningDisplay"]> = {};
  const expandable = parseBoolean(value.expandable, `${path}.expandable`, issues);
  const activePreview = parseBoolean(
    value.activePreview,
    `${path}.activePreview`,
    issues
  );
  if (expandable !== undefined) result.expandable = expandable;
  if (activePreview !== undefined) result.activePreview = activePreview;
  return hasKeys(result) ? result : undefined;
}

function parseArtifactLayout(
  value: unknown,
  path: string,
  issues: WidgetPreferenceParseIssue[]
): WidgetArtifactLayoutPreference | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    issue(issues, path, "invalid_type", "Expected an object.");
    return undefined;
  }

  unknownKeys(
    value,
    new Set([...ARTIFACT_LAYOUT_STRING_KEYS, ...ARTIFACT_LAYOUT_BOOLEAN_KEYS]),
    path,
    issues
  );
  const result: Record<string, string | boolean> = {};
  for (const key of ARTIFACT_LAYOUT_STRING_KEYS) {
    if (value[key] === undefined) continue;
    if (typeof value[key] === "string") result[key] = value[key];
    else issue(issues, `${path}.${key}`, "invalid_type", "Expected a CSS length string.");
  }
  for (const key of ARTIFACT_LAYOUT_BOOLEAN_KEYS) {
    const parsed = parseBoolean(value[key], `${path}.${key}`, issues);
    if (parsed !== undefined) result[key] = parsed;
  }
  return hasKeys(result) ? (result as WidgetArtifactLayoutPreference) : undefined;
}

function parseArtifacts(
  value: unknown,
  path: string,
  issues: WidgetPreferenceParseIssue[]
): WidgetPreferenceSlice["artifacts"] {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    issue(issues, path, "invalid_type", "Expected an object.");
    return undefined;
  }
  unknownKeys(value, new Set(["display", "filePreview", "layout"]), path, issues);

  const display = parseDisplayRules(value.display, `${path}.display`, issues);
  let filePreview: { enabled?: boolean } | undefined;
  if (value.filePreview !== undefined) {
    if (!isRecord(value.filePreview)) {
      issue(issues, `${path}.filePreview`, "invalid_type", "Expected an object.");
    } else {
      unknownKeys(
        value.filePreview,
        new Set(["enabled"]),
        `${path}.filePreview`,
        issues
      );
      const enabled = parseBoolean(
        value.filePreview.enabled,
        `${path}.filePreview.enabled`,
        issues
      );
      if (enabled !== undefined) filePreview = { enabled };
    }
  }
  const layout = parseArtifactLayout(value.layout, `${path}.layout`, issues);
  const result: NonNullable<WidgetPreferenceSlice["artifacts"]> = {
    ...(display ? { display } : {}),
    ...(filePreview ? { filePreview } : {}),
    ...(layout ? { layout } : {}),
  };
  return hasKeys(result) ? result : undefined;
}

/**
 * Parse untrusted JSON into Persona's curated preference schema.
 *
 * Unknown, invalid, capability, callback, renderer, and security fields are
 * omitted. The returned issues are suitable for logging or a settings UI.
 */
export function parseWidgetPreferenceSlice(
  input: unknown
): WidgetPreferenceParseResult {
  const issues: WidgetPreferenceParseIssue[] = [];
  if (!isRecord(input)) {
    if (input !== undefined && input !== null) {
      issue(issues, "", "invalid_type", "Expected a preference object.");
    }
    return { preferences: {}, issues };
  }

  unknownKeys(
    input,
    new Set([
      "showToolCalls",
      "showReasoning",
      "toolCallDisplay",
      "reasoningDisplay",
      "artifacts",
    ]),
    "",
    issues
  );
  const preferences: WidgetPreferenceSlice = {};
  const showToolCalls = parseBoolean(
    input.showToolCalls,
    "showToolCalls",
    issues
  );
  const showReasoning = parseBoolean(
    input.showReasoning,
    "showReasoning",
    issues
  );
  const toolCallDisplay = parseToolCallDisplay(
    input.toolCallDisplay,
    "toolCallDisplay",
    issues
  );
  const reasoningDisplay = parseReasoningDisplay(
    input.reasoningDisplay,
    "reasoningDisplay",
    issues
  );
  const artifacts = parseArtifacts(input.artifacts, "artifacts", issues);
  if (showToolCalls !== undefined) preferences.showToolCalls = showToolCalls;
  if (showReasoning !== undefined) preferences.showReasoning = showReasoning;
  if (toolCallDisplay) preferences.toolCallDisplay = toolCallDisplay;
  if (reasoningDisplay) preferences.reasoningDisplay = reasoningDisplay;
  if (artifacts) preferences.artifacts = artifacts;
  return { preferences, issues };
}

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map(cloneValue) as T;
  if (!isRecord(value)) return value;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (isSafeKey(key) && child !== undefined) result[key] = cloneValue(child);
  }
  return result as T;
}

function mergeRecords(
  lower: Record<string, unknown>,
  upper: Record<string, unknown>
): Record<string, unknown> {
  const result = cloneValue(lower);
  for (const [key, value] of Object.entries(upper)) {
    if (!isSafeKey(key) || value === undefined) continue;
    const previous = result[key];
    result[key] =
      isRecord(previous) && isRecord(value)
        ? mergeRecords(previous, value)
        : cloneValue(value);
  }
  return result;
}

function pruneRecord(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (!isSafeKey(key) || child === undefined) continue;
    const pruned = pruneRecord(child);
    if (!isRecord(pruned) || hasKeys(pruned)) result[key] = pruned;
  }
  return result;
}

function applyPatchValue(previous: unknown, patch: unknown): unknown {
  if (patch === null) return undefined;
  if (!isRecord(patch)) return cloneValue(patch);
  const result = isRecord(previous) ? cloneValue(previous) : {};
  for (const [key, value] of Object.entries(patch)) {
    if (!isSafeKey(key) || value === undefined) continue;
    const next = applyPatchValue(result[key], value);
    if (next === undefined) delete result[key];
    else result[key] = next;
  }
  return pruneRecord(result);
}

function applyCapabilities(
  preferences: WidgetPreferenceSlice,
  capabilities?: WidgetPreferenceCapabilities
): WidgetPreferenceSlice {
  const result = cloneValue(preferences);
  if (capabilities?.artifacts === false) delete result.artifacts;
  if (capabilities?.tools === false) {
    delete result.showToolCalls;
    delete result.toolCallDisplay;
  }
  if (capabilities?.reasoning === false) {
    delete result.showReasoning;
    delete result.reasoningDisplay;
  }
  return result;
}

/**
 * Merge lowest-to-highest preference layers after parsing each as untrusted
 * persisted data. Objects merge per key, so later layers win only for keys
 * they explicitly contain; a string `display` or `display.files` value in a
 * later layer replaces that whole subtree instead.
 */
export function mergeFeaturePreferences(
  layers: readonly WidgetPreferenceSlice[],
  options?: { capabilities?: WidgetPreferenceCapabilities }
): WidgetPreferenceSlice {
  let merged: Record<string, unknown> = {};
  let display: ArtifactDisplayValue | undefined;
  for (const layer of layers) {
    const parsed = parseWidgetPreferenceSlice(layer).preferences;
    display = mergeDisplayValue(display, parsed.artifacts?.display);
    merged = mergeRecords(merged, parsed as Record<string, unknown>);
  }
  const result = merged as WidgetPreferenceSlice;
  // The generic record merge cannot express string-replaces-object, so the
  // display subtree is recomputed with the display-aware fold.
  if (result.artifacts) {
    if (display !== undefined) result.artifacts.display = display;
    else delete result.artifacts.display;
  }
  return applyCapabilities(result, options?.capabilities);
}

/**
 * When a patch refines a subtree whose stored value is the string shorthand,
 * promote the string to `{ default }` first so the refinement extends the
 * stored choice instead of discarding it.
 */
function promoteDisplayForPatch(
  previous: WidgetPreferenceSlice,
  patch: WidgetPreferencePatch
): void {
  const patchDisplay = patch.artifacts?.display;
  const artifacts = previous.artifacts;
  if (!artifacts || !isRecord(patchDisplay)) return;
  if (typeof artifacts.display === "string") {
    artifacts.display = { default: artifacts.display };
  }
  const display = artifacts.display;
  if (
    display &&
    typeof display !== "string" &&
    isRecord(patchDisplay.files) &&
    typeof display.files === "string"
  ) {
    display.files = { default: display.files };
  }
}

/**
 * Apply a JSON-safe sparse patch (RFC 7386 JSON Merge Patch semantics) to one
 * stored layer. `null` deletes a key. The result is parsed again so an
 * untyped patch cannot escape the allowlist.
 */
export function applyFeaturePreferencePatch(
  layer: WidgetPreferenceSlice,
  patch: WidgetPreferencePatch
): WidgetPreferenceSlice {
  const previous = parseWidgetPreferenceSlice(layer).preferences;
  promoteDisplayForPatch(previous, patch);
  const next = applyPatchValue(previous, patch);
  return parseWidgetPreferenceSlice(next).preferences;
}

type ArtifactDisplayValue =
  | PersonaArtifactDisplayModeInput
  | PersonaArtifactDisplayRules;

type ArtifactFilesValue = PersonaArtifactDisplayRules["files"];

/**
 * One merge rule at every level: an upper string replaces the whole subtree it
 * names; an upper object refines the lower value per key (a lower string is
 * refined as that subtree's `default`).
 */
function mergeFilesValue(
  lower: ArtifactFilesValue,
  upper: ArtifactFilesValue
): ArtifactFilesValue {
  if (upper === undefined) {
    return lower === undefined ? undefined : cloneValue(lower);
  }
  if (typeof upper === "string") return upper;
  const low: PersonaArtifactFilesDisplayRules =
    typeof lower === "string" ? { default: lower } : lower ?? {};
  const defaultMode = upper.default ?? low.default;
  const byMediaType = { ...low.byMediaType, ...upper.byMediaType };
  const result: PersonaArtifactFilesDisplayRules = {
    ...(defaultMode ? { default: defaultMode } : {}),
    ...(hasKeys(byMediaType) ? { byMediaType } : {}),
  };
  return hasKeys(result) ? result : undefined;
}

function mergeDisplayValue(
  lower: AgentWidgetArtifactsFeature["display"],
  upper: AgentWidgetArtifactsFeature["display"]
): ArtifactDisplayValue | undefined {
  if (upper === undefined) {
    return lower === undefined ? undefined : cloneValue(lower);
  }
  if (typeof upper === "string") return upper;
  const low: PersonaArtifactDisplayRules =
    typeof lower === "string" ? { default: lower } : lower ?? {};
  const defaultMode = upper.default ?? low.default;
  const byKind = {
    ...low.byType,
    ...low.byKind,
    ...upper.byType,
    ...upper.byKind,
  };
  const files = mergeFilesValue(low.files, upper.files);
  const result: PersonaArtifactDisplayRules = {
    ...(defaultMode ? { default: defaultMode } : {}),
    ...(hasKeys(byKind) ? { byKind } : {}),
    ...(files !== undefined ? { files } : {}),
  };
  return hasKeys(result) ? result : undefined;
}

/**
 * Overlay persisted display preferences onto code-owned feature config.
 * Only fields in `WidgetPreferenceSlice` are copied.
 */
export function applyFeaturePreferences(
  baseFeatures: AgentWidgetFeatureFlags = {},
  layers: readonly WidgetPreferenceSlice[],
  options?: { capabilities?: WidgetPreferenceCapabilities }
): AgentWidgetFeatureFlags {
  const preferences = mergeFeaturePreferences(layers, options);
  const result: AgentWidgetFeatureFlags = { ...baseFeatures };
  if (preferences.showToolCalls !== undefined) {
    result.showToolCalls = preferences.showToolCalls;
  }
  if (preferences.showReasoning !== undefined) {
    result.showReasoning = preferences.showReasoning;
  }
  if (preferences.toolCallDisplay) {
    result.toolCallDisplay = {
      ...baseFeatures.toolCallDisplay,
      ...preferences.toolCallDisplay,
    };
  }
  if (preferences.reasoningDisplay) {
    result.reasoningDisplay = {
      ...baseFeatures.reasoningDisplay,
      ...preferences.reasoningDisplay,
    };
  }
  if (preferences.artifacts) {
    const baseArtifacts = baseFeatures.artifacts ?? {};
    const artifacts: AgentWidgetArtifactsFeature = { ...baseArtifacts };
    if (preferences.artifacts.display !== undefined) {
      const display = mergeDisplayValue(
        baseArtifacts.display,
        preferences.artifacts.display
      );
      if (display !== undefined) artifacts.display = display;
    }
    if (preferences.artifacts.filePreview) {
      artifacts.filePreview = {
        ...baseArtifacts.filePreview,
        enabled: preferences.artifacts.filePreview.enabled,
      };
    }
    if (preferences.artifacts.layout) {
      artifacts.layout = {
        ...baseArtifacts.layout,
        ...preferences.artifacts.layout,
      };
    }
    result.artifacts = artifacts;
  }
  return result;
}

const canonicalOrUndefined = (
  mode: PersonaArtifactDisplayModeInput | undefined
): PersonaArtifactDisplayMode | undefined =>
  mode === undefined ? undefined : canonicalArtifactDisplayMode(mode);

export function getArtifactDisplayPreference(
  preferences: WidgetPreferenceSlice,
  target: ArtifactDisplayPreferenceTarget
): PersonaArtifactDisplayMode | undefined {
  const display = preferences.artifacts?.display;
  if (!display) return undefined;
  if (typeof display === "string") {
    return target.type === "default"
      ? canonicalArtifactDisplayMode(display)
      : undefined;
  }
  switch (target.type) {
    case "default":
      return canonicalOrUndefined(display.default);
    case "files":
      return canonicalOrUndefined(
        typeof display.files === "string"
          ? display.files
          : display.files?.default
      );
    case "kind":
      return canonicalOrUndefined(
        display.byKind?.[target.kind] ?? display.byType?.[target.kind]
      );
    case "mediaType":
      return canonicalOrUndefined(
        typeof display.files === "string"
          ? undefined
          : display.files?.byMediaType?.[normalizeMediaType(target.mediaType)]
      );
  }
}

/**
 * Build the sparse patch for one display choice. Setting the `files` target
 * writes the string form, which replaces lower-layer file rules wholesale;
 * resetting it (`null`) deletes only `files.default` so stored MIME
 * exceptions survive.
 */
export function createArtifactDisplayPreferencePatch(
  target: ArtifactDisplayPreferenceTarget,
  mode: PersonaArtifactDisplayModeInput | null
): WidgetPreferencePatch {
  const canonical = mode === null ? null : canonicalArtifactDisplayMode(mode);
  switch (target.type) {
    case "default":
      return { artifacts: { display: { default: canonical } } };
    case "files":
      return canonical === null
        ? { artifacts: { display: { files: { default: null } } } }
        : { artifacts: { display: { files: canonical } } };
    case "kind":
      return {
        artifacts: { display: { byKind: { [target.kind]: canonical } } },
      };
    case "mediaType":
      return {
        artifacts: {
          display: {
            files: {
              byMediaType: {
                [normalizeMediaType(target.mediaType)]: canonical,
              },
            },
          },
        },
      };
  }
}

function targetForResolution(
  resolution: PersonaArtifactDisplayResolution
): ArtifactDisplayPreferenceTarget | undefined {
  switch (resolution.matchedBy.type) {
    case "mediaType":
      // The configured selector, not the artifact's concrete MIME type, so a
      // wildcard match attributes to the "image/*" key that supplied it.
      return {
        type: "mediaType",
        mediaType: resolution.matchedBy.selector,
      };
    case "files":
      return { type: "files" };
    case "kind":
      return { type: "kind", kind: resolution.matchedBy.kind };
    case "default":
      return { type: "default" };
    case "preferredMode":
    case "personaDefault":
      return undefined;
  }
}

/**
 * Resolve an artifact and explain both the selector and preference layer that
 * supplied the winning value.
 */
export function resolveArtifactDisplayPreference(
  baseArtifacts: AgentWidgetArtifactsFeature | undefined,
  layers: readonly WidgetPreferenceLayer[],
  artifact: PersonaArtifactDisplayDescriptor,
  options?: { capabilities?: WidgetPreferenceCapabilities }
): ArtifactDisplayPreferenceResolution {
  const parsedLayers = layers.map((layer) => ({
    id: layer.id,
    preferences: parseWidgetPreferenceSlice(layer.preferences).preferences,
  }));
  const features = applyFeaturePreferences(
    { artifacts: baseArtifacts },
    parsedLayers.map((layer) => layer.preferences),
    options
  );
  const resolution = resolveArtifactDisplay(features.artifacts, artifact);
  if (resolution.matchedBy.type === "preferredMode") {
    return { ...resolution, source: { type: "artifact" } };
  }
  const target = targetForResolution(resolution);
  if (!target) return { ...resolution, source: { type: "persona" } };

  for (let index = parsedLayers.length - 1; index >= 0; index -= 1) {
    if (
      getArtifactDisplayPreference(parsedLayers[index].preferences, target) !==
      undefined
    ) {
      return {
        ...resolution,
        source: { type: "preference", layerId: parsedLayers[index].id },
      };
    }
  }
  return { ...resolution, source: { type: "base" } };
}
