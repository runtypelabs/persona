import "@runtypelabs/persona/widget.css";

import {
  createAgentExperience,
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG
} from "@runtypelabs/persona";

const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const apiUrl =
  import.meta.env.VITE_PROXY_URL
    ? `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch`
    : `http://localhost:${proxyPort}/api/chat/dispatch`;

// ── State ──────────────────────────────────────────────────────
let iterationDisplay: 'separate' | 'merged' = 'separate';

// ── Mount ──────────────────────────────────────────────────────
const mount = document.getElementById("agent-widget");
if (!mount) throw new Error("Agent widget mount node missing");

const controller = createAgentExperience(mount, {
  ...DEFAULT_WIDGET_CONFIG,
  apiUrl,

  // Agent execution config (replaces flowId)
  agent: {
    name: "Travel Planner Assistant",
    // Primary: qwen/qwen3-8b (fast, cheap, supports tool calling)
    // Alternative if tool calling is unreliable: "openai:gpt-4o-mini"
    model: "qwen/qwen3-8b",
    systemPrompt:
      "You are a travel planning assistant with access to the Exa web search tool. " +
      "For itinerary requests, complete work in exactly 3 iterations: " +
      "Iteration 1 (Discovery), Iteration 2 (Structuring), Iteration 3 (Final). " +
      "Provide a short heading for each iteration and do not skip directly to the final output. " +
      "Use web search for current details when helpful and format the response in clear markdown.",
    temperature: 0.7,
    tools: {
      toolIds: ["builtin:exa"],
    },
    loopConfig: {
      maxTurns: 3,
    },
  },
  agentOptions: {
    streamResponse: true,
    recordMode: "virtual",
    storeResults: false,
  },

  // Iteration display mode (toggled by UI)
  iterationDisplay,

  // Widget chrome
  launcher: {
    ...DEFAULT_WIDGET_CONFIG.launcher,
    width: "100%",
    enabled: false,
  },
  theme: {
    ...DEFAULT_WIDGET_CONFIG.theme,
    primary: "#0f172a",
    accent: "#38bdf8",
    surface: "#f8fafc",
    muted: "#64748b",
  },
  copy: {
    ...DEFAULT_WIDGET_CONFIG.copy,
    welcomeTitle: "Agent Loop Demo",
    welcomeSubtitle:
      "This agent runs a 3-turn loop for non-technical travel planning. Ask for an itinerary to see the iteration flow.",
    inputPlaceholder: "Ask for a travel itinerary...",
  },
  suggestionChips: [
    "Plan a 2-day weekend itinerary for Kyoto for a first-time visitor who likes food, gardens, and quiet neighborhoods. Use exactly 3 iterations: Discovery, Structuring, and Final.",
    "Plan a rainy-day weekend in Lisbon for a couple focused on food and bookstores.",
    "Create a one-day family-friendly itinerary in Chicago with indoor backup options.",
  ],
  postprocessMessage: ({ text }) => markdownPostprocessor(text),
});

// ── Toggle: Iteration Display ──────────────────────────────────
const iterationToggle = document.getElementById("iteration-toggle") as HTMLInputElement | null;
const iterationStatus = document.getElementById("iteration-status");

if (iterationToggle) {
  iterationToggle.checked = iterationDisplay === "separate";

  iterationToggle.addEventListener("change", () => {
    iterationDisplay = iterationToggle.checked ? "separate" : "merged";
    if (iterationStatus) {
      iterationStatus.textContent = `iterationDisplay: '${iterationDisplay}'`;
    }
    // Update widget config without destroying — preserves message history
    controller.update({ iterationDisplay } as any);
  });
}
