export interface InlineEditorRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface InlineEditorAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface InlineEditorViewport {
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

export function getRectRelativeToParent(
  targetRect: InlineEditorRect,
  parentRect: InlineEditorRect,
  parentScrollLeft = 0,
  parentScrollTop = 0
): InlineEditorRect {
  return {
    left: targetRect.left - parentRect.left + parentScrollLeft,
    top: targetRect.top - parentRect.top + parentScrollTop,
    width: targetRect.width,
    height: targetRect.height,
  };
}

export function getPopoverPosition(
  anchor: InlineEditorAnchor,
  popoverSize: { width: number; height: number },
  viewport: InlineEditorViewport,
  placeAbove: boolean,
  gap = 8,
  padding = 8
): { left: number; top: number } {
  const centeredLeft = anchor.x + anchor.width / 2 - popoverSize.width / 2;
  const left = clamp(centeredLeft, padding, viewport.width - popoverSize.width - padding);

  const preferredTop = placeAbove
    ? anchor.y - popoverSize.height - gap
    : anchor.y + anchor.height + gap;
  const top = clamp(preferredTop, padding, viewport.height - popoverSize.height - padding);

  return { left, top };
}
