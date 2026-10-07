// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento/Suite authors
// The async door: @copilot inside a review comment turns the thread into a
// work order. The agent does the work AT THE THREAD'S ANCHOR (element, point
// or slide), then replies in-thread with what changed — reviewable, undoable,
// and anchored where the feedback already lives. "Fix everything flagged"
// runs the whole unresolved queue in one turn.

import { t } from '../i18n'
import { uid, type Comment, type Slide } from '../model'
import type { AiContext } from './tools'
import type { TurnManager } from './quiet'

export const COPILOT_AUTHOR = 'Copilot'
const MENTION = /@copilot/i

interface Pending {
  slide: Slide
  thread: Comment
  ask: string
}

function anchorDesc(thread: Comment): string {
  if (thread.elementId) return `anchored to element "${thread.elementId}"`
  if (typeof thread.x === 'number' && typeof thread.y === 'number') {
    return `anchored to the point (${Math.round(thread.x)}, ${Math.round(thread.y)})`
  }
  return 'about the slide as a whole'
}

/** The latest @copilot mention with no Copilot reply after it, if any. */
function pendingAsk(thread: Comment): string | null {
  if (thread.resolved) return null
  const seq: Array<{ author: string; text: string }> = [
    { author: thread.author, text: thread.text },
    ...(thread.replies ?? []).map((r) => ({ author: r.author, text: r.text })),
  ]
  let lastMention = -1
  let lastCopilot = -1
  seq.forEach((m, i) => {
    if (MENTION.test(m.text)) lastMention = i
    if (m.author === COPILOT_AUTHOR) lastCopilot = i
  })
  if (lastMention < 0 || lastCopilot >= lastMention) return null
  return seq[lastMention].text
}

export function createCommentsCopilot(
  ctx: AiContext,
  turns: TurnManager,
): { destroy(): void; fixAllFlagged(): void } {
  const inflight = new Set<string>()
  // A mention whose turn was stopped or came back empty is NOT answered, so
  // pendingAsk still sees it; park it here (keyed by its reply count, so a new
  // reply in the thread re-arms it) instead of re-running it on every edit.
  const parked = new Set<string>()
  const parkKey = (thread: Comment) => `${thread.id}:${thread.replies?.length ?? 0}`
  let timer = 0

  const threadContext = (slide: Slide, thread: Comment): string => {
    const pos = ctx.store.doc.slides.filter((s) => !s.stateOf).findIndex((s) => s.id === slide.id) + 1
    const replies = (thread.replies ?? [])
      .map((r) => `  ${r.author}: ${r.text}`)
      .join('\n')
    return (
      `A reviewer comment on slide ${pos || '?'} (id "${slide.id}"), ${anchorDesc(thread)}:\n` +
      `${thread.author}: ${thread.text}${replies ? `\n${replies}` : ''}`
    )
  }

  const reply = (slideId: string, threadId: string, text: string) => {
    const slide = ctx.store.doc.slides.find((s) => s.id === slideId)
    const thread = slide?.comments?.find((c) => c.id === threadId)
    if (!slide || !thread) return
    ctx.store.commit(() => {
      if (!thread.replies) thread.replies = []
      thread.replies.push({ id: uid('cmt'), author: COPILOT_AUTHOR, text, at: new Date().toISOString() })
    }, 'slides')
  }

  const run = (p: Pending) => {
    inflight.add(p.thread.id)
    const slideId = p.slide.id
    const threadId = p.thread.id
    turns.ask(
      `${threadContext(p.slide, p.thread)}\n\n` +
        `Do what the comment asks, using the tools, working on that slide/anchor. ` +
        `When you're done, your final message will be posted into the comment thread as your reply — ` +
        `keep it to one or two short sentences describing what changed. Do not resolve or delete the comment.`,
      {
        quiet: true,
        source: 'comment',
        onDone: (s) => {
          inflight.delete(threadId)
          if (!s.ok) {
            // stopped or empty: leave the mention unanswered, but don't loop on it
            parked.add(parkKey(p.thread))
            ctx.editor.toast(t('Copilot didn’t finish that comment — reply to the thread to try again.'))
            return
          }
          reply(slideId, threadId, s.text.trim() || t('Done — see the changes on this slide (⌘Z undoes them).'))
          ctx.editor.toast(t('✨ Copilot replied to a comment — ready to resolve.'))
          schedule() // more mentions may be waiting
        },
      },
    )
  }

  const scan = () => {
    if (turns.isBusy()) return
    for (const slide of ctx.store.doc.slides) {
      for (const thread of slide.comments ?? []) {
        if (inflight.has(thread.id) || parked.has(parkKey(thread))) continue
        const ask = pendingAsk(thread)
        if (ask) {
          run({ slide, thread, ask })
          return // one at a time; schedule() re-scans after the turn
        }
      }
    }
  }

  const schedule = () => {
    clearTimeout(timer)
    timer = window.setTimeout(scan, 600)
  }

  const offs = [ctx.store.on('slides', schedule), ctx.store.on('doc', schedule)]

  return {
    destroy() {
      offs.forEach((off) => off())
      clearTimeout(timer)
    },
    fixAllFlagged() {
      if (turns.isBusy()) {
        ctx.editor.toast(t('The Copilot is still working — one thing at a time.'))
        return
      }
      const flagged: string[] = []
      // @copilot threads in this batch: held in-flight so the one-by-one scan
      // doesn't re-run them after the combined turn, then answered together
      const mentioned: Array<{ slideId: string; threadId: string }> = []
      for (const slide of ctx.store.doc.slides) {
        for (const thread of slide.comments ?? []) {
          if (thread.resolved) continue
          flagged.push(threadContext(slide, thread))
          if (pendingAsk(thread)) mentioned.push({ slideId: slide.id, threadId: thread.id })
        }
      }
      if (!flagged.length) {
        ctx.editor.toast(t('No unresolved comments — nothing to fix.'))
        return
      }
      turns.ask(
        `Work through every unresolved review comment below, one by one, using the tools. ` +
          `Fix what each asks for (skip any that are questions rather than requests, and say so). ` +
          `Finish with a short summary of what you changed per comment. Do not resolve or delete comments.\n\n` +
          flagged.join('\n\n'),
        {
          quiet: true,
          source: 'comments-all',
          onDone: (s) => {
            for (const m of mentioned) {
              inflight.delete(m.threadId)
              if (s.ok) {
                reply(m.slideId, m.threadId, t('Handled in a batch fix of all flagged comments — see the changes (⌘Z undoes them).'))
              } else {
                const thread = ctx.store.doc.slides.find((x) => x.id === m.slideId)?.comments?.find((c) => c.id === m.threadId)
                if (thread) parked.add(parkKey(thread))
              }
            }
            schedule()
          },
        },
      )
      for (const m of mentioned) inflight.add(m.threadId)
      ctx.editor.toast(t('✨ Copilot is working through {n} flagged comment(s)…', { n: String(flagged.length) }))
    },
  }
}
