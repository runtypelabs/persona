import "@runtypelabs/persona/widget.css";

import {
  DEFAULT_WIDGET_CONFIG,
  markdownPostprocessor,
  type AgentWidgetConfig,
  type AgentWidgetController,
  type AgentWidgetWebMcpConfig,
} from "@runtypelabs/persona";
import { createMockSSEResponse, type MockSSEFrame } from "@runtypelabs/persona/testing";
import { initializeWebMCPPolyfill } from "@mcp-b/webmcp-polyfill";

import { createDemoConfigInspector } from "./demo-config-inspector";
import { renderDemoScaffold } from "./demo-scaffold";
import {
  LIVE_VIEW_RESOLVE_EVENT,
  LIVE_VIEW_STATUS_EVENT,
  type LiveViewResolveDetail,
  type LiveViewStatusDetail,
} from "./gallery-components/live-view-card";
import { registerGalleryComponents } from "./gallery-components";
import { runWidgetMountWithInspector, setupMountMode } from "./mount-mode";
import type { Mode } from "./examples-nav";

/**
 * Human-in-the-loop browser handoff.
 *
 * An agent driving a remote browser (Cloudflare Browser Run) hits a step only a
 * person can do — a login, a 2FA code, a CAPTCHA — and hands control over. The
 * run parks, a `BrowserLiveViewCard` renders in the transcript with the live
 * session embedded, the human does the step, and their Done/Failed click
 * resumes the agent.
 *
 * ## How the pause actually works
 *
 * The handoff is a **WebMCP page tool**: `wait_for_human_handoff` is registered
 * on `document.modelContext`, so the widget ships it to the agent on every
 * dispatch as a LOCAL tool. When the model calls it, the server emits a
 * `step_await` (`awaitReason: "local_tool_required"`) and closes the SSE
 * stream — the run is parked, and `session.isAwaitPending()` already stops the
 * durable-reconnect logic from mistaking that for a dropped connection. The
 * widget then runs our `execute()` in the browser and POSTs `${apiUrl}/resume`
 * with whatever it resolves to.
 *
 * That is the whole trick: `execute()` returns a promise that stays pending
 * until the human clicks a button on the card. WebMCP is the only path in
 * Persona today that executes an arbitrary client-supplied tool and resumes the
 * run with its result — the `origin: 'sdk'` client tools (`ask_user_question`,
 * `suggest_replies`) are built-ins with hard-wired widget UI, and there is no
 * public API to resolve a custom local-tool await by hand. So WebMCP it is.
 *
 * ## Mock backend
 *
 * The core-side `browser:*` tools do not exist on staging yet, so this page
 * ships its own backend: a `window.fetch` patch scoped to exactly this demo's
 * dispatch and `/resume` paths (the same technique `litert-shared/litert-engine`
 * uses) that streams Persona's real SSE vocabulary, including the `await` frame
 * that parks the run. Everything downstream of that frame — the tool bubble,
 * the WebMCP bridge, the `/resume` round-trip, the continuation stream — is the
 * widget's genuine machinery, not a simulation.
 */

renderDemoScaffold({ slug: "browser-handoff-demo" });

const configInspector = createDemoConfigInspector({ title: "Browser Handoff" });

// The card lives in the gallery so it is also reachable from the Dynamic
// Components demo; registering here puts `BrowserLiveViewCard` in the shared
// registry before the widget mounts.
registerGalleryComponents();

// ---------------------------------------------------------------------------
// Handoff budget
// ---------------------------------------------------------------------------

/**
 * How long a parked handoff may stay open.
 *
 * The widget's WebMCP bridge caps every `execute()` at a fixed 30s today, which
 * is far too short for a human to sign in to something: past that it abandons
 * the promise and resumes the agent with a timeout error. `toolTimeoutMs` (added
 * in `fix/component-directive-updates`) lifts that cap; on a widget build that
 * predates it the extra key is simply ignored and the effective budget stays
 * 30s. The page runs its own timer at the same budget so the card visibly flips
 * to a failed state instead of hanging.
 */
const HANDOFF_BUDGET_MS = 10 * 60 * 1000;

const MOCK_DISPATCH_PATH = "/mock/browser-handoff/dispatch";
const PROXY_PORT = import.meta.env.VITE_PROXY_PORT ?? 43111;
const PROXY_DISPATCH_URL = import.meta.env.VITE_PROXY_URL
  ? `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch-webmcp`
  : `http://localhost:${PROXY_PORT}/api/chat/dispatch-webmcp`;

const state = {
  /**
   * Mock backend on by default. `?live=1` points the widget at the local
   * proxy's WebMCP route instead — the page tool is discovered the same way, so
   * a real agent can drive the same handoff once the core-side tools exist.
   */
  mock: !new URLSearchParams(location.search).has("live"),
  /** URL embedded in the card. `example.com` is one of the few sites that allows framing. */
  liveViewUrl: "https://example.com",
  /** Whether the next mock dispatch should hand off (re-armed by "Reset"). */
  armed: true,
};

let controller: AgentWidgetController | null = null;
let handoffSeq = 0;
/** The handoff currently parked, so the mock backend can correct its card. */
let activeHandoffId: string | null = null;

const logEl = document.getElementById("handoff-log");
const log = (message: string): void => {
  if (logEl) {
    logEl.textContent += `[${new Date().toLocaleTimeString()}] ${message}\n`;
    logEl.scrollTop = logEl.scrollHeight;
  }
};

// ---------------------------------------------------------------------------
// The handoff tool
// ---------------------------------------------------------------------------

/** Minimal structural view of the WebMCP producer surface (see webmcp-demo.ts). */
interface RegisterableModelContext {
  registerTool(
    tool: {
      name: string;
      title?: string;
      description: string;
      inputSchema?: object;
      annotations?: Record<string, unknown>;
      execute: (args: Record<string, unknown>) => unknown;
    },
    options?: { signal?: AbortSignal },
  ): void;
}

export type HandoffOutcome = { success: boolean; note?: string };

/**
 * Renders the card and parks until the human resolves it.
 *
 * The card is injected with a stable directive id (`handoff-<handoffId>`) and
 * then left alone: it owns its own DOM from here on, and the page talks to it
 * over `persona:live-view-handoff:*` window events rather than by re-injecting
 * the directive (which would rebuild the subtree and reload the live session's
 * iframe).
 */
function beginHandoff(args: {
  liveViewUrl: string;
  handoffId: string;
  instructions: string;
}): Promise<HandoffOutcome> {
  const { liveViewUrl, handoffId, instructions } = args;

  controller?.injectComponentDirective({
    id: `handoff-${handoffId}`,
    component: "BrowserLiveViewCard",
    props: { url: liveViewUrl, handoffId, instructions, status: "waiting" },
    // The card renders the instructions itself; a `text` lead-in here would
    // print them twice. The agent's own narration streams in as normal
    // assistant text before the tool call.
    text: "",
    llmContent: "[Live View handoff card shown to user]",
  });
  activeHandoffId = handoffId;
  log(`handoff ${handoffId} opened — run parked, waiting for the user`);

  return new Promise<HandoffOutcome>((resolve) => {
    let settled = false;
    const finish = (outcome: HandoffOutcome): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(budgetTimer);
      window.removeEventListener(LIVE_VIEW_RESOLVE_EVENT, onResolve);
      resolve(outcome);
    };

    const onResolve = (event: Event): void => {
      const detail = (event as CustomEvent<LiveViewResolveDetail>).detail;
      if (!detail || detail.handoffId !== handoffId) return;
      log(`handoff ${handoffId} resolved: ${detail.success ? "success" : "failed"}`);
      finish({ success: detail.success, ...(detail.note ? { note: detail.note } : {}) });
    };
    window.addEventListener(LIVE_VIEW_RESOLVE_EVENT, onResolve);

    const budgetTimer = window.setTimeout(() => {
      log(`handoff ${handoffId} timed out after ${Math.round(HANDOFF_BUDGET_MS / 1000)}s`);
      setCardStatus(handoffId, "failed", "This handoff expired before it was completed.");
      finish({ success: false, note: "The handoff timed out before the user finished." });
    }, HANDOFF_BUDGET_MS);
  });
}

/** Drive a mounted card's status from the page (timeouts, cancellation). */
function setCardStatus(
  handoffId: string,
  status: LiveViewStatusDetail["status"],
  note?: string,
): void {
  window.dispatchEvent(
    new CustomEvent<LiveViewStatusDetail>(LIVE_VIEW_STATUS_EVENT, {
      detail: { handoffId, status, ...(note ? { note } : {}) },
    }),
  );
}

initializeWebMCPPolyfill();

const modelContext = (document as Document & { modelContext?: RegisterableModelContext })
  .modelContext;

if (modelContext) {
  modelContext.registerTool({
    name: "wait_for_human_handoff",
    title: "Hand the browser to the user",
    description:
      "Hand control of the live browser session to the user and wait for them to finish. " +
      "Call this when a step needs a human — signing in, entering a 2FA code, solving a " +
      "CAPTCHA, accepting terms. Show the live view URL of the paused session and explain " +
      "exactly what the user should do. This call blocks until the user reports back; the " +
      "result says whether they completed the step.",
    inputSchema: {
      type: "object",
      properties: {
        liveViewUrl: {
          type: "string",
          description: "URL of the browser session's live view, embedded for the user.",
        },
        handoffId: {
          type: "string",
          description: "Stable id for this handoff, used to correlate the user's answer.",
        },
        instructions: {
          type: "string",
          description: "What the user needs to do, in one or two plain sentences.",
        },
      },
      required: ["liveViewUrl", "handoffId", "instructions"],
      additionalProperties: false,
    },
    // The tool only renders UI and waits; it mutates nothing on the page, so it
    // skips the WebMCP approval bubble (see `autoApprove` below).
    annotations: { readOnlyHint: true },
    execute(args) {
      return beginHandoff({
        liveViewUrl: typeof args.liveViewUrl === "string" ? args.liveViewUrl : state.liveViewUrl,
        handoffId: typeof args.handoffId === "string" ? args.handoffId : `handoff-${++handoffSeq}`,
        instructions:
          typeof args.instructions === "string"
            ? args.instructions
            : "Complete the step in the browser session below.",
      });
    },
  });
} else {
  log("WebMCP polyfill unavailable — the handoff tool could not be registered.");
}

// ---------------------------------------------------------------------------
// Mock backend: a scoped window.fetch patch that speaks Persona's SSE wire
// ---------------------------------------------------------------------------

const AGENT_OPENING =
  "The checkout wants a sign-in before I can place the order, and passwords are yours. " +
  "Handing you the live session now.";

/**
 * Deltas are coarse (24 chars) on purpose: the widget reveals each one as an
 * animation step, so fine-grained chunks would spend half a minute typing
 * before the handoff card — the thing the demo exists to show — appears.
 */
const textFrames = (executionId: string, turnId: string, text: string): MockSSEFrame[] => {
  const blockId = `${turnId}-text`;
  const frames: MockSSEFrame[] = [{ type: "text_start", executionId, id: blockId }];
  for (let i = 0; i < text.length; i += 24) {
    frames.push({ type: "text_delta", executionId, id: blockId, delta: text.slice(i, i + 24) });
  }
  frames.push({ type: "text_complete", executionId, id: blockId });
  return frames;
};

/**
 * The parking frame. `type: "await"` + `awaitReason: "local_tool_required"` is
 * what a Runtype flow emits when the model calls a LOCAL tool; the `webmcp:`
 * prefix on the name is what routes it to the browser-side bridge. The stream
 * ends here with no `execution_complete` — exactly as the server closes it.
 */
const awaitFrame = (executionId: string, handoffId: string, instructions: string): MockSSEFrame => ({
  type: "await",
  awaitReason: "local_tool_required",
  executionId,
  stepType: "prompt",
  toolCallId: `tc_${handoffId}`,
  toolName: "webmcp:wait_for_human_handoff",
  startedAt: Date.now(),
  parameters: { liveViewUrl: state.liveViewUrl, handoffId, instructions },
});

/**
 * Pull the outcome back out of the normalized WebMCP tool result.
 *
 * `abandoned` marks a resume the human never triggered: the widget gave up on
 * the tool call and resumed with an `isError` result of its own.
 */
const readOutcome = (toolOutputs: unknown): HandoffOutcome & { abandoned: boolean } => {
  const first = toolOutputs && typeof toolOutputs === "object"
    ? Object.values(toolOutputs as Record<string, unknown>)[0]
    : undefined;
  const result = first as { isError?: boolean; content?: Array<{ text?: unknown }> } | undefined;
  const text = result?.content?.[0]?.text;
  if (result?.isError) {
    return {
      success: false,
      abandoned: true,
      note: typeof text === "string" ? text : "the tool call was abandoned",
    };
  }
  if (typeof text === "string") {
    try {
      const parsed = JSON.parse(text) as HandoffOutcome;
      if (typeof parsed?.success === "boolean") return { ...parsed, abandoned: false };
    } catch {
      /* not JSON — fall through */
    }
  }
  return { success: true, abandoned: false };
};

let mockExecutionSeq = 0;

const handleMockDispatch = (): Response => {
  const executionId = `mock-handoff-${++mockExecutionSeq}`;
  if (!state.armed) {
    return createMockSSEResponse(
      [
        { type: "execution_start", kind: "agent", executionId, agentName: "Browser Agent", startedAt: Date.now() },
        { type: "turn_start", executionId, id: "turn-1", iteration: 1 },
        ...textFrames(
          executionId,
          "turn-1",
          "That handoff is already done. Hit “Reset demo” on the left to arm another one.",
        ),
        { type: "turn_complete", executionId, id: "turn-1", stopReason: "complete" },
        { type: "execution_complete", kind: "agent", executionId, success: true, stopReason: "complete" },
      ],
      { delayMs: 12 },
    );
  }

  state.armed = false;
  const handoffId = `handoff-${++handoffSeq}`;
  const instructions =
    "Sign in to the account in the session below, then choose “I've finished” so I can place the order.";
  log(`mock dispatch ${executionId} → step_await for wait_for_human_handoff`);

  return createMockSSEResponse(
    [
      { type: "execution_start", kind: "agent", executionId, agentName: "Browser Agent", startedAt: Date.now() },
      { type: "turn_start", executionId, id: "turn-1", iteration: 1 },
      ...textFrames(executionId, "turn-1", AGENT_OPENING),
      awaitFrame(executionId, handoffId, instructions),
    ],
    { delayMs: 12 },
  );
};

const handleMockResume = (body: { executionId?: string; toolOutputs?: unknown }): Response => {
  const executionId = body.executionId ?? `mock-handoff-${mockExecutionSeq}`;
  const outcome = readOutcome(body.toolOutputs);
  log(`mock /resume for ${executionId}: success=${outcome.success}`);

  // A resume the human did not trigger means the widget gave up on the tool
  // call — today that is the WebMCP bridge's fixed 30s cap (see
  // HANDOFF_BUDGET_MS). The card is still showing "waiting for you" and its
  // buttons would now resolve nothing, so correct it.
  if (activeHandoffId && outcome.abandoned) {
    setCardStatus(activeHandoffId, "failed", "The agent stopped waiting before this was finished.");
  }
  activeHandoffId = null;

  const reply = outcome.success
    ? "Thanks — I'm back in the session and I can see you're signed in. Placing the order now: one Aurora Table Lamp, shipping to the default address. I'll confirm as soon as it goes through."
    : `Understood — I'll stop here rather than guess. ${outcome.note ? `(${outcome.note}) ` : ""}Tell me when you'd like me to try again and I'll reopen the session.`;

  return createMockSSEResponse(
    [
      { type: "turn_start", executionId, id: "turn-2", iteration: 2 },
      ...textFrames(executionId, "turn-2", reply),
      { type: "turn_complete", executionId, id: "turn-2", stopReason: "complete" },
      { type: "execution_complete", kind: "agent", executionId, success: true, stopReason: "complete" },
    ],
    { delayMs: 12 },
  );
};

/**
 * Route only this demo's two POSTs; everything else (HMR, assets, a live proxy
 * when the mock is switched off) goes straight through.
 */
const installMockBackend = (): void => {
  const dispatchPath = new URL(MOCK_DISPATCH_PATH, location.href).pathname;
  const resumePath = `${dispatchPath}/resume`;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    const url =
      typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    let pathname = "";
    try {
      pathname = new URL(url, location.href).pathname;
    } catch {
      /* opaque URL — pass through */
    }
    if (method !== "POST" || (pathname !== dispatchPath && pathname !== resumePath)) {
      return originalFetch(input, init);
    }

    let body: Record<string, unknown> = {};
    try {
      const text =
        init?.body != null
          ? String(init.body)
          : input instanceof Request
            ? await input.clone().text()
            : "";
      body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      /* unparseable body — treat as empty */
    }

    return pathname === resumePath ? handleMockResume(body) : handleMockDispatch();
  };
};

installMockBackend();

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------

const webmcpConfig = {
  enabled: true,
  // The handoff tool renders UI and waits — nothing to approve. Without this
  // the human would have to approve a tool call before seeing the card.
  autoApprove: (info) => info.toolName === "wait_for_human_handoff",
  // See HANDOFF_BUDGET_MS: unknown to widget builds before
  // `fix/component-directive-updates`, where the bridge's fixed 30s cap applies.
  toolTimeoutMs: HANDOFF_BUDGET_MS,
} as AgentWidgetWebMcpConfig;

const buildConfig = (mode: Mode): AgentWidgetConfig => {
  const isLauncher = mode === "launcher";
  return {
    ...DEFAULT_WIDGET_CONFIG,
    apiUrl: state.mock ? MOCK_DISPATCH_PATH : PROXY_DISPATCH_URL,
    webmcp: webmcpConfig,
    launcher: {
      ...DEFAULT_WIDGET_CONFIG.launcher,
      enabled: isLauncher,
      width: isLauncher ? "min(480px, 95vw)" : "100%",
    },
    copy: {
      ...DEFAULT_WIDGET_CONFIG.copy,
      welcomeTitle: "Browser agent",
      welcomeSubtitle: "Ask it to check out, and it will hand you the browser when it hits the login.",
      inputPlaceholder: "Ask the agent to place the order…",
    },
    suggestionChips: ["Place the order for me"],
    postprocessMessage: ({ text }) => markdownPostprocessor(text),
  };
};

setupMountMode({
  slug: "browser-handoff-demo",
  modes: ["inline", "launcher"],
  mount: (mode, { stage }) => {
    const mounted = runWidgetMountWithInspector(configInspector, mode, stage, buildConfig);
    controller = mounted.controller;
    return () => {
      mounted.teardown();
      controller = null;
    };
  },
});

// ---------------------------------------------------------------------------
// Page controls
// ---------------------------------------------------------------------------

const urlInput = document.getElementById("live-view-url") as HTMLInputElement | null;
if (urlInput) {
  urlInput.value = state.liveViewUrl;
  urlInput.addEventListener("change", () => {
    state.liveViewUrl = urlInput.value.trim() || "https://example.com";
    log(`live view URL set to ${state.liveViewUrl}`);
  });
}

document.getElementById("simulate-handoff")?.addEventListener("click", () => {
  if (!controller) return;
  controller.open();
  // Goes through the composer, so the whole loop runs: dispatch → step_await →
  // card → click → /resume → continuation stream.
  controller.submitMessage("Place the order for me");
});

document.getElementById("reset-demo")?.addEventListener("click", () => {
  state.armed = true;
  controller?.clearChat();
  log("demo reset — the next message will hand off again");
});

/**
 * The other render path: the platform can emit this card as a tool-result
 * artifact (`artifactType: "component"`) instead of an injected directive.
 * With `features.artifacts.display` left at its default the card lands behind a
 * reference card in the side pane; the inline mode below renders it in the
 * thread through the same registered renderer. Either way the artifact pane
 * re-invokes the renderer from scratch on every record update, so a live iframe
 * would reload — the injected-directive path above is what this demo relies on.
 */
document.getElementById("show-as-artifact")?.addEventListener("click", () => {
  if (!controller) return;
  const handoffId = `artifact-${++handoffSeq}`;
  controller.open();
  controller.update({
    features: {
      ...DEFAULT_WIDGET_CONFIG.features,
      artifacts: { enabled: true, display: { byType: { component: "inline" } } },
    },
  });
  controller.upsertArtifact({
    id: handoffId,
    artifactType: "component",
    title: "Browser handoff",
    component: "BrowserLiveViewCard",
    props: {
      url: state.liveViewUrl,
      handoffId,
      instructions: "Rendered from a component artifact rather than an injected directive.",
      status: "waiting",
    },
  });
  log(`rendered the card as a component artifact (${handoffId}, display: inline)`);
});

log(
  state.mock
    ? "Ready. Mock backend is on — send a message (or press “Simulate handoff”)."
    : `Ready. Live mode — dispatching to ${PROXY_DISPATCH_URL}.`,
);
