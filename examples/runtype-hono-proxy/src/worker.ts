import { Hono } from "hono";
import { createRuntypeProxyApp, type ProxyEnv } from "./app";

/**
 * Cloudflare Workers entry. Bindings arrive as `c.env` per request, so the
 * shared app factory runs once per fetch (same pattern as echo-hono's portable
 * `app.fetch`, but with Runtype env injected from Wrangler secrets).
 */
const router = new Hono<{ Bindings: ProxyEnv }>();

router.all("*", (c) => {
  const app = createRuntypeProxyApp(c.env);
  return app.fetch(c.req.raw, c.env);
});

export default router;
