/** Colors & Style — palette scales and semantic tokens for drill-down views */

import type { SectionDef, OnChangeCallback, ControlResult } from '../types';
import { renderSection } from '../controls';
import { setSearchContext } from '../search';
import * as state from '../state';
import {
  PALETTE_SECTION,
  SEMANTIC_COLORS_SECTION,
  scopeSection,
} from '@runtypelabs/persona/theme-editor';

export const TAB_ID = 'style';
export const TAB_LABEL = 'Style';

// ─── Scoped sections ────────────────────────────────────────────────

type ThemeScope = 'theme' | 'darkTheme';
type ThemeVariant = 'light' | 'dark';

function buildScopedThemeSections(scope: ThemeScope, variant: ThemeVariant, darkCollapsed = false): SectionDef[] {
  return [scopeSection(PALETTE_SECTION, scope, variant, darkCollapsed ? true : false) as SectionDef];
}

function buildScopedSemanticSections(
  scope: ThemeScope,
  variant: ThemeVariant,
  collapsed = true
): SectionDef[] {
  return [scopeSection(SEMANTIC_COLORS_SECTION, scope, variant, collapsed) as SectionDef];
}

function renderScopedSections(
  container: HTMLElement,
  onChange: OnChangeCallback,
  scopedSections: Record<ThemeVariant, SectionDef[]>,
  searchTabId: string
): ControlResult[] {
  const allControls: ControlResult[] = [];

  for (const [variant, sections] of Object.entries(scopedSections) as [ThemeVariant, SectionDef[]][]) {
    const wrapper = document.createElement('div');
    wrapper.className = 'editing-target-group';
    wrapper.dataset.editingTarget = variant;

    for (const section of sections) {
      setSearchContext(searchTabId, section.id);
      const { element, controls } = renderSection(section, onChange);

      if (section.presets) {
        const header = element.querySelector('.accordion-header');
        if (header) {
          const presetsDiv = document.createElement('div');
          presetsDiv.className = 'accordion-presets';
          for (const preset of section.presets) {
            const btn = document.createElement('button');
            btn.className = 'preset-btn';
            btn.textContent = preset.label;
            btn.type = 'button';
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              state.setBatch(preset.values);
              for (const control of controls) {
                const val = state.get(control.fieldDef.path);
                if (val !== undefined) control.setValue(val);
              }
            });
            presetsDiv.appendChild(btn);
          }
          header.appendChild(presetsDiv);
        }
      }

      wrapper.appendChild(element);
      allControls.push(...controls);
    }

    container.appendChild(wrapper);
  }

  return allControls;
}

/** Render palette scale editors (light + dark) for the palette drill-down */
export function renderPaletteScales(
  container: HTMLElement,
  onChange: OnChangeCallback
): ControlResult[] {
  return renderScopedSections(container, onChange, {
    light: buildScopedThemeSections('theme', 'light'),
    dark: buildScopedThemeSections('darkTheme', 'dark', true),
  }, 'style');
}

/** Render semantic color groups (light + dark) for the palette drill-down */
export function renderSemanticGroup(
  container: HTMLElement,
  onChange: OnChangeCallback
): ControlResult[] {
  return renderScopedSections(container, onChange, {
    light: buildScopedSemanticSections('theme', 'light'),
    dark: buildScopedSemanticSections('darkTheme', 'dark'),
  }, 'style');
}

/** Render the full palette drill-down: palette scales + semantic colors */
export function render(
  container: HTMLElement,
  onChange: OnChangeCallback
): ControlResult[] {
  const allControls: ControlResult[] = [];
  allControls.push(...renderPaletteScales(container, onChange));
  allControls.push(...renderSemanticGroup(container, onChange));
  return allControls;
}
