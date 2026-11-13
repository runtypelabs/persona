import type { AgentWidgetConfig } from "../types";
import { DEFAULT_CLIENT_API_BASE } from "./constants";

/**
 * Add `<link rel="preconnect">` for the API origin once per document when the
 * client-session socket may be used, so the first init, chat, or socket
 * upgrade skips DNS + TLS setup. `realtime: false` or `preconnect: false` opts out.
 */
export function addPreconnectHint(doc: Document, config: AgentWidgetConfig): void {
  const option = config.realtime;
  if (!config.clientToken || config.transport || option === false ||
      (typeof option === "object" && (option.enabled === false || option.preconnect === false))) return;
  try {
    const origin = new URL(config.apiUrl || DEFAULT_CLIENT_API_BASE, doc.location.href).origin;
    if (origin === doc.location.origin || doc.head.querySelector(`link[rel=preconnect][href="${origin}"]`)) return;
    const link = doc.createElement("link");
    link.rel = "preconnect";
    link.href = origin;
    link.crossOrigin = "anonymous";
    doc.head.appendChild(link);
  } catch {
    // An unparsable apiUrl or a document without a head: no hint.
  }
}
