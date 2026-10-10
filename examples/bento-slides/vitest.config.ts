import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: [
      // These unit tests use only the real storage adapter from the package root.
      // Resolve it directly so they do not need built UI/lazy chunks.
      { find: /^@runtypelabs\/persona$/, replacement: fileURLToPath(new URL('../../packages/widget/src/utils/storage.ts', import.meta.url)) },
      { find: '@runtypelabs/persona/widget.css', replacement: fileURLToPath(new URL('../../packages/widget/src/styles/widget.css', import.meta.url)) },
    ],
  },
})
