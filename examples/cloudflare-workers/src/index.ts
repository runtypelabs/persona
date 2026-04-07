import {
  createChatProxyApp,
  FORM_DIRECTIVE_FLOW,
  SHOPPING_ASSISTANT_FLOW,
  SHOPPING_ASSISTANT_METADATA_FLOW,
  createCheckoutSession
} from "@runtypelabs/persona-proxy";
import { Hono } from "hono";

// Environment variables interface for Cloudflare Workers
interface Env {
  RUNTYPE_API_KEY: string;
  FLOW_ID_FORM_DIRECTIVE?: string;
  FLOW_ID_SHOPPING_ASSISTANT?: string;
  FLOW_ID_SHOPPING_ASSISTANT_METADATA?: string;
  STRIPE_SECRET_KEY?: string;
  /** Target `acct_…` (or path) when using a Stripe organization secret key (`sk_org_…`). */
  STRIPE_CONTEXT?: string;
  ALLOWED_ORIGINS?: string;
}

// Sample environment variables (wrangler.toml or Cloudflare dashboard):
// [vars]
// RUNTYPE_API_KEY = "rt_..."
// FLOW_ID_FORM_DIRECTIVE = "flow_01abc123..."
// FLOW_ID_SHOPPING_ASSISTANT = "flow_02def456..."
// FLOW_ID_SHOPPING_ASSISTANT_METADATA = "flow_03ghi789..."
// STRIPE_SECRET_KEY = "sk_test_..."
// ALLOWED_ORIGINS = "http://localhost:5173,http://localhost:4173"

// Helper function to parse allowed origins from environment variable
// Supports "*" for wildcard or comma-separated list of origins
function getAllowedOrigins(env: Env): string[] {
  const origins = env.ALLOWED_ORIGINS || "*";
  return origins === "*" ? ["*"] : origins.split(",").map(o => o.trim());
}

// Main app that combines all proxy endpoints
const app = new Hono<{ Bindings: Env }>();

// Helper to get API key (supports both new and deprecated env var names)
function getApiKey(env: Env): string {
  return env.RUNTYPE_API_KEY || "";
}

// 1. Basic conversational assistant proxy
// This is the simplest configuration - just proxies to Runtype with default settings
app.all("/api/chat/dispatch", async (c) => {
  const proxyApp = createChatProxyApp({
    path: "/api/chat/dispatch",
    apiKey: getApiKey(c.env),
    allowedOrigins: getAllowedOrigins(c.env),
  });
  return proxyApp.fetch(c.req.raw, c.env);
});

// 2. Directive-enabled proxy using a flow ID
// This demonstrates using a reference to an existing Runtype flow
app.all("/api/chat/dispatch-directive", async (c) => {
  const proxyApp = createChatProxyApp({
    path: "/api/chat/dispatch-directive",
    apiKey: getApiKey(c.env),
    flowId: c.env.FLOW_ID_FORM_DIRECTIVE || undefined,
    flowConfig: c.env.FLOW_ID_FORM_DIRECTIVE ? undefined : FORM_DIRECTIVE_FLOW,
    allowedOrigins: getAllowedOrigins(c.env),
  });
  return proxyApp.fetch(c.req.raw, c.env);
});

// 3. Shopping assistant proxy with action middleware
// Uses the shared shopping assistant flow from @runtypelabs/persona-proxy
app.all("/api/chat/dispatch-action", async (c) => {
  const proxyApp = createChatProxyApp({
    path: "/api/chat/dispatch-action",
    apiKey: getApiKey(c.env),
    flowId: c.env.FLOW_ID_SHOPPING_ASSISTANT || undefined,
    flowConfig: c.env.FLOW_ID_SHOPPING_ASSISTANT ? undefined : SHOPPING_ASSISTANT_FLOW,
    allowedOrigins: getAllowedOrigins(c.env),
  });
  return proxyApp.fetch(c.req.raw, c.env);
});

// 4. Metadata-based shopping assistant proxy
// Uses the shared metadata-based shopping assistant flow from @runtypelabs/persona-proxy
app.all("/api/chat/dispatch-metadata", async (c) => {
  const proxyApp = createChatProxyApp({
    path: "/api/chat/dispatch-metadata",
    apiKey: getApiKey(c.env),
    flowId: c.env.FLOW_ID_SHOPPING_ASSISTANT_METADATA || undefined,
    flowConfig: c.env.FLOW_ID_SHOPPING_ASSISTANT_METADATA ? undefined : SHOPPING_ASSISTANT_METADATA_FLOW,
    allowedOrigins: getAllowedOrigins(c.env),
  });
  return proxyApp.fetch(c.req.raw, c.env);
});

// Custom endpoint: Stripe checkout
// Uses the shared createCheckoutSession helper from @runtypelabs/persona-proxy
app.post("/api/checkout", async (c) => {
  try {
    const body = await c.req.json();
    const { items } = body;

    // Check if Stripe is configured
    if (!c.env.STRIPE_SECRET_KEY) {
      return c.json(
        { success: false, error: "Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable." },
        500
      );
    }

    // Create Stripe checkout session using the shared helper
    const result = await createCheckoutSession({
      secretKey: c.env.STRIPE_SECRET_KEY,
      items,
      successUrl: `${c.req.header("origin") || "http://localhost:5173"}/action-middleware.html?checkout=success`,
      cancelUrl: `${c.req.header("origin") || "http://localhost:5173"}/action-middleware.html?checkout=cancelled`,
      stripeContext: c.env.STRIPE_CONTEXT?.trim() || undefined,
    });

    return c.json(result, result.success ? 200 : 400);
  } catch (error) {
    console.error("Stripe checkout error:", error);
    return c.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to create checkout session" },
      500
    );
  }
});

// Custom endpoint: Form submission handler
// This demonstrates how to add custom API endpoints alongside the proxy
app.post("/api/form", async (c) => {
  try {
    const body = await c.req.json();

    // In a real application, you might:
    // - Validate the form data
    // - Store it in a database (D1, KV, etc.)
    // - Send notifications
    // - Trigger workflows

    console.log("Form submission received:", body);

    return c.json({
      success: true,
      message: "Form submitted successfully",
      timestamp: new Date().toISOString(),
      data: body,
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: "Invalid form data",
      },
      400
    );
  }
});

// Custom endpoint: Health check
// Useful for monitoring and ensuring the worker is running
app.get("/health", (c) => {
  return c.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    endpoints: {
      basic: "/api/chat/dispatch",
      directive: "/api/chat/dispatch-directive",
      action: "/api/chat/dispatch-action",
      metadata: "/api/chat/dispatch-metadata",
      checkout: "/api/checkout",
      form: "/api/form",
    },
  });
});

// Root endpoint with usage information
app.get("/", (c) => {
  return c.json({
    name: "Persona Proxy - Cloudflare Workers",
    description: "Chat proxy service powered by Runtype AI",
    endpoints: {
      "/api/chat/dispatch": "Basic conversational assistant",
      "/api/chat/dispatch-directive": "Directive-enabled flow (requires RUNTYPE_FLOW_ID)",
      "/api/chat/dispatch-action": "Shopping assistant with JSON action responses (message, nav_then_click, message_and_click, checkout)",
      "/api/chat/dispatch-metadata": "Metadata-based shopping assistant (DOM sent as record metadata, not appended to messages)",
      "/api/checkout": "Stripe checkout session creation (POST, requires STRIPE_SECRET_KEY)",
      "/api/form": "Form submission handler (POST)",
      "/health": "Health check endpoint",
    },
    docs: "https://docs.runtype.com",
  });
});

// Export for Cloudflare Workers
export default app;
