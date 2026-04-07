import "dotenv/config";
import { serve } from "@hono/node-server";
import getPort from "get-port";
import {
  createChatProxyApp,
  FORM_DIRECTIVE_FLOW,
  SHOPPING_ASSISTANT_FLOW,
  COMPONENT_FLOW,
  BAKERY_ASSISTANT_FLOW,
  createCheckoutSession
} from "@runtypelabs/persona-proxy";

// Sample environment variables (.env file):
// PORT=43111
// UPSTREAM_URL=https://api.runtype.com/v1/dispatch
// ALLOWED_ORIGINS=https://example.com,https://staging.example.com
// FLOW_ID_FORM_DIRECTIVE=flow_01abc123...
// FLOW_ID_SHOPPING_ASSISTANT=flow_02def456...
// STRIPE_SECRET_KEY=sk_test_...
// FRONTEND_URL=http://localhost:5173

const preferredPort = Number(process.env.PORT ?? 43111);
const upstreamUrl = process.env.UPSTREAM_URL || undefined;
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : ["http://localhost:5173", "http://localhost:4173"];

// Default chat proxy - basic conversational assistant
const app = createChatProxyApp({
  path: "/api/chat/dispatch",
  allowedOrigins,
  upstreamUrl
});

// Directive-enabled proxy for interactive form demo
// This flow includes instructions to output form directives
const directiveApp = createChatProxyApp({
  path: "/api/chat/dispatch-directive",
  allowedOrigins,
  flowId: process.env.FLOW_ID_FORM_DIRECTIVE || undefined,
  flowConfig: process.env.FLOW_ID_FORM_DIRECTIVE ? undefined : FORM_DIRECTIVE_FLOW,
  upstreamUrl
});

// Action middleware proxy - returns JSON actions for page interaction
// Uses the shared shopping assistant flow from @runtypelabs/persona-proxy
const actionApp = createChatProxyApp({
  path: "/api/chat/dispatch-action",
  allowedOrigins,
  flowId: process.env.FLOW_ID_SHOPPING_ASSISTANT || undefined,
  flowConfig: process.env.FLOW_ID_SHOPPING_ASSISTANT ? undefined : SHOPPING_ASSISTANT_FLOW,
  upstreamUrl
});

// Component proxy - returns component directives for custom component rendering
const componentApp = createChatProxyApp({
  path: "/api/chat/dispatch-component",
  allowedOrigins,
  flowId: process.env.FLOW_ID_COMPONENT || undefined,
  flowConfig: process.env.FLOW_ID_COMPONENT ? undefined : COMPONENT_FLOW,
  upstreamUrl
});

// Bakery assistant proxy - for Flour & Stone bakery demo
const bakeryApp = createChatProxyApp({
  path: "/api/chat/dispatch-bakery",
  allowedOrigins,
  flowId: process.env.FLOW_ID_BAKERY || undefined,
  flowConfig: process.env.FLOW_ID_BAKERY ? undefined : BAKERY_ASSISTANT_FLOW,
  upstreamUrl
});

// Mount all apps
app.route("/", directiveApp);
app.route("/", actionApp);
app.route("/", componentApp);
app.route("/", bakeryApp);

// Stripe checkout endpoint
// Uses the shared createCheckoutSession helper from @runtypelabs/persona-proxy
app.post("/api/checkout", async (c) => {
  // Handle CORS
  if (c.req.method === "OPTIONS") {
    const origin = c.req.header("origin");
    const corsOrigin = (origin && allowedOrigins.includes(origin)) ? origin : allowedOrigins[0];
    return c.json({}, 200, {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
  }

  try {
    const body = await c.req.json();
    const { items } = body;

    // Get origin for CORS
    const origin = c.req.header("origin");
    const corsOrigin = (origin && allowedOrigins.includes(origin)) ? origin : allowedOrigins[0];

    // Check if Stripe is configured
    if (!process.env.STRIPE_SECRET_KEY) {
      return c.json(
        { success: false, error: "Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable." },
        500,
        {
          "Access-Control-Allow-Origin": corsOrigin,
        }
      );
    }

    // Create Stripe checkout session using the shared helper
    // {CHECKOUT_SESSION_ID} is a Stripe template variable that gets replaced with the actual session ID
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
    console.error("Stripe checkout error:", error);
    const origin = c.req.header("origin");
    const corsOrigin = (origin && allowedOrigins.includes(origin)) ? origin : allowedOrigins[0];
    return c.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to create checkout session" },
      500,
      {
        "Access-Control-Allow-Origin": corsOrigin,
      }
    );
  }
});

// Bakery-specific Stripe checkout endpoint
// Returns to bakery-goods.html after checkout
app.post("/api/checkout/bakery", async (c) => {
  // Handle CORS
  if (c.req.method === "OPTIONS") {
    const origin = c.req.header("origin");
    const corsOrigin = (origin && allowedOrigins.includes(origin)) ? origin : allowedOrigins[0];
    return c.json({}, 200, {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
  }

  try {
    const body = await c.req.json();
    const { items } = body;

    // Get origin for CORS
    const origin = c.req.header("origin");
    const corsOrigin = (origin && allowedOrigins.includes(origin)) ? origin : allowedOrigins[0];

    // Check if Stripe is configured
    if (!process.env.STRIPE_SECRET_KEY) {
      return c.json(
        { success: false, error: "Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable." },
        500,
        {
          "Access-Control-Allow-Origin": corsOrigin,
        }
      );
    }

    // Create Stripe checkout session for bakery
    // {CHECKOUT_SESSION_ID} is a Stripe template variable that gets replaced with the actual session ID
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
    console.error("Bakery checkout error:", error);
    const origin = c.req.header("origin");
    const corsOrigin = (origin && allowedOrigins.includes(origin)) ? origin : allowedOrigins[0];
    return c.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to create checkout session" },
      500,
      {
        "Access-Control-Allow-Origin": corsOrigin,
      }
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
      400
    );
  }

  const type = typeof body.type === "string" ? body.type : "init";
  const name = typeof body.name === "string" ? body.name : undefined;
  const email = typeof body.email === "string" ? body.email : undefined;

  const summaryLines = [
    type === "init"
      ? "We'll follow up shortly to confirm your demo slot."
      : "Thanks for the additional context."
  ];
  if (name) summaryLines.push(`Name: ${name}`);
  if (email) summaryLines.push(`Email: ${email}`);

  return c.json({
    success: true,
    message: summaryLines.join(" "),
    nextPrompt:
      type === "init"
        ? `Demo request captured for ${name ?? "this prospect"}. What should we prepare next?`
        : `Captured extra information for ${name ?? "the request"}.`
  });
});

const start = async () => {
  const port = await getPort({ port: preferredPort });

  serve(
    {
      fetch: app.fetch,
      port
    },
    (info) => {
      // eslint-disable-next-line no-console
      console.log(`Chat proxy running on http://localhost:${info.port}`);
    }
  );
};

start();
