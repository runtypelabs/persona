// Example plugin: polished in-thread voice indicators.
//
// Demonstrates the `renderMessage` plugin hook — which returns a real
// `HTMLElement` (no HTML-string sanitization, full control over markup,
// CSS and animation), unlike `postprocessMessage` (a sanitized HTML string
// whose inline styles get stripped). Register via:
//   plugins: [createVoiceIndicatorPlugin()]
//
// It styles the two message-level voice states and falls through to the
// widget's default renderer for everything else (so normal replies keep their
// markdown — a `postprocessMessage` that returns raw text would lose it):
//
//   • transcribing — a user message still streaming its transcript
//     (`message.voiceProcessing === true`): a live, growing bubble with a
//     waveform + caret.
//   • thinking — the empty assistant placeholder injected while the agent
//     works (`voiceProcessing` + no content yet): shimmering dots.
//
// The other two voice states — listening and speaking — are NOT message
// bubbles (they're `VoiceStatus` values with no message), so they're surfaced
// separately by the demo's status dock via the `voice:status` widget event.
// This plugin and that dock share one visual language (sky = user, violet =
// assistant; soft breathing motion).
//
// Animated nodes carry `data-preserve-animation="true"` so the widget's DOM
// morph keeps the animation running across interim transcript updates instead
// of restarting it each frame.
//
// Copy this file into your own app; its only dependency is the widget's
// plugin-kit subpath (used for Shadow-DOM-safe style injection).

import { injectStyles } from "@runtypelabs/persona/plugin-kit";

const STYLE_ID = "voice-indicator-plugin-style";

const STYLE_CSS = `
  .pvi-row {
    display: flex;
    /* Fill the widget's message wrapper. The wrapper is a row-direction flexbox,
       which makes this row a flex item; without an explicit width it collapses
       toward its min-content and starves the bubble's available width, so short
       bubbles (e.g. the "Thinking…" pill) render too narrow and their text
       spills outside. width:100% pins the row to the full wrapper; the bubble
       still sizes to content and is aligned by justify-content below. */
    width: 100%;
    margin: 0.25rem 0;
    --pvi-user: #38bdf8;       /* sky  */
    --pvi-assistant: #a78bfa;  /* violet */
  }
  .pvi-row-user { justify-content: flex-end; }
  .pvi-row-assistant { justify-content: flex-start; }

  .pvi-bubble {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    max-width: 80%;
    padding: 0.6rem 0.85rem;
    border-radius: 1.05rem;
    font-size: 0.95rem;
    line-height: 1.4;
    color: var(--persona-text, #0f172a);
    box-shadow: 0 10px 24px -16px rgba(15, 23, 42, 0.45);
    animation: pvi-breathe 2.4s ease-in-out infinite;
  }

  /* transcribing (user) */
  .pvi-bubble-user {
    --accent: var(--pvi-user);
    background: color-mix(in srgb, var(--accent) 14%, var(--persona-surface, #ffffff));
    border: 1px solid color-mix(in srgb, var(--accent) 38%, transparent);
    border-bottom-right-radius: 0.35rem;
  }
  /* thinking (assistant) */
  .pvi-bubble-assistant {
    --accent: var(--pvi-assistant);
    background: color-mix(in srgb, var(--accent) 12%, var(--persona-surface, #ffffff));
    border: 1px solid color-mix(in srgb, var(--accent) 34%, transparent);
    border-bottom-left-radius: 0.35rem;
  }

  .pvi-text {
    flex: 1 1 auto;
    min-width: 0;
    white-space: pre-wrap;
    overflow-wrap: break-word;
  }
  .pvi-text:empty::after {
    content: attr(data-placeholder);
    color: var(--persona-muted, #64748b);
    font-style: italic;
  }

  /* live waveform (transcribing) — fixed-size trailing affordance */
  .pvi-wave { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 2px; height: 1em; }
  .pvi-wave i {
    width: 3px;
    height: 100%;
    border-radius: 2px;
    background: var(--accent);
    transform-origin: center;
    animation: pvi-wave 1s ease-in-out infinite;
  }
  .pvi-wave i:nth-child(1) { animation-delay: 0s;    }
  .pvi-wave i:nth-child(2) { animation-delay: 0.15s; }
  .pvi-wave i:nth-child(3) { animation-delay: 0.3s;  }
  .pvi-wave i:nth-child(4) { animation-delay: 0.45s; }
  .pvi-wave i:nth-child(5) { animation-delay: 0.6s;  }

  /* shimmer dots (thinking) */
  .pvi-dots { display: inline-flex; align-items: center; gap: 5px; }
  .pvi-dots i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
    animation: pvi-dot 1.2s ease-in-out infinite;
  }
  .pvi-dots i:nth-child(2) { animation-delay: 0.18s; }
  .pvi-dots i:nth-child(3) { animation-delay: 0.36s; }
  .pvi-label { color: var(--persona-muted, #64748b); font-size: 0.85rem; }

  @keyframes pvi-wave  { 0%, 100% { transform: scaleY(0.35); opacity: 0.6; } 50% { transform: scaleY(1); opacity: 1; } }
  @keyframes pvi-dot   { 0%, 100% { transform: translateY(0); opacity: 0.45; } 50% { transform: translateY(-3px); opacity: 1; } }
  @keyframes pvi-breathe {
    0%, 100% { box-shadow: 0 10px 24px -16px rgba(15, 23, 42, 0.45); }
    50%      { box-shadow: 0 10px 30px -14px color-mix(in srgb, var(--accent) 55%, transparent); }
  }

  @media (prefers-reduced-motion: reduce) {
    .pvi-bubble, .pvi-wave i, .pvi-dots i { animation: none !important; }
  }
`;

function el(tag, className, attrs) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function waveform() {
  const wave = el("span", "pvi-wave", { "aria-hidden": "true" });
  for (let i = 0; i < 5; i++) wave.appendChild(document.createElement("i"));
  return wave;
}

/** transcribing — a user message whose transcript is still streaming in. */
function transcribingBubble(message, opts) {
  const row = el("div", "pvi-row pvi-row-user", { "data-preserve-animation": "true" });
  applyAccents(row, opts);
  const bubble = el("div", "pvi-bubble pvi-bubble-user", {
    role: "status",
    "aria-live": "polite",
    "aria-label": "Transcribing your voice",
  });
  const text = el("span", "pvi-text", { "data-placeholder": opts.labels.listening });
  text.textContent = message.content || "";          // textContent: no HTML injection from speech
  bubble.append(text, waveform());
  row.appendChild(bubble);
  return row;
}

/** thinking — the empty assistant placeholder while the agent works. */
function thinkingBubble(opts) {
  const row = el("div", "pvi-row pvi-row-assistant", { "data-preserve-animation": "true" });
  applyAccents(row, opts);
  const bubble = el("div", "pvi-bubble pvi-bubble-assistant", {
    role: "status",
    "aria-live": "polite",
    "aria-label": "Assistant is thinking",
  });
  const dots = el("span", "pvi-dots", { "aria-hidden": "true" });
  for (let i = 0; i < 3; i++) dots.appendChild(document.createElement("i"));
  const label = el("span", "pvi-label");
  label.textContent = opts.labels.thinking;
  bubble.append(dots, label);
  row.appendChild(bubble);
  return row;
}

function applyAccents(row, opts) {
  if (opts.accents.user) row.style.setProperty("--pvi-user", opts.accents.user);
  if (opts.accents.assistant) row.style.setProperty("--pvi-assistant", opts.accents.assistant);
}

/**
 * @param {Object} [options]
 * @param {string} [options.id="voice-indicator"]
 * @param {{ user?: string, assistant?: string }} [options.accents]  CSS colors
 * @param {{ thinking?: string, listening?: string }} [options.labels]
 * @returns {import("@runtypelabs/persona").AgentWidgetPlugin}
 */
export function createVoiceIndicatorPlugin(options = {}) {
  const opts = {
    accents: { user: options.accents?.user, assistant: options.accents?.assistant },
    labels: {
      thinking: options.labels?.thinking ?? "Thinking…",
      listening: options.labels?.listening ?? "Listening…",
    },
  };

  return {
    id: options.id ?? "voice-indicator",
    renderMessage: ({ message, defaultRenderer }) => {
      const isTranscribing = message.role === "user" && message.voiceProcessing;
      const isThinking =
        message.role === "assistant" &&
        message.voiceProcessing &&
        !(message.content || "").trim();

      if (!isTranscribing && !isThinking) return defaultRenderer();

      const root = isTranscribing ? transcribingBubble(message, opts) : thinkingBubble(opts);
      injectStyles(root, STYLE_ID, STYLE_CSS); // shadow-safe + idempotent
      return root;
    },
  };
}
