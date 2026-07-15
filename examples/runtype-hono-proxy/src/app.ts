import {
  createChatProxyApp,
  FORM_DIRECTIVE_FLOW,
  SHOPPING_ASSISTANT_FLOW,
  SHOPPING_ASSISTANT_METADATA_FLOW,
  COMPONENT_FLOW,
  BAKERY_ASSISTANT_FLOW,
  STOREFRONT_ASSISTANT_FLOW,
  WEBMCP_STOREFRONT_AGENT,
  WEBMCP_CALENDAR_FLOW,
  WEBMCP_SLIDES_FLOW,
  WEBMCP_PAINT_FLOW,
  WEBMCP_DOCKED_FLOW,
  PAGE_CONTEXT_AGENT,
  THEME_ASSISTANT_AGENT,
  TRAVEL_PLANNER_AGENT,
  DOCS_ASSISTANT_AGENT,
  CHAT_ASSISTANT_AGENT,
  ANALYTICS_ASSISTANT_AGENT,
  createCheckoutSession,
  type CheckoutItem,
} from "@runtypelabs/persona-proxy";
import { Hono } from "hono";
import type { Context } from "hono";
import {
  type ProxyEnv,
  frontendBaseUrl,
  parseAllowedOrigins,
  resolveCorsOrigin,
} from "./env.js";
import {
  configuredBodyLimit,
  createDemoProxyGuard,
  guardDemoRequest,
  parseLimitedJson,
} from "./request-guard.js";

export type { ProxyEnv };

function withCorsHeaders(response: Response, corsOrigin: string): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", corsOrigin);
  const vary = headers.get("Vary");
  if (!vary?.split(",").some((value) => value.trim().toLowerCase() === "origin")) {
    headers.set("Vary", vary ? `${vary}, Origin` : "Origin");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Canonical Runtype proxy: all demo dispatch routes, checkout, TTS, and form
 * handlers. Host wrappers (Node, Vercel, Workers) only differ in how they
 * supply `env` and call `app.fetch`.
 */
export function createRuntypeProxyApp(env: ProxyEnv): Hono {
  const allowedOrigins = parseAllowedOrigins(env);
  const upstreamUrl = env.UPSTREAM_URL || undefined;
  const apiKey = env.RUNTYPE_API_KEY;
  const requestGuard = createDemoProxyGuard(env);
  const proxyProtection = {
    requestGuard,
    maxRequestBodyBytes: configuredBodyLimit(env),
  } as const;

  const app = createChatProxyApp({
    ...proxyProtection,
    path: "/api/chat/dispatch",
    apiKey,
    allowedOrigins,
    upstreamUrl,
  });

  const directiveApp = createChatProxyApp({
    ...proxyProtection,
    path: "/api/chat/dispatch-directive",
    apiKey,
    allowedOrigins,
    flowId: env.FLOW_ID_FORM_DIRECTIVE || undefined,
    flowConfig: env.FLOW_ID_FORM_DIRECTIVE ? undefined : FORM_DIRECTIVE_FLOW,
    upstreamUrl,
  });

  const actionApp = createChatProxyApp({
    ...proxyProtection,
    path: "/api/chat/dispatch-action",
    apiKey,
    allowedOrigins,
    flowId: env.FLOW_ID_SHOPPING_ASSISTANT || undefined,
    flowConfig: env.FLOW_ID_SHOPPING_ASSISTANT ? undefined : SHOPPING_ASSISTANT_FLOW,
    upstreamUrl,
  });

  const metadataApp = createChatProxyApp({
    ...proxyProtection,
    path: "/api/chat/dispatch-metadata",
    apiKey,
    allowedOrigins,
    flowId: env.FLOW_ID_SHOPPING_ASSISTANT_METADATA || undefined,
    flowConfig: env.FLOW_ID_SHOPPING_ASSISTANT_METADATA
      ? undefined
      : SHOPPING_ASSISTANT_METADATA_FLOW,
    upstreamUrl,
  });

  const componentApp = createChatProxyApp({
    ...proxyProtection,
    path: "/api/chat/dispatch-component",
    apiKey,
    allowedOrigins,
    flowId: env.FLOW_ID_COMPONENT || undefined,
    flowConfig: env.FLOW_ID_COMPONENT ? undefined : COMPONENT_FLOW,
    upstreamUrl,
  });

  const bakeryApp = createChatProxyApp({
    ...proxyProtection,
    path: "/api/chat/dispatch-bakery",
    apiKey,
    allowedOrigins,
    flowId: env.FLOW_ID_BAKERY || undefined,
    flowConfig: env.FLOW_ID_BAKERY ? undefined : BAKERY_ASSISTANT_FLOW,
    upstreamUrl,
  });

  const storefrontApp = createChatProxyApp({
    ...proxyProtection,
    path: "/api/chat/dispatch-storefront",
    apiKey,
    allowedOrigins,
    flowId: env.FLOW_ID_STOREFRONT || undefined,
    flowConfig: env.FLOW_ID_STOREFRONT ? undefined : STOREFRONT_ASSISTANT_FLOW,
    upstreamUrl,
  });

  const webmcpApp = createChatProxyApp({
    ...proxyProtection,
    path: "/api/chat/dispatch-webmcp",
    apiKey,
    allowedOrigins,
    ...(env.FLOW_ID_WEBMCP
      ? { flowId: env.FLOW_ID_WEBMCP, flowConfig: undefined }
      : {
          agentId: env.AGENT_ID_WEBMCP || undefined,
          agentConfig: env.AGENT_ID_WEBMCP ? undefined : WEBMCP_STOREFRONT_AGENT,
        }),
    upstreamUrl,
  });

  const webmcpCalendarApp = createChatProxyApp({
    ...proxyProtection,
    path: "/api/chat/dispatch-calendar",
    apiKey,
    allowedOrigins,
    flowId: env.FLOW_ID_CALENDAR || undefined,
    flowConfig: env.FLOW_ID_CALENDAR ? undefined : WEBMCP_CALENDAR_FLOW,
    upstreamUrl,
  });

  const webmcpSlidesApp = createChatProxyApp({
    ...proxyProtection,
    path: "/api/chat/dispatch-slides",
    apiKey,
    allowedOrigins,
    flowId: env.FLOW_ID_SLIDES || undefined,
    flowConfig: env.FLOW_ID_SLIDES ? undefined : WEBMCP_SLIDES_FLOW,
    upstreamUrl,
  });

  const webmcpPaintApp = createChatProxyApp({
    ...proxyProtection,
    path: "/api/chat/dispatch-paint",
    apiKey,
    allowedOrigins,
    flowId: env.FLOW_ID_PAINT || undefined,
    flowConfig: env.FLOW_ID_PAINT ? undefined : WEBMCP_PAINT_FLOW,
    upstreamUrl,
  });

  const webmcpDockedApp = createChatProxyApp({
    ...proxyProtection,
    path: "/api/chat/dispatch-docked",
    apiKey,
    allowedOrigins,
    flowId: env.FLOW_ID_DOCKED || undefined,
    flowConfig: env.FLOW_ID_DOCKED ? undefined : WEBMCP_DOCKED_FLOW,
    upstreamUrl,
  });

  const pageContextApp = createChatProxyApp({
    ...proxyProtection,
    path: "/api/chat/dispatch-page-context",
    apiKey,
    allowedOrigins,
    ...(env.FLOW_ID_PAGE_CONTEXT
      ? { flowId: env.FLOW_ID_PAGE_CONTEXT, flowConfig: undefined }
      : {
          agentId: env.AGENT_ID_PAGE_CONTEXT || undefined,
          agentConfig: env.AGENT_ID_PAGE_CONTEXT ? undefined : PAGE_CONTEXT_AGENT,
        }),
    upstreamUrl,
  });

  const themeAssistantApp = createChatProxyApp({
    ...proxyProtection,
    path: "/api/chat/dispatch-theme",
    apiKey,
    allowedOrigins,
    ...(env.FLOW_ID_THEME_ASSISTANT
      ? { flowId: env.FLOW_ID_THEME_ASSISTANT, flowConfig: undefined }
      : {
          agentId: env.AGENT_ID_THEME_ASSISTANT || undefined,
          agentConfig: env.AGENT_ID_THEME_ASSISTANT
            ? undefined
            : THEME_ASSISTANT_AGENT,
        }),
    upstreamUrl,
  });

  const agentLoopApp = createChatProxyApp({
    ...proxyProtection,
    path: "/api/chat/dispatch-agent-loop",
    apiKey,
    allowedOrigins,
    agentId: env.AGENT_ID_AGENT_LOOP || undefined,
    agentConfig: env.AGENT_ID_AGENT_LOOP ? undefined : TRAVEL_PLANNER_AGENT,
    upstreamUrl,
  });

  const docsAssistantApp = createChatProxyApp({
    ...proxyProtection,
    path: "/api/chat/dispatch-docs",
    apiKey,
    allowedOrigins,
    agentId: env.AGENT_ID_DOCS || undefined,
    agentConfig: env.AGENT_ID_DOCS ? undefined : DOCS_ASSISTANT_AGENT,
    upstreamUrl,
  });

  const chatAssistantApp = createChatProxyApp({
    ...proxyProtection,
    path: "/api/chat/dispatch-assistant",
    apiKey,
    allowedOrigins,
    agentId: env.AGENT_ID_ASSISTANT || undefined,
    agentConfig: env.AGENT_ID_ASSISTANT ? undefined : CHAT_ASSISTANT_AGENT,
    upstreamUrl,
  });

  const analyticsAssistantApp = createChatProxyApp({
    ...proxyProtection,
    path: "/api/chat/dispatch-analytics",
    apiKey,
    allowedOrigins,
    agentId: env.AGENT_ID_ANALYTICS || undefined,
    agentConfig: env.AGENT_ID_ANALYTICS ? undefined : ANALYTICS_ASSISTANT_AGENT,
    upstreamUrl,
  });

  app.route("/", directiveApp);
  app.route("/", actionApp);
  app.route("/", metadataApp);
  app.route("/", componentApp);
  app.route("/", bakeryApp);
  app.route("/", storefrontApp);
  app.route("/", webmcpApp);
  app.route("/", webmcpCalendarApp);
  app.route("/", webmcpSlidesApp);
  app.route("/", webmcpPaintApp);
  app.route("/", webmcpDockedApp);
  app.route("/", pageContextApp);
  app.route("/", themeAssistantApp);
  app.route("/", agentLoopApp);
  app.route("/", docsAssistantApp);
  app.route("/", chatAssistantApp);
  app.route("/", analyticsAssistantApp);

  app.post("/api/tts", async (c) => {
    const origin = c.req.header("origin");
    const corsOrigin = resolveCorsOrigin(origin, allowedOrigins);

    const denied = guardDemoRequest(env, {
      request: c.req.raw,
      kind: "tts",
      path: "/api/tts",
    });
    if (denied) return withCorsHeaders(denied, corsOrigin);

    if (!env.OPENAI_API_KEY) {
      return c.json(
        { error: "OPENAI_API_KEY is not configured on the proxy." },
        500,
        { "Access-Control-Allow-Origin": corsOrigin },
      );
    }

    let text = "";
    let voice: string | undefined;
    let rate: number | undefined;
    let model: string | undefined;
    const parsed = await parseLimitedJson(c.req.raw, 32 * 1024);
    if (!parsed.success) return withCorsHeaders(parsed.response, corsOrigin);
    try {
      const body = parsed.value as {
        text?: string;
        voice?: string;
        rate?: number;
        model?: string;
      };
      text = (body.text ?? "").trim();
      voice = typeof body.voice === "string" ? body.voice : undefined;
      rate = typeof body.rate === "number" ? body.rate : undefined;
      model = typeof body.model === "string" ? body.model : undefined;
    } catch {
      return c.json({ error: "Invalid TTS payload." }, 400, {
        "Access-Control-Allow-Origin": corsOrigin,
      });
    }
    if (!text) {
      return c.json({ error: "Missing 'text'." }, 400, {
        "Access-Control-Allow-Origin": corsOrigin,
      });
    }

    const payload: Record<string, unknown> = {
      model: model || env.OPENAI_TTS_MODEL || "tts-1",
      voice: voice || env.OPENAI_TTS_VOICE || "alloy",
      input: text,
      response_format: "pcm",
    };
    if (typeof rate === "number" && rate !== 1) {
      payload.speed = Math.min(4, Math.max(0.25, rate));
    }

    const upstream = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => "");
      return c.json(
        { error: `OpenAI TTS failed (${upstream.status}).`, detail: detail.slice(0, 500) },
        502,
        { "Access-Control-Allow-Origin": corsOrigin },
      );
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "audio/pcm; rate=24000",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": corsOrigin,
        Vary: "Origin",
      },
    });
  });

  const checkoutHandler =
    (successPath: string, cancelPath: string) => async (c: Context) => {
      const origin = c.req.header("origin");
      const corsOrigin = resolveCorsOrigin(origin, allowedOrigins);

      const denied = guardDemoRequest(env, {
        request: c.req.raw,
        kind: "checkout",
        path: c.req.path,
      });
      if (denied) return withCorsHeaders(denied, corsOrigin);

      try {
        const parsed = await parseLimitedJson(c.req.raw, 64 * 1024);
        if (!parsed.success) return withCorsHeaders(parsed.response, corsOrigin);
        const body = parsed.value as { items?: CheckoutItem[] };
        const { items } = body;
        const base = frontendBaseUrl(env);

        if (!env.STRIPE_SECRET_KEY) {
          return c.json(
            {
              success: false,
              error:
                "Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.",
            },
            500,
            { "Access-Control-Allow-Origin": corsOrigin },
          );
        }

        const result = await createCheckoutSession({
          secretKey: env.STRIPE_SECRET_KEY,
          items: items ?? [],
          successUrl: `${base}/${successPath}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${base}/${cancelPath}?checkout=cancelled`,
          stripeContext: env.STRIPE_CONTEXT?.trim() || undefined,
        });

        return c.json(result, result.success ? 200 : 400, {
          "Access-Control-Allow-Origin": corsOrigin,
        });
      } catch (error) {
        console.error("Stripe checkout error:", error);
        return c.json(
          {
            success: false,
            error:
              error instanceof Error ? error.message : "Failed to create checkout session",
          },
          500,
          { "Access-Control-Allow-Origin": corsOrigin },
        );
      }
    };

  app.post("/api/checkout", checkoutHandler("action-middleware.html", "action-middleware.html"));
  app.post(
    "/api/checkout/storefront",
    checkoutHandler("persistent-composer.html", "persistent-composer.html"),
  );
  app.post("/api/checkout/bakery", checkoutHandler("bakery-goods.html", "bakery-goods.html"));

  const formHandler = async (c: Context) => {
    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch (error) {
      return c.json(
        { success: false, message: "Invalid JSON payload", error: String(error) },
        400,
      );
    }

    const type = typeof body.type === "string" ? body.type : "init";
    const name = typeof body.name === "string" ? body.name : undefined;

    const summaryLines = [
      type === "init"
        ? "We'll follow up shortly to confirm."
        : "Thanks for the additional context.",
    ];
    if (name) summaryLines.push(`Name: ${name}`);

    return c.json({
      success: true,
      message: summaryLines.join(" "),
      nextPrompt:
        type === "init"
          ? `Demo request captured for ${name ?? "this prospect"}. What should we prepare next?`
          : `Captured extra information for ${name ?? "the request"}.`,
    });
  };

  app.post("/form", formHandler);
  app.post("/api/form", formHandler);

  app.get("/health", (c) =>
    c.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      endpoints: {
        basic: "/api/chat/dispatch",
        directive: "/api/chat/dispatch-directive",
        action: "/api/chat/dispatch-action",
        metadata: "/api/chat/dispatch-metadata",
        checkout: "/api/checkout",
        form: "/form",
      },
    }),
  );

  app.get("/", (c) =>
    c.json({
      name: "runtype-hono-proxy",
      description: "Runtype chat proxy on Hono (Node, Vercel, or Cloudflare Workers)",
      docs: "https://docs.runtype.com",
    }),
  );

  return app;
}
