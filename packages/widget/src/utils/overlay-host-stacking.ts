import { DEFAULT_OVERLAY_Z_INDEX } from "./constants";

/**
 * Elevates the light-DOM host element's stacking context so viewport-covering
 * overlays (sidebar, fullscreen) can escape parent stacking traps.
 *
 * - If the host has `position: static`, sets it to `relative` (required for
 *   `z-index` to take effect).
 * - Applies `z-index` matching the overlay default.
 * - Applies `isolation: isolate` to create a predictable stacking context.
 *
 * @returns A teardown function that restores only the properties that were changed.
 */
export function syncOverlayHostStacking(
  host: HTMLElement,
  zIndex: number = DEFAULT_OVERLAY_Z_INDEX
): () => void {
  const originalPosition = host.style.position;
  const originalZIndex = host.style.zIndex;
  const originalIsolation = host.style.isolation;

  const computed = getComputedStyle(host);
  const positionWasSet = computed.position === "static" || computed.position === "";
  if (positionWasSet) {
    host.style.position = "relative";
  }

  host.style.zIndex = String(zIndex);
  host.style.isolation = "isolate";

  return () => {
    if (positionWasSet) {
      host.style.position = originalPosition;
    }
    host.style.zIndex = originalZIndex;
    host.style.isolation = originalIsolation;
  };
}
