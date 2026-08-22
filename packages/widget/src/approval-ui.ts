/**
 * Subpath/chunk module for the lazy approval UI
 * (`@runtypelabs/persona/approval-ui` → `dist/approval-ui.{js,cjs}`).
 *
 * Transport-entry only: re-exports the mount contract from
 * `./approval-ui-entry`. The core bundle loads this on demand via
 * `approval-ui-loader.ts` — the IIFE from a sibling URL, ESM/CJS via this
 * external subpath.
 */
export {
  approvalDetailsExpansionState,
  createApprovalBubble,
  createBuiltInApprovalPlugin,
  humanizeToolName,
  initApprovalUi,
  updateApprovalDetailsUI,
} from "./approval-ui-entry";
export type { ApprovalUiDeps } from "./approval-ui-entry";
