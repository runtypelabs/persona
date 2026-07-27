import type {
  AgentWidgetArtifactsFeature,
  PersonaArtifactDisplayMode,
  PersonaArtifactDisplayModeInput,
  PersonaArtifactFileMeta,
  PersonaArtifactKind,
  PersonaArtifactPresentation,
  PersonaArtifactRecord,
} from "../types";

/** Canonicalize the deprecated `"card"` alias to `"collapsed"`. */
export function canonicalArtifactDisplayMode(
  mode: PersonaArtifactDisplayModeInput
): PersonaArtifactDisplayMode {
  return mode === "card" ? "collapsed" : mode;
}

export type PersonaArtifactDisplayDescriptor = Pick<
  PersonaArtifactRecord,
  "artifactType" | "file" | "presentation"
>;

export type PersonaArtifactDisplayMatch =
  /** `selector` is the configured `byMediaType` key ("text/html" or "image/*"). */
  | { type: "mediaType"; mediaType: string; selector: string }
  | { type: "files" }
  | {
      type: "kind";
      kind: PersonaArtifactKind;
      configuredBy: "byKind" | "byType";
    }
  | { type: "preferredMode" }
  | { type: "default" }
  | { type: "personaDefault" };

export type PersonaArtifactDisplayResolution = {
  mode: PersonaArtifactDisplayMode;
  matchedBy: PersonaArtifactDisplayMatch;
};

export function normalizeMediaType(mediaType: string): string {
  return mediaType.split(";", 1)[0].trim().toLowerCase();
}

function matchMediaType(
  byMediaType: Record<string, PersonaArtifactDisplayModeInput> | undefined,
  mediaType: string
): { mode: PersonaArtifactDisplayMode; selector: string } | undefined {
  if (!byMediaType) return undefined;
  const entries = Object.entries(byMediaType);
  for (const [candidate, mode] of entries) {
    if (normalizeMediaType(candidate) === mediaType) {
      return {
        mode: canonicalArtifactDisplayMode(mode),
        selector: normalizeMediaType(candidate),
      };
    }
  }
  const wildcard = `${mediaType.split("/", 1)[0]}/*`;
  for (const [candidate, mode] of entries) {
    if (normalizeMediaType(candidate) === wildcard) {
      return { mode: canonicalArtifactDisplayMode(mode), selector: wildcard };
    }
  }
  return undefined;
}

/**
 * Resolve an artifact's display mode together with the rule that selected it.
 * Always returns a canonical mode ("card" inputs resolve as "collapsed").
 *
 * Resolution order: file rules (exact MIME, then `major/*` wildcard, then the
 * files default), kind, the producer's `presentation.preferredMode` hint,
 * configured default, then `"panel"`.
 */
export function resolveArtifactDisplay(
  feature: AgentWidgetArtifactsFeature | undefined,
  artifact: PersonaArtifactDisplayDescriptor
): PersonaArtifactDisplayResolution {
  const display = feature?.display;
  const rules =
    typeof display === "string" ? { default: display } : display ?? {};

  if (artifact.file && rules.files) {
    if (typeof rules.files === "string") {
      return {
        mode: canonicalArtifactDisplayMode(rules.files),
        matchedBy: { type: "files" },
      };
    }
    const mediaType = artifact.file.mimeType
      ? normalizeMediaType(artifact.file.mimeType)
      : undefined;
    const byMediaType = mediaType
      ? matchMediaType(rules.files.byMediaType, mediaType)
      : undefined;
    if (mediaType && byMediaType) {
      return {
        mode: byMediaType.mode,
        matchedBy: {
          type: "mediaType",
          mediaType,
          selector: byMediaType.selector,
        },
      };
    }
    if (rules.files.default) {
      return {
        mode: canonicalArtifactDisplayMode(rules.files.default),
        matchedBy: { type: "files" },
      };
    }
  }

  const byKind = rules.byKind?.[artifact.artifactType];
  if (byKind) {
    return {
      mode: canonicalArtifactDisplayMode(byKind),
      matchedBy: {
        type: "kind",
        kind: artifact.artifactType,
        configuredBy: "byKind",
      },
    };
  }
  const byType = rules.byType?.[artifact.artifactType];
  if (byType) {
    return {
      mode: canonicalArtifactDisplayMode(byType),
      matchedBy: {
        type: "kind",
        kind: artifact.artifactType,
        configuredBy: "byType",
      },
    };
  }

  const preferred = artifact.presentation?.preferredMode;
  if (preferred) {
    return {
      mode: canonicalArtifactDisplayMode(preferred),
      matchedBy: { type: "preferredMode" },
    };
  }

  if (rules.default) {
    return {
      mode: canonicalArtifactDisplayMode(rules.default),
      matchedBy: { type: "default" },
    };
  }
  return { mode: "panel", matchedBy: { type: "personaDefault" } };
}

/**
 * Resolve only the mode. Use `resolveArtifactDisplay` when a host needs to
 * explain which rule selected it.
 */
export function resolveArtifactDisplayMode(
  feature: AgentWidgetArtifactsFeature | undefined,
  artifact: PersonaArtifactDisplayDescriptor
): PersonaArtifactDisplayMode {
  return resolveArtifactDisplay(feature, artifact).mode;
}

/** Props embedded in an in-thread artifact block's rawContent JSON. */
export type ArtifactRefBlockProps = {
  artifactId: string;
  title?: string;
  artifactType: string;
  status: "streaming" | "complete";
  /** File metadata for previewable file artifacts (persists the download path). */
  file?: PersonaArtifactFileMeta;
  presentation?: PersonaArtifactPresentation;
  /**
   * Component name for component-type artifacts. Only embedded for the
   * "inline" display mode: the inline block renders component artifacts
   * through the registry, so it needs the name in its props; the card never
   * reads it.
   */
  component?: string;
  /**
   * Props for component-type artifacts. Embedded alongside `component` for the
   * "inline" display mode so a refreshed session re-invokes the registered
   * renderer with its real props (the session artifact registry is not
   * persisted); the card never reads them.
   */
  componentProps?: Record<string, unknown>;
  /** Final markdown content, embedded once complete so hydration/download work after refresh. */
  markdown?: string;
};

/**
 * Builds the `rawContent` JSON for the synthetic assistant message that
 * anchors an artifact in the transcript (message id `artifact-ref-<id>`).
 *
 * "collapsed"/"panel" modes render the compact `PersonaArtifactCard`; "inline"
 * renders the `PersonaArtifactInline` preview block. Both share this shape so
 * transcript persistence and hydration work unchanged. Used by the streaming
 * client (`artifact_start`) and the programmatic `session.upsertArtifact()`.
 */
export function buildArtifactRefRawContent(
  displayMode: PersonaArtifactDisplayMode,
  props: ArtifactRefBlockProps
): string {
  return JSON.stringify({
    component:
      displayMode === "inline" ? "PersonaArtifactInline" : "PersonaArtifactCard",
    props: {
      artifactId: props.artifactId,
      title: props.title,
      artifactType: props.artifactType,
      status: props.status,
      ...(props.file ? { file: props.file } : {}),
      ...(props.presentation ? { presentation: props.presentation } : {}),
      ...(displayMode === "inline" && props.component
        ? { component: props.component }
        : {}),
      ...(displayMode === "inline" && props.componentProps
        ? { componentProps: props.componentProps }
        : {}),
      ...(props.markdown !== undefined ? { markdown: props.markdown } : {})
    }
  });
}
