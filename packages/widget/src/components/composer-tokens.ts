/**
 * Class hook for the shared composer control box. The stylesheet sizes it from
 * `--persona-composer-control-size` (theme `components.composer.controlSize`).
 */
export const COMPOSER_CONTROL_CLASS = "persona-composer-control";
/** Adds `--persona-composer-control-icon-size` sizing to the control's glyph. */
export const COMPOSER_CONTROL_GLYPH_CLASS = "persona-composer-control--glyph";
/**
 * Token default in CSS pixels. Only used to derive JS-computed glyph sizes when
 * a per-control size is unset; the box itself is owned by the stylesheet.
 */
export const COMPOSER_CONTROL_FALLBACK_PX = 40;
/** Icon-size token default in CSS pixels, for the same JS-derived cases. */
export const COMPOSER_CONTROL_ICON_FALLBACK_PX = 24;

/**
 * Forward theme vars onto a portaled menu panel, which lives outside the
 * themed mount. The panel is reused across opens, so an unset var must clear
 * any previously stamped value for the stylesheet fallback to paint again.
 */
export const forwardMenuTokens = (
  from: HTMLElement,
  to: HTMLElement,
  names: readonly string[]
): void => {
  const view = from.ownerDocument?.defaultView;
  if (!view) return;
  const computed = view.getComputedStyle(from);
  for (const name of names) {
    const value = computed.getPropertyValue(name).trim();
    if (value) to.style.setProperty(name, value);
    else to.style.removeProperty(name);
  }
};
