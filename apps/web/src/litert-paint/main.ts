// On-device Paint: the SAME WebMCP "Paint Pal" demo as webmcp-paint — a real,
// unmodified jspaint driven through operator-level page tools — but the artist
// is Gemma 4 running in the browser via LiteRT-LM (WebGPU). No proxy, no hosted
// runtime, no API key. The paint host, bridge, tools, and Win98 theme are
// reused verbatim from ../webmcp-paint; the only difference is the engine
// behind Persona (see ../litert-slides/litert-engine.ts).
//
// Prompting follows Google's Gemma 4 formatting guide
// (https://ai.google.dev/gemma/docs/core/prompt-formatting-gemma4). Most of the
// template is applied for us by the LiteRT-LM runtime — the <|turn|> dialogue
// structure, and the <|tool>/<|tool_call>/<|tool_response> function-calling
// tokens (tools go in as JSON schema via `Preface.tools`, calls come back
// parsed on `Message.tool_calls`). What's left to us, and done here:
//   • ONE consolidated system turn: instructions + the live canvas state are
//     folded into a single system message (the runtime appends the tool
//     declarations to that same turn), per the guide's "consolidate into a
//     single system turn" rule.
//   • Short, imperative instructions sized for a 2B/4B model: explicit
//     coordinate-space facts, a plan-then-draw recipe, a stroke budget, and a
//     hard "finish in plain text" stop condition.
//   • Thinking mode stays OFF (no <|think|> in the system turn): thought
//     channels add whole seconds per turn on-device, and the guide's rule that
//     thoughts must be preserved across an active tool-call sequence would
//     balloon the small context window this demo runs in.
import "@runtypelabs/persona/widget.css";
import "../webmcp-paint/paint.css";
// litert-slides.css is imported for the shared eval-HUD styles (.lr-hud…);
// litert-paint.css restyles the HUD + model controls to match the Win98 shell.
import "../litert-slides/litert-slides.css";
import "./litert-paint.css";

import {
  DEFAULT_WIDGET_CONFIG,
  createLocalStorageAdapter,
  initAgentWidget,
  markdownPostprocessor,
} from "@runtypelabs/persona";
// `@mcp-b/webmcp-polyfill` polyfills the strict standard surface on
// `document.modelContext`; it must be initialized before tools register.
import { initializeWebMCPPolyfill } from "@mcp-b/webmcp-polyfill";

import { mountJsPaint, type PaintBridge } from "../webmcp-paint/jspaint-host";
import { paintTheme } from "../webmcp-paint/theme";
import { APPROVAL_REQUIRED_TOOL_NAMES, setupPaintTools } from "../webmcp-paint/tools";
import { createEvalHud } from "../litert-slides/eval-hud";
import {
  MODELS,
  type LiteRtPersonaEngine,
  type ModelId,
  createLiteRtPersonaEngine,
} from "../litert-slides/litert-engine";

initializeWebMCPPolyfill();

// Fake dispatch URL: the engine patches window.fetch to answer this path (and
// `${API_PATH}/resume`) from the in-browser model. Kept off `/api/...` so the
// Vite dev proxy never tries to forward it.
const API_PATH = "/litert/paint/dispatch";
const MODEL_NOT_READY_CHAT_ERROR =
  "The on-device model is not ready yet. Pick a model in the toolbar, press Load model, and wait for the ready status before asking Paint Pal to draw.";

const host = document.querySelector<HTMLElement>("#jspaint-host");
const dockTarget = document.querySelector<HTMLElement>("#paint-dock-target");

if (!host || !dockTarget) {
  throw new Error("[LiteRT Paint] Missing mount points in litert-paint.html");
}

// ---- On-device engine + eval HUD ------------------------------------------

const hudMount = document.querySelector<HTMLElement>("#lr-hud");
const hud = hudMount ? createEvalHud(hudMount) : { onMetric: () => {} };

// Sized for a 2B/4B model that re-reads this every turn: imperative, concrete,
// and short. The coordinate-space facts, the 2-point shape-tool contract, and
// the stroke budget are the difference between a recognizable house and random
// scribbles from a small model.
const SYSTEM_PROMPT = `You are Paint Pal, an assistant that draws on a live MS Paint canvas.
You draw ONLY by calling the page's tools — never claim to have drawn anything without calling a tool.
Coordinates are canvas pixels: (0,0) is the TOP-LEFT corner, x grows right, y grows DOWN. The canvas size is in the canvas state below — keep every point inside it, and make the drawing BIG (use at least half the canvas).
Plan first: decide the few strokes that make the picture, then make one draw_stroke call per stroke. Keep drawings simple and bold — about 3 to 8 strokes total.
Pick the right tool for each stroke:
- line draws ONE straight segment: exactly 2 points, and they must be DIFFERENT points.
- rectangle / ellipse: exactly 2 points, the opposite corners of the shape's bounding box.
- pencil / brush draw freehand: use them for ANY curved or closed outline (a heart, star, cloud, wave) with AT LEAST 12 points tracing the outline; to close the shape, end at the same point you started. NEVER draw a curve with the line tool.
Example freehand stroke — a circle centered at (200,200), radius 50: points (250,200) (243,225) (225,243) (200,250) (175,243) (157,225) (150,200) (157,175) (175,157) (200,150) (225,157) (243,175) (250,200). Curves need that many points to look round.
draw_stroke accepts optional "tool" and "color" in the same call — set them there instead of making separate select_tool / set_colors calls.
To color a closed shape, call flood_fill at a point inside it after outlining it.
Do NOT call the same tool with the same arguments twice — each result stays in this conversation. When the drawing is done, reply in plain text with NO further tool calls: one or two short sentences about what you drew. Be concise and friendly.`;

// The "core" island the small model sees by default: orient → draw → fill →
// recover. get_canvas_snapshot is deliberately absent — it returns an image
// content block, and this engine's tool loop is text-only (the engine strips
// image blocks rather than inlining base64), so advertising it would only
// invite a useless call. render_replay_gif is a novelty; flip the scope to
// "all" (window.personaLiteRtEngine.setToolScope("all")) to expose both.
const CORE_TOOL_NAMES: readonly string[] = [
  "get_canvas_info",
  "select_tool",
  "set_colors",
  "draw_stroke",
  "flood_fill",
  "undo",
  "clear_canvas",
];

const engine = createLiteRtPersonaEngine({
  apiPath: API_PATH,
  onMetric: hud.onMetric,
  // Single consolidated system turn: instructions + the fresh canvas state the
  // widget rode along (see contextProviders below) — canvas size, selected
  // tool, and current colors, so the model needs no orientation round trip.
  buildSystemContent: (ctx) => {
    const paintContext = ctx.paint_context;
    return typeof paintContext === "string" && paintContext
      ? `${SYSTEM_PROMPT}\n\nCurrent canvas state (JSON):\n${paintContext}`
      : SYSTEM_PROMPT;
  },
  toolScope: "core",
  coreToolNames: CORE_TOOL_NAMES,
});
window.personaLiteRtEngine = engine;

// ---- Model picker (E2B default, swap to E4B) ------------------------------

const modelSelect = document.querySelector<HTMLSelectElement>("#lr-model-select");
const loadButton = document.querySelector<HTMLButtonElement>("#lr-load-button");
const statusEl = document.querySelector<HTMLElement>("#lr-status");
const webgpuWarning = document.querySelector<HTMLElement>("#lr-webgpu-warning");

const webgpuSupported = typeof navigator !== "undefined" && "gpu" in navigator;

if (modelSelect) {
  for (const id of Object.keys(MODELS) as ModelId[]) {
    const info = MODELS[id];
    const option = document.createElement("option");
    option.value = id;
    option.textContent = `${info.label} (${info.approxSize})`;
    option.title = info.blurb;
    modelSelect.appendChild(option);
  }
  modelSelect.value = "e2b";
}

const setStatus = (text: string): void => {
  if (statusEl) statusEl.textContent = text;
};

async function loadSelectedModel(): Promise<void> {
  if (!modelSelect || !loadButton) return;
  const modelId = modelSelect.value as ModelId;
  loadButton.disabled = true;
  modelSelect.disabled = true;
  // loadModel downloads the weights, then warms up the GPU with a throwaway
  // generation so the first real prompt is fast — that warm-up can take a few
  // minutes on first run. Set the expectation up front.
  setStatus(
    `Loading ${MODELS[modelId].label}… first load downloads ${MODELS[modelId].approxSize}, then warms up the GPU (first run can take a few minutes).`,
  );
  try {
    await engine.loadModel(modelId);
    setStatus(`${MODELS[modelId].label} ready (warmed up) — ask Paint Pal for a drawing.`);
    loadButton.textContent = "Reload";
  } catch (err) {
    setStatus(`Load failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    loadButton.disabled = false;
    modelSelect.disabled = false;
  }
}

if (!webgpuSupported) {
  webgpuWarning?.removeAttribute("hidden");
  if (loadButton) loadButton.disabled = true;
  if (modelSelect) modelSelect.disabled = true;
  setStatus("WebGPU unavailable");
} else {
  loadButton?.addEventListener("click", () => void loadSelectedModel());
  setStatus("Pick a model and press Load to start (runs fully on-device).");
}

// ---- Persona widget --------------------------------------------------------

function mountWidget(bridge: PaintBridge): void {
  window.personaPaintWidget = initAgentWidget({
    target: dockTarget as HTMLElement,
    useShadowDom: false,
    config: {
      ...DEFAULT_WIDGET_CONFIG,
      // The engine answers this path from the in-browser model (no network).
      apiUrl: API_PATH,
      // The fetch patch in ../litert-slides/litert-engine handles the fake
      // dispatch/resume routes. This early dispatch guard is demo UX: the
      // widget only paints an assistant fallback bubble when dispatch rejects
      // before an SSE stream starts, so fail fast here when the user chats
      // before loading Gemma. (Same pattern as litert-slides.)
      customFetch: async (url, init) => {
        if (!engine.isLoaded()) {
          throw new Error(MODEL_NOT_READY_CHAT_ERROR);
        }
        return fetch(url, init);
      },
      errorMessage: (error) =>
        error.message === MODEL_NOT_READY_CHAT_ERROR
          ? MODEL_NOT_READY_CHAT_ERROR
          : `Sorry — the on-device Paint Pal hit an error.\n\n_Details: ${error.message}_`,
      storageAdapter: createLocalStorageAdapter("persona-state-litert-paint"),
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
          "Gemma 4 runs in your browser and paints in this very real MS Paint with the same tools you'd click. Load a model from the toolbar first.",
        inputPlaceholder: "Ask for a drawing…",
      },
      // Simple, bold subjects: a 2B model draws a fine house; the Mona Lisa
      // speedrun stays on the proxy-backed webmcp-paint page.
      suggestionChips: [
        "Draw a house with a sun in the sky",
        "Draw a red heart",
        "Draw a smiley face",
        "Draw a green tree",
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
        subtitle: "Gemma 4 · on-device",
        // The widget's bundled Lucide subset has no paintbrush; the pencil is
        // MS Paint's default tool anyway.
        headerIconName: "pencil",
      },
      webmcp: {
        enabled: true,
        // Strokes and fills auto-approve so the user can watch the model
        // paint live; only canvas-wiping tools confirm (and ⌘Z reverses
        // everything anyway).
        autoApprove: (info) => !APPROVAL_REQUIRED_TOOL_NAMES.has(info.toolName),
      },
      features: {
        ...DEFAULT_WIDGET_CONFIG.features,
        askUserQuestion: { expose: true },
      },
      // Fresh canvas state rides along with every message; the engine folds
      // `paint_context` into the system turn (it reads `context` directly, so
      // no request middleware is needed — unlike the proxy-backed page).
      contextProviders: [
        () => ({
          paint_context: JSON.stringify(bridge.getState()),
        }),
      ],
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
        idleText: "Gemma 4 draws on-device — strokes may take a moment. ⌘Z undoes them.",
        connectedText: "Gemma 4 is painting on-device…",
        connectingText: "Spinning up Gemma 4…",
        errorText: "On-device engine error",
      },
    },
  });
}

// No top-level await: Vite's default build target predates it.
void mountJsPaint(host).then((bridge) => {
  setupPaintTools(bridge);
  mountWidget(bridge);
});

declare global {
  interface Window {
    personaPaintWidget?: unknown;
    personaLiteRtEngine?: LiteRtPersonaEngine;
  }
}
