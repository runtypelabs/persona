// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento/Suite authors
// The fast door: a Firefly-style action bar anchored to the current selection.
// One-shot verbs matched to the element type run as QUIET turns (the rail
// stays closed; the canvas + a toast carry the result), plus an inline "Ask…"
// input scoped to the selection. Deterministic work (align/distribute) stays
// in the Arrange panel — this bar only carries verbs that need judgment.

import { t } from '../i18n'
import type { AiContext } from './tools'
import type { TurnManager } from './quiet'
import type { SlideElement } from '../model'

interface Verb {
  label: string
  prompt: (ids: string[], slideId: string) => string
}

const idList = (ids: string[]) => ids.map((id) => `"${id}"`).join(', ')

const TEXT_VERBS: Verb[] = [
  {
    label: 'Tighten',
    prompt: (ids, slideId) =>
      `Tighten the copy in text element(s) [${idList(ids)}] on slide "${slideId}" — keep the meaning, cut filler, keep roughly the same visual length. Use update_elements with slideId "${slideId}".`,
  },
  {
    label: 'Expand',
    prompt: (ids, slideId) =>
      `Expand the copy in text element(s) [${idList(ids)}] on slide "${slideId}" with one more concrete, useful sentence each. Use update_elements with slideId "${slideId}".`,
  },
  {
    label: 'Fix tone',
    prompt: (ids, slideId) =>
      `Rewrite text element(s) [${idList(ids)}] on slide "${slideId}" in a confident, plain-spoken tone consistent with the rest of the deck (read nearby slides first). Use update_elements with slideId "${slideId}".`,
  },
]

const CHART_VERBS: Verb[] = [
  {
    label: 'Restyle',
    prompt: (ids, slideId) =>
      `Restyle chart [${idList(ids)}] on slide "${slideId}" to look cleaner and match the deck theme (read get_slide first; edit via update_elements option).`,
  },
  {
    label: 'Switch type',
    prompt: (ids, slideId) =>
      `Switch chart [${idList(ids)}] on slide "${slideId}" to the chart type that best fits its data (bar/line/pie/scatter) — read it with get_slide first, then update_elements.`,
  },
  {
    label: 'Headline it',
    prompt: (ids, slideId) =>
      `Read chart [${idList(ids)}] on slide "${slideId}" and add ONE short headline text element above it stating the key takeaway in plain words.`,
  },
]

const TABLE_VERBS: Verb[] = [
  {
    label: 'To chart',
    prompt: (ids, slideId) =>
      `Turn table [${idList(ids)}] on slide "${slideId}" into the most fitting chart (keep the table or replace it — your call, say which you chose).`,
  },
  {
    label: 'Summarize',
    prompt: (ids, slideId) =>
      `Read table [${idList(ids)}] on slide "${slideId}" and add one short text element summarizing its key point.`,
  },
]

const MULTI_VERBS: Verb[] = [
  {
    label: 'Tidy layout',
    prompt: (ids, slideId) =>
      `Tidy the layout of elements [${idList(ids)}] on slide "${slideId}": align, space evenly, and size for clear hierarchy. Keep 96px side margins. Use align_elements / update_elements with slideId "${slideId}".`,
  },
  {
    label: 'Morph step',
    prompt: (ids, slideId) =>
      `Create a morph build from slide "${slideId}": duplicate_slide it, then on the COPY emphasize elements [${idList(ids)}] (reposition/scale/recolor them meaningfully) and set the copy's transition to "morph". Remember the copy shares element ids — pass the copy's slideId to update_elements.`,
  },
]

function verbsFor(els: SlideElement[]): Verb[] {
  if (!els.length) return []
  const types = new Set(els.map((e) => e.type))
  if (types.size === 1) {
    const type = els[0].type
    if (type === 'text') return els.length > 1 ? [TEXT_VERBS[0], TEXT_VERBS[2], MULTI_VERBS[0]] : TEXT_VERBS
    if (type === 'chart') return CHART_VERBS
    if (type === 'table') return TABLE_VERBS
  }
  return els.length >= 2 ? MULTI_VERBS : [MULTI_VERBS[1]]
}

export function createSelectionBar(ctx: AiContext, turns: TurnManager): { destroy(): void } {
  const bar = document.createElement('div')
  bar.className = 'ed-ai-selbar'
  document.body.appendChild(bar)

  let askOpen = false

  const hide = () => {
    bar.classList.remove('on')
    askOpen = false
  }

  const textEditing = () => {
    const a = document.activeElement as HTMLElement | null
    return !!a && (a.isContentEditable || a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')
  }

  const selectionRect = (): DOMRect | null => {
    const ids = ctx.store.selection
    if (!ids.length) return null
    let rect: DOMRect | null = null
    for (const id of ids) {
      const node = document.querySelector(`.ed-stage-scale [data-el-id="${CSS.escape(id)}"]`)
      if (!node) continue
      const r = node.getBoundingClientRect()
      rect = rect
        ? new DOMRect(
            Math.min(rect.x, r.x),
            Math.min(rect.y, r.y),
            Math.max(rect.right, r.right) - Math.min(rect.x, r.x),
            Math.max(rect.bottom, r.bottom) - Math.min(rect.y, r.y),
          )
        : r
    }
    return rect
  }

  const rebuild = () => {
    const els = ctx.store.selectedElements
    if (!els.length || ctx.editor.isPresenting || textEditing()) return hide()
    const rect = selectionRect()
    if (!rect) return hide()

    bar.innerHTML = ''
    const spark = document.createElement('span')
    spark.className = 'ed-ai-selbar-spark'
    spark.textContent = '✨'
    bar.appendChild(spark)

    const slideId = ctx.store.slide.id
    const ids = els.map((e) => e.id)
    for (const verb of verbsFor(els)) {
      const b = document.createElement('button')
      b.textContent = t(verb.label)
      b.addEventListener('click', () => {
        turns.ask(verb.prompt(ids, slideId), { quiet: true, source: 'selection' })
        hide()
      })
      bar.appendChild(b)
    }

    if (!askOpen) {
      const ask = document.createElement('button')
      ask.className = 'ed-ai-selbar-ask'
      ask.textContent = t('Ask…')
      ask.addEventListener('click', () => {
        askOpen = true
        rebuild()
      })
      bar.appendChild(ask)
    } else {
      const input = document.createElement('input')
      input.className = 'ed-ai-selbar-input'
      input.placeholder = t('What should the Copilot do with this?')
      input.addEventListener('keydown', (ev) => {
        ev.stopPropagation()
        if (ev.key === 'Escape') { askOpen = false; rebuild(); return }
        if (ev.key === 'Enter' && input.value.trim()) {
          const ask = input.value.trim()
          turns.ask(
            `${ask}\n\n(Scope: element(s) [${idList(ids)}] on slide "${slideId}" — the user's current selection. Pass slideId "${slideId}" when editing them.)`,
            { quiet: true, source: 'selection' },
          )
          hide()
        }
      })
      bar.appendChild(input)
      queueMicrotask(() => input.focus())
    }

    // place below the selection; flip above when it would clip the viewport
    const barH = 40
    let top = rect.bottom + 10
    if (top + barH > window.innerHeight - 12) top = rect.top - barH - 10
    bar.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 340))}px`
    bar.style.top = `${top}px`
    bar.classList.add('on')
  }

  const schedule = () => requestAnimationFrame(rebuild)
  const offs = [
    ctx.store.on('selection', () => { askOpen = false; schedule() }),
    ctx.store.on('current', () => { askOpen = false; schedule() }),
    ctx.store.on('doc', schedule),
  ]
  const onScroll = () => schedule()
  document.addEventListener('scroll', onScroll, true)
  window.addEventListener('resize', onScroll)

  return {
    destroy() {
      offs.forEach((off) => off())
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
      bar.remove()
    },
  }
}
