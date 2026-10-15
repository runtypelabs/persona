// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento/Suite authors
// Mini slide renders for the Copilot transcript (tool-result chips, approval
// previews). Same shared renderer as the sidebar/thumbnails — the transcript
// reads like a filmstrip, not a log.

import { renderSlide, type RenderOpts } from '../render'
import type { BentoDoc, Slide } from '../model'

/** A scaled-down live render of one slide, `width` px wide. */
export function slideThumb(doc: BentoDoc, slide: Slide, width = 148, opts: RenderOpts = {}): HTMLElement {
  const scale = width / doc.size.width
  const box = document.createElement('div')
  box.className = 'ed-ai-thumb'
  box.style.width = `${width}px`
  box.style.height = `${Math.round(doc.size.height * scale)}px`
  const inner = renderSlide(slide, doc, { svgAsImage: true, hidePlaceholders: true, ...opts })
  inner.style.width = `${doc.size.width}px`
  inner.style.height = `${doc.size.height}px`
  inner.style.transform = `scale(${scale})`
  inner.style.transformOrigin = 'top left'
  box.appendChild(inner)
  return box
}

/** Thumb for a slide id if it still exists (deleted slides render nothing). */
export function slideThumbById(doc: BentoDoc, slideId: string, width = 148): HTMLElement | null {
  const slide = doc.slides.find((s) => s.id === slideId)
  return slide ? slideThumb(doc, slide, width) : null
}

/** Pull likely slide ids out of a tool's structured result, in order. */
export function slideIdsIn(data: unknown): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const walk = (v: unknown) => {
    if (!v) return
    if (Array.isArray(v)) { v.forEach(walk); return }
    if (typeof v !== 'object') return
    const o = v as Record<string, unknown>
    for (const key of ['slideId', 'deletedSlideIds']) {
      const val = o[key]
      if (typeof val === 'string' && !seen.has(val)) { seen.add(val); out.push(val) }
      if (Array.isArray(val)) for (const s of val) if (typeof s === 'string' && !seen.has(s)) { seen.add(s); out.push(s) }
    }
    Object.values(o).forEach(walk)
  }
  walk(data)
  return out
}

/** Pull element ids out of a tool's structured result. */
export function elementIdsIn(data: unknown): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (s: unknown) => { if (typeof s === 'string' && !seen.has(s)) { seen.add(s); out.push(s) } }
  const walk = (v: unknown) => {
    if (!v) return
    if (Array.isArray(v)) { v.forEach(walk); return }
    if (typeof v !== 'object') return
    const o = v as Record<string, unknown>
    push(o.elementId)
    for (const key of ['added', 'updated', 'deleted']) {
      const val = o[key]
      if (Array.isArray(val)) for (const item of val) {
        if (typeof item === 'string') push(item)
        else if (item && typeof item === 'object') push((item as Record<string, unknown>).id ?? (item as Record<string, unknown>).elementId)
      }
    }
    if (Array.isArray(o.updatedElementIds)) o.updatedElementIds.forEach(push)
    if (Array.isArray(o.deletedElementIds)) o.deletedElementIds.forEach(push)
    Object.values(o).forEach(walk)
  }
  walk(data)
  return out
}
