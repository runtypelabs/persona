import { PAGE_CONTEXT_FLOW } from "../flows/page-context.js";
import { agentFromPromptFlow } from "./from-flow.js";

export const PAGE_CONTEXT_AGENT = agentFromPromptFlow(PAGE_CONTEXT_FLOW, {
  maxTurns: 2,
});
