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
const dockRevealSelect = document.getElementById("dock-reveal") as HTMLSelectElement | null;
const dockAnimateCheck = document.getElementById("dock-animate") as HTMLInputElement | null;
const applyDockBtn = document.getElementById("apply-dock-settings") as HTMLButtonElement | null;
const toggleBtn = document.getElementById("assistant-toggle") as HTMLButtonElement | null;
const dockStatus = document.getElementById("dock-status");
const workspaceMainEl = document.getElementById("workspace-main");

if (!dockSideSelect || !dockWidthInput || !dockRevealSelect || !dockAnimateCheck || !applyDockBtn || !toggleBtn) {
  throw new Error("Docked demo controls are missing");
}

const sideSelect = dockSideSelect;
const widthInput = dockWidthInput;
const revealSelect = dockRevealSelect;
const animateCheck = dockAnimateCheck;
const assistantToggle = toggleBtn;

type DockRevealOption = "resize" | "emerge" | "overlay" | "push";

function parseDockReveal(raw: string): DockRevealOption {
  if (raw === "resize" || raw === "emerge" || raw === "overlay" || raw === "push") return raw;
  return "emerge";
}

let controller: AgentWidgetInitHandle;

function getDockConfig() {
  return {
    side: sideSelect.value as "left" | "right",
    width: widthInput.value.trim() || "420px",
    reveal: parseDockReveal(revealSelect.value),
    animate: animateCheck.checked,
  };
}

/** Full launcher object — use on init and on Apply so shallow inner `controller.update` keeps titles, breakpoint, etc. */
function getDemoLauncher() {
  return {
    ...DEFAULT_WIDGET_CONFIG.launcher,
    mountMode: "docked" as const,
    dock: getDockConfig(),
    autoExpand: false,
    fullHeight: true,
    mobileBreakpoint: 1120,
    title: "Copilot",
    subtitle: "Dashboard Assistant",
  };
}

/** Match workspace chrome layout to dock side (see docked-panel-demo.html). */
function syncWorkspaceMainDockSide(): void {
  workspaceMainEl?.setAttribute("data-dock-side", getDockConfig().side);
}

function formatDockOptionsLine(dock: ReturnType<typeof getDockConfig>): string {
  const revealHint =
    dock.reveal === "resize"
      ? "flex 0↔width, panel stretches"
      : dock.reveal === "emerge"
        ? "flex 0↔width, panel fixed (emerges)"
        : dock.reveal === "overlay"
          ? "overlay transform"
          : "push track transform";
  const animHint = dock.animate ? "transition on" : "transition off (snap)";
  return `reveal: ${dock.reveal} (${revealHint}) · animate: ${animHint}`;
}

function syncToggleUi(): void {
  const open = controller.getState().open;
  assistantToggle.setAttribute("aria-expanded", open ? "true" : "false");
  assistantToggle.setAttribute("aria-label", open ? "Hide assistant" : "Open assistant");
  assistantToggle.classList.toggle("is-active", open);
  assistantToggle.title = open ? "Hide assistant" : "Open assistant";

  const coachEl = document.getElementById("assistant-coachmark");
  if (coachEl) {
    coachEl.toggleAttribute("hidden", open);
  }
  if (open) {
    assistantToggle.removeAttribute("aria-describedby");
  } else {
    assistantToggle.setAttribute("aria-describedby", "assistant-coachmark");
  }
}

function updateStatus(label: string): void {
  if (!dockStatus) return;
  const state = controller.getState();
  const dock = getDockConfig();
  dockStatus.textContent = `${label} Dock ${state.open ? "open" : "closed"} · side ${dock.side} · ${dock.width} · ${formatDockOptionsLine(dock)}.`;
}

function createController(): AgentWidgetInitHandle {
  return initAgentWidget({
    target: "#workspace-dock-target",
    config: {
      ...DEFAULT_WIDGET_CONFIG,
      apiUrl,
      launcher: getDemoLauncher(),
      theme: {
        semantic: {
          colors: {
            primary: "#0f172a",
            accent: "#0f172a",
            surface: "#ffffff",
            background: "#ffffff",
            textMuted: "#64748b",
            interactive: {
              default: "#0f172a",
              hover: "#1e293b",
              focus: "#334155",
              active: "#020617",
            },
            feedback: {
              info: "#0f172a",
            },
          },
        },
        palette: {
          radius: {
            full: "0",
          },
        },
        components: {
          panel: {
            borderRadius: "0",
          },
          header: {
            borderRadius: "0",
          },
          input: {
            borderRadius: "0",
          },
          message: {
            user: {
              borderRadius: "0",
            },
            assistant: {
              borderRadius: "0",
            },
          },
        },
      },
      copy: {
        ...DEFAULT_WIDGET_CONFIG.copy,
        welcomeTitle: "Ask Copilot",
        welcomeSubtitle: "Search docs, get answers, or draft content next to your work.",
        inputPlaceholder: "Ask a question or describe what you need…",
      },
      suggestionChips: [
        "What should I review before publishing today?",
        "Draft a short update for stakeholders on this week’s changes.",
        "Summarize performance and catalog updates from the last 7 days.",
      ],
      postprocessMessage: ({ text }) => markdownPostprocessor(text),
    },
  });
}

function bindControllerEvents(): void {
  controller.on("widget:opened", () => {
    syncToggleUi();
    updateStatus("Panel opened.");
  });
  controller.on("widget:closed", () => {
    syncToggleUi();
    updateStatus("Panel closed.");
  });
}

function applyDockSettings(): void {
  syncWorkspaceMainDockSide();
  controller.update({ launcher: getDemoLauncher() });
  updateStatus("Layout updated.");
}

syncWorkspaceMainDockSide();
controller = createController();
bindControllerEvents();
syncToggleUi();
updateStatus("Ready.");

applyDockBtn.addEventListener("click", applyDockSettings);

/** Keep chrome layout in sync with the Side control (widget updates still require Apply). */
sideSelect.addEventListener("change", () => {
  syncWorkspaceMainDockSide();
});

/** Keeps the button from taking focus on mouse click (avoids OS / UA focus ring flash); keyboard still tabs in. */
assistantToggle.addEventListener("mousedown", (e) => {
  if (e.button === 0) {
    e.preventDefault();
  }
});

assistantToggle.addEventListener("click", () => {
  controller.toggle();
});
