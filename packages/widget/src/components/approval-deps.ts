import type { renderLucideIcon } from "../utils/icons";
import type { renderIconNode } from "../utils/icon-node";
import type { createPopover, isEditableEventTarget } from "../plugin-kit";
/**
 * Injected core dependencies for the lazy approval-ui chunk.
 *
 * The chunk is bundled `noExternal`, so importing `getWebMcpToolDisplayTitle`
 * from `webmcp-bridge` would read the CHUNK'S own (empty) copy of the title
 * map instead of the one the core bridge writes. ui.ts injects the real
 * lookup at chunk adoption (`initApprovalUi`), before any approval bubble
 * renders. Icon factories and popover helpers are injected at the same seam
 * to reuse core's registry and avoid duplicated interaction code.
 */
export interface ApprovalUiDeps {
  icons?: { render: typeof renderLucideIcon; node: typeof renderIconNode };
  popover?: { createPopover: typeof createPopover; isEditableEventTarget: typeof isEditableEventTarget };
  webMcpToolTitle: (toolName: string) => string | undefined;
}

let icons: ApprovalUiDeps["icons"];
export const renderApprovalIcon: typeof renderLucideIcon = (...args) => icons?.render(...args) ?? null;
export const renderApprovalIconNode: typeof renderIconNode = (...args) => icons?.node(...args) ?? null;

let popover: ApprovalUiDeps["popover"];
export const getApprovalPopoverDeps = () => {
  if (!popover) throw new Error("Approval UI requires core popover dependencies.");
  return popover;
};

let webMcpTitleLookup: (toolName: string) => string | undefined = () => undefined;

export const initApprovalUi = (deps: ApprovalUiDeps): void => {
  webMcpTitleLookup = deps.webMcpToolTitle;
  if (deps.icons) icons = deps.icons;
  if (deps.popover) popover = deps.popover;
};

/** Stand-in for the core bridge's `getWebMcpToolDisplayTitle`. */
export const getWebMcpToolDisplayTitle = (toolName: string): string | undefined =>
  webMcpTitleLookup(toolName);
