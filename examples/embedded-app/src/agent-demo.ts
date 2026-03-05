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

function createWidget() {
  mount!.innerHTML = "";

  createAgentExperience(mount!, {
    ...DEFAULT_WIDGET_CONFIG,
    apiUrl,

    // Agent execution config (replaces flowId)
    agent: {
      name: "Research Assistant",
      // Primary: qwen/qwen3-8b (fast, cheap, supports tool calling)
      // Alternative if tool calling is unreliable: "openai:gpt-4o-mini"
      model: "qwen/qwen3-8b",
      systemPrompt:
        "You are a research assistant with access to the Exa web search tool. " +
        "When asked a question, search the web to find current, accurate information. " +
        "Search multiple times if needed to gather comprehensive data from different angles, " +
        "then synthesize your findings into a clear answer with sources. " +
        "Use markdown formatting for readability.",
      temperature: 0.7,
      tools: {
        toolIds: ["builtin:exa"],
      },
      loopConfig: {
        maxTurns: 5,
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
        "This agent uses Exa web search with multi-turn execution. Ask a research question to see it in action.",
      inputPlaceholder: "Ask a research question...",
    },
    suggestionChips: [
      "What are the top AI news stories this week?",
      "Compare React, Vue, and Svelte in 2026",
      "What is Runtype and how does it work?",
    ],
    postprocessMessage: ({ text }) => markdownPostprocessor(text),
  });
}

// Initial render
createWidget();

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
    // Recreate widget with new config
    createWidget();
  });
}
