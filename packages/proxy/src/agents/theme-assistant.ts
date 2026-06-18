import { THEME_ASSISTANT_FLOW } from "../flows/theme-assistant.js";
import { agentFromPromptFlow } from "./from-flow.js";

export const THEME_ASSISTANT_AGENT = agentFromPromptFlow(THEME_ASSISTANT_FLOW, {
  maxTurns: 12,
});
