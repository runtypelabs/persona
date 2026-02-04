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
      name: "Assistant",
      model: "openai:gpt-4o-mini",
      systemPrompt:
        "You are a helpful, friendly AI assistant. Be concise and clear in your responses. Use markdown formatting when helpful.",
      temperature: 0.7,
      loopConfig: {
        maxIterations: 3,
        stopCondition: "auto",
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
        "This widget uses agent execution mode with multi-iteration loops instead of a pre-configured flow.",
      inputPlaceholder: "Ask the agent anything...",
    },
    suggestionChips: [
      "Write me a haiku about coding",
      "What is the meaning of life?",
      "Explain recursion simply",
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
