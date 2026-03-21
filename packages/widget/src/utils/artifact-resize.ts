/** Minimum width (px) reserved for the chat column while resizing the artifact pane. */
export const ARTIFACT_RESIZE_CHAT_MIN_PX = 200;

/** Default minimum width (px) for the artifact column when `resizableMinWidth` is unset. */
export const ARTIFACT_RESIZE_PANE_MIN_DEFAULT_PX = 200;

/** Parse a `NNpx` string; returns `fallback` if missing or invalid. */
export function parseArtifactResizePx(input: string | undefined, fallback: number): number {
  if (!input?.trim()) return fallback;
  const m = /^(\d+(?:\.\d+)?)px\s*$/i.exec(input.trim());
  if (!m) return fallback;
  return Math.max(0, Number(m[1]));
}

/** Optional max from config: only valid `px` strings apply; otherwise no extra cap. */
export function parseArtifactResizeMaxPxOptional(input: string | undefined): number | null {
  if (!input?.trim()) return null;
  const m = /^(\d+(?:\.\d+)?)px\s*$/i.exec(input.trim());
  if (!m) return null;
  return Math.max(0, Number(m[1]));
}

export function clampArtifactPaneWidth(widthPx: number, minPx: number, maxPx: number): number {
  if (maxPx < minPx) return minPx;
  return Math.min(maxPx, Math.max(minPx, widthPx));
}

/**
 * Upper bound for artifact width (px) from split row geometry: leave room for chat min, two flex gaps, handle.
 */
export function maxArtifactWidthFromSplit(
  splitWidthPx: number,
  gapPx: number,
  handleWidthPx: number,
  chatMinPx: number
): number {
  const raw = splitWidthPx - chatMinPx - 2 * gapPx - handleWidthPx;
  return Math.max(0, raw);
}

/** Read the first gap value from computed `gap` (e.g. `8px` or `8px 8px`). */
export function readFlexGapPx(splitRoot: HTMLElement, win: Window): number {
  const g = win.getComputedStyle(splitRoot).gap || "0px";
  const first = g.trim().split(/\s+/)[0] ?? "0px";
  const m = /^([\d.]+)px$/i.exec(first);
  if (m) return Number(m[1]);
  const m2 = /^([\d.]+)/.exec(first);
  return m2 ? Number(m2[1]) : 8;
}

export function resolveArtifactPaneWidthPx(
  candidatePx: number,
  splitWidthPx: number,
  gapPx: number,
  handleWidthPx: number,
  resizableMinWidth?: string,
  resizableMaxWidth?: string
): number {
  const minPx = parseArtifactResizePx(resizableMinWidth, ARTIFACT_RESIZE_PANE_MIN_DEFAULT_PX);
  let maxPx = maxArtifactWidthFromSplit(splitWidthPx, gapPx, handleWidthPx, ARTIFACT_RESIZE_CHAT_MIN_PX);
  maxPx = Math.max(minPx, maxPx);
  const cap = parseArtifactResizeMaxPxOptional(resizableMaxWidth);
  if (cap !== null) {
    maxPx = Math.min(maxPx, cap);
  }
  return clampArtifactPaneWidth(candidatePx, minPx, maxPx);
}
