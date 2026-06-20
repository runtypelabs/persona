import { defineAgent } from "eve";

// The whole agent: eve is filesystem-first, so this directory *is* the agent.
// `withEve()` in next.config.mjs compiles and serves it; the model resolves
// through the Vercel AI Gateway (set AI_GATEWAY_API_KEY). Swap the model for
// anthropic/claude-opus-4.6 (smarter) or anthropic/claude-haiku-4-5 (faster).
export default defineAgent({
  model: "anthropic/claude-sonnet-4.6",
});
