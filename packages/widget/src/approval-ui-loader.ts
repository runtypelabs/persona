import { createChunkLoader } from "./utils/chunk-loader";
import type { AgentWidgetMessage, AgentWidgetConfig } from "./types";
import type { AgentWidgetPlugin } from "./plugins/types";
import type { ApprovalUiDeps } from "./components/approval-deps";

/**
 * Loader indirection for the lazy approval-ui chunk. Stays in the core
 * bundle. The fallback import must be the literal package subpath:
 * `build:client` runs with `--splitting false`, so a relative import would be
 * inlined; the subpath is marked `--external` and resolves through the
 * package's own `exports` map at consumer runtime (see
 * `history-view-loader.ts` for the full rationale).
 */
export type ApprovalUiModule = {
  approvalDetailsExpansionState: Map<string, boolean>;
  createApprovalBubble: (
    message: AgentWidgetMessage,
    config?: AgentWidgetConfig
  ) => HTMLElement;
  updateApprovalDetailsUI: (
    messageId: string,
    bubble: HTMLElement,
    config?: AgentWidgetConfig
  ) => void;
  humanizeToolName: (toolName: string) => string;
  createBuiltInApprovalPlugin: () => {
    plugin: AgentWidgetPlugin;
    teardown: () => void;
  };
  initApprovalUi: (deps: ApprovalUiDeps) => void;
};

const { setLoader, load, provide, getSync } = createChunkLoader<ApprovalUiModule>({
  fallbackImport: () => import("@runtypelabs/persona/approval-ui"),
});

/** Override how the chunk is fetched (the IIFE build registers a sibling-URL loader). */
export const setApprovalUiLoader = setLoader;

/** Load the approval UI. Memoized; retries after rejection. */
export const loadApprovalUi = load;

/** Eagerly supply the module (tests that assert synchronous approval renders). */
export const provideApprovalUi = provide;

/** Synchronous access once loaded/provided; null before that. */
export const getApprovalUiSync = getSync;
