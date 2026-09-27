/**
 * Converge the home page docs agent and its client token.
 *
 *   RUNTYPE_API_KEY=... pnpm --filter web runtype:ensure
 *
 * Env:
 *   RUNTYPE_API_KEY          required; needs AGENTS write + client-token scopes
 *   RUNTYPE_API_URL          optional API base (e.g. https://api.runtype-staging.com)
 *   RUNTYPE_ALLOWED_ORIGINS  optional comma-separated origins for the token
 *   RUNTYPE_DEPLOY_LIVE      set to "0" to skip moving the `live` alias
 *                            (required for personal accounts, which have no aliases)
 *   RUNTYPE_DRY_RUN          set to "1" to print the agent plan and write nothing
 *                            (the PR check in .github/workflows/runtype-agents.yml)
 *
 * The agent converges with `Runtype.agents.ensure` (idempotent, hash-probed).
 * Client tokens have no `ensure`, so the token is looked up by name: created
 * when missing, otherwise its origins/agent are updated in place. A live token's
 * value is only returned on create, so it is printed once — copy it into
 * VITE_RUNTYPE_CLIENT_TOKEN (it is public by design; origins are the guard).
 */
import { Runtype, createClient } from "@runtypelabs/sdk";
import { docsAssistantAgent } from "./docs-assistant.agent.ts";

const TOKEN_NAME = "persona-chat.dev home widget";
const DEFAULT_ORIGINS = [
  "https://persona-chat.dev",
  "https://www.persona-chat.dev",
  "http://localhost:5173",
];

const apiKey = process.env.RUNTYPE_API_KEY;
if (!apiKey) {
  console.error("RUNTYPE_API_KEY is required.");
  process.exit(1);
}
const baseUrl = process.env.RUNTYPE_API_URL || undefined;
const allowedOrigins = process.env.RUNTYPE_ALLOWED_ORIGINS
  ? process.env.RUNTYPE_ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
  : DEFAULT_ORIGINS;
const deployLive = process.env.RUNTYPE_DEPLOY_LIVE !== "0";
const dryRun = process.env.RUNTYPE_DRY_RUN === "1";

Runtype.configure({ apiKey, baseUrl });
const client = createClient({ apiKey, baseUrl });

const agent = await Runtype.agents.ensure(docsAssistantAgent, {
  ...(deployLive ? { deploy: { alias: "live" } } : {}),
  ...(dryRun
    ? { dryRun: true }
    : { version: { label: process.env.GIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA } }),
});
const existing = (await client.clientTokens.list()).find((t) => t.name === TOKEN_NAME);

if (agent.result === "plan") {
  const keys = agent.changedKeys.length ? ` (${agent.changedKeys.join(", ")})` : "";
  console.log(`agent plan: ${agent.changes}${keys}`);
  if (!existing) {
    console.log("client token plan: create");
  } else {
    // A new agent has no id yet, so it always changes the token's agentIds.
    const sameAgent = agent.agentId !== undefined && existing.agentIds.join() === agent.agentId;
    const sameOrigins =
      [...existing.allowedOrigins].sort().join() === [...allowedOrigins].sort().join();
    const changed = [!sameAgent && "agentIds", !sameOrigins && "allowedOrigins"].filter(Boolean);
    console.log(`client token plan: ${changed.length ? `update (${changed.join(", ")})` : "none"}`);
  }
  process.exit(0);
}
console.log(`agent: ${agent.result} ${agent.agentId} (${agent.contentHash})`);

const tokenFields = {
  agentIds: [agent.agentId],
  allowedOrigins,
};
let tokenValue: string | null = null;
if (existing) {
  await client.clientTokens.update(existing.id, tokenFields);
  console.log(`client token: updated ${existing.id} (value unchanged)`);
} else {
  const created = await client.clientTokens.create({
    name: TOKEN_NAME,
    environment: "live",
    ...tokenFields,
  });
  tokenValue = created.token;
  for (const w of created.warnings) console.warn(`client token warning: ${w.message}`);
  console.log(`client token: created ${created.clientToken.id}`);
}

console.log("\nSet these on the web app (Vercel + apps/web/.env.local):");
console.log(`VITE_RUNTYPE_DOCS_AGENT_ID=${agent.agentId}`);
if (tokenValue) console.log(`VITE_RUNTYPE_CLIENT_TOKEN=${tokenValue}`);
if (baseUrl) console.log(`VITE_RUNTYPE_API_URL=${baseUrl}`);
