/** Preview Transcript Builder — simple menu dropdown in the preview toolbar trail. */

import * as state from './state';
import {
  getPreviewTranscriptPresetLabel,
  type PreviewTranscriptEntryPreset,
} from '@runtypelabs/persona/theme-editor';

const PREVIEW_TRANSCRIPT_PRESETS: PreviewTranscriptEntryPreset[] = [
  'user-message',
  'assistant-message',
  'assistant-code-block',
  'assistant-markdown-table',
  'assistant-image',
  'reasoning-streaming',
  'reasoning-complete',
  'tool-running',
  'tool-complete',
];

function buildMenu(
  dropdown: HTMLElement,
  onAdd: (preset: PreviewTranscriptEntryPreset) => void,
  onClear: () => void
): { clearBtn: HTMLButtonElement } {
  dropdown.innerHTML = '';

  const menu = document.createElement('div');
  menu.className = 'preview-transcript-menu';

  PREVIEW_TRANSCRIPT_PRESETS.forEach((preset) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'preview-transcript-menu-item';
    item.setAttribute('role', 'menuitem');
    item.textContent = getPreviewTranscriptPresetLabel(preset);
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      onAdd(preset);
    });
    menu.appendChild(item);
  });

  const separator = document.createElement('div');
  separator.className = 'preview-transcript-menu-separator';
  separator.setAttribute('role', 'separator');
  menu.appendChild(separator);

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'preview-transcript-menu-item preview-transcript-menu-item-danger';
  clearBtn.setAttribute('role', 'menuitem');
  clearBtn.textContent = 'Clear all';
  clearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClear();
  });
  menu.appendChild(clearBtn);

  dropdown.appendChild(menu);
  return { clearBtn };
}

function syncClearState(clearBtn: HTMLButtonElement, countBadge: HTMLElement | null): void {
  const entries = state.getPreviewTranscriptEntries();
  clearBtn.disabled = entries.length === 0;

  if (countBadge) {
    countBadge.classList.toggle('has-entries', entries.length > 0);
    countBadge.textContent = entries.length > 0 ? String(entries.length) : '';
  }
}

export function initPreviewTranscriptToolbar(): void {
  const trigger = document.getElementById('preview-transcript-btn');
  const dropdown = document.getElementById('preview-transcript-dropdown');
  const countBadge = document.getElementById('preview-transcript-count');

  if (!trigger || !dropdown) return;

  let open = false;
  const sync = (): void => {
    trigger.classList.toggle('open', open);
    dropdown.classList.toggle('hidden', !open);
  };

  const close = (): void => {
    if (!open) return;
    open = false;
    sync();
  };

  const { clearBtn } = buildMenu(
    dropdown,
    (preset) => {
      state.addPreviewTranscriptEntry(preset);
      syncClearState(clearBtn, countBadge);
      close();
    },
    () => {
      state.clearPreviewTranscriptEntries();
      syncClearState(clearBtn, countBadge);
      close();
    }
  );

  syncClearState(clearBtn, countBadge);

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    open = !open;
    if (open) {
      const otherPill = document.getElementById('preview-pill-btn');
      const otherDropdown = document.getElementById('preview-pill-dropdown');
      if (otherPill?.classList.contains('open')) {
        otherPill.classList.remove('open');
        otherDropdown?.classList.add('hidden');
      }
    }
    sync();
  });

  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (!target.closest('.preview-transcript-wrapper')) {
      close();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  state.onChange(() => syncClearState(clearBtn, countBadge));
}
