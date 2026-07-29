import type {
  AgentWidgetArtifactsFeature,
  AgentWidgetConfig,
  AgentWidgetFeatureFlags,
  PersonaArtifactDisplayMode,
  PersonaArtifactDisplayModeInput,
  PersonaArtifactDisplayRules,
  PersonaArtifactFilesDisplayRules,
  PersonaArtifactKind,
  WidgetArtifactLayoutPreference,
  WidgetPreferenceSlice,
} from "../types";
import {
  canonicalArtifactDisplayMode,
  normalizeMediaType,
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
): undefined {
  issues.push({ path, code, message });
  return undefined;
}

const UNKNOWN_KEY_MESSAGE =
  "Ignored because this key is not part of the persisted preference schema.";
const UNSUPPORTED_VALUE_MESSAGE = "Ignored an unsupported value.";
const MODE_VALUE_MESSAGE = "Expected collapsed, panel, or inline.";
const MEDIA_TYPE_MESSAGE =
  'Expected a MIME type such as "text/html" or a wildcard such as "image/*".';

type PreferenceNode = {
  /** Fold this key's parsed value into another output key, that key winning. */
  alias?: string;
  /** Reported whenever the input carries this key, valid or not. */
  deprecated?: string;
} & (
  | { kind: "boolean" }
  | { kind: "string"; message: string }
  | { kind: "enum"; values: ReadonlySet<string>; message: string }
  /** Display mode; canonicalizes the deprecated "card" alias to "collapsed". */
  | { kind: "mode"; message: string }
  /** Mode values keyed by a closed selector set, or by MIME selector. */
  | { kind: "modeMap"; keys: ReadonlySet<string> | "mediaType" }
  | {
      kind: "object";
      children: Record<string, PreferenceNode>;
      message?: string;
      /** Also accept a bare mode string in place of the rules object. */
      bareMode?: true;
    }
);

const DEFAULT_MODE: PreferenceNode = {
  kind: "mode",
  message: UNSUPPORTED_VALUE_MESSAGE,
};
const CSS_LENGTH: PreferenceNode = {
  kind: "string",
  message: "Expected a CSS length string.",
};
const BOOLEAN: PreferenceNode = { kind: "boolean" };

// Keyed by the preference type so the table stays exhaustive; string keys are
// declared before boolean keys because issue order follows declaration order.
const ARTIFACT_LAYOUT_CHILDREN: Record<
  keyof WidgetArtifactLayoutPreference,
  PreferenceNode
> = {
  paneWidth: CSS_LENGTH,
  paneMaxWidth: CSS_LENGTH,
  paneMinWidth: CSS_LENGTH,
  expandedPanelWidth: CSS_LENGTH,
  resizableMinWidth: CSS_LENGTH,
  resizableMaxWidth: CSS_LENGTH,
  expandLauncherPanelWhenOpen: BOOLEAN,
  resizable: BOOLEAN,
};

const ROOT_NODE: PreferenceNode = {
  kind: "object",
  message: "Expected a preference object.",
  children: {
    showToolCalls: BOOLEAN,
    showReasoning: BOOLEAN,
    toolCallDisplay: {
      kind: "object",
      children: {
        collapsedMode: {
          kind: "enum",
          values: new Set(["tool-call", "tool-name", "tool-preview"]),
          message: UNSUPPORTED_VALUE_MESSAGE,
        },
        groupedMode: {
          kind: "enum",
          values: new Set(["stack", "summary"]),
          message: UNSUPPORTED_VALUE_MESSAGE,
        },
        loadingAnimation: {
          kind: "enum",
          values: new Set([
            "none",
            "pulse",
            "shimmer",
            "shimmer-color",
            "rainbow",
          ]),
          message: UNSUPPORTED_VALUE_MESSAGE,
        },
        expandable: BOOLEAN,
        grouped: BOOLEAN,
      },
    },
    reasoningDisplay: {
      kind: "object",
      children: { expandable: BOOLEAN, activePreview: BOOLEAN },
    },
    artifacts: {
      kind: "object",
      children: {
        display: {
          kind: "object",
          bareMode: true,
          message: "Expected an artifact display rules object.",
          children: {
            default: DEFAULT_MODE,
            files: {
              kind: "object",
              bareMode: true,
              message:
                "Expected collapsed, panel, inline, or a file display rules object.",
              children: {
                default: DEFAULT_MODE,
                byMediaType: { kind: "modeMap", keys: "mediaType" },
              },
            },
            // Declared before byKind: fold order decides alias precedence.
            byType: {
              kind: "modeMap",
              keys: ARTIFACT_KINDS,
              alias: "byKind",
              deprecated:
                "Use byKind. The legacy selector was normalized automatically.",
            },
            byKind: { kind: "modeMap", keys: ARTIFACT_KINDS },
          },
        },
        filePreview: { kind: "object", children: { enabled: BOOLEAN } },
        layout: { kind: "object", children: ARTIFACT_LAYOUT_CHILDREN },
      },
    },
  },
};

/**
 * Walk one value against its schema node. Returns the parsed value, or
 * `undefined` when the value is absent, rejected, or parsed to nothing.
 */
function parseNode(
  value: unknown,
  node: PreferenceNode,
  path: string,
  issues: WidgetPreferenceParseIssue[]
): unknown {
  if (value === undefined) return undefined;
  switch (node.kind) {
    case "boolean":
      return typeof value === "boolean"
        ? value
        : issue(issues, path, "invalid_type", "Expected a boolean.");
    case "string":
      return typeof value === "string"
        ? value
        : issue(issues, path, "invalid_type", node.message);
    case "enum":
      return typeof value === "string" && node.values.has(value)
        ? value
        : issue(issues, path, "invalid_value", node.message);
    case "mode":
      return isDisplayMode(value)
        ? canonicalArtifactDisplayMode(value)
        : issue(issues, path, "invalid_value", node.message);
    case "modeMap": {
      if (!isRecord(value)) {
        return issue(issues, path, "invalid_type", "Expected an object.");
      }
      const keys = node.keys === "mediaType" ? undefined : node.keys;
      const map: Record<string, PersonaArtifactDisplayMode> = {};
      for (const [key, mode] of Object.entries(value)) {
        const selector = keys ? key : normalizeMediaType(key);
        const known =
          isSafeKey(key) &&
          (keys ? keys.has(key) : MEDIA_TYPE_SELECTOR_PATTERN.test(selector));
        if (!known) {
          issue(
            issues,
            `${path}.${key}`,
            keys ? "unknown_key" : "invalid_value",
            keys ? "Ignored an unsupported selector." : MEDIA_TYPE_MESSAGE
          );
        } else if (!isDisplayMode(mode)) {
          issue(issues, `${path}.${key}`, "invalid_value", MODE_VALUE_MESSAGE);
        } else {
          map[selector] = canonicalArtifactDisplayMode(mode);
        }
      }
      return hasKeys(map) ? map : undefined;
    }
    case "object": {
      // A bare mode is a meaningful stored value: when layers merge it replaces
      // every lower-layer display rule instead of refining them.
      if (node.bareMode && isDisplayMode(value)) {
        return canonicalArtifactDisplayMode(value);
      }
      if (!isRecord(value)) {
        return issue(
          issues,
          path,
          "invalid_type",
          node.message ?? "Expected an object."
        );
      }
      const childKeys = Object.keys(node.children);
      const childPath = (key: string) => (path ? `${path}.${key}` : key);
      for (const key of Object.keys(value)) {
        if (!isSafeKey(key) || !childKeys.includes(key)) {
          issue(issues, childPath(key), "unknown_key", UNKNOWN_KEY_MESSAGE);
        }
      }
      const result: Record<string, unknown> = {};
      for (const key of childKeys) {
        const child = node.children[key];
        const parsed = parseNode(value[key], child, childPath(key), issues);
        if (child.deprecated && value[key] !== undefined) {
          issue(issues, childPath(key), "deprecated_key", child.deprecated);
        }
        if (parsed === undefined) continue;
        const target = child.alias ?? key;
        const previous = result[target];
        result[target] =
          isRecord(previous) && isRecord(parsed)
            ? { ...previous, ...parsed }
            : parsed;
      }
      return hasKeys(result) ? result : undefined;
    }
  }
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
  // null is an absent slice, not a malformed one.
  const parsed =
    input === null ? undefined : parseNode(input, ROOT_NODE, "", issues);
  return {
    preferences: (parsed as WidgetPreferenceSlice | undefined) ?? {},
    issues,
  };
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

/**
 * Merge lowest-to-highest preference slices after parsing each as untrusted
 * data. Objects merge per key, so later slices win only for keys they
 * explicitly contain; a string `display` or `display.files` value in a later
 * slice replaces that whole subtree instead.
 */
export function mergeFeaturePreferences(
  layers: readonly WidgetPreferenceSlice[]
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
  return result;
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
  layers: readonly WidgetPreferenceSlice[]
): AgentWidgetFeatureFlags {
  const preferences = mergeFeaturePreferences(layers);
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

/**
 * Bake `config.preferences` into `config.features` for one widget instance.
 * Callers supporting live preference updates must re-resolve from the
 * pre-preference base features, not from a previously resolved result.
 */
export function resolveConfigPreferences(
  config: AgentWidgetConfig
): AgentWidgetConfig {
  const preferences = config.preferences;
  if (!preferences || !hasKeys(preferences)) return config;
  return {
    ...config,
    features: applyFeaturePreferences(config.features ?? {}, [preferences]),
  };
}
