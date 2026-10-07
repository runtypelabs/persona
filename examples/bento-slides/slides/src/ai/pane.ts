// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento/Suite authors
// The Copilot pane: Persona mounted HEADLESS (createAgentExperience) inside
// Bento's own right-rail tab — Bento owns the chrome (tabs, resizer, collapse),
// Persona owns the conversation. Plugins make the transcript native:
//   · renderHeader     → hidden (the rail tab IS the header)
//   · renderToolCall   → completed deck edits render as live slide thumbnails
//   · renderApproval   → set_theme shows a before/after preview; deletes show
//                        the doomed slide
//   · renderAskUserQuestion → falls through to the built-in sheet, but pops
//                        the rail open first so quiet turns can ask things
//
// Voice: the composer mic starts a GPT-Live call through Persona's built-in
// Runtype voice provider. The voice model handles the small talk itself and
// hands every real request to this same chat pipeline (client delegation), so
// a spoken "add a pricing slide" runs the page's WebMCP tools exactly like a
// typed one — approvals, thumbnails, ⌘Z and all — and the answer is read
// back. `callContext` gives the voice model the deck at a glance so "what's
// on slide three" needs no hand-off at all.

import {
  DEFAULT_WIDGET_CONFIG,
  createAgentExperience,
  createLocalStorageAdapter,
  markdownPostprocessor,
  type AgentWidgetController,
} from '@runtypelabs/persona'
import { createPcmStreamPlayer } from '@runtypelabs/persona/voice-worklet-player'
import { t } from '../i18n'
import {
  APPROVAL_REQUIRED_TOOL_NAMES,
  deckContext,
  nonStateSlides,
  slideName,
  type AiContext,
} from './tools'
import { buildContextMentions } from './mentions'
import { COPILOT_AGENT_ID, COPILOT_CLIENT_TOKEN, RUNTYPE_API_URL } from './models'
import { slideThumbById, slideIdsIn } from './thumbs'
import { slideThumb } from './thumbs'

/** What the pane needs from the orchestrator (src/ai/index.ts). */
export interface PaneHost {
  /** make the Copilot tab visible (quiet turn needs a decision, etc.) */
  openRail(): void
  /** /fix-flagged slash command → comments copilot queue */
  fixFlagged(): void
}

/** The live Persona controller (the rest of src/ai types against it). */
export type PaneController = AgentWidgetController

// Bento brand on Persona's token system — explicit high-contrast pairs.
const bentoTheme = {
  semantic: {
    colors: {
      primary: '#16273E',
      accent: '#FF9E8A',
      surface: '#ffffff',
      background: '#ffffff',
      container: '#F6F4EF',
      text: '#1E2A3A',
      textMuted: '#5E7699',
      textInverse: '#ffffff',
      border: '#E4E0D6',
      divider: '#E4E0D6',
    },
  },
  components: {
    // the pane lives inside Bento's rail: no panel chrome of its own
    panel: { border: 'none', shadow: 'none', borderRadius: '0' },
    message: {
      user: { background: '#16273E', text: '#ffffff' },
      // responses read as PROSE, not chat bubbles — no fill, no border.
      // (the leftover bubble geometry — shadow, side padding, radius — is
      // stripped in styles.css; see `.ed-copilot [data-persona-theme-zone=…]`)
      assistant: { background: 'transparent', text: '#1E2A3A', border: 'transparent' },
    },
    button: { primary: { background: '#FF9E8A', foreground: '#16273E' } },
    approval: {
      approve: { background: '#16273E', foreground: '#ffffff', border: '#16273E' },
      deny: { background: '#ffffff', foreground: '#B91C1C', border: '#E4E0D6' },
    },
    toolBubble: { shadow: 'none' },
    reasoningBubble: { shadow: 'none' },
    collapsibleWidget: { container: '#F6F4EF', surface: '#ffffff', border: '#E4E0D6' },
  },
}

let controller: PaneController | null = null
let mountEl: HTMLElement | null = null

export function paneController(): PaneController | null {
  return controller
}

export function unmountCopilotPane() {
  try {
    controller?.destroy()
  } catch {
    /* already gone */
  }
  controller = null
  mountEl?.parentElement?.replaceChildren()
  mountEl = null
}

/** Ask Persona to stop the in-flight stream (its own Esc-to-stop path). */
export function stopStreaming() {
  mountEl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }))
}

/**
 * Whether the assistant stream is live. `assistant:complete` fires per message
 * SEGMENT (reasoning / tool / text are separate messages), so turn-end logic
 * must double-check this. The composer footer carries the authoritative flag.
 */
export function paneIsStreaming(): boolean {
  const el = mountEl?.querySelector<HTMLElement>('[data-persona-composer-streaming]')
  return el?.dataset.personaComposerStreaming === 'true'
}

const bare = (name: string) => name.replace(/^webmcp[:_]/, '')

/**
 * The deck as the voice model should hear it: title, how many slides, which
 * is open, and every slide's name by position. Short on purpose — this rides
 * the call-start context frame (capped at 4000 chars) and the voice model
 * answers from it directly; anything that changes the deck is delegated.
 */
export function voiceCallContext(ctx: AiContext): string {
  const doc = ctx.store.doc
  const entries = nonStateSlides(doc)
  const current = entries.find((e) => e.slide.id === ctx.store.slide.id)
  const lines = entries
    .slice(0, 40)
    .map((e) => `${e.position}. ${slideName(e.slide) ?? 'Untitled slide'}`)
  const where = ctx.editor.isPresenting
    ? `A presentation is running, currently showing slide ${current?.position ?? '?'}.`
    : `Slide ${current?.position ?? '?'} is open in the editor.`
  return (
    `The visitor is working on a slide deck called "${doc.title}" with ${entries.length} slides in Bento Slides. ${where}\n` +
    `Slides by position:\n${lines.join('\n')}${entries.length > 40 ? '\n…' : ''}\n` +
    `You can answer questions about this list yourself. Anything that reads slide contents in detail, edits the deck, ` +
    `or moves the presentation must be handed to the agent.`
  )
}

export function mountCopilotPane(ctx: AiContext, host: PaneHost): PaneController {
  unmountCopilotPane()

  // widget.css is bundled into the shell; pre-seed the data-persona marker so
  // the ESM build doesn't inject its own <link> (import.meta.url is a blob URL
  // in the compressed single-file boot — that link would 404).
  if (!document.head.querySelector('link[data-persona]')) {
    const marker = document.createElement('link')
    marker.rel = 'stylesheet'
    marker.href = 'data:text/css,'
    marker.setAttribute('data-persona', 'true')
    document.head.appendChild(marker)
  }

  // Persona styles its mount host INLINE (display:flex, height:100%…), so it
  // gets an inner div of its own — tab visibility stays on OUR wrapper.
  const rail = ctx.editor.copilotMount()
  rail.innerHTML = ''
  mountEl = document.createElement('div')
  mountEl.className = 'ed-ai-panehost'
  rail.appendChild(mountEl)

  const doc = () => ctx.store.doc

  const plugins = [
    {
      id: 'bento-native',
      // (the default header is hidden via CSS — Bento's rail tab IS the header)
      // Completed deck edits become slide thumbnails; reads and in-flight
      // calls keep Persona's default (live activity preview).
      renderToolCall: (pluginCtx: {
        message: { toolCall?: { name?: string; status?: string; result?: unknown } }
        defaultRenderer: () => HTMLElement
      }) => {
        const call = pluginCtx.message.toolCall
        if (!call || call.status !== 'complete') return null
        const name = bare(call.name ?? '')
        if (name.startsWith('get_') || name.startsWith('list_') || name === 'goto_slide') return null
        const structured = structuredOf(call.result)
        const ids = slideIdsIn(structured)
        const thumbSlideId = ids[0]
        if (!thumbSlideId) return null
        const thumb = slideThumbById(doc(), thumbSlideId, 132)
        if (!thumb) return null
        const chip = document.createElement('div')
        chip.className = 'ed-ai-toolchip'
        const label = document.createElement('div')
        label.className = 'ed-ai-toolchip-label'
        label.textContent = toolLabel(name)
        chip.append(thumb, label)
        chip.addEventListener('click', () => {
          const idx = doc().slides.findIndex((s) => s.id === thumbSlideId)
          if (idx >= 0) ctx.store.goTo(idx)
        })
        return chip
      },
      // Approvals with previews: restyles show before/after, deletes show
      // what's about to go.
      renderApproval: (pluginCtx: {
        message: { approval?: { toolName?: string; parameters?: unknown; status?: string } }
        defaultRenderer: () => HTMLElement
      }) => {
        const approval = pluginCtx.message.approval
        if (!approval) return null
        const base = pluginCtx.defaultRenderer()
        if (approval.status !== 'pending') return base
        const name = bare(approval.toolName ?? '')
        const preview = approvalPreview(ctx, name, approval.parameters)
        if (!preview) return base
        const wrap = document.createElement('div')
        wrap.append(preview, base)
        return wrap
      },
      // Quiet turns can still ask questions — surface the rail, keep the
      // built-in answer sheet.
      renderAskUserQuestion: () => {
        host.openRail()
        return null
      },
    },
  ]

  controller = createAgentExperience(mountEl, {
    ...DEFAULT_WIDGET_CONFIG,
    apiUrl: RUNTYPE_API_URL,
    clientToken: COPILOT_CLIENT_TOKEN,
    agentId: COPILOT_AGENT_ID,
    parserType: 'json',
    launcher: { ...DEFAULT_WIDGET_CONFIG.launcher, enabled: false, fullHeight: true },
    plugins,
    // Responses read as PROSE, user turns still read as chat. Deliberately NOT
    // layout:'flat' — that flattens the user turn too, leaving alignment as the
    // only role cue. Instead: keep the bubble layout, make the assistant fill
    // transparent (theme, above) and let it fill the rail track via the
    // per-role width. 'full' also covers assistant UI variants (tool chips,
    // approvals), which matters in a rail this narrow.
    layout: {
      ...DEFAULT_WIDGET_CONFIG.layout,
      messages: {
        ...DEFAULT_WIDGET_CONFIG.layout?.messages,
        layout: 'bubble',
        assistant: { width: 'full', maxWidth: '100%' },
        user: { width: 'content', maxWidth: '85%' },
      },
    },
    // GPT-Live over Persona's Runtype voice provider. Client delegation (the
    // default) routes the voice model's hand-offs through THIS chat pipeline,
    // so spoken edits run the page tools with the same approvals and ⌘Z.
    voiceRecognition: {
      enabled: true,
      provider: {
        type: 'runtype',
        runtype: {
          agentId: COPILOT_AGENT_ID,
          host: RUNTYPE_API_URL,
          callContext: () => voiceCallContext(ctx),
          // a spoken request that parks on an approval waits this long for a
          // tap before the voice model is told it lapsed (hanging up never
          // declines it — the card in the rail stays usable)
          approvalTimeoutMs: 120_000,
          // the agent's own voice config already has GPT-Live say it is an AI
          // in its first reply; the rail is too narrow for a second notice
          disclosureText: false,
          // the editor keeps the main thread busy (canvas, streaming chat),
          // and the default player schedules audio there with no buffer — a
          // long frame is an audible gap. The AudioWorklet player plays from
          // the audio thread behind a small jitter buffer.
          createPlaybackEngine: () => createPcmStreamPlayer({ prebufferMs: 250 }),
        },
      },
    },
    storageAdapter: createLocalStorageAdapter('persona-state-bento-copilot'),
    postprocessMessage: ({ text }: { text: string }) => markdownPostprocessor(text),
    colorScheme: 'light',
    theme: bentoTheme,
    copy: {
      ...DEFAULT_WIDGET_CONFIG.copy,
      welcomeTitle: t('Ask Bento Copilot'),
      welcomeSubtitle: t(
        'I edit this deck live — type, or tap the mic and just talk. @ references a slide, element or comment; / lists commands.',
      ),
      inputPlaceholder: t('Ask the Copilot to build, restyle or align slides…'),
    },
    contextMentions: buildContextMentions(ctx, {
      clearChat: () => {
        controller?.clearChat()
        ctx.editor.toast(t('Chat cleared.'))
      },
      present: () => ctx.editor.present(false, true),
      fixFlagged: () => host.fixFlagged(),
    }),
    suggestionChips: [
      t("What's in this deck?"),
      t('Add a closing slide that morphs from this one'),
      t('Tighten the copy on the current slide'),
      t('Add a chart slide comparing three options'),
    ],
    webmcp: {
      enabled: true,
      autoApprove: (info: { toolName: string }) => !APPROVAL_REQUIRED_TOOL_NAMES.has(info.toolName),
    },
    features: {
      ...DEFAULT_WIDGET_CONFIG.features,
      askUserQuestion: { expose: true },
      // consumer transcript: one grouped "worked on the deck" row per tool
      // burst, friendly names, details one tap away
      toolCallDisplay: { grouped: true, groupedMode: 'summary', collapsedMode: 'tool-name', expandable: true },
      reasoningDisplay: { expandable: false },
    },
    toolCall: {
      renderCollapsedSummary: (sumCtx: {
        toolCall: { name?: string; status: string; args?: unknown }
        isActive: boolean
      }) =>
        friendlyToolText(
          bare(sumCtx.toolCall.name ?? ''),
          sumCtx.toolCall.args,
          sumCtx.isActive || sumCtx.toolCall.status !== 'complete',
        ),
      renderGroupedSummary: (groupCtx: {
        toolCalls: Array<{ name?: string; status: string; args?: unknown }>
      }) => groupedToolSummary(groupCtx.toolCalls),
    },
    approval: {
      ...DEFAULT_WIDGET_CONFIG.approval,
      title: t('Run deck tool?'),
      approveLabel: t('Run tool'),
      denyLabel: t('Cancel'),
      detailsDisplay: 'collapsed',
    },
    contextProviders: [
      () => ({ slides_context: JSON.stringify(deckContext(ctx.store, ctx.editor.isPresenting)) }),
    ],
    // no status line — the ⌘Z story is told by the toasts, where it's earned
    statusIndicator: { ...DEFAULT_WIDGET_CONFIG.statusIndicator, visible: false },
  } as Parameters<typeof createAgentExperience>[1])

  return controller
}

// --- helpers -----------------------------------------------------------------

function structuredOf(result: unknown): unknown {
  if (result && typeof result === 'object' && 'structuredContent' in (result as object)) {
    return (result as { structuredContent?: unknown }).structuredContent
  }
  if (typeof result === 'string') {
    try {
      return JSON.parse(result)
    } catch {
      return null
    }
  }
  return result ?? null
}

/**
 * Human transcript label for ANY tool call — reads and navigation included.
 * `active` = still running (gerund form); complete mutations reuse toolLabel.
 * Returns null to fall back to Persona's default (unknown tools).
 */
function friendlyToolText(name: string, args: unknown, active: boolean): string | null {
  if (typeof args === 'string') {
    try { args = JSON.parse(args) } catch { args = {} }
  }
  const a = (args && typeof args === 'object' ? args : {}) as Record<string, unknown>
  const n = typeof a.position === 'number' ? String(a.position) : null
  switch (name) {
    case 'get_deck_overview': return active ? t('Reading the deck…') : t('Read the deck')
    case 'get_slide':
      if (n) return active ? t('Reading slide {n}…', { n }) : t('Read slide {n}', { n })
      return active ? t('Reading a slide…') : t('Read a slide')
    case 'get_selection': return active ? t('Checking the selection…') : t('Checked the selection')
    case 'list_layouts': return active ? t('Checking the layouts…') : t('Checked the layouts')
    case 'list_comments': return active ? t('Reading the comments…') : t('Read the comments')
    case 'goto_slide':
    case 'jump_to_slide':
      if (n) return active ? t('Going to slide {n}…', { n }) : t('Went to slide {n}', { n })
      return active ? t('Changing slides…') : t('Changed slides')
    case 'next_slide': return t('Next slide')
    case 'prev_slide': return t('Previous slide')
    case 'start_presentation': return active ? t('Starting the show…') : t('Started the show')
    case 'exit_presentation': return active ? t('Ending the show…') : t('Ended the show')
  }
  if (!active) {
    const done = toolLabel(name)
    return done === name ? null : done
  }
  switch (name) {
    case 'add_slide': return t('Adding a slide…')
    case 'duplicate_slide': return t('Duplicating a slide…')
    case 'delete_slide': return t('Deleting a slide…')
    case 'move_slide': return t('Moving a slide…')
    case 'set_slide_props': return t('Updating slide settings…')
    case 'add_elements': return t('Adding elements…')
    case 'update_elements': return t('Updating elements…')
    case 'delete_elements': return t('Deleting elements…')
    case 'align_elements': return t('Aligning elements…')
    case 'set_theme': return t('Restyling the deck…')
    case 'set_deck_title': return t('Renaming the deck…')
    case 'add_comment': return t('Writing a comment…')
    default: return null
  }
}

/** One consolidated line for a grouped tool burst: the running step while
 *  live, then up to three distinct completed steps. */
function groupedToolSummary(
  toolCalls: Array<{ name?: string; status: string; args?: unknown }>,
): string | null {
  const running = toolCalls.find((c) => c.status !== 'complete')
  if (running) return friendlyToolText(bare(running.name ?? ''), running.args, true)
  const labels: string[] = []
  for (const c of toolCalls) {
    const label = friendlyToolText(bare(c.name ?? ''), c.args, false)
    if (label && !labels.includes(label)) labels.push(label)
  }
  if (!labels.length) return null
  if (labels.length <= 3) return labels.join(' · ')
  return t('{list} + {n} more', { list: labels.slice(0, 3).join(' · '), n: String(labels.length - 3) })
}

function toolLabel(name: string): string {
  switch (name) {
    case 'add_slide': return t('Added a slide')
    case 'duplicate_slide': return t('Duplicated a slide')
    case 'delete_slide': return t('Deleted a slide')
    case 'move_slide': return t('Moved a slide')
    case 'set_slide_props': return t('Updated slide settings')
    case 'add_elements': return t('Added elements')
    case 'update_elements': return t('Updated elements')
    case 'delete_elements': return t('Deleted elements')
    case 'align_elements': return t('Aligned elements')
    case 'set_theme': return t('Restyled the deck')
    case 'set_deck_title': return t('Renamed the deck')
    case 'add_comment': return t('Left a comment')
    default: return name
  }
}

function approvalPreview(ctx: AiContext, name: string, parameters: unknown): HTMLElement | null {
  const doc = ctx.store.doc
  const params = (parameters && typeof parameters === 'object' ? parameters : {}) as Record<string, unknown>
  if (name === 'set_theme') {
    const before = slideThumb(doc, ctx.store.slide, 118)
    const patched = {
      ...doc,
      theme: {
        ...doc.theme,
        ...(typeof params.background === 'string' ? { background: params.background } : {}),
        ...(typeof params.color === 'string' ? { color: params.color } : {}),
        ...(typeof params.accent === 'string' ? { accent: params.accent } : {}),
        ...(typeof params.fontFamily === 'string' ? { fontFamily: params.fontFamily } : {}),
      },
    }
    const after = slideThumb(patched, ctx.store.slide, 118)
    return beforeAfter(before, after)
  }
  if (name === 'delete_slide') {
    // resolve exactly like the delete_slide tool: slideId > position > current
    const id =
      typeof params.slideId === 'string' && params.slideId
        ? params.slideId
        : typeof params.position === 'number'
          ? nonStateSlides(doc)[params.position - 1]?.slide.id
          : ctx.store.slide.id
    if (!id) return null
    const thumb = slideThumbById(doc, id, 132)
    if (!thumb) return null
    const wrap = document.createElement('div')
    wrap.className = 'ed-ai-preview'
    thumb.classList.add('ed-ai-doomed')
    wrap.appendChild(thumb)
    return wrap
  }
  return null
}

function beforeAfter(before: HTMLElement, after: HTMLElement): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'ed-ai-preview ed-ai-beforeafter'
  const cell = (el: HTMLElement, label: string) => {
    const c = document.createElement('div')
    const cap = document.createElement('div')
    cap.className = 'ed-ai-preview-cap'
    cap.textContent = label
    c.append(el, cap)
    return c
  }
  wrap.append(cell(before, t('Now')), cell(after, t('Proposed')))
  return wrap
}
