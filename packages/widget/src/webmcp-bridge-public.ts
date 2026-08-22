import { WebMcpBridge as WebMcpBridgeRuntime } from "./webmcp-runtime-entry";
import {
  getWebMcpToolDisplayTitle,
  loadWebMcpPolyfillModule,
  recordWebMcpToolDisplayTitles,
} from "./webmcp-bridge";
import type { AgentWidgetWebMcpConfig } from "./types";

/**
 * npm-facing `WebMcpBridge` with the historical one-argument constructor.
 *
 * Wires the runtime class (webmcp-runtime-entry.ts) to the core-owned deps —
 * the page-global title map and the slot-aware polyfill loader. Exported only
 * from `index.ts`, so the CDN global doesn't carry the runtime class; the CDN
 * path constructs the runtime lazily inside `client.ts` via
 * `webmcp-runtime-loader.ts` with these same deps.
 */
export class WebMcpBridge extends WebMcpBridgeRuntime {
  constructor(config: AgentWidgetWebMcpConfig) {
    super(config, {
      recordToolDisplayTitles: recordWebMcpToolDisplayTitles,
      getToolDisplayTitle: getWebMcpToolDisplayTitle,
      loadPolyfill: loadWebMcpPolyfillModule,
    });
  }
}
