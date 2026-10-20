// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento/Suite authors
// ⌘K — one palette for the whole product. Native commands rank first (built
// per-open by editor.paletteCommands(), so labels follow the locale); free
// text that matches nothing falls through to the Copilot, scoped to the
// current selection or slide. Chat becomes the fallback, not the front door.

import { t } from '../i18n'
import type { AiContext } from './tools'
import type { TurnManager } from './quiet'

export interface Palette {
  open(prefill?: string): void
  close(): void
  isOpen(): boolean
  destroy(): void
}

interface Row {
  el: HTMLElement
  run: () => void
}

export function createPalette(
  ctx: AiContext,
  turns: TurnManager,
  extras: () => Array<{ id: string; label: string; hint?: string; run: () => void }> = () => [],
): Palette {
  const scrim = document.createElement('div')
  scrim.className = 'ed-ai-palette-scrim'
  const box = document.createElement('div')
  box.className = 'ed-ai-palette'
  const input = document.createElement('input')
  input.className = 'ed-ai-palette-input'
  input.placeholder = t('Type a command — or just say what you want…')
  input.spellcheck = false
  const list = document.createElement('div')
  list.className = 'ed-ai-palette-list'
  box.append(input, list)
  scrim.appendChild(box)
  document.body.appendChild(scrim)

  let rows: Row[] = []
  let active = 0

  const close = () => {
    scrim.classList.remove('on')
    input.value = ''
  }

  const setActive = (i: number) => {
    active = Math.max(0, Math.min(i, rows.length - 1))
    rows.forEach((r, k) => r.el.classList.toggle('on', k === active))
    rows[active]?.el.scrollIntoView({ block: 'nearest' })
  }

  const aiRow = (query: string): Row => {
    const el = document.createElement('div')
    el.className = 'ed-ai-palette-row ed-ai-palette-ai'
    const scope = ctx.store.selection.length
      ? t('acts on the selection')
      : t('acts on slide {n}', { n: String(ctx.store.currentIndex + 1) })
    el.innerHTML = `<b>✨ ${t('Ask Copilot')}</b><span> — ${scope}</span><kbd>↩</kbd>`
    const run = () => {
      const q = query.trim()
      if (!q) return
      close()
      const sel = ctx.store.selectedElements
      const slideId = ctx.store.slide.id
      const scopeNote = sel.length
        ? `(Scope: the user's selection — element(s) [${sel.map((e) => `"${e.id}"`).join(', ')}] on slide "${slideId}". Pass slideId when editing them.)`
        : `(Scope: the slide open in the editor, id "${slideId}".)`
      turns.ask(`${q}\n\n${scopeNote}`, { quiet: true, source: 'palette' })
    }
    el.addEventListener('click', run)
    return { el, run }
  }

  const rebuild = () => {
    const q = input.value.trim().toLowerCase()
    list.innerHTML = ''
    rows = []
    const commands = [...ctx.editor.paletteCommands(), ...extras()]
    const matches = q
      ? commands.filter((c) => c.label.toLowerCase().includes(q))
      : commands
    for (const c of matches.slice(0, 9)) {
      const el = document.createElement('div')
      el.className = 'ed-ai-palette-row'
      el.innerHTML = `<span>${c.label}</span>${c.hint ? `<i>${c.hint}</i>` : ''}`
      const run = () => {
        close()
        c.run()
      }
      el.addEventListener('click', run)
      list.appendChild(el)
      rows.push({ el, run })
    }
    if (q) {
      const row = aiRow(input.value)
      // free text leads when nothing matches; trails as an option otherwise
      if (rows.length === 0) list.prepend(row.el)
      else list.appendChild(row.el)
      if (rows.length === 0) rows.unshift(row)
      else rows.push(row)
    }
    setActive(q && matches.length === 0 ? 0 : 0)
  }

  input.addEventListener('input', rebuild)
  input.addEventListener('keydown', (ev) => {
    ev.stopPropagation()
    if (ev.key === 'Escape') close()
    else if (ev.key === 'ArrowDown') { ev.preventDefault(); setActive(active + 1) }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); setActive(active - 1) }
    else if (ev.key === 'Enter') { ev.preventDefault(); rows[active]?.run() }
  })
  scrim.addEventListener('pointerdown', (ev) => {
    if (ev.target === scrim) close()
  })

  return {
    open(prefill = '') {
      if (ctx.editor.isPresenting) return
      scrim.classList.add('on')
      input.value = prefill
      rebuild()
      input.focus()
      if (prefill) input.select()
    },
    close,
    isOpen: () => scrim.classList.contains('on'),
    destroy: () => scrim.remove(),
  }
}
