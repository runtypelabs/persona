// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento/Suite authors
// @-mention context for the Copilot composer (Persona contextMentions).
// Three live sources — slides, elements on the current slide, open review
// comments — plus a `/` slash-command channel. Every source searches the LIVE
// document on each keystroke and resolves AT SUBMIT TIME (resolveOn:'submit'):
// the deck mutates between pick and send, so the payload is built from
// whatever is true when the message actually goes out.
//
// Two invariants inherited from the tool layer:
//   · element ids repeat across slides (the morph idiom), so an element
//     mention's identity is the COMPOSITE `slideId U+001F elementId` and its
//     payload always names the slideId for the model to pass back to tools.
//   · payloads reuse tools.ts's elementDetail shaping — data: URIs are always
//     collapsed to a mime tag, never inlined into the prompt.

import {
  createImagePart,
  createSlashCommandsSource,
  defaultMentionFilter,
  type AgentWidgetContextMentionConfig,
  type AgentWidgetContextMentionItem,
  type AgentWidgetContextMentionSource,
} from '@runtypelabs/persona'
import { slideSnapshot } from './snapshot'
import { t } from '../i18n'
import type { Comment, SlideElement } from '../model'
import {
  elementDetail,
  htmlToText,
  nonStateSlides,
  positionOf,
  slideName,
  type AiContext,
} from './tools'

/** Late-bound actions the slash commands dispatch into. */
export interface MentionHost {
  clearChat(): void
  present(): void
  fixFlagged(): void
}

type MentionItem = AgentWidgetContextMentionItem
type MentionSource = AgentWidgetContextMentionSource

const SEP = '\u001F' // same composite-key separator the sync engine uses

const truncate = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n)}…` : s)

/** slideName() can surface raw dynamic-field tokens ("{{page:2}}") — fine for
 *  the model, noise in a human picker. Strip tokens for display only. */
const cleanName = (name: string | null): string | null => {
  const cleaned = (name ?? '').replace(/\{\{[^}]*\}\}/g, '').trim()
  return cleaned || null
}

// Slack/Linear-style per-type accents for inline tokens (color = type).
const EL_COLORS: Record<string, string> = {
  text: '#2563EB',
  shape: '#7C3AED',
  image: '#059669',
  chart: '#D97706',
  table: '#0891B2',
  media: '#DB2777',
  svg: '#64748B',
}
const EL_ICONS: Record<string, string> = {
  text: 'type',
  shape: 'square',
  image: 'image',
  chart: 'bar-chart-3',
  table: 'table',
  media: 'clapperboard',
  svg: 'file-code',
}

const elTypeName = (type: string): string => {
  switch (type) {
    case 'text': return t('Text')
    case 'shape': return t('Shape')
    case 'image': return t('Image')
    case 'chart': return t('Chart')
    case 'table': return t('Table')
    case 'media': return t('Media')
    case 'svg': return 'SVG'
    default: return type
  }
}

/** Short human handle for one element: "Text · Q3 revenue grew 40%". */
const elPreview = (el: SlideElement): string => {
  switch (el.type) {
    case 'text': {
      const text = htmlToText((el as { html: string }).html).trim()
      return text ? truncate(text, 36) : t('Text')
    }
    case 'shape': return (el as { shape?: string }).shape ?? t('Shape')
    case 'chart': {
      const opt = (el as { option?: { series?: unknown } }).option
      const series = Array.isArray(opt?.series) ? opt.series : []
      const names = (series as Array<{ name?: string }>).map((s) => s?.name).filter(Boolean)
      return names.length ? truncate(names.join(', '), 36) : t('Chart')
    }
    case 'table': {
      const tbl = el as { rows?: unknown[]; columns?: unknown[] }
      return `${tbl.rows?.length ?? 0}×${tbl.columns?.length ?? 0}`
    }
    default: return elTypeName(el.type)
  }
}

const anchorLabel = (c: Comment): string => {
  if (c.elementId) return t('on an element')
  if (typeof c.x === 'number' && typeof c.y === 'number') return t('at a point')
  return t('whole slide')
}

const commentAnchor = (c: Comment): Record<string, unknown> =>
  c.elementId
    ? { type: 'element', elementId: c.elementId }
    : typeof c.x === 'number'
      ? { type: 'point', x: c.x, y: c.y }
      : { type: 'slide' }

/**
 * Build the full contextMentions config for the pane. `ctx` is read live in
 * every search/resolve; `host` actions are dispatched by the `/` channel.
 */
export function buildContextMentions(ctx: AiContext, host: MentionHost): AgentWidgetContextMentionConfig {
  const doc = () => ctx.store.doc

  const slidesSource: MentionSource = {
    id: 'slides',
    label: t('Slides'),
    resolveOn: 'submit',
    search: (query) => {
      const d = doc()
      const entries = nonStateSlides(d)
      const items = entries.map(({ slide, position }) => ({
        id: slide.id,
        label: `${position} · ${cleanName(slideName(slide)) ?? t('Untitled slide')}`,
        description: t('{n} element(s)', { n: String(slide.elements.length) }),
        iconName: 'presentation',
        // recency keeps the empty-query list in DECK ORDER (labels sort "1,
        // 10, 11, 2…" otherwise), with the slide open in the editor on top
        recencyScore: (slide.id === ctx.store.slide.id ? entries.length : 0) + entries.length - position,
      }))
      return defaultMentionFilter(items, query)
    },
    resolve: async (item) => {
      const d = doc()
      const slide = d.slides.find((s) => s.id === item.id)
      if (!slide) {
        return { llmAppend: `The mentioned slide ("${item.label}") no longer exists in the deck.` }
      }
      const data = {
        id: slide.id,
        position: positionOf(d, slide.id),
        background: slide.background,
        transition: slide.transition,
        notes: slide.notes,
        elements: slide.elements.map(elementDetail),
      }
      // the model gets EYES on the mentioned slide, not just its JSON
      const image = await slideSnapshot(d, slide, 800)
      return {
        llmAppend:
          `Slide ${data.position ?? '?'} of the deck (slideId "${slide.id}"), as JSON — ` +
          `you already have this data, no need to call get_slide for it` +
          (image ? ' (a rendered image of this slide is also attached)' : '') +
          `:\n${JSON.stringify(data)}`,
        ...(image
          ? { contentParts: [createImagePart(image, { mimeType: 'image/png', alt: `Slide ${data.position ?? ''}`.trim() })] }
          : {}),
      }
    },
  }

  const elementsSource: MentionSource = {
    id: 'elements',
    label: t('Elements on this slide'),
    resolveOn: 'submit',
    search: (query) => {
      const slide = ctx.store.slide
      const items = slide.elements.map((el, i) => ({
        // ids repeat across slides — identity is slide-qualified
        id: `${slide.id}${SEP}${el.id}`,
        label: `${elTypeName(el.type)} · ${elPreview(el)}`,
        description: el.id,
        iconName: EL_ICONS[el.type] ?? 'square',
        color: EL_COLORS[el.type],
        recencyScore: slide.elements.length - i, // keep slide z-order
      }))
      return defaultMentionFilter(items, query)
    },
    resolve: (item) => {
      const [slideId, elId] = item.id.split(SEP)
      const d = doc()
      const slide = d.slides.find((s) => s.id === slideId)
      const el = slide?.elements.find((e) => e.id === elId)
      if (!slide || !el) {
        return { llmAppend: `The mentioned element ("${item.label}") was deleted from the deck.` }
      }
      return {
        llmAppend:
          `Element "${elId}" on slide ${positionOf(d, slideId) ?? '?'} (slideId "${slideId}"). ` +
          `Element ids repeat across slides — pass this slideId when editing it. JSON:\n` +
          JSON.stringify({ slideId, ...elementDetail(el) }),
      }
    },
  }

  const commentsSource: MentionSource = {
    id: 'comments',
    label: t('Open comments'),
    resolveOn: 'submit',
    search: (query) => {
      const d = doc()
      const items: MentionItem[] = []
      for (const s of d.slides) {
        for (const c of s.comments ?? []) {
          if (c.resolved) continue
          items.push({
            id: `${s.id}${SEP}${c.id}`,
            label: truncate(c.text, 40),
            description: `${c.author} · ${t('slide {n}', { n: String(positionOf(d, s.id) ?? '?') })} · ${anchorLabel(c)}`,
            iconName: 'message-square',
            color: '#E2A400',
          })
        }
      }
      return defaultMentionFilter(items, query)
    },
    resolve: (item) => {
      const [slideId, commentId] = item.id.split(SEP)
      const d = doc()
      const slide = d.slides.find((s) => s.id === slideId)
      const thread = slide?.comments?.find((c) => c.id === commentId)
      if (!slide || !thread) {
        return { llmAppend: `The mentioned comment ("${item.label}") no longer exists.` }
      }
      const data = {
        slideId,
        slidePosition: positionOf(d, slideId),
        anchor: commentAnchor(thread),
        author: thread.author,
        text: thread.text,
        replies: (thread.replies ?? []).map((r) => ({ author: r.author, text: r.text })),
        resolved: !!thread.resolved,
      }
      return {
        llmAppend: `A review comment thread on slide ${data.slidePosition ?? '?'} (slideId "${slideId}"), as JSON:\n${JSON.stringify(data)}`,
      }
    },
  }

  const commandsSource = createSlashCommandsSource({
    id: 'cmd',
    label: t('Commands'),
    commands: [
      {
        name: 'clear',
        description: t('Clear the chat history'),
        iconName: 'trash-2',
        kind: 'action',
        action: () => host.clearChat(),
      },
      {
        name: 'present',
        description: t('Start presenting fullscreen'),
        iconName: 'play',
        kind: 'action',
        action: () => host.present(),
      },
      {
        name: 'fix-flagged',
        description: t('Fix everything flagged in comments'),
        iconName: 'wrench',
        kind: 'action',
        action: () => host.fixFlagged(),
      },
    ],
  })

  return {
    enabled: true,
    display: 'inline',
    showButton: true,
    buttonTooltipText: t('Add context — a slide, element or comment'),
    searchPlaceholder: t('Search slides, elements, comments…'),
    sources: [slidesSource, elementsSource, commentsSource],
    triggers: [
      {
        trigger: '/',
        triggerPosition: 'line-start',
        sources: [commandsSource],
      },
    ],
  }
}
