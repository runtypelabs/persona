/**
 * Standalone context-mentions chunk (`dist/context-mentions.js`).
 *
 * The IIFE/CDN widget bundle marks `./context-mentions-entry` external so the
 * mention runtime is excluded from the core payload; this file is built as a
 * self-contained sibling chunk (`tsup.context-mentions.config.ts`) and loaded on
 * demand by the loader registered in `index-global.ts`. ESM/CJS consumers import
 * the entry directly. See `docs/context-mentions-plan.md`.
 */

export { mountContextMentions } from "./context-mentions-entry";
export type {
  ContextMentionMountContext,
  ContextMentionEngine,
  MentionSubmitBundle,
} from "./context-mentions-entry";
