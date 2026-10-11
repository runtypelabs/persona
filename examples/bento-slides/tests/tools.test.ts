// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { defaultShape, defaultText, newDoc } from '../slides/src/model'
import { Store } from '../slides/src/store'
import { resolveThemeRefs } from '../slides/src/palette'
import { setupBentoTools, teardownBentoTools, type AiContext } from '../slides/src/ai/tools'

afterEach(() => teardownBentoTools())

it('keeps explicit Copilot colors after the deck palette changes', async () => {
  const store = new Store(newDoc())
  const text = defaultText({ themeRefs: { color: 'tx1' } })
  const shape = defaultShape('rect', { themeRefs: { fill: 'accent1', stroke: 'tx1' } })
  store.slide.themeRefs = { background: 'bg1' }
  store.slide.elements = [text, shape]
  const tools = new Map<string, { execute(args: Record<string, unknown>): unknown }>()
  Object.defineProperty(document, 'modelContext', { configurable: true, value: {
    registerTool(tool: { name: string; execute(args: Record<string, unknown>): unknown }) { tools.set(tool.name, tool) },
  } })
  setupBentoTools({ store, editor: {} } as AiContext)
  await tools.get('update_elements')!.execute({ edits: [
    { elementId: text.id, patch: { color: '#123456' } },
    { elementId: shape.id, patch: { fill: '#234567', stroke: '#345678' } },
  ] })
  await tools.get('set_slide_props')!.execute({ background: '#456789' })
  store.doc.theme.color = '#ff0000'
  store.doc.theme.accent = '#00ff00'
  store.doc.theme.background = '#0000ff'
  resolveThemeRefs(store.doc)
  expect(text.color).toBe('#123456')
  expect(shape.fill).toBe('#234567')
  expect(shape.stroke).toBe('#345678')
  expect(store.slide.background).toBe('#456789')
  expect(text.themeRefs).toBeUndefined()
  expect(shape.themeRefs).toBeUndefined()
  expect(store.slide.themeRefs).toBeUndefined()
  store.undo()
  expect(store.slide.themeRefs?.background).toBe('bg1')
})
