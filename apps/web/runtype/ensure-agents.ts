/**
 * Converge the showcase site's Runtype agents and their client tokens: the home
 * page docs agent and the realtime demo agent.
 *
 *   RUNTYPE_API_KEY=... pnpm --filter web runtype:ensure
 *
 * Env:
 *   RUNTYPE_API_KEY          required; needs AGENTS write + client-token scopes
 *   RUNTYPE_API_URL          optional API base (defaults to the production API)
 *   RUNTYPE_ALLOWED_ORIGINS  optional comma-separated origins for every token
 *   RUNTYPE_DEPLOY_LIVE      set to "0" to skip moving the `live` alias
 *                            (required for personal accounts, which have no aliases)
 *   RUNTYPE_DRY_RUN          set to "1" to print the plan and write nothing
 *
 * Each agent converges with `Runtype.agents.ensure` (idempotent, hash-probed).
 * Client tokens have no `ensure`, so each is looked up by name: created when
 * missing, otherwise its agent, origins and declared config are updated in
 * place. A live token's value is only returned on create, so it is printed
 * once: copy it into the web app's environment (it is public by design; the
 * origins are the guard).
 */
import { Runtype, createClient, type AgentDefinition } from "@runtypelabs/sdk";
import { docsAssistantAgent } from "./docs-assistant.agent.ts";
import { realtimeDemoAgent } from "./realtime-demo.agent.ts";
import { mergeTokenConfig, planToken, type TokenConfig } from "./ensure-plan.ts";

type Entry = {
  agent: AgentDefinition;
  tokenName: string;
  tokenConfig?: TokenConfig;
  /** Web app env names to print the agent id and a newly created token under. */
  env: { agentId: string; token: string };
};

const ENTRIES: Entry[] = [
  {
    agent: docsAssistantAgent,
    tokenName: "persona-chat.dev home widget",
    // Durable turns are what the client-session socket delivers.
    tokenConfig: { durableTurns: { enabled: true } },
    env: { agentId: "VITE_RUNTYPE_DOCS_AGENT_ID", token: "VITE_RUNTYPE_CLIENT_TOKEN" },
  },
  {
    agent: realtimeDemoAgent,
    tokenName: "persona-chat.dev realtime demo",
    // Durable turns are what the client-session socket delivers.
    tokenConfig: { durableTurns: { enabled: true } },
    env: { agentId: "VITE_RUNTYPE_REALTIME_AGENT_ID", token: "VITE_RUNTYPE_REALTIME_CLIENT_TOKEN" },
  },
];

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
const tokens = await client.clientTokens.list();
const output: string[] = [];

for (const entry of ENTRIES) {
  const label = entry.agent.name;
  const agent = await Runtype.agents.ensure(entry.agent, {
    ...(deployLive ? { deploy: { alias: "live" } } : {}),
    ...(dryRun
      ? { dryRun: true }
      : { version: { label: process.env.GIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA } }),
  });
  const existing = tokens.find((t) => t.name === entry.tokenName);
  const plan = planToken(existing, {
    agentId: agent.agentId,
    allowedOrigins,
    config: entry.tokenConfig,
  });

  if (agent.result === "plan") {
    const keys = agent.changedKeys.length ? ` (${agent.changedKeys.join(", ")})` : "";
    console.log(`${label}: agent plan: ${agent.changes}${keys}`);
    const fields = plan.changed.length ? ` (${plan.changed.join(", ")})` : "";
    console.log(`${label}: client token plan: ${plan.action}${fields}`);
    continue;
  }
  console.log(`${label}: agent ${agent.result} ${agent.agentId} (${agent.contentHash})`);

  const config = mergeTokenConfig(existing?.config, entry.tokenConfig);
  const tokenFields = {
    agentIds: [agent.agentId],
    allowedOrigins,
    ...(config ? { config } : {}),
  };
  let tokenValue: string | null = null;
  if (existing) {
    if (plan.action === "update") await client.clientTokens.update(existing.id, tokenFields);
    console.log(`${label}: client token ${plan.action === "update" ? "updated" : "unchanged"} ${existing.id} (value unchanged)`);
  } else {
    const created = await client.clientTokens.create({
      name: entry.tokenName,
      environment: "live",
      ...tokenFields,
    });
    tokenValue = created.token;
    for (const w of created.warnings) console.warn(`${label}: client token warning: ${w.message}`);
    console.log(`${label}: client token created ${created.clientToken.id}`);
  }

  output.push(`${entry.env.agentId}=${agent.agentId}`);
  if (tokenValue) output.push(`${entry.env.token}=${tokenValue}`);
}

if (!dryRun) {
  if (baseUrl) output.push(`VITE_RUNTYPE_API_URL=${baseUrl}`);
  console.log("\nSet these on the web app (hosting env + apps/web/.env.local):");
  for (const line of output) console.log(line);
}
