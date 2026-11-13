import { defineAgent } from "@runtypelabs/sdk";
import { DOCS_ASSISTANT_AGENT } from "@runtypelabs/persona-proxy";

/**
 * Config-as-code definition of the home page's docs agent. `ensure-agents.ts`
 * converges it into Runtype by name; the home widget then talks to it directly
 * with a client token (no proxy hop).
 *
 * The prompt, model, and DeepWiki MCP server are reused from the proxy's
 * `DOCS_ASSISTANT_AGENT` so the legacy `/api/chat/dispatch-docs` route and this
 * agent can't drift apart. Name is the ensure identity: renaming creates a new
 * agent, it does not rename the old one.
 *
 * `durability.forced: "durable"` is set here only, not on the proxy's agent:
 * a durable turn is what the client-session socket delivers, so the home widget
 * gets its replies over the socket when init advertises one (and over SSE, as
 * durable turns, when it does not). The client token also opts in
 * (`durableTurns`, in the ensure list).
 */
export const docsAssistantAgent = defineAgent({
  ...DOCS_ASSISTANT_AGENT,
  name: "Persona Docs (persona-chat.dev)",
  description: "Answers questions about Persona on the persona-chat.dev home page.",
  icon: "📚",
  durability: { forced: "durable" },
});
