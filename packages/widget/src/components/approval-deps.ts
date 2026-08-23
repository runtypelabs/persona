/**
 * Injected core dependencies for the lazy approval-ui chunk.
 *
 * The chunk is bundled `noExternal`, so importing `getWebMcpToolDisplayTitle`
 * from `webmcp-bridge` would read the CHUNK'S own (empty) copy of the title
 * map instead of the one the core bridge writes. ui.ts injects the real
 * lookup at chunk adoption (`initApprovalUi`), before any approval bubble
 * renders. (Icons need no injection: the approval components use direct
 * per-icon lucide data imports.)
 */
export interface ApprovalUiDeps {
  webMcpToolTitle: (toolName: string) => string | undefined;
}

let webMcpTitleLookup: (toolName: string) => string | undefined = () => undefined;

export const initApprovalUi = (deps: ApprovalUiDeps): void => {
  webMcpTitleLookup = deps.webMcpToolTitle;
};

/** Stand-in for the core bridge's `getWebMcpToolDisplayTitle`. */
export const getWebMcpToolDisplayTitle = (toolName: string): string | undefined =>
  webMcpTitleLookup(toolName);
