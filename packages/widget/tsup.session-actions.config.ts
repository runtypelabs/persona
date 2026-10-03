import { defineConfig } from "tsup";

/**
 * Dedicated config for the standalone session resolve-paths chunk
 * (`dist/session-actions.js`: approvals, ask_user_question answers, WebMCP /
 * suggest_replies resumes). `tsup.global.config.ts` marks `./session-actions`
 * external and `index-global.ts` registers a sibling-URL loader for this file;
 * the session prefetches it when the agent pauses. ESM/CJS builds inline
 * `./session-actions` instead, so only CDN consumers load this file.
 */
export default defineConfig({
  entry: { "session-actions": "src/session-actions.ts" },
  format: ["esm"],
  minify: true,
  splitting: false,
  outDir: "dist",
  // Other lazy chunks stay external: any loader copy in here only holds a dead
  // dynamic import (core injects its own loaders), so inlining them would just
  // bloat this chunk with code it never runs.
  noExternal: [/^(?!\.\/markdown-parsers-entry$)(?!@runtypelabs\/persona\/).*/],
  external: ["./markdown-parsers-entry", /^@runtypelabs\/persona\//],
});
