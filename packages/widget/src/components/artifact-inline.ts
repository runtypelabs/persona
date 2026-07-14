import type { ComponentContext, ComponentRenderer } from "./registry";
import type {
  AgentWidgetArtifactsFeature,
  PersonaArtifactFileMeta,
  PersonaArtifactRecord
} from "../types";
import { createElement } from "../utils/dom";
import { basenameOf, fileKindOf, fileTypeLabel } from "../utils/artifact-file";
import { applyArtifactLoadingStatus } from "../utils/artifact-loading-status";
import { artifactRecordActionContext, buildArtifactActionButton } from "../utils/artifact-custom-actions";
import { createIconButton, createToggleGroup } from "../utils/buttons";
import { renderLucideIcon } from "../utils/icons";
import {
  renderArtifactPreviewBody,
  runArtifactBodyTransition,
  type ArtifactBodyLayout
} from "./artifact-preview";
import { PersonaArtifactCard } from "./artifact-card";

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
 * reveals the complete-gated actions. The chrome also carries an optional
 * per-block rendered/source view toggle (availability-gated to file artifacts
 * that have a rendered alternative to their source), which cross-fades the body
 * between the preview and the raw highlighted source.
 *
 * Chrome + built-in actions are configurable via
 * `config.features.artifacts.inlineChrome`
 * (boolean or { showCopy, showExpand, showViewToggle })
 * and `config.features.artifacts.inlineActions`. A full structural override is
 * available via `config.features.artifacts.renderInline` (mirroring the card's
 * `renderCard`), which short-circuits before the default renderer.
 *
 * Body layout is configured via `config.features.artifacts.inlineBody`,
 * resolved here into a flat {@link ArtifactBodyLayout} that is threaded into the
 * shared preview renderer (inline path only — the pane never passes it). This
 * component owns the height model that surrounds that renderer: it sets the
 * `--persona-artifact-inline-body-height` CSS var on the root per state, toggles
 * the complete-state non-iframe height cap on the body wrapper, and wraps the
 * streaming→complete swap in a View Transition when enabled. The default
 * (fixed 320px streaming window, tail-follow, top fade, auto transition) changes
 * the pre-existing grow-with-content streaming behavior; `inlineBody.height:
 * "auto"` restores it.
 */

export type InlineArtifactUpdateOptions = {
  /**
   * Skip the streaming→complete View Transition for this update. The View
   * Transition captures the whole document, so running it while the transcript
   * is still streaming cross-fades a stale snapshot of the moving message text
   * over the live text — which reads as ghosting/motion blur on the chat
   * messages. The body swap still happens, just instantly.
   */
  suppressTransition?: boolean;
};

const inlineBlockUpdaters = new WeakMap<
  HTMLElement,
  (record: PersonaArtifactRecord, opts?: InlineArtifactUpdateOptions) => void
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
  artifacts: PersonaArtifactRecord[],
  opts?: InlineArtifactUpdateOptions
): void {
  if (artifacts.length === 0) return;
  const byId = new Map(artifacts.map((a) => [a.id, a]));
  root.querySelectorAll<HTMLElement>("[data-artifact-inline]").forEach((el) => {
    const update = inlineBlockUpdaters.get(el);
    if (!update) return;
    const record = byId.get(el.getAttribute("data-artifact-inline") ?? "");
    if (record) update(record, opts);
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

/**
 * Build the card component's prop shape from a live preview record, for the
 * `completeDisplay: "card"` collapse. The card renderer reads title / status /
 * type / id and (for markdown records) markdown + file meta; component records
 * only need id + title + type. Mirrors the prop keys `recordFromProps` reads.
 */
function cardPropsFromRecord(
  record: PersonaArtifactRecord
): Record<string, unknown> {
  const props: Record<string, unknown> = {
    artifactId: record.id,
    title: record.title ?? "",
    status: record.status,
    artifactType: record.artifactType
  };
  if (record.artifactType === "markdown") {
    if (typeof record.markdown === "string") props.markdown = record.markdown;
    if (record.file) props.file = record.file;
  }
  return props;
}

/**
 * Collapse animation for `completeDisplay: "card"`: transition the block root's
 * height from the reserved streaming height (`startHeight`, measured before the
 * card was swapped in) down to the card's height over ~200ms ease-out, then
 * clear back to `auto`. Plain CSS transition, never a View Transition.
 *
 * Degrades to an instant swap (no-op) under `prefers-reduced-motion` and when
 * the block has no layout — detached from the document or a zero-height measure
 * (tests/jsdom) — so nothing is left behind on the root.
 */
function animateInlineCollapse(root: HTMLElement, startHeight: number): void {
  if (!startHeight || !root.isConnected) return;
  let reduceMotion = false;
  try {
    reduceMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    reduceMotion = false;
  }
  if (reduceMotion) return;
  const endHeight = root.getBoundingClientRect().height;
  if (!endHeight || Math.abs(endHeight - startHeight) < 1) return;

  root.style.height = `${startHeight}px`;
  root.style.overflow = "hidden";
  // Force a reflow so the start height is committed before the transition arms.
  void root.offsetHeight;
  root.style.transition = "height 200ms ease-out";
  root.style.height = `${endHeight}px`;

  let done = false;
  const clear = () => {
    if (done) return;
    done = true;
    root.removeEventListener("transitionend", onEnd);
    root.style.removeProperty("height");
    root.style.removeProperty("overflow");
    root.style.removeProperty("transition");
  };
  const onEnd = (e: TransitionEvent) => {
    if (e.propertyName === "height") clear();
  };
  root.addEventListener("transitionend", onEnd);
  // Fallback in case transitionend never fires (interrupted layout, etc.).
  window.setTimeout(clear, 260);
}

/** Resolve the inline chrome config knobs (chrome on by default). */
function resolveInlineChrome(cfg: AgentWidgetArtifactsFeature | undefined): {
  chromeEnabled: boolean;
  showCopy: boolean;
  showExpand: boolean;
  showViewToggle: boolean;
} {
  const inlineChrome = cfg?.inlineChrome;
  if (inlineChrome === false) {
    return {
      chromeEnabled: false,
      showCopy: false,
      showExpand: false,
      showViewToggle: false
    };
  }
  const opts = typeof inlineChrome === "object" ? inlineChrome : undefined;
  return {
    chromeEnabled: true,
    showCopy: opts?.showCopy !== false,
    showExpand: opts?.showExpand !== false,
    showViewToggle: opts?.showViewToggle !== false
  };
}

/** CSS var carrying the current-state numeric body height (px); unset = "auto". */
const BODY_HEIGHT_VAR = "--persona-artifact-inline-body-height";

/**
 * Resolve `features.artifacts.inlineBody` into the flat {@link ArtifactBodyLayout}
 * the shared preview renderer consumes. Defaults: 320px both states, source
 * streaming view, rendered complete view, tail-follow on, top+bottom edge fade
 * (each edge clip-gated at render time), auto transition.
 */
export function resolveInlineBody(
  cfg: AgentWidgetArtifactsFeature | undefined
): ArtifactBodyLayout {
  const b = cfg?.inlineBody;
  const streamingView = b?.streamingView === "status" ? "status" : "source";
  const viewMode = b?.viewMode === "source" ? "source" : "rendered";

  let streamingHeight: number | "auto" = 320;
  let completeHeight: number | "auto" = 320;
  const h = b?.height;
  if (typeof h === "number" || h === "auto") {
    streamingHeight = h;
    completeHeight = h;
  } else if (h && typeof h === "object") {
    streamingHeight = h.streaming ?? 320;
    completeHeight = h.complete ?? 320;
  }

  // Clip mode shows the top of the document in a static window: no tail-follow
  // (followOutput is ignored — the window never scrolls), and its unset-fadeMask
  // default flips to bottom-only (the top is always visible, so a top fade would
  // never be correct). An explicit fadeMask still wins below.
  const overflow = b?.overflow === "clip" ? "clip" : "scroll";
  const followOutput = overflow === "clip" ? false : b?.followOutput !== false;

  // fadeMask: when unset, the default depends on the overflow mode — scroll gets
  // both edges (top + bottom), clip gets bottom-only. An explicit value (boolean
  // or object) always wins over that mode default. Each edge is clip-gated at
  // runtime in artifact-preview.ts `updateFadeClasses` (only shown when that edge
  // is actually clipped), so with scroll+tail-follow pinned at the bottom the
  // bottom fade stays visually inert until the reader scrolls up mid-stream.
  let fadeTop: boolean;
  let fadeBottom: boolean;
  const fm = b?.fadeMask;
  if (fm === true) {
    fadeTop = true;
    fadeBottom = true;
  } else if (fm === false) {
    fadeTop = false;
    fadeBottom = false;
  } else if (fm && typeof fm === "object") {
    fadeTop = fm.top === true;
    fadeBottom = fm.bottom === true;
  } else if (overflow === "clip") {
    fadeTop = false;
    fadeBottom = true;
  } else {
    fadeTop = true;
    fadeBottom = true;
  }

  const transition = b?.transition === "none" ? "none" : "auto";
  const completeDisplay = b?.completeDisplay === "card" ? "card" : "inline";

  return {
    streamingView,
    viewMode,
    streamingHeight,
    completeHeight,
    followOutput,
    overflow,
    fadeTop,
    fadeBottom,
    transition,
    completeDisplay
  };
}

function renderDefaultArtifactInline(
  props: Record<string, unknown>,
  context: ComponentContext
): HTMLElement {
  const record = recordFromProps(props);
  const artifactsCfg = context.config?.features?.artifacts;
  const { chromeEnabled, showCopy, showExpand, showViewToggle } =
    resolveInlineChrome(artifactsCfg);
  const inlineActions = artifactsCfg?.inlineActions ?? [];
  const bodyLayout = resolveInlineBody(artifactsCfg);
  const collapseToCard = bodyLayout.completeDisplay === "card";

  // Per-block rendered/source view toggle state. `null` = follow the configured
  // default (`bodyLayout.viewMode`); a set value is the user's explicit choice
  // for this block. Reset to `null` when content restarts streaming or a
  // different artifact id arrives (see the block updater below) so hydrated/new
  // content starts on the configured default. `currentRecord` tracks the latest
  // record so the toggle's direct click handler re-renders against fresh content.
  let userViewMode: "rendered" | "source" | null = null;
  let currentRecord = record;

  const root = createElement(
    "div",
    "persona-artifact-inline persona-w-full persona-max-w-full"
  );
  root.setAttribute("data-persona-theme-zone", "artifact-inline");
  if (record.id) {
    root.setAttribute("data-artifact-inline", record.id);
  }

  // completeDisplay: "card" — collapse the block to the compact reference card
  // once the artifact completes. `PersonaArtifactCard` is the public card entry,
  // so a host `features.artifacts.renderCard` override still applies. The card
  // is mounted on the SAME root (data-artifact-inline keying + theme zone
  // survive); the frame chrome styling is dropped via a modifier class because
  // the card carries its own border/background. The registered updater becomes a
  // card-sync updater so later records (title/status changes) re-render the card.
  const renderCardChild = (rec: PersonaArtifactRecord): HTMLElement =>
    PersonaArtifactCard(cardPropsFromRecord(rec), context);
  const mountCard = (rec: PersonaArtifactRecord): void => {
    root.classList.add("persona-artifact-inline--card");
    root.style.removeProperty(BODY_HEIGHT_VAR);
    root.replaceChildren(renderCardChild(rec));
    inlineBlockUpdaters.set(root, (r) => {
      root.replaceChildren(renderCardChild(r));
    });
  };

  // Hydration: a block whose props arrive already-complete renders the card
  // directly — no flash of the inline body, no collapse animation.
  if (collapseToCard && record.status === "complete") {
    mountCard(record);
    return root;
  }

  const handle = renderArtifactPreviewBody(record, {
    config: context.config,
    bodyLayout,
    // The user's per-block toggle wins over the configured default; `null`
    // falls back to `bodyLayout.viewMode`, so with no toggle interaction this
    // is behavior-identical to passing no `resolveViewMode` at all.
    resolveViewMode: () => userViewMode ?? bodyLayout.viewMode
  });

  // Body wrapper is always present so the frame's padding lives here (chrome
  // sits flush to the frame edge); required even when chrome is disabled.
  const body = createElement("div", "persona-artifact-inline-body");
  body.appendChild(handle.el);

  // Height model (inlineBody): set the current-state numeric height as a CSS
  // var on the root, then classify the rendered body (post-render — the shared
  // renderer owns the pre/iframe/markdown branching, mirroring the pane's flush
  // toggle):
  // - code body → `persona-artifact-content-flush`, full-bleed like the pane's
  //   source view (gutter flush to the frame edge)
  // - fill-capable body (fixed source window / iframe / status placeholder) →
  //   the wrapper owns the reserved height (border-box), so flush and padded
  //   states occupy the same outer box and every swap is layout neutral
  // - flow body (rendered markdown, component) → complete-state max-height cap
  const applyBodyHeight = (rec: PersonaArtifactRecord) => {
    const streaming = rec.status !== "complete";
    const h = streaming ? bodyLayout.streamingHeight : bodyLayout.completeHeight;
    const numeric = typeof h === "number";
    if (numeric) {
      root.style.setProperty(BODY_HEIGHT_VAR, `${h}px`);
    } else {
      root.style.removeProperty(BODY_HEIGHT_VAR);
    }
    const hasCodePre = Boolean(handle.el.querySelector(".persona-code-pre"));
    const fillCapable = Boolean(
      handle.el.querySelector(
        "iframe, .persona-artifact-source-window--fixed, .persona-artifact-status-view"
      )
    );
    body.classList.toggle("persona-artifact-content-flush", hasCodePre);
    body.classList.toggle(
      "persona-artifact-inline-body--sized",
      numeric && fillCapable
    );
    body.classList.toggle(
      "persona-artifact-inline-body--cap",
      !streaming && !fillCapable && typeof bodyLayout.completeHeight === "number"
    );
  };

  // Body updater: set the height var, run the (optionally animated) swap on the
  // streaming→complete boundary, then re-apply the complete-state cap.
  let lastBodyStatus: string = record.status;
  const runBodyUpdate = (
    rec: PersonaArtifactRecord,
    opts?: InlineArtifactUpdateOptions
  ) => {
    const boundary = lastBodyStatus !== "complete" && rec.status === "complete";
    if (boundary) {
      // Pre-set the target (complete) height so the reserved streaming window
      // and the completed body share a height and the swap is layout-neutral.
      if (typeof bodyLayout.completeHeight === "number") {
        root.style.setProperty(BODY_HEIGHT_VAR, `${bodyLayout.completeHeight}px`);
      } else {
        root.style.removeProperty(BODY_HEIGHT_VAR);
      }
      // Re-apply inside the swap too: with a live View Transition the swap
      // callback runs after the snapshot, so the outer applyBodyHeight below
      // would read the pre-swap DOM for iframe/window detection.
      runArtifactBodyTransition(
        body,
        opts?.suppressTransition ? "none" : bodyLayout.transition,
        rec.id,
        () => {
          handle.update(rec);
          applyBodyHeight(rec);
        }
      );
    } else {
      handle.update(rec);
    }
    applyBodyHeight(rec);
    lastBodyStatus = rec.status;
  };

  applyBodyHeight(record);

  // Clip-mode expand hitbox: in `inlineBody.overflow: "clip"` the body shows a
  // static top-of-document window with no internal scroll, so — when the chrome's
  // Expand control is enabled and the record has an id — the whole body doubles
  // as the expand affordance (industry inline-card pattern). Reuse the existing
  // `data-expand-artifact-inline` delegation in ui.ts (matched via closest(), so
  // a body-level attribute works; Enter/Space are handled by the same keydown
  // delegation). The aria-label is refreshed in updateChrome as the title
  // streams in. When Expand is disabled the clip stays purely visual.
  const clipExpandHitbox =
    bodyLayout.overflow === "clip" && showExpand && !!record.id;
  if (clipExpandHitbox) {
    body.setAttribute("data-expand-artifact-inline", record.id);
    body.setAttribute("role", "button");
    body.setAttribute("tabindex", "0");
    body.classList.add("persona-cursor-pointer");
    body.setAttribute(
      "aria-label",
      `Open ${chromeLabelsFor(record).title} in panel`
    );
  }

  if (!chromeEnabled) {
    root.appendChild(body);
    inlineBlockUpdaters.set(root, runBodyUpdate);
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

  const effectiveViewMode = (): "rendered" | "source" =>
    userViewMode ?? bodyLayout.viewMode;

  // Rendered/source view toggle: the same segmented toggle group the artifact
  // pane uses (createToggleGroup), so the inline chrome matches the pane's UX.
  // Both segments (eye "Rendered view", code-xml "Source") are always visible and
  // the active one is highlighted. Created only when enabled; per-record
  // availability is gated in updateChrome via persona-hidden on the whole group,
  // like copy. updateChrome also syncs the selected segment on every update.
  const viewToggle = showViewToggle
    ? createToggleGroup({
        items: [
          {
            id: "rendered",
            icon: "eye",
            label: "Rendered view",
            className: "persona-artifact-doc-icon-btn persona-artifact-view-btn"
          },
          {
            id: "source",
            icon: "code-xml",
            label: "Source",
            className: "persona-artifact-doc-icon-btn persona-artifact-code-btn"
          }
        ],
        selectedId: effectiveViewMode(),
        className: "persona-artifact-toggle-group persona-flex-shrink-0",
        // Direct handlers via the group's own click listeners (deliberate
        // deviation from the delegated copy/expand pattern): the toggle is purely
        // block-local state + a re-render of this block's own preview handle. It
        // needs no session access, and the chrome element is stable for the
        // block's lifetime (never remounted), so direct handlers are simpler and
        // correct here — no delegation round-trip needed.
        onSelect: (id) => {
          const next = id === "source" ? "source" : "rendered";
          // Selecting the already-active segment is a no-op (createToggleGroup
          // still fires onSelect on a re-click of the active segment).
          if (next === effectiveViewMode()) return;
          userViewMode = next;
          // Known tradeoff: toggling away from a live file-preview iframe drops it,
          // and toggling back rebuilds it (srcdoc reload → iframe-internal state
          // lost). Same behavior as the pane's toggle; we deliberately do not keep
          // a detached iframe alive.
          //
          // Swap instantly — no runArtifactBodyTransition here. The View
          // Transition exists for the streaming→complete swap; on a toggle
          // click its document-wide snapshot crossfade would paint over the
          // group's sliding-thumb animation (which plays inside the snapshot
          // window and reads as a plain dissolve). The pane's toggle also
          // swaps its body instantly, so this keeps the two in parity: the
          // thumb slide IS the toggle's animation.
          handle.update(currentRecord);
          applyBodyHeight(currentRecord);
        }
      })
    : null;

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
  if (viewToggle) actions.appendChild(viewToggle.element);
  if (copyBtn) actions.appendChild(copyBtn);
  if (expandBtn) actions.appendChild(expandBtn);

  chrome.append(lead, actions);
  root.append(chrome, body);

  const updateChrome = (rec: PersonaArtifactRecord) => {
    const { title, typeLabel } = chromeLabelsFor(rec);
    titleEl.textContent = title;
    titleEl.title = title;
    // Keep the clip-mode body hitbox's label in sync with the streaming title.
    if (clipExpandHitbox) {
      body.setAttribute("aria-label", `Open ${title} in panel`);
    }

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

    // View toggle availability: complete file artifacts that actually have a
    // rendered alternative to their source. Plain markdown (no file meta) and
    // component artifacts are hidden here (v1 decision: the pane toggle covers
    // them). Also hidden when the host forced source-only via
    // `inlineBody.viewMode: "source"` — there is no preview to switch to.
    if (viewToggle) {
      const file = rec.artifactType === "markdown" ? rec.file : undefined;
      let canToggle = false;
      if (!streaming && file && bodyLayout.viewMode !== "source") {
        const kind = fileKindOf(file);
        if (kind === "markdown") {
          canToggle = true;
        } else if (kind === "html" || kind === "svg") {
          canToggle = artifactsCfg?.filePreview?.enabled !== false;
        }
        // kind "other" → source-only, no rendered alternative → stays hidden.
      }
      viewToggle.element.classList.toggle("persona-hidden", !canToggle);
      // Sync the group's selected segment on every update: inlineBlockUpdaters
      // resets userViewMode to null on re-stream / new id, so the group must snap
      // back to the configured default here.
      viewToggle.setSelected(effectiveViewMode());
    }

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

  inlineBlockUpdaters.set(root, (rec, opts) => {
    // completeDisplay: "card" — on the streaming→complete boundary, collapse the
    // whole block (chrome + body) to the reference card on the same root instead
    // of swapping the body. Measure the reserved streaming height first, mount
    // the card (which re-registers a card-sync updater, so this closure won't run
    // again), then animate the height down. The plain-CSS collapse replaces the
    // body's View Transition here, so `runBodyUpdate` is deliberately bypassed —
    // it must not double-fire runArtifactBodyTransition for this boundary.
    if (
      collapseToCard &&
      lastBodyStatus !== "complete" &&
      rec.status === "complete"
    ) {
      const startHeight = root.isConnected
        ? root.getBoundingClientRect().height
        : 0;
      lastBodyStatus = "complete";
      mountCard(rec);
      animateInlineCollapse(root, startHeight);
      return;
    }
    // Reset the per-block view toggle when content restarts streaming or a
    // different artifact id arrives, so hydrated/new content starts on the
    // configured default. Must run before runBodyUpdate → handle.update reads
    // userViewMode via resolveViewMode.
    if (rec.status !== "complete" || rec.id !== currentRecord.id) {
      userViewMode = null;
    }
    currentRecord = rec;
    runBodyUpdate(rec, opts);
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
