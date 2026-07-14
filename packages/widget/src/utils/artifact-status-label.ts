import type {
  AgentWidgetArtifactsFeature,
  PersonaArtifactRecord,
  PersonaArtifactStatusLabelContext
} from "../types";
import { createElement } from "./dom";
import { fileTypeLabel } from "./artifact-file";
import { applyArtifactLoadingStatus } from "./artifact-loading-status";

/**
 * Shared resolver + applier for the artifact streaming status label
 * (`features.artifacts.statusLabel`).
 *
 * Three surfaces render the "Generating …" status while an artifact streams:
 * the reference card status line, the inline chrome meta span, and the inline
 * streaming status body. All three resolve their text through
 * {@link resolveArtifactStatusLabel} and paint it through
 * {@link applyArtifactStatus}, so a host `statusLabel` string / function reads
 * identically everywhere.
 *
 * Animation-stability contract: the animated label span is (re)built only when
 * its text changes, so a per-delta detail update (live counters) never restarts
 * the shimmer/pulse/typewriter animation. `applyArtifactStatus` enforces this by
 * tracking the last-applied label text on the label span and by keeping the
 * plain detail span as a separate sibling the animation never touches.
 */

export type ArtifactStatusSurface = "card" | "inline-chrome" | "status-body";

export type ResolvedArtifactStatus = { label: string; detail?: string };

/** Class on the animated label span managed inside a status container. */
export const STATUS_LABEL_CLASS = "persona-artifact-status-label";
/** Class on the plain, freely-updating detail span. */
export const STATUS_DETAIL_CLASS = "persona-artifact-status-detail";
/** Attribute recording the last label text applied to the label span. */
const APPLIED_LABEL_ATTR = "data-artifact-status-label";

/**
 * First-seen streaming timestamp per artifact id, so `elapsedMs` starts near 0
 * and a completed → re-streamed artifact restarts cleanly. Set on the first
 * streaming resolve; cleared on complete (see {@link clearArtifactStatusTracking})
 * so the map cannot grow without bound.
 */
const firstSeenAt = new Map<string, number>();

const now = (): number =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

/** Drop the elapsed-time tracking for an artifact. Call on complete. */
export function clearArtifactStatusTracking(id: string): void {
  if (id) firstSeenAt.delete(id);
}

/** Type subject used to build the default label; mirrors the card/chrome logic. */
function typeLabelFor(record: PersonaArtifactRecord): string {
  const file = record.artifactType === "markdown" ? record.file : undefined;
  if (file) return fileTypeLabel(file);
  return record.artifactType === "component" ? "Component" : "Document";
}

/**
 * Resolve the streaming status label + optional detail for one surface.
 *
 * - `statusLabel` unset → the default `Generating <type>...`.
 * - string → that string as the label (no detail).
 * - function → called with a per-surface context; a string return is the label,
 *   an object return is `{ label, detail }`. A throw falls back to the default.
 */
export function resolveArtifactStatusLabel(
  record: PersonaArtifactRecord,
  cfg: AgentWidgetArtifactsFeature | undefined,
  surface: ArtifactStatusSurface
): ResolvedArtifactStatus {
  const typeLabel = typeLabelFor(record);
  const defaultLabel = `Generating ${typeLabel.toLowerCase()}...`;

  const statusLabel = cfg?.statusLabel;
  if (typeof statusLabel === "string") {
    return { label: statusLabel };
  }
  if (typeof statusLabel !== "function") {
    return { label: defaultLabel };
  }

  // Track first-seen only while streaming (the surfaces only resolve while
  // streaming); elapsedMs measures from that instant.
  const id = record.id;
  let firstSeen = firstSeenAt.get(id);
  if (record.status !== "complete" && firstSeen === undefined) {
    firstSeen = now();
    firstSeenAt.set(id, firstSeen);
  }
  const elapsedMs = firstSeen === undefined ? 0 : Math.max(0, now() - firstSeen);

  const isComponent = record.artifactType === "component";
  const markdown =
    !isComponent && typeof record.markdown === "string" ? record.markdown : "";
  const chars = isComponent ? 0 : markdown.length;
  const lines = isComponent || markdown === "" ? 0 : markdown.split("\n").length;
  const file = record.artifactType === "markdown" ? record.file : undefined;

  const ctx: PersonaArtifactStatusLabelContext = {
    artifactId: id,
    artifactType: record.artifactType,
    title: record.title,
    typeLabel,
    file,
    chars,
    lines,
    elapsedMs,
    // Lazy: only materialize the accumulated source if the host asks for it.
    content: () => (isComponent ? "" : markdown),
    surface
  };

  try {
    const result = statusLabel(ctx);
    if (typeof result === "string") return { label: result };
    if (
      result &&
      typeof result === "object" &&
      typeof result.label === "string"
    ) {
      return {
        label: result.label,
        detail: typeof result.detail === "string" ? result.detail : undefined
      };
    }
    // A malformed return (null/number/etc.) falls back like a throw.
    return { label: defaultLabel };
  } catch {
    // A bad host callback must never break rendering.
    return { label: defaultLabel };
  }
}

/** Restore the label span to its base state before re-applying the animation. */
function resetLabelSpan(labelEl: HTMLElement): void {
  labelEl.className = STATUS_LABEL_CLASS;
  labelEl.removeAttribute("data-preserve-animation");
  labelEl.style.removeProperty("--persona-tool-anim-duration");
  labelEl.style.removeProperty("--persona-tool-anim-color");
  labelEl.style.removeProperty("--persona-tool-anim-secondary-color");
  labelEl.replaceChildren();
}

/**
 * Paint a resolved status into `container`, which owns exactly two children: an
 * animated label span and an optional plain detail span.
 *
 * The label span is rebuilt (and its animation re-applied) ONLY when its text
 * differs from the last application, so a detail-only update never restarts the
 * loading animation. The detail span updates its `textContent` freely and is
 * removed when the resolved detail is empty.
 */
export function applyArtifactStatus(
  container: HTMLElement,
  resolved: ResolvedArtifactStatus,
  cfg: AgentWidgetArtifactsFeature | undefined
): void {
  let labelEl = container.querySelector<HTMLElement>(
    `:scope > .${STATUS_LABEL_CLASS}`
  );
  if (!labelEl) {
    labelEl = createElement("span", STATUS_LABEL_CLASS);
    container.appendChild(labelEl);
  }
  if (labelEl.getAttribute(APPLIED_LABEL_ATTR) !== resolved.label) {
    resetLabelSpan(labelEl);
    applyArtifactLoadingStatus(labelEl, resolved.label, cfg);
    labelEl.setAttribute(APPLIED_LABEL_ATTR, resolved.label);
  }

  let detailEl = container.querySelector<HTMLElement>(
    `:scope > .${STATUS_DETAIL_CLASS}`
  );
  const detail = resolved.detail;
  if (detail) {
    if (!detailEl) {
      detailEl = createElement("span", STATUS_DETAIL_CLASS);
      container.appendChild(detailEl);
    }
    if (detailEl.textContent !== detail) detailEl.textContent = detail;
  } else if (detailEl) {
    detailEl.remove();
  }
}
