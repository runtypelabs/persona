/**
 * Inline editing zones — click elements in the preview iframe to edit them directly.
 *
 * Each "zone" maps a CSS selector inside an iframe to a state path and editor type
 * (color picker, slider, or inline text).  Overlays are injected into the iframe's
 * contentDocument; popovers render in the parent page.
 */

import * as state from './state';
import {
  generateColorScale,
  normalizeColorValue,
  isValidHex,
  resolveThemeColorPath,
  parseCssValue,
  convertToPx,
} from './color-utils';
import {
  getPopoverPosition,
  getRectRelativeToParent,
} from './inline-editor-geometry';

// ─── Types ──────────────────────────────────────────────────────

type ZoneEditor = 'color' | 'slider' | 'text' | 'compound';

/** Color field config used by single and compound popovers */
interface InlineColorField {
  statePath: string;
  isBrandColor?: boolean;
  colorApplyMode?: 'brand' | 'token-ref';
}

type CompoundPart =
  | ({ kind: 'color' } & InlineColorField & { label: string })
  | {
      kind: 'slider';
      label: string;
      statePath: string;
      slider?: { min: number; max: number; step: number };
    };

interface ZoneDef {
  id: string;
  /** CSS selector run inside the iframe contentDocument */
  selector: string;
  editor: ZoneEditor;
  /** Dot-path used with state.get / state.set (omit for compound-only zones) */
  statePath?: string;
  /** For sliders: min, max, step */
  slider?: { min: number; max: number; step: number };
  /** If true, changing this color regenerates the full palette scale */
  isBrandColor?: boolean;
  /**
   * When "token-ref", the path stores semantic/palette refs or a hex; picker shows resolved color
   * and writes a literal hex (same as resolving token chains in the widget).
   */
  colorApplyMode?: 'brand' | 'token-ref';
  /** "corner-br" = small hit target so radius can share the bubble with a full bleed color overlay */
  hitTarget?: 'full' | 'corner-br';
  /** When editor is "compound", ordered sections (colors + sliders) in one popover */
  compound?: CompoundPart[];
  /** Human-readable label shown in popover */
  label: string;
}

interface ActiveZone {
  id: string;
  cleanup: () => void;
}

interface PopoverAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ─── Zone Definitions ───────────────────────────────────────────

const ZONE_DEFS: ZoneDef[] = [
  {
    id: 'primaryColor',
    selector: '.persona-widget-header',
    editor: 'color',
    statePath: 'theme.palette.colors.primary.500',
    isBrandColor: true,
    label: 'Primary Color',
  },
  {
    id: 'userMessageCompound',
    // User bubble fill uses primary scale → semantic primary → components.message.user.background
    selector: '.persona-justify-end .vanilla-message-bubble',
    editor: 'compound',
    label: 'User message',
    compound: [
      {
        kind: 'color',
        label: 'Bubble (primary)',
        statePath: 'theme.palette.colors.primary.500',
        isBrandColor: true,
      },
      {
        kind: 'color',
        label: 'Text',
        statePath: 'theme.components.message.user.text',
        colorApplyMode: 'token-ref',
      },
      {
        kind: 'slider',
        label: 'Corner radius',
        statePath: 'theme.components.message.user.borderRadius',
        slider: { min: 0, max: 32, step: 1 },
      },
    ],
  },
  {
    id: 'assistantMessageCompound',
    selector:
      '.persona-widget-body .persona-flex:not(.persona-justify-end) .vanilla-message-bubble',
    editor: 'compound',
    label: 'Assistant message',
    compound: [
      {
        kind: 'color',
        label: 'Bubble',
        statePath: 'theme.components.message.assistant.background',
        colorApplyMode: 'token-ref',
      },
      {
        kind: 'color',
        label: 'Text',
        statePath: 'theme.components.message.assistant.text',
        colorApplyMode: 'token-ref',
      },
      {
        kind: 'slider',
        label: 'Corner radius',
        statePath: 'theme.components.message.assistant.borderRadius',
        slider: { min: 0, max: 32, step: 1 },
      },
    ],
  },
  {
    id: 'inputRadius',
    selector: '.persona-widget-composer form, .persona-widget-composer textarea',
    editor: 'slider',
    statePath: 'theme.components.input.borderRadius',
    slider: { min: 0, max: 40, step: 1 },
    label: 'Input Radius',
  },
  {
    id: 'headerTitle',
    selector: '.persona-widget-header .persona-flex-col > span:first-child',
    editor: 'text',
    statePath: 'launcher.title',
    label: 'Header Title',
  },
  {
    id: 'headerSubtitle',
    selector: '.persona-widget-header .persona-flex-col > span:nth-child(2)',
    editor: 'text',
    statePath: 'launcher.subtitle',
    label: 'Header Subtitle',
  },
  {
    id: 'welcomeTitle',
    selector: '.persona-rounded-2xl.persona-bg-persona-surface h2, [class*="persona-rounded-2xl"] h2',
    editor: 'text',
    statePath: 'copy.welcomeTitle',
    label: 'Welcome Title',
  },
  {
    id: 'welcomeSubtitle',
    selector: '.persona-rounded-2xl.persona-bg-persona-surface p, [class*="persona-rounded-2xl"] p',
    editor: 'text',
    statePath: 'copy.welcomeSubtitle',
    label: 'Welcome Subtitle',
  },
  {
    id: 'chipRadius',
    // Suggestion chips live in .persona-widget-footer > suggestions row, not inside .persona-widget-composer (that matches send/attach).
    selector: '.persona-widget-footer .persona-flex-wrap .persona-rounded-button',
    editor: 'slider',
    statePath: 'theme.components.button.secondary.borderRadius',
    slider: { min: 0, max: 24, step: 1 },
    label: 'Suggestion chip radius',
  },
];

// ─── Module State ───────────────────────────────────────────────

let activeZone: ActiveZone | null = null;
let iframeRefs: HTMLIFrameElement[] = [];
let injectedStyles: HTMLStyleElement[] = [];
let overlayElements: HTMLElement[] = [];
let reflowCleanups: Array<() => void> = [];
let currentScale = 1;
let getScaleFn: (() => number) | null = null;

/** Preset color swatches used in the color popover */
const COLOR_PRESETS = [
  '#2563eb', '#7c3aed', '#06b6d4', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#8b5cf6', '#0ea5e9', '#14b8a6',
  '#f97316', '#64748b', '#1e293b', '#0f172a', '#ffffff',
];

// ─── Iframe Style Injection ─────────────────────────────────────

const ZONE_STYLE = `
  .inline-zone-overlay {
    position: absolute;
    pointer-events: auto;
    cursor: pointer;
    touch-action: manipulation;
    z-index: 99998;
    border: 2px dashed transparent;
    border-radius: 4px;
    transition: border-color 0.15s ease, background 0.15s ease;
  }
  .inline-zone-overlay:hover,
  .inline-zone-overlay:focus-visible {
    border-color: #4F6EF7;
    background: rgba(79, 110, 247, 0.06);
  }
  .inline-zone-overlay.active {
    border-color: #4F6EF7;
    background: rgba(79, 110, 247, 0.10);
  }
  .inline-zone-overlay--corner {
    border-radius: 10px !important;
  }
`;

function injectStyleIntoIframe(doc: Document): HTMLStyleElement {
  const style = doc.createElement('style');
  style.textContent = ZONE_STYLE;
  doc.head.appendChild(style);
  return style;
}

// ─── Overlay Management ─────────────────────────────────────────

function createOverlay(
  doc: Document,
  target: HTMLElement,
  zone: ZoneDef,
  iframe: HTMLIFrameElement
): HTMLElement {
  const overlay = doc.createElement('div');
  overlay.className = 'inline-zone-overlay';
  overlay.dataset.zoneId = zone.id;
  overlay.tabIndex = 0;
  overlay.setAttribute('role', 'button');
  overlay.setAttribute('aria-label', zone.label);
  if (zone.hitTarget === 'corner-br') {
    overlay.classList.add('inline-zone-overlay--corner');
  }

  overlay.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    handleZoneClick(zone, target, iframe, overlay);
  });

  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleZoneClick(zone, target, iframe, overlay);
    }
  });

  // Append to the same offset parent or body, then position (needs parent for coordinates)
  const parent = target.offsetParent as HTMLElement ?? doc.body;
  parent.style.position = parent.style.position || 'relative';
  parent.appendChild(overlay);
  positionOverlay(overlay, target, zone);

  return overlay;
}

function positionOverlay(overlay: HTMLElement, target: HTMLElement, zone: ZoneDef): void {
  const parent = overlay.parentElement;
  if (!parent) return;

  const rect = target.getBoundingClientRect();
  const parentRect = parent.getBoundingClientRect();
  const relativeRect = getRectRelativeToParent(
    rect,
    parentRect,
    parent.scrollLeft,
    parent.scrollTop
  );
  overlay.style.position = 'absolute';

  if (zone.hitTarget === 'corner-br') {
    const corner = 40;
    overlay.style.left = `${relativeRect.left + relativeRect.width - corner}px`;
    overlay.style.top = `${relativeRect.top + relativeRect.height - corner}px`;
    overlay.style.width = `${corner}px`;
    overlay.style.height = `${corner}px`;
  } else {
    overlay.style.left = `${relativeRect.left}px`;
    overlay.style.top = `${relativeRect.top}px`;
    overlay.style.width = `${relativeRect.width}px`;
    overlay.style.height = `${relativeRect.height}px`;
  }
}

// ─── Coordinate Translation ─────────────────────────────────────

function iframeToParent(
  iframe: HTMLIFrameElement,
  targetRect: DOMRect,
  scale: number
): PopoverAnchor {
  const iframeRect = iframe.getBoundingClientRect();
  return {
    x: iframeRect.left + targetRect.left * scale,
    y: iframeRect.top + targetRect.top * scale,
    width: targetRect.width * scale,
    height: targetRect.height * scale,
  };
}

// ─── Popover System ─────────────────────────────────────────────

function getPopover(): HTMLElement {
  let popover = document.getElementById('inline-edit-popover');
  if (!popover) {
    popover = document.createElement('div');
    popover.id = 'inline-edit-popover';
    popover.className = 'inline-edit-popover hidden';
    document.body.appendChild(popover);
  }
  return popover;
}

function showPopover(
  anchor: PopoverAnchor,
  title: string,
  body: HTMLElement,
  placeAbove: boolean,
  opts?: { variant?: 'default' | 'compound' }
): void {
  const popover = getPopover();

  const shell = document.createElement('div');
  shell.className = 'inline-popover-shell';

  const header = document.createElement('div');
  header.className = 'inline-popover-header';

  const titleEl = document.createElement('div');
  titleEl.className = 'inline-popover-header-title';
  titleEl.textContent = title;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'inline-popover-close';
  closeBtn.setAttribute('aria-label', 'Close editor');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    dismissActiveZone();
  });

  header.append(titleEl, closeBtn);

  const bodyWrap = document.createElement('div');
  bodyWrap.className =
    opts?.variant === 'compound'
      ? 'inline-popover-body inline-popover-body--scroll'
      : 'inline-popover-body';
  bodyWrap.appendChild(body);

  shell.append(header, bodyWrap);

  popover.innerHTML = '';
  popover.appendChild(shell);
  popover.classList.remove('hidden');
  positionPopoverElement(popover, anchor, placeAbove, opts);
}

function computePopoverPlaceAbove(iframe: HTMLIFrameElement, target: HTMLElement): boolean {
  const doc = iframe.contentDocument;
  if (!doc) return false;
  const ih = doc.documentElement?.clientHeight ?? doc.defaultView?.innerHeight ?? 800;
  const rect = target.getBoundingClientRect();
  const centerY = rect.top + rect.height / 2;
  return centerY > ih / 2;
}

function hidePopover(): void {
  const popover = getPopover();
  popover.classList.add('hidden');
  popover.innerHTML = '';
}

function positionPopoverElement(
  popover: HTMLElement,
  anchor: PopoverAnchor,
  placeAbove: boolean,
  opts?: { variant?: 'default' | 'compound' }
): void {
  const measured = popover.getBoundingClientRect();
  const fallbackHeight = opts?.variant === 'compound' ? 300 : 268;
  const fallbackWidth = opts?.variant === 'compound' ? 280 : 260;
  const position = getPopoverPosition(
    anchor,
    {
      width: measured.width || fallbackWidth,
      height: measured.height || fallbackHeight,
    },
    {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    placeAbove
  );

  popover.style.top = `${position.top}px`;
  popover.style.left = `${position.left}px`;
}

// ─── Zone Click Handlers ────────────────────────────────────────

function handleZoneClick(
  zone: ZoneDef,
  target: HTMLElement,
  iframe: HTMLIFrameElement,
  overlay: HTMLElement
): void {
  // Dismiss previous
  dismissActiveZone();

  const scale = getScaleFn?.() ?? currentScale;
  const targetRect = target.getBoundingClientRect();
  const pos = iframeToParent(iframe, targetRect, scale);
  const placeAbove = computePopoverPlaceAbove(iframe, target);

  overlay.classList.add('active');

  const cleanup = () => {
    overlay.classList.remove('active');
  };

  activeZone = { id: zone.id, cleanup };

  switch (zone.editor) {
    case 'color':
      showColorEditor(zone, pos, placeAbove);
      break;
    case 'slider':
      showSliderEditor(zone, pos, placeAbove);
      break;
    case 'text':
      showTextEditor(zone, target, pos, placeAbove);
      break;
    case 'compound':
      if (zone.compound?.length) {
        showCompoundEditor(zone, pos, placeAbove);
      }
      break;
  }
}

// ─── Color Editor ───────────────────────────────────────────────

function resolveInlineColorDisplay(field: InlineColorField): string {
  if (field.colorApplyMode === 'token-ref') {
    return resolveThemeColorPath((p) => state.get(p), field.statePath);
  }
  return String(state.get(field.statePath) ?? '#000000');
}

function appendColorFieldToContainer(
  container: HTMLElement,
  sectionLabel: string | undefined,
  field: InlineColorField
): void {
  const gridHost =
    sectionLabel !== undefined
      ? (() => {
          const section = document.createElement('div');
          section.className = 'inline-compound-section';
          const lbl = document.createElement('div');
          lbl.className = 'inline-popover-label';
          lbl.textContent = sectionLabel;
          section.appendChild(lbl);
          container.appendChild(section);
          return section;
        })()
      : container;

  const grid = document.createElement('div');
  grid.className = 'inline-color-grid';
  const currentValue = resolveInlineColorDisplay(field);

  const hexInput = document.createElement('input');
  hexInput.type = 'text';
  hexInput.className = 'inline-color-hex';
  hexInput.value = currentValue;
  hexInput.placeholder = '#000000';

  const nativePicker = document.createElement('input');
  nativePicker.type = 'color';
  nativePicker.className = 'inline-color-native';
  nativePicker.value = isValidHex(normalizeColorValue(currentValue))
    ? normalizeColorValue(currentValue)
    : '#000000';

  const syncSwatchSelection = (hex: string) => {
    const norm = normalizeColorValue(hex).toLowerCase();
    grid.querySelectorAll('.inline-color-swatch').forEach((el) => {
      el.classList.toggle(
        'selected',
        (el as HTMLElement).dataset.preset?.toLowerCase() === norm
      );
    });
  };

  for (const preset of COLOR_PRESETS) {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.dataset.preset = normalizeColorValue(preset);
    swatch.className = 'inline-color-swatch';
    if (preset.toLowerCase() === normalizeColorValue(currentValue).toLowerCase()) {
      swatch.classList.add('selected');
    }
    swatch.style.backgroundColor = preset;
    if (preset === '#ffffff') {
      swatch.style.border = '1px solid #e5e7eb';
    }
    swatch.addEventListener('click', () => {
      applyColorValueForField(field, preset);
      syncSwatchSelection(preset);
      hexInput.value = preset;
      nativePicker.value = preset;
    });
    grid.appendChild(swatch);
  }
  gridHost.appendChild(grid);

  const customRow = document.createElement('div');
  customRow.className = 'inline-color-custom-row';
  nativePicker.addEventListener('input', () => {
    hexInput.value = nativePicker.value;
    applyColorValueForField(field, nativePicker.value);
    syncSwatchSelection(nativePicker.value);
  });

  hexInput.addEventListener('input', () => {
    const v = hexInput.value.trim();
    if (isValidHex(v)) {
      nativePicker.value = v;
      applyColorValueForField(field, v);
      syncSwatchSelection(v);
    }
  });

  customRow.appendChild(nativePicker);
  customRow.appendChild(hexInput);
  gridHost.appendChild(customRow);
}

function showColorEditor(
  zone: ZoneDef,
  pos: PopoverAnchor,
  placeAbove: boolean
): void {
  const container = document.createElement('div');
  container.className = 'inline-popover-content';
  const field: InlineColorField = {
    statePath: zone.statePath!,
    colorApplyMode: zone.colorApplyMode,
    isBrandColor: zone.isBrandColor,
  };
  appendColorFieldToContainer(container, undefined, field);

  showPopover(pos, zone.label, container, placeAbove);
}

function appendSliderFieldToContainer(
  container: HTMLElement,
  part: Extract<CompoundPart, { kind: 'slider' }>
): void {
  const opts = part.slider ?? { min: 0, max: 32, step: 1 };
  const numericValue = resolveRadiusSliderInitialPx(part.statePath);

  const row = document.createElement('div');
  row.className = 'inline-slider-row';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'inline-slider-input';
  slider.min = String(opts.min);
  slider.max = String(opts.max);
  slider.step = String(opts.step);
  slider.value = String(numericValue);

  const display = document.createElement('span');
  display.className = 'inline-slider-value';
  display.textContent = `${numericValue}px`;

  slider.addEventListener('input', () => {
    const val = parseFloat(slider.value);
    display.textContent = `${val}px`;
    state.set(part.statePath, `${val}px`);
  });

  row.appendChild(slider);
  row.appendChild(display);
  container.appendChild(row);
}

function showCompoundEditor(
  zone: ZoneDef,
  pos: PopoverAnchor,
  placeAbove: boolean
): void {
  const parts = zone.compound ?? [];
  if (!parts.length) return;

  const popover = getPopover();
  const shell = document.createElement('div');
  shell.className = 'inline-popover-shell';

  const total = parts.length;
  const multiStep = total > 1;

  const header = document.createElement('div');
  header.className = 'inline-popover-header inline-popover-header--compound';

  const titleEl = document.createElement('div');
  titleEl.className = 'inline-popover-header-title';
  titleEl.textContent = zone.label;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'inline-popover-close';
  closeBtn.setAttribute('aria-label', 'Close editor');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    dismissActiveZone();
  });

  header.append(titleEl, closeBtn);

  const bodyWrap = document.createElement('div');
  bodyWrap.className = 'inline-popover-body inline-popover-body--compound';

  const body = document.createElement('div');
  body.className = 'inline-popover-content inline-popover-content--compound-step';
  bodyWrap.appendChild(body);

  const footer = document.createElement('div');
  footer.className = multiStep
    ? 'inline-popover-compound-footer'
    : 'inline-popover-compound-footer inline-popover-compound-footer--single';

  const nav = document.createElement('div');
  nav.className = 'inline-popover-step-nav';
  nav.setAttribute('role', 'group');
  nav.setAttribute('aria-label', 'Field navigation');

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'inline-popover-step-btn';
  prevBtn.innerHTML = '&#8592;';
  prevBtn.setAttribute('aria-label', 'Previous field');

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'inline-popover-step-btn';
  nextBtn.innerHTML = '&#8594;';
  nextBtn.setAttribute('aria-label', 'Next field');

  nav.append(prevBtn, nextBtn);
  nav.hidden = !multiStep;

  const center = document.createElement('div');
  center.className = 'inline-popover-compound-footer-center';

  const fieldTitle = document.createElement('div');
  fieldTitle.className = 'inline-popover-compound-footer-title';

  const footerStepEl = document.createElement('div');
  footerStepEl.className = 'inline-popover-compound-footer-step';

  center.append(fieldTitle, footerStepEl);

  footer.append(nav, center);

  shell.append(header, bodyWrap, footer);

  let stepIndex = 0;

  const updateNavState = () => {
    if (!multiStep) return;
    prevBtn.disabled = stepIndex <= 0;
    nextBtn.disabled = stepIndex >= total - 1;
    prevBtn.classList.toggle('is-disabled', prevBtn.disabled);
    nextBtn.classList.toggle('is-disabled', nextBtn.disabled);
  };

  const renderStep = () => {
    const part = parts[stepIndex]!;
    fieldTitle.textContent = part.label.toUpperCase();
    if (multiStep) {
      footerStepEl.textContent = `${stepIndex + 1} / ${total}`;
      footerStepEl.hidden = false;
    } else {
      footerStepEl.textContent = '';
      footerStepEl.hidden = true;
    }

    body.replaceChildren();
    if (part.kind === 'color') {
      const { kind: _k, label: _lbl, ...field } = part;
      appendColorFieldToContainer(body, undefined, field);
    } else {
      appendSliderFieldToContainer(body, part);
    }
    updateNavState();
  };

  const goPrev = () => {
    if (stepIndex > 0) {
      stepIndex -= 1;
      renderStep();
    }
  };
  const goNext = () => {
    if (stepIndex < total - 1) {
      stepIndex += 1;
      renderStep();
    }
  };

  prevBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    goPrev();
  });
  nextBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    goNext();
  });

  popover.innerHTML = '';
  popover.appendChild(shell);
  popover.classList.remove('hidden');
  renderStep();
  positionPopoverElement(popover, pos, placeAbove, { variant: 'compound' });
}

function applyColorValueForField(field: InlineColorField, hex: string): void {
  if (field.colorApplyMode === 'token-ref') {
    const normalized = normalizeColorValue(hex);
    if (isValidHex(normalized)) {
      state.set(field.statePath, normalized);
      return;
    }
    if (normalized.startsWith('rgb')) {
      state.set(field.statePath, normalized);
      return;
    }
    return;
  }
  if (field.isBrandColor) {
    const normalized = normalizeColorValue(hex);
    if (!isValidHex(normalized)) return;

    const match = field.statePath.match(/theme\.palette\.colors\.(primary|secondary|accent)\.500$/);
    if (match) {
      const family = match[1];
      const scale = generateColorScale(normalized);
      const updates: Record<string, string> = {};
      for (const [shade, value] of Object.entries(scale)) {
        updates[`theme.palette.colors.${family}.${shade}`] = value!;
        updates[`darkTheme.palette.colors.${family}.${shade}`] = value!;
      }
      if (family === 'primary') {
        updates['theme.semantic.colors.primary'] = 'palette.colors.primary.500';
        updates['theme.semantic.colors.interactive.default'] = 'palette.colors.primary.500';
        updates['theme.semantic.colors.interactive.hover'] = 'palette.colors.primary.600';
        updates['darkTheme.semantic.colors.primary'] = 'palette.colors.primary.400';
        updates['darkTheme.semantic.colors.interactive.default'] = 'palette.colors.primary.400';
        updates['darkTheme.semantic.colors.interactive.hover'] = 'palette.colors.primary.300';
      }
      if (family === 'accent') {
        updates['theme.semantic.colors.accent'] = 'palette.colors.accent.500';
        updates['darkTheme.semantic.colors.accent'] = 'palette.colors.accent.400';
      }
      state.setBatch(updates);
      return;
    }
  }
  state.set(field.statePath, normalizeColorValue(hex));
}

function applyColorValue(zone: ZoneDef, hex: string): void {
  applyColorValueForField(
    {
      statePath: zone.statePath!,
      colorApplyMode: zone.colorApplyMode,
      isBrandColor: zone.isBrandColor,
    },
    hex
  );
}

function resolveRadiusSliderInitialPx(statePath: string): number {
  const raw = state.get(statePath);
  if (typeof raw === 'string') {
    const t = raw.trim();
    const pxMatch = t.match(/^([\d.]+)px$/);
    if (pxMatch) return parseFloat(pxMatch[1]);
    if (t.startsWith('palette.radius.')) {
      const resolved = state.get(`theme.${t}`);
      if (typeof resolved === 'string') {
        const p = parseCssValue(resolved);
        return Math.round(convertToPx(p.value, p.unit));
      }
    }
  }
  return 8;
}

// ─── Slider Editor ──────────────────────────────────────────────

function showSliderEditor(
  zone: ZoneDef,
  pos: PopoverAnchor,
  placeAbove: boolean
): void {
  const opts = zone.slider ?? { min: 0, max: 32, step: 1 };
  const container = document.createElement('div');
  container.className = 'inline-popover-content';

  const numericValue = resolveRadiusSliderInitialPx(zone.statePath!);

  const row = document.createElement('div');
  row.className = 'inline-slider-row';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'inline-slider-input';
  slider.min = String(opts.min);
  slider.max = String(opts.max);
  slider.step = String(opts.step);
  slider.value = String(numericValue);

  const display = document.createElement('span');
  display.className = 'inline-slider-value';
  display.textContent = `${numericValue}px`;

  slider.addEventListener('input', () => {
    const val = parseFloat(slider.value);
    display.textContent = `${val}px`;
    state.set(zone.statePath!, `${val}px`);
  });

  row.appendChild(slider);
  row.appendChild(display);
  container.appendChild(row);

  showPopover(pos, zone.label, container, placeAbove);
}

// ─── Text Editor ────────────────────────────────────────────────

function showTextEditor(
  zone: ZoneDef,
  target: HTMLElement,
  pos: PopoverAnchor,
  placeAbove: boolean
): void {
  const container = document.createElement('div');
  container.className = 'inline-popover-content';

  const currentValue = String(state.get(zone.statePath!) ?? target.textContent ?? '');

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'inline-text-input';
  input.value = currentValue;
  input.placeholder = zone.label;

  input.addEventListener('input', () => {
    state.set(zone.statePath!, input.value);
  });

  container.appendChild(input);

  showPopover(pos, zone.label, container, placeAbove);

  // Auto-focus the input
  requestAnimationFrame(() => input.focus());
}

// ─── Dismiss / Cleanup ──────────────────────────────────────────

function dismissActiveZone(): void {
  if (activeZone) {
    activeZone.cleanup();
    activeZone = null;
  }
  hidePopover();
}

function handleOutsidePointer(event: PointerEvent): void {
  if (!activeZone) return;
  const target = event.target as HTMLElement;
  const popover = document.getElementById('inline-edit-popover');
  if (popover?.contains(target)) return;

  // Check if click is on an overlay
  for (const iframe of iframeRefs) {
    if (iframe.contains(target)) return;
  }

  dismissActiveZone();
}

// ─── Public API ─────────────────────────────────────────────────

export function setupInlineZones(
  iframes: HTMLIFrameElement[],
  scaleFn: () => number
): void {
  destroyInlineZones();
  iframeRefs = iframes;
  getScaleFn = scaleFn;

  for (const iframe of iframes) {
    const doc = iframe.contentDocument;
    if (!doc) continue;

    const style = injectStyleIntoIframe(doc);
    injectedStyles.push(style);

    for (const zone of ZONE_DEFS) {
      const target = doc.querySelector<HTMLElement>(zone.selector);
      if (!target) continue;

      const overlay = createOverlay(doc, target, zone, iframe);
      overlayElements.push(overlay);
    }

    const win = doc.defaultView;
    const scrollEl = doc.getElementById('persona-scroll-container');
    const onReflow = () => {
      refreshInlineZones();
    };
    scrollEl?.addEventListener('scroll', onReflow, { passive: true });
    win?.addEventListener('resize', onReflow);
    reflowCleanups.push(() => {
      scrollEl?.removeEventListener('scroll', onReflow);
      win?.removeEventListener('resize', onReflow);
    });
  }

  document.addEventListener('pointerdown', handleOutsidePointer);
}

export function refreshInlineZones(): void {
  // Reposition existing overlays based on current target positions
  for (const iframe of iframeRefs) {
    const doc = iframe.contentDocument;
    if (!doc) continue;

    for (const zone of ZONE_DEFS) {
      const target = doc.querySelector<HTMLElement>(zone.selector);
      const overlay = doc.querySelector<HTMLElement>(`.inline-zone-overlay[data-zone-id="${zone.id}"]`);

      if (target && overlay) {
        const currentZone = ZONE_DEFS.find((z) => z.id === overlay.dataset.zoneId);
        if (currentZone) {
          positionOverlay(overlay, target, currentZone);
          if (activeZone?.id === currentZone.id) {
            const scale = getScaleFn?.() ?? currentScale;
            const pos = iframeToParent(iframe, target.getBoundingClientRect(), scale);
            positionPopoverElement(getPopover(), pos, computePopoverPlaceAbove(iframe, target));
          }
        }
      } else if (target && !overlay) {
        // Target appeared after last mount
        const newOverlay = createOverlay(doc, target, zone, iframe);
        overlayElements.push(newOverlay);
      } else if (!target && overlay) {
        // Target disappeared
        overlay.remove();
        overlayElements = overlayElements.filter((o) => o !== overlay);
      }
    }
  }
}

export function destroyInlineZones(): void {
  dismissActiveZone();

  for (const style of injectedStyles) {
    style.remove();
  }
  injectedStyles = [];

  for (const overlay of overlayElements) {
    overlay.remove();
  }
  overlayElements = [];

  for (const cleanup of reflowCleanups) {
    cleanup();
  }
  reflowCleanups = [];

  iframeRefs = [];
  getScaleFn = null;

  document.removeEventListener('pointerdown', handleOutsidePointer);
}
