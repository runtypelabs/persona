import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // The context-mentions loader self-references the package's `./context-mentions`
      // subpath (external in the published build). In tests, resolve it to source so
      // the lazy-load fallback exercises the real runtime without a dist build.
      '@runtypelabs/persona/context-mentions': fileURLToPath(
        new URL('./src/context-mentions.ts', import.meta.url)
      ),
      // Same for the inline-mention chunk subpath. (Vite string aliases only
      // match exact or `alias + "/"`, so this and the base alias above never
      // collide despite the shared prefix.)
      '@runtypelabs/persona/context-mentions-inline': fileURLToPath(
        new URL('./src/context-mentions-inline.ts', import.meta.url)
      ),
      // Same for the lazy history-view chunk subpath.
      '@runtypelabs/persona/history-view': fileURLToPath(
        new URL('./src/history-view.ts', import.meta.url)
      ),
      // Same for the lazy stream-animations chunk subpath.
      '@runtypelabs/persona/animations-extra': fileURLToPath(
        new URL('./src/animations-extra.ts', import.meta.url)
      ),
      // Same for the lazy approval-ui chunk subpath.
      '@runtypelabs/persona/approval-ui': fileURLToPath(
        new URL('./src/approval-ui.ts', import.meta.url)
      ),
      // Same for the lazy event-stream-view chunk subpath.
      '@runtypelabs/persona/event-stream-view': fileURLToPath(
        new URL('./src/event-stream-view.ts', import.meta.url)
      ),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
  },
});
