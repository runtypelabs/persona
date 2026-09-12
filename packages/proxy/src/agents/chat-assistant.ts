import type { AgentConfig } from "../index.js";

/**
 * Plain chat assistant for the Fullscreen Assistant demo
 * (apps/web/fullscreen-assistant-demo.html). Server-pinned
 * replacement for the demo's former browser-supplied `config.agent`.
 */
export const CHAT_ASSISTANT_AGENT: AgentConfig = {
  name: "Chat Assistant",
  model: "qwen3.8-27b",
  reasoning: false,
  systemPrompt:
    "You are a helpful assistant. Be friendly, concise, and helpful. If you don't know something, say so.",
  artifacts: { enabled: true, types: ["markdown", "component"] },
};
