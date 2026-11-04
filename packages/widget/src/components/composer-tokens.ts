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
