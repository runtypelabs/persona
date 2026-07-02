// Field catalog + form-state store + DOM renderer for the On-device Intake demo.
//
// FIELD_CATALOG is the SINGLE SOURCE OF TRUTH. Three consumers derive from it and
// must never drift apart:
//   • this file's renderer builds the form DOM from it,
//   • tools.ts derives the `set_fields` JSON schema from it,
//   • main.ts serializes a compact view of it into the model's page context.
// Add or change a field here and all three follow automatically.

export type FieldType = "string" | "textarea" | "date" | "time" | "enum" | "boolean";
export type FieldValue = string | boolean;
export type FieldSource = "tool" | "human";

export interface FieldDef {
  id: string;
  label: string;
  section: string;
  type: FieldType;
  required: boolean;
  /** Allowed values for `enum` fields (also the <select> option list). */
  enum?: readonly string[];
  placeholder?: string;
  /** One-line, model-facing description used in the `set_fields` tool schema. */
  toolDescription: string;
}

export const SECTIONS = [
  "Your details",
  "Incident",
  "Vehicles",
  "Damage & injuries",
] as const;

export const INSURERS = [
  "Geico",
  "State Farm",
  "Progressive",
  "Allstate",
  "USAA",
  "Other",
  "Uninsured",
] as const;

export const DAMAGE_AREAS = [
  "front",
  "rear",
  "driver-side",
  "passenger-side",
  "multiple",
] as const;

// Deterministic (not random) so the demo's success screen is reproducible.
export const CLAIM_ID = "CLM-2026-0042";

export const FIELD_CATALOG: readonly FieldDef[] = [
  // Your details
  {
    id: "full_name",
    label: "Full name",
    section: "Your details",
    type: "string",
    required: true,
    placeholder: "Jane Doe",
    toolDescription: "The claimant's full name, copied verbatim.",
  },
  {
    id: "phone",
    label: "Phone",
    section: "Your details",
    type: "string",
    required: true,
    placeholder: "(555) 123-4567",
    toolDescription: "The claimant's phone number, copied verbatim.",
  },
  {
    id: "email",
    label: "Email",
    section: "Your details",
    type: "string",
    required: true,
    placeholder: "jane@example.com",
    toolDescription: "The claimant's email address, copied verbatim.",
  },
  {
    id: "policy_number",
    label: "Policy number",
    section: "Your details",
    type: "string",
    required: true,
    placeholder: "AZ-4491028",
    toolDescription: "The claimant's insurance policy number, copied verbatim.",
  },
  // Incident
  {
    id: "incident_date",
    label: "Date of incident",
    section: "Incident",
    type: "date",
    required: true,
    toolDescription:
      "Date the incident occurred, resolved to an absolute date from today's date in the form state.",
  },
  {
    id: "incident_time",
    label: "Time of incident",
    section: "Incident",
    type: "time",
    required: false,
    toolDescription: "Time the incident occurred, 24-hour clock.",
  },
  {
    id: "location",
    label: "Location",
    section: "Incident",
    type: "string",
    required: true,
    placeholder: "Grocery store lot, 5th & Main",
    toolDescription: "Where the incident happened (an address or place description).",
  },
  {
    id: "description",
    label: "What happened",
    section: "Incident",
    type: "textarea",
    required: true,
    placeholder: "Describe the incident in a sentence or two…",
    toolDescription: "A short, factual description of how the incident happened.",
  },
  // Vehicles
  {
    id: "your_vehicle",
    label: "Your vehicle",
    section: "Vehicles",
    type: "string",
    required: true,
    placeholder: "2022 Honda Civic",
    toolDescription: "The claimant's vehicle as year make model.",
  },
  {
    id: "license_plate",
    label: "License plate",
    section: "Vehicles",
    type: "string",
    required: false,
    placeholder: "8XYZ123",
    toolDescription: "The claimant's license plate, copied verbatim.",
  },
  {
    id: "other_driver_name",
    label: "Other driver",
    section: "Vehicles",
    type: "string",
    required: false,
    placeholder: "Dana Ruiz",
    toolDescription: "The other driver's full name, copied verbatim.",
  },
  {
    id: "other_driver_insurer",
    label: "Other driver's insurer",
    section: "Vehicles",
    type: "enum",
    required: false,
    enum: INSURERS,
    toolDescription:
      "The other driver's insurance company; use Other if named but not listed, Uninsured if they had none.",
  },
  {
    id: "other_vehicle",
    label: "Other vehicle",
    section: "Vehicles",
    type: "string",
    required: false,
    placeholder: "Blue Ford F-150",
    toolDescription: "The other party's vehicle description.",
  },
  // Damage & injuries
  {
    id: "damage_area",
    label: "Damage area",
    section: "Damage & injuries",
    type: "enum",
    required: true,
    enum: DAMAGE_AREAS,
    toolDescription: "Which part of the claimant's vehicle was damaged.",
  },
  {
    id: "anyone_injured",
    label: "Anyone injured?",
    section: "Damage & injuries",
    type: "boolean",
    required: true,
    toolDescription: "Whether anyone was injured in the incident (true or false).",
  },
  {
    id: "police_report_filed",
    label: "Police report filed?",
    section: "Damage & injuries",
    type: "boolean",
    required: false,
    toolDescription: "Whether a police report was filed (true or false).",
  },
];

export const FIELD_BY_ID: ReadonlyMap<string, FieldDef> = new Map(
  FIELD_CATALOG.map((f) => [f.id, f]),
);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Validate + normalize one raw value against its field. The single gate that
 * both human input and the model's `set_fields` call pass through, so a bad
 * enum / malformed date is rejected identically wherever it comes from.
 */
export function validateValue(
  field: FieldDef,
  raw: unknown,
): { value?: FieldValue; error?: string } {
  switch (field.type) {
    case "boolean": {
      if (typeof raw === "boolean") return { value: raw };
      if (typeof raw === "string") {
        const s = raw.trim().toLowerCase();
        if (["true", "yes", "y", "1"].includes(s)) return { value: true };
        if (["false", "no", "n", "0"].includes(s)) return { value: false };
      }
      return { error: "expected true or false" };
    }
    case "enum": {
      const s = String(raw).trim();
      const match = field.enum?.find((e) => e.toLowerCase() === s.toLowerCase());
      return match
        ? { value: match }
        : { error: `must be one of: ${field.enum?.join(", ")}` };
    }
    case "date": {
      const s = String(raw).trim();
      if (!DATE_RE.test(s)) return { error: "expected date as YYYY-MM-DD" };
      if (Number.isNaN(new Date(`${s}T00:00:00`).getTime())) {
        return { error: "not a valid calendar date" };
      }
      return { value: s };
    }
    case "time": {
      const s = String(raw).trim();
      return TIME_RE.test(s)
        ? { value: s }
        : { error: "expected time as HH:MM (24-hour)" };
    }
    default: {
      const s = String(raw).trim();
      return s ? { value: s } : { error: "empty" };
    }
  }
}

/**
 * The claim form's state. Shared by human gestures (the rendered inputs) and the
 * agent (the `set_fields` tool). Tracks which fields the model filled so the
 * renderer can badge them, and clears that badge the moment a human edits.
 */
export class IntakeForm {
  private values = new Map<string, FieldValue>();
  private aiFilled = new Set<string>();
  private listeners = new Set<() => void>();
  submitted = false;
  claimId: string | null = null;

  get(id: string): FieldValue | undefined {
    return this.values.get(id);
  }

  isAiField(id: string): boolean {
    return this.aiFilled.has(id);
  }

  /**
   * Write a validated value. Rejects (without mutating) on bad input. `source`
   * drives the AI badge: a tool write sets it, a human write clears it.
   */
  set(id: string, raw: unknown, source: FieldSource): { ok: boolean; error?: string } {
    const field = FIELD_BY_ID.get(id);
    if (!field) return { ok: false, error: `unknown field "${id}"` };
    const { value, error } = validateValue(field, raw);
    if (error || value === undefined) return { ok: false, error: error ?? "invalid" };
    this.values.set(id, value);
    if (source === "tool") this.aiFilled.add(id);
    else this.aiFilled.delete(id);
    this.notify();
    return { ok: true };
  }

  clear(id: string): void {
    this.values.delete(id);
    this.aiFilled.delete(id);
    this.notify();
  }

  reset(): void {
    this.values.clear();
    this.aiFilled.clear();
    this.submitted = false;
    this.claimId = null;
    this.notify();
  }

  private hasValue(id: string): boolean {
    const v = this.values.get(id);
    return v !== undefined && v !== "";
  }

  missingRequired(): string[] {
    return FIELD_CATALOG.filter((f) => f.required && !this.hasValue(f.id)).map(
      (f) => f.id,
    );
  }

  isValid(): boolean {
    return this.missingRequired().length === 0;
  }

  requiredTotal(): number {
    return FIELD_CATALOG.filter((f) => f.required).length;
  }

  requiredComplete(): number {
    return this.requiredTotal() - this.missingRequired().length;
  }

  /** Mark the claim submitted iff every required field is present. */
  submit(): { ok: boolean; claimId?: string; missingRequired?: string[] } {
    const missing = this.missingRequired();
    if (missing.length) return { ok: false, missingRequired: missing };
    this.submitted = true;
    this.claimId = CLAIM_ID;
    this.notify();
    return { ok: true, claimId: CLAIM_ID };
  }

  /** Current values as a plain object, for the model's page context. */
  snapshotValues(): Record<string, FieldValue> {
    return Object.fromEntries(this.values);
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }
}

// ── Renderer ────────────────────────────────────────────────────────────────

interface FieldRefs {
  wrapper: HTMLElement;
  badge: HTMLElement;
  setValue: (v: FieldValue | undefined) => void;
  isFocused: () => boolean;
}

/**
 * Render the form from the catalog and keep it two-way bound to the store. Human
 * edits write back through `form.set(…, "human")`; a subscription syncs the DOM
 * whenever the store changes (from a human edit elsewhere OR a tool write),
 * flashing a highlight + showing an "AI" badge on fields the model just filled.
 * Updates are surgical (never a full re-render) so a field the user is typing in
 * is never clobbered mid-edit.
 */
export function renderIntakeForm(root: HTMLElement, form: IntakeForm): void {
  root.innerHTML = "";
  const refs = new Map<string, FieldRefs>();
  const prevValue = new Map<string, FieldValue | undefined>();

  const formEl = document.createElement("div");
  formEl.className = "intake-form";

  for (const section of SECTIONS) {
    const sec = document.createElement("section");
    sec.className = "intake-section";
    const title = document.createElement("h2");
    title.className = "intake-section-title";
    title.textContent = section;
    sec.appendChild(title);
    const grid = document.createElement("div");
    grid.className = "intake-grid";
    for (const field of FIELD_CATALOG.filter((f) => f.section === section)) {
      grid.appendChild(buildField(field, form, refs));
    }
    sec.appendChild(grid);
    formEl.appendChild(sec);
  }

  const footer = document.createElement("div");
  footer.className = "intake-footer";
  const progress = document.createElement("span");
  progress.className = "intake-progress";
  const submit = document.createElement("button");
  submit.type = "button";
  submit.className = "intake-submit";
  submit.textContent = "Submit claim";
  submit.addEventListener("click", () => form.submit());
  footer.append(progress, submit);
  formEl.appendChild(footer);

  const success = document.createElement("div");
  success.className = "intake-success";
  success.hidden = true;

  root.append(formEl, success);

  const sync = (): void => {
    if (form.submitted) {
      formEl.hidden = true;
      success.hidden = false;
      success.innerHTML = `
        <div class="intake-success-check" aria-hidden="true">&#10003;</div>
        <h2>Claim submitted</h2>
        <p>Your First Notice of Loss has been recorded.</p>
        <p class="intake-claimid">Claim ID <strong>${form.claimId}</strong></p>
        <button type="button" class="intake-restart">Start a new claim</button>`;
      (success.querySelector(".intake-restart") as HTMLButtonElement).onclick = () =>
        form.reset();
      return;
    }
    formEl.hidden = false;
    success.hidden = true;

    for (const field of FIELD_CATALOG) {
      const ref = refs.get(field.id);
      if (!ref) continue;
      const val = form.get(field.id);
      if (!ref.isFocused()) ref.setValue(val);
      const isAi = form.isAiField(field.id);
      ref.badge.hidden = !isAi;
      if (isAi && val !== undefined && val !== prevValue.get(field.id)) {
        ref.wrapper.classList.remove("intake-just-filled");
        void ref.wrapper.offsetWidth; // reflow so the animation restarts
        ref.wrapper.classList.add("intake-just-filled");
      }
      prevValue.set(field.id, val);
    }

    progress.textContent = `${form.requiredComplete()} of ${form.requiredTotal()} required fields complete`;
    submit.disabled = !form.isValid();
  };

  form.subscribe(sync);
  sync();
}

function buildField(
  field: FieldDef,
  form: IntakeForm,
  refs: Map<string, FieldRefs>,
): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = `intake-field intake-field-${field.type}`;

  const labelRow = document.createElement("div");
  labelRow.className = "intake-label-row";
  const label = document.createElement("label");
  label.className = "intake-label";
  label.textContent = field.label;
  if (field.required) {
    const req = document.createElement("span");
    req.className = "intake-req";
    req.textContent = "*";
    req.title = "Required";
    label.appendChild(req);
  }
  const badge = document.createElement("span");
  badge.className = "intake-ai-badge";
  badge.textContent = "AI";
  badge.title = "Filled by the on-device model — edit to override";
  badge.hidden = true;
  labelRow.append(label, badge);
  wrapper.appendChild(labelRow);

  const controlId = `field-${field.id}`;
  label.htmlFor = controlId;

  let setValue: (v: FieldValue | undefined) => void;
  let isFocused: () => boolean;

  if (field.type === "boolean") {
    const group = document.createElement("div");
    group.className = "intake-bool";
    const makeBtn = (val: boolean, text: string): HTMLButtonElement => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "intake-bool-btn";
      b.textContent = text;
      b.addEventListener("click", () => form.set(field.id, val, "human"));
      return b;
    };
    const yes = makeBtn(true, "Yes");
    const no = makeBtn(false, "No");
    group.append(yes, no);
    wrapper.appendChild(group);
    setValue = (v) => {
      yes.classList.toggle("is-on", v === true);
      no.classList.toggle("is-on", v === false);
    };
    isFocused = () => false;
  } else if (field.type === "enum") {
    const sel = document.createElement("select");
    sel.id = controlId;
    sel.className = "intake-control";
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "—";
    sel.appendChild(blank);
    for (const opt of field.enum ?? []) {
      const o = document.createElement("option");
      o.value = opt;
      o.textContent = opt;
      sel.appendChild(o);
    }
    sel.addEventListener("change", () => {
      if (sel.value) form.set(field.id, sel.value, "human");
      else form.clear(field.id);
    });
    wrapper.appendChild(sel);
    setValue = (v) => {
      sel.value = typeof v === "string" ? v : "";
    };
    isFocused = () => document.activeElement === sel;
  } else if (field.type === "textarea") {
    const ta = document.createElement("textarea");
    ta.id = controlId;
    ta.className = "intake-control";
    ta.rows = 3;
    if (field.placeholder) ta.placeholder = field.placeholder;
    ta.addEventListener("input", () => {
      if (ta.value.trim()) form.set(field.id, ta.value, "human");
      else form.clear(field.id);
    });
    wrapper.appendChild(ta);
    setValue = (v) => {
      ta.value = typeof v === "string" ? v : "";
    };
    isFocused = () => document.activeElement === ta;
  } else {
    const input = document.createElement("input");
    input.id = controlId;
    input.className = "intake-control";
    input.type = field.type === "date" ? "date" : field.type === "time" ? "time" : "text";
    if (field.placeholder) input.placeholder = field.placeholder;
    input.addEventListener("input", () => {
      if (input.value.trim()) form.set(field.id, input.value, "human");
      else form.clear(field.id);
    });
    wrapper.appendChild(input);
    setValue = (v) => {
      input.value = typeof v === "string" ? v : "";
    };
    isFocused = () => document.activeElement === input;
  }

  refs.set(field.id, { wrapper, badge, setValue, isFocused });
  return wrapper;
}
