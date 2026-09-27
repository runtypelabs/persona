/**
 * Persona thinking block: a `renderReasoning` plugin that draws the agent's
 * reasoning under the persona.js chat-bubble mark (its sparkle twinkles while
 * thinking) as a mono transcript in the site's editorial paper/teal voice.
 *
 * While streaming it shows the live tail of the thoughts under a pulsing
 * sparkle; once complete it folds into a one-line `<details>` summary. Stateless
 * markup: Persona morphs plugin output on every update, and a completed message
 * stops re-rendering, so the native `<details>` open state survives.
 */

import "./persona-thinking-plugin.css";

import type { AgentWidgetMessage, AgentWidgetPlugin } from "@runtypelabs/persona";

import { createPersonaMark } from "../persona-logo";

type Reasoning = NonNullable<AgentWidgetMessage["reasoning"]>;

const el = (tag: string, className: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const seconds = (reasoning: Reasoning): string | undefined => {
  const ms =
    reasoning.durationMs ??
    (reasoning.startedAt && reasoning.completedAt
      ? reasoning.completedAt - reasoning.startedAt
      : undefined);
  if (ms === undefined || !Number.isFinite(ms)) return undefined;
  return `${(ms / 1000).toFixed(1)}s`;
};

// The persona.js mark; its sparkle twinkles teal while thinking (see CSS).
const titleBar = (label: string, meta: string): HTMLElement => {
  const bar = el("div", "persona-thinking__bar");
  bar.append(
    createPersonaMark(18, "persona-thinking__logo"),
    el("span", "persona-thinking__label", label),
    el("span", "persona-thinking__meta", meta)
  );
  return bar;
};

export const renderPersonaThinking = (reasoning: Reasoning): HTMLElement => {
  const text = reasoning.chunks.join("").trim();
  const done = reasoning.status === "complete";

  if (!done) {
    const card = el("div", "persona-thinking");
    card.dataset.state = "running";
    card.setAttribute("role", "status");
    card.setAttribute("aria-label", "Persona is thinking");
    const body = el("div", "persona-thinking__stream");
    const line = el("div", "persona-thinking__text", text || "warming up");
    line.append(el("span", "persona-thinking__cursor"));
    body.append(line);
    card.append(titleBar("thinking", ""), body);
    return card;
  }

  const details = document.createElement("details");
  details.className = "persona-thinking";
  details.dataset.state = "done";
  const summary = document.createElement("summary");
  const elapsed = seconds(reasoning);
  summary.append(titleBar("thought", elapsed ? `${elapsed}` : ""));
  details.append(summary);
  if (text) {
    details.append(el("div", "persona-thinking__full", text));
  }
  return details;
};

export const createPersonaThinkingPlugin = (): AgentWidgetPlugin => ({
  id: "persona-thinking",
  renderReasoning: ({ message }) =>
    message.reasoning ? renderPersonaThinking(message.reasoning) : null,
});
