import { createChunkLoader } from "./utils/chunk-loader";
import type {
  resolveApproval,
  resolveAskUserQuestion,
  resolveWebMcpToolCall,
  resolveWebMcpToolCallBatch,
} from "./session-actions";

/**
 * Loader indirection for the session's approval / ask-user-question / WebMCP
 * resolve paths (`session-actions.ts`). The ESM/CJS fallback imports
 * `./session-actions` directly (inlined by `--splitting false`); the IIFE/CDN
 * build marks it external and registers a loader for the sibling
 * `session-actions.js` chunk (see `index-global.ts`).
 */
export type SessionActionsModule = {
  resolveApproval: typeof resolveApproval;
  resolveAskUserQuestion: typeof resolveAskUserQuestion;
  resolveWebMcpToolCall: typeof resolveWebMcpToolCall;
  resolveWebMcpToolCallBatch: typeof resolveWebMcpToolCallBatch;
};

const { setLoader, load, provide, getSync } = createChunkLoader<SessionActionsModule>({
  fallbackImport: () => import("./session-actions"),
});

/** Override how the chunk is fetched (the IIFE build registers a sibling-URL loader). */
export const setSessionActionsLoader = setLoader;

/** Load the resolve paths. Memoized; retries after rejection. */
export const loadSessionActions = load;

/** Eagerly supply the module (`session-actions-eager.ts`: npm builds and tests). */
export const provideSessionActions = provide;

/** Synchronous access once loaded/provided; null before that. */
export const getSessionActionsSync = getSync;
