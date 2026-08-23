/**
 * Runtime entry for the lazy approval-ui chunk: the built-in approval bubble,
 * its details-toggle state/updater, and the built-in approval plugin.
 *
 * NEVER statically imported on the core path — core reaches it only through
 * `approval-ui-loader.ts`. See `src/approval-ui.ts` for the transport module.
 */
export {
  approvalDetailsExpansionState,
  createApprovalBubble,
  humanizeToolName,
  updateApprovalDetailsUI,
} from "./components/approval-bubble";
export { createBuiltInApprovalPlugin } from "./components/approval-actions";
export { initApprovalUi } from "./components/approval-deps";
export type { ApprovalUiDeps } from "./components/approval-deps";
