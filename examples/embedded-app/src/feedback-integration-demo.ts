import "@runtypelabs/persona/widget.css";
import {
  createLocalStorageAdapter,
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG,
  generateMessageId,
  type AgentWidgetConfig,
  type AgentWidgetController,
  type AgentWidgetMessage,
  type AgentWidgetMessageFeedback,
} from "@runtypelabs/persona";
import { setupMountMode, runWidgetMount } from "./mount-mode";
import type { Mode } from "./examples-nav";

const clientToken = import.meta.env.VITE_CLIENT_TOKEN || "";
const apiUrl = import.meta.env.VITE_API_URL || "https://api.runtype.com";

const cfgCopy = document.getElementById("cfg-copy") as HTMLInputElement;
const cfgUpvote = document.getElementById("cfg-upvote") as HTMLInputElement;
const cfgDownvote = document.getElementById("cfg-downvote") as HTMLInputElement;
const cfgVisibility = document.getElementById("cfg-visibility") as HTMLSelectElement;
const cfgLayout = document.getElementById("cfg-layout") as HTMLSelectElement;
const cfgAlign = document.getElementById("cfg-align") as HTMLSelectElement;

const stats = { upvotes: 0, downvotes: 0, copies: 0, csat: null as number | null, nps: null as number | null };

function updateStats() {
  const upvoteEl = document.getElementById("upvote-count");
  const downvoteEl = document.getElementById("downvote-count");
  const copyEl = document.getElementById("copy-count");
  const csatEl = document.getElementById("csat-rating");
  const npsEl = document.getElementById("nps-rating");
  if (upvoteEl) upvoteEl.textContent = String(stats.upvotes);
  if (downvoteEl) downvoteEl.textContent = String(stats.downvotes);
  if (copyEl) copyEl.textContent = String(stats.copies);
  if (csatEl) csatEl.textContent = stats.csat !== null ? `${stats.csat}/5` : "-";
  if (npsEl) npsEl.textContent = stats.nps !== null ? `${stats.nps}/10` : "-";
}

function formatTime(): string {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

function addLogEntry(type: string, details: string) {
  const container = document.getElementById("log-container");
  if (!container) return;
  const emptyState = container.querySelector(".empty-state");
  if (emptyState) emptyState.remove();
  const entry = document.createElement("div");
  entry.className = `log-entry ${type}`;
  entry.innerHTML = `
    <div><strong>${type.toUpperCase()}</strong></div>
    <div style="margin-top: 0.25rem; opacity: 0.7;">${details}</div>
    <div class="log-time">${formatTime()}</div>
  `;
  container.insertBefore(entry, container.firstChild);
  while (container.children.length > 50) {
    container.removeChild(container.lastChild!);
  }
}

function getMessageActionsConfig() {
  return {
    enabled: true,
    showCopy: cfgCopy.checked,
    showUpvote: cfgUpvote.checked,
    showDownvote: cfgDownvote.checked,
    visibility: cfgVisibility.value as "always" | "hover",
    layout: cfgLayout.value as "pill-inside" | "row-inside",
    align: cfgAlign.value as "left" | "center" | "right",
    onCopy: (message: AgentWidgetMessage) => {
      stats.copies++;
      updateStats();
      addLogEntry("copy", `Message ID: ${message.id}`);
    },
    onFeedback: (feedback: AgentWidgetMessageFeedback) => {
      if (feedback.type === "upvote") stats.upvotes++;
      else stats.downvotes++;
      updateStats();
      addLogEntry(feedback.type, `Message ID: ${feedback.messageId}`);
    },
  };
}

let activeController: AgentWidgetController | null = null;

const buildConfig = (mode: Mode): AgentWidgetConfig => {
  const isLauncher = mode === "launcher";
  return {
    ...DEFAULT_WIDGET_CONFIG,
    clientToken: clientToken || undefined,
    apiUrl,
    storageAdapter: createLocalStorageAdapter(
      `persona-state-feedback-integration-demo-${mode}`,
    ),
    launcher: {
      ...DEFAULT_WIDGET_CONFIG.launcher,
      enabled: isLauncher,
      width: isLauncher ? "min(420px, 95vw)" : "100%",
    },
    theme: {
      ...DEFAULT_WIDGET_CONFIG.theme,
      primary: "#0f172a",
      accent: "#6366f1",
      surface: "#ffffff",
    },
    copy: {
      ...DEFAULT_WIDGET_CONFIG.copy,
      welcomeTitle: "Feedback Integration Demo",
      welcomeSubtitle: "Test message feedback with client-generated IDs!",
      inputPlaceholder: "Type a message...",
    },
    suggestionChips: [
      "Tell me a joke",
      "Explain quantum computing",
      "Write a haiku about coding",
    ],
    messageActions: getMessageActionsConfig(),
    onSessionInit: (session) => {
      addLogEntry("session", `Session ID: ${session.sessionId.substring(0, 20)}...`);
    },
    onSessionExpired: () => {
      addLogEntry("session", "Session expired - please refresh");
    },
    postprocessMessage: ({ text }) => markdownPostprocessor(text),
    debug: true,
  };
};

setupMountMode({
  slug: "feedback-integration-demo",
  modes: ["inline", "launcher"],
  mount: (mode, { stage }) => {
    const { controller, teardown } = runWidgetMount(mode, stage, buildConfig(mode));
    activeController = controller;
    controller.on("message:copy", (message) => {
      console.log("[Event] message:copy - ID:", message.id);
    });
    controller.on("message:feedback", (feedback) => {
      console.log("[Event] message:feedback -", feedback.type, "for", feedback.messageId);
    });
    return () => {
      teardown();
      activeController = null;
    };
  },
});

for (const el of [cfgCopy, cfgUpvote, cfgDownvote, cfgVisibility, cfgLayout, cfgAlign]) {
  el.addEventListener("change", () => {
    activeController?.update({ messageActions: getMessageActionsConfig() });
  });
}

document.getElementById("show-csat")?.addEventListener("click", () => {
  activeController?.showCSATFeedback({
    title: "How was your experience?",
    subtitle: "Rate your conversation",
    onSubmit: (rating, comment) => {
      stats.csat = rating;
      updateStats();
      addLogEntry("csat", `Rating: ${rating}/5${comment ? ` - "${comment}"` : ""}`);
    },
    onDismiss: () => addLogEntry("csat", "Dismissed by user"),
  });
});

document.getElementById("show-nps")?.addEventListener("click", () => {
  activeController?.showNPSFeedback({
    title: "How likely are you to recommend us?",
    subtitle: "On a scale of 0 to 10",
    onSubmit: (rating, comment) => {
      stats.nps = rating;
      updateStats();
      const category = rating >= 9 ? "Promoter" : rating >= 7 ? "Passive" : "Detractor";
      addLogEntry("nps", `Rating: ${rating}/10 (${category})${comment ? ` - "${comment}"` : ""}`);
    },
    onDismiss: () => addLogEntry("nps", "Dismissed by user"),
  });
});

document.getElementById("submit-csat-programmatic")?.addEventListener("click", async () => {
  try {
    await activeController?.submitCSATFeedback(5, "Great experience!");
    stats.csat = 5;
    updateStats();
    addLogEntry("csat", "Programmatic: 5/5 - Great experience!");
  } catch (error) {
    addLogEntry("error", `CSAT failed: ${error}`);
  }
});

document.getElementById("submit-nps-programmatic")?.addEventListener("click", async () => {
  try {
    await activeController?.submitNPSFeedback(9, "Highly recommend!");
    stats.nps = 9;
    updateStats();
    addLogEntry("nps", "Programmatic: 9/10 - Highly recommend!");
  } catch (error) {
    addLogEntry("error", `NPS failed: ${error}`);
  }
});

console.log("Example generated message IDs:");
console.log("  User message ID:", generateMessageId());
console.log("  User message ID:", generateMessageId());

console.log("[Feedback Integration Demo] Ready. Client token mode:", !!clientToken);
