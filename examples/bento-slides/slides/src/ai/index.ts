// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento/Suite authors
// Bento Copilot orchestrator — one copilot, six doors, one tool layer:
//   1. the Copilot tab in the right rail (./pane — Persona mounted headless)
//   2. the voice call (./voice — GPT-Live through the rail's mic, or the
//      call pill while presenting; spoken requests run the same tools)
//   3. the selection bar on canvas (./selectionbar — quiet one-shot verbs)
//   4. the ⌘K palette (./palette — native commands, AI fall-through)
//   5. the ghost prompt on empty slides (./ghost)
//   6. @copilot in review comments (./comments)
// plus presenter-mode tool swap and turn choreography (./quiet: working pill,
// provenance shimmer, toasts). Every door submits into the SAME Persona
// session and the same WebMCP tool layer; every edit rides Bento's ⌘Z.
// Offline mode (the hard no-network switch) mounts none of it.

import '@runtypelabs/persona/widget.css'
import { initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill'
import { t } from '../i18n'
import { offlineEnabled } from '../update'
import { onOfflineEnforced } from '../../../kernel/src/net.ts'
import {
  setupBentoTools,
  setupPresenterTools,
  teardownPresenterTools,
  type AiContext,
} from './tools'
import { mountCopilotPane, paneController, unmountCopilotPane } from './pane'
import { createTurnManager } from './quiet'
import { createPalette } from './palette'
import { createSelectionBar } from './selectionbar'
import { createGhostPrompt } from './ghost'
import { createCommentsCopilot } from './comments'
import { createVoiceSurface } from './voice'

export interface BentoAiApi {
  /** the live Persona controller (or null when offline) */
  controller(): unknown
  /** open the Copilot tab */
  openRail(): void
  /** open the ⌘K palette */
  openPalette(): void
  /** run every unresolved review comment through the Copilot */
  fixAllFlagged(): void
  /** submit a prompt as a quiet turn (edits land on canvas, rail stays shut) */
  ask(prompt: string): void
  /** start / end the GPT-Live voice call */
  call(): boolean
  hangUp(): boolean
  callActive(): boolean
}

export function initAI(ctx: AiContext): BentoAiApi {
  // The polyfill must install document.modelContext before tools register.
  initializeWebMCPPolyfill()
  setupBentoTools(ctx)

  // Offline mode: the tool layer stays (it's local, and other in-page
  // consumers may use it) but no AI surface mounts and no network is touched.
  if (offlineEnabled()) {
    const noop = () => undefined
    return {
      controller: () => null,
      openRail: noop, openPalette: noop, fixAllFlagged: noop, ask: noop,
      call: () => false, hangUp: () => false, callActive: () => false,
    }
  }

  const openRail = () => {
    ctx.editor.setCopilotTab(true)
  }

  // presenter-mode tool swap: while the show runs the model gets nav tools
  // (and get_deck_overview to find "the pricing slide"), nothing else. The
  // voice call, if one is up, simply carries on across the swap. Set BEFORE
  // the voice surface, which chains its own listener onto this hook.
  ctx.editor.onPresentChange = (on) => {
    if (on) setupPresenterTools(ctx)
    else {
      teardownPresenterTools()
      setupBentoTools(ctx)
    }
  }

  const turns = createTurnManager(ctx, { openRail, controller: () => paneController() })
  const voice = createVoiceSurface(ctx, { controller: () => paneController() })

  // created before mount() so the pane's /fix-flagged slash command can reach it
  const comments = createCommentsCopilot(ctx, turns)

  const mount = () => {
    if (offlineEnabled()) return
    const controller = mountCopilotPane(ctx, {
      openRail,
      fixFlagged: () => comments.fixAllFlagged(),
    })
    turns.attach(controller)
    voice.attach(controller)
  }

  ctx.editor.enableCopilotTab()
  mount()

  // the rail's reset: a fresh conversation. A running turn is aborted by the
  // clear, and a call hangs up so the voice model doesn't carry the old chat.
  ctx.editor.onCopilotReset = () => {
    const controller = paneController()
    if (!controller) return
    voice.endCall()
    controller.clearChat()
    turns.abandon()
    ctx.editor.toast(t('New chat.'))
  }

  // Offline switched on mid-session (here or in another tab): the kernel cuts
  // its own requests and sockets, but Persona's chat stream and voice socket
  // are not the kernel's — hang up and unmount so nothing else leaves.
  onOfflineEnforced(() => {
    voice.endCall()
    unmountCopilotPane()
    ctx.editor.toast(t('Offline mode — the Copilot is disconnected. Reload after going back online.'))
  })
  // A locale switch re-authors the editor DOM (build()), taking the rail
  // containers with it — re-adopt the fresh ones.
  ctx.editor.onRebuild = () => {
    ctx.editor.enableCopilotTab()
    mount()
  }

  // --- the doors --------------------------------------------------------------

  const palette = createPalette(ctx, turns, () => [
    {
      id: 'ai-rail',
      label: t('Toggle Copilot rail'),
      hint: '⌘J',
      run: () => ctx.editor.toggleCopilot(),
    },
    {
      id: 'ai-call',
      label: voice.isActive() ? t('Hang up the Copilot call') : t('Talk to Copilot'),
      hint: t('Voice call — speak your edits'),
      run: () => (voice.isActive() ? voice.endCall() : voice.startCall()),
    },
    {
      id: 'ai-fix-flagged',
      label: t('Fix everything flagged in comments'),
      hint: t('Runs every unresolved comment through the Copilot'),
      run: () => comments.fixAllFlagged(),
    },
  ])
  createSelectionBar(ctx, turns)
  createGhostPrompt(ctx, palette)

  document.addEventListener(
    'keydown',
    (ev) => {
      const mod = ev.metaKey || ev.ctrlKey
      if (!mod || ctx.editor.isPresenting) return
      if (ev.key.toLowerCase() === 'k') {
        ev.preventDefault()
        ev.stopPropagation()
        palette.isOpen() ? palette.close() : palette.open()
      } else if (ev.key.toLowerCase() === 'j') {
        ev.preventDefault()
        ev.stopPropagation()
        ctx.editor.toggleCopilot()
      }
    },
    true,
  )

  return {
    controller: () => paneController(),
    openRail,
    openPalette: () => palette.open(),
    fixAllFlagged: () => comments.fixAllFlagged(),
    ask: (prompt: string) => turns.ask(prompt, { quiet: true, source: 'api' }),
    call: () => voice.startCall(),
    hangUp: () => voice.endCall(),
    callActive: () => voice.isActive(),
  }
}

export { unmountCopilotPane }
