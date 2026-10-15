// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento/Suite authors

import { createLocalStorageAdapter, type AgentWidgetStorageAdapter } from '@runtypelabs/persona'
import { isEncryptionActive, onEncryptionChange } from '../../../kernel/src/save'

/** Chat/tool output may contain the decrypted deck. Never persist it in plaintext. */
export function createCopilotStorage(): { adapter: AgentWidgetStorageAdapter; dispose(): void } {
  const storage = createLocalStorageAdapter('persona-state-bento-copilot')
  const canPersist = () => {
    if (!isEncryptionActive()) return true
    storage.clear?.()
    return false
  }
  const dispose = onEncryptionChange(() => { canPersist() })
  canPersist() // Purge a previous session before Persona tries to restore it.
  return {
    adapter: {
      load: () => canPersist() ? storage.load?.() ?? null : null,
      save: state => { if (canPersist()) return storage.save?.(state) },
      clear: () => storage.clear?.(),
    },
    dispose,
  }
}
