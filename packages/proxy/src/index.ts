import { Hono } from "hono";
import type { Context } from "hono";
import { handle } from "hono/vercel";

export type RuntypeFlowStep = {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
};

export type RuntypeFlowConfig = {
  name: string;
  description: string;
  steps: RuntypeFlowStep[];
};

export type AgentLoopConfig = {
  maxTurns: number;
  maxCost?: number;
  enableReflection?: boolean;
  reflectionInterval?: number;
};

export type AgentToolsConfig = {
  toolIds?: string[];
  toolConfigs?: Record<string, Record<string, unknown>>;
  runtimeTools?: Array<Record<string, unknown>>;
  mcpServers?: Array<Record<string, unknown>>;
  maxToolCalls?: number;
  toolCallStrategy?: "auto" | "required" | "none";
  perToolLimits?: Record<string, { maxCalls?: number; required?: boolean }>;
  approval?: {
    require: string[] | boolean;
    timeout?: number;
    requestReason?: boolean;
  };
  subagentConfig?: {
    toolPool: string[];
    defaultMaxTurns?: number;
    maxTurnsLimit?: number;
    maxSpawnsPerRun?: number;
    defaultModel?: string;
    allowNesting?: boolean;
    defaultTimeoutMs?: number;
  };
  codeModeConfig?: {
    toolPool: string[];
    description?: string;
    timeoutMs?: number;
  };
};

export type PersonaArtifactKind = "markdown" | "component";

export type ArtifactConfigPayload = {
  enabled: true;
  types: PersonaArtifactKind[];
};

export type AgentConfig = {
  name: string;
  model: string;
  systemPrompt: string;
  responseFormat?: string;
  reasoning?: boolean;
  temperature?: number;
  tools?: AgentToolsConfig;
  artifacts?: ArtifactConfigPayload;
  loopConfig?: AgentLoopConfig;
};

type RuntimeEnv = Record<string, string | undefined>;

/**
 * Payload for message feedback (upvote/downvote)
 */
export type FeedbackPayload = {
  type: "upvote" | "downvote";
  messageId: string;
  content?: string;
  timestamp?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Handler function for processing feedback
 */
export type FeedbackHandler = (feedback: FeedbackPayload) => Promise<void> | void;

export type ProxyRequestKind = "dispatch" | "resume" | "feedback";

export type ProxyRequestGuardContext = {
  request: Request;
  kind: ProxyRequestKind;
  path: string;
};

export type ProxyRequestGuard = (
  context: ProxyRequestGuardContext
) => Response | void | Promise<Response | void>;

export type ChatProxyOptions = {
  upstreamUrl?: string;
  apiKey?: string;
  path?: string;
  allowedOrigins?: string[];
  /** Optional authorization/rate-limit hook run before body parsing or upstream work. */
  requestGuard?: ProxyRequestGuard;
  /** Optional UTF-8 JSON body limit. Disabled by default for compatibility. */
  maxRequestBodyBytes?: number;
  /**
   * Reflect any request origin matching this pattern, in addition to the exact
   * `allowedOrigins` list. Intended for Vercel **preview** deployments, whose
   * URLs are per-branch and dynamic (`*-git-<branch>-<team>.vercel.app`) and so
   * can't be enumerated. Defaults to `https://*.vercel.app`
   * ({@link DEFAULT_PREVIEW_ORIGIN_PATTERN}); pass a custom `RegExp`, set the
   * `PREVIEW_ORIGIN_PATTERN` env var, or pass `false` to disable. Independent of
   * the `VERCEL_ENV === "preview"` runtime check, which always reflects the
   * caller's origin when the proxy itself is a preview deployment.
   */
  previewOriginPattern?: RegExp | false;
  /**
   * Hosted Runtype agent ID. Mutually exclusive with flowId/flowConfig and
   * agentConfig.
   */
  agentId?: string;
  /**
   * Server-pinned agent definition. When set, the proxy builds an agent-mode
   * upstream payload using this config and only client messages/clientTools/
   * metadata/context. The client cannot override model, prompt, tools, or loop
   * config.
   */
  agentConfig?: AgentConfig;
  flowId?: string;
  flowConfig?: RuntypeFlowConfig;
  /**
   * Path for the feedback endpoint (default: "/api/feedback")
   */
  feedbackPath?: string;
  /**
   * Custom handler for processing feedback.
   * Use this to store feedback in a database or send to analytics.
   * 
   * @example
   * ```ts
   * onFeedback: async (feedback) => {
   *   await db.feedback.create({ data: feedback });
   * }
   * ```
   */
  onFeedback?: FeedbackHandler;
};

const DEFAULT_ENDPOINT = "https://api.runtype.com/v1/dispatch";
const DEFAULT_PATH = "/api/chat/dispatch";

const getRuntimeEnv = (): RuntimeEnv | undefined => {
  const maybeProcess = (
    globalThis as typeof globalThis & { process?: { env?: RuntimeEnv } }
  ).process;
  return maybeProcess?.env;
};

/** True only when `NODE_ENV` is exactly `"development"` (unset = production). Safe when `process` is missing (e.g. some Workers runtimes). */
const isDevelopmentRuntime = (): boolean =>
  getRuntimeEnv()?.NODE_ENV === "development";

/**
 * True when this proxy is itself running as a Vercel **preview** deployment
 * (`VERCEL_ENV === "preview"`). Vercel sets `NODE_ENV=production` for both
 * production and preview, so `isDevelopmentRuntime()` can't distinguish them: * `VERCEL_ENV` is the only signal. Preview deployments get per-branch, dynamic
 * URLs (`*-git-<branch>-<team>.vercel.app`) that can't be enumerated in a
 * static `allowedOrigins` list, so for CORS we treat a preview runtime like
 * development and reflect the caller's origin. Safe when `process` is missing.
 */
const isVercelPreviewRuntime = (): boolean =>
  getRuntimeEnv()?.VERCEL_ENV === "preview";

/**
 * Default origin pattern treated as a Vercel preview/app origin: any
 * `https://<sub>.vercel.app`. When a *production* proxy is called by a static
 * preview site (a different, dynamic `*.vercel.app` origin), the origin won't be
 * in `allowedOrigins`; matching this pattern lets the proxy reflect it so
 * per-branch preview sites work without enumerating their URLs. To allow other
 * preview domains, supply your own pattern via the `previewOriginPattern` option
 * or the `PREVIEW_ORIGIN_PATTERN` env regex; disable with
 * `previewOriginPattern: false`.
 *
 * The `$`-anchored apex prevents look-alikes like `https://x.vercel.app.evil.com`
 * from matching.
 */
const DEFAULT_PREVIEW_ORIGIN_PATTERN = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;

/**
 * Resolve the preview-origin pattern from options/env. Precedence:
 * explicit `options.previewOriginPattern` (a `RegExp`, or `false` to disable) →
 * `PREVIEW_ORIGIN_PATTERN` env (compiled as a `RegExp`; ignored if invalid) →
 * {@link DEFAULT_PREVIEW_ORIGIN_PATTERN}.
 */
const resolvePreviewOriginPattern = (
  option: RegExp | false | undefined
): RegExp | null => {
  if (option === false) return null;
  if (option instanceof RegExp) return option;
  const envPattern = getRuntimeEnv()?.PREVIEW_ORIGIN_PATTERN;
  if (envPattern) {
    try {
      return new RegExp(envPattern);
    } catch {
      // Invalid env regex: fall back to the default rather than throwing at
      // app-construction time.
    }
  }
  return DEFAULT_PREVIEW_ORIGIN_PATTERN;
};

const DEFAULT_FLOW: RuntypeFlowConfig = {
  name: "Streaming Prompt Flow",
  description: "Streaming chat generated by the widget",
  steps: [
    {
      id: "widget_prompt",
      name: "Prompt",
      type: "prompt",
      enabled: true,
      config: {
        model: "nemotron-3-ultra-550b-a55b",
        responseFormat: "markdown",
        outputVariable: "prompt_result",
        userPrompt: "{{user_message}}",
        systemPrompt: "you are a helpful assistant, chatting with a user",
        // tools: {
        //   toolIds: [
        //     "builtin:dalle"
        //   ]
        // },
        previousMessages: "{{messages}}"
      }
    }
  ]
};

type ProxyMessage = {
  role: string;
  content: unknown;
  createdAt?: string;
};

const sortAndFormatMessages = (value: unknown) => {
  const messages = Array.isArray(value) ? (value as ProxyMessage[]) : [];
  return [...messages]
    .sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeA - timeB;
    })
    .map((message) => ({
      role: message.role,
      content: message.content
    }));
};

const withCors =
  (allowedOrigins: string[] | undefined, previewOriginPattern: RegExp | null) =>
    async (c: Context, next: () => Promise<void>) => {
      const origin = c.req.header("origin");
      const isDevelopment = isDevelopmentRuntime();
      // A request is preview-allowed when either the proxy itself is a Vercel
      // preview deployment (reflect any caller, like dev) or the caller's origin
      // matches the configured preview pattern (e.g. a `*.vercel.app` preview
      // site calling a production proxy). Both reflect the actual origin.
      const isPreviewOrigin = Boolean(
        origin &&
          (isVercelPreviewRuntime() ||
            (previewOriginPattern !== null && previewOriginPattern.test(origin)))
      );

      // Determine the CORS origin to allow
      let corsOrigin: string;
      if (!allowedOrigins || allowedOrigins.length === 0) {
        // No restrictions - allow any origin (or use the request origin)
        corsOrigin = origin || "*";
      } else if (allowedOrigins.includes(origin || "")) {
        // Origin is in the allowed list
        corsOrigin = origin || "*";
      } else if (isDevelopment && origin) {
        // In development, allow the actual origin even if not in the list
        // This helps with local development where ports might vary
        corsOrigin = origin;
      } else if (isPreviewOrigin && origin) {
        // Vercel preview deployment (or a configured preview origin): reflect the
        // dynamic per-branch origin that can't be enumerated in allowedOrigins.
        corsOrigin = origin;
      } else {
        // Production: origin not allowed - reject by not setting CORS headers
        // Return error for preflight, or continue without CORS headers
        if (c.req.method === "OPTIONS") {
          return c.json({ error: "CORS policy violation: origin not allowed" }, 403);
        }
        // For non-preflight requests, continue but browser will block due to missing CORS headers
        await next();
        return;
      }

      const headers: Record<string, string> = {
        "Access-Control-Allow-Origin": corsOrigin,
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, X-Persona-Version",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        Vary: "Origin"
      };

      if (c.req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers });
      }

      await next();
      Object.entries(headers).forEach(([key, value]) =>
        c.header(key, value, { append: false })
      );
    };

export const createChatProxyApp = (options: ChatProxyOptions = {}) => {
  if ((options.agentConfig || options.agentId) && (options.flowConfig || options.flowId)) {
    throw new Error(
      "createChatProxyApp: agentConfig/agentId cannot be combined with flowConfig/flowId."
    );
  }
  if (options.agentConfig && options.agentId) {
    throw new Error(
      "createChatProxyApp: agentConfig and agentId are mutually exclusive."
    );
  }
  if (
    options.maxRequestBodyBytes !== undefined &&
    (!Number.isFinite(options.maxRequestBodyBytes) ||
      !Number.isInteger(options.maxRequestBodyBytes) ||
      options.maxRequestBodyBytes < 1)
  ) {
    throw new Error(
      "createChatProxyApp: maxRequestBodyBytes must be a positive integer."
    );
  }

  const app = new Hono();
  const path = options.path ?? DEFAULT_PATH;
  const feedbackPath = options.feedbackPath ?? "/api/feedback";
  const upstream = options.upstreamUrl ?? DEFAULT_ENDPOINT;

  const previewOriginPattern = resolvePreviewOriginPattern(
    options.previewOriginPattern
  );
  app.use("*", withCors(options.allowedOrigins, previewOriginPattern));

  const errorResponse = (error: string, status: number) =>
    new Response(JSON.stringify({ error }), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  const guardRequest = async (
    c: Context,
    kind: ProxyRequestKind,
    mountedPath: string
  ): Promise<Response | undefined> => {
    if (!options.requestGuard) return undefined;
    try {
      // Guards receive an independent branch so signature/auth checks may read
      // the body without consuming the handler's request stream.
      return (
        (await options.requestGuard({
          request: c.req.raw.clone(),
          kind,
          path: mountedPath,
        })) ?? undefined
      );
    } catch (error) {
      console.error("[Proxy] Request guard error:", error);
      return errorResponse("Request guard failed", 500);
    }
  };

  const readTextWithinLimit = async (
    request: Request,
    limit: number
  ): Promise<{ success: true; text: string } | { success: false }> => {
    if (!request.body) return { success: true, text: "" };

    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let byteLength = 0;
    let done = false;
    try {
      while (!done) {
        const result = await reader.read();
        done = result.done;
        if (done) break;
        const value = result.value;
        if (!value) continue;
        byteLength += value.byteLength;
        if (byteLength > limit) {
          void reader.cancel().catch(() => undefined);
          return { success: false };
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { success: true, text: new TextDecoder().decode(bytes) };
  };

  const parseJsonBody = async (
    c: Context
  ): Promise<
    | { success: true; value: unknown }
    | { success: false; response: Response }
  > => {
    const limit = options.maxRequestBodyBytes;
    if (limit !== undefined) {
      const declaredLength = c.req.header("content-length")?.trim();
      if (declaredLength && /^\d+$/.test(declaredLength)) {
        try {
          if (BigInt(declaredLength) > BigInt(limit)) {
            return {
              success: false,
              response: errorResponse("Request body too large", 413),
            };
          }
        } catch {
          // Fall through to measuring the actual body.
        }
      }
    }

    const body =
      limit === undefined
        ? { success: true as const, text: await c.req.text() }
        : await readTextWithinLimit(c.req.raw, limit);
    if (!body.success) {
      return {
        success: false,
        response: errorResponse("Request body too large", 413),
      };
    }
    try {
      return { success: true, value: JSON.parse(body.text) as unknown };
    } catch {
      return {
        success: false,
        response: errorResponse("Invalid JSON body", 400),
      };
    }
  };

  // Feedback endpoint for collecting upvote/downvote data
  app.post(feedbackPath, async (c) => {
    const denied = await guardRequest(c, "feedback", feedbackPath);
    if (denied) return denied;
    const parsed = await parseJsonBody(c);
    if (!parsed.success) return parsed.response;
    const payload = parsed.value as FeedbackPayload;

    // Validate payload
    if (!payload.type || !["upvote", "downvote"].includes(payload.type)) {
      return c.json(
        { error: "Invalid feedback type. Must be 'upvote' or 'downvote'" },
        400
      );
    }
    if (!payload.messageId) {
      return c.json({ error: "Missing messageId" }, 400);
    }

    // Add timestamp if not provided
    payload.timestamp = payload.timestamp ?? new Date().toISOString();

    const isDevelopment = isDevelopmentRuntime();

    if (isDevelopment) {
      console.log("\n=== Feedback Received ===");
      console.log("Type:", payload.type);
      console.log("Message ID:", payload.messageId);
      console.log("Content Length:", payload.content?.length ?? 0);
      console.log("Timestamp:", payload.timestamp);
      console.log("=== End Feedback ===\n");
    }

    // Call custom handler if provided
    if (options.onFeedback) {
      try {
        await options.onFeedback(payload);
      } catch (error) {
        console.error("[Feedback] Handler error:", error);
        return c.json({ error: "Feedback handler failed" }, 500);
      }
    }

    return c.json({
      success: true,
      message: "Feedback recorded",
      feedback: {
        type: payload.type,
        messageId: payload.messageId,
        timestamp: payload.timestamp
      }
    });
  });

  // Chat dispatch endpoint
  app.post(path, async (c) => {
    const denied = await guardRequest(c, "dispatch", path);
    if (denied) return denied;
    const apiKey = options.apiKey ?? getRuntimeEnv()?.RUNTYPE_API_KEY;
    if (!apiKey) {
      return c.json(
        { error: "Missing API key. Set RUNTYPE_API_KEY." },
        401
      );
    }

    const parsed = await parseJsonBody(c);
    if (!parsed.success) return parsed.response;
    const clientPayload = parsed.value as Record<string, unknown>;

    const isDevelopment = isDevelopmentRuntime();

    let mode: "server-agent" | "flow";
    if (options.agentConfig || options.agentId) {
      mode = "server-agent";
    } else if (clientPayload.agent) {
      // The old "client-agent" passthrough forwarded a browser-supplied agent
      // config verbatim to the upstream API on the deployer's key — an open
      // relay. Pin the agent server-side with `agentConfig`/`agentId` instead.
      // Reject loudly rather than silently falling through to flow mode.
      return c.json(
        {
          error:
            "A client-supplied `agent` is not accepted by this proxy. Pin the agent server-side with `agentConfig`/`agentId`, or point the widget at a backend authorized to accept a client-supplied agent.",
        },
        400
      );
    } else {
      mode = "flow";
    }

    let runtypePayload: Record<string, unknown>;

    if (mode === "server-agent") {
      const formattedMessages = sortAndFormatMessages(clientPayload.messages);

      runtypePayload = {
        agent: options.agentId ? { agentId: options.agentId } : options.agentConfig,
        messages: formattedMessages,
        options: {
          streamResponse: true,
          recordMode: "virtual"
        }
      };

      if (clientPayload.metadata && typeof clientPayload.metadata === "object") {
        runtypePayload.metadata = clientPayload.metadata;
      }

      if (
        Array.isArray(clientPayload.clientTools) &&
        clientPayload.clientTools.length > 0
      ) {
        runtypePayload.clientTools = clientPayload.clientTools;
      }

      if (clientPayload.context && typeof clientPayload.context === "object") {
        runtypePayload.context = clientPayload.context;
      }

      if (clientPayload.inputs && typeof clientPayload.inputs === "object") {
        runtypePayload.inputs = clientPayload.inputs;
      }
    } else {
      // Flow dispatch - build the Runtype flow payload
      const formattedMessages = sortAndFormatMessages(clientPayload.messages);

      const flowId = (clientPayload.flowId as string | undefined) ?? options.flowId;
      const flowConfig = options.flowConfig ?? DEFAULT_FLOW;

      runtypePayload = {
        record: {
          name: "Streaming Chat Widget",
          type: "standalone",
          metadata: (clientPayload.metadata as Record<string, unknown>) || {}
        },
        messages: formattedMessages,
        options: {
          streamResponse: true,
          recordMode: "virtual",
          flowMode: flowId ? "existing" : "virtual",
          autoAppendMetadata: false
        }
      };

      const clientInputs = clientPayload.inputs;
      if (clientInputs && typeof clientInputs === "object" && !Array.isArray(clientInputs)) {
        runtypePayload.inputs = clientInputs;
      }

      if (flowId) {
        runtypePayload.flow = { id: flowId };
      } else {
        runtypePayload.flow = flowConfig;
      }

      // WebMCP: forward page-discovered tools so the upstream flow's agent step
      // can call them. The widget snapshots `document.modelContext` per turn and
      // ships them as `clientTools[]`; the flow-dispatch payload is rebuilt from
      // scratch above, so without this they'd be silently dropped and the agent
      // would never see the page tools. (Server-agent mode forwards `clientTools`
      // explicitly when building its payload above.) The matching results come
      // back via the `${path}/resume` endpoint below.
      if (
        Array.isArray(clientPayload.clientTools) &&
        clientPayload.clientTools.length > 0
      ) {
        runtypePayload.clientTools = clientPayload.clientTools;
      }
    }

    // Development only: do not log key material or full bodies in production.
    if (isDevelopment) {
      console.log(`\n=== Runtype Proxy Request (${mode}) ===`);
      console.log("URL:", upstream);
      console.log("API Key Used:", apiKey ? "Yes" : "No");
      console.log("API Key (first 12 chars):", apiKey ? apiKey.substring(0, 12) : "N/A");
      console.log("Request Payload:", JSON.stringify(runtypePayload, null, 2));
    }

    // Forward the widget's self-reported version to the API, when present.
    const personaVersion = c.req.header("x-persona-version");

    const response = await fetch(upstream, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(personaVersion && { "X-Persona-Version": personaVersion })
      },
      body: JSON.stringify(runtypePayload)
    });

    if (isDevelopment) {
      console.log("Response Status:", response.status);
      console.log("Response Status Text:", response.statusText);

      // If there's an error, try to read and log the response body
      if (!response.ok) {
        const clonedResponse = response.clone();
        try {
          const errorBody = await clonedResponse.text();
          console.log("Error Response Body:", errorBody);
        } catch (e) {
          console.log("Could not read error response body:", e);
        }
      }
      console.log("=== End Runtype Proxy Request ===\n");
    }

    return new Response(response.body, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store"
      }
    });
  });

  // Resume endpoint: forwards client-executed (LOCAL) tool results back to
  // the Runtype upstream so a paused flow execution can continue. Mounted as
  // a child of the dispatch path so the widget can derive its URL by
  // appending "/resume" to whatever `apiUrl` it was configured with.
  app.post(`${path}/resume`, async (c) => {
    const resumePath = `${path}/resume`;
    const denied = await guardRequest(c, "resume", resumePath);
    if (denied) return denied;
    const apiKey = options.apiKey ?? getRuntimeEnv()?.RUNTYPE_API_KEY;
    if (!apiKey) {
      return c.json(
        { error: "Missing API key. Set RUNTYPE_API_KEY." },
        401
      );
    }

    const parsed = await parseJsonBody(c);
    if (!parsed.success) return parsed.response;
    const body = parsed.value as Record<string, unknown>;

    const isDevelopment = isDevelopmentRuntime();
    const upstreamResumeUrl = `${upstream.replace(/\/+$/, '')}/resume`;

    if (isDevelopment) {
      console.log("\n=== Runtype Proxy Resume ===");
      console.log("URL:", upstreamResumeUrl);
      console.log(
        "executionId:",
        typeof body.executionId === "string" ? body.executionId : "(missing)"
      );
      console.log(
        "toolOutputs keys:",
        body.toolOutputs && typeof body.toolOutputs === "object"
          ? Object.keys(body.toolOutputs)
          : "(none)"
      );
      console.log("=== End Runtype Proxy Resume ===\n");
    }

    // Forward the widget's self-reported version to the API, when present.
    const personaVersion = c.req.header("x-persona-version");

    const response = await fetch(upstreamResumeUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(personaVersion && { "X-Persona-Version": personaVersion })
      },
      body: JSON.stringify(body)
    });

    return new Response(response.body, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store"
      }
    });
  });

  return app;
};

export const createVercelHandler = (options?: ChatProxyOptions) =>
  handle(createChatProxyApp(options));

// Export pre-configured flows
export * from "./flows/index.js";

// Export pre-configured agent templates
export * from "./agents/index.js";

// Export utility functions
export * from "./utils/index.js";

export default createChatProxyApp;
