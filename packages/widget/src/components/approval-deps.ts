/**
 * Injected core dependencies for the lazy approval-ui chunk.
 *
 * The chunk is bundled `noExternal`, so importing the core icon registry
 * (~21 kB of path data) would duplicate it into the chunk, and importing
 * `getWebMcpToolDisplayTitle` from `webmcp-bridge` would read the CHUNK'S own
 * (empty) copy of the title map instead of the one the core bridge writes.
 * ui.ts injects both at chunk adoption (`initApprovalUi`), before any
 * approval bubble renders.
 */
export type ApprovalIconRenderer = (
  iconName: string,
  size?: number | string,
  color?: string,
  strokeWidth?: number
) => SVGElement | null;

export interface ApprovalUiDeps {
  renderIcon: ApprovalIconRenderer;
  webMcpToolTitle: (toolName: string) => string | undefined;
}

let iconRenderer: ApprovalIconRenderer | null = null;
let webMcpTitleLookup: (toolName: string) => string | undefined = () => undefined;

export const initApprovalUi = (deps: ApprovalUiDeps): void => {
  iconRenderer = deps.renderIcon;
  webMcpTitleLookup = deps.webMcpToolTitle;
};

/** Signature-compatible stand-in for `renderLucideIcon`; null until injected. */
export const renderApprovalIcon: ApprovalIconRenderer = (
  iconName,
  size,
  color,
  strokeWidth
) => (iconRenderer ? iconRenderer(iconName, size, color, strokeWidth) : null);

/** Stand-in for the core bridge's `getWebMcpToolDisplayTitle`. */
export const getWebMcpToolDisplayTitle = (toolName: string): string | undefined =>
  webMcpTitleLookup(toolName);
