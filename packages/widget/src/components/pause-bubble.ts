import { createElement } from "../utils/dom";
import { AgentWidgetConfig, AgentWidgetMessage } from "../types";

/**
 * Default copy for a passive durable-pause indicator, keyed by the known
 * `awaitReason` values. Any unknown (forward-compat) reason falls back to the
 * generic "Working…" label — the suppression of the resume affordance is driven
 * by the presence of `awaitReason`, never by this map matching.
 */
const DEFAULT_PAUSE_LABELS = new Map<string, string>([
  ["crawl_pending", "Fetching pages…"],
  ["durable_poll", "Working in the background…"],
]);

const DEFAULT_PAUSE_LABEL = "Working…";

/**
 * Resolve the label shown next to the spinner for a durable pause. A consumer
 * can override per-reason (and the fallback) via `config.copy.durablePauseLabels`.
 */
export const resolveDurablePauseLabel = (
  awaitReason: string,
  config?: AgentWidgetConfig
): string => {
  const overrides = config?.copy?.durablePauseLabels;
  return (
    overrides?.[awaitReason] ??
    DEFAULT_PAUSE_LABELS.get(awaitReason) ??
    overrides?.["default"] ??
    DEFAULT_PAUSE_LABEL
  );
};

const appendSpinnerDots = (container: HTMLElement): void => {
  [0, 200, 400].forEach((delay) => {
    const dot = createElement(
      "div",
      "persona-animate-typing persona-rounded-full persona-h-1.5 persona-w-1.5"
    );
    dot.style.backgroundColor = "currentColor";
    dot.style.opacity = "0.45";
    dot.style.animationDelay = `${delay}ms`;
    container.appendChild(dot);
  });
};

/**
 * Renders the passive, NON-INTERACTIVE indicator for an auto-resuming durable
 * pause (variant `"pause"`). There is deliberately no resume / input control:
 * the server resumes the stream on its own, so this bubble only communicates
 * "still working" and then disappears once `durablePause.resolved` flips true.
 */
export const createPauseBubble = (
  message: AgentWidgetMessage,
  config?: AgentWidgetConfig
): HTMLElement => {
  const pause = message.durablePause;
  const bubble = createElement(
    "div",
    [
      "persona-message-bubble",
      "persona-pause-bubble",
      "persona-flex",
      "persona-items-center",
      "persona-gap-2",
      "persona-max-w-[85%]",
      "persona-rounded-2xl",
      "persona-bg-persona-surface",
      "persona-border",
      "persona-border-persona-message-border",
      "persona-text-persona-muted",
      "persona-shadow-sm",
      "persona-px-4",
      "persona-py-3",
    ].join(" ")
  );
  // id + data attribute for idiomorph matching across re-emits.
  bubble.id = `bubble-${message.id}`;
  bubble.setAttribute("data-message-id", message.id);
  bubble.setAttribute("data-bubble-type", "pause");

  // Once the stream resumes (or the execution completes) the pause has served
  // its purpose; collapse it so it leaves no trace in the transcript.
  if (!pause || pause.resolved) {
    bubble.style.display = "none";
    bubble.setAttribute("aria-hidden", "true");
    return bubble;
  }

  bubble.setAttribute("role", "status");
  bubble.setAttribute("aria-live", "polite");

  const dots = createElement("div", "persona-flex persona-items-center persona-space-x-1");
  appendSpinnerDots(dots);

  const label = createElement(
    "span",
    "persona-text-xs persona-text-persona-muted persona-tool-loading-pulse"
  );
  label.style.setProperty("--persona-tool-anim-duration", "2000ms");
  label.textContent = resolveDurablePauseLabel(pause.awaitReason, config);

  bubble.append(dots, label);
  return bubble;
};
