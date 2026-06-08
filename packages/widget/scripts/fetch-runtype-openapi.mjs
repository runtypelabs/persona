#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_OPENAPI_URL = "https://api.runtype.com/v1/openapi.json";
const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, "..");
const defaultOutput = resolve(packageRoot, "openapi/runtype-public-openapi.snapshot.json");

function parseArgs(argv) {
  const args = {
    url: process.env.RUNTYPE_OPENAPI_URL || DEFAULT_OPENAPI_URL,
    output: defaultOutput,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (arg === "--url") {
      args.url = argv[++i];
    } else if (arg === "--output") {
      args.output = resolve(argv[++i]);
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/fetch-runtype-openapi.mjs [--url URL] [--output FILE]\n\nDefault URL: ${DEFAULT_OPENAPI_URL}\nDefault output: ${defaultOutput}\n\nSet RUNTYPE_OPENAPI_URL to override the default source.`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.url) throw new Error("Missing OpenAPI URL");
  return args;
}

function assertContractShape(doc, source) {
  const requiredComponents = ["AgentSSEEvent", "FlowSSEEvent", "DispatchSSEEvent"];
  const requiredPaths = [
    "/v1/client/chat",
    "/v1/client/init",
    "/v1/client/resume",
    "/v1/client/feedback",
  ];

  if (!doc || typeof doc !== "object") {
    throw new Error(`OpenAPI response from ${source} was not a JSON object`);
  }
  if (!doc.openapi || !String(doc.openapi).startsWith("3.")) {
    throw new Error(`OpenAPI response from ${source} is missing an OpenAPI 3.x version`);
  }

  for (const name of requiredComponents) {
    if (!doc.components?.schemas?.[name]) {
      throw new Error(`OpenAPI response from ${source} is missing components.schemas.${name}`);
    }
  }

  for (const path of requiredPaths) {
    if (!doc.paths?.[path]?.post) {
      throw new Error(`OpenAPI response from ${source} is missing POST ${path}`);
    }
  }
}

const { url, output } = parseArgs(process.argv.slice(2));
const response = await fetch(url, { headers: { accept: "application/json" } });
if (!response.ok) {
  throw new Error(`Failed to fetch ${url}: HTTP ${response.status} ${response.statusText}`);
}

const doc = await response.json();
assertContractShape(doc, url);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(doc, null, 2)}\n`);
console.log(`Wrote ${output} from ${url}`);
