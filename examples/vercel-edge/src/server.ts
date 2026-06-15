import "dotenv/config";
import { serve } from "@hono/node-server";
import getPort from "get-port";
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
  WEBMCP_PAINT_FLOW,
  WEBMCP_DOCKED_FLOW,
  PAGE_CONTEXT_FLOW,
  THEME_ASSISTANT_FLOW,
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
// Production origins are supplied at deploy time via ALLOWED_ORIGINS (comma-
// separated). Dynamic preview sites are matched separately by the proxy's
// previewOriginPattern (set PREVIEW_ORIGIN_PATTERN to allow non-Vercel ones).
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

// Storefront assistant proxy - for Everspun persistent-composer demo
const storefrontApp = createChatProxyApp({
  path: "/api/chat/dispatch-storefront",
  allowedOrigins,
  flowId: process.env.FLOW_ID_STOREFRONT || undefined,
  flowConfig: process.env.FLOW_ID_STOREFRONT ? undefined : STOREFRONT_ASSISTANT_FLOW,
  upstreamUrl
});

// WebMCP storefront proxy - for the "Switchback" WebMCP demo.
// The demo page registers its tools on document.modelContext; the widget sends
// them as clientTools[] each turn and the proxy forwards them upstream (and
// proxies the /resume round-trip). The agent definition lives entirely in code
// as WEBMCP_STOREFRONT_FLOW: no hosted Runtype agent / client token needed.
const webmcpApp = createChatProxyApp({
  path: "/api/chat/dispatch-webmcp",
  allowedOrigins,
  flowId: process.env.FLOW_ID_WEBMCP || undefined,
  flowConfig: process.env.FLOW_ID_WEBMCP ? undefined : WEBMCP_STOREFRONT_FLOW,
  upstreamUrl
});

// WebMCP calendar proxy - for the calendar copilot demo. Same pattern as the
// storefront: the page registers ten calendar tools on document.modelContext,
// the widget forwards them as clientTools[], and the in-code
// WEBMCP_CALENDAR_FLOW drives them: no hosted Runtype agent / client token.
const webmcpCalendarApp = createChatProxyApp({
  path: "/api/chat/dispatch-calendar",
  allowedOrigins,
  flowId: process.env.FLOW_ID_CALENDAR || undefined,
  flowConfig: process.env.FLOW_ID_CALENDAR ? undefined : WEBMCP_CALENDAR_FLOW,
  upstreamUrl
});

// WebMCP slides proxy - for the Deck Copilot slide-editor demo. Same pattern,
// with a twist: the page's tool set is dynamic (selection-scoped tools appear
// with multi-select; presenter mode swaps the editing set for show controls),
// and the widget ships live editor state as {{slides_context}} via inputs.
const webmcpSlidesApp = createChatProxyApp({
  path: "/api/chat/dispatch-slides",
  allowedOrigins,
  flowId: process.env.FLOW_ID_SLIDES || undefined,
  flowConfig: process.env.FLOW_ID_SLIDES ? undefined : WEBMCP_SLIDES_FLOW,
  upstreamUrl
});

// WebMCP paint proxy - for the Paint Pal jspaint demo. Same pattern as the
// others, plus the visual loop: get_canvas_snapshot returns the canvas as an
// MCP image content block through /resume (like the Theme Copilot's
// screenshot_preview), so the flow's model must accept image tool results.
const webmcpPaintApp = createChatProxyApp({
  path: "/api/chat/dispatch-paint",
  allowedOrigins,
  flowId: process.env.FLOW_ID_PAINT || undefined,
  flowConfig: process.env.FLOW_ID_PAINT ? undefined : WEBMCP_PAINT_FLOW,
  upstreamUrl
});

// WebMCP docked-dashboard proxy - for the docked panel demo. Same pattern as
// the storefront/calendar: the page registers four workspace tools on
// document.modelContext, the widget forwards them as clientTools[], and the
// in-code WEBMCP_DOCKED_FLOW drives them: no hosted Runtype agent / client token.
const webmcpDockedApp = createChatProxyApp({
  path: "/api/chat/dispatch-docked",
  allowedOrigins,
  flowId: process.env.FLOW_ID_DOCKED || undefined,
  flowConfig: process.env.FLOW_ID_DOCKED ? undefined : WEBMCP_DOCKED_FLOW,
  upstreamUrl
});

// Page-context proxy - read-only, markdown answers about the current page.
// Used by the smart-dom-reader demo: the widget sends live page context (including
// shadow-DOM elements) as `inputs`, and this flow injects it via {{pageContext}}.
const pageContextApp = createChatProxyApp({
  path: "/api/chat/dispatch-page-context",
  allowedOrigins,
  flowId: process.env.FLOW_ID_PAGE_CONTEXT || undefined,
  flowConfig: process.env.FLOW_ID_PAGE_CONTEXT ? undefined : PAGE_CONTEXT_FLOW,
  upstreamUrl
});

// Theme-assistant proxy: for the Theme Editor's docked Theme Copilot.
// The Theme Editor registers its controls (plus screenshot_preview) as WebMCP
// tools on document.modelContext; the copilot widget ships them as clientTools[]
// and the agent calls them (webmcp:*) to restyle the live theme preview.
// Tool-calling flow (not an action envelope), so it relies on clientTools
// forwarding + /resume: including image blocks in screenshot tool results.
const themeAssistantApp = createChatProxyApp({
  path: "/api/chat/dispatch-theme",
  allowedOrigins,
  flowId: process.env.FLOW_ID_THEME_ASSISTANT || undefined,
  flowConfig: process.env.FLOW_ID_THEME_ASSISTANT ? undefined : THEME_ASSISTANT_FLOW,
  upstreamUrl
});

// Mount all apps
app.route("/", directiveApp);
app.route("/", actionApp);
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

// --- Streaming text-to-speech proxy (OpenAI) ---
// Streams raw 24 kHz / 16-bit / mono PCM from OpenAI straight to the browser,
// where examples/embedded-app's ServerTtsEngine feeds it into Persona's
// AudioPlaybackManager for gap-free, low-latency "Read aloud" playback. The API
// key stays server-side. CORS preflight is handled by the proxy's global
// withCors middleware; we also reflect the allowed origin on the stream response
// to match the other custom routes here.
app.post("/api/tts", async (c) => {
  const origin = c.req.header("origin");
  const corsOrigin = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  if (!process.env.OPENAI_API_KEY) {
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
  try {
    const body = (await c.req.json()) as {
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
    return c.json({ error: "Invalid JSON body." }, 400, {
      "Access-Control-Allow-Origin": corsOrigin,
    });
  }
  if (!text) {
    return c.json({ error: "Missing 'text'." }, 400, {
      "Access-Control-Allow-Origin": corsOrigin,
    });
  }

  // response_format: "pcm" → raw 24 kHz / 16-bit signed LE / mono, exactly what
  // AudioPlaybackManager.enqueue() expects. To use ElevenLabs instead, POST to
  // /v1/text-to-speech/{voiceId} with output_format: "pcm_24000" and the
  // xi-api-key header — the streamed body plugs into the same client engine.
  const payload: Record<string, unknown> = {
    // `tts-1` is OpenAI's low-latency model (faster first byte + steady
    // delivery); `gpt-4o-mini-tts` is higher quality but slower and burstier to
    // start. Default to the responsive one; override per-request or via env.
    model: model || process.env.OPENAI_TTS_MODEL || "tts-1",
    voice: voice || process.env.OPENAI_TTS_VOICE || "alloy",
    input: text,
    response_format: "pcm",
  };
  // `speed` isn't accepted by every model (gpt-4o-mini-tts rejects it), so only
  // send it when a caller actually asked for a non-default rate.
  if (typeof rate === "number" && rate !== 1) {
    payload.speed = Math.min(4, Math.max(0.25, rate));
  }

  const upstream = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
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

  // Pass the PCM stream straight through — no buffering, so playback can start
  // as soon as the first chunk lands.
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

// Storefront-specific Stripe checkout endpoint
// Returns to persistent-composer.html after checkout
app.post("/api/checkout/storefront", async (c) => {
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

    // Create Stripe checkout session for storefront
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
    console.error("Storefront checkout error:", error);
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
      ? "We'll follow up shortly to confirm."
      : "Thanks for the additional context."
  ];
  if (name) summaryLines.push(`Name: ${name}`);

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
