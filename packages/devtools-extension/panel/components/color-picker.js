/**
 * Inline color picker component: color swatch (input[type=color]) + hex text input.
 *
 * Usage:
 *   const picker = createColorPicker(currentValue, onChange);
 *   container.appendChild(picker.el);
 *   picker.setValue('#ff0000');
 */

/**
 * @param {string} value - Initial color value (hex, rgb, etc.)
 * @param {(value: string) => void} onChange - Callback when value changes
 * @returns {{ el: HTMLElement, setValue: (v: string) => void }}
 */
export function createColorPicker(value, onChange) {
  const wrap = document.createElement('span');
  wrap.className = 'prop-value';

  // Color swatch input
  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = normalizeToHex(value);
  colorInput.title = 'Pick color';

  // Text input
  const textInput = document.createElement('input');
  textInput.type = 'text';
  textInput.value = value;
  textInput.spellcheck = false;

  colorInput.addEventListener('input', () => {
    textInput.value = colorInput.value;
    onChange(colorInput.value);
  });

  textInput.addEventListener('change', () => {
    const v = textInput.value.trim();
    const hex = normalizeToHex(v);
    colorInput.value = hex;
    onChange(v);
  });

  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      textInput.blur();
    }
  });

  wrap.appendChild(colorInput);
  wrap.appendChild(textInput);

  return {
    el: wrap,
    setValue(v) {
      textInput.value = v;
      colorInput.value = normalizeToHex(v);
    },
  };
}

/**
 * Best-effort conversion to #rrggbb for the color input.
 * Falls back to #000000 if unparseable.
 */
function normalizeToHex(value) {
  if (!value) return '#000000';
  const v = value.trim();

  // Already hex
  if (/^#[0-9a-f]{6}$/i.test(v)) return v;
  if (/^#[0-9a-f]{3}$/i.test(v)) {
    const r = v[1], g = v[2], b = v[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }

  // Try parsing rgb/rgba
  const rgbMatch = v.match(/rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch;
    return '#' + [r, g, b].map((c) => Math.round(Number(c)).toString(16).padStart(2, '0')).join('');
  }

  return '#000000';
}
