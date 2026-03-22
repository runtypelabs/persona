/** Actions — toolbar dropdown with export, import, presets, and reset utilities. */

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
    <h4 class="export-dropdown-title">Code Export</h4>
    <div class="export-format-row">
      <select id="code-format-select" class="control-select">
        <option value="script-installer">Script Tag (Installer)</option>
        <option value="script-manual">Script Tag (Manual)</option>
        <option value="script-advanced">Script Tag (Advanced)</option>
        <option value="esm">ESM Module</option>
        <option value="react-component">React Component</option>
        <option value="react-advanced">React Advanced</option>
      </select>
      <button type="button" id="copy-code-btn" class="btn btn-primary btn-sm">Copy</button>
    </div>
    <pre id="code-preview" class="code-preview"><code></code></pre>
  `;
  container.appendChild(codeSection);

  // ── JSON Section ──
  const jsonSection = document.createElement('div');
  jsonSection.className = 'export-dropdown-section';
  jsonSection.innerHTML = `
    <h4 class="export-dropdown-title">Config JSON</h4>
    <div class="export-button-row">
      <button type="button" id="copy-json-btn" class="btn btn-sm">Copy JSON</button>
      <button type="button" id="load-json-btn" class="btn btn-sm">Load JSON</button>
    </div>
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
  const copyBtn = document.getElementById('copy-code-btn');
  const preview = document.getElementById('code-preview');

  if (!formatSelect || !copyBtn || !preview) return;

  const updatePreview = () => {
    const format = formatSelect.value as CodeFormat;
    const config = state.getConfigForOutput();
    const configWithTheme = {
      ...config,
      theme: state.getTheme() as any,
    };
    const code = generateCodeSnippet(configWithTheme, format);
    const codeEl = preview.querySelector('code');
    if (codeEl) codeEl.textContent = code;
  };

  formatSelect.addEventListener('change', updatePreview);
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

  if (!copyJsonBtn || !loadJsonBtn || !jsonArea || !applyJsonBtn) return;

  copyJsonBtn.addEventListener('click', async () => {
    const snapshot = state.exportSnapshot();
    const json = JSON.stringify(snapshot, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      copyJsonBtn.textContent = 'Copied!';
      setTimeout(() => {
        copyJsonBtn.textContent = 'Copy JSON';
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
    jsonArea.value = '';
    jsonArea.focus();
  });

  applyJsonBtn.addEventListener('click', () => {
    const json = jsonArea.value.trim();
    if (!json) return;

    try {
      const parsed = JSON.parse(json);
      state.importSnapshot(parsed);
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
