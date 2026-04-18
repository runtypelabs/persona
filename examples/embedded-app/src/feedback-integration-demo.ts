/**
 * Feedback Integration Demo
 *
 * This demo shows how the persona widget now supports client-provided
 * message IDs for feedback tracking with the Runtype API.
 *
 * Key changes:
 * 1. Message IDs are generated on the client before sending
 * 2. Both user and assistant messages have trackable IDs
 * 3. Feedback (upvote/downvote/copy) is automatically sent to the API in client token mode
 * 4. CSAT (1-5) and NPS (0-10) feedback can be collected programmatically
 */

import "@runtypelabs/persona/widget.css";
import {
  createAgentExperience,
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG,
  generateMessageId  // New utility for custom ID generation
} from "@runtypelabs/persona";
import type {
  AgentWidgetMessage,
  AgentWidgetMessageFeedback,
  ClientFeedbackRequest  // New type for feedback requests
} from "@runtypelabs/persona";

// Configuration
const clientToken = import.meta.env.VITE_CLIENT_TOKEN || '';
const apiUrl = import.meta.env.VITE_API_URL || 'https://api.runtype.com';

// Message actions config controls
const cfgCopy = document.getElementById("cfg-copy") as HTMLInputElement;
const cfgUpvote = document.getElementById("cfg-upvote") as HTMLInputElement;
const cfgDownvote = document.getElementById("cfg-downvote") as HTMLInputElement;
const cfgVisibility = document.getElementById("cfg-visibility") as HTMLSelectElement;
const cfgLayout = document.getElementById("cfg-layout") as HTMLSelectElement;
const cfgAlign = document.getElementById("cfg-align") as HTMLSelectElement;

// Stats tracking
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
  if (csatEl) csatEl.textContent = stats.csat !== null ? `${stats.csat}/5` : '-';
  if (npsEl) npsEl.textContent = stats.nps !== null ? `${stats.nps}/10` : '-';
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
      console.log("[Feedback Demo] Message copied:", message.id);
    },
    onFeedback: (feedback: AgentWidgetMessageFeedback) => {
      if (feedback.type === "upvote") {
        stats.upvotes++;
      } else {
        stats.downvotes++;
      }
      updateStats();
      addLogEntry(feedback.type, `Message ID: ${feedback.messageId}`);
      console.log("[Feedback Demo] Feedback received:", feedback.type, feedback.messageId);
    }
  };
}

// Initialize widget
const mount = document.getElementById("feedback-widget");
if (!mount) throw new Error("Widget mount not found");

const controller = createAgentExperience(mount, {
  ...DEFAULT_WIDGET_CONFIG,
  // Use client token for direct API communication with feedback support
  clientToken: clientToken || undefined,
  apiUrl: apiUrl,
  launcher: {
    ...DEFAULT_WIDGET_CONFIG.launcher,
    enabled: false,
    width: "100%"
  },
  theme: {
    ...DEFAULT_WIDGET_CONFIG.theme,
    primary: "#0f172a",
    accent: "#6366f1",
    surface: "#ffffff"
  },
  copy: {
    ...DEFAULT_WIDGET_CONFIG.copy,
    welcomeTitle: "Feedback Integration Demo",
    welcomeSubtitle: "Test message feedback with client-generated IDs!",
    inputPlaceholder: "Type a message..."
  },
  suggestionChips: [
    "Tell me a joke",
    "Explain quantum computing",
    "Write a haiku about coding"
  ],
  
  messageActions: getMessageActionsConfig(),
  
  // Session callbacks
  onSessionInit: (session) => {
    console.log("[Feedback Demo] Session initialized:", session.sessionId);
    addLogEntry("session", `Session ID: ${session.sessionId.substring(0, 20)}...`);
  },
  
  onSessionExpired: () => {
    console.log("[Feedback Demo] Session expired");
    addLogEntry("session", "Session expired - please refresh");
  },
  
  postprocessMessage: ({ text }) => markdownPostprocessor(text),
  debug: true
});

// Update widget when message actions config controls change
for (const el of [cfgCopy, cfgUpvote, cfgDownvote, cfgVisibility, cfgLayout, cfgAlign]) {
  el.addEventListener("change", () => {
    controller.update({ messageActions: getMessageActionsConfig() });
  });
}

// Event listeners for additional logging
controller.on("message:copy", (message) => {
  console.log("[Event] message:copy - ID:", message.id);
});

controller.on("message:feedback", (feedback) => {
  console.log("[Event] message:feedback -", feedback.type, "for message:", feedback.messageId);
});

// CSAT/NPS button handlers
document.getElementById("show-csat")?.addEventListener("click", () => {
  controller.showCSATFeedback({
    title: "How was your experience?",
    subtitle: "Rate your conversation",
    onSubmit: (rating, comment) => {
      stats.csat = rating;
      updateStats();
      addLogEntry("csat", `Rating: ${rating}/5${comment ? ` - "${comment}"` : ''}`);
      console.log("[CSAT] Submitted:", rating, comment);
    },
    onDismiss: () => {
      addLogEntry("csat", "Dismissed by user");
    }
  });
});

document.getElementById("show-nps")?.addEventListener("click", () => {
  controller.showNPSFeedback({
    title: "How likely are you to recommend us?",
    subtitle: "On a scale of 0 to 10",
    onSubmit: (rating, comment) => {
      stats.nps = rating;
      updateStats();
      const category = rating >= 9 ? 'Promoter' : rating >= 7 ? 'Passive' : 'Detractor';
      addLogEntry("nps", `Rating: ${rating}/10 (${category})${comment ? ` - "${comment}"` : ''}`);
      console.log("[NPS] Submitted:", rating, comment);
    },
    onDismiss: () => {
      addLogEntry("nps", "Dismissed by user");
    }
  });
});

// Example: Programmatically submit feedback (useful for custom UI)
document.getElementById("submit-csat-programmatic")?.addEventListener("click", async () => {
  try {
    await controller.submitCSATFeedback(5, "Great experience!");
    stats.csat = 5;
    updateStats();
    addLogEntry("csat", "Programmatic: 5/5 - Great experience!");
  } catch (error) {
    addLogEntry("error", `CSAT failed: ${error}`);
  }
});

document.getElementById("submit-nps-programmatic")?.addEventListener("click", async () => {
  try {
    await controller.submitNPSFeedback(9, "Highly recommend!");
    stats.nps = 9;
    updateStats();
    addLogEntry("nps", "Programmatic: 9/10 - Highly recommend!");
  } catch (error) {
    addLogEntry("error", `NPS failed: ${error}`);
  }
});

// Example: Using the generateMessageId utility for custom tracking
console.log("Example generated message IDs:");
console.log("  User message ID:", generateMessageId());
console.log("  User message ID:", generateMessageId());

// Make controller available for debugging
(window as unknown as { feedbackController: typeof controller }).feedbackController = controller;

console.log("[Feedback Integration Demo] Ready");
console.log("Client token mode:", !!clientToken);



