import type { ComponentContext, ComponentRenderer } from "./registry";
import type { PersonaArtifactFileMeta, PersonaArtifactRecord } from "../types";
import { createElement } from "../utils/dom";
import { renderArtifactPreviewBody } from "./artifact-preview";

/**
 * Built-in inline artifact block component (display: "inline").
 *
 * Renders the artifact preview body directly in the chat thread via the
 * shared `renderArtifactPreviewBody` — the same surface the artifact pane
 * uses — instead of the compact reference card.
 *
 * Data flow:
 * - The initial render builds a record from the message props (the same
 *   rawContent JSON-component shape the card uses). While streaming that is
 *   an empty/partial record; after `artifact_complete` the client embeds the
 *   accumulated markdown + file meta in the props, so a refreshed session
 *   re-renders the full preview from props alone (hydration path).
 * - Live streaming updates come from the session artifact registry: the block
 *   registers an updater keyed on its root element, and the UI layer pushes
 *   every `onArtifactsState` emission through `updateInlineArtifactBlocks`,
 *   which routes the matching record into the preview handle's `update()`.
 *
 * Supports a custom `renderInline` callback via
 * `config.features.artifacts.renderInline` (mirroring the card's `renderCard`).
 */

const inlineBlockUpdaters = new WeakMap<
  HTMLElement,
  (record: PersonaArtifactRecord) => void
>();

/**
 * Push the current session artifact registry state into every inline artifact
 * block under `root`. Blocks whose artifact has no registry record (e.g. after
 * a page refresh) are left on their props render — that render already carries
 * the complete content once the client embedded it on `artifact_complete`.
 */
export function updateInlineArtifactBlocks(
  root: HTMLElement,
  artifacts: PersonaArtifactRecord[]
): void {
  if (artifacts.length === 0) return;
  const byId = new Map(artifacts.map((a) => [a.id, a]));
  root.querySelectorAll<HTMLElement>("[data-artifact-inline]").forEach((el) => {
    const update = inlineBlockUpdaters.get(el);
    if (!update) return;
    const record = byId.get(el.getAttribute("data-artifact-inline") ?? "");
    if (record) update(record);
  });
}

/** Rebuild a preview record from the persisted block props (hydration path). */
function recordFromProps(props: Record<string, unknown>): PersonaArtifactRecord {
  const id = typeof props.artifactId === "string" ? props.artifactId : "";
  const title =
    typeof props.title === "string" && props.title ? props.title : undefined;
  const status = props.status === "streaming" ? "streaming" : "complete";
  if (props.artifactType === "component") {
    return {
      id,
      artifactType: "component",
      title,
      status,
      component: typeof props.component === "string" ? props.component : "",
      props: {}
    };
  }
  const file =
    props.file && typeof props.file === "object" && !Array.isArray(props.file)
      ? (props.file as PersonaArtifactFileMeta)
      : undefined;
  return {
    id,
    artifactType: "markdown",
    title,
    status,
    markdown: typeof props.markdown === "string" ? props.markdown : "",
    ...(file ? { file } : {})
  };
}

function renderDefaultArtifactInline(
  props: Record<string, unknown>,
  context: ComponentContext
): HTMLElement {
  const record = recordFromProps(props);
  const root = createElement(
    "div",
    "persona-artifact-inline persona-w-full persona-max-w-full"
  );
  if (record.id) {
    root.setAttribute("data-artifact-inline", record.id);
  }
  const handle = renderArtifactPreviewBody(record, { config: context.config });
  root.appendChild(handle.el);
  inlineBlockUpdaters.set(root, (rec) => handle.update(rec));
  return root;
}

export const PersonaArtifactInline: ComponentRenderer = (props, context) => {
  const customRenderer = context?.config?.features?.artifacts?.renderInline;
  if (customRenderer) {
    const title =
      typeof props.title === "string" && props.title
        ? props.title
        : "Untitled artifact";
    const artifactId =
      typeof props.artifactId === "string" ? props.artifactId : "";
    const status = props.status === "streaming" ? "streaming" : "complete";
    const artifactType =
      typeof props.artifactType === "string" ? props.artifactType : "markdown";

    const result = customRenderer({
      artifact: { artifactId, title, artifactType, status },
      config: context.config,
      defaultRenderer: () => renderDefaultArtifactInline(props, context)
    });
    if (result) return result;
  }

  return renderDefaultArtifactInline(props, context);
};
