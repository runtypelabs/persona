/** Configure tab — content, layout, widget, features, and developer settings */

import type { SectionDef, OnChangeCallback, ControlResult } from '../types';
import { renderSection } from '../controls';
import { setSearchContext } from '../search';
import * as state from '../state';
import {
  CONFIGURE_SUB_GROUPS,
  getPreviewTranscriptPresetLabel,
  type PreviewTranscriptEntryPreset,
} from '@runtypelabs/persona/theme-editor';

export const TAB_ID = 'configure';
export const TAB_LABEL = 'Configure';

const PREVIEW_TRANSCRIPT_PRESETS: PreviewTranscriptEntryPreset[] = [
  'user-message',
  'assistant-message',
  'reasoning-streaming',
  'reasoning-complete',
  'tool-running',
  'tool-complete',
];

function attachPreviewTranscriptBuilder(content: Element): void {
  const builder = document.createElement('div');
  builder.className = 'preview-transcript-builder';
  builder.style.cssText = 'margin-top:12px;padding-top:12px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:8px;';

  const title = document.createElement('div');
  title.textContent = 'Preview Transcript Builder';
  title.style.cssText = 'font-size:12px;font-weight:600;color:var(--text);';

  const description = document.createElement('div');
  description.textContent = 'Append tool, reasoning, and message rows to test different back-and-forth scenarios in the preview.';
  description.style.cssText = 'font-size:12px;color:var(--text-muted);line-height:1.4;';

  const select = document.createElement('select');
  select.className = 'control-select';
  select.setAttribute('data-preview-transcript-select', 'true');
  PREVIEW_TRANSCRIPT_PRESETS.forEach((preset) => {
    const option = document.createElement('option');
    option.value = preset;
    option.textContent = getPreviewTranscriptPresetLabel(preset);
    select.appendChild(option);
  });

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:8px;';

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.textContent = 'Add to Preview';
  addBtn.className = 'config-action-btn';
  addBtn.setAttribute('data-preview-transcript-add', 'true');
  addBtn.style.cssText = 'flex:1;padding:6px 12px;border-radius:6px;border:1px solid var(--border);background:var(--surface-2);color:var(--text);font-size:12px;cursor:pointer;';

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.textContent = 'Clear';
  clearBtn.className = 'config-action-btn';
  clearBtn.setAttribute('data-preview-transcript-clear', 'true');
  clearBtn.style.cssText = 'padding:6px 12px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--text);font-size:12px;cursor:pointer;';

  const list = document.createElement('div');
  list.setAttribute('data-preview-transcript-list', 'true');
  list.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';

  const renderList = () => {
    const entries = state.getPreviewTranscriptEntries();
    list.innerHTML = '';
    clearBtn.disabled = entries.length === 0;
    clearBtn.style.opacity = entries.length === 0 ? '0.5' : '1';
    if (entries.length === 0) {
      const empty = document.createElement('span');
      empty.textContent = 'No custom preview items added yet.';
      empty.style.cssText = 'font-size:12px;color:var(--text-muted);';
      list.appendChild(empty);
      return;
    }

    entries.forEach((entry, index) => {
      const chip = document.createElement('span');
      chip.textContent = `${index + 1}. ${getPreviewTranscriptPresetLabel(entry)}`;
      chip.style.cssText = 'display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;background:var(--surface-2);border:1px solid var(--border);font-size:11px;color:var(--text);';
      list.appendChild(chip);
    });
  };

  addBtn.addEventListener('click', () => {
    state.addPreviewTranscriptEntry(select.value as PreviewTranscriptEntryPreset);
    renderList();
  });
  clearBtn.addEventListener('click', () => {
    state.clearPreviewTranscriptEntries();
    renderList();
  });

  actions.append(addBtn, clearBtn);
  builder.append(title, description, select, actions, list);
  content.appendChild(builder);
  renderList();
}

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

    if (section.id === 'debug-inspection') {
      const content = element.querySelector('.accordion-content');
      if (content) {
        attachPreviewTranscriptBuilder(content);
      }
    }
  }

  return allControls;
}

function refreshLauncherSectionMetadata(container: HTMLElement): void {
  const section = container.querySelector<HTMLElement>('[data-section-id="launcher-basics"]');
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

    if (group.collapsedByDefault) {
      divider.classList.add('subgroup-collapsed');
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'subgroup-toggle';
      toggle.innerHTML = `<span class="subgroup-label">${group.label}</span><svg class="subgroup-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;
      divider.appendChild(toggle);

      const wrapper = document.createElement('div');
      wrapper.className = 'subgroup-content';
      wrapper.style.display = 'none';

      toggle.addEventListener('click', () => {
        const isCollapsed = divider.classList.toggle('subgroup-collapsed');
        wrapper.style.display = isCollapsed ? 'none' : '';
      });

      // Toggle starts collapsed — flip the class off so the first toggle opens it
      divider.classList.add('subgroup-collapsed');
      container.appendChild(divider);
      allControls.push(...renderSections(wrapper, onChange, group.sections as SectionDef[], TAB_ID));
      container.appendChild(wrapper);
    } else {
      divider.innerHTML = `<span class="subgroup-label">${group.label}</span>`;
      container.appendChild(divider);
      allControls.push(...renderSections(container, onChange, group.sections as SectionDef[], TAB_ID));
    }
  }

  refreshSectionMetadata(container);
  return allControls;
}

export function refreshSectionMetadata(container: HTMLElement): void {
  refreshLauncherSectionMetadata(container);
}
