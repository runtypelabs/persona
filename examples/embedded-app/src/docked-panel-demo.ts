import "@runtypelabs/persona/widget.css";

import {
  DEFAULT_WIDGET_CONFIG,
  createLocalStorageAdapter,
  initAgentWidget,
  markdownPostprocessor,
  type AgentWidgetInitHandle,
  type WebMcpConfirmInfo,
} from "@runtypelabs/persona";
import { initializeWebMCPPolyfill } from "@mcp-b/webmcp-polyfill";

// The docked Copilot is WebMCP-powered: this page registers four workspace
// tools on document.modelContext (see "WebMCP page tools" at the bottom) and
// the dispatch-docked flow drives them: read the dashboard, switch sections,
// log activity, and even move the assistant's own dock.
const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const apiUrl =
  import.meta.env.VITE_PROXY_URL
    ? `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch-docked`
    : `http://localhost:${proxyPort}/api/chat/dispatch-docked`;

/** Minimal structural view of the WebMCP producer surface (see webmcp-demo.ts). */
interface RegisterableModelContext {
  registerTool(
    tool: {
      name: string;
      title?: string;
      description: string;
      inputSchema?: object;
      annotations?: Record<string, unknown>;
      execute: (args: Record<string, unknown>) => unknown;
    },
    options?: { signal?: AbortSignal },
  ): void;
}

/** Read-only tools run without confirmation; mutations get Persona's approval bubble. */
const READ_ONLY_TOOLS = new Set(["get_workspace_overview", "switch_section"]);

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

/** Full launcher object: use on init and on Apply so shallow inner `controller.update` keeps titles, breakpoint, etc. */
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
      storageAdapter: createLocalStorageAdapter("persona-state-docked-panel-demo"),
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
        welcomeSubtitle:
          "I can read this dashboard, switch sections, log activity, and even move my own panel: using the page's own tools.",
        inputPlaceholder: "Ask a question or describe what you need…",
      },
      // Ordered to walk the tool surface: read-only overview (auto-approved),
      // read-only-ish navigation, then two mutations that raise approval bubbles
      // (one of which moves the assistant's own dock).
      suggestionChips: [
        "What needs my attention on this dashboard?",
        "Switch to the Catalog section",
        "Log a note that the launch checklist is done",
        "Move your panel to the left side, 360px wide",
      ],
      webmcp: {
        enabled: true,
        autoApprove: (info: WebMcpConfirmInfo): boolean => READ_ONLY_TOOLS.has(info.toolName),
      },
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

/**
 * Compute when the coachmark shimmer would physically arrive at the button,
 * accounting for the gap between the two elements and the shimmer's exit velocity.
 *
 * Sweep: translateX(-110%) → +110% over SWEEP_DUR with cubic-bezier(0.76,0,0.24,1).
 * The shimmer center exits the coachmark right edge at ~56.5% of the sweep time
 * (inverse of the easing curve at 72.7% linear progress).  At that point the
 * instantaneous velocity is ~2.49× the average sweep speed.  We project that
 * velocity across the measured gap to get the button-arrive delay.
 */
function syncCoachmarkTiming(): void {
  const coachmark = document.getElementById("assistant-coachmark");
  if (!coachmark) return;

  const coachRect = coachmark.getBoundingClientRect();
  const btnRect = assistantToggle.getBoundingClientRect();

  const ENTRANCE_TOTAL = 2.5;
  const SWEEP_START = ENTRANCE_TOTAL + 0.2;
  const SWEEP_DUR = 1.4;
  const EXIT_FRAC = 0.565;
  const exitTime = SWEEP_START + SWEEP_DUR * EXIT_FRAC;

  const totalDist = 2.2 * coachRect.width;
  const exitVelocity = 2.493 * totalDist / SWEEP_DUR;

  const gap = btnRect.left + btnRect.width / 2 - coachRect.right;
  const transit = Math.max(0, gap / exitVelocity);

  const ARRIVE_DUR = 0.7;
  const arriveDelay = exitTime + transit;
  const pulseDelay = arriveDelay + ARRIVE_DUR;

  assistantToggle.style.setProperty("--arrive-delay", `${arriveDelay.toFixed(3)}s`);
  assistantToggle.style.setProperty("--pulse-delay", `${pulseDelay.toFixed(3)}s`);
}

syncWorkspaceMainDockSide();
syncCoachmarkTiming();
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
  assistantToggle.classList.remove("assistant-toggle--persist-highlight");
  document.getElementById("assistant-coachmark")?.remove();
  controller.toggle();
});

// ---------------------------------------------------------------------------
// WebMCP page tools
//
// Mocked workspace actions in the same spirit as webmcp-demo.ts: the page
// owns the tools, Persona drives them, and every result is visible on the
// dashboard. Read-only tools auto-approve (see READ_ONLY_TOOLS); mutations
// raise Persona's in-panel approval bubble.
// ---------------------------------------------------------------------------

initializeWebMCPPolyfill();

const modelContext = (
  document as Document & { modelContext?: RegisterableModelContext }
).modelContext;

if (modelContext) {
  const navItems = (): HTMLElement[] =>
    Array.from(document.querySelectorAll<HTMLElement>(".workspace-nav .nav-item"));
  const sectionName = (el: HTMLElement): string => el.textContent?.trim() ?? "";

  // -- get_workspace_overview (read-only) --
  modelContext.registerTool({
    name: "get_workspace_overview",
    title: "Read the dashboard",
    description:
      "Read the current workspace: available sections and which is active, the overview banner, the highlight cards, the recent-activity feed, and the assistant's current dock layout.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    execute() {
      const banner = document.querySelector(".workspace-banner");
      const cards = Array.from(document.querySelectorAll(".workspace-card")).map((card) => ({
        title: card.querySelector("h4")?.textContent?.trim() ?? "",
        summary: card.querySelector("p")?.textContent?.trim() ?? "",
      }));
      const activity = Array.from(document.querySelectorAll(".workspace-feed .feed-item")).map(
        (item) => {
          const spans = item.querySelectorAll("span");
          return {
            when: spans[0]?.textContent?.trim() ?? "",
            title: spans[1]?.textContent?.trim() ?? "",
            detail: spans[2]?.textContent?.trim() ?? "",
          };
        },
      );
      return {
        sections: navItems().map((el) => ({
          name: sectionName(el),
          active: el.classList.contains("is-active"),
        })),
        banner: {
          title: banner?.querySelector("h3")?.textContent?.trim() ?? "",
          text: banner?.querySelector("p")?.textContent?.trim() ?? "",
        },
        cards,
        activity,
        dock: getDockConfig(),
      };
    },
  });

  // -- switch_section (read-only-ish navigation) --
  modelContext.registerTool({
    name: "switch_section",
    title: "Switch workspace section",
    description:
      "Highlight a section in the workspace navigation. Valid section names come from get_workspace_overview (e.g. Overview, Automation, Audience, Catalog, Publishing).",
    inputSchema: {
      type: "object",
      properties: {
        section: { type: "string", description: "Exact name of the section to activate." },
      },
      required: ["section"],
    },
    // Mutates UI state (active nav item), so no readOnlyHint, but it stays in
    // READ_ONLY_TOOLS above: pure navigation auto-approves at the gate.
    annotations: { readOnlyHint: false },
    execute(args) {
      const requested = String(args.section ?? "").trim().toLowerCase();
      const items = navItems();
      const target = items.find((el) => sectionName(el).toLowerCase() === requested);
      if (!target) {
        throw new Error(
          `Unknown section "${args.section}". Available: ${items.map(sectionName).join(", ")}.`,
        );
      }
      items.forEach((el) => {
        el.classList.toggle("is-active", el === target);
        if (el === target) el.setAttribute("aria-current", "page");
        else el.removeAttribute("aria-current");
      });
      updateStatus(`Switched to ${sectionName(target)}.`);
      return { ok: true, active: sectionName(target) };
    },
  });

  // -- set_dock_layout (mutating: the assistant repositions itself) --
  modelContext.registerTool({
    name: "set_dock_layout",
    title: "Move the assistant dock",
    description:
      "Reposition or resize the assistant's own docked panel. All fields optional; omitted ones keep their current value. side: 'left' | 'right'. width: CSS width like '360px'. reveal: 'resize' | 'emerge' | 'overlay' | 'push'. animate: boolean.",
    inputSchema: {
      type: "object",
      properties: {
        side: { type: "string", enum: ["left", "right"] },
        width: { type: "string", description: "CSS width for the open dock, e.g. '360px'." },
        reveal: { type: "string", enum: ["resize", "emerge", "overlay", "push"] },
        animate: { type: "boolean" },
      },
    },
    execute(args) {
      if (args.side !== undefined) {
        if (args.side !== "left" && args.side !== "right") {
          throw new Error(`Invalid side "${args.side}": use "left" or "right".`);
        }
        sideSelect.value = args.side;
      }
      if (args.width !== undefined) {
        const raw = String(args.width).trim();
        const width = /^\d+(\.\d+)?$/.test(raw) ? `${raw}px` : raw;
        if (!/^\d+(\.\d+)?(px|rem|em|vw|%)$/.test(width)) {
          throw new Error(`Invalid width "${args.width}": use a CSS length like "360px".`);
        }
        widthInput.value = width;
      }
      if (args.reveal !== undefined) {
        const reveal = String(args.reveal);
        if (!["resize", "emerge", "overlay", "push"].includes(reveal)) {
          throw new Error(`Invalid reveal "${args.reveal}": use resize, emerge, overlay, or push.`);
        }
        revealSelect.value = reveal;
      }
      if (args.animate !== undefined) {
        animateCheck.checked = Boolean(args.animate);
      }
      applyDockSettings();
      return { ok: true, dock: getDockConfig() };
    },
  });

  // -- log_activity (mutating: visible feed update) --
  modelContext.registerTool({
    name: "log_activity",
    title: "Log activity",
    description:
      "Add an entry to the dashboard's Recent activity feed. Use a short title and put any detail in the body.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short headline for the entry." },
        detail: { type: "string", description: "One-sentence detail shown under the title." },
      },
      required: ["title"],
    },
    execute(args) {
      const feed = document.querySelector(".workspace-feed");
      if (!feed) throw new Error("Activity feed not found on the page.");

      // Built with textContent: agent-supplied strings never touch innerHTML.
      const item = document.createElement("div");
      item.className = "feed-item";
      const meta = document.createElement("span");
      meta.className = "feed-meta";
      meta.textContent = "Just now";
      const title = document.createElement("span");
      title.className = "feed-title";
      title.textContent = String(args.title ?? "").trim() || "Untitled note";
      item.append(meta, title);
      if (args.detail !== undefined && String(args.detail).trim()) {
        const detail = document.createElement("span");
        detail.textContent = String(args.detail).trim();
        item.append(detail);
      }
      feed.querySelector(".workspace-feed__heading")?.after(item);
      updateStatus("Activity logged.");
      return { ok: true, logged: title.textContent };
    },
  });
}
