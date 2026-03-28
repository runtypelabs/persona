/** Configure tab — content, layout, widget, features, and developer settings */

import type { SectionDef, OnChangeCallback, ControlResult } from '../types';
import { renderSection } from '../controls';
import { setSearchContext } from '../search';
import * as state from '../state';
import { CONFIGURE_SUB_GROUPS } from '@runtypelabs/persona/theme-editor';

export const TAB_ID = 'configure';
export const TAB_LABEL = 'Configure';

// ─── Render ───────────────────────────────────────────────────────

function renderSections(
  container: HTMLElement,
  onChange: OnChangeCallback,
  sections: SectionDef[],
  searchTabId: string
): ControlResult[] {
  const allControls: ControlResult[] = [];

  for (const section of sections) {
    setSearchContext(searchTabId, section.id);
    const { element, controls } = renderSection(section, onChange);
    container.appendChild(element);
    allControls.push(...controls);

    // Add "Show Sample Artifact" button to the artifacts section
    if (section.id === 'artifacts-config') {
      const content = element.querySelector('.accordion-content');
      if (content) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = 'Show Sample Artifact';
        btn.className = 'config-action-btn';
        btn.style.cssText = 'margin-top:8px;width:100%;padding:6px 12px;border-radius:6px;border:1px solid var(--border);background:var(--surface-2);color:var(--text);font-size:12px;cursor:pointer;';
        btn.addEventListener('click', () => {
          window.dispatchEvent(new CustomEvent('persona-configurator:inject-artifact'));
        });
        content.appendChild(btn);
      }
    }
  }

  return allControls;
}

function refreshLauncherSectionMetadata(container: HTMLElement): void {
  const section = container.querySelector<HTMLElement>('[data-section-id="launcher-config"]');
  const header = section?.querySelector<HTMLElement>('.accordion-header');
  if (!section || !header) return;

  let meta = header.querySelector<HTMLElement>('.accordion-header-meta');
  if (!meta) {
    meta = document.createElement('div');
    meta.className = 'accordion-header-meta';
    meta.innerHTML = `
      <div class="accordion-summary"></div>
      <div class="section-header-actions"></div>
    `;
    header.appendChild(meta);
  }

  const summary = meta.querySelector<HTMLElement>('.accordion-summary');
  const actions = meta.querySelector<HTMLElement>('.section-header-actions');
  if (!summary || !actions) return;

  summary.innerHTML = '';

  const position = document.createElement('span');
  position.className = 'accordion-summary-item accordion-summary-item-text';
  position.textContent = `Position: ${String(state.get('launcher.position') ?? 'bottom-right')}`;
  summary.appendChild(position);

  actions.innerHTML = `
    <button
      type="button"
      class="drilldown-link section-header-action"
      data-crosslink-tab="style"
      data-crosslink-section="launcher-style"
    >
      Edit appearance
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
    </button>
  `;
}

/** Render the full Configure tab with sub-group dividers */
export function render(
  container: HTMLElement,
  onChange: OnChangeCallback
): ControlResult[] {
  const allControls: ControlResult[] = [];

  for (const group of CONFIGURE_SUB_GROUPS) {
    const divider = document.createElement('div');
    divider.className = 'subgroup-divider';
    divider.innerHTML = `<span class="subgroup-label">${group.label}</span>`;
    container.appendChild(divider);

    allControls.push(...renderSections(container, onChange, group.sections as SectionDef[], TAB_ID));
  }

  refreshSectionMetadata(container);
  return allControls;
}

export function refreshSectionMetadata(container: HTMLElement): void {
  refreshLauncherSectionMetadata(container);
}
