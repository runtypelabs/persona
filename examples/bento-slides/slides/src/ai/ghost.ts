// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento/Suite authors
// The blank-canvas door: an empty slide shows a dimmed ghost line (the same
// idiom as layout placeholder prompts — visible while editing, never part of
// the document). Clicking it, or pressing "/", opens the ⌘K palette where
// free text falls through to the Copilot scoped to this slide.

import { t } from '../i18n'
import type { AiContext } from './tools'
import type { Palette } from './palette'

export function createGhostPrompt(ctx: AiContext, palette: Palette): { destroy(): void } {
  const ghost = document.createElement('div')
  ghost.className = 'ed-ai-ghost'
  ghost.innerHTML = `<span>✨ ${t('Describe this slide — or press /')}</span>`
  ghost.addEventListener('click', () => palette.open())
  document.body.appendChild(ghost)

  const sync = () => {
    const empty = ctx.store.slide.elements.length === 0
    if (!empty || ctx.editor.isPresenting) {
      ghost.classList.remove('on')
      return
    }
    const stage = document.querySelector('.ed-stage-scale')
    if (!stage) return ghost.classList.remove('on')
    const r = stage.getBoundingClientRect()
    ghost.style.left = `${r.left + r.width / 2}px`
    ghost.style.top = `${r.top + r.height / 2}px`
    ghost.classList.add('on')
  }
  const schedule = () => requestAnimationFrame(sync)

  const offs = [
    ctx.store.on('doc', schedule),
    ctx.store.on('current', schedule),
    ctx.store.on('slides', schedule),
  ]
  const onScroll = () => schedule()
  document.addEventListener('scroll', onScroll, true)
  window.addEventListener('resize', onScroll)

  const onKey = (ev: KeyboardEvent) => {
    if (ev.key !== '/' || ev.metaKey || ev.ctrlKey || ev.shiftKey) return
    const a = document.activeElement as HTMLElement | null
    if (a && (a.isContentEditable || a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return
    if (ctx.editor.isPresenting || palette.isOpen()) return
    if (ctx.store.slide.elements.length !== 0) return
    ev.preventDefault()
    palette.open()
  }
  document.addEventListener('keydown', onKey)

  schedule()
  return {
    destroy() {
      offs.forEach((off) => off())
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
      document.removeEventListener('keydown', onKey)
      ghost.remove()
    },
  }
}
