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
      // Same for the lazy activity-ui (tool / reasoning bubbles) chunk subpath.
      '@runtypelabs/persona/activity-ui': fileURLToPath(
        new URL('./src/activity-ui.ts', import.meta.url)
      ),
      // Same for the lazy event-stream-view chunk subpath.
      '@runtypelabs/persona/event-stream-view': fileURLToPath(
        new URL('./src/event-stream-view.ts', import.meta.url)
      ),
      // Same for the lazy session-reconnect chunk subpath.
      '@runtypelabs/persona/session-reconnect': fileURLToPath(
        new URL('./src/session-reconnect.ts', import.meta.url)
      ),
      // Same for the lazy webmcp-runtime chunk subpath.
      '@runtypelabs/persona/webmcp-runtime': fileURLToPath(
        new URL('./src/webmcp-runtime.ts', import.meta.url)
      ),
      // Same for the lazy icons-extra chunk subpath.
      '@runtypelabs/persona/icons-extra': fileURLToPath(
        new URL('./src/icons-extra.ts', import.meta.url)
      ),
      // Same for the lazy artifacts-ui chunk subpath.
      '@runtypelabs/persona/artifacts-ui': fileURLToPath(
        new URL('./src/artifacts-ui.ts', import.meta.url)
      ),
      // Same for the lazy voice-runtime chunk subpath.
      '@runtypelabs/persona/voice-runtime': fileURLToPath(
        new URL('./src/voice-runtime.ts', import.meta.url)
      ),
      // Keep UI-mount tests on source when the dist package has not been built.
      '@runtypelabs/persona/forms-ui': fileURLToPath(
        new URL('./src/forms-ui.ts', import.meta.url)
      ),
      // Lazy core chunks the loaders self-reference (vitest.setup.ts provides
      // them eagerly; tests that simulate the lazy path still resolve source).
      '@runtypelabs/persona/client-stream': fileURLToPath(
        new URL('./src/client-stream.ts', import.meta.url)
      ),
      '@runtypelabs/persona/client-history': fileURLToPath(
        new URL('./src/client-history.ts', import.meta.url)
      ),
      '@runtypelabs/persona/ui-extras': fileURLToPath(
        new URL('./src/ui-extras-entry.ts', import.meta.url)
      ),
      '@runtypelabs/persona/session-actions': fileURLToPath(
        new URL('./src/session-actions.ts', import.meta.url)
      ),
      '@runtypelabs/persona/history-shell': fileURLToPath(
        new URL('./src/history-shell.ts', import.meta.url)
      ),
      '@runtypelabs/persona/runtype-tts': fileURLToPath(
        new URL('./src/voice/runtype-tts-entry.ts', import.meta.url)
      ),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
  },
});
