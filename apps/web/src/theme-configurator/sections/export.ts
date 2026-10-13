/** Actions: toolbar dropdown with export, import, presets, and reset utilities. */

import type { OnChangeCallback, ControlResult } from '../types';
import { setSearchContext } from '../search';
import * as state from '../state';
import {
  getAllPresets,
  saveCustomPreset,
  deleteCustomPreset,
  applyPreset,
  presetExists,
  type ThemePreset,
} from '../presets';
import { generateCodeSnippet, type CodeFormat } from '@runtypelabs/persona';

export const TAB_ID = 'export';
export const TAB_LABEL = 'Actions';

let exportDropdownOpen = false;
let onSyncAllControls: (() => void) | null = null;

/** Check if the export dropdown is currently open */
export function isExportOpen(): boolean {
  return exportDropdownOpen;
}

/** Toggle the export dropdown open/closed */
export function toggleExport(): void {
  exportDropdownOpen = !exportDropdownOpen;
  const dropdown = document.getElementById('export-dropdown');
  if (!dropdown) return;

  if (exportDropdownOpen) {
    dropdown.classList.remove('hidden');
    if (!dropdown.hasChildNodes()) {
      renderDropdownContent(dropdown);
    }
  } else {
    dropdown.classList.add('hidden');
  }
}

/** Close the export dropdown */
export function closeExport(): void {
  exportDropdownOpen = false;
  const dropdown = document.getElementById('export-dropdown');
  if (dropdown) dropdown.classList.add('hidden');
}

/** Set callback for syncing all controls after preset apply */
export function setSyncCallback(callback: () => void): void {
  onSyncAllControls = callback;
}

// ─── Dropdown content ──────────────────────────────────────────

function renderDropdownContent(container: HTMLElement): void {
  container.innerHTML = '';

  // ── Code Export Section ──
  const codeSection = document.createElement('div');
  codeSection.className = 'export-dropdown-section';
  codeSection.innerHTML = `
    <h4 class="export-dropdown-title">Copy configuration</h4>
    <p id="export-origin-note" class="control-description"></p>
    <div class="export-format-row">
      <select id="code-format-select" class="control-select" aria-label="Code format">
        <option value="script-installer">Script tag</option>
        <option value="script-manual">Script Tag (Manual)</option>
        <option value="script-advanced">Script Tag (Advanced)</option>
        <option value="esm">JavaScript (module)</option>
        <option value="react-component">React</option>
        <option value="react-advanced">React Advanced</option>
      </select>
      <button type="button" id="copy-code-btn" class="btn btn-primary btn-sm">Copy</button>
    </div>
    <pre id="code-preview" class="code-preview"><code></code></pre>
    <p id="export-warning" class="control-description hidden" role="status"></p>
    <details class="export-advanced">
      <summary>Advanced</summary>
      <label class="export-defaults-option"><input id="export-include-defaults" type="checkbox" /> Include default settings</label>
      <p class="control-description">Copies Persona’s defaults along with your settings.</p>
      <button type="button" id="copy-authored-json-btn" class="btn btn-sm">Copy settings as JSON</button>
      <a href="https://github.com/runtypelabs/persona/blob/main/docs/configuration.md" target="_blank" rel="noopener noreferrer">Configuration guide</a>
    </details>
  `;
  container.appendChild(codeSection);

  // ── JSON Section ──
  const jsonSection = document.createElement('div');
  jsonSection.className = 'export-dropdown-section';
  jsonSection.innerHTML = `
    <h4 class="export-dropdown-title">Editor backup</h4>
    <p class="control-description">Keep a copy to restore your editor settings later.</p>
    <div class="export-button-row">
      <button type="button" id="copy-json-btn" class="btn btn-sm">Copy editor backup</button>
      <button type="button" id="load-json-btn" class="btn btn-sm">Import JSON</button>
    </div>
    <select id="json-import-kind" class="control-select hidden" aria-label="JSON import kind">
      <option value="backup">Editor backup / raw theme</option>
      <option value="config">Widget configuration</option>
    </select>
    <textarea id="json-import-area" class="json-textarea hidden" placeholder="Paste JSON here…" rows="6"></textarea>
    <button type="button" id="apply-json-btn" class="btn btn-primary btn-sm hidden">Apply JSON</button>
  `;
  container.appendChild(jsonSection);

  // ── Save Preset Section ──
  const presetSection = document.createElement('div');
  presetSection.className = 'export-dropdown-section';
  presetSection.innerHTML = `
    <h4 class="export-dropdown-title">Save Preset</h4>
    <div class="preset-save-row">
      <input type="text" id="export-preset-name" class="control-text-input" placeholder="Preset name…" />
      <button type="button" id="export-save-preset-btn" class="btn btn-primary btn-sm">Save</button>
    </div>
  `;
  container.appendChild(presetSection);

  // ── Reset Section ──
  const resetSection = document.createElement('div');
  resetSection.className = 'export-dropdown-section export-dropdown-section-reset';
  resetSection.innerHTML = `
    <button type="button" id="reset-defaults-btn" class="btn btn-danger btn-sm">Reset to Defaults</button>
  `;
  container.appendChild(resetSection);

  // Wire up interactions after DOM is ready
  requestAnimationFrame(() => {
    setupCodeExport();
    setupJsonExport();
    setupPresetSave();
    setupReset();
  });
}

// ─── Render (legacy interface, now no-op for tab panels) ─────────

export function render(
  _container: HTMLElement,
  _onChange: OnChangeCallback
): ControlResult[] {
  return [];
}

// ─── Code Export ──────────────────────────────────────────────────

function setupCodeExport(): void {
  const formatSelect = document.getElementById('code-format-select') as HTMLSelectElement;
  const includeDefaults = document.getElementById('export-include-defaults') as HTMLInputElement;
  const warning = document.getElementById('export-warning');
  const originNote = document.getElementById('export-origin-note');
  const copyBtn = document.getElementById('copy-code-btn');
  const preview = document.getElementById('code-preview');

  if (!formatSelect || !copyBtn || !preview) return;

  const updatePreview = () => {
    const format = formatSelect.value as CodeFormat;
    const authored = state.exportAuthoredConfig();
    const useAuthored = !includeDefaults.checked;
    const config = useAuthored ? authored.config : state.getConfigForOutput();
    if (originNote) originNote.textContent = useAuthored
      ? (authored.origin === 'imported'
          ? 'Copies your imported settings and any changes you’ve made.'
          : 'Copy your settings into your app or website.')
      : 'Copies your settings and Persona’s default settings.';
    const code = generateCodeSnippet(config, format, { authoredOverrides: useAuthored });
    const codeEl = preview.querySelector('code');
    if (codeEl) codeEl.textContent = code;
    if (warning) {
      const hasOmissions = /Omitted non-serializable inputs:|Function-valued .* omitted;/.test(code);
      warning.classList.toggle('hidden', !hasOmissions);
      warning.textContent = hasOmissions
        ? 'Some custom settings need to be added in your app. See the comments in the copied code.' : '';
    }
  };

  formatSelect.addEventListener('change', updatePreview);
  includeDefaults.addEventListener('change', updatePreview);
  state.onChange(() => updatePreview());
  updatePreview();

  copyBtn.addEventListener('click', async () => {
    const codeEl = preview.querySelector('code');
    if (codeEl?.textContent) {
      try {
        await navigator.clipboard.writeText(codeEl.textContent);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
          copyBtn.textContent = 'Copy';
        }, 2000);
      } catch {
        const textarea = document.createElement('textarea');
        textarea.value = codeEl.textContent;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
          copyBtn.textContent = 'Copy';
        }, 2000);
      }
    }
  });
}

// ─── JSON Export/Import ──────────────────────────────────────────

function setupJsonExport(): void {
  const copyJsonBtn = document.getElementById('copy-json-btn');
  const loadJsonBtn = document.getElementById('load-json-btn');
  const jsonArea = document.getElementById('json-import-area') as HTMLTextAreaElement;
  const applyJsonBtn = document.getElementById('apply-json-btn');
  const importKind = document.getElementById('json-import-kind') as HTMLSelectElement;

  if (!copyJsonBtn || !loadJsonBtn || !jsonArea || !applyJsonBtn) return;

  const copyAuthoredBtn = document.getElementById('copy-authored-json-btn');
  copyAuthoredBtn?.addEventListener('click', async () => {
    if (importKind) importKind.value = 'config';
    const includeDefaults = document.getElementById('export-include-defaults') as HTMLInputElement;
    const config = includeDefaults.checked ? state.getConfigForOutput() : state.exportAuthoredConfig().config;
    const json = JSON.stringify(config, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      copyAuthoredBtn.textContent = 'Copied!';
      setTimeout(() => { copyAuthoredBtn.textContent = 'Copy settings as JSON'; }, 2000);
    } catch {
      jsonArea.value = json;
      jsonArea.classList.remove('hidden');
      jsonArea.select();
    }
  });

  copyJsonBtn.addEventListener('click', async () => {
    if (importKind) importKind.value = 'backup';
    const snapshot = state.exportSnapshot();
    const json = JSON.stringify(snapshot, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      copyJsonBtn.textContent = 'Copied!';
      setTimeout(() => {
        copyJsonBtn.textContent = 'Copy editor backup';
      }, 2000);
    } catch {
      jsonArea.value = json;
      jsonArea.classList.remove('hidden');
      jsonArea.select();
    }
  });

  loadJsonBtn.addEventListener('click', () => {
    jsonArea.classList.toggle('hidden');
    applyJsonBtn.classList.toggle('hidden');
    importKind?.classList.toggle('hidden');
    jsonArea.value = '';
    jsonArea.focus();
  });

  applyJsonBtn.addEventListener('click', () => {
    const json = jsonArea.value.trim();
    if (!json) return;

    try {
      const parsed = JSON.parse(json);
      if (importKind?.value === 'config') state.importAuthoredConfig(parsed);
      else state.importSnapshot(parsed);
      importKind?.classList.add('hidden');
      jsonArea.classList.add('hidden');
      applyJsonBtn.classList.add('hidden');
      jsonArea.value = '';
      closeExport();
    } catch (e) {
      alert(`Invalid JSON: ${(e as Error).message}`);
    }
  });
}

// ─── Preset Save ─────────────────────────────────────────────────

function setupPresetSave(): void {
  const nameInput = document.getElementById('export-preset-name') as HTMLInputElement;
  const saveBtn = document.getElementById('export-save-preset-btn');

  if (!nameInput || !saveBtn) return;

  saveBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) {
      alert('Please enter a preset name');
      return;
    }
    if (presetExists(name)) {
      if (!confirm(`Preset "${name}" already exists. Overwrite?`)) return;
    }
    saveCustomPreset(name);
    nameInput.value = '';
    closeExport();
  });
}

// ─── Reset ───────────────────────────────────────────────────────

function setupReset(): void {
  const resetBtn = document.getElementById('reset-defaults-btn');
  if (!resetBtn) return;

  resetBtn.addEventListener('click', () => {
    if (confirm('Reset all settings to defaults? This cannot be undone.')) {
      state.resetToDefaults();
      window.location.reload();
    }
  });
}
