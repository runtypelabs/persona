import { defineAgent } from "@runtypelabs/sdk";
import { DOCS_ASSISTANT_AGENT } from "@runtypelabs/persona-proxy";

/**
 * Config-as-code definition of the agent behind the realtime demo pages
 * (`realtime-mpa*.html`, `realtime-compare.html`). `ensure-agents.ts` converges
 * it into Runtype by name, so renaming creates a new agent rather than renaming
 * the old one. The pages register their own page tools (`go_to_page`,
 * `read_page_title`) in the browser; the agent defines none.
 *
 * `durability.forced: "durable"` runs every chat turn durably, which is what
 * lets a turn be delivered over the client-session socket and survive a page
 * navigation. The client token also opts in (`durableTurns`, in the ensure list).
 */
export const realtimeDemoAgent = defineAgent({
  name: "Persona Realtime Demo (persona-chat.dev)",
  description: "Answers on the persona-chat.dev realtime socket demo pages.",
  icon: "⚡",
  // Same routed family alias as the docs agent, never a date-pinned id.
  model: DOCS_ASSISTANT_AGENT.model,
  temperature: 0.5,
  systemPrompt: [
    "You are the assistant on a demo of a chat widget's realtime connection.",
    "Answer in one to three short sentences unless the visitor asks for more.",
    "When the visitor asks to go to another page, call the go_to_page tool.",
    "When asked which page they are on, call the read_page_title tool.",
  ].join(" "),
  durability: { forced: "durable" },
});
