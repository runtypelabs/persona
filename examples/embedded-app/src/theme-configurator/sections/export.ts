/** Tab 4: Export — presets, code export, JSON import/export, reset */

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
import { generateCodeSnippet, type CodeFormat, createTheme } from '@runtypelabs/persona';

export const TAB_ID = 'export';
export const TAB_LABEL = 'Export';

// ─── Render ───────────────────────────────────────────────────────

export function render(
  container: HTMLElement,
  onChange: OnChangeCallback
): ControlResult[] {
  setSearchContext(TAB_ID, 'export');

  // ── Presets Section ──
  const presetsSection = document.createElement('div');
  presetsSection.className = 'export-section';
  presetsSection.innerHTML = `
    <h3 class="export-section-title">Theme Presets</h3>
    <div class="preset-grid" id="preset-grid"></div>
    <div class="preset-save-row">
      <input type="text" id="preset-name-input" class="control-text-input" placeholder="Preset name…" />
      <button type="button" id="save-preset-btn" class="btn btn-primary">Save Current</button>
    </div>
  `;
  container.appendChild(presetsSection);

  // ── Code Export Section ──
  const codeSection = document.createElement('div');
  codeSection.className = 'export-section';
  codeSection.innerHTML = `
    <h3 class="export-section-title">Code Export</h3>
    <div class="export-format-row">
      <select id="code-format-select" class="control-select">
        <option value="script-installer">Script Tag (Installer)</option>
        <option value="script-manual">Script Tag (Manual)</option>
        <option value="script-advanced">Script Tag (Advanced)</option>
        <option value="esm">ESM Module</option>
        <option value="react-component">React Component</option>
        <option value="react-advanced">React Advanced</option>
      </select>
      <button type="button" id="copy-code-btn" class="btn btn-primary">Copy Code</button>
    </div>
    <pre id="code-preview" class="code-preview"><code></code></pre>
  `;
  container.appendChild(codeSection);

  // ── JSON Section ──
  const jsonSection = document.createElement('div');
  jsonSection.className = 'export-section';
  jsonSection.innerHTML = `
    <h3 class="export-section-title">JSON Import/Export</h3>
    <div class="export-button-row">
      <button type="button" id="copy-json-btn" class="btn">Copy Theme JSON</button>
      <button type="button" id="load-json-btn" class="btn">Load Theme JSON</button>
    </div>
    <textarea id="json-import-area" class="json-textarea hidden" placeholder="Paste JSON here…" rows="10"></textarea>
    <button type="button" id="apply-json-btn" class="btn btn-primary hidden">Apply JSON</button>
  `;
  container.appendChild(jsonSection);

  // ── Reset Section ──
  const resetSection = document.createElement('div');
  resetSection.className = 'export-section';
  resetSection.innerHTML = `
    <h3 class="export-section-title">Reset</h3>
    <button type="button" id="reset-defaults-btn" class="btn btn-danger">Reset to Defaults</button>
  `;
  container.appendChild(resetSection);

  // ── Wire up interactions ──
  requestAnimationFrame(() => {
    setupPresetGrid();
    setupCodeExport();
    setupJsonExport();
    setupReset();
  });

  return [];
}

// ─── Preset Grid ──────────────────────────────────────────────────

function setupPresetGrid(): void {
  const grid = document.getElementById('preset-grid');
  const nameInput = document.getElementById('preset-name-input') as HTMLInputElement;
  const saveBtn = document.getElementById('save-preset-btn');

  if (!grid || !nameInput || !saveBtn) return;

  const renderGrid = () => {
    grid.innerHTML = '';
    const presets = getAllPresets();

    for (const preset of presets) {
      const card = document.createElement('div');
      card.className = `preset-card${preset.builtIn ? '' : ' preset-card-custom'}`;

      const info = document.createElement('div');
      info.className = 'preset-card-info';
      info.innerHTML = `
        <span class="preset-card-label">${preset.label}</span>
        <span class="preset-card-desc">${preset.description}</span>
      `;

      const actions = document.createElement('div');
      actions.className = 'preset-card-actions';

      const applyBtn = document.createElement('button');
      applyBtn.className = 'btn btn-sm';
      applyBtn.textContent = 'Apply';
      applyBtn.type = 'button';
      applyBtn.addEventListener('click', () => {
        applyPreset(preset);
      });
      actions.appendChild(applyBtn);

      if (!preset.builtIn) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-sm btn-danger';
        deleteBtn.textContent = 'Delete';
        deleteBtn.type = 'button';
        deleteBtn.addEventListener('click', () => {
          if (confirm(`Delete preset "${preset.label}"?`)) {
            deleteCustomPreset(preset.id);
            renderGrid();
          }
        });
        actions.appendChild(deleteBtn);
      }

      card.appendChild(info);
      card.appendChild(actions);
      grid.appendChild(card);
    }
  };

  renderGrid();

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
    renderGrid();
  });
}

// ─── Code Export ──────────────────────────────────────────────────

function setupCodeExport(): void {
  const formatSelect = document.getElementById('code-format-select') as HTMLSelectElement;
  const copyBtn = document.getElementById('copy-code-btn');
  const preview = document.getElementById('code-preview');

  if (!formatSelect || !copyBtn || !preview) return;

  const updatePreview = () => {
    const format = formatSelect.value as CodeFormat;
    const config = state.getConfig();
    // Build a config with the v2 theme for code generation
    const configWithTheme = {
      ...config,
      theme: state.getTheme() as any,
    };
    const code = generateCodeSnippet(configWithTheme, format);
    const codeEl = preview.querySelector('code');
    if (codeEl) codeEl.textContent = code;
  };

  formatSelect.addEventListener('change', updatePreview);
  updatePreview();

  copyBtn.addEventListener('click', async () => {
    const codeEl = preview.querySelector('code');
    if (codeEl?.textContent) {
      try {
        await navigator.clipboard.writeText(codeEl.textContent);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
          copyBtn.textContent = 'Copy Code';
        }, 2000);
      } catch {
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = codeEl.textContent;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
          copyBtn.textContent = 'Copy Code';
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
    const theme = state.getTheme();
    const json = JSON.stringify(theme, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      copyJsonBtn.textContent = 'Copied!';
      setTimeout(() => {
        copyJsonBtn.textContent = 'Copy Theme JSON';
      }, 2000);
    } catch {
      // Fallback
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
      const theme = createTheme(parsed, { validate: false });
      state.setTheme(theme);
      jsonArea.classList.add('hidden');
      applyJsonBtn.classList.add('hidden');
      jsonArea.value = '';
    } catch (e) {
      alert(`Invalid JSON: ${(e as Error).message}`);
    }
  });
}

// ─── Reset ───────────────────────────────────────────────────────

function setupReset(): void {
  const resetBtn = document.getElementById('reset-defaults-btn');
  if (!resetBtn) return;

  resetBtn.addEventListener('click', () => {
    if (confirm('Reset all settings to defaults? This cannot be undone.')) {
      state.resetToDefaults();
      // Reload to refresh all controls
      window.location.reload();
    }
  });
}
