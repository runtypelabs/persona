import "@runtypelabs/persona/widget.css";

import {
  createAgentExperience,
  createLocalStorageAdapter,
  initAgentWidget,
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetConfig,
  type AgentWidgetController,
} from "@runtypelabs/persona";
import { setupMountMode, renderInlineMount, renderLauncherScene, squareInlinePanel } from "./mount-mode";
import {
  createDemoConfigInspector,
  reportDemoConfig,
} from "./demo-config-inspector";
import { renderDemoScaffold } from "./demo-scaffold";
import type { Mode } from "./examples-nav";

renderDemoScaffold({ slug: "agent-demo" });

const configInspector = createDemoConfigInspector({ title: "Agent Loop" });

const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const apiUrl =
  import.meta.env.VITE_PROXY_URL
    ? `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch`
    : `http://localhost:${proxyPort}/api/chat/dispatch`;

let iterationDisplay: "separate" | "merged" = "separate";
let activeController: AgentWidgetController | null = null;
let activeMountMode: Mode = "inline";

const buildConfig = (mode: Mode): AgentWidgetConfig => {
  const showLauncherChrome = mode === "launcher";
  return {
    ...DEFAULT_WIDGET_CONFIG,
    apiUrl,
    storageAdapter: createLocalStorageAdapter(
      `persona-state-agent-demo-${mode}`,
    ),
    agent: {
      name: "Travel Planner Assistant",
      model: "nemotron-3-ultra-550b-a55b",
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
    iterationDisplay,
    launcher: {
      ...DEFAULT_WIDGET_CONFIG.launcher,
      enabled: showLauncherChrome,
      width: showLauncherChrome ? "min(420px, 95vw)" : "100%",
      title: showLauncherChrome ? "Travel Planner" : undefined,
      subtitle: showLauncherChrome
        ? "Plan a multi-day trip with an agent loop"
        : undefined,
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
  };
};

setupMountMode({
  slug: "agent-demo",
  modes: ["inline", "launcher", "fullscreen"],
  mount: (mode, { stage }) => {
    activeMountMode = mode;
    const config = buildConfig(mode);
    reportDemoConfig(configInspector, { config, mode });
    if (mode === "launcher") {
      const { mountEl } = renderLauncherScene(stage);
      const handle = initAgentWidget({
        target: mountEl,
        config: buildConfig("launcher"),
      });
      activeController = handle as unknown as AgentWidgetController;
      return () => {
        handle.destroy();
        activeController = null;
      };
    }

    // inline + fullscreen share the same in-page mount; CSS handles the chrome
    const mount = renderInlineMount(stage);
    mount.style.height = "100%";
    const controller = createAgentExperience(mount, squareInlinePanel(config));
    activeController = controller;
    return () => {
      controller.destroy();
      activeController = null;
    };
  },
});

// Iteration toggle — wired once. Reads `activeController` lazily so swapping
// modes doesn't disconnect the control.
const iterationToggle = document.getElementById("iteration-toggle") as HTMLInputElement | null;
const iterationStatus = document.getElementById("iteration-status");

if (iterationToggle) {
  iterationToggle.checked = iterationDisplay === "separate";
  iterationToggle.addEventListener("change", () => {
    iterationDisplay = iterationToggle.checked ? "separate" : "merged";
    if (iterationStatus) {
      iterationStatus.textContent = `iterationDisplay: '${iterationDisplay}'`;
    }
    activeController?.update({ iterationDisplay } as Partial<AgentWidgetConfig>);
    reportDemoConfig(configInspector, {
      config: buildConfig(activeMountMode),
      mode: activeMountMode,
    });
  });
}
