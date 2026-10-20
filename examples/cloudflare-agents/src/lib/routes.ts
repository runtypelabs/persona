import { parseDispatch } from "./request";

export type PublicEnvironment = {
  OPENAI_API_KEY?: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
};
export type ForwardToAgent = (
  name: string,
  request: Request
) => Promise<Response>;
/** Kept outside the Cloudflare-only import boundary for deterministic routing tests. */
export async function routeRequest(
  request: Request,
  env: PublicEnvironment,
  forward: ForwardToAgent
) {
  const url = new URL(request.url);
  if (url.pathname === "/api/config") {
    if (request.method !== "GET")
      return new Response("Method not allowed", {
        status: 405,
        headers: { allow: "GET" },
      });
    return Response.json(
      { liveAvailable: Boolean(env.OPENAI_API_KEY?.trim()) },
      { headers: { "cache-control": "no-store" } }
    );
  }
  if (url.pathname === "/api/dispatch") {
    const dispatch = await parseDispatch(request.clone());
    if (dispatch instanceof Response) return dispatch;
    if (dispatch.mode === "live" && !env.OPENAI_API_KEY?.trim())
      return Response.json(
        {
          error:
            "Live mode is not configured. Use Preview or add a server-side provider key.",
        },
        { status: 503 }
      );
    try {
      return await forward(
        `${dispatch.mode}:${dispatch.ticket.id}:${dispatch.conversationId}`,
        request
      );
    } catch {
      return Response.json(
        {
          error: "The assistant is temporarily unavailable. Please try again.",
        },
        { status: 502 }
      );
    }
  }
  if (url.pathname.startsWith("/api/"))
    return Response.json({ error: "Not found" }, { status: 404 });
  return env.ASSETS.fetch(request);
}
