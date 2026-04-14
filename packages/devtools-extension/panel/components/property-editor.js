/**
 * Property editor row — renders a single CSS variable with appropriate control
 * (color picker, text input, or slider) based on value heuristics.
 */

import { createColorPicker } from './color-picker.js';
import { looksLikeColor, looksLikeLength } from '../../shared/css-var-map.js';

/**
 * @param {object} opts
 * @param {string} opts.varName - CSS variable name (e.g. '--persona-primary')
 * @param {string} opts.value - Current resolved value
 * @param {boolean} opts.isOverridden - Whether this var has an inline override
 * @param {(varName: string, value: string) => void} opts.onChange
 * @param {(varName: string) => void} opts.onReset
 * @returns {{ el: HTMLElement, update: (value: string, isOverridden: boolean) => void }}
 */
export function createPropertyEditor({ varName, value, isOverridden, onChange, onReset }) {
  const row = document.createElement('div');
  row.className = 'prop-row' + (isOverridden ? ' overridden' : '');

  // Variable name
  const nameEl = document.createElement('span');
  nameEl.className = 'prop-name';
  nameEl.textContent = varName.replace(/^--persona-/, '');
  nameEl.title = varName;

  // Value editor
  let valueEl;
  let setValueFn;

  if (looksLikeColor(value)) {
    const picker = createColorPicker(value, (v) => onChange(varName, v));
    valueEl = picker.el;
    setValueFn = (v) => picker.setValue(v);
  } else {
    valueEl = document.createElement('span');
    valueEl.className = 'prop-value';
    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.value = value;
    textInput.spellcheck = false;
    textInput.addEventListener('change', () => onChange(varName, textInput.value.trim()));
    textInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') textInput.blur();
    });
    valueEl.appendChild(textInput);
    setValueFn = (v) => { textInput.value = v; };
  }

  // Reset button
  const resetBtn = document.createElement('button');
  resetBtn.className = 'prop-reset';
  resetBtn.innerHTML = '&#x2715;';
  resetBtn.title = 'Reset to default';
  resetBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    onReset(varName);
  });

  row.appendChild(nameEl);
  row.appendChild(valueEl);
  row.appendChild(resetBtn);

  return {
    el: row,
    update(newValue, newOverridden) {
      setValueFn(newValue);
      row.classList.toggle('overridden', newOverridden);
    },
  };
}
