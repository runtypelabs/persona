import { handle } from "hono/vercel";
import {
  createChatProxyApp,
  FORM_DIRECTIVE_FLOW,
  SHOPPING_ASSISTANT_FLOW,
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
// page's clientTools[] upstream and proxies the /resume round-trip; the
// server-pinned agent is defined in code as WEBMCP_STOREFRONT_AGENT.
const webmcpApp = createChatProxyApp({
  path: "/api/chat/dispatch-webmcp",
  allowedOrigins,
  ...(process.env.FLOW_ID_WEBMCP
    ? { flowId: process.env.FLOW_ID_WEBMCP, flowConfig: undefined }
    : {
        agentId: process.env.AGENT_ID_WEBMCP || undefined,
        agentConfig: process.env.AGENT_ID_WEBMCP
          ? undefined
          : WEBMCP_STOREFRONT_AGENT,
      }),
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

// WebMCP paint proxy - for the Paint Pal jspaint demo. The flow's model must
// accept image tool results (get_canvas_snapshot returns the canvas through
// /resume as an MCP image content block).
const webmcpPaintApp = createChatProxyApp({
  path: "/api/chat/dispatch-paint",
  allowedOrigins,
  flowId: process.env.FLOW_ID_PAINT || undefined,
  flowConfig: process.env.FLOW_ID_PAINT ? undefined : WEBMCP_PAINT_FLOW,
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
  ...(process.env.FLOW_ID_PAGE_CONTEXT
    ? { flowId: process.env.FLOW_ID_PAGE_CONTEXT, flowConfig: undefined }
    : {
        agentId: process.env.AGENT_ID_PAGE_CONTEXT || undefined,
        agentConfig: process.env.AGENT_ID_PAGE_CONTEXT
          ? undefined
          : PAGE_CONTEXT_AGENT,
      }),
  upstreamUrl,
});

// Theme Copilot proxy - for the Theme Editor's docked styling copilot.
const themeAssistantApp = createChatProxyApp({
  path: "/api/chat/dispatch-theme",
  allowedOrigins,
  ...(process.env.FLOW_ID_THEME_ASSISTANT
    ? { flowId: process.env.FLOW_ID_THEME_ASSISTANT, flowConfig: undefined }
    : {
        agentId: process.env.AGENT_ID_THEME_ASSISTANT || undefined,
        agentConfig: process.env.AGENT_ID_THEME_ASSISTANT
          ? undefined
          : THEME_ASSISTANT_AGENT,
      }),
  upstreamUrl,
});

// Agent Loop proxy - for the agent-demo Travel Planner demo. Server-pinned
// replacement for the demo's former browser-supplied `config.agent`.
const agentLoopApp = createChatProxyApp({
  path: "/api/chat/dispatch-agent-loop",
  allowedOrigins,
  agentId: process.env.AGENT_ID_AGENT_LOOP || undefined,
  agentConfig: process.env.AGENT_ID_AGENT_LOOP ? undefined : TRAVEL_PLANNER_AGENT,
  upstreamUrl,
});

// Docs-assistant proxy - for the home demo's Persona Documentation Assistant.
// Server-pinned replacement for the demo's former browser-supplied `config.agent`.
const docsAssistantApp = createChatProxyApp({
  path: "/api/chat/dispatch-docs",
  allowedOrigins,
  agentId: process.env.AGENT_ID_DOCS || undefined,
  agentConfig: process.env.AGENT_ID_DOCS ? undefined : DOCS_ASSISTANT_AGENT,
  upstreamUrl,
});

// Fullscreen-assistant proxy - for the fullscreen-assistant Chat Assistant demo.
// Server-pinned replacement for the demo's former browser-supplied `config.agent`.
const chatAssistantApp = createChatProxyApp({
  path: "/api/chat/dispatch-assistant",
  allowedOrigins,
  agentId: process.env.AGENT_ID_ASSISTANT || undefined,
  agentConfig: process.env.AGENT_ID_ASSISTANT ? undefined : CHAT_ASSISTANT_AGENT,
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
app.route("/", webmcpPaintApp);
app.route("/", webmcpDockedApp);
app.route("/", pageContextApp);
app.route("/", themeAssistantApp);
app.route("/", agentLoopApp);
app.route("/", docsAssistantApp);
app.route("/", chatAssistantApp);

// --- Streaming text-to-speech proxy (OpenAI) ---
// Streams raw 24 kHz / 16-bit / mono PCM from OpenAI straight to the browser,
// where examples/embedded-app's ServerTtsEngine feeds it into Persona's
// createPcmStreamPlayer for jitter-buffered "Read aloud" playback. The API
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
  // the Persona PCM stream player expects. For Runtype-hosted agent voices, call
  // POST /v1/client/agents/{agentId}/speak instead; for a direct ElevenLabs proxy,
  // POST to /v1/text-to-speech/{voiceId}/stream?output_format=pcm_24000 with the
  // xi-api-key header. Either streamed body plugs into the same client engine.
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
