import type { AgentWidgetConfig, AgentWidgetRealtimeConnectHook } from "@runtypelabs/persona";

/** The build-time values `pnpm --filter web runtype:ensure` prints for the home page's docs agent. */
export type HomeDemoEnv = {
  VITE_RUNTYPE_CLIENT_TOKEN?: string;
  VITE_RUNTYPE_DOCS_AGENT_ID?: string;
  VITE_RUNTYPE_API_URL?: string;
};

/**
 * Connect the client-session socket, and start the client session with it, on
 * hover instead of the default composer focus, so both are ready by the time a
 * starter chip is clicked (touch fires pointerenter too). `keydown` covers
 * keyboard users; unlike `focusin` it never fires for autofocus, so a page view
 * alone spends nothing. The session start is latched and re-arms after "clear
 * chat", so the listeners stay attached rather than `once`.
 */
export const connectOnHomeIntent: AgentWidgetRealtimeConnectHook = ({ connect, mount }) => {
  mount.addEventListener("pointerenter", connect);
  mount.addEventListener("keydown", connect);
  return () => {
    mount.removeEventListener("pointerenter", connect);
    mount.removeEventListener("keydown", connect);
  };
};

/**
 * With a client token and agent id the widget talks to Runtype directly and
 * receives replies over the client-session socket when init advertises one.
 * Without them (e.g. a fresh local checkout) it uses the proxy's server-pinned
 * route, unchanged.
 */
export function homeDemoConnection(
  env: HomeDemoEnv,
  proxyUrl: string
): Pick<AgentWidgetConfig, "apiUrl" | "clientToken" | "agentId" | "realtime"> {
  if (!env.VITE_RUNTYPE_CLIENT_TOKEN || !env.VITE_RUNTYPE_DOCS_AGENT_ID) return { apiUrl: proxyUrl };
  return {
    clientToken: env.VITE_RUNTYPE_CLIENT_TOKEN,
    agentId: env.VITE_RUNTYPE_DOCS_AGENT_ID,
    // Always set: overrides DEFAULT_WIDGET_CONFIG's proxy-style apiUrl so
    // client routes resolve against api.runtype.com, or a staging API.
    apiUrl: env.VITE_RUNTYPE_API_URL,
    realtime: { connect: connectOnHomeIntent },
  };
}
