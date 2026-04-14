/**
 * Collapsible JSON tree viewer component.
 *
 * Usage:
 *   const tree = renderJsonTree(data);
 *   container.appendChild(tree);
 */

/**
 * Render a JSON value as a collapsible tree.
 * @param {unknown} data - The data to render
 * @param {string} [rootKey] - Optional root key label
 * @param {number} [depth=0] - Current nesting depth (auto-collapse beyond 2)
 * @returns {HTMLElement}
 */
export function renderJsonTree(data, rootKey, depth = 0) {
  if (data === null) return renderPrimitive('null', 'json-null');
  if (data === undefined) return renderPrimitive('undefined', 'json-null');

  const type = typeof data;

  if (type === 'string') return renderPrimitive(`"${escapeHtml(data)}"`, 'json-string');
  if (type === 'number') return renderPrimitive(String(data), 'json-number');
  if (type === 'boolean') return renderPrimitive(String(data), 'json-boolean');

  if (Array.isArray(data)) return renderContainer(data, true, rootKey, depth);
  if (type === 'object') return renderContainer(data, false, rootKey, depth);

  return renderPrimitive(String(data), 'json-string');
}

function renderPrimitive(text, className) {
  const span = document.createElement('span');
  span.className = className;
  span.innerHTML = text;
  return span;
}

function renderContainer(data, isArray, key, depth) {
  const isAr = isArray;
  const entries = isAr ? data.map((v, i) => [String(i), v]) : Object.entries(data);
  const empty = entries.length === 0;
  const collapsed = depth > 1;

  const wrap = document.createElement('div');
  wrap.className = 'json-tree';

  // Toggle + opening bracket
  const header = document.createElement('span');

  if (!empty) {
    const toggle = document.createElement('span');
    toggle.className = 'json-toggle';
    toggle.textContent = collapsed ? '\u25B6' : '\u25BC';
    header.appendChild(toggle);

    toggle.addEventListener('click', () => {
      const children = wrap.querySelector('.json-children');
      const isClosed = children.classList.toggle('collapsed');
      toggle.textContent = isClosed ? '\u25B6' : '\u25BC';
    });
  }

  const bracket = document.createElement('span');
  bracket.style.color = 'var(--dt-text-muted)';
  bracket.textContent = isAr
    ? `Array(${entries.length}) [`
    : `{${empty ? '}' : ''}`;

  if (empty && isAr) bracket.textContent = '[]';
  header.appendChild(bracket);
  wrap.appendChild(header);

  if (!empty) {
    const children = document.createElement('div');
    children.className = 'json-children' + (collapsed ? ' collapsed' : '');

    for (const [k, v] of entries) {
      const row = document.createElement('div');
      const keySpan = document.createElement('span');
      keySpan.className = 'json-key';
      keySpan.textContent = isAr ? `${k}: ` : `"${k}": `;
      row.appendChild(keySpan);

      const valueEl = renderJsonTree(v, k, depth + 1);
      row.appendChild(valueEl);
      children.appendChild(row);
    }

    wrap.appendChild(children);

    const close = document.createElement('span');
    close.style.color = 'var(--dt-text-muted)';
    close.textContent = isAr ? ']' : '}';
    wrap.appendChild(close);
  }

  return wrap;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
