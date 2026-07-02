// WebMCP Paint ("Paint Pal"): the embedded Persona widget drives a real,
// unmodified jspaint (https://github.com/1j01/jspaint) through operator-level
// WebMCP tools: select a tool, set colors, replay strokes as pointer events,
// flood fill, and snapshot the canvas back to the agent as an image. See
// tools.ts for the tool surface and public/jspaint-bridge.mjs for how the
// same-origin iframe is driven.
import "@runtypelabs/persona/widget.css";
import "./paint.css";

import {
  DEFAULT_WIDGET_CONFIG,
  createLocalStorageAdapter,
  initAgentWidget,
  markdownPostprocessor,
} from "@runtypelabs/persona";
// `@mcp-b/webmcp-polyfill` polyfills the strict standard surface on
// `document.modelContext`; it must be initialized before tools register.
import { initializeWebMCPPolyfill } from "@mcp-b/webmcp-polyfill";

import { mountJsPaint, type PaintBridge } from "./jspaint-host";
import { paintTheme } from "./theme";
import { APPROVAL_REQUIRED_TOOL_NAMES, setupPaintTools } from "./tools";

initializeWebMCPPolyfill();

const host = document.querySelector<HTMLElement>("#jspaint-host");
const dockTarget = document.querySelector<HTMLElement>("#paint-dock-target");

if (!host || !dockTarget) {
  throw new Error("[Paint] Missing mount points in webmcp-paint.html");
}

// Proxy mode, like the other example demos: the agent is defined in code as
// WEBMCP_PAINT_FLOW (packages/proxy/src/flows/webmcp-paint.ts) and the local
// proxy mounts it at /api/chat/dispatch-paint (see
// examples/runtype-hono-proxy/src/app.ts). No hosted agent or client token needed.
const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const proxyApiUrl = import.meta.env.VITE_PROXY_URL
  ? `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch-paint`
  : `http://localhost:${proxyPort}/api/chat/dispatch-paint`;

declare global {
  interface Window {
    personaPaintWidget?: unknown;
  }
}

function mountWidget(bridge: PaintBridge): void {
  window.personaPaintWidget = initAgentWidget({
    target: dockTarget as HTMLElement,
    useShadowDom: false,
    config: {
      ...DEFAULT_WIDGET_CONFIG,
      apiUrl: proxyApiUrl,
      storageAdapter: createLocalStorageAdapter("persona-state-webmcp-paint"),
      postprocessMessage: ({ text }) => markdownPostprocessor(text),
      colorScheme: "light",
      theme: paintTheme,
      suggestionChipsConfig: {
        fontFamily: "sans-serif",
      },
      copy: {
        ...DEFAULT_WIDGET_CONFIG.copy,
        welcomeTitle: "Ask Paint Pal",
        welcomeSubtitle:
          "I paint in this very real MS Paint with the same tools you'd click, and I can look at the canvas to check my work.",
        inputPlaceholder: "Ask for a drawing…",
      },
      suggestionChips: [
        "Draw a house with a sun in the sky",
        "Draw a red heart",
        "Let's play Pictionary: I'll draw, you guess",
        "Teach me to draw a cat, step by step",
        "Speedrun the Mona Lisa in 20 strokes",
        "Look at the canvas and tell me what you see",
      ],
      launcher: {
        ...DEFAULT_WIDGET_CONFIG.launcher,
        mountMode: "docked",
        dock: {
          side: "right",
          width: "400px",
          reveal: "emerge",
          animate: true,
        },
        autoExpand: true,
        mobileBreakpoint: 1080,
        title: "Paint Pal",
        subtitle: "Draws in jspaint via WebMCP",
        // The widget's bundled Lucide subset has no paintbrush; the pencil is
        // MS Paint's default tool anyway.
        headerIconName: "pencil",
      },
      webmcp: {
        enabled: true,
        // Strokes and fills auto-approve so the user can watch the agent
        // paint live; only canvas-wiping tools confirm (and ⌘Z reverses
        // everything anyway).
        autoApprove: (info) => !APPROVAL_REQUIRED_TOOL_NAMES.has(info.toolName),
      },
      features: {
        ...DEFAULT_WIDGET_CONFIG.features,
        // The paint-along tutorial pauses between steps with the built-in
        // ask_user_question tool (answer-pill sheet): "Done: check my work" /
        // "Show me again" / "Skip ahead".
        askUserQuestion: { expose: true },
      },
      // Fresh canvas state rides along with every message so "make it bigger"
      // or "what color is selected" need no tool round-trip. The flow prompt
      // interpolates {{paint_context}}.
      contextProviders: [
        () => ({
          paint_context: JSON.stringify(bridge.getState()),
        }),
      ],
      // The provider's output lands in `payload.context`, but the proxy only
      // forwards `inputs`/`metadata` to the flow. Move it into `inputs` so
      // {{paint_context}} resolves in WEBMCP_PAINT_FLOW's prompt.
      requestMiddleware: ({ payload }) => {
        const ctx = payload.context;
        if (!ctx) return payload;
        return {
          ...payload,
          inputs: { ...payload.inputs, ...ctx },
          context: undefined,
        };
      },
      approval: {
        ...DEFAULT_WIDGET_CONFIG.approval,
        title: "Run paint tool?",
        approveLabel: "Run tool",
        denyLabel: "Cancel",
        detailsDisplay: "collapsed",
      },
      statusIndicator: {
        ...DEFAULT_WIDGET_CONFIG.statusIndicator,
        visible: true,
        idleText: "Paint Pal can make mistakes. ⌘Z undoes its strokes too.",
        connectedText: "Paint Pal can make mistakes. ⌘Z undoes its strokes too.",
        connectingText: "Connecting Paint Pal…",
        errorText: "Paint Pal connection error",
      },
    },
  });
}

// No top-level await: Vite's default build target predates it.
void mountJsPaint(host).then((bridge) => {
  setupPaintTools(bridge);
  mountWidget(bridge);
});
