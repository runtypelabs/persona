import { WEBMCP_STOREFRONT_FLOW } from "../flows/webmcp-storefront.js";
import { agentFromPromptFlow } from "./from-flow.js";

export const WEBMCP_STOREFRONT_AGENT = agentFromPromptFlow(
  WEBMCP_STOREFRONT_FLOW,
  {
    maxTurns: 8,
  },
);
