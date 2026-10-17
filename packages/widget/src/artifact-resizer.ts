import type { AgentWidgetConfig } from "./types";
import { createElement } from "./utils/dom";
import { readFlexGapPx, resolveArtifactPaneWidthPx } from "./utils/artifact-resize";

/** Resizing is owned by the optional artifact pane and dies with that pane. */
export function createArtifactResizer(options: {
  mount: HTMLElement;
  splitRoot: HTMLElement;
  pane: { element: HTMLElement };
  getConfig: () => AgentWidgetConfig;
  chatMinWidth: () => number;
  isVisible: () => boolean;
}) {
  const { mount, splitRoot: artifactSplitRoot, pane: artifactPaneApi } = options;
  let artifactResizeHandle: HTMLElement | null = null;
  let artifactResizeUnbind: (() => void) | null = null;
  let artifactResizeDocEnd: (() => void) | null = null;
  function stopArtifactResizePointer() {
    artifactResizeDocEnd?.();
    artifactResizeDocEnd = null;
  }
  const positionExtensionArtifactResizeHandle = () => {
    if (!artifactSplitRoot || !artifactResizeHandle) return;
    // Welded splits (panel + seamless) have gap 0, so the handle overlays the seam
    // instead of consuming flex width; detached keeps a real gap and a flex handle.
    const ext = mount.classList.contains("persona-artifact-welded-split");
    const ownerWin = mount.ownerDocument.defaultView ?? window;
    const mobile = ownerWin.innerWidth <= 640;
    if (!ext || mount.classList.contains("persona-artifact-narrow-host") || mobile) {
      artifactResizeHandle.style.removeProperty("position");
      artifactResizeHandle.style.removeProperty("left");
      artifactResizeHandle.style.removeProperty("top");
      artifactResizeHandle.style.removeProperty("bottom");
      artifactResizeHandle.style.removeProperty("width");
      artifactResizeHandle.style.removeProperty("z-index");
      return;
    }
    const chat = artifactSplitRoot.firstElementChild as HTMLElement | null;
    if (!chat || chat === artifactResizeHandle) return;
    const hitW = 10;
    artifactResizeHandle.style.position = "absolute";
    artifactResizeHandle.style.top = "0";
    artifactResizeHandle.style.bottom = "0";
    artifactResizeHandle.style.width = `${hitW}px`;
    artifactResizeHandle.style.zIndex = "5";
    // Center the overlay on the seam: with an explicit welded gap the seam sits
    // half a gap past the chat's right edge (welded default gap is 0).
    const gapPx = readFlexGapPx(artifactSplitRoot, ownerWin);
    const left = chat.offsetWidth + gapPx / 2 - hitW / 2;
    artifactResizeHandle.style.left = `${Math.max(0, left)}px`;
  };

  const update = () => {
    const config = options.getConfig();
      if (!artifactSplitRoot || !artifactPaneApi) return;
      const want = config.features?.artifacts?.layout?.resizable === true;
      if (!want) {
        artifactResizeUnbind?.();
        artifactResizeUnbind = null;
        stopArtifactResizePointer();
        if (artifactResizeHandle) {
          artifactResizeHandle.remove();
          artifactResizeHandle = null;
        }
        artifactPaneApi.element.style.removeProperty("width");
        artifactPaneApi.element.style.removeProperty("maxWidth");
        return;
      }
      if (!artifactResizeHandle) {
        const handle = createElement(
          "div",
          "persona-artifact-split-handle persona-shrink-0 persona-h-full"
        );
        handle.setAttribute("role", "separator");
        handle.setAttribute("aria-orientation", "vertical");
        handle.setAttribute("aria-label", "Resize artifacts panel");
        handle.tabIndex = 0;

        const doc = mount.ownerDocument;
        const win = doc.defaultView ?? window;

        const onPointerDown = (e: PointerEvent) => {
          if (!artifactPaneApi || e.button !== 0) return;
          if (mount.classList.contains("persona-artifact-narrow-host")) return;
          if (mount.classList.contains("persona-artifact-expanded")) return;
          if (win.innerWidth <= 640) return;
          e.preventDefault();
          stopArtifactResizePointer();
          const startX = e.clientX;
          const startW = artifactPaneApi.element.getBoundingClientRect().width;
          const layout = options.getConfig().features?.artifacts?.layout;
          const onMove = (ev: PointerEvent) => {
            const splitW = artifactSplitRoot!.getBoundingClientRect().width;
            const weldedChrome = mount.classList.contains("persona-artifact-welded-split");
            // Read the effective flex gap either way: welded defaults to 0 but an
            // explicit splitGap opens a real gap that still consumes row width.
            const gapPx = readFlexGapPx(artifactSplitRoot!, win);
            // Welded overlays the handle on the seam (out of flow), so it consumes
            // no width; detached keeps it as an in-flow flex child.
            const handleW = weldedChrome ? 0 : handle.getBoundingClientRect().width || 6;
            // Handle is left of the artifact: drag left widens artifact, drag right narrows it.
            const next = startW - (ev.clientX - startX);
            const clamped = resolveArtifactPaneWidthPx(
              next,
              splitW,
              gapPx,
              handleW,
              layout?.resizableMinWidth,
              layout?.resizableMaxWidth,
              options.chatMinWidth()
            );
            artifactPaneApi!.element.style.width = `${clamped}px`;
            artifactPaneApi!.element.style.maxWidth = "none";
            positionExtensionArtifactResizeHandle();
          };
          const onUp = () => {
            doc.removeEventListener("pointermove", onMove);
            doc.removeEventListener("pointerup", onUp);
            doc.removeEventListener("pointercancel", onUp);
            artifactResizeDocEnd = null;
            try {
              handle.releasePointerCapture(e.pointerId);
            } catch {
              /* ignore */
            }
          };
          artifactResizeDocEnd = onUp;
          doc.addEventListener("pointermove", onMove);
          doc.addEventListener("pointerup", onUp);
          doc.addEventListener("pointercancel", onUp);
          try {
            handle.setPointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
        };

        handle.addEventListener("pointerdown", onPointerDown);
        artifactResizeHandle = handle;
        artifactSplitRoot.insertBefore(handle, artifactPaneApi.element);
        artifactResizeUnbind = () => {
          handle.removeEventListener("pointerdown", onPointerDown);
        };
      }
      if (artifactResizeHandle) {
        const has = options.isVisible();
        artifactResizeHandle.classList.toggle("persona-hidden", !has);
        positionExtensionArtifactResizeHandle();
      }
    };

  return { update, destroy() {
    artifactResizeUnbind?.();
    artifactResizeUnbind = null;
    stopArtifactResizePointer();
    if (artifactResizeHandle) {
      artifactResizeHandle.remove();
      artifactResizeHandle = null;
    }
  } };
}
