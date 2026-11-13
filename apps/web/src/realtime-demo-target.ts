/** Where the realtime demo pages (`realtime-mpa*.html`, `realtime-compare.html`) send their turns. */
export type RealtimeDemoTarget = { apiUrl: string; clientToken: string; agentId?: string };

/** The build-time values `pnpm --filter web runtype:ensure` prints for the realtime demo. */
export type RealtimeDemoEnv = {
  VITE_RUNTYPE_REALTIME_CLIENT_TOKEN?: string;
  VITE_RUNTYPE_REALTIME_AGENT_ID?: string;
  VITE_RUNTYPE_API_URL?: string;
  DEV?: boolean;
};

export const REALTIME_DEMO_FAKE_API_URL = "http://127.0.0.1:8790";
export const REALTIME_DEMO_FAKE_TOKEN = "ct_fake_demo";
export const RUNTYPE_API_URL = "https://api.runtype.com";

export const REALTIME_DEMO_NOT_CONFIGURED =
  "Realtime demo not configured: set VITE_RUNTYPE_REALTIME_CLIENT_TOKEN, or pass clientToken and apiUrl.";

/**
 * Query parameters override the build env. A dev server with no env talks to
 * the local fake server; a production build with neither has no target (null).
 */
export function resolveRealtimeDemoTarget(
  params: URLSearchParams,
  env: RealtimeDemoEnv
): RealtimeDemoTarget | null {
  const fake = !env.VITE_RUNTYPE_REALTIME_CLIENT_TOKEN && env.DEV === true;
  const clientToken =
    params.get("clientToken") || env.VITE_RUNTYPE_REALTIME_CLIENT_TOKEN || (fake ? REALTIME_DEMO_FAKE_TOKEN : "");
  if (!clientToken) return null;
  const agentId = params.get("agentId") || (fake ? undefined : env.VITE_RUNTYPE_REALTIME_AGENT_ID);
  return {
    apiUrl:
      params.get("apiUrl") ||
      (fake ? REALTIME_DEMO_FAKE_API_URL : env.VITE_RUNTYPE_API_URL || RUNTYPE_API_URL),
    clientToken,
    ...(agentId ? { agentId } : {}),
  };
}
