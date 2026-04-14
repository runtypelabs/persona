/**
 * Reusable search + filter bar component.
 *
 * Usage:
 *   const bar = createSearchBar({ onSearch, onFilterChange, filterOptions });
 *   container.appendChild(bar.el);
 */

/**
 * @param {object} opts
 * @param {(query: string) => void} opts.onSearch
 * @param {(filter: string) => void} [opts.onFilterChange]
 * @param {{ value: string, label: string }[]} [opts.filterOptions]
 * @param {string} [opts.placeholder]
 * @returns {{ el: HTMLElement, updateFilters: (options: {value:string,label:string}[]) => void }}
 */
export function createSearchBar({ onSearch, onFilterChange, filterOptions, placeholder }) {
  const bar = document.createElement('div');
  bar.className = 'toolbar';

  const searchInput = document.createElement('input');
  searchInput.className = 'search-input';
  searchInput.placeholder = placeholder || 'Search...';
  searchInput.addEventListener('input', () => onSearch(searchInput.value));

  bar.appendChild(searchInput);

  let selectEl = null;
  if (onFilterChange) {
    selectEl = document.createElement('select');
    selectEl.className = 'filter-select';
    populateSelect(selectEl, filterOptions || []);
    selectEl.addEventListener('change', () => onFilterChange(selectEl.value));
    bar.appendChild(selectEl);
  }

  return {
    el: bar,
    updateFilters(options) {
      if (selectEl) {
        const current = selectEl.value;
        populateSelect(selectEl, options);
        // Restore selection if still valid
        if ([...selectEl.options].some((o) => o.value === current)) {
          selectEl.value = current;
        }
      }
    },
  };
}

function populateSelect(select, options) {
  select.innerHTML = '';
  const allOpt = document.createElement('option');
  allOpt.value = '';
  allOpt.textContent = 'All types';
  select.appendChild(allOpt);

  for (const opt of options) {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    select.appendChild(o);
  }
}
