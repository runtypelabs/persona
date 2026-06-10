import { handle } from "hono/vercel";
import {
  createChatProxyApp,
  FORM_DIRECTIVE_FLOW,
  SHOPPING_ASSISTANT_FLOW,
  COMPONENT_FLOW,
  BAKERY_ASSISTANT_FLOW,
  STOREFRONT_ASSISTANT_FLOW,
  WEBMCP_STOREFRONT_FLOW,
  WEBMCP_CALENDAR_FLOW,
  WEBMCP_SLIDES_FLOW,
  WEBMCP_DOCKED_FLOW,
  PAGE_CONTEXT_FLOW,
  createCheckoutSession,
} from "@runtypelabs/persona-proxy";

// Production origins are supplied at deploy time via ALLOWED_ORIGINS (comma-
// separated). Dynamic preview sites are matched separately by the proxy's
// previewOriginPattern (set PREVIEW_ORIGIN_PATTERN to allow non-Vercel ones).
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : ["http://localhost:5173", "http://localhost:4173"];

const upstreamUrl = process.env.UPSTREAM_URL || undefined;

const app = createChatProxyApp({
  path: "/api/chat/dispatch",
  allowedOrigins,
  upstreamUrl,
});

const directiveApp = createChatProxyApp({
  path: "/api/chat/dispatch-directive",
  allowedOrigins,
  flowId: process.env.FLOW_ID_FORM_DIRECTIVE || undefined,
  flowConfig: process.env.FLOW_ID_FORM_DIRECTIVE ? undefined : FORM_DIRECTIVE_FLOW,
  upstreamUrl,
});

const actionApp = createChatProxyApp({
  path: "/api/chat/dispatch-action",
  allowedOrigins,
  flowId: process.env.FLOW_ID_SHOPPING_ASSISTANT || undefined,
  flowConfig: process.env.FLOW_ID_SHOPPING_ASSISTANT ? undefined : SHOPPING_ASSISTANT_FLOW,
  upstreamUrl,
});

const componentApp = createChatProxyApp({
  path: "/api/chat/dispatch-component",
  allowedOrigins,
  flowId: process.env.FLOW_ID_COMPONENT || undefined,
  flowConfig: process.env.FLOW_ID_COMPONENT ? undefined : COMPONENT_FLOW,
  upstreamUrl,
});

const bakeryApp = createChatProxyApp({
  path: "/api/chat/dispatch-bakery",
  allowedOrigins,
  flowId: process.env.FLOW_ID_BAKERY || undefined,
  flowConfig: process.env.FLOW_ID_BAKERY ? undefined : BAKERY_ASSISTANT_FLOW,
  upstreamUrl,
});

const storefrontApp = createChatProxyApp({
  path: "/api/chat/dispatch-storefront",
  allowedOrigins,
  flowId: process.env.FLOW_ID_STOREFRONT || undefined,
  flowConfig: process.env.FLOW_ID_STOREFRONT ? undefined : STOREFRONT_ASSISTANT_FLOW,
  upstreamUrl,
});

// WebMCP storefront proxy - for the "Switchback" WebMCP demo. Forwards the
// page's clientTools[] upstream and proxies the /resume round-trip; the agent
// is defined in code as WEBMCP_STOREFRONT_FLOW (no hosted agent / client token).
const webmcpApp = createChatProxyApp({
  path: "/api/chat/dispatch-webmcp",
  allowedOrigins,
  flowId: process.env.FLOW_ID_WEBMCP || undefined,
  flowConfig: process.env.FLOW_ID_WEBMCP ? undefined : WEBMCP_STOREFRONT_FLOW,
  upstreamUrl,
});

// WebMCP calendar proxy - for the chrome-devtools-quickstart calendar copilot demo.
const webmcpCalendarApp = createChatProxyApp({
  path: "/api/chat/dispatch-calendar",
  allowedOrigins,
  flowId: process.env.FLOW_ID_CALENDAR || undefined,
  flowConfig: process.env.FLOW_ID_CALENDAR ? undefined : WEBMCP_CALENDAR_FLOW,
  upstreamUrl,
});

// WebMCP slides proxy - for the Deck Copilot slide-editor demo.
const webmcpSlidesApp = createChatProxyApp({
  path: "/api/chat/dispatch-slides",
  allowedOrigins,
  flowId: process.env.FLOW_ID_SLIDES || undefined,
  flowConfig: process.env.FLOW_ID_SLIDES ? undefined : WEBMCP_SLIDES_FLOW,
  upstreamUrl,
});

// WebMCP docked-dashboard proxy - for the docked panel demo's Copilot.
const webmcpDockedApp = createChatProxyApp({
  path: "/api/chat/dispatch-docked",
  allowedOrigins,
  flowId: process.env.FLOW_ID_DOCKED || undefined,
  flowConfig: process.env.FLOW_ID_DOCKED ? undefined : WEBMCP_DOCKED_FLOW,
  upstreamUrl,
});

// Page-context proxy - read-only, markdown answers about the current page.
const pageContextApp = createChatProxyApp({
  path: "/api/chat/dispatch-page-context",
  allowedOrigins,
  flowId: process.env.FLOW_ID_PAGE_CONTEXT || undefined,
  flowConfig: process.env.FLOW_ID_PAGE_CONTEXT ? undefined : PAGE_CONTEXT_FLOW,
  upstreamUrl,
});

app.route("/", directiveApp);
app.route("/", actionApp);
app.route("/", componentApp);
app.route("/", bakeryApp);
app.route("/", storefrontApp);
app.route("/", webmcpApp);
app.route("/", webmcpCalendarApp);
app.route("/", webmcpSlidesApp);
app.route("/", webmcpDockedApp);
app.route("/", pageContextApp);

app.post("/api/checkout", async (c) => {
  const origin = c.req.header("origin");
  const corsOrigin = (origin && allowedOrigins.includes(origin)) ? origin : allowedOrigins[0];

  if (c.req.method === "OPTIONS") {
    return c.json({}, 200, {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
  }

  try {
    const body = await c.req.json();
    const { items } = body;

    if (!process.env.STRIPE_SECRET_KEY) {
      return c.json(
        { success: false, error: "Stripe is not configured." },
        500,
        { "Access-Control-Allow-Origin": corsOrigin },
      );
    }

    const result = await createCheckoutSession({
      secretKey: process.env.STRIPE_SECRET_KEY,
      items,
      successUrl: `${process.env.FRONTEND_URL || "http://localhost:5173"}/action-middleware.html?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${process.env.FRONTEND_URL || "http://localhost:5173"}/action-middleware.html?checkout=cancelled`,
      stripeContext: process.env.STRIPE_CONTEXT?.trim() || undefined,
    });

    return c.json(result, result.success ? 200 : 400, {
      "Access-Control-Allow-Origin": corsOrigin,
    });
  } catch (error) {
    return c.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to create checkout session" },
      500,
      { "Access-Control-Allow-Origin": corsOrigin },
    );
  }
});

app.post("/api/checkout/storefront", async (c) => {
  const origin = c.req.header("origin");
  const corsOrigin = (origin && allowedOrigins.includes(origin)) ? origin : allowedOrigins[0];

  if (c.req.method === "OPTIONS") {
    return c.json({}, 200, {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
  }

  try {
    const body = await c.req.json();
    const { items } = body;

    if (!process.env.STRIPE_SECRET_KEY) {
      return c.json(
        { success: false, error: "Stripe is not configured." },
        500,
        { "Access-Control-Allow-Origin": corsOrigin },
      );
    }

    const result = await createCheckoutSession({
      secretKey: process.env.STRIPE_SECRET_KEY,
      items,
      successUrl: `${process.env.FRONTEND_URL || "http://localhost:5173"}/persistent-composer.html?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${process.env.FRONTEND_URL || "http://localhost:5173"}/persistent-composer.html?checkout=cancelled`,
      stripeContext: process.env.STRIPE_CONTEXT?.trim() || undefined,
    });

    return c.json(result, result.success ? 200 : 400, {
      "Access-Control-Allow-Origin": corsOrigin,
    });
  } catch (error) {
    return c.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to create checkout session" },
      500,
      { "Access-Control-Allow-Origin": corsOrigin },
    );
  }
});

app.post("/api/checkout/bakery", async (c) => {
  const origin = c.req.header("origin");
  const corsOrigin = (origin && allowedOrigins.includes(origin)) ? origin : allowedOrigins[0];

  if (c.req.method === "OPTIONS") {
    return c.json({}, 200, {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
  }

  try {
    const body = await c.req.json();
    const { items } = body;

    if (!process.env.STRIPE_SECRET_KEY) {
      return c.json(
        { success: false, error: "Stripe is not configured." },
        500,
        { "Access-Control-Allow-Origin": corsOrigin },
      );
    }

    const result = await createCheckoutSession({
      secretKey: process.env.STRIPE_SECRET_KEY,
      items,
      successUrl: `${process.env.FRONTEND_URL || "http://localhost:5173"}/bakery-goods.html?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${process.env.FRONTEND_URL || "http://localhost:5173"}/bakery-goods.html?checkout=cancelled`,
      stripeContext: process.env.STRIPE_CONTEXT?.trim() || undefined,
    });

    return c.json(result, result.success ? 200 : 400, {
      "Access-Control-Allow-Origin": corsOrigin,
    });
  } catch (error) {
    return c.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to create checkout session" },
      500,
      { "Access-Control-Allow-Origin": corsOrigin },
    );
  }
});

app.post("/form", async (c) => {
  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch (error) {
    return c.json(
      { success: false, message: "Invalid JSON payload", error: String(error) },
      400,
    );
  }

  const type = typeof body.type === "string" ? body.type : "init";
  const name = typeof body.name === "string" ? body.name : undefined;
  const email = typeof body.email === "string" ? body.email : undefined;

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
});

export const GET = handle(app);
export const POST = handle(app);
export const OPTIONS = handle(app);
