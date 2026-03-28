/** Tab 2: Components — panel, header, messages, input, launcher, buttons, voice, approval */

import type { OnChangeCallback, ControlResult, SectionDef } from '../types';
import { renderSection } from '../controls';
import { setSearchContext } from '../search';
import {
  COMPONENT_SHAPE_SECTIONS,
  COMPONENT_COLOR_SECTIONS,
  scopeSection,
} from '@runtypelabs/persona/theme-editor';

export const TAB_ID = 'design-system';
export const TAB_LABEL = 'Design System';

// ─── Scoped color sections ──────────────────────────────────────────

type ThemeScope = 'theme' | 'darkTheme';
type ThemeVariant = 'light' | 'dark';

function buildScopedColorSections(scope: ThemeScope, variant: ThemeVariant, collapseAll = false): SectionDef[] {
  return COMPONENT_COLOR_SECTIONS.map((section, i) =>
    scopeSection(section, scope, variant, collapseAll ? true : (i > 0)) as SectionDef
  );
}

// ─── Render ───────────────────────────────────────────────────────

/** Render shared shape/layout sections for the component-shapes drill-down */
export function renderShapeSections(
  container: HTMLElement,
  onChange: OnChangeCallback
): ControlResult[] {
  const allControls: ControlResult[] = [];

  for (const section of COMPONENT_SHAPE_SECTIONS) {
    setSearchContext('style', section.id);
    const { element, controls } = renderSection(section as SectionDef, onChange);
    container.appendChild(element);
    allControls.push(...controls);
  }

  return allControls;
}

/** Render scoped color sections (light + dark) for the component-colors drill-down */
export function renderColorSections(
  container: HTMLElement,
  onChange: OnChangeCallback
): ControlResult[] {
  const allControls: ControlResult[] = [];

  const lightSections = buildScopedColorSections('theme', 'light');
  const darkSections = buildScopedColorSections('darkTheme', 'dark', true);

  for (const [variant, sections] of [
    ['light', lightSections] as const,
    ['dark', darkSections] as const,
  ]) {
    const wrapper = document.createElement('div');
    wrapper.className = 'editing-target-group';
    wrapper.dataset.editingTarget = variant;

    for (const section of sections) {
      setSearchContext('style', section.id);
      const { element, controls } = renderSection(section, onChange);
      wrapper.appendChild(element);
      allControls.push(...controls);
    }

    container.appendChild(wrapper);
  }

  return allControls;
}

/** Render all component sections (shared + scoped) */
export function render(
  container: HTMLElement,
  onChange: OnChangeCallback
): ControlResult[] {
  const allControls: ControlResult[] = [];
  allControls.push(...renderShapeSections(container, onChange));
  allControls.push(...renderColorSections(container, onChange));
  return allControls;
}
