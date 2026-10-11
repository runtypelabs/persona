// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { defaultText, emptySlide, newDoc } from '../slides/src/model'
import { Store } from '../slides/src/store'
import { setupPresenterTools, teardownPresenterTools, type AiContext } from '../slides/src/ai/tools'

interface Registered {
  name: string
  inputSchema: { properties: Record<string, { enum?: string[] }>; required?: string[] }
  annotations?: Record<string, unknown>
  execute(args: Record<string, unknown>): unknown
}

afterEach(() => {
  teardownPresenterTools()
  vi.useRealTimers()
})

function presenting() {
  const doc = newDoc()
  doc.title = 'Bakery pitch'
  doc.slides = [
    emptySlide({ name: 'Welcome' }),
    emptySlide({ name: 'Agenda', elements: [defaultText({ html: 'Agenda' }), defaultText({ html: 'Breads<br>Pastries' })] }),
    emptySlide({ name: 'Pricing', notes: 'mention the bundle' }),
  ]
  const store = new Store(doc)
  let index = 0
  const exit = vi.fn()
  const session = {
    next: () => { index = Math.min(index + 1, doc.slides.length - 1) },
    prev: () => { index = Math.max(index - 1, 0) },
    goTo: (i: number) => { index = i },
    currentIndex: () => index,
    exit,
  }
  const tools = new Map<string, Registered>()
  Object.defineProperty(document, 'modelContext', { configurable: true, value: {
    registerTool(tool: Registered) { tools.set(tool.name, tool) },
  } })
  setupPresenterTools({ store, editor: { presentSession: session } } as unknown as AiContext)
  return { tools, exit }
}

it('answers presenter navigation with a speakable slide title', async () => {
  const { tools } = presenting()
  expect(await tools.get('next_slide')!.execute({})).toMatchObject({ title: 'Slide 2: Agenda', structuredContent: { position: 2 } })
  expect(await tools.get('prev_slide')!.execute({})).toMatchObject({ title: 'Slide 1: Welcome' })
})

it('names jump targets from a closed list of slide labels', async () => {
  const { tools } = presenting()
  const jump = tools.get('jump_to_slide')!
  expect(jump.inputSchema.required).toEqual(['slide'])
  expect(jump.inputSchema.properties.slide.enum).toEqual(['Slide 1: Welcome', 'Slide 2: Agenda', 'Slide 3: Pricing'])
  expect(await jump.execute({ slide: 'Slide 3: Pricing' })).toMatchObject({ title: 'Slide 3: Pricing' })
  await expect(async () => jump.execute({ slide: 'pricing' })).rejects.toThrow(/unknown slide/)
})

it('reads the slide on screen, or a named one, as spoken text', async () => {
  const { tools } = presenting()
  await tools.get('next_slide')!.execute({})
  expect(await tools.get('get_slide')!.execute({})).toMatchObject({ text: 'Slide 2: Agenda. Breads Pastries' })
  expect(await tools.get('get_slide')!.execute({ slide: 'Slide 1: Welcome' })).toMatchObject({ text: 'Slide 1: Welcome. It has no text.' })
})

it('summarizes the deck outline for the overview', async () => {
  const { tools } = presenting()
  expect(await tools.get('get_deck_overview')!.execute({})).toMatchObject({
    summary: '"Bakery pitch" has 3 slides: 1 Welcome; 2 Agenda; 3 Pricing.',
  })
})

it('ends the show only after the exit result is returned', async () => {
  vi.useFakeTimers()
  const { tools, exit } = presenting()
  expect(await tools.get('exit_presentation')!.execute({})).toMatchObject({ title: 'Presentation ended' })
  expect(exit).not.toHaveBeenCalled()
  vi.runAllTimers()
  expect(exit).toHaveBeenCalledOnce()
})

it('marks every presenter tool read-only and gives each a closed-domain schema', () => {
  const { tools } = presenting()
  for (const tool of tools.values()) {
    expect(tool.annotations?.readOnlyHint, tool.name).toBe(true)
    for (const [param, schema] of Object.entries(tool.inputSchema.properties)) {
      expect(Array.isArray(schema.enum), `${tool.name}.${param}`).toBe(true)
    }
  }
})
