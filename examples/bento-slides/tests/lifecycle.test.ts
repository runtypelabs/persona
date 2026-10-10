// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { Store } from '../slides/src/store'
import { newDoc } from '../slides/src/model'
import type { AiContext } from '../slides/src/ai/tools'

const pane = vi.hoisted(() => {
  const controllers: Array<ReturnType<typeof create>> = []
  function create() {
    const events = new Map<string, Set<(...args: unknown[]) => void>>()
    let active = false
    let destroyed = false
    const c = {
      destroy: vi.fn(() => { destroyed = true; active = false; events.clear() }),
      clearChat: vi.fn(),
      on: (name: string, fn: (...args: unknown[]) => void) => {
        if (!events.has(name)) events.set(name, new Set())
        events.get(name)!.add(fn)
        return () => events.get(name)?.delete(fn)
      },
      off: (name: string, fn: (...args: unknown[]) => void) => events.get(name)?.delete(fn),
      submitMessage: vi.fn(() => { events.get('user:message')?.forEach(fn => fn()) }),
      isVoiceActive: () => active,
      startVoiceRecognition: vi.fn(() => true),
      stopVoiceRecognition: vi.fn(() => { active = false; return true }),
      grantMicrophone: () => { if (!destroyed) active = true },
    }
    return c
  }
  return {
    controllers,
    current: () => controllers.at(-1) ?? null,
    mount: () => { controllers.at(-1)?.destroy(); const c = create(); controllers.push(c); return c },
  }
})
vi.mock('../slides/src/ai/pane', () => ({
  mountCopilotPane: pane.mount, paneController: pane.current,
  unmountCopilotPane: () => pane.current()?.destroy(),
  paneIsStreaming: () => true, stopStreaming: vi.fn(),
}))
vi.mock('@mcp-b/webmcp-polyfill', () => ({ initializeWebMCPPolyfill: vi.fn() }))
vi.mock('../slides/src/update', () => ({ offlineEnabled: () => false }))
vi.mock('../kernel/src/net.ts', () => ({ onOfflineEnforced: vi.fn(), sharedStorageOrigin: () => '' }))
vi.mock('../slides/src/ai/palette', () => ({ createPalette: () => ({ isOpen: () => false, open() {}, close() {} }) }))
vi.mock('../slides/src/ai/selectionbar', () => ({ createSelectionBar: vi.fn() }))
vi.mock('../slides/src/ai/ghost', () => ({ createGhostPrompt: vi.fn() }))
import { initAI } from '../slides/src/ai/index'

function setup() {
  const editor = { enableCopilotTab: vi.fn(), setCopilotTab: vi.fn(), toast: vi.fn() }
  const ctx = { store: new Store(newDoc()), editor } as unknown as AiContext
  const api = initAI(ctx)
  return { ctx, api, first: pane.current()! }
}
afterEach(() => { vi.useRealTimers(); pane.controllers.length = 0; document.body.replaceChildren() })

it('destroys pending microphone startup when starting a new chat', () => {
  const { ctx, api, first } = setup()
  expect(api.call()).toBe(true)
  ctx.editor.onCopilotReset?.()
  first.grantMicrophone()
  expect(first.destroy).toHaveBeenCalledOnce()
  expect(first.isVoiceActive()).toBe(false)
  expect(pane.current()).not.toBe(first)
})

it('abandons an in-flight comment on locale rebuild and accepts another turn', async () => {
  vi.useFakeTimers()
  const { ctx, api, first } = setup()
  ctx.store.slide.comments = [{ id: 'review', author: 'Reviewer', text: '@copilot tighten this slide', at: new Date().toISOString() }]
  ctx.store.emit('doc')
  await vi.advanceTimersByTimeAsync(600)
  expect(first.submitMessage).toHaveBeenCalledOnce()
  ctx.editor.onRebuild?.()
  await vi.advanceTimersByTimeAsync(1000)
  expect(ctx.store.slide.comments[0].replies).toBeUndefined()
  expect(ctx.editor.toast).toHaveBeenCalledWith(expect.stringContaining('didn’t finish'))
  api.ask('A new request')
  expect(pane.current()!.submitMessage).toHaveBeenCalledWith('A new request')
})
