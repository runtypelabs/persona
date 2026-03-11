/** Field search with self-registration */

import type { FieldDef, ControlResult, SearchEntry } from './types';

// ─── Search index ──────────────────────────────────────────────────

const searchIndex: SearchEntry[] = [];
let currentTabId: string = '';
let currentSectionId: string = '';

/** Set the current tab/section context for registration */
export function setSearchContext(tabId: string, sectionId: string): void {
  currentTabId = tabId;
  currentSectionId = sectionId;
}

/** Register a field for search. Called automatically by control factories. */
export function registerSearchEntry(field: FieldDef, control: ControlResult): void {
  searchIndex.push({
    fieldId: field.id,
    label: field.label,
    description: field.description ?? '',
    keywords: buildKeywords(field),
    tabId: currentTabId,
    sectionId: currentSectionId,
    element: control.element,
    control,
  });
}

function buildKeywords(field: FieldDef): string[] {
  const words: string[] = [];

  // Add label words
  words.push(...field.label.toLowerCase().split(/\s+/));

  // Add description words
  if (field.description) {
    words.push(...field.description.toLowerCase().split(/\s+/));
  }

  // Add path segments
  words.push(...field.path.split('.').map(s => s.toLowerCase()));

  // Add type
  words.push(field.type);

  // Add field id
  words.push(field.id.toLowerCase());

  return [...new Set(words)];
}

// ─── Search functionality ─────────────────────────────────────────

export interface SearchResult {
  entry: SearchEntry;
  score: number;
}

export function search(query: string): SearchResult[] {
  if (!query.trim()) return [];

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const results: SearchResult[] = [];

  for (const entry of searchIndex) {
    let score = 0;

    for (const term of terms) {
      // Exact label match
      if (entry.label.toLowerCase().includes(term)) {
        score += 10;
      }

      // Keyword match
      for (const keyword of entry.keywords) {
        if (keyword.includes(term)) {
          score += 5;
        }
        if (keyword === term) {
          score += 3; // Bonus for exact keyword match
        }
      }

      // Description match
      if (entry.description.toLowerCase().includes(term)) {
        score += 2;
      }
    }

    if (score > 0) {
      results.push({ entry, score });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results;
}

// ─── Search UI ────────────────────────────────────────────────────

let searchInput: HTMLInputElement | null = null;
let clearButton: HTMLButtonElement | null = null;
let resultsContainer: HTMLElement | null = null;
let onNavigate: ((tabId: string, sectionId: string, fieldId: string) => void) | null = null;

export function initSearchUI(
  navigateCallback: (tabId: string, sectionId: string, fieldId: string) => void
): void {
  searchInput = document.getElementById('field-search') as HTMLInputElement;
  clearButton = document.getElementById('clear-search') as HTMLButtonElement;
  resultsContainer = document.getElementById('search-results');
  onNavigate = navigateCallback;

  if (!searchInput || !clearButton || !resultsContainer) {
    console.warn('Search elements not found');
    return;
  }

  searchInput.addEventListener('input', handleSearchInput);
  clearButton.addEventListener('click', clearSearch);

  // Keyboard shortcut: Cmd/Ctrl + K
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      searchInput?.focus();
    }
  });
}

function handleSearchInput(): void {
  if (!searchInput || !resultsContainer || !clearButton) return;

  const query = searchInput.value.trim();
  clearButton.style.display = query ? 'block' : 'none';

  if (!query) {
    resultsContainer.innerHTML = '';
    resultsContainer.classList.add('hidden');
    return;
  }

  const results = search(query);
  displayResults(results);
}

function displayResults(results: SearchResult[]): void {
  if (!resultsContainer) return;

  resultsContainer.innerHTML = '';

  if (results.length === 0) {
    resultsContainer.innerHTML = '<div class="search-no-results">No fields found</div>';
    resultsContainer.classList.remove('hidden');
    return;
  }

  // Limit to 20 results
  const limited = results.slice(0, 20);

  for (const { entry } of limited) {
    const item = document.createElement('button');
    item.className = 'search-result-item';
    item.type = 'button';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'search-result-label';
    labelSpan.textContent = entry.label;

    const pathSpan = document.createElement('span');
    pathSpan.className = 'search-result-path';
    pathSpan.textContent = `${entry.tabId} → ${entry.sectionId}`;

    item.appendChild(labelSpan);
    item.appendChild(pathSpan);

    item.addEventListener('click', () => {
      navigateToField(entry);
    });

    resultsContainer.appendChild(item);
  }

  resultsContainer.classList.remove('hidden');
}

function navigateToField(entry: SearchEntry): void {
  if (onNavigate) {
    onNavigate(entry.tabId, entry.sectionId, entry.fieldId);
  }

  // Scroll the field into view and highlight
  entry.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  entry.element.classList.add('field-highlight');
  setTimeout(() => {
    entry.element.classList.remove('field-highlight');
  }, 2000);

  clearSearch();
}

function clearSearch(): void {
  if (searchInput) searchInput.value = '';
  if (clearButton) clearButton.style.display = 'none';
  if (resultsContainer) {
    resultsContainer.innerHTML = '';
    resultsContainer.classList.add('hidden');
  }
}

/** Get the full search index (for debugging) */
export function getSearchIndex(): SearchEntry[] {
  return searchIndex;
}
