// WebMCP tool surface for the On-device Intake demo — exactly three tools:
//
//   • set_fields   — ONE batched write. This is the whole demo: a single call
//                    fills every value the model extracted. Per-field tools would
//                    blow the small model's tool-round budget. The set_fields
//                    JSON schema is DERIVED from the field catalog (form.ts), so
//                    the schema and the form can never drift.
//   • reset_form   — approval-gated (destructive): clears the whole form.
//   • submit_claim — approval-gated: files the claim, but only if every required
//                    field is present.
//
// set_fields returns a TINY receipt (which ids landed, which were rejected, and
// what's still missing) — NEVER the form contents, so the model's context stays
// small and it never re-reads values back to itself.

import {
  FIELD_BY_ID,
  FIELD_CATALOG,
  type FieldDef,
  type IntakeForm,
} from "./form";

const OWNER = "__webmcpIntakeAbort";

declare global {
  interface Window {
    [OWNER]?: AbortController;
  }
}

// Only the destructive / terminal tools raise Persona's approval bubble; the
// batched set_fields auto-approves so the form fills live as the user talks.
export const APPROVAL_REQUIRED_TOOL_NAMES = new Set(["reset_form", "submit_claim"]);

type ToolDescriptor = {
  name: string;
  title?: string;
  description: string;
  inputSchema: object;
  annotations?: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => unknown | Promise<unknown>;
};

type RegisterableModelContext = {
  registerTool: (tool: ToolDescriptor, options?: { signal?: AbortSignal }) => void;
};

const getModelContext = (): RegisterableModelContext | undefined =>
  (document as unknown as { modelContext?: RegisterableModelContext }).modelContext ??
  (navigator as unknown as { modelContext?: RegisterableModelContext }).modelContext;

const toolResult = (data: unknown, summary?: string): unknown => ({
  content: [
    {
      type: "text",
      text: `${summary ? `${summary}\n\n` : ""}${JSON.stringify(data, null, 2)}`,
    },
  ],
  structuredContent: data,
});

/** One property schema per field, for the `set_fields` `values` object. */
function fieldSchema(field: FieldDef): Record<string, unknown> {
  switch (field.type) {
    case "boolean":
      return { type: "boolean", description: field.toolDescription };
    case "enum":
      return { type: "string", enum: [...(field.enum ?? [])], description: field.toolDescription };
    case "date":
      return { type: "string", description: `${field.toolDescription} Format: YYYY-MM-DD.` };
    case "time":
      return { type: "string", description: `${field.toolDescription} Format: HH:MM 24-hour.` };
    default:
      return { type: "string", description: field.toolDescription };
  }
}

const VALUES_PROPERTIES = Object.fromEntries(
  FIELD_CATALOG.map((f) => [f.id, fieldSchema(f)]),
);

export function setupIntakeTools(form: IntakeForm): void {
  const modelContext = getModelContext();
  if (!modelContext) {
    console.warn("[Intake] document.modelContext unavailable; tools not registered");
    return;
  }

  window[OWNER]?.abort();
  const controller = new AbortController();
  window[OWNER] = controller;
  const { signal } = controller;

  const tools: ToolDescriptor[] = [
    {
      name: "set_fields",
      title: "Fill claim fields",
      description:
        "Fill one or more claim-form fields in a single call. Pass a `values` object with one property per field you extracted, keyed by the exact field id, using only values the user actually stated. Omit any field the user did not mention. Bad values (wrong enum, malformed date/time) are rejected per field and reported back; the rest are still written.",
      inputSchema: {
        type: "object",
        properties: {
          values: {
            type: "object",
            description: "Field id → extracted value. Include only fields you have a stated value for.",
            properties: VALUES_PROPERTIES,
            additionalProperties: false,
          },
        },
        required: ["values"],
        additionalProperties: false,
      },
      execute: (args) => {
        const values = (args.values ?? {}) as Record<string, unknown>;
        const updated: string[] = [];
        const rejected: Array<{ field: string; reason: string }> = [];
        for (const [id, raw] of Object.entries(values)) {
          if (raw === null || raw === undefined || raw === "") continue;
          if (!FIELD_BY_ID.has(id)) {
            rejected.push({ field: id, reason: "unknown field" });
            continue;
          }
          const res = form.set(id, raw, "tool");
          if (res.ok) updated.push(id);
          else rejected.push({ field: id, reason: res.error ?? "invalid" });
        }
        // Receipt only — never the form values.
        return toolResult(
          { updated, rejected, missingRequired: form.missingRequired() },
          `Updated ${updated.length} field(s)${rejected.length ? `, rejected ${rejected.length}` : ""}.`,
        );
      },
    },
    {
      name: "reset_form",
      title: "Reset the form",
      description:
        "Clear every field and start the claim over. Asks the user for confirmation first.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { destructiveHint: true },
      execute: () => {
        form.reset();
        return toolResult({ ok: true }, "Form reset to empty.");
      },
    },
    {
      name: "submit_claim",
      title: "Submit the claim",
      description:
        "File the claim. Only call this once every required field is present and the user has confirmed the details are correct. If any required field is still missing, submission is blocked and the missing fields are returned instead.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: {},
      execute: () => {
        const res = form.submit();
        if (!res.ok) {
          return toolResult(
            { error: "Cannot submit — required fields are missing.", missingRequired: res.missingRequired },
            "Submission blocked: required fields are missing.",
          );
        }
        return toolResult({ claimId: res.claimId }, `Claim submitted: ${res.claimId}.`);
      },
    },
  ];

  for (const tool of tools) {
    try {
      const descriptor = tool.title
        ? { ...tool, annotations: { title: tool.title, ...tool.annotations } }
        : tool;
      modelContext.registerTool(descriptor, { signal });
    } catch (error) {
      console.warn(`[Intake] Failed to register ${tool.name}`, error);
    }
  }
}
