import type {
  AgentWidgetArtifactsFeature,
  PersonaArtifactDisplayMode,
  PersonaArtifactFileMeta
} from "../types";

/**
 * Resolves the display mode for an artifact of the given type from
 * `features.artifacts.display`.
 *
 * Resolution order: `display.byType[artifactType]`, else `display.default`,
 * else `display` (string form), else `"panel"` (current behavior).
 */
export function resolveArtifactDisplayMode(
  feature: AgentWidgetArtifactsFeature | undefined,
  artifactType: string
): PersonaArtifactDisplayMode {
  const display = feature?.display;
  if (!display) return "panel";
  if (typeof display === "string") return display;
  const byType = display.byType as
    | Partial<Record<string, PersonaArtifactDisplayMode>>
    | undefined;
  return byType?.[artifactType] ?? display.default ?? "panel";
}

/** Props embedded in an in-thread artifact block's rawContent JSON. */
export type ArtifactRefBlockProps = {
  artifactId: string;
  title?: string;
  artifactType: string;
  status: "streaming" | "complete";
  /** File metadata for previewable file artifacts (persists the download path). */
  file?: PersonaArtifactFileMeta;
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
 * "card"/"panel" modes render the compact `PersonaArtifactCard`; "inline"
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
