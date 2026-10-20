// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { setEncryptionPassword } from '../kernel/src/save'
import { createCopilotStorage } from '../slides/src/ai/storage'

const key = 'persona-state-bento-copilot'
const secret = { messages: [{ id: 'm1', role: 'assistant' as const, content: 'Private deck notes', createdAt: new Date().toISOString() }] }
afterEach(() => { setEncryptionPassword(null); localStorage.clear() })

it('clears old chat immediately when encryption is enabled and blocks later saves', async () => {
  const storage = createCopilotStorage()
  try {
    await storage.adapter.save?.(secret)
    expect(localStorage.getItem(key)).toContain('Private deck notes')
    setEncryptionPassword('secret')
    expect(localStorage.getItem(key)).toBeNull()
    await storage.adapter.save?.(secret)
    expect(localStorage.getItem(key)).toBeNull()
    expect(await storage.adapter.load?.()).toBeNull()
  } finally { storage.dispose() }
})

it('purges previous plaintext when opening an encrypted deck', async () => {
  localStorage.setItem(key, JSON.stringify(secret))
  setEncryptionPassword('secret')
  const storage = createCopilotStorage()
  try {
    expect(localStorage.getItem(key)).toBeNull()
    expect(await storage.adapter.load?.()).toBeNull()
  } finally { storage.dispose() }
})
