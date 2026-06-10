// WebMCP slide-deck editor ("Deckmate") — a Keynote-lite editor where the
// embedded Persona widget and the human co-edit the same live canvas through
// the page's WebMCP tools. See tools.ts for the tool surface (static editing
// set, selection-scoped dynamic set, presenter-mode swap).
import "@runtypelabs/persona/widget.css";
import "./slides.css";

import {
  DEFAULT_WIDGET_CONFIG,
  createLocalStorageAdapter,
  initAgentWidget,
  markdownPostprocessor,
} from "@runtypelabs/persona";
// `@mcp-b/webmcp-polyfill` polyfills the strict standard surface on
// `document.modelContext`; it must be initialized before tools register.
import { initializeWebMCPPolyfill } from "@mcp-b/webmcp-polyfill";

import { DeckStore, createSeedDeck } from "./store";
import { THEMES, getTheme } from "./themes";
import { createCanvas } from "./canvas";
import { createSorter } from "./sorter";
import { createPresenter } from "./presenter";
import {
  APPROVAL_REQUIRED_TOOL_NAMES,
  setupSlidesTools,
} from "./tools";

initializeWebMCPPolyfill();

const store = new DeckStore(createSeedDeck);

// ---- editor chrome --------------------------------------------------------

const canvasHost = document.querySelector<HTMLElement>("#slides-canvas");
const sorterHost = document.querySelector<HTMLElement>("#slides-sorter");
const titleInput = document.querySelector<HTMLInputElement>("#deck-title");
const themeSelect = document.querySelector<HTMLSelectElement>("#theme-select");
const undoButton = document.querySelector<HTMLButtonElement>("#undo-button");
const redoButton = document.querySelector<HTMLButtonElement>("#redo-button");
const presentButton = document.querySelector<HTMLButtonElement>("#present-button");
const resetButton = document.querySelector<HTMLButtonElement>("#reset-button");

if (!canvasHost || !sorterHost) {
  throw new Error("[Slides] Missing editor mount points in webmcp-slides.html");
}

createCanvas(store, canvasHost);
createSorter(store, sorterHost);
createPresenter(store);

if (themeSelect) {
  for (const theme of THEMES) {
    const option = document.createElement("option");
    option.value = theme.id;
    option.textContent = theme.name;
    themeSelect.appendChild(option);
  }
  themeSelect.addEventListener("change", () => {
    store.commit((deck) => {
      deck.themeId = themeSelect.value;
    });
  });
}

titleInput?.addEventListener("change", () => {
  const title = titleInput.value.trim();
  if (!title) return;
  store.commit((deck) => {
    deck.title = title;
  });
});

undoButton?.addEventListener("click", () => store.undo());
redoButton?.addEventListener("click", () => store.redo());
presentButton?.addEventListener("click", () => {
  store.setCurrentSlide(0);
  store.setMode("present");
});
resetButton?.addEventListener("click", () => store.resetDeck(createSeedDeck));

const syncChrome = (): void => {
  if (titleInput && document.activeElement !== titleInput) {
    titleInput.value = store.deck.title;
  }
  if (themeSelect && document.activeElement !== themeSelect) {
    themeSelect.value = store.deck.themeId;
  }
  if (undoButton) undoButton.disabled = !store.canUndo;
  if (redoButton) redoButton.disabled = !store.canRedo;
  document.title = `${store.deck.title} — WebMCP Slides`;
};
store.subscribe(syncChrome);
syncChrome();

// ---- WebMCP tools ----------------------------------------------------------

setupSlidesTools(store);

// ---- Persona widget --------------------------------------------------------

// Proxy mode, like the other example demos — the agent is defined in code as
// WEBMCP_SLIDES_FLOW (packages/proxy/src/flows/webmcp-slides.ts) and the local
// proxy mounts it at /api/chat/dispatch-slides (see
// examples/vercel-edge/src/server.ts). No hosted agent or client token needed.
const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const proxyApiUrl = import.meta.env.VITE_PROXY_URL
  ? `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch-slides`
  : `http://localhost:${proxyPort}/api/chat/dispatch-slides`;

// User-facing summary copy for tool approval bubbles. Returning undefined
// falls back to Persona's humanized default ("The assistant wants to use …").
const describeSlidesApproval = ({
  toolName,
  parameters,
}: {
  toolName?: string;
  parameters?: unknown;
}): string | undefined => {
  const params = (
    parameters && typeof parameters === "object" ? parameters : {}
  ) as Record<string, unknown>;
  const name = String(toolName ?? "").replace(/^webmcp[:_]/, "");

  switch (name) {
    case "delete_slide": {
      const slide =
        typeof params.slideId === "string"
          ? store.findSlide(params.slideId)
          : typeof params.position === "number"
            ? store.deck.slides[params.position - 1]
            : undefined;
      return slide
        ? `Delete slide ${store.deck.slides.indexOf(slide) + 1} (“${slide.title ?? "Untitled"}”)? This can be undone with ⌘Z.`
        : "Delete this slide? This can be undone with ⌘Z.";
    }
    case "delete_elements": {
      const count = Array.isArray(params.elementIds)
        ? params.elementIds.length
        : 0;
      return count
        ? `Delete ${count} element${count === 1 ? "" : "s"} from the deck?`
        : "Delete the selected elements?";
    }
    case "apply_theme": {
      const theme =
        typeof params.themeId === "string" ? getTheme(params.themeId) : null;
      return theme
        ? `Apply the ${theme.name} theme to all ${store.deck.slides.length} slides?`
        : "Restyle the whole deck with a new theme?";
    }
    default:
      return undefined;
  }
};

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
      user: {
        background: "#1f2933",
        text: "#ffffff",
        borderRadius: "16px",
        shadow: "none",
      },
      assistant: {
        background: "#f8f7f4",
        text: "#1f2933",
        border: "#e7e5e0",
        borderRadius: "16px",
        shadow: "none",
      },
    },
    approval: {
      approve: {
        background: "#1f2933",
        foreground: "#ffffff",
        border: "#1f2933",
        borderRadius: "999px",
      },
      deny: {
        background: "#ffffff",
        foreground: "#b91c1c",
        border: "#e7e5e0",
        borderRadius: "999px",
      },
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
      apiUrl: proxyApiUrl,
      storageAdapter: createLocalStorageAdapter("persona-state-webmcp-slides"),
      postprocessMessage: ({ text }) => markdownPostprocessor(text),
      colorScheme: "light",
      theme: deckmateTheme,
      copy: {
        ...DEFAULT_WIDGET_CONFIG.copy,
        welcomeTitle: "Ask Deck Copilot",
        welcomeSubtitle:
          "I edit this deck live through the page's WebMCP tools — slides, elements, alignment, themes, even presenting.",
        inputPlaceholder: "Ask Copilot to build, restyle, or align slides…",
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
        dock: {
          side: "right",
          width: "420px",
          reveal: "emerge",
          animate: true,
        },
        autoExpand: true,
        mobileBreakpoint: 1080,
        title: "Deck Copilot",
        subtitle: "Slide editing assistant",
      },
      webmcp: {
        enabled: true,
        // Destructive / deck-wide tools confirm; reads and incremental writes
        // auto-approve so the user can watch the agent assemble slides live.
        autoApprove: (info) => !APPROVAL_REQUIRED_TOOL_NAMES.has(info.toolName),
      },
      approval: {
        ...DEFAULT_WIDGET_CONFIG.approval,
        title: "Run deck tool?",
        approveLabel: "Run tool",
        denyLabel: "Cancel",
        detailsDisplay: "collapsed",
        formatDescription: describeSlidesApproval,
      },
      // Fresh editor state rides along with every message: current slide,
      // mode, and the user's live selection (ids + bounds). The flow prompt
      // interpolates {{slides_context}}, so "align these" needs no guessing.
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
      // The provider's output lands in `payload.context`, but the proxy only
      // forwards `inputs`/`metadata` to the flow. Move it into `inputs` so
      // {{slides_context}} resolves in WEBMCP_SLIDES_FLOW's prompt.
      requestMiddleware: ({ payload }) => {
        const ctx = payload.context;
        if (!ctx) return payload;
        return {
          ...payload,
          inputs: { ...payload.inputs, ...ctx },
          context: undefined,
        };
      },
      statusIndicator: {
        ...DEFAULT_WIDGET_CONFIG.statusIndicator,
        visible: true,
        idleText: "Copilot can make mistakes. ⌘Z undoes its edits too.",
        connectedText: "Copilot can make mistakes. ⌘Z undoes its edits too.",
        connectingText: "Connecting Deck Copilot…",
        errorText: "Deck Copilot connection error",
      },
    },
  });

  window.personaSlidesWidget = widget;
}

declare global {
  interface Window {
    personaSlidesWidget?: unknown;
  }
}
