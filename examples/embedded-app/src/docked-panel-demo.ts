import "@runtypelabs/persona/widget.css";

import {
  DEFAULT_WIDGET_CONFIG,
  initAgentWidget,
  markdownPostprocessor,
  type AgentWidgetInitHandle,
} from "@runtypelabs/persona";

const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const apiUrl =
  import.meta.env.VITE_PROXY_URL
    ? `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch`
    : `http://localhost:${proxyPort}/api/chat/dispatch`;

const dockSideSelect = document.getElementById("dock-side") as HTMLSelectElement | null;
const dockWidthInput = document.getElementById("dock-width") as HTMLInputElement | null;
const dockCollapsedWidthInput = document.getElementById("dock-collapsed-width") as HTMLInputElement | null;
const widthMetric = document.getElementById("metric-width");
const collapsedMetric = document.getElementById("metric-collapsed");
const statusRow = document.getElementById("status-row");

if (!dockSideSelect || !dockWidthInput || !dockCollapsedWidthInput) {
  throw new Error("Docked demo controls are missing");
}

let controller: AgentWidgetInitHandle;

function getDockConfig() {
  return {
    side: dockSideSelect.value as "left" | "right",
    width: dockWidthInput.value.trim() || "420px",
    collapsedWidth: dockCollapsedWidthInput.value.trim() || "72px",
  };
}

function syncMetrics(): void {
  const dock = getDockConfig();
  if (widthMetric) widthMetric.textContent = dock.width;
  if (collapsedMetric) collapsedMetric.textContent = dock.collapsedWidth;
}

function updateStatus(label: string): void {
  if (!statusRow) return;
  const state = controller.getState();
  statusRow.textContent = `${label} Dock is ${state.open ? "open" : "closed"} on the ${getDockConfig().side}.`;
}

function createController(): AgentWidgetInitHandle {
  return initAgentWidget({
    target: "#workspace-main",
    config: {
      ...DEFAULT_WIDGET_CONFIG,
      apiUrl,
      launcher: {
        ...DEFAULT_WIDGET_CONFIG.launcher,
        mountMode: "docked",
        dock: getDockConfig(),
        title: "Launch Copilot",
        subtitle: "Plan, review, and ship from the side rail",
        agentIconText: "✦",
        textHidden: false,
      },
      theme: {
        ...DEFAULT_WIDGET_CONFIG.theme,
        primary: "#0f172a",
        accent: "#0ea5e9",
        surface: "#ffffff",
        muted: "#64748b",
        launcherRadius: "18px",
      },
      copy: {
        ...DEFAULT_WIDGET_CONFIG.copy,
        welcomeTitle: "Workspace Assistant",
        welcomeSubtitle: "This docked panel wraps the workspace container instead of covering it.",
        inputPlaceholder: "Ask for a launch checklist, QA review, or summary…",
      },
      suggestionChips: [
        "Summarize what changed in this workspace.",
        "Give me a launch checklist for this release.",
        "What should I review before publishing today?",
      ],
      postprocessMessage: ({ text }) => markdownPostprocessor(text),
    },
  });
}

function bindControllerEvents(): void {
  controller.on("widget:opened", () => updateStatus("Panel opened."));
  controller.on("widget:closed", () => updateStatus("Panel closed."));
}

function applyDockSettings(): void {
  syncMetrics();
  controller.update({
    launcher: {
      mountMode: "docked",
      dock: getDockConfig(),
    },
  });
  updateStatus("Layout updated.");
}

controller = createController();
bindControllerEvents();
syncMetrics();
updateStatus("Demo ready.");

document.getElementById("apply-settings")?.addEventListener("click", applyDockSettings);
document.getElementById("open-dock")?.addEventListener("click", () => {
  controller.open();
  updateStatus("Open requested.");
});
document.getElementById("close-dock")?.addEventListener("click", () => {
  controller.close();
  updateStatus("Close requested.");
});
document.getElementById("toggle-dock")?.addEventListener("click", () => {
  controller.toggle();
  updateStatus("Toggle requested.");
});
