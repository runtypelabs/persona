/**
 * Theme Inspector & Editor tab.
 *
 * Shows all --persona-* CSS variables grouped by category.
 * Supports live editing, reset, export, and import.
 */

import { registerTab, sendCommand, getSelectedInstance } from '../panel.js';
import { createPropertyEditor } from '../components/property-editor.js';
import { CSS_VAR_CATEGORIES, overridesToThemeObject } from '../../shared/css-var-map.js';

const container = document.getElementById('tab-theme');

/** @type {Record<string, string>} */
let currentVars = {};
/** @type {Record<string, string>} */
let currentOverrides = {};
/** @type {Record<string, { el: HTMLElement, update: Function }>} */
const editorRows = {};

// ── Build UI ──

function buildUI() {
  container.innerHTML = '';

  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';

  const searchInput = document.createElement('input');
  searchInput.className = 'search-input';
  searchInput.placeholder = 'Filter variables...';
  searchInput.addEventListener('input', () => filterVars(searchInput.value));

  const spacer = document.createElement('span');
  spacer.className = 'toolbar-spacer';

  const resetAllBtn = document.createElement('button');
  resetAllBtn.className = 'btn btn-sm';
  resetAllBtn.textContent = 'Reset All';
  resetAllBtn.addEventListener('click', resetAll);

  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn btn-sm';
  exportBtn.textContent = 'Export';
  exportBtn.addEventListener('click', showExport);

  const importBtn = document.createElement('button');
  importBtn.className = 'btn btn-sm';
  importBtn.textContent = 'Import';
  importBtn.addEventListener('click', showImport);

  toolbar.append(searchInput, spacer, resetAllBtn, exportBtn, importBtn);
  container.appendChild(toolbar);

  // Sections
  for (const cat of CSS_VAR_CATEGORIES) {
    const section = document.createElement('div');
    section.className = 'section' + (cat.collapsed ? ' collapsed' : '');
    section.dataset.categoryId = cat.id;

    const header = document.createElement('div');
    header.className = 'section-header';

    const chevron = document.createElement('span');
    chevron.className = 'section-chevron';
    chevron.textContent = '\u25BC';

    const title = document.createElement('span');
    title.textContent = cat.title;

    const count = document.createElement('span');
    count.className = 'section-count';
    count.textContent = `${cat.vars.length} vars`;

    header.append(chevron, title, count);
    header.addEventListener('click', () => section.classList.toggle('collapsed'));

    const body = document.createElement('div');
    body.className = 'section-body';

    for (const varName of cat.vars) {
      const val = currentVars[varName] || '';
      const isOverridden = varName in currentOverrides;
      const editor = createPropertyEditor({
        varName,
        value: isOverridden ? currentOverrides[varName] : val,
        isOverridden,
        onChange: handleSetVar,
        onReset: handleResetVar,
      });
      editorRows[varName] = editor;
      body.appendChild(editor.el);
    }

    section.append(header, body);
    container.appendChild(section);
  }
}

// ── Handlers ──

function handleSetVar(varName, value) {
  sendCommand('SET_CSS_VAR', { varName, value, instanceId: getSelectedInstance() });
  currentOverrides[varName] = value;
  currentVars[varName] = value;
  editorRows[varName]?.update(value, true);
}

function handleResetVar(varName) {
  sendCommand('RESET_CSS_VAR', { varName, instanceId: getSelectedInstance() });
  delete currentOverrides[varName];
  editorRows[varName]?.update(currentVars[varName] || '', false);
}

function resetAll() {
  sendCommand('RESET_ALL_CSS_VARS', { instanceId: getSelectedInstance() });
  currentOverrides = {};
  // Refresh all values from page
  requestCssVars();
}

function filterVars(query) {
  const q = query.toLowerCase();
  for (const cat of CSS_VAR_CATEGORIES) {
    const section = container.querySelector(`[data-category-id="${cat.id}"]`);
    if (!section) continue;

    let visibleCount = 0;
    for (const varName of cat.vars) {
      const row = editorRows[varName]?.el;
      if (!row) continue;
      const matches = !q || varName.toLowerCase().includes(q) || (currentVars[varName] || '').toLowerCase().includes(q);
      row.style.display = matches ? '' : 'none';
      if (matches) visibleCount++;
    }

    // Show/hide entire section
    section.style.display = (!q || visibleCount > 0) ? '' : 'none';
    if (q && visibleCount > 0) {
      section.classList.remove('collapsed');
    }
  }
}

function showExport() {
  // Build theme object from current overrides
  const theme = overridesToThemeObject(currentOverrides);
  const json = JSON.stringify(theme, null, 2);

  const existing = container.querySelector('.export-import-panel');
  if (existing) { existing.remove(); return; }

  const panel = document.createElement('div');
  panel.className = 'export-import-panel';
  panel.style.cssText = 'margin-bottom: 8px;';

  const label = document.createElement('div');
  label.style.cssText = 'font-size: 11px; font-weight: 600; margin-bottom: 4px; color: var(--dt-text-bright);';
  label.textContent = 'Exported Theme (DeepPartial<PersonaTheme>)';

  const textarea = document.createElement('textarea');
  textarea.className = 'theme-textarea';
  textarea.value = json;
  textarea.readOnly = true;
  textarea.style.minHeight = '120px';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn btn-sm';
  copyBtn.textContent = 'Copy to Clipboard';
  copyBtn.style.marginTop = '4px';
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(json);
    copyBtn.textContent = 'Copied!';
    setTimeout(() => { copyBtn.textContent = 'Copy to Clipboard'; }, 1500);
  });

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn btn-sm';
  closeBtn.textContent = 'Close';
  closeBtn.style.cssText = 'margin-top: 4px; margin-left: 4px;';
  closeBtn.addEventListener('click', () => panel.remove());

  panel.append(label, textarea, copyBtn, closeBtn);
  container.insertBefore(panel, container.querySelector('.section'));
}

function showImport() {
  const existing = container.querySelector('.export-import-panel');
  if (existing) { existing.remove(); return; }

  const panel = document.createElement('div');
  panel.className = 'export-import-panel';
  panel.style.cssText = 'margin-bottom: 8px;';

  const label = document.createElement('div');
  label.style.cssText = 'font-size: 11px; font-weight: 600; margin-bottom: 4px; color: var(--dt-text-bright);';
  label.textContent = 'Import CSS Variables (JSON: { "--persona-primary": "#ff0000", ... })';

  const textarea = document.createElement('textarea');
  textarea.className = 'theme-textarea';
  textarea.placeholder = '{\n  "--persona-primary": "#ff0000",\n  "--persona-header-bg": "#ffffff"\n}';
  textarea.style.minHeight = '100px';

  const applyBtn = document.createElement('button');
  applyBtn.className = 'btn btn-sm btn-primary';
  applyBtn.textContent = 'Apply';
  applyBtn.style.marginTop = '4px';
  applyBtn.addEventListener('click', () => {
    try {
      const vars = JSON.parse(textarea.value);
      sendCommand('IMPORT_THEME', { vars, instanceId: getSelectedInstance() });
      Object.assign(currentOverrides, vars);
      Object.assign(currentVars, vars);
      // Update editor rows
      for (const [varName, value] of Object.entries(vars)) {
        editorRows[varName]?.update(value, true);
      }
      panel.remove();
    } catch (e) {
      textarea.style.borderColor = 'var(--dt-red)';
      setTimeout(() => { textarea.style.borderColor = ''; }, 2000);
    }
  });

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn btn-sm';
  closeBtn.textContent = 'Close';
  closeBtn.style.cssText = 'margin-top: 4px; margin-left: 4px;';
  closeBtn.addEventListener('click', () => panel.remove());

  panel.append(label, textarea, applyBtn, closeBtn);
  container.insertBefore(panel, container.querySelector('.section'));
}

// ── Data Fetching ──

function requestCssVars() {
  sendCommand('GET_CSS_VARS', { instanceId: getSelectedInstance() });
}

// ── Tab Handler ──

registerTab('theme', {
  onMessage(msg) {
    if (msg.type === 'CSS_VARS' && msg.data) {
      currentVars = msg.data.vars || {};
      currentOverrides = msg.data.overrides || {};

      // Update or build editor rows
      if (Object.keys(editorRows).length === 0) {
        buildUI();
      } else {
        for (const [varName, editor] of Object.entries(editorRows)) {
          const isOver = varName in currentOverrides;
          const val = isOver ? currentOverrides[varName] : (currentVars[varName] || '');
          editor.update(val, isOver);
        }
      }
    }
  },
  onActivate() {
    if (Object.keys(editorRows).length === 0) {
      buildUI();
    }
    requestCssVars();
  },
  onDeactivate() {},
});

export function init() {
  // Initial placeholder
  container.innerHTML = '<div class="tab-empty"><p>Loading theme variables...</p></div>';
}
