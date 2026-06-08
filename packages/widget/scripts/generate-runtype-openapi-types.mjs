#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, "..");
const defaultInput = resolve(packageRoot, "openapi/runtype-public-openapi.local.json");
const defaultOutput = resolve(packageRoot, "src/generated/runtype-openapi-contract.ts");

const exportedComponentNames = new Map([
  ["AgentSSEEvent", "RuntypeAgentSSEEvent"],
  ["FlowSSEEvent", "RuntypeFlowSSEEvent"],
  ["DispatchSSEEvent", "RuntypeDispatchSSEEvent"],
]);

function parseArgs(argv) {
  const args = {
    input: defaultInput,
    output: defaultOutput,
    check: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (arg === "--input") {
      args.input = resolve(argv[++i]);
    } else if (arg === "--output") {
      args.output = resolve(argv[++i]);
    } else if (arg === "--check") {
      args.check = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/generate-runtype-openapi-types.mjs [--input FILE] [--output FILE] [--check]\n\nDefault input: ${defaultInput}\nDefault output: ${defaultOutput}`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function refName(ref) {
  const prefix = "#/components/schemas/";
  if (!ref?.startsWith(prefix)) return null;
  return ref.slice(prefix.length);
}

function literal(value) {
  return JSON.stringify(value);
}

function isIdentifier(name) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}

function propertyKey(name) {
  return isIdentifier(name) ? name : literal(name);
}

function parenthesizeUnion(type) {
  return type.includes(" | ") ? `(${type})` : type;
}

function withNullable(type, nullable) {
  return nullable ? `${type} | null` : type;
}

function schemaToTs(schema, context = {}) {
  if (!schema || Object.keys(schema).length === 0) return "unknown";

  if (schema.$ref) {
    const name = refName(schema.$ref);
    if (name && exportedComponentNames.has(name)) return exportedComponentNames.get(name);
    return name ? `Runtype${name}` : "unknown";
  }

  if (Array.isArray(schema.enum)) {
    return schema.enum.map(literal).join(" | ");
  }

  if (Object.prototype.hasOwnProperty.call(schema, "const")) {
    return literal(schema.const);
  }

  if (schema.anyOf || schema.oneOf) {
    const variants = schema.anyOf || schema.oneOf;
    return variants.map((variant) => parenthesizeUnion(schemaToTs(variant, context))).join(" | ");
  }

  if (schema.allOf) {
    return schema.allOf.map((variant) => parenthesizeUnion(schemaToTs(variant, context))).join(" & ");
  }

  if (Array.isArray(schema.type)) {
    const nullable = schema.type.includes("null");
    const nonNullTypes = schema.type.filter((type) => type !== "null");
    if (nonNullTypes.length === 0) return "null";
    const nonNullSchema = { ...schema, type: nonNullTypes.length === 1 ? nonNullTypes[0] : nonNullTypes };
    return withNullable(schemaToTs(nonNullSchema, context), nullable);
  }

  switch (schema.type) {
    case "string":
      return "string";
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    case "array":
      return `Array<${schemaToTs(schema.items, context)}>`;
    case "object":
      return objectSchemaToTs(schema, context);
    case undefined:
      if (schema.properties || schema.additionalProperties) return objectSchemaToTs(schema, context);
      return "unknown";
    default:
      return "unknown";
  }
}

function objectSchemaToTs(schema, context) {
  const properties = schema.properties || {};
  const required = new Set(schema.required || []);
  const entries = Object.entries(properties);

  if (entries.length === 0) {
    if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
      return `Record<string, ${schemaToTs(schema.additionalProperties, context)}>`;
    }
    if (schema.additionalProperties === false) return "Record<string, never>";
    return "Record<string, unknown>";
  }

  const lines = ["{"];
  for (const [name, propertySchema] of entries) {
    const optional = required.has(name) ? "" : "?";
    lines.push(`  ${propertyKey(name)}${optional}: ${schemaToTs(propertySchema, context)};`);
  }

  if (schema.additionalProperties && schema.additionalProperties !== false) {
    const valueType = typeof schema.additionalProperties === "object"
      ? schemaToTs(schema.additionalProperties, context)
      : "unknown";
    lines.push(`  [key: string]: ${valueType};`);
  }

  lines.push("}");
  return lines.join("\n");
}

function requiredSchema(doc, path) {
  const cursor = path.split(".").reduce((value, key) => value?.[key], doc);
  if (!cursor) throw new Error(`OpenAPI snapshot is missing ${path}`);
  return cursor;
}

function requestSchema(doc, path) {
  return requiredSchema(doc, `paths.${path}.post.requestBody.content.application/json.schema`);
}

function jsonResponseSchema(doc, path, status) {
  return requiredSchema(doc, `paths.${path}.post.responses.${status}.content.application/json.schema`);
}

function streamResponseSchema(doc, path) {
  return requiredSchema(doc, `paths.${path}.post.responses.200.content.text/event-stream.itemSchema`);
}

function assertIssue3975Shape(doc) {
  const stepComplete = doc.components?.schemas?.FlowSSEEvent?.oneOf?.find((variant) => {
    const enumValue = variant?.properties?.type?.enum?.[0];
    const constValue = variant?.properties?.type?.const;
    return enumValue === "step_complete" || constValue === "step_complete";
  });

  const stopReasonEnum = stepComplete?.properties?.stopReason?.enum;
  const expected = ["end_turn", "max_tool_calls", "length", "content_filter", "error", "unknown"];
  if (!stopReasonEnum || expected.some((value) => !stopReasonEnum.includes(value))) {
    throw new Error("OpenAPI snapshot is missing FlowSSEEvent.step_complete.stopReason with the expected enum");
  }

  for (const path of ["/v1/client/chat", "/v1/client/init", "/v1/client/resume", "/v1/client/feedback"]) {
    if (!doc.paths?.[path]?.post) {
      throw new Error(`OpenAPI snapshot is missing POST ${path}`);
    }
  }
}

async function main() {
  const { input, output, check } = parseArgs(process.argv.slice(2));
  const doc = JSON.parse(await readFile(input, "utf8"));
  assertIssue3975Shape(doc);

  const generated = generate(doc, input);

  if (check) {
    const existing = existsSync(output) ? await readFile(output, "utf8") : "";
    if (existing !== generated) {
      console.error(`${output} is out of date. Run pnpm --filter @runtypelabs/persona generate:runtype-types.`);
      process.exit(1);
    }
    console.log(`${output} is up to date.`);
    return;
  }

  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, generated);
  console.log(`Wrote ${output}`);
}

function generate(doc, inputPath) {
  const sourceName = inputPath.replace(`${packageRoot}/`, "");
  const agent = requiredSchema(doc, "components.schemas.AgentSSEEvent");
  const flow = requiredSchema(doc, "components.schemas.FlowSSEEvent");
  const dispatch = requiredSchema(doc, "components.schemas.DispatchSSEEvent");

  const clientInitRequest = requestSchema(doc, "/v1/client/init");
  const clientInitResponse = jsonResponseSchema(doc, "/v1/client/init", "200");
  const clientChatRequest = requestSchema(doc, "/v1/client/chat");
  const clientChatStream = streamResponseSchema(doc, "/v1/client/chat");
  const clientResumeRequest = requestSchema(doc, "/v1/client/resume");
  const clientResumeStream = streamResponseSchema(doc, "/v1/client/resume");
  const clientFeedbackRequest = requestSchema(doc, "/v1/client/feedback");
  const clientFeedbackResponse = jsonResponseSchema(doc, "/v1/client/feedback", "200");

  return `/* eslint-disable */\n// @generated by packages/widget/scripts/generate-runtype-openapi-types.mjs\n// Source: ${sourceName}\n//\n// Refresh the source snapshot from the public Runtype OpenAPI endpoint with:\n//   pnpm --filter @runtypelabs/persona fetch:runtype-openapi\n// Then regenerate this file with:\n//   pnpm --filter @runtypelabs/persona generate:runtype-types\n\nexport type RuntypeAgentSSEEvent = ${schemaToTs(agent)};\n\nexport type RuntypeFlowSSEEvent = ${schemaToTs(flow)};\n\nexport type RuntypeDispatchSSEEvent = ${schemaToTs(dispatch)};\n\nexport type RuntypeStreamEventOf<U, T extends string> = Extract<U, { type: T }>;\n\nexport type RuntypeAgentTurnCompleteEvent = RuntypeStreamEventOf<\n  RuntypeAgentSSEEvent,\n  "agent_turn_complete"\n>;\n\nexport type RuntypeStepCompleteEvent = RuntypeStreamEventOf<\n  RuntypeFlowSSEEvent,\n  "step_complete"\n>;\n\nexport type RuntypeStopReasonKind = NonNullable<\n  RuntypeAgentTurnCompleteEvent["stopReason"] | RuntypeStepCompleteEvent["stopReason"]\n>;\n\nexport type RuntypeClientInitRequest = ${schemaToTs(clientInitRequest)};\n\nexport type RuntypeClientInitResponse = ${schemaToTs(clientInitResponse)};\n\nexport type RuntypeClientChatRequest = ${schemaToTs(clientChatRequest)};\n\nexport type RuntypeClientChatStreamEvent = ${schemaToTs(clientChatStream)};\n\nexport type RuntypeClientResumeRequest = ${schemaToTs(clientResumeRequest)};\n\nexport type RuntypeClientResumeStreamEvent = ${schemaToTs(clientResumeStream)};\n\nexport type RuntypeClientFeedbackRequest = ${schemaToTs(clientFeedbackRequest)};\n\nexport type RuntypeClientFeedbackResponse = ${schemaToTs(clientFeedbackResponse)};\n\nexport type RuntypeClientFeedbackType = RuntypeClientFeedbackRequest["type"];\n`;
}

await main();
