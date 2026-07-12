import type { ComponentContext, ComponentRenderer } from "./registry";
import type {
  AgentWidgetArtifactsFeature,
  PersonaArtifactFileMeta,
  PersonaArtifactRecord
} from "../types";
import { createElement } from "../utils/dom";
import { basenameOf, fileTypeLabel } from "../utils/artifact-file";
import { applyArtifactLoadingStatus } from "../utils/artifact-loading-status";
import { artifactRecordActionContext, buildArtifactActionButton } from "../utils/artifact-custom-actions";
import { createIconButton } from "../utils/buttons";
import { renderLucideIcon } from "../utils/icons";
import { renderArtifactPreviewBody } from "./artifact-preview";

/**
 * Built-in inline artifact block component (display: "inline").
 *
 * Renders the artifact preview body directly in the chat thread via the
 * shared `renderArtifactPreviewBody` — the same surface the artifact pane
 * uses — inside a file-preview chrome (title bar + toolbar) so an inline block
 * reads like a document, not a naked body in a bordered box.
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
 *   which routes the matching record into the preview handle's `update()` and
 *   the chrome's in-place `updateChrome()`.
 *
 * The chrome updates in place on the same stable root (pane-style), never a
 * card-style remount — re-attaching the body would reload a live file-preview
 * iframe. While streaming the chrome shows a streaming status and hides copy +
 * custom actions; on complete it swaps the status for the type label and
 * reveals the complete-gated actions.
 *
 * Chrome + built-in actions are configurable via
 * `config.features.artifacts.inlineChrome` (boolean or { showCopy, showExpand })
 * and `config.features.artifacts.inlineActions`. A full structural override is
 * available via `config.features.artifacts.renderInline` (mirroring the card's
 * `renderCard`), which short-circuits before the default renderer.
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
 *
 * v1 tradeoff: an empty registry (e.g. `clearArtifacts()` mid-stream) is a
 * no-op, so a block already showing pushed content stays frozen on it rather
 * than reverting to its props render. Resetting to props on every clear would
 * churn the common case and reload live file-preview iframes; accepted as-is.
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
    const embedded = props.componentProps;
    const componentProps =
      embedded && typeof embedded === "object" && !Array.isArray(embedded)
        ? (embedded as Record<string, unknown>)
        : {};
    return {
      id,
      artifactType: "component",
      title,
      status,
      component: typeof props.component === "string" ? props.component : "",
      props: componentProps
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

/** Title (basename for file artifacts) + type label, derived like the card. */
function chromeLabelsFor(record: PersonaArtifactRecord): {
  title: string;
  typeLabel: string;
} {
  const file = record.artifactType === "markdown" ? record.file : undefined;
  const title = file
    ? basenameOf(file.path)
    : record.title && record.title.trim()
      ? record.title
      : "Untitled artifact";
  const typeLabel = file
    ? fileTypeLabel(file)
    : record.artifactType === "component"
      ? "Component"
      : "Document";
  return { title, typeLabel };
}

/** Resolve the inline chrome config knobs (chrome on by default). */
function resolveInlineChrome(cfg: AgentWidgetArtifactsFeature | undefined): {
  chromeEnabled: boolean;
  showCopy: boolean;
  showExpand: boolean;
} {
  const inlineChrome = cfg?.inlineChrome;
  if (inlineChrome === false) {
    return { chromeEnabled: false, showCopy: false, showExpand: false };
  }
  const opts = typeof inlineChrome === "object" ? inlineChrome : undefined;
  return {
    chromeEnabled: true,
    showCopy: opts?.showCopy !== false,
    showExpand: opts?.showExpand !== false
  };
}

function renderDefaultArtifactInline(
  props: Record<string, unknown>,
  context: ComponentContext
): HTMLElement {
  const record = recordFromProps(props);
  const artifactsCfg = context.config?.features?.artifacts;
  const { chromeEnabled, showCopy, showExpand } = resolveInlineChrome(artifactsCfg);
  const inlineActions = artifactsCfg?.inlineActions ?? [];

  const root = createElement(
    "div",
    "persona-artifact-inline persona-w-full persona-max-w-full"
  );
  root.setAttribute("data-persona-theme-zone", "artifact-inline");
  if (record.id) {
    root.setAttribute("data-artifact-inline", record.id);
  }

  const handle = renderArtifactPreviewBody(record, { config: context.config });

  // Body wrapper is always present so the frame's padding lives here (chrome
  // sits flush to the frame edge); required even when chrome is disabled.
  const body = createElement("div", "persona-artifact-inline-body");
  body.appendChild(handle.el);

  if (!chromeEnabled) {
    root.appendChild(body);
    inlineBlockUpdaters.set(root, (rec) => handle.update(rec));
    return root;
  }

  // Chrome bar: [icon][title][type/status] … [inlineActions][copy][expand].
  const chrome = createElement("div", "persona-artifact-inline-chrome");
  chrome.setAttribute("data-persona-theme-zone", "artifact-inline-chrome");

  const lead = createElement("div", "persona-artifact-inline-chrome-lead");
  const iconWrap = createElement(
    "span",
    "persona-flex persona-items-center persona-flex-shrink-0"
  );
  const icon = renderLucideIcon("file-text", 16, "currentColor", 2);
  if (icon) iconWrap.appendChild(icon);
  const titleEl = createElement(
    "span",
    "persona-artifact-inline-title persona-truncate persona-min-w-0"
  );
  // Meta span toggles between the type label (complete) and the animated
  // streaming status; rebuilt in place on every update.
  const metaEl = createElement("span", "persona-artifact-inline-type");
  lead.append(iconWrap, titleEl, metaEl);

  const actions = createElement("div", "persona-artifact-inline-chrome-actions");
  // Custom inline actions are rebuilt per update so per-artifact visible() gates
  // re-evaluate as content materializes; they carry no direct listeners (clicks
  // are delegated in ui.ts via data-artifact-custom-action, keyed to the nearest
  // [data-artifact-inline] container).
  const customActionsWrap = createElement(
    "span",
    "persona-flex persona-items-center persona-gap-1"
  );

  const copyBtn = showCopy
    ? createIconButton({
        icon: "copy",
        label: "Copy",
        className: "persona-artifact-doc-icon-btn persona-flex-shrink-0"
      })
    : null;
  if (copyBtn && record.id) {
    // No direct listener: delegated in ui.ts via data-copy-artifact so the
    // handler survives re-renders and page-refresh hydration.
    copyBtn.setAttribute("data-copy-artifact", record.id);
  }

  const expandBtn = showExpand
    ? createIconButton({
        icon: "maximize",
        label: "Open in panel",
        className: "persona-artifact-doc-icon-btn persona-flex-shrink-0"
      })
    : null;
  if (expandBtn && record.id) {
    // Delegated in ui.ts via data-expand-artifact-inline (opens the pane).
    expandBtn.setAttribute("data-expand-artifact-inline", record.id);
  }

  actions.appendChild(customActionsWrap);
  if (copyBtn) actions.appendChild(copyBtn);
  if (expandBtn) actions.appendChild(expandBtn);

  chrome.append(lead, actions);
  root.append(chrome, body);

  const updateChrome = (rec: PersonaArtifactRecord) => {
    const { title, typeLabel } = chromeLabelsFor(rec);
    titleEl.textContent = title;
    titleEl.title = title;

    const streaming = rec.status !== "complete";
    // Reset the meta span (className replace clears stale animation classes).
    metaEl.className = streaming
      ? "persona-artifact-inline-status"
      : "persona-artifact-inline-type";
    metaEl.removeAttribute("data-preserve-animation");
    metaEl.replaceChildren();
    if (streaming) {
      applyArtifactLoadingStatus(
        metaEl,
        `Generating ${typeLabel.toLowerCase()}...`,
        artifactsCfg
      );
    } else {
      metaEl.textContent = typeLabel;
    }

    // Copy + custom actions only act on complete content; expand stays visible
    // through streaming so it is always available.
    if (copyBtn) copyBtn.classList.toggle("persona-hidden", streaming);

    customActionsWrap.replaceChildren();
    if (!streaming && inlineActions.length > 0) {
      const ctx = artifactRecordActionContext(rec);
      if (ctx) {
        for (const action of inlineActions) {
          try {
            if (action.visible === undefined || action.visible(ctx)) {
              const btn = buildArtifactActionButton(action, { documentChrome: true });
              btn.setAttribute("data-artifact-custom-action", action.id);
              btn.classList.add("persona-flex-shrink-0");
              customActionsWrap.appendChild(btn);
            }
          } catch {
            // A single bad action must not take down the whole chrome.
          }
        }
      }
    }
  };

  updateChrome(record);

  inlineBlockUpdaters.set(root, (rec) => {
    handle.update(rec);
    updateChrome(rec);
  });

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
