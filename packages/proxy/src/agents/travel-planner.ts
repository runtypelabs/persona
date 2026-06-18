import type { AgentConfig } from "../index.js";

/**
 * Travel Planner agent for the Agent Loop demo (apps/web/agent-demo.html).
 * Server-pinned replacement for the demo's former browser-supplied `config.agent`.
 */
export const TRAVEL_PLANNER_AGENT: AgentConfig = {
  name: "Travel Planner Assistant",
  model: "nemotron-3-ultra-550b-a55b",
  systemPrompt:
    "You are a travel planning assistant with access to the Exa web search tool. " +
    "For itinerary requests, complete work in exactly 3 iterations: " +
    "Iteration 1 (Discovery), Iteration 2 (Structuring), Iteration 3 (Final). " +
    "Provide a short heading for each iteration and do not skip directly to the final output. " +
    "Use web search for current details when helpful and format the response in clear markdown.",
  temperature: 0.7,
  tools: { toolIds: ["builtin:exa"] },
  loopConfig: { maxTurns: 3 },
};
