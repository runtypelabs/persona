import { demoSourceData } from "@/lib/demo-data";

export const channelOptions = ["Email", "Slack", "Webhook"] as const;
export const regionOptions = ["us", "eu", "hybrid"] as const;

export type Channel = (typeof channelOptions)[number];
export type Region = (typeof regionOptions)[number];

export type ImplementationRequestFormData = {
  projectName: string;
  contactEmail: string;
  launchDate: string;
  region: Region | "";
  channels: Channel[];
  summary: string;
  securityApproved: boolean;
  finalApprover: string;
};

export type FormFieldId = keyof ImplementationRequestFormData;
export type FormValue = ImplementationRequestFormData[FormFieldId];

export type FormFieldKind =
  | "text"
  | "email"
  | "date"
  | "textarea"
  | "select"
  | "multiselect"
  | "checkbox";

export type FormFieldDefinition = {
  id: FormFieldId;
  label: string;
  section: string;
  description: string;
  kind: FormFieldKind;
  aiWritable: boolean;
  placeholder?: string;
  options?: readonly string[];
};

export type AppliedPatch = {
  fieldId: FormFieldId;
  value: FormValue;
};

export type RejectedPatch = {
  fieldId: string;
  reason: string;
  value: unknown;
};

export type PatchApplicationResult = {
  nextState: ImplementationRequestFormData;
  applied: AppliedPatch[];
  rejected: RejectedPatch[];
};

const baseFormState: ImplementationRequestFormData = {
  projectName: "",
  contactEmail: "",
  launchDate: "",
  region: "",
  channels: [],
  summary: "",
  securityApproved: true,
  finalApprover: "Operations manager"
};

export const formFieldDefinitions: FormFieldDefinition[] = [
  {
    id: "projectName",
    label: "Project name",
    section: "Allowlisted fields",
    description: "Display name for the demo launch request.",
    kind: "text",
    aiWritable: true,
    placeholder: "Support Portal Launch"
  },
  {
    id: "contactEmail",
    label: "Contact email",
    section: "Allowlisted fields",
    description: "Where launch notifications should be sent.",
    kind: "email",
    aiWritable: true,
    placeholder: "launch-owner@example.com"
  },
  {
    id: "launchDate",
    label: "Launch date",
    section: "Allowlisted fields",
    description: "Planned go-live date for the demo request.",
    kind: "date",
    aiWritable: true
  },
  {
    id: "region",
    label: "Region",
    section: "Allowlisted fields",
    description: "Hosting region selected for the embedded assistant.",
    kind: "select",
    aiWritable: true,
    options: regionOptions
  },
  {
    id: "channels",
    label: "Channels",
    section: "Allowlisted fields",
    description: "Communication channels Persona is allowed to prefill.",
    kind: "multiselect",
    aiWritable: true,
    options: channelOptions
  },
  {
    id: "summary",
    label: "Summary",
    section: "Allowlisted fields",
    description: "Short description of what Persona is being used for.",
    kind: "textarea",
    aiWritable: true,
    placeholder:
      "Describe how Persona is embedded and what the local tools are allowed to do."
  },
  {
    id: "securityApproved",
    label: "Security approved",
    section: "Manual review",
    description: "Manual checkbox kept outside the AI allowlist.",
    kind: "checkbox",
    aiWritable: false,
  },
  {
    id: "finalApprover",
    label: "Final approver",
    section: "Manual review",
    description: "Manual approver that remains outside Persona's patch allowlist.",
    kind: "text",
    aiWritable: false,
    placeholder: "Operations manager"
  }
];

const definitionMap = Object.fromEntries(
  formFieldDefinitions.map((field) => [field.id, field])
) as Record<FormFieldId, FormFieldDefinition>;

export const allFormFieldIds = formFieldDefinitions.map(
  (field) => field.id
) as FormFieldId[];

export const aiWritableFieldIds = formFieldDefinitions
  .filter((field) => field.aiWritable)
  .map((field) => field.id);

export const manualReviewFieldIds = formFieldDefinitions
  .filter((field) => !field.aiWritable)
  .map((field) => field.id);

function validateTrimmedString(
  value: unknown,
  { maxLength = 200, allowEmpty = false }: { maxLength?: number; allowEmpty?: boolean } = {}
) {
  if (typeof value !== "string") {
    return { ok: false as const, reason: "must be a string" };
  }

  const next = value.trim();
  if (!allowEmpty && next.length === 0) {
    return { ok: false as const, reason: "cannot be empty" };
  }
  if (next.length > maxLength) {
    return { ok: false as const, reason: `must be ${maxLength} characters or less` };
  }

  return { ok: true as const, value: next };
}

function validateEmail(value: unknown) {
  const result = validateTrimmedString(value, { maxLength: 160 });
  if (!result.ok) return result;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.value)
    ? result
    : { ok: false as const, reason: "must be a valid email address" };
}

function validateDate(value: unknown) {
  const result = validateTrimmedString(value, { maxLength: 10 });
  if (!result.ok) return result;
  return /^\d{4}-\d{2}-\d{2}$/.test(result.value)
    ? result
    : { ok: false as const, reason: "must be in YYYY-MM-DD format" };
}

function validateSelect<T extends readonly string[]>(value: unknown, options: T) {
  const result = validateTrimmedString(value, { maxLength: 64 });
  if (!result.ok) return result;
  return options.includes(result.value)
    ? { ok: true as const, value: result.value as T[number] }
    : { ok: false as const, reason: "must be one of the allowlisted options" };
}

function validateStringArray<T extends readonly string[]>(value: unknown, options: T) {
  if (!Array.isArray(value)) {
    return { ok: false as const, reason: "must be an array of strings" };
  }

  const next = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (next.length === 0) {
    return { ok: false as const, reason: "must include at least one option" };
  }

  const invalid = next.find((entry) => !options.includes(entry));
  if (invalid) {
    return {
      ok: false as const,
      reason: `"${invalid}" is not in the allowlisted options`
    };
  }

  return {
    ok: true as const,
    value: Array.from(new Set(next)) as T[number][]
  };
}

function validateBoolean(value: unknown) {
  return typeof value === "boolean"
    ? { ok: true as const, value }
    : { ok: false as const, reason: "must be a boolean" };
}

const validators: Record<
  FormFieldId,
  (value: unknown) => { ok: true; value: FormValue } | { ok: false; reason: string }
> = {
  projectName: (value) => validateTrimmedString(value, { maxLength: 120 }),
  contactEmail: validateEmail,
  launchDate: validateDate,
  region: (value) => validateSelect(value, regionOptions),
  channels: (value) => validateStringArray(value, channelOptions),
  summary: (value) => validateTrimmedString(value, { maxLength: 400 }),
  securityApproved: validateBoolean,
  finalApprover: (value) => validateTrimmedString(value, { maxLength: 120 })
};

export function createInitialImplementationRequestForm(): ImplementationRequestFormData {
  return {
    ...baseFormState
  };
}

export function getFormFieldDefinition(fieldId: FormFieldId) {
  return definitionMap[fieldId];
}

export function getAiPrefillPreview() {
  return demoSourceData;
}

export function getSubmissionReadiness(
  formState: ImplementationRequestFormData
) {
  const missingManualFieldIds = manualReviewFieldIds.filter((fieldId) => {
    const value = formState[fieldId];
    return typeof value === "boolean"
      ? !value
      : String(value).trim().length === 0;
  });

  return {
    ready: missingManualFieldIds.length === 0,
    missingManualFieldIds,
    missingManualFieldLabels: missingManualFieldIds.map(
      (fieldId) => definitionMap[fieldId].label
    )
  };
}

export function applyImplementationRequestPatch(
  currentState: ImplementationRequestFormData,
  patch: Record<string, unknown>
): PatchApplicationResult {
  const nextState = { ...currentState };
  const applied: AppliedPatch[] = [];
  const rejected: RejectedPatch[] = [];

  for (const [fieldId, rawValue] of Object.entries(patch)) {
    if (!(fieldId in definitionMap)) {
      rejected.push({
        fieldId,
        reason: "field is not part of the implementation request registry",
        value: rawValue
      });
      continue;
    }

    const definition = definitionMap[fieldId as FormFieldId];
    if (!definition.aiWritable) {
      rejected.push({
        fieldId,
        reason: "field is intentionally human-review only",
        value: rawValue
      });
      continue;
    }

    const validation = validators[fieldId as FormFieldId](rawValue);
    if (!validation.ok) {
      rejected.push({
        fieldId,
        reason: validation.reason,
        value: rawValue
      });
      continue;
    }

    nextState[fieldId as FormFieldId] = validation.value as never;
    applied.push({
      fieldId: fieldId as FormFieldId,
      value: validation.value
    });
  }

  return {
    nextState,
    applied,
    rejected
  };
}

export function summarizeImplementationRequestForm(
  formState: ImplementationRequestFormData,
  submittedAt: string | null = null
) {
  const aiFilled = aiWritableFieldIds.filter((fieldId) => {
    const value = formState[fieldId];
    return Array.isArray(value)
      ? value.length > 0
      : typeof value === "boolean"
        ? value
        : value.trim().length > 0;
  });

  const pendingAiFields = aiWritableFieldIds.filter(
    (fieldId) => !aiFilled.includes(fieldId)
  );

  const manualReviewStatus = manualReviewFieldIds.map((fieldId) => ({
    fieldId,
    label: definitionMap[fieldId].label,
    completed:
      typeof formState[fieldId] === "boolean"
        ? Boolean(formState[fieldId])
        : String(formState[fieldId]).trim().length > 0
  }));
  const submission = getSubmissionReadiness(formState);

  return {
    aiFilledFields: aiFilled,
    pendingAiFields,
    manualReviewStatus,
    submittedAt,
    readyToSubmit: submission.ready,
    missingManualFieldIds: submission.missingManualFieldIds,
    missingManualFieldLabels: submission.missingManualFieldLabels,
    visibleValues: {
      projectName: formState.projectName,
      contactEmail: formState.contactEmail,
      launchDate: formState.launchDate,
      region: formState.region,
      channels: formState.channels,
      summary: formState.summary,
      securityApproved: formState.securityApproved,
      finalApprover: formState.finalApprover
    }
  };
}
