// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento/Suite authors
// Turn choreography. Chat is one door among several — the selection bar, the
// ⌘K palette, comments and the ghost prompt all submit turns WITHOUT opening
// the rail ("quiet turns"). This module makes every turn legible on canvas:
//   · a working pill (with Stop) while the agent streams
//   · a peach provenance shimmer on the elements the turn touched
//   · a toast summary for quiet edits; the rail opens itself only when the
//     agent answered in prose (nothing to show on canvas) or asked a question
// The journal is fed by tools.ts (setToolActivityListener), so it hears chat
// turns and quiet turns alike.

import { t } from '../i18n'
import { setToolActivityListener, type AiContext, type ToolActivity } from './tools'
import { elementIdsIn, slideIdsIn } from './thumbs'
import { paneIsStreaming, stopStreaming, type PaneController } from './pane'

export interface TurnSummary {
  quiet: boolean
  source: string
  elementIds: string[]
  slideIds: string[]
  tools: string[]
  /** final assistant text (best effort; '' when unavailable) */
  text: string
  /** the turn finished on its own and produced something (an answer or a
   *  tool call) — false when it was stopped or came back empty */
  ok: boolean
}

export interface TurnManager {
  /** submit a prompt; quiet turns leave the rail closed unless needed */
  ask(prompt: string, opts?: { quiet?: boolean; source?: string; onDone?: (s: TurnSummary) => void }): void
  /** re-wire events after the pane remounts (model switch) */
  attach(controller: PaneController): void
  isBusy(): boolean
  /** the chat was cleared mid-turn: end it as stopped (no completion event comes) */
  abandon(): void
}

const MUTATING_PREFIXES = ['add_', 'update_', 'delete_', 'move_', 'set_', 'duplicate_', 'align_']

export function createTurnManager(
  ctx: AiContext,
  host: { openRail(): void; controller(): PaneController | null },
): TurnManager {
  let journal: ToolActivity[] = []
  let busy = false
  let currentQuiet = false
  let currentSource = 'chat'
  let pending: { quiet: boolean; source: string; onDone?: (s: TurnSummary) => void } | null = null
  let onDone: ((s: TurnSummary) => void) | undefined
  let unsubs: Array<() => void> = []
  let stopped = false

  const stop = () => {
    if (busy) stopped = true
    stopStreaming()
  }

  setToolActivityListener((e) => {
    journal.push(e)
  })

  // --- working pill -----------------------------------------------------------
  const pill = document.createElement('div')
  pill.className = 'ed-ai-pill'
  const pillText = document.createElement('span')
  pillText.textContent = t('Copilot is working…')
  const stopB = document.createElement('button')
  stopB.textContent = t('Stop')
  stopB.title = 'Esc'
  stopB.addEventListener('click', () => stop())
  pill.append(pillText, stopB)
  document.body.appendChild(pill)

  const setBusy = (on: boolean) => {
    busy = on
    pill.classList.toggle('on', on)
  }

  // canvas-wide Esc stops a running turn (Persona's own Esc-to-stop only
  // hears keys inside the pane)
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && busy) stop()
  })

  // --- shimmer + toast ----------------------------------------------------------
  const shimmer = (elementIds: string[]) => {
    for (const id of elementIds) {
      const nodes = document.querySelectorAll(`.ed-stage-scale [data-el-id="${CSS.escape(id)}"]`)
      nodes.forEach((n) => {
        n.classList.add('ed-ai-touched')
        setTimeout(() => n.classList.remove('ed-ai-touched'), 1900)
      })
    }
  }

  const summarize = (text: string): TurnSummary => {
    const elementIds = elementIdsIn(journal.map((j) => j.data))
    const slideIds = slideIdsIn(journal.map((j) => j.data))
    const tools = journal.map((j) => j.tool)
    const ok = !stopped && (text.trim().length > 0 || tools.length > 0)
    return { quiet: currentQuiet, source: currentSource, elementIds, slideIds, tools, text, ok }
  }

  const edited = (s: TurnSummary) =>
    s.tools.some((name) => MUTATING_PREFIXES.some((p) => name.startsWith(p)))

  const toastFor = (s: TurnSummary) => {
    const slides = s.tools.filter((x) => x === 'add_slide' || x === 'duplicate_slide').length
    const parts: string[] = []
    if (slides) parts.push(t('{n} slide(s)', { n: String(slides) }))
    if (s.elementIds.length) parts.push(t('{n} element(s)', { n: String(s.elementIds.length) }))
    const what = parts.length ? parts.join(' · ') : t('done')
    ctx.editor.toast(t('✨ Copilot: {what} — ⌘Z undoes', { what }))
  }

  const endTurn = (text: string) => {
    if (!busy) return
    setBusy(false)
    const s = summarize(text)
    shimmer(s.elementIds)
    if (s.quiet) {
      if (edited(s)) toastFor(s)
      else host.openRail() // the answer is prose — show it
    }
    const cb = onDone
    onDone = undefined
    journal = []
    currentQuiet = false
    currentSource = 'chat'
    cb?.(s)
  }

  // assistant:complete fires per message SEGMENT (reasoning, each tool, each
  // text block). The turn is only over when the stream flag drops — poll it
  // briefly after each candidate end, re-arming while segments keep coming.
  let endTimer = 0
  let lastText = ''
  const scheduleEnd = () => {
    clearTimeout(endTimer)
    endTimer = window.setTimeout(() => {
      if (!busy) return
      if (paneIsStreaming()) scheduleEnd()
      else endTurn(lastText)
    }, 700)
  }

  const attach = (controller: PaneController) => {
    unsubs.forEach((u) => u())
    unsubs = []
    unsubs.push(
      controller.on('user:message', () => {
        clearTimeout(endTimer)
        const asked = pending !== null
        journal = []
        lastText = ''
        stopped = false
        currentQuiet = pending?.quiet ?? false
        currentSource = pending?.source ?? 'chat'
        onDone = pending?.onDone
        pending = null
        setBusy(true)
        // a submitted turn streams at once, and one that fails before
        // streaming never fires assistant:complete, so poll the stream flag
        // from the start. Not for voice: the first partial transcript is a
        // user message long before its spoken request is sent.
        if (asked) scheduleEnd()
      }),
      controller.on('assistant:complete', (payload) => {
        const text =
          payload && typeof payload === 'object' && 'content' in (payload as object)
            ? String((payload as { content?: unknown }).content ?? '')
            : ''
        if (text.trim()) lastText = text
        scheduleEnd()
      }),
    )
  }

  return {
    ask(prompt, opts = {}) {
      const controller = host.controller()
      if (!controller) return
      if (busy) {
        ctx.editor.toast(t('The Copilot is still working — one thing at a time.'))
        return
      }
      pending = { quiet: opts.quiet ?? true, source: opts.source ?? 'action', onDone: opts.onDone }
      controller.submitMessage(prompt)
    },
    attach,
    isBusy: () => busy,
    abandon() {
      if (!busy) return
      clearTimeout(endTimer)
      stopped = true
      endTurn(lastText)
    },
  }
}
