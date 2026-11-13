import "@runtypelabs/persona/widget.css";
import {
  DEFAULT_WIDGET_CONFIG,
  initAgentWidget,
  type AgentWidgetConfig,
  type AgentWidgetController,
} from "@runtypelabs/persona";
import { installWebMCP } from "@mcp-b/webmcp-polyfill";
import {
  REALTIME_DEMO_NOT_CONFIGURED,
  resolveRealtimeDemoTarget,
  type RealtimeDemoTarget,
} from "./realtime-demo-target";

/**
 * Two-page demo of the Runtype client-session socket (`realtime-mpa.html` and
 * `realtime-mpa-next.html`). Each page mounts the same client-token widget
 * with `persistState`, so a navigation mid-reply restores the transcript and
 * reattaches from the stored cursor. The `go_to_page` page tool navigates to
 * the other page; it counts its runs in localStorage so the e2e suite can
 * prove it never runs twice for one call. The target comes from the build env
 * (`resolveRealtimeDemoTarget`); query parameters `apiUrl`, `clientToken` and
 * `agentId` override it, and `realtime=0` and `idleCloseMs` tune the socket, so
 * the same pages run against the e2e fake or a real API
 * (`e2e/live/realtime-real-api.live.spec.ts`).
 */

const params = new URLSearchParams(window.location.search);
const target = resolveRealtimeDemoTarget(params, import.meta.env);
const idleCloseMs = params.has("idleCloseMs") ? Number(params.get("idleCloseMs")) : undefined;
const realtime = params.get("realtime") !== "0";
const page = document.body.dataset.page === "next" ? "next" : "first";
const RUNS_KEY = "realtime-mpa:go_to_page-runs";
const TITLE_RUNS_KEY = "realtime-mpa:read_page_title-runs";

const linkTo = (file: string) => `${file}${window.location.search}`;
const otherPage = page === "first" ? "realtime-mpa-next.html" : "realtime-mpa.html";
const link = document.getElementById("mpa-link") as HTMLAnchorElement;
link.href = linkTo(otherPage);

installWebMCP();
(document as unknown as { modelContext: { registerTool: (tool: unknown) => void } }).modelContext.registerTool({
  name: "go_to_page",
  title: "Go to page",
  description: "Navigate the visitor to the other demo page.",
  inputSchema: { type: "object", properties: { page: { type: "string", enum: ["next", "first"] } } },
  annotations: { readOnlyHint: true },
  execute: async (args: { page?: string }) => {
    const runs = Number(localStorage.getItem(RUNS_KEY) ?? "0") + 1;
    localStorage.setItem(RUNS_KEY, String(runs));
    const target = args.page === "first" ? "realtime-mpa.html" : "realtime-mpa-next.html";
    window.location.assign(linkTo(target));
    // The page is unloading: the next page answers this call on arrival.
    return new Promise(() => {});
  },
});

(document as unknown as { modelContext: { registerTool: (tool: unknown) => void } }).modelContext.registerTool({
  name: "read_page_title",
  title: "Read page title",
  description: "Return the title of the page the visitor is on.",
  inputSchema: { type: "object", properties: {} },
  annotations: { readOnlyHint: true },
  execute: async () => {
    localStorage.setItem(TITLE_RUNS_KEY, String(Number(localStorage.getItem(TITLE_RUNS_KEY) ?? "0") + 1));
    return { content: [{ type: "text", text: document.title }] };
  },
});

const host = document.getElementById("mpa-host") as HTMLElement;
const status = document.getElementById("mpa-status") as HTMLElement;

const config = ({ apiUrl, clientToken, agentId }: RealtimeDemoTarget): AgentWidgetConfig => ({
  ...DEFAULT_WIDGET_CONFIG,
  apiUrl,
  clientToken,
  ...(agentId ? { agentId } : {}),
  persistState: true,
  realtime: realtime && idleCloseMs !== undefined ? { idleCloseMs } : realtime,
  // Both page tools are harmless: one moves between the two pages, one reads the title.
  webmcp: { enabled: true, autoApprove: (info) => info.toolName === "go_to_page" || info.toolName === "read_page_title" },
  suggestionChips: [],
  launcher: { ...DEFAULT_WIDGET_CONFIG.launcher, enabled: false, width: "100%" },
  welcome: { variant: "none" },
  copy: { ...DEFAULT_WIDGET_CONFIG.copy, inputPlaceholder: "Try: long story, or navigate" },
});

if (target) {
  const controller: AgentWidgetController = initAgentWidget({ target: host, useShadowDom: false, config: config(target) });
  status.textContent = `${page} page · api ${target.apiUrl} · socket ${realtime ? "on" : "off"}`;
  Object.assign(window as unknown as Record<string, unknown>, { __personaE2E: { controller } });
} else {
  status.textContent = REALTIME_DEMO_NOT_CONFIGURED;
}
