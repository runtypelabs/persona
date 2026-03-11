/** Control factory functions for creating form elements */

import type { FieldDef, ControlResult, OnChangeCallback } from './types';
import type { ColorShade } from '@runtypelabs/persona';
import { DEFAULT_PALETTE } from '@runtypelabs/persona';
import {
  parseCssValue,
  convertToPx,
  convertFromPx,
  formatCssValue,
  normalizeColorValue,
  isValidHex,
  generateColorScale,
  SHADE_KEYS,
  COLOR_FAMILIES,
  paletteColorPath,
  tokenRefDisplayName,
} from './color-utils';
import * as state from './state';
import { registerSearchEntry } from './search';

// ─── Helpers ───────────────────────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
  children?: (HTMLElement | string)[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'className') element.className = v;
      else element.setAttribute(k, v);
    }
  }
  if (children) {
    for (const child of children) {
      if (typeof child === 'string') {
        element.appendChild(document.createTextNode(child));
      } else {
        element.appendChild(child);
      }
    }
  }
  return element;
}

// ─── Color Control ─────────────────────────────────────────────────

export function createColorControl(
  field: FieldDef,
  onChange: OnChangeCallback
): ControlResult {
  const wrapper = el('div', { className: 'control-row' });

  const label = el('label', { className: 'control-label', for: field.id }, [field.label]);
  const inputGroup = el('div', { className: 'color-input-wrapper' });

  const colorPicker = el('input', {
    type: 'color',
    id: `${field.id}-picker`,
    className: 'color-picker',
  }) as HTMLInputElement;

  const textInput = el('input', {
    type: 'text',
    id: field.id,
    className: 'color-text-input',
    placeholder: '#000000',
  }) as HTMLInputElement;

  inputGroup.appendChild(colorPicker);
  inputGroup.appendChild(textInput);
  wrapper.appendChild(label);
  if (field.description) {
    wrapper.appendChild(el('span', { className: 'control-description' }, [field.description]));
  }
  wrapper.appendChild(inputGroup);

  // Initialize
  const currentValue = state.get(field.path) ?? field.defaultValue ?? '#000000';
  const normalized = normalizeColorValue(currentValue);
  textInput.value = normalized;
  colorPicker.value = isValidHex(normalized) ? normalized : '#000000';

  let isUpdating = false;

  const handleColorPicker = () => {
    if (isUpdating) return;
    isUpdating = true;
    textInput.value = colorPicker.value;
    onChange(field.path, colorPicker.value);
    isUpdating = false;
  };

  const handleTextInput = () => {
    if (isUpdating) return;
    isUpdating = true;
    const value = textInput.value.trim();
    if (value === 'transparent') {
      colorPicker.value = '#000000';
      onChange(field.path, 'transparent');
    } else if (isValidHex(value)) {
      colorPicker.value = value;
      onChange(field.path, value);
    } else if (value === '') {
      onChange(field.path, field.defaultValue ?? '');
    } else {
      onChange(field.path, value);
    }
    isUpdating = false;
  };

  colorPicker.addEventListener('input', handleColorPicker);
  textInput.addEventListener('input', handleTextInput);

  const result: ControlResult = {
    element: wrapper,
    fieldDef: field,
    getValue: () => textInput.value,
    setValue: (value: any) => {
      const normalized = normalizeColorValue(String(value));
      textInput.value = normalized;
      colorPicker.value = isValidHex(normalized) ? normalized : '#000000';
    },
    destroy: () => {
      colorPicker.removeEventListener('input', handleColorPicker);
      textInput.removeEventListener('input', handleTextInput);
    },
  };

  registerSearchEntry(field, result);
  return result;
}

// ─── Slider Control ────────────────────────────────────────────────

export function createSliderControl(
  field: FieldDef,
  onChange: OnChangeCallback
): ControlResult {
  const opts = field.slider!;
  const wrapper = el('div', { className: 'control-row' });

  const label = el('label', { className: 'control-label', for: field.id }, [field.label]);
  const inputGroup = el('div', { className: 'slider-input-wrapper' });

  const slider = el('input', {
    type: 'range',
    id: `${field.id}-slider`,
    className: 'slider-range',
    min: String(opts.min),
    max: String(opts.max),
    step: String(opts.step),
  }) as HTMLInputElement;

  const textInput = el('input', {
    type: 'text',
    id: field.id,
    className: 'slider-text-input',
  }) as HTMLInputElement;

  inputGroup.appendChild(slider);
  inputGroup.appendChild(textInput);
  wrapper.appendChild(label);
  if (field.description) {
    wrapper.appendChild(el('span', { className: 'control-description' }, [field.description]));
  }
  wrapper.appendChild(inputGroup);

  // Initialize
  const unit = opts.unit ?? 'px';
  let preferredUnit: 'px' | 'rem' = unit === 'none' ? 'px' : (unit as 'px' | 'rem');

  const initialValue = String(state.get(field.path) ?? field.defaultValue ?? '0');

  if (unit === 'none') {
    // Raw number (e.g., font weight)
    const numVal = parseFloat(initialValue) || 0;
    slider.value = String(numVal);
    textInput.value = String(numVal);
  } else {
    const parsed = parseCssValue(initialValue);
    preferredUnit = parsed.unit;
    const pxValue = convertToPx(parsed.value, parsed.unit);
    slider.value = String(pxValue);
    textInput.value = initialValue;

    if (opts.isRadiusFull && initialValue === '9999px') {
      slider.value = String(opts.max);
    }
  }

  let isUpdating = false;

  const handleSlider = () => {
    if (isUpdating) return;
    isUpdating = true;
    const sliderValue = parseFloat(slider.value);

    if (unit === 'none') {
      textInput.value = String(sliderValue);
      onChange(field.path, String(sliderValue));
    } else {
      let cssValue: string;
      if (opts.isRadiusFull && sliderValue >= opts.max) {
        cssValue = '9999px';
        preferredUnit = 'px';
      } else {
        const converted = convertFromPx(sliderValue, preferredUnit);
        cssValue = formatCssValue(converted, preferredUnit);
      }
      textInput.value = cssValue;
      onChange(field.path, cssValue);
    }
    isUpdating = false;
  };

  const handleText = () => {
    if (isUpdating) return;
    const value = textInput.value.trim();
    if (!value) return;

    if (unit === 'none') {
      const numVal = parseFloat(value);
      if (!isNaN(numVal) && numVal >= opts.min && numVal <= opts.max) {
        slider.value = String(numVal);
        onChange(field.path, String(numVal));
      }
    } else {
      const parsed = parseCssValue(value);
      preferredUnit = parsed.unit;
      const pxValue = convertToPx(parsed.value, parsed.unit);
      const clamped = Math.max(opts.min, Math.min(opts.max, pxValue));

      if (opts.isRadiusFull && value === '9999px') {
        slider.value = String(opts.max);
      } else {
        slider.value = String(clamped);
      }

      isUpdating = true;
      onChange(field.path, value);
      isUpdating = false;
    }
  };

  slider.addEventListener('input', handleSlider);
  textInput.addEventListener('input', handleText);

  const result: ControlResult = {
    element: wrapper,
    fieldDef: field,
    getValue: () => textInput.value,
    setValue: (value: any) => {
      const strVal = String(value);
      textInput.value = strVal;
      if (unit === 'none') {
        slider.value = strVal;
      } else {
        const parsed = parseCssValue(strVal);
        const pxValue = convertToPx(parsed.value, parsed.unit);
        if (opts.isRadiusFull && strVal === '9999px') {
          slider.value = String(opts.max);
        } else {
          slider.value = String(pxValue);
        }
      }
    },
    destroy: () => {
      slider.removeEventListener('input', handleSlider);
      textInput.removeEventListener('input', handleText);
    },
  };

  registerSearchEntry(field, result);
  return result;
}

// ─── Toggle Control ────────────────────────────────────────────────

export function createToggleControl(
  field: FieldDef,
  onChange: OnChangeCallback
): ControlResult {
  const wrapper = el('div', { className: 'control-row control-row-toggle' });

  const label = el('label', { className: 'control-label', for: field.id }, [field.label]);
  const toggle = el('label', { className: 'toggle-switch' });

  const checkbox = el('input', {
    type: 'checkbox',
    id: field.id,
  }) as HTMLInputElement;

  const slider = el('span', { className: 'toggle-slider' });
  toggle.appendChild(checkbox);
  toggle.appendChild(slider);

  wrapper.appendChild(label);
  if (field.description) {
    wrapper.appendChild(el('span', { className: 'control-description' }, [field.description]));
  }
  wrapper.appendChild(toggle);

  // Initialize
  checkbox.checked = Boolean(state.get(field.path) ?? field.defaultValue ?? false);

  const handleChange = () => {
    onChange(field.path, checkbox.checked);
  };

  checkbox.addEventListener('change', handleChange);

  const result: ControlResult = {
    element: wrapper,
    fieldDef: field,
    getValue: () => checkbox.checked,
    setValue: (value: any) => {
      checkbox.checked = Boolean(value);
    },
    destroy: () => {
      checkbox.removeEventListener('change', handleChange);
    },
  };

  registerSearchEntry(field, result);
  return result;
}

// ─── Select Control ────────────────────────────────────────────────

export function createSelectControl(
  field: FieldDef,
  onChange: OnChangeCallback
): ControlResult {
  const wrapper = el('div', { className: 'control-row' });

  const label = el('label', { className: 'control-label', for: field.id }, [field.label]);
  const select = el('select', { id: field.id, className: 'control-select' }) as HTMLSelectElement;

  for (const opt of field.options ?? []) {
    const option = el('option', { value: opt.value }, [opt.label]);
    select.appendChild(option);
  }

  wrapper.appendChild(label);
  if (field.description) {
    wrapper.appendChild(el('span', { className: 'control-description' }, [field.description]));
  }
  wrapper.appendChild(select);

  // Initialize
  select.value = String(state.get(field.path) ?? field.defaultValue ?? '');

  const handleChange = () => {
    onChange(field.path, select.value);
  };

  select.addEventListener('change', handleChange);

  const result: ControlResult = {
    element: wrapper,
    fieldDef: field,
    getValue: () => select.value,
    setValue: (value: any) => {
      select.value = String(value);
    },
    destroy: () => {
      select.removeEventListener('change', handleChange);
    },
  };

  registerSearchEntry(field, result);
  return result;
}

// ─── Text Control ──────────────────────────────────────────────────

export function createTextControl(
  field: FieldDef,
  onChange: OnChangeCallback
): ControlResult {
  const wrapper = el('div', { className: 'control-row' });

  const label = el('label', { className: 'control-label', for: field.id }, [field.label]);
  const input = el('input', {
    type: 'text',
    id: field.id,
    className: 'control-text-input',
    placeholder: field.description ?? '',
  }) as HTMLInputElement;

  wrapper.appendChild(label);
  if (field.description) {
    wrapper.appendChild(el('span', { className: 'control-description' }, [field.description]));
  }
  wrapper.appendChild(input);

  // Initialize
  input.value = String(state.get(field.path) ?? field.defaultValue ?? '');

  const handleInput = () => {
    onChange(field.path, input.value);
  };

  input.addEventListener('input', handleInput);

  const result: ControlResult = {
    element: wrapper,
    fieldDef: field,
    getValue: () => input.value,
    setValue: (value: any) => {
      input.value = String(value ?? '');
    },
    destroy: () => {
      input.removeEventListener('input', handleInput);
    },
  };

  registerSearchEntry(field, result);
  return result;
}

// ─── Color Scale Control ──────────────────────────────────────────

export function createColorScaleControl(
  field: FieldDef,
  onChange: OnChangeCallback
): ControlResult {
  const family = field.colorScale!.colorFamily;
  const wrapper = el('div', { className: 'control-row color-scale-control' });

  const labelRow = el('div', { className: 'color-scale-header' });
  const label = el('label', { className: 'control-label' }, [field.label]);
  const expandBtn = el('button', { className: 'color-scale-expand-btn', type: 'button' }, ['Edit shades']);
  labelRow.appendChild(label);
  labelRow.appendChild(expandBtn);
  wrapper.appendChild(labelRow);

  // Swatch row showing all shades
  const swatchRow = el('div', { className: 'color-scale-swatches' });
  wrapper.appendChild(swatchRow);

  // Expanded detail panel (hidden by default)
  const detailPanel = el('div', { className: 'color-scale-detail hidden' });
  wrapper.appendChild(detailPanel);

  // Get current scale
  const getScale = (): ColorShade => {
    const scale: ColorShade = {};
    for (const shade of SHADE_KEYS) {
      scale[shade] = state.get(`theme.palette.colors.${family}.${shade}`);
    }
    return scale;
  };

  // Render swatches
  const renderSwatches = () => {
    swatchRow.innerHTML = '';
    const scale = getScale();
    for (const shade of SHADE_KEYS) {
      const color = scale[shade] ?? '#cccccc';
      const swatch = el('div', {
        className: `color-swatch${shade === '500' ? ' color-swatch-primary' : ''}`,
        title: `${shade}: ${color}`,
      });
      swatch.style.backgroundColor = color;
      swatchRow.appendChild(swatch);
    }
  };

  // Render detail editors
  const renderDetails = () => {
    detailPanel.innerHTML = '';
    const scale = getScale();

    // Base color (shade 500) with auto-generate button
    const baseRow = el('div', { className: 'color-scale-base-row' });
    const baseLabel = el('label', { className: 'control-label' }, ['Base (500)']);
    const baseColor = el('input', { type: 'color', className: 'color-picker' }) as HTMLInputElement;
    baseColor.value = isValidHex(scale['500'] ?? '') ? (scale['500'] as string) : '#000000';
    const autoBtn = el('button', {
      className: 'btn btn-sm',
      type: 'button',
    }, ['Auto-generate scale']);

    baseRow.appendChild(baseLabel);
    baseRow.appendChild(baseColor);
    baseRow.appendChild(autoBtn);
    detailPanel.appendChild(baseRow);

    baseColor.addEventListener('input', () => {
      onChange(`theme.palette.colors.${family}.500`, baseColor.value);
      renderSwatches();
    });

    autoBtn.addEventListener('click', () => {
      const newScale = generateColorScale(baseColor.value);
      for (const shade of SHADE_KEYS) {
        if (newScale[shade]) {
          onChange(`theme.palette.colors.${family}.${shade}`, newScale[shade]);
        }
      }
      renderSwatches();
      renderDetails(); // Refresh detail inputs
    });

    // Individual shade editors
    for (const shade of SHADE_KEYS) {
      if (shade === '500') continue; // Already handled above
      const shadeRow = el('div', { className: 'color-scale-shade-row' });
      const shadeLabel = el('label', { className: 'control-label-sm' }, [shade]);
      const shadePicker = el('input', { type: 'color', className: 'color-picker-sm' }) as HTMLInputElement;
      const shadeText = el('input', {
        type: 'text',
        className: 'color-text-input-sm',
        placeholder: '#000000',
      }) as HTMLInputElement;

      const currentVal = scale[shade] ?? '#000000';
      shadePicker.value = isValidHex(currentVal) ? currentVal : '#000000';
      shadeText.value = currentVal;

      shadePicker.addEventListener('input', () => {
        shadeText.value = shadePicker.value;
        onChange(`theme.palette.colors.${family}.${shade}`, shadePicker.value);
        renderSwatches();
      });

      shadeText.addEventListener('input', () => {
        const val = shadeText.value.trim();
        if (isValidHex(val)) {
          shadePicker.value = val;
          onChange(`theme.palette.colors.${family}.${shade}`, val);
          renderSwatches();
        }
      });

      shadeRow.appendChild(shadeLabel);
      shadeRow.appendChild(shadePicker);
      shadeRow.appendChild(shadeText);
      detailPanel.appendChild(shadeRow);
    }
  };

  // Toggle expanded state
  let expanded = false;
  expandBtn.addEventListener('click', () => {
    expanded = !expanded;
    detailPanel.classList.toggle('hidden', !expanded);
    expandBtn.textContent = expanded ? 'Collapse' : 'Edit shades';
    if (expanded) renderDetails();
  });

  renderSwatches();

  const result: ControlResult = {
    element: wrapper,
    fieldDef: field,
    getValue: () => getScale(),
    setValue: () => {
      renderSwatches();
      if (expanded) renderDetails();
    },
    destroy: () => {},
  };

  registerSearchEntry(field, result);
  return result;
}

// ─── Token Reference Control ──────────────────────────────────────

export function createTokenRefControl(
  field: FieldDef,
  onChange: OnChangeCallback
): ControlResult {
  const opts = field.tokenRef!;
  const wrapper = el('div', { className: 'control-row' });

  const label = el('label', { className: 'control-label', for: field.id }, [field.label]);
  const selectWrapper = el('div', { className: 'token-ref-wrapper' });

  const select = el('select', { id: field.id, className: 'token-ref-select' }) as HTMLSelectElement;
  const swatch = el('div', { className: 'token-ref-swatch' });

  selectWrapper.appendChild(swatch);
  selectWrapper.appendChild(select);

  wrapper.appendChild(label);
  if (field.description) {
    wrapper.appendChild(el('span', { className: 'control-description' }, [field.description]));
  }
  wrapper.appendChild(selectWrapper);

  // Build options grouped by color family
  const families = opts.families ?? [...COLOR_FAMILIES];

  for (const family of families) {
    const optgroup = el('optgroup', { label: family.charAt(0).toUpperCase() + family.slice(1) });

    for (const shade of SHADE_KEYS) {
      const path = paletteColorPath(family, shade);
      const colorVal = state.get(`theme.${path}`) ?? (DEFAULT_PALETTE as any).colors?.[family]?.[shade] ?? '';
      const displayName = tokenRefDisplayName(path);
      const option = el('option', { value: path }, [`${displayName} (${colorVal})`]);
      optgroup.appendChild(option);
    }

    select.appendChild(optgroup);
  }

  // Initialize
  const currentValue = state.get(field.path) ?? field.defaultValue ?? '';
  select.value = currentValue;

  // Update swatch color
  const updateSwatch = () => {
    const refPath = select.value;
    const resolved = state.get(`theme.${refPath}`);
    swatch.style.backgroundColor = resolved ?? '#cccccc';
  };

  updateSwatch();

  const handleChange = () => {
    onChange(field.path, select.value);
    updateSwatch();
  };

  select.addEventListener('change', handleChange);

  const result: ControlResult = {
    element: wrapper,
    fieldDef: field,
    getValue: () => select.value,
    setValue: (value: any) => {
      select.value = String(value);
      updateSwatch();
    },
    destroy: () => {
      select.removeEventListener('change', handleChange);
    },
  };

  registerSearchEntry(field, result);
  return result;
}

// ─── Factory dispatcher ────────────────────────────────────────────

export function createControl(field: FieldDef, onChange: OnChangeCallback): ControlResult {
  switch (field.type) {
    case 'color':
      return createColorControl(field, onChange);
    case 'slider':
      return createSliderControl(field, onChange);
    case 'toggle':
      return createToggleControl(field, onChange);
    case 'select':
      return createSelectControl(field, onChange);
    case 'text':
      return createTextControl(field, onChange);
    case 'color-scale':
      return createColorScaleControl(field, onChange);
    case 'token-ref':
      return createTokenRefControl(field, onChange);
    default:
      throw new Error(`Unknown control type: ${field.type}`);
  }
}

// ─── Section renderer ──────────────────────────────────────────────

export function renderSection(
  section: { id: string; title: string; description?: string; fields: FieldDef[]; collapsed?: boolean },
  onChange: OnChangeCallback
): { element: HTMLElement; controls: ControlResult[] } {
  const accordion = el('div', {
    className: `accordion${section.collapsed !== false ? ' collapsed' : ''}`,
    'data-section-id': section.id,
  });

  const header = el('div', { className: 'accordion-header' });
  const title = el('h3', { className: 'accordion-title' }, [section.title]);
  const toggle = el('button', { className: 'accordion-toggle', type: 'button' }, ['▼']);

  header.appendChild(title);
  header.appendChild(toggle);
  accordion.appendChild(header);

  const content = el('div', { className: 'accordion-content' });

  if (section.description) {
    content.appendChild(el('p', { className: 'section-description' }, [section.description]));
  }

  const controls: ControlResult[] = [];

  for (const field of section.fields) {
    const control = createControl(field, onChange);
    controls.push(control);
    content.appendChild(control.element);
  }

  accordion.appendChild(content);

  // Toggle behavior
  const handleToggle = (e: Event) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON' && target.closest('.accordion-presets')) return;
    accordion.classList.toggle('collapsed');
    saveAccordionState(section.id, accordion.classList.contains('collapsed'));
  };

  header.addEventListener('click', handleToggle);

  // Restore collapsed state from localStorage
  const savedState = getAccordionState(section.id);
  if (savedState !== undefined) {
    accordion.classList.toggle('collapsed', savedState);
  }

  return { element: accordion, controls };
}

// ─── Accordion state ───────────────────────────────────────────────

const ACCORDION_STATE_KEY = 'persona-accordion-state';

function getAccordionState(id: string): boolean | undefined {
  try {
    const saved = localStorage.getItem(ACCORDION_STATE_KEY);
    if (saved) {
      const state = JSON.parse(saved);
      return state[id];
    }
  } catch {
    // Ignore
  }
  return undefined;
}

function saveAccordionState(id: string, collapsed: boolean): void {
  try {
    const saved = localStorage.getItem(ACCORDION_STATE_KEY);
    const state = saved ? JSON.parse(saved) : {};
    state[id] = collapsed;
    localStorage.setItem(ACCORDION_STATE_KEY, JSON.stringify(state));
  } catch {
    // Ignore
  }
}
