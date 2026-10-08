// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento/Suite authors
// Slide → PNG for the Copilot's eyes. The pipeline is deliberately the classic
// three-hop — renderSlide DOM → SVG <foreignObject> → <img> → canvas → PNG —
// so render.ts stays the ONLY slide renderer; this module rasterizes its
// output, it never re-implements layout. Bento is the best case for this
// technique: images/fonts are data: URIs and the stylesheet lives in-document,
// so the usual foreignObject killers (cross-origin taint, external CSS) mostly
// don't exist here. External-URL images simply don't load inside an SVG-as-img
// (the box renders empty, the canvas is NOT tainted) — automatic degradation.
//
// The pixels are consumed by a model, not an export path — 800px wide is
// plenty for layout/contrast judgment and keeps the payload small.

import { renderSlide } from '../render'
import type { BentoDoc, Slide } from '../model'

const XHTML = 'http://www.w3.org/1999/xhtml'
const SVGNS = 'http://www.w3.org/2000/svg'

/**
 * Every stylesheet reachable in-document, serialized once. A foreignObject
 * loaded via <img> cannot see the page's styles, so the SVG must carry them.
 * Cached: the app CSS and the boot-time @font-face block never change after
 * the AI module initializes.
 */
let cssCache: string | null = null
const collectCss = (): string => {
  if (cssCache !== null) return cssCache
  const parts: string[] = []
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      parts.push(Array.from(sheet.cssRules).map((r) => r.cssText).join('\n'))
    } catch {
      /* cross-origin sheet — none in the self-contained shell, skip */
    }
  }
  cssCache = parts.join('\n')
  return cssCache
}

/**
 * Rasterize one slide to a PNG data URI, `width` px wide (aspect follows
 * doc.size). Returns null when the browser can't complete the pipeline —
 * callers degrade to the JSON-only behavior they had before.
 */
export async function slideSnapshot(doc: BentoDoc, slide: Slide, width = 800): Promise<string | null> {
  try {
    const W = doc.size.width
    const H = doc.size.height

    // The same static render the sidebar/transcript thumbnails use: svg
    // elements and charts become <img data:svg>, media becomes a poster/icon,
    // placeholder prompts are hidden.
    const surface = renderSlide(slide, doc, { svgAsImage: true, hidePlaceholders: true })
    surface.style.width = `${W}px`
    surface.style.height = `${H}px`

    const svg = document.createElementNS(SVGNS, 'svg')
    svg.setAttribute('xmlns', SVGNS)
    svg.setAttribute('width', String(W))
    svg.setAttribute('height', String(H))
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
    const fo = document.createElementNS(SVGNS, 'foreignObject')
    fo.setAttribute('width', '100%')
    fo.setAttribute('height', '100%')
    const wrap = document.createElementNS(XHTML, 'div') as HTMLElement
    wrap.style.width = `${W}px`
    wrap.style.height = `${H}px`
    const style = document.createElementNS(XHTML, 'style')
    style.textContent = collectCss()
    wrap.append(style, surface)
    fo.appendChild(wrap)
    svg.appendChild(fo)

    // XMLSerializer emits well-formed XML (self-closed voids, escaped text) —
    // the escape/parse round-trip is identity, so the CSS survives intact.
    const xml = new XMLSerializer().serializeToString(svg)
    const img = new Image()
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`
    await img.decode()

    const scale = width / W
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(W * scale)
    canvas.height = Math.round(H * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } catch (err) {
    console.warn('[Bento AI] slide snapshot failed', err)
    return null
  }
}
