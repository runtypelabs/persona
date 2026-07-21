// On-device slide-deck editor: the SAME WebMCP "Deckmate" demo as webmcp-slides,
// but the assistant is Gemma 4 running in the browser via LiteRT-LM (WebGPU) —
// no proxy, no hosted runtime, no API key. The editor (store, canvas, sorter,
// presenter, themes, WebMCP tools) is reused verbatim from ../webmcp-slides; the
// only difference is the engine behind Persona. See ../litert-shared/ for how
// the in-browser model speaks Persona's SSE wire + the WebMCP tool loop.
import "@runtypelabs/persona/widget.css";
import "../webmcp-slides/slides.css";
import "../litert-shared/litert-chrome.css";

import {
  DEFAULT_WIDGET_CONFIG,
  createLocalStorageAdapter,
  initAgentWidget,
  markdownPostprocessor,
} from "@runtypelabs/persona";
import { initializeWebMCPPolyfill } from "@mcp-b/webmcp-polyfill";

import { DeckStore, createSeedDeck } from "../webmcp-slides/store";
import { createCanvas } from "../webmcp-slides/canvas";
import { createSorter } from "../webmcp-slides/sorter";
import { createPresenter } from "../webmcp-slides/presenter";
import { APPROVAL_REQUIRED_TOOL_NAMES, setupSlidesTools } from "../webmcp-slides/tools";

import { createEvalHud } from "../litert-shared/eval-hud";
import {
  type LiteRtPersonaEngine,
  createLiteRtPersonaEngine,
} from "../litert-shared/litert-engine";
import { wireModelLoader } from "../litert-shared/model-loader";

initializeWebMCPPolyfill();

// Fake dispatch URL: the engine patches window.fetch to answer this path (and
// `${API_PATH}/resume`) from the in-browser model. Kept off `/api/...` so the
// Vite dev proxy never tries to forward it.
const API_PATH = "/litert/slides/dispatch";
const MODEL_NOT_READY_CHAT_ERROR =
  "The on-device model is not ready yet. Pick a model in the toolbar, press Load model, and wait for the ready status before asking the Copilot to edit the deck.";

const store = new DeckStore(createSeedDeck);

// ---- editor chrome ----------------------------------------------------------
// Deliberately sparser than webmcp-slides: no theme select, no undo/redo
// buttons. Restyling and edits go through the Copilot (or ⌘Z / ⇧⌘Z) — the
// header only carries what the on-device demo actually needs.

const canvasHost = document.querySelector<HTMLElement>("#slides-canvas");
const sorterHost = document.querySelector<HTMLElement>("#slides-sorter");
const titleInput = document.querySelector<HTMLInputElement>("#deck-title");
const presentButton = document.querySelector<HTMLButtonElement>("#present-button");
const resetButton = document.querySelector<HTMLButtonElement>("#reset-button");

if (!canvasHost || !sorterHost) {
  throw new Error("[LiteRT Slides] Missing editor mount points in litert-slides.html");
}

createCanvas(store, canvasHost);
createSorter(store, sorterHost);
createPresenter(store);

titleInput?.addEventListener("change", () => {
  const title = titleInput.value.trim();
  if (!title) return;
  store.commit((deck) => {
    deck.title = title;
  });
});

presentButton?.addEventListener("click", () => {
  store.setCurrentSlide(0);
  store.setMode("present");
});
resetButton?.addEventListener("click", () => store.resetDeck(createSeedDeck));

const syncChrome = (): void => {
  if (titleInput && document.activeElement !== titleInput) {
    titleInput.value = store.deck.title;
  }
  document.title = `${store.deck.title}: On-device Slides`;
};
store.subscribe(syncChrome);
syncChrome();

// ---- WebMCP tools ----------------------------------------------------------

setupSlidesTools(store);

// ---- On-device engine + eval HUD ------------------------------------------

const hudMount = document.querySelector<HTMLElement>("#lr-hud");
const hud = hudMount ? createEvalHud(hudMount) : { onMetric: () => {} };

const SYSTEM_PROMPT = `You are Deck Copilot, an assistant embedded in a live slide-deck editor.
You change the deck ONLY by calling the page's tools — never claim to have edited
anything without calling a tool. Orient yourself with get_deck_overview / get_slide
before editing so you use real slide and element ids. When the user refers to "this"
or "these", call get_selection. To restyle the deck, first call list_themes to get the
valid theme ids, then call apply_theme with one of those exact ids — never guess a
theme id. You can request several tools at once when steps are
independent. Each tool result stays in this conversation — do NOT call the same
tool with the same arguments twice. Once you have what you need, reply to the user
in plain text with NO further tool calls. After your tool calls return, confirm what
changed in one or two short sentences. Be concise and friendly.`;

// The subset of the 17 slide tools the "core" scope hands the model: the
// headline flows (orient → create a slide → restyle → rename) without the
// ~3–4k tokens of full-surface declarations.
const CORE_TOOL_NAMES: readonly string[] = [
  "get_deck_overview",
  "get_selection",
  "add_slide",
  "set_deck_title",
  "list_themes",
  "apply_theme",
];

const engine = createLiteRtPersonaEngine({
  apiPath: API_PATH,
  onMetric: hud.onMetric,
  // Single consolidated system turn: instructions + the fresh editor state the
  // widget rode along (see contextProviders below), so "align these" needs no
  // guessing.
  buildSystemContent: (ctx) => {
    const slidesContext = ctx.slides_context;
    return typeof slidesContext === "string" && slidesContext
      ? `${SYSTEM_PROMPT}\n\nCurrent editor state (JSON):\n${slidesContext}`
      : SYSTEM_PROMPT;
  },
  // Curated tool island for a responsive on-device run; flip to "all" via
  // `engine.setToolScope("all")` (exposed on window below) to eval the full
  // 17-tool surface.
  toolScope: "core",
  coreToolNames: CORE_TOOL_NAMES,
});
window.personaLiteRtEngine = engine;

// ---- Model picker (shared wiring; E2B default) -----------------------------

wireModelLoader({ engine, readyHint: "ask the Copilot to build slides." });

// ---- Persona widget --------------------------------------------------------

const deckmateTheme = {
  semantic: {
    colors: {
      primary: "#1f2933",
      accent: "#c2410c",
      surface: "#ffffff",
      background: "#ffffff",
      container: "#f8f7f4",
      text: "#1f2933",
      textMuted: "#6b7280",
      textInverse: "#ffffff",
      border: "#e7e5e0",
      divider: "#e7e5e0",
    },
  },
  components: {
    panel: { borderRadius: "0", border: "none", shadow: "none" },
    header: {
      borderRadius: "0",
      background: "#ffffff",
      titleForeground: "#1f2933",
      subtitleForeground: "#6b7280",
      iconBackground: "#c2410c",
      iconForeground: "#ffffff",
      borderBottom: "1px solid #e7e5e0",
    },
    message: {
      user: { background: "#1f2933", text: "#ffffff", borderRadius: "16px", shadow: "none" },
      assistant: {
        background: "#f8f7f4",
        text: "#1f2933",
        border: "#e7e5e0",
        borderRadius: "16px",
        shadow: "none",
      },
    },
    approval: {
      approve: { background: "#1f2933", foreground: "#ffffff", border: "#1f2933", borderRadius: "999px" },
      deny: { background: "#ffffff", foreground: "#b91c1c", border: "#e7e5e0", borderRadius: "999px" },
    },
    toolBubble: { shadow: "none" },
  },
};

const dockTarget = document.querySelector<HTMLElement>("#editor-dock-target");

if (dockTarget) {
  const widget = initAgentWidget({
    target: dockTarget,
    useShadowDom: false,
    config: {
      ...DEFAULT_WIDGET_CONFIG,
      // The engine answers this path from the in-browser model (no network).
      apiUrl: API_PATH,
      // The fetch patch in ./litert-engine handles the fake dispatch/resume
      // routes. This early dispatch guard is demo UX: the widget only paints an
      // assistant fallback bubble when dispatch rejects before an SSE stream
      // starts, so fail fast here when the user chats before loading Gemma.
      customFetch: async (url, init) => {
        if (!engine.isLoaded()) {
          throw new Error(MODEL_NOT_READY_CHAT_ERROR);
        }
        return fetch(url, init);
      },
      errorMessage: (error) =>
        error.message === MODEL_NOT_READY_CHAT_ERROR
          ? MODEL_NOT_READY_CHAT_ERROR
          : `Sorry — the on-device Copilot hit an error.\n\n_Details: ${error.message}_`,
      storageAdapter: createLocalStorageAdapter("persona-state-litert-slides"),
      postprocessMessage: ({ text }) => markdownPostprocessor(text),
      colorScheme: "light",
      theme: deckmateTheme,
      copy: {
        ...DEFAULT_WIDGET_CONFIG.copy,
        welcomeTitle: "Ask the on-device Copilot",
        welcomeSubtitle:
          "Gemma 4 runs in your browser and edits this deck through the page's WebMCP tools. Load a model from the toolbar first.",
        inputPlaceholder: "Ask the on-device Copilot to build, restyle, or align slides…",
      },
      suggestionChips: [
        "What's in this deck?",
        "Add a slide about pricing with three tiers",
        "Make the title slide pop",
        "Apply the Midnight theme",
      ],
      launcher: {
        ...DEFAULT_WIDGET_CONFIG.launcher,
        mountMode: "docked",
        dock: { side: "right", width: "420px", reveal: "emerge", animate: true },
        autoExpand: true,
        mobileBreakpoint: 1080,
        title: "On-device Copilot",
        subtitle: "Gemma 4 · WebGPU",
      },
      webmcp: {
        enabled: true,
        // Destructive / deck-wide tools confirm; reads and incremental writes
        // auto-approve so you can watch the model assemble slides live.
        autoApprove: (info) => !APPROVAL_REQUIRED_TOOL_NAMES.has(info.toolName),
      },
      features: {
        ...DEFAULT_WIDGET_CONFIG.features,
        askUserQuestion: { expose: true },
      },
      approval: {
        ...DEFAULT_WIDGET_CONFIG.approval,
        title: "Run deck tool?",
        approveLabel: "Run tool",
        denyLabel: "Cancel",
        detailsDisplay: "collapsed",
      },
      // Fresh editor state rides along with every message (current slide, mode,
      // live selection). The engine folds `slides_context` into the system turn,
      // so "align these" needs no guessing.
      contextProviders: [
        () => ({
          slides_context: JSON.stringify({
            mode: store.mode,
            deckTitle: store.deck.title,
            themeId: store.deck.themeId,
            slideCount: store.deck.slides.length,
            currentSlide: {
              id: store.currentSlide.id,
              position: store.currentSlideIndex + 1,
              title: store.currentSlide.title ?? null,
            },
            selection: store.selectedElements().map((el) => ({
              id: el.id,
              type: el.type,
              x: el.x,
              y: el.y,
              w: el.w,
              h: el.h,
            })),
          }),
        }),
      ],
      statusIndicator: {
        ...DEFAULT_WIDGET_CONFIG.statusIndicator,
        visible: true,
        idleText: "Gemma 4 runs on-device — edits may be slower than a hosted model. ⌘Z undoes them.",
        connectedText: "Gemma 4 is working on-device…",
        connectingText: "Spinning up Gemma 4…",
        errorText: "On-device engine error",
      },
    },
  });

  window.personaLiteRtSlidesWidget = widget;
}

declare global {
  interface Window {
    personaLiteRtSlidesWidget?: unknown;
    personaLiteRtEngine?: LiteRtPersonaEngine;
  }
}
