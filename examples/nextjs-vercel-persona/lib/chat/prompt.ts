import { demoRoutes } from "@/lib/demo-routes";

type SerializableRecord = Record<string, unknown>;

export type PersonaPromptContext = {
  pageTitle?: string;
  pagePath?: string;
  pageContext?: string;
  sourceData?: SerializableRecord;
  formSummary?: SerializableRecord;
  capabilities?: SerializableRecord;
  lastLocalActionResult?: SerializableRecord | null;
};

const assistantRules = [
  "You are Persona, embedded inside a generic Next.js demo app.",
  "You must return exactly one JSON object and nothing else.",
  "Valid actions are: message, navigate_to_route, prefill_form, submit_form.",
  "Only use route IDs listed in the capability manifest.",
  "Only prefill allowlisted field IDs from the capability manifest.",
  "Only use submit_form when the capability manifest says it is enabled.",
  "Never invent URLs, selectors, hidden tools, or arbitrary browser actions.",
  "submit_form is sensitive and the client will always require approval before it runs.",
  "When navigation is required, navigate first and let the client continue the loop on the destination page.",
  "After prefill_form succeeds, prefer a follow-up message that explains what is still manual or what the next step is."
].join("\n");

function stringifyContext(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

export function buildGatewayPrompt(
  messages: Array<{ role: string; content: string }>,
  context: PersonaPromptContext
) {
  const transcript = messages
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n");

  return `
${assistantRules}

Workspace routes:
- ${demoRoutes.home.id}: ${demoRoutes.home.path}
- ${demoRoutes.demo_form.id}: ${demoRoutes.demo_form.path}

Current page title:
${context.pageTitle ?? "Unknown"}

Current page path:
${context.pagePath ?? "Unknown"}

Visible page summary:
${context.pageContext ?? "Unavailable"}

Visible source data JSON:
${stringifyContext(context.sourceData)}

Implementation request summary JSON:
${stringifyContext(context.formSummary)}

Capability manifest JSON:
${stringifyContext(context.capabilities)}

Last hidden local action result JSON:
${stringifyContext(context.lastLocalActionResult)}

Conversation transcript:
${transcript}

Return a single JSON object in one of these forms:
{"action":"message","text":"..."}
{"action":"navigate_to_route","routeId":"demo_form","text":"..."}
{"action":"prefill_form","patch":{"projectName":"..."},"text":"..."}
{"action":"submit_form","text":"..."}
  `.trim();
}

export function buildRuntypeSystemPrompt() {
  return `
${assistantRules}

Workspace routes:
- ${demoRoutes.home.id}: ${demoRoutes.home.path}
- ${demoRoutes.demo_form.id}: ${demoRoutes.demo_form.path}

Current page title:
{{pageTitle}}

Current page path:
{{pagePath}}

Visible page summary:
{{pageContext}}

Visible source data JSON:
{{sourceDataJson}}

Implementation request summary JSON:
{{formSummaryJson}}

Capability manifest JSON:
{{capabilitiesJson}}

Last hidden local action result JSON:
{{lastLocalActionResultJson}}

Return a single JSON object in one of these forms:
{"action":"message","text":"..."}
{"action":"navigate_to_route","routeId":"demo_form","text":"..."}
{"action":"prefill_form","patch":{"projectName":"..."},"text":"..."}
{"action":"submit_form","text":"..."}
  `.trim();
}
