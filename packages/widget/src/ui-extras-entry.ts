/**
 * Entry for the lazy `ui-extras` chunk: `ui.ts` glue for opt-in or
 * interaction-only features, kept out of the IIFE/CDN core bundle. See
 * `ui-extras-loader.ts`.
 */
export { createAskUserSheetHandlers } from "./ui-ask-user-sheet";
// Context-mention orchestrator (opt-in `contextMentions.enabled`). Callers pass
// core's loaders / icon registry via `deps` so this chunk's copies stay unused.
export { createContextMentionOrchestrator } from "./utils/context-mention-orchestrator";
