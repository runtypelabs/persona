// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento/Suite authors
//
// WebMCP page-tool surface for the Bento Slides editor. These tools are
// registered on `document.modelContext` (the W3C Web Model Context proposal,
// polyfilled by @mcp-b/webmcp-polyfill) so an embedded Persona AI widget can
// drive the editor: read the deck, build slides, style elements, present.
//
// The CALLER initialises the polyfill and owns the widget; this module only
// registers/tears down the tool set. Every tool set shares one AbortController
// owner (module-level `owner`) so the whole set can be swapped in one abort.
//
// Design notes (mirrors persona/apps/web/src/webmcp-slides/tools.ts):
//   - `title` is mirrored into `annotations.title` because the strict consumer
//     surface (Persona approval bubbles) only reads annotations.title.
//   - reads carry `readOnlyHint`, deletes carry `destructiveHint`.
//   - execute returns an MCP CallToolResult: { content:[{type:'text',text}],
//     structuredContent }. Every mutating tool echoes the ids it created or
//     touched plus a terse confirmation, so the model can chain without
//     re-reading the deck. Bad input throws a plain Error with an actionable
//     message (which tool to call to recover).
//   - ALL doc mutations go through store.commit(...) → undoable with ⌘Z.
//     Slide add/remove/reorder commit the 'slides' event (rebuilds the
//     sidebar via the editor's existing store listener); everything else
//     commits 'doc' (re-renders the canvas + thumbnails). We never call the
//     editor's private rebuildSidebar directly — the store event covers it.

import type { Store } from '../store'
import type { Editor } from '../editor/editor'
import type {
  BentoDoc, Slide, SlideElement, TextElement, ShapeElement, ChartElement,
  TableElement, ImageElement, MediaElement, SvgElement, ShapeKind, Comment, TableRow,
} from '../model'
import {
  defaultText, defaultShape, defaultImage, defaultChart, defaultTable,
  emptySlide, instantiateLayout, builtinLayouts, applyChartPalette, readableInk, uid,
} from '../model'
import { CHART_PRESETS } from '../charts'

// ---------------------------------------------------------------------------
// Public contract

export interface AiContext {
  store: Store
  editor: Editor
}

/** Tools that raise the widget's approval bubble before running: deletes and
 *  deck-wide restyles. Ordinary writes (add_slide, add_elements, …) auto-approve
 *  so the user can watch the agent build. */
export const APPROVAL_REQUIRED_TOOL_NAMES: ReadonlySet<string> = new Set([
  'delete_slide',
  'delete_elements',
  'set_theme',
])

/** Reads plus pure navigation (goto_slide changes the view, not the doc). */
export const READ_ONLY_TOOL_NAMES: ReadonlySet<string> = new Set([
  'get_deck_overview',
  'get_slide',
  'get_selection',
  'list_layouts',
  'list_comments',
  'goto_slide',
])

/** Trimmed set for small on-device models — enough to read + build a deck. */
export const CORE_TOOL_NAMES: readonly string[] = [
  'get_deck_overview',
  'get_slide',
  'add_slide',
  'set_slide_props',
  'add_elements',
  'set_deck_title',
]

export function setupBentoTools(ctx: AiContext): void {
  const modelContext = getModelContext()
  if (!modelContext?.registerTool) {
    console.warn('[Bento AI] WebMCP unavailable: no modelContext found on this page.')
    return
  }
  // Guard against double-registration: abort any prior owner first.
  owner?.abort()
  owner = new AbortController()
  for (const tool of buildTools(ctx)) registerTool(modelContext, tool, owner.signal)
}

export function teardownBentoTools(): void {
  owner?.abort()
  owner = undefined
}

// --- turn journal -----------------------------------------------------------
// One listener (src/ai/quiet.ts) hears every successful tool execution with
// its structured result — powering the "Copilot edited N elements" toasts and
// the provenance shimmer without each tool knowing about UI.

export interface ToolActivity {
  tool: string
  data: unknown
}

let activityListener: ((e: ToolActivity) => void) | null = null

export function setToolActivityListener(cb: ((e: ToolActivity) => void) | null): void {
  activityListener = cb
}

// --- presenter tool set -------------------------------------------------------
// While presenting, the editing surface is swapped for a tiny navigation set
// (the persona-repo demo pattern): the model drives the live show, nothing
// else. setupBentoTools() restores the editing set when the show ends.

let presenterOwner: AbortController | undefined

export function setupPresenterTools(ctx: AiContext): void {
  const modelContext = getModelContext()
  if (!modelContext?.registerTool) return
  owner?.abort()
  owner = undefined
  presenterOwner?.abort()
  presenterOwner = new AbortController()
  const session = () => ctx.editor.presentSession
  const need = () => {
    const s = session()
    if (!s) throw new Error('no presentation is running')
    return s
  }
  const state = (ctx2: AiContext) => {
    const d = ctx2.store.doc
    const idx = need().currentIndex()
    const slide = d.slides[idx]
    return { slideId: slide?.id ?? null, position: slide ? positionOf(d, slide.id) : null, slideCount: nonStateSlides(d).length }
  }
  const tools: ToolDescriptor[] = [
    {
      name: 'next_slide',
      title: 'Next slide',
      description: 'Advance the running presentation to the next slide.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute() { need().next(); return toolResult(state(ctx)) },
    },
    {
      name: 'prev_slide',
      title: 'Previous slide',
      description: 'Go back one slide in the running presentation.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute() { need().prev(); return toolResult(state(ctx)) },
    },
    {
      name: 'jump_to_slide',
      title: 'Jump to a slide',
      description: 'Jump the running presentation to a 1-based slide position (among non-state slides). Use get_deck_overview positions.',
      inputSchema: { type: 'object', required: ['position'], properties: { position: { type: 'number' } } },
      annotations: { readOnlyHint: true },
      execute(args) {
        const p = Number(args.position)
        if (!Number.isFinite(p) || p < 1) throw new Error('position must be a 1-based slide number')
        need().goToPosition(p)
        return toolResult(state(ctx))
      },
    },
    {
      name: 'exit_presentation',
      title: 'End the presentation',
      description: 'Leave the slideshow and return to the editor.',
      inputSchema: { type: 'object', properties: {} },
      execute() { need().exit(); return toolResult({ presenting: false }) },
    },
    // orientation read stays available so "jump to the pricing slide" works
    buildTools(ctx).find((tool) => tool.name === 'get_deck_overview')!,
  ]
  for (const tool of tools) registerTool(modelContext, tool, presenterOwner.signal)
}

export function teardownPresenterTools(): void {
  presenterOwner?.abort()
  presenterOwner = undefined
}

/** Small live-state object for the widget's contextProviders. */
export function deckContext(store: Store, presenting = false): Record<string, unknown> {
  const doc = store.doc
  const cur = store.slide
  const list = nonStateSlides(doc)
  const curEntry = list.find((e) => e.slide.id === cur.id)
  return {
    deckTitle: doc.title,
    slideCount: list.length,
    currentSlide: {
      id: cur.id,
      position: curEntry ? curEntry.position : store.currentIndex + 1,
      name: slideName(cur),
    },
    selection: store.selectedElements.map((el) => ({
      id: el.id, type: el.type, x: el.x, y: el.y, w: el.w, h: el.h,
    })),
    presenting,
  }
}

// ---------------------------------------------------------------------------
// Registration plumbing

let owner: AbortController | undefined

interface ToolDescriptor {
  name: string
  title: string
  description: string
  inputSchema: object
  annotations?: Record<string, unknown>
  execute: (args: Record<string, unknown>) => unknown | Promise<unknown>
}

interface RegisterableModelContext {
  registerTool: (
    tool: ToolDescriptor & { annotations?: Record<string, unknown> },
    options?: { signal?: AbortSignal },
  ) => void
}

const getModelContext = (): RegisterableModelContext | undefined =>
  (document as unknown as { modelContext?: RegisterableModelContext }).modelContext ??
  (navigator as unknown as { modelContext?: RegisterableModelContext }).modelContext

/** Bail out of a mutating tool when the deck is a read-only live viewer
 *  (collab.role 'reader'): store.commit no-ops there, so without this a tool
 *  would report success while changing nothing. `store.readOnly` is public. */
const assertWritable = (store: Store): void => {
  if (store.readOnly) {
    throw new Error('This copy is read-only — edits are disabled. Reads and navigation still work.')
  }
}

const toolResult = (data: unknown, summary?: string): unknown => ({
  content: [{ type: 'text', text: `${summary ? `${summary}\n\n` : ''}${JSON.stringify(data)}` }],
  structuredContent: data,
})

const registerTool = (
  modelContext: RegisterableModelContext,
  tool: ToolDescriptor,
  signal: AbortSignal,
): void => {
  try {
    // The strict consumer surface only exposes annotations.title, so mirror
    // the descriptor title there (the whole reason for this helper). Execute
    // is wrapped so the turn journal hears every successful call.
    const descriptor = {
      ...tool,
      annotations: { title: tool.title, ...tool.annotations },
      execute: async (args: Record<string, unknown>) => {
        const result = await tool.execute(args)
        try {
          activityListener?.({ tool: tool.name, data: (result as { structuredContent?: unknown } | null)?.structuredContent })
        } catch {
          /* the journal must never break a tool call */
        }
        return result
      },
    }
    modelContext.registerTool(descriptor, { signal })
  } catch (error) {
    console.warn(`[Bento AI] Failed to register ${tool.name}`, error)
  }
}

// ---------------------------------------------------------------------------
// Text / html helpers. Text elements store sanitised inline HTML; a tool that
// takes plain text must escape it, and a read must strip back to plain text.

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const textToHtml = (s: string): string => escapeHtml(s).replace(/\r?\n/g, '<br>')

export const htmlToText = (h: string): string =>
  h.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/​/g, '')

const truncate = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n)}…` : s)

/** Never return a full data: URI (megabytes); collapse it to its mime tag. */
const shortSrc = (src: string): string => {
  const m = /^data:([^;,]+)/.exec(src)
  if (m) return `data:${m[1]}…[embedded]`
  return truncate(src, 60)
}

// ---------------------------------------------------------------------------
// Slide addressing. Positions reported to / accepted from the model are 1-based
// among NON-state slides (interactive `stateOf` variants are hidden), matching
// what get_deck_overview lists.

export interface SlideEntry { slide: Slide; index: number; position: number }

export const nonStateSlides = (doc: BentoDoc): SlideEntry[] => {
  const out: SlideEntry[] = []
  doc.slides.forEach((slide, index) => {
    if (!slide.stateOf) out.push({ slide, index, position: out.length + 1 })
  })
  return out
}

export const positionOf = (doc: BentoDoc, slideId: string): number | null => {
  const e = nonStateSlides(doc).find((x) => x.slide.id === slideId)
  return e ? e.position : null
}

/** doc index just past slide[index] and any of its trailing state variants. */
const blockEnd = (doc: BentoDoc, index: number): number => {
  const parentId = doc.slides[index]?.id
  let j = index + 1
  while (j < doc.slides.length && doc.slides[j].stateOf === parentId) j++
  return j
}

/** Resolve a slide from {slideId?, position?}; default = current slide. */
const resolveSlide = (store: Store, args: Record<string, unknown>): SlideEntry => {
  const doc = store.doc
  if (typeof args.slideId === 'string' && args.slideId) {
    const index = doc.slides.findIndex((s) => s.id === args.slideId)
    if (index < 0) throw new Error(`slide not found: "${args.slideId}" — call get_deck_overview to list valid slide ids`)
    return { slide: doc.slides[index], index, position: positionOf(doc, doc.slides[index].id) ?? -1 }
  }
  if (typeof args.position === 'number') {
    const entry = nonStateSlides(doc)[args.position - 1]
    if (!entry) throw new Error(`no slide at position ${args.position} — the deck has ${nonStateSlides(doc).length} slides (see get_deck_overview)`)
    return entry
  }
  return { slide: store.slide, index: store.currentIndex, position: positionOf(doc, store.slide.id) ?? store.currentIndex + 1 }
}

export const slideName = (slide: Slide): string | null => {
  if (slide.name) return truncate(slide.name, 60)
  const firstText = slide.elements.find((e): e is TextElement => e.type === 'text' && !!htmlToText(e.html).trim())
  if (firstText) return truncate(htmlToText(firstText.html).trim(), 60)
  return null
}

// ---------------------------------------------------------------------------
// Element serialization for reads (get_slide, get_selection share this shape).

export const elementDetail = (el: SlideElement): Record<string, unknown> => {
  const out: Record<string, unknown> = {
    id: el.id, type: el.type,
    x: el.x, y: el.y, w: el.w, h: el.h,
    rotation: el.rotation, opacity: el.opacity,
  }
  if (el.morphId) out.morphId = el.morphId
  if (el.link) out.link = el.link
  switch (el.type) {
    case 'text': {
      const t = el as TextElement
      out.text = truncate(htmlToText(t.html), 400)
      out.fontSize = t.fontSize
      out.color = t.color
      out.align = t.align
      break
    }
    case 'shape': {
      const s = el as ShapeElement
      out.shape = s.shape
      out.fill = s.fill
      out.stroke = s.stroke
      out.strokeWidth = s.strokeWidth
      break
    }
    case 'image': {
      const i = el as ImageElement
      out.fit = i.fit
      out.src = shortSrc(i.src)
      break
    }
    case 'chart': {
      const c = el as ChartElement
      const opt = c.option as { series?: unknown; xAxis?: unknown }
      const series = Array.isArray(opt.series) ? opt.series : opt.series ? [opt.series] : []
      out.preset = c.preset ?? null
      out.seriesNames = (series as Array<{ name?: string }>).map((s) => s?.name).filter(Boolean)
      const xAxis = opt.xAxis as { data?: unknown } | Array<{ data?: unknown }> | undefined
      const axis0 = Array.isArray(xAxis) ? xAxis[0] : xAxis
      out.categories = Array.isArray(axis0?.data) ? axis0!.data : []
      break
    }
    case 'table': {
      const tbl = el as TableElement
      out.rows = tbl.rows.length
      out.cols = tbl.columns.length
      out.header = tbl.header
      out.firstRow = (tbl.rows[0]?.cells ?? []).map((c) => truncate(htmlToText(c.html), 40))
      break
    }
    case 'media': {
      out.kind = (el as MediaElement).kind
      break
    }
    case 'svg': {
      out.asset = (el as SvgElement).asset ?? null
      break
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Element construction for add_elements.

const frameOf = (a: Record<string, unknown>): { x?: number; y?: number; w?: number; h?: number } => {
  const f: { x?: number; y?: number; w?: number; h?: number } = {}
  for (const k of ['x', 'y', 'w', 'h'] as const) if (typeof a[k] === 'number') f[k] = a[k] as number
  return f
}

const SHAPE_KINDS: ReadonlySet<string> = new Set(['rect', 'ellipse', 'triangle', 'arrow', 'line', 'path'])

const buildElement = (doc: BentoDoc, slide: Slide, spec: Record<string, unknown>): SlideElement => {
  const type = String(spec.type ?? '')
  const frame = frameOf(spec)
  switch (type) {
    case 'text': {
      if (typeof spec.text !== 'string') throw new Error('text element requires a "text" string')
      const partial: Partial<TextElement> = {
        ...frame,
        html: textToHtml(spec.text),
        color: typeof spec.color === 'string' ? spec.color : readableInk(slide.background),
      }
      if (typeof spec.fontSize === 'number') partial.fontSize = spec.fontSize
      if (typeof spec.align === 'string') partial.align = spec.align as TextElement['align']
      if (spec.bold === true) partial.fontWeight = 700
      return defaultText(partial)
    }
    case 'shape': {
      const shape = String(spec.shape ?? 'rect')
      if (!SHAPE_KINDS.has(shape)) throw new Error(`unknown shape "${shape}" — use one of rect|ellipse|triangle|arrow|line`)
      const partial: Partial<ShapeElement> = { ...frame }
      if (typeof spec.fill === 'string') partial.fill = spec.fill
      if (typeof spec.stroke === 'string') partial.stroke = spec.stroke
      if (typeof spec.strokeWidth === 'number') partial.strokeWidth = spec.strokeWidth
      if (typeof spec.radius === 'number') partial.radius = spec.radius
      return defaultShape(shape as ShapeKind, partial)
    }
    case 'image': {
      if (typeof spec.src !== 'string' || !spec.src) throw new Error('image element requires a "src" (URL or data: URI)')
      return defaultImage(spec.src, frame)
    }
    case 'chart': {
      let option: Record<string, unknown>
      if (spec.option && typeof spec.option === 'object') {
        option = spec.option as Record<string, unknown>
      } else {
        const preset = typeof spec.preset === 'string' ? spec.preset : 'bar'
        const make = CHART_PRESETS[preset]
        if (!make) throw new Error(`unknown chart preset "${preset}" — use one of ${Object.keys(CHART_PRESETS).join('|')}`)
        option = make()
      }
      if (typeof spec.title === 'string') option.title = { text: spec.title }
      applyChartPalette(option, doc.theme)
      const partial: Partial<ChartElement> = { ...frame }
      if (typeof spec.preset === 'string') partial.preset = spec.preset
      return defaultChart(option, partial)
    }
    case 'table': {
      const rows = Array.isArray(spec.rows) ? (spec.rows as unknown[]) : null
      if (!rows || !rows.length) throw new Error('table element requires a non-empty "rows" (array of string arrays)')
      const grid = rows.map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? '')) : [String(r ?? '')]))
      const cols = Math.max(...grid.map((r) => r.length), 1)
      const tableRows: TableRow[] = grid.map((r) => ({
        cells: Array.from({ length: cols }, (_, i) => ({ html: textToHtml(r[i] ?? '') })),
      }))
      return defaultTable({
        ...frame,
        columns: Array.from({ length: cols }, () => ({ w: 1 })),
        rows: tableRows,
        header: spec.header !== false,
      })
    }
    default:
      throw new Error(`unknown element type "${type}" — use one of text|shape|image|chart|table`)
  }
}

// ---------------------------------------------------------------------------
// update_elements: patch keys applied to an element found on any slide.

const NUMERIC_KEYS: ReadonlySet<string> = new Set(['x', 'y', 'w', 'h', 'rotation', 'opacity', 'fontSize', 'fontWeight', 'strokeWidth', 'radius'])
const STRING_KEYS: ReadonlySet<string> = new Set(['fontFamily', 'color', 'align', 'valign', 'fill', 'stroke', 'shape', 'src', 'fit'])
const VALID_PATCH_KEYS: readonly string[] = [
  'x', 'y', 'w', 'h', 'rotation', 'opacity', 'text', 'fontSize', 'fontFamily', 'fontWeight',
  'color', 'align', 'valign', 'fill', 'stroke', 'strokeWidth', 'radius', 'shape', 'src', 'fit',
  'option', 'link', 'morphId',
]

const applyPatch = (el: SlideElement, patch: Record<string, unknown>): void => {
  const target = el as unknown as Record<string, unknown>
  for (const [key, value] of Object.entries(patch)) {
    if (!VALID_PATCH_KEYS.includes(key)) {
      throw new Error(`unknown patch key "${key}" — valid keys: ${VALID_PATCH_KEYS.join(', ')}`)
    }
    if (value === undefined) continue
    if (key === 'text') {
      target.html = textToHtml(String(value))
    } else if (key === 'link' || key === 'morphId') {
      if (value === null || value === '') delete target[key]
      else target[key] = String(value)
    } else if (key === 'option') {
      if (value && typeof value === 'object') target.option = value
    } else if (NUMERIC_KEYS.has(key) && typeof value === 'number') {
      target[key] = value
    } else if (STRING_KEYS.has(key) && typeof value === 'string') {
      target[key] = value
    }
  }
}

/**
 * Resolve an element id to ONE element. Element ids repeat across slides by
 * design (the morph idiom — duplicate_slide keeps ids so slides morph), so a
 * bare deck-wide search can hit the wrong slide's copy. Resolution order:
 * explicit slideId > the current slide > a deck-wide UNIQUE match; ambiguous
 * ids error with the candidate slides so the model can retry with slideId.
 */
const resolveElement = (
  store: Store,
  id: string,
  slideId?: unknown,
): { slide: Slide; el: SlideElement } => {
  const doc = store.doc
  if (typeof slideId === 'string' && slideId) {
    const slide = doc.slides.find((s) => s.id === slideId)
    if (!slide) throw new Error(`slide not found: "${slideId}" — call get_deck_overview to list valid slide ids`)
    const el = slide.elements.find((e) => e.id === id)
    if (!el) throw new Error(`element "${id}" is not on slide "${slideId}" — call get_slide to list its element ids`)
    return { slide, el }
  }
  const matches = doc.slides
    .map((slide) => ({ slide, el: slide.elements.find((e) => e.id === id) }))
    .filter((m): m is { slide: Slide; el: SlideElement } => !!m.el)
  if (!matches.length) throw new Error(`element not found: "${id}" — call get_slide to list element ids`)
  if (matches.length === 1) return matches[0]
  const onCurrent = matches.find((m) => m.slide.id === store.slide.id)
  if (onCurrent) return onCurrent
  throw new Error(
    `element id "${id}" exists on ${matches.length} slides (${matches.map((m) => m.slide.id).join(', ')}) — ` +
      'ids are shared across slides for morphing. Pass slideId to say which copy you mean.',
  )
}

// ---------------------------------------------------------------------------
// align / distribute geometry.

type Alignment = 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom'
interface Bounds { minX: number; minY: number; maxX: number; maxY: number }

const alignInBounds = (els: SlideElement[], alignment: Alignment, b: Bounds): void => {
  for (const el of els) {
    switch (alignment) {
      case 'left': el.x = Math.round(b.minX); break
      case 'center-h': el.x = Math.round(b.minX + (b.maxX - b.minX - el.w) / 2); break
      case 'right': el.x = Math.round(b.maxX - el.w); break
      case 'top': el.y = Math.round(b.minY); break
      case 'center-v': el.y = Math.round(b.minY + (b.maxY - b.minY - el.h) / 2); break
      case 'bottom': el.y = Math.round(b.maxY - el.h); break
    }
  }
}

const distributeEvenly = (els: SlideElement[], axis: 'horizontal' | 'vertical'): void => {
  const horiz = axis === 'horizontal'
  const sorted = [...els].sort((a, b) => (horiz ? a.x - b.x : a.y - b.y))
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const start = horiz ? first.x + first.w / 2 : first.y + first.h / 2
  const end = horiz ? last.x + last.w / 2 : last.y + last.h / 2
  const step = (end - start) / (sorted.length - 1)
  sorted.forEach((el, i) => {
    const c = start + step * i
    if (horiz) el.x = Math.round(c - el.w / 2)
    else el.y = Math.round(c - el.h / 2)
  })
}

// ---------------------------------------------------------------------------
// Schema fragments reused across tools.

const SLIDE_TARGET_PROPS = {
  slideId: { type: 'string', description: 'Slide id from get_deck_overview.' },
  position: { type: 'number', description: '1-based slide position among non-state slides (alternative to slideId). Omit both to target the slide open in the editor.' },
} as const

const GEOMETRY_NOTE =
  'Coordinates are in the deck coordinate space (doc.size, default 1280x720 px), origin top-left. Keep ~96px margins (x from 96, right edge ≤ width-96). Call get_deck_overview for the actual size.'

// ---------------------------------------------------------------------------
// Tool set

const buildTools = (ctx: AiContext): ToolDescriptor[] => {
  const { store, editor } = ctx
  const doc = () => store.doc

  return [
    // ---- READS ----------------------------------------------------------
    {
      name: 'get_deck_overview',
      title: 'Read deck overview',
      description:
        'Read the deck at a glance: title, size, theme, and a per-slide summary (id, position, name, element count, transition, whether it is an interactive state, and a notes preview). Call this FIRST to orient. Token-efficient — no element details; use get_slide for those.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute() {
        const d = doc()
        const data = {
          title: d.title,
          size: d.size,
          theme: {
            background: d.theme.background, color: d.theme.color,
            accent: d.theme.accent, fontFamily: d.theme.fontFamily,
          },
          slides: d.slides.map((s) => ({
            id: s.id,
            position: s.stateOf ? null : (positionOf(d, s.id) ?? null),
            name: slideName(s),
            elementCount: s.elements.length,
            transition: s.transition,
            isState: !!s.stateOf,
            notesPreview: s.notes ? truncate(s.notes, 80) : '',
          })),
          currentSlideId: store.slide.id,
          selectedElementIds: [...store.selection],
        }
        return toolResult(data, `Deck "${d.title}": ${nonStateSlides(d).length} slides.`)
      },
    },
    {
      name: 'get_slide',
      title: 'Read a slide',
      description:
        'Read one slide in full: background, transition, notes, and every element with geometry + per-type essentials. Call before editing a slide\'s elements. Defaults to the slide open in the editor.',
      inputSchema: { type: 'object', properties: { ...SLIDE_TARGET_PROPS } },
      annotations: { readOnlyHint: true },
      execute(args) {
        const { slide, position } = resolveSlide(store, args)
        return toolResult({
          id: slide.id,
          position: slide.stateOf ? null : position,
          isState: !!slide.stateOf,
          background: slide.background,
          transition: slide.transition,
          notes: slide.notes,
          elements: slide.elements.map(elementDetail),
          comments: slide.comments?.length ?? 0,
        })
      },
    },
    // NOTE (v1.2.x): a get_slide_image tool was built and REMOVED. The relay
    // chain is fine client-side — the WebMcpToolResult carries the image block
    // all the way into /resume toolOutputs — but the Runtype dispatch only
    // maps TEXT out of tool results to the model (verified live: the model
    // confidently hallucinated "what it saw" with both the MCP {data} and the
    // ContentPart {image} block shapes). Until the backend maps tool-result
    // images, slide pixels reach the model ONLY via @-mention contentParts
    // (mentions.ts + snapshot.ts). Re-adding the tool is ~20 lines once the
    // dispatch supports it.
    {
      name: 'get_selection',
      title: 'Read the current selection',
      description:
        'Read the elements the user currently has selected on the canvas (same detail shape as get_slide), plus which slide they are on. Use whenever the user says "this", "these", or refers to something they clicked.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute() {
        const els = store.selectedElements
        return toolResult({
          slideId: store.slide.id,
          slidePosition: positionOf(doc(), store.slide.id),
          count: els.length,
          elements: els.map(elementDetail),
        }, els.length ? `${els.length} element(s) selected.` : 'Nothing is selected.')
      },
    },
    {
      name: 'list_layouts',
      title: 'List slide layouts',
      description:
        'List the slide layouts add_slide can reference (built-in layouts plus any saved in the deck): id, name, and the element roles each provides (title/subtitle/body/kicker).',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute() {
        const all = [...builtinLayouts(), ...(doc().layouts ?? [])]
        return toolResult({
          layouts: all.map((ly) => ({
            id: ly.id,
            name: ly.name ?? ly.id,
            elementRoles: ly.elements.map((e) => e.role).filter(Boolean),
          })),
        })
      },
    },
    {
      name: 'list_comments',
      title: 'List review comments',
      description:
        'List every review comment thread in the deck with its anchor (element id, a point, or the whole slide), author, text, replies and resolved state. The entry point for "fix everything people flagged".',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute() {
        const d = doc()
        const threads = d.slides.flatMap((s, slideIndex) =>
          (s.comments ?? []).map((c) => ({
            slideId: s.id,
            slideIndex,
            id: c.id,
            anchor: c.elementId
              ? { type: 'element' as const, elementId: c.elementId }
              : typeof c.x === 'number'
                ? { type: 'point' as const, x: c.x, y: c.y }
                : { type: 'slide' as const },
            author: c.author,
            at: c.at,
            text: c.text,
            replies: c.replies ?? [],
            resolved: !!c.resolved,
          })),
        )
        return toolResult({ comments: threads }, `${threads.length} comment thread(s).`)
      },
    },

    // ---- NAVIGATION -----------------------------------------------------
    {
      name: 'goto_slide',
      title: 'Go to a slide',
      description: 'Open a slide in the editor (navigation only — changes no document data).',
      inputSchema: { type: 'object', properties: { ...SLIDE_TARGET_PROPS } },
      annotations: { readOnlyHint: true },
      execute(args) {
        const { slide, index } = resolveSlide(store, args)
        store.goTo(index)
        return toolResult({ slideId: slide.id, position: positionOf(doc(), slide.id) })
      },
    },

    // ---- SLIDE COMMANDS -------------------------------------------------
    {
      name: 'add_slide',
      title: 'Add a slide',
      description:
        'Insert a new slide. With a layoutId (from list_layouts) the slide is built from that layout and title/body fill its title/body placeholders. Without one you get a blank slide (a title text box is added if you pass "title"). Inserts after the current slide by default, or at the given 1-based position. Returns the new slide id and position. Undoable with ⌘Z.',
      inputSchema: {
        type: 'object',
        properties: {
          position: { type: 'number', description: '1-based position to insert at (among non-state slides); default is after the current slide.' },
          layoutId: { type: 'string', description: 'Layout id from list_layouts.' },
          title: { type: 'string', description: 'Title text (fills the title placeholder / becomes a heading text box).' },
          body: { type: 'string', description: 'Body text (fills the body placeholder). Use \\n for line breaks.' },
          background: { type: 'string', description: 'CSS background color for the slide.' },
          notes: { type: 'string', description: 'Speaker notes.' },
        },
      },
      execute(args) {
        assertWritable(store)
        const d = doc()
        const title = typeof args.title === 'string' ? args.title : ''
        const body = typeof args.body === 'string' ? args.body : ''
        let slide: Slide
        if (typeof args.layoutId === 'string' && args.layoutId) {
          const layout = [...builtinLayouts(), ...(d.layouts ?? [])].find((ly) => ly.id === args.layoutId)
          if (!layout) throw new Error(`layout not found: "${args.layoutId}" — call list_layouts for valid ids`)
          slide = instantiateLayout(layout)
          for (const el of slide.elements) {
            if (el.type !== 'text') continue
            if (el.role === 'title' && title) el.html = textToHtml(title)
            else if (el.role === 'body' && body) el.html = textToHtml(body)
          }
        } else {
          const bg = typeof args.background === 'string' ? args.background : d.theme.background
          const els: SlideElement[] = []
          if (title) {
            els.push(defaultText({
              html: textToHtml(title), x: 96, y: 96, w: d.size.width - 192, h: 140,
              fontSize: 48, fontWeight: 700, align: 'left', valign: 'top', color: readableInk(bg),
            }))
          }
          if (body) {
            els.push(defaultText({
              html: textToHtml(body), x: 96, y: 260, w: d.size.width - 192, h: 360,
              fontSize: 26, align: 'left', valign: 'top', color: readableInk(bg),
            }))
          }
          slide = emptySlide({ elements: els })
        }
        if (typeof args.background === 'string') slide.background = args.background
        if (typeof args.notes === 'string') slide.notes = args.notes

        const at = typeof args.position === 'number'
          ? (nonStateSlides(d)[args.position - 1]?.index ?? d.slides.length)
          : blockEnd(d, store.currentIndex)
        store.commit(() => { d.slides.splice(at, 0, slide) }, 'slides')
        store.goTo(at)
        return toolResult({ slideId: slide.id, position: positionOf(d, slide.id) }, `Added slide at position ${positionOf(d, slide.id)}.`)
      },
    },
    {
      name: 'duplicate_slide',
      title: 'Duplicate a slide',
      description:
        'Deep-copy a slide right after the original, KEEPING its element ids (that shared identity is what lets the two slides morph into each other across a transition). Mints a fresh slide id and drops any state marker. Returns the new slide id. Undoable with ⌘Z.',
      inputSchema: { type: 'object', properties: { ...SLIDE_TARGET_PROPS } },
      execute(args) {
        assertWritable(store)
        const d = doc()
        const { slide, index } = resolveSlide(store, args)
        const copy: Slide = structuredClone(slide)
        copy.id = uid('slide')
        delete copy.stateOf
        const at = blockEnd(d, index)
        store.commit(() => { d.slides.splice(at, 0, copy) }, 'slides')
        store.goTo(at)
        return toolResult(
          { slideId: copy.id, position: positionOf(d, copy.id) },
          `Duplicated to position ${positionOf(d, copy.id)}. The copy's elements share ids with the source — pass slideId: "${copy.id}" in update_elements edits to change THIS copy.`,
        )
      },
    },
    {
      name: 'delete_slide',
      title: 'Delete a slide',
      description:
        'Permanently remove a slide, its interactive state variants, and any element links pointing at it. Cannot delete the last remaining slide. Undoable with ⌘Z.',
      inputSchema: { type: 'object', properties: { ...SLIDE_TARGET_PROPS } },
      annotations: { destructiveHint: true },
      execute(args) {
        assertWritable(store)
        const d = doc()
        const { slide } = resolveSlide(store, args)
        if (nonStateSlides(d).length <= 1 && !slide.stateOf) {
          throw new Error('cannot delete the only slide in the deck')
        }
        const removed = new Set<string>([slide.id])
        for (const s of d.slides) if (s.stateOf === slide.id) removed.add(s.id)
        const pos = positionOf(d, slide.id)
        store.commit(() => {
          d.slides = d.slides.filter((s) => !removed.has(s.id))
          for (const s of d.slides) {
            for (const el of s.elements) {
              if (el.link && removed.has(el.link)) delete el.link
            }
          }
        }, 'slides')
        store.goTo(Math.min(store.currentIndex, d.slides.length - 1))
        return toolResult({ deletedSlideIds: [...removed], slideCount: nonStateSlides(d).length }, `Deleted slide ${pos ?? ''}.`)
      },
    },
    {
      name: 'move_slide',
      title: 'Reorder a slide',
      description:
        'Move a slide to a new 1-based position among the non-state slides. Its interactive state variants travel with it. Returns the resulting slide order. Undoable with ⌘Z.',
      inputSchema: {
        type: 'object',
        required: ['toPosition'],
        properties: {
          ...SLIDE_TARGET_PROPS,
          toPosition: { type: 'number', description: '1-based target position among non-state slides.' },
        },
      },
      execute(args) {
        assertWritable(store)
        const d = doc()
        const { slide, index } = resolveSlide(store, args)
        if (slide.stateOf) throw new Error('move_slide targets a top-level slide, not an interactive state')
        const to = Math.round(Number(args.toPosition))
        if (!Number.isFinite(to)) throw new Error('toPosition is required (1-based)')
        const end = blockEnd(d, index)
        store.commit(() => {
          const block = d.slides.splice(index, end - index)
          const ns = nonStateSlides(d)
          const at = to - 1 >= ns.length ? d.slides.length : ns[Math.max(0, to - 1)].index
          d.slides.splice(at, 0, ...block)
        }, 'slides')
        return toolResult({
          order: nonStateSlides(d).map((e) => ({ id: e.slide.id, position: e.position, name: slideName(e.slide) })),
        })
      },
    },
    {
      name: 'set_slide_props',
      title: 'Update slide settings',
      description:
        'Patch provided fields of a slide: name, background color, transition, or speaker notes. transition:"morph" tweens elements that share an id/morphId with the PREVIOUS slide (position, size, fill, color). Omitted fields are unchanged. Undoable with ⌘Z.',
      inputSchema: {
        type: 'object',
        properties: {
          ...SLIDE_TARGET_PROPS,
          name: { type: 'string' },
          background: { type: 'string', description: 'CSS background color.' },
          transition: { type: 'string', enum: ['none', 'fade', 'slide', 'zoom', 'morph'] },
          notes: { type: 'string' },
        },
      },
      execute(args) {
        assertWritable(store)
        const { slide } = resolveSlide(store, args)
        store.commit(() => {
          if (typeof args.name === 'string') slide.name = args.name
          if (typeof args.background === 'string') slide.background = args.background
          if (typeof args.transition === 'string') slide.transition = args.transition as Slide['transition']
          if (typeof args.notes === 'string') slide.notes = args.notes
        }, 'slides')
        return toolResult({ slideId: slide.id, name: slide.name ?? null, background: slide.background, transition: slide.transition })
      },
    },

    // ---- ELEMENT COMMANDS ----------------------------------------------
    {
      name: 'add_elements',
      title: 'Add elements to a slide',
      description:
        `Add one or more elements to a slide in a single call (build a whole slide at once). ${GEOMETRY_NOTE} ` +
        'Each element: type (text|shape|image|chart|table) plus per-type fields — ' +
        'text:{text, fontSize?, color?, align?, bold?}; shape:{shape rect|ellipse|triangle|arrow|line, fill?, stroke?, strokeWidth?, radius?}; ' +
        'image:{src url-or-data-uri}; chart:{preset bar|line|pie|scatter, or option raw-ECharts-JSON, title?}; table:{rows string[][], header?}. ' +
        'Charts inherit the deck palette. Returns the created element ids in order. Undoable with ⌘Z.',
      inputSchema: {
        type: 'object',
        required: ['elements'],
        properties: {
          ...SLIDE_TARGET_PROPS,
          elements: {
            type: 'array',
            minItems: 1,
            description: 'Elements to add, painted in order (later ones on top).',
            items: {
              type: 'object',
              required: ['type'],
              properties: {
                type: { type: 'string', enum: ['text', 'shape', 'image', 'chart', 'table'] },
                x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' },
                text: { type: 'string' }, fontSize: { type: 'number' }, color: { type: 'string' },
                align: { type: 'string', enum: ['left', 'center', 'right'] }, bold: { type: 'boolean' },
                shape: { type: 'string', enum: ['rect', 'ellipse', 'triangle', 'arrow', 'line'] },
                fill: { type: 'string' }, stroke: { type: 'string' }, strokeWidth: { type: 'number' }, radius: { type: 'number' },
                src: { type: 'string' },
                preset: { type: 'string', enum: Object.keys(CHART_PRESETS) },
                option: { type: 'object', description: 'Raw ECharts-shape option (pure JSON); overrides preset.' },
                title: { type: 'string' },
                rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
                header: { type: 'boolean' },
              },
            },
          },
        },
      },
      execute(args) {
        assertWritable(store)
        const d = doc()
        const { slide } = resolveSlide(store, args)
        const specs = Array.isArray(args.elements) ? (args.elements as Record<string, unknown>[]) : []
        if (!specs.length) throw new Error('elements is required (a non-empty array)')
        const built = specs.map((spec) => buildElement(d, slide, spec))
        store.commit(() => { slide.elements.push(...built) }, 'doc')
        return toolResult(
          { slideId: slide.id, added: built.map((el) => ({ id: el.id, type: el.type })) },
          `Added ${built.length} element(s) to slide ${positionOf(d, slide.id) ?? ''}.`,
        )
      },
    },
    {
      name: 'update_elements',
      title: 'Update elements',
      description:
        'Merge a partial patch into one or more elements. IMPORTANT: element ids repeat across slides (the morph idiom), so pass slideId per edit whenever you are not targeting the slide open in the editor — a bare elementId resolves to the current slide\'s copy, then to a deck-wide unique match, and errors when ambiguous. Patch keys: x, y, w, h, rotation, opacity, text (replaces text content), fontSize, fontFamily, fontWeight, color, align, valign, fill, stroke, strokeWidth, radius, shape, src, fit, option (chart), link (slide id or null to clear), morphId (string or null to clear). Omitted keys are unchanged; an unknown key errors. Undoable with ⌘Z.',
      inputSchema: {
        type: 'object',
        required: ['edits'],
        properties: {
          edits: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['elementId', 'patch'],
              properties: {
                elementId: { type: 'string' },
                slideId: { type: 'string', description: 'Which slide\'s copy of the element to edit — required when the id exists on several slides and none of them is the current slide.' },
                patch: { type: 'object', description: 'Partial element properties to merge.' },
              },
            },
          },
        },
      },
      execute(args) {
        assertWritable(store)
        const edits = Array.isArray(args.edits) ? (args.edits as Record<string, unknown>[]) : []
        if (!edits.length) throw new Error('edits is required (a non-empty array)')
        // Validate all targets before mutating so a bad id fails atomically.
        const resolved = edits.map((e) => {
          const id = String(e.elementId ?? '')
          const found = resolveElement(store, id, e.slideId)
          return { slide: found.slide, el: found.el, patch: (e.patch ?? {}) as Record<string, unknown> }
        })
        store.commit(() => {
          for (const { el, patch } of resolved) applyPatch(el, patch)
        }, 'doc')
        return toolResult(
          { updated: resolved.map((r) => ({ elementId: r.el.id, slideId: r.slide.id })) },
          `Updated ${resolved.length} element(s).`,
        )
      },
    },
    {
      name: 'delete_elements',
      title: 'Delete elements',
      description:
        'Permanently remove elements by id. Element ids repeat across slides (the morph idiom): pass slideId to delete from that slide only; without it each id resolves to the current slide\'s copy, then to a deck-wide unique match, and errors when ambiguous. Undoable with ⌘Z.',
      inputSchema: {
        type: 'object',
        required: ['elementIds'],
        properties: {
          elementIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
          slideId: { type: 'string', description: 'Delete the ids from this slide only.' },
        },
      },
      annotations: { destructiveHint: true },
      execute(args) {
        assertWritable(store)
        const ids = Array.isArray(args.elementIds) ? (args.elementIds as unknown[]).map(String) : []
        if (!ids.length) throw new Error('elementIds is required (a non-empty array)')
        const targets = ids.map((id) => resolveElement(store, id, args.slideId))
        store.commit(() => {
          for (const t of targets) {
            t.slide.elements = t.slide.elements.filter((el) => el !== t.el)
          }
        }, 'doc')
        return toolResult(
          { deleted: targets.map((t) => ({ elementId: t.el.id, slideId: t.slide.id })) },
          `Deleted ${targets.length} element(s).`,
        )
      },
    },
    {
      name: 'align_elements',
      title: 'Align or distribute elements',
      description:
        'Align elements (by id) to an edge/center, and/or space them evenly along an axis. Pass slideId when the ids repeat across slides (the morph idiom) and you don\'t mean the current slide\'s copies. relativeTo "slide" (default) aligns to the slide bounds; "selection" aligns to the elements\' shared bounding box (needs 2+). Distribute needs 3+ elements (first and last stay put). Undoable with ⌘Z.',
      inputSchema: {
        type: 'object',
        required: ['elementIds'],
        properties: {
          elementIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
          slideId: { type: 'string', description: 'Which slide\'s copies of the ids to align.' },
          alignment: { type: 'string', enum: ['left', 'center-h', 'right', 'top', 'center-v', 'bottom'] },
          distribute: { type: 'string', enum: ['horizontal', 'vertical'] },
          relativeTo: { type: 'string', enum: ['slide', 'selection'], description: 'Default "slide".' },
        },
      },
      execute(args) {
        assertWritable(store)
        const d = doc()
        const ids = Array.isArray(args.elementIds) ? (args.elementIds as unknown[]).map(String) : []
        if (!ids.length) throw new Error('elementIds is required')
        if (!args.alignment && !args.distribute) throw new Error('provide alignment and/or distribute')
        const els = ids.map((id) => resolveElement(store, id, args.slideId).el)
        const relativeTo = args.relativeTo === 'selection' ? 'selection' : 'slide'
        if (relativeTo === 'selection' && args.alignment && els.length < 2) {
          throw new Error('aligning relative to "selection" needs 2+ elements')
        }
        if (args.distribute && els.length < 3) throw new Error('distribute needs 3+ elements')
        store.commit(() => {
          if (args.alignment) {
            const b: Bounds = relativeTo === 'selection'
              ? {
                  minX: Math.min(...els.map((e) => e.x)), minY: Math.min(...els.map((e) => e.y)),
                  maxX: Math.max(...els.map((e) => e.x + e.w)), maxY: Math.max(...els.map((e) => e.y + e.h)),
                }
              : { minX: 0, minY: 0, maxX: d.size.width, maxY: d.size.height }
            alignInBounds(els, args.alignment as Alignment, b)
          }
          if (args.distribute) distributeEvenly(els, args.distribute === 'vertical' ? 'vertical' : 'horizontal')
        }, 'doc')
        return toolResult({ positions: els.map((e) => ({ id: e.id, x: e.x, y: e.y })) })
      },
    },

    // ---- DECK COMMANDS --------------------------------------------------
    {
      name: 'set_deck_title',
      title: 'Rename the deck',
      description: 'Set the deck title. Undoable with ⌘Z.',
      inputSchema: { type: 'object', required: ['title'], properties: { title: { type: 'string' } } },
      execute(args) {
        assertWritable(store)
        const title = String(args.title ?? '').trim()
        if (!title) throw new Error('title is required')
        store.commit(() => { doc().title = title }, 'doc')
        return toolResult({ title })
      },
    },
    {
      name: 'set_theme',
      title: 'Set deck theme',
      description:
        'Restyle the deck DEFAULTS (background, text color, accent, font family) used for new elements and theme-derived colors. This does NOT recolor existing elements — they keep their explicit values. Patches only the fields you pass. Undoable with ⌘Z.',
      inputSchema: {
        type: 'object',
        properties: {
          background: { type: 'string' }, color: { type: 'string' },
          accent: { type: 'string' }, fontFamily: { type: 'string' },
        },
      },
      execute(args) {
        assertWritable(store)
        store.commit(() => {
          const th = doc().theme
          if (typeof args.background === 'string') th.background = args.background
          if (typeof args.color === 'string') th.color = args.color
          if (typeof args.accent === 'string') th.accent = args.accent
          if (typeof args.fontFamily === 'string') th.fontFamily = args.fontFamily
        }, 'doc')
        return toolResult({ theme: doc().theme })
      },
    },

    // ---- COMMENTS -------------------------------------------------------
    {
      name: 'add_comment',
      title: 'Add a review comment',
      description:
        'Leave a review comment on a slide. Anchor priority: elementId (on that element) > x/y (a point in slide coordinates) > whole slide. Editor-only metadata (never shown while presenting). Undoable with ⌘Z.',
      inputSchema: {
        type: 'object',
        required: ['text'],
        properties: {
          ...SLIDE_TARGET_PROPS,
          elementId: { type: 'string', description: 'Anchor the comment to this element.' },
          x: { type: 'number', description: 'Point anchor x (slide coords) when no elementId.' },
          y: { type: 'number', description: 'Point anchor y (slide coords) when no elementId.' },
          text: { type: 'string' },
        },
      },
      execute(args) {
        assertWritable(store)
        const { slide } = resolveSlide(store, args)
        const text = String(args.text ?? '').trim()
        if (!text) throw new Error('text is required')
        const author = (typeof localStorage !== 'undefined' && localStorage.getItem('bento-author')) || 'AI Copilot'
        const thread: Comment = { id: uid('cmt'), author, text, at: new Date().toISOString() }
        if (typeof args.elementId === 'string' && args.elementId) {
          if (!slide.elements.some((e) => e.id === args.elementId)) {
            throw new Error(`element "${args.elementId}" is not on slide "${slide.id}" — comments anchor to an element on the same slide`)
          }
          thread.elementId = args.elementId
        }
        else if (typeof args.x === 'number' && typeof args.y === 'number') { thread.x = args.x; thread.y = args.y }
        store.commit(() => {
          if (!slide.comments) slide.comments = []
          slide.comments.push(thread)
        }, 'slides')
        return toolResult({ commentId: thread.id, slideId: slide.id }, 'Comment added.')
      },
    },

    // ---- PRESENT --------------------------------------------------------
    {
      name: 'start_presentation',
      title: 'Start presenting',
      description:
        'Enter the slideshow. fromStart=true begins at slide 1, otherwise at the current slide. Fullscreen is requested but browsers may deny it without a direct user gesture — if so it opens filling the tab instead (still a valid show).',
      inputSchema: {
        type: 'object',
        properties: { fromStart: { type: 'boolean', description: 'Start from the first slide (default false = current slide).' } },
      },
      execute(args) {
        const fromStart = args.fromStart === true
        let note = 'Presentation started.'
        try {
          editor.present(fromStart, true)
        } catch (err) {
          note = `Presentation started (fullscreen may have been denied — showing in-tab). ${String(err)}`
        }
        return toolResult({ presenting: true, fromStart }, note)
      },
    },
  ]
}
