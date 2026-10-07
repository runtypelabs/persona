// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento/Suite authors
// The spoken door. Persona's composer mic (in the Copilot rail) starts and
// ends the GPT-Live call; this module makes the call VISIBLE where the rail
// is not: a small fixed pill above everything — including the presentation
// overlay — that shows the live status (listening / thinking / speaking) and
// hangs up. While presenting it also offers "Talk to Copilot", so a show can
// be driven hands-free ("next", "jump to the pricing slide") without leaving
// fullscreen. The call itself lives in the widget; the pill only mirrors
// `voice:state` / `voice:status` and calls the controller.

import { t } from '../i18n'
import type { AiContext } from './tools'
import type { PaneController } from './pane'

export interface VoiceSurface {
  /** re-wire after the pane remounts */
  attach(controller: PaneController): void
  startCall(): boolean
  endCall(): boolean
  isActive(): boolean
  destroy(): void
}

type Status = 'disconnected' | 'connected' | 'listening' | 'processing' | 'speaking' | 'error' | 'idle'

export function createVoiceSurface(
  ctx: AiContext,
  host: { controller(): PaneController | null },
): VoiceSurface {
  let active = false
  let status: Status = 'disconnected'
  let unsubs: Array<() => void> = []

  // --- pill -------------------------------------------------------------------
  const pill = document.createElement('div')
  pill.className = 'ed-ai-call'
  const dot = document.createElement('i')
  dot.className = 'ed-ai-call-dot'
  const text = document.createElement('span')
  const action = document.createElement('button')
  action.type = 'button'
  pill.append(dot, text, action)
  document.body.appendChild(pill)

  const label = (): string => {
    if (!active) return t('Talk to Copilot')
    switch (status) {
      case 'listening': return t('Listening…')
      case 'processing': return t('Thinking…')
      case 'speaking': return t('Copilot is speaking')
      case 'error': return t('Voice error')
      case 'connected':
      case 'idle': return t('On a call')
      default: return t('Connecting…')
    }
  }

  const render = () => {
    const presenting = ctx.editor.isPresenting
    // the rail's own mic shows the state when it is on screen; the pill
    // covers presenting (overlay on top of the rail) and a hidden rail
    const show = presenting || (active && !ctx.editor.copilotOpen)
    pill.classList.toggle('on', show)
    pill.classList.toggle('active', active)
    pill.dataset.status = active ? status : 'off'
    text.textContent = label()
    action.textContent = active ? t('Hang up') : t('Start')
    action.title = active ? t('End the call') : t('Start a voice call with the Copilot')
  }

  action.addEventListener('click', () => {
    if (active) endCall()
    else startCall()
  })

  // --- controller wiring -------------------------------------------------------
  const attach = (controller: PaneController) => {
    unsubs.forEach((u) => u())
    unsubs = []
    active = controller.isVoiceActive()
    const onState = (e: { active: boolean }) => {
      active = e.active
      if (!active) status = 'disconnected'
      render()
    }
    const onStatus = (e: { status: Status }) => {
      status = e.status
      render()
    }
    controller.on('voice:state', onState)
    controller.on('voice:status', onStatus)
    unsubs.push(
      () => controller.off('voice:state', onState),
      () => controller.off('voice:status', onStatus),
    )
    render()
  }

  const startCall = (): boolean => {
    const c = host.controller()
    if (!c) return false
    if (c.isVoiceActive()) return true
    const ok = c.startVoiceRecognition()
    if (!ok) ctx.editor.toast(t('Couldn’t start the call — check the microphone permission.'))
    return ok
  }

  const endCall = (): boolean => {
    const c = host.controller()
    if (!c || !c.isVoiceActive()) return false
    return c.stopVoiceRecognition()
  }

  // presenting toggles the pill; the rail tab too (it decides who shows state)
  const prevPresent = ctx.editor.onPresentChange
  ctx.editor.onPresentChange = (on) => {
    prevPresent?.(on)
    render()
  }
  const prevTab = ctx.editor.onCopilotTabChange
  ctx.editor.onCopilotTabChange = (on) => {
    prevTab?.(on)
    render()
  }
  render()

  return {
    attach,
    startCall,
    endCall,
    isActive: () => active,
    destroy() {
      unsubs.forEach((u) => u())
      pill.remove()
    },
  }
}
