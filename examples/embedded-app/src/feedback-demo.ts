import "@runtypelabs/persona/widget.css";
import {
  createAgentExperience,
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG
} from "@runtypelabs/persona";
import type {
  AgentWidgetMessage,
  AgentWidgetMessageFeedback
} from "@runtypelabs/persona";

const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const proxyUrl =
  import.meta.env.VITE_PROXY_URL
    ? `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch`
    : `http://localhost:${proxyPort}/api/chat/dispatch`;

// Stats tracking
const stats = { upvotes: 0, downvotes: 0, copies: 0 };

function updateStats() {
  const upvoteEl = document.getElementById("upvote-count");
  const downvoteEl = document.getElementById("downvote-count");
  const copyEl = document.getElementById("copy-count");
  
  if (upvoteEl) upvoteEl.textContent = String(stats.upvotes);
  if (downvoteEl) downvoteEl.textContent = String(stats.downvotes);
  if (copyEl) copyEl.textContent = String(stats.copies);
}

function formatTime(): string {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

function addLogEntry(type: "upvote" | "downvote" | "copy", data: AgentWidgetMessage | AgentWidgetMessageFeedback) {
  const container = document.getElementById("log-container");
  if (!container) return;
  
  // Remove empty state if present
  const emptyState = container.querySelector(".empty-state");
  if (emptyState) emptyState.remove();

  const entry = document.createElement("div");
  entry.className = `log-entry ${type}`;
  
  let messageId: string;
  let preview: string;
  
  if (type === "copy") {
    const message = data as AgentWidgetMessage;
    messageId = message.id;
    preview = message.content?.substring(0, 50) + "...";
  } else {
    const feedback = data as AgentWidgetMessageFeedback;
    messageId = feedback.messageId;
    preview = feedback.message?.content?.substring(0, 50) + "...";
  }
  
  entry.innerHTML = `
    <div><strong>${type.toUpperCase()}</strong> - ${messageId}</div>
    <div style="margin-top: 0.25rem; opacity: 0.7;">${preview}</div>
    <div class="log-time">${formatTime()}</div>
  `;
  
  container.insertBefore(entry, container.firstChild);

  // Keep only last 50 entries
  while (container.children.length > 50) {
    container.removeChild(container.lastChild!);
  }
}

// Example: Send feedback to backend (implement your own endpoint)
async function sendFeedbackToBackend(feedback: AgentWidgetMessageFeedback) {
  // Uncomment to send feedback to your backend:
  /*
  await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: feedback.type,
      messageId: feedback.messageId,
      content: feedback.message.content,
      timestamp: new Date().toISOString()
    })
  });
  */
  console.log("[Backend] Would send feedback:", feedback);
}

// Initialize widget
const mount = document.getElementById("feedback-widget");
if (!mount) throw new Error("Widget mount not found");

const controller = createAgentExperience(mount, {
  ...DEFAULT_WIDGET_CONFIG,
  apiUrl: proxyUrl,
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
    welcomeTitle: "Feedback Demo",
    welcomeSubtitle: "Ask me anything, then try the action buttons on my responses!",
    inputPlaceholder: "Type a message..."
  },
  suggestionChips: [
    "Tell me a joke",
    "Explain quantum computing",
    "Write a haiku about coding"
  ],
  
  // Message actions configuration
  messageActions: {
    enabled: true,
    showCopy: true,
    showUpvote: true,
    showDownvote: true,
    visibility: "always",
    align: "right",
    
    onCopy: (message: AgentWidgetMessage) => {
      stats.copies++;
      updateStats();
      addLogEntry("copy", message);
      console.log("[Callback] Message copied:", message.id);
    },
    
    onFeedback: (feedback: AgentWidgetMessageFeedback) => {
      if (feedback.type === "upvote") {
        stats.upvotes++;
      } else {
        stats.downvotes++;
      }
      updateStats();
      addLogEntry(feedback.type, feedback);
      sendFeedbackToBackend(feedback);
      console.log("[Callback] Feedback received:", feedback.type, feedback.messageId);
    }
  },
  
  postprocessMessage: ({ text }) => markdownPostprocessor(text)
});

// Also demonstrate event-based approach
controller.on("message:copy", (message) => {
  console.log("[Event] message:copy:", message.id);
});

controller.on("message:feedback", (feedback) => {
  console.log("[Event] message:feedback:", feedback.type, feedback.messageId);
});

// Make controller available for debugging
(window as unknown as { feedbackController: typeof controller }).feedbackController = controller;

