import type { ComponentRenderer, ComponentContext } from "@runtypelabs/persona";
import { renderLucideIcon } from "@runtypelabs/persona";
import { getUserAction, setUserAction } from "./user-action-store";

/**
 * ProductCard component - displays product information
 */
export const ProductCard: ComponentRenderer = (props, context) => {
  const card = document.createElement("div");
  card.className = "product-card";
  card.style.cssText = `
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 1.5rem;
    background: white;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    max-width: 400px;
    margin: 1rem 0;
  `;

  const title = String(props.title || "Product Name");
  const price = typeof props.price === "number" ? props.price : 0;
  const image = String(props.image || "");
  const description = String(props.description || "");

  card.innerHTML = `
    ${image ? `<img src="${image}" alt="${title}" style="width: 100%; height: 200px; object-fit: cover; border-radius: 4px; margin-bottom: 1rem;" />` : ""}
    <h3 style="margin: 0 0 0.5rem 0; color: #333; font-size: 1.25rem;">${title}</h3>
    ${description ? `<p style="margin: 0 0 1rem 0; color: #666; font-size: 0.9rem;">${description}</p>` : ""}
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <span style="font-size: 1.5rem; font-weight: bold; color: #2196f3;">$${price.toFixed(2)}</span>
      <button style="
        background: #2196f3;
        color: white;
        border: none;
        padding: 0.5rem 1rem;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.9rem;
      ">Add to Cart</button>
    </div>
  `;

  return card;
};

/**
 * SimpleChart component - displays a basic bar chart
 */
export const SimpleChart: ComponentRenderer = (props, context) => {
  const chart = document.createElement("div");
  chart.className = "simple-chart";
  chart.style.cssText = `
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 1.5rem;
    background: white;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    max-width: 500px;
    margin: 1rem 0;
  `;

  const title = String(props.title || "Chart");
  const data = Array.isArray(props.data) ? props.data : [];
  const labels = Array.isArray(props.labels) ? props.labels : [];

  // Calculate max value for scaling
  const maxValue = data.length > 0 
    ? Math.max(...(data as number[]).map(v => typeof v === "number" ? v : 0))
    : 100;

  chart.innerHTML = `
    <h3 style="margin: 0 0 1rem 0; color: #333; font-size: 1.25rem;">${title}</h3>
    <div style="display: flex; align-items: flex-end; gap: 0.5rem; height: 200px; border-bottom: 2px solid #e0e0e0;">
      ${data.map((value, index) => {
        const numValue = typeof value === "number" ? value : 0;
        const height = (numValue / maxValue) * 100;
        const label = labels[index] || `Item ${index + 1}`;
        return `
          <div style="flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%;">
            <div style="
              width: 100%;
              background: linear-gradient(to top, #2196f3, #64b5f6);
              height: ${height}%;
              min-height: ${height > 0 ? "4px" : "0"};
              border-radius: 4px 4px 0 0;
              margin-bottom: 0.5rem;
              transition: height 0.3s ease;
            "></div>
            <div style="font-size: 0.75rem; color: #666; text-align: center; transform: rotate(-45deg); transform-origin: center; white-space: nowrap;">
              ${label}
            </div>
            <div style="font-size: 0.8rem; font-weight: bold; color: #333; margin-top: 0.25rem;">
              ${numValue}
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;

  return chart;
};

/**
 * StatusBadge component - displays a status badge with color coding
 */
export const StatusBadge: ComponentRenderer = (props, context) => {
  const badge = document.createElement("div");
  badge.className = "status-badge";
  
  const status = String(props.status || "unknown").toLowerCase();
  const message = String(props.message || status);
  
  const colorMap: Record<string, string> = {
    success: "#4caf50",
    error: "#f44336",
    warning: "#ff9800",
    info: "#2196f3",
    pending: "#9e9e9e"
  };
  
  const color = colorMap[status] || colorMap.info;
  
  badge.style.cssText = `
    display: inline-block;
    padding: 0.5rem 1rem;
    border-radius: 20px;
    background: ${color}20;
    color: ${color};
    border: 1px solid ${color};
    font-size: 0.9rem;
    font-weight: 500;
    margin: 0.5rem 0;
  `;
  
  badge.textContent = message;
  
  return badge;
};

/**
 * InfoCard component - displays information in a card format
 */
export const InfoCard: ComponentRenderer = (props, context) => {
  const card = document.createElement("div");
  card.className = "info-card";
  card.style.cssText = `
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 1.5rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    max-width: 400px;
    margin: 1rem 0;
  `;

  const title = String(props.title || "Information");
  const content = String(props.content || "");
  const icon = String(props.icon || "ℹ️");

  card.innerHTML = `
    <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
      <span style="font-size: 2rem;">${icon}</span>
      <h3 style="margin: 0; font-size: 1.5rem;">${title}</h3>
    </div>
    ${content ? `<p style="margin: 0; line-height: 1.6; opacity: 0.95;">${content}</p>` : ""}
  `;

  return card;
};

/**
 * Convention used by interactive renderers in this example app:
 * when a renderer captures a user-finalized action against an assistant
 * message (form submit, vote, approve/deny, quiz answer, …), it persists
 * a `userAction` record keyed by `context.message.id`. On subsequent
 * renders (e.g. after page reload) the renderer reads that record and
 * restores the post-action state instead of re-prompting.
 *
 * Schema: `{ type: string, data: unknown, completedAt: string }`.
 * See `./user-action-store.ts` for the storage helpers and full docs.
 */

/**
 * Field definition for DynamicForm
 */
interface FormField {
  label: string;
  name?: string;
  type?: "text" | "email" | "tel" | "date" | "time" | "textarea" | "number" | "url";
  placeholder?: string;
  required?: boolean;
  helper_text?: string;
  helperText?: string;
  sensitive?: boolean;
  autocomplete?: string;
  /** Layout width within the form grid. "half" pairs side-by-side with another half. Default "full". */
  width?: "full" | "half";
}

/**
 * Style overrides for DynamicForm
 * Can be passed via config.formStyles or as props.styles
 */
export interface DynamicFormStyles {
  margin?: string;
  borderRadius?: string;
  borderWidth?: string;
  borderColor?: string;
  border?: string;
  padding?: string;
  maxWidth?: string;
  boxShadow?: string;
  titleFontSize?: string;
  titleFontWeight?: string;
  descriptionFontSize?: string;
  labelFontSize?: string;
  labelFontWeight?: string;
  inputFontSize?: string;
  inputPadding?: string;
  inputBorderRadius?: string;
  inputBorder?: string;
  buttonPadding?: string;
  buttonBorderRadius?: string;
  buttonFontSize?: string;
  buttonFontWeight?: string;
  successAccentColor?: string;
  errorColor?: string;
  helperFontSize?: string;
  successCardPadding?: string;
}

const FIELD_NAME_HEURISTICS: Array<[RegExp, string, string]> = [
  // [regex, autocomplete token, inputmode]
  [/email/i, "email", "email"],
  [/phone|mobile|tel/i, "tel", "tel"],
  [/(first[\s_]?name|given[\s_]?name)/i, "given-name", "text"],
  [/(last[\s_]?name|family[\s_]?name|surname)/i, "family-name", "text"],
  [/(full[\s_]?name|^name$)/i, "name", "text"],
  [/company|organization|org/i, "organization", "text"],
  [/(zip|postal)/i, "postal-code", "text"],
  [/city/i, "address-level2", "text"],
  [/state|province|region/i, "address-level1", "text"],
  [/country/i, "country-name", "text"],
  [/(address|street)/i, "street-address", "text"],
];

function inferAutocomplete(field: FormField): string | undefined {
  if (field.autocomplete) return field.autocomplete;
  const haystack = `${field.name ?? ""} ${field.label}`;
  if (field.type === "email") return "email";
  if (field.type === "tel") return "tel";
  for (const [re, token] of FIELD_NAME_HEURISTICS) {
    if (re.test(haystack)) return token;
  }
  return undefined;
}

function inferInputMode(field: FormField): string | undefined {
  if (field.type === "email") return "email";
  if (field.type === "tel") return "tel";
  if (field.type === "number") return "decimal";
  if (field.type === "date") return "numeric";
  const haystack = `${field.name ?? ""} ${field.label}`;
  if (/email/i.test(haystack)) return "email";
  if (/phone|mobile|tel/i.test(haystack)) return "tel";
  if (/zip|postal/i.test(haystack)) return "numeric";
  return undefined;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+()\-\s\d]{7,}$/;

function validateValue(field: FormField, raw: FormDataEntryValue | null): string | null {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (field.required && value.length === 0) {
    return `${field.label} is required.`;
  }
  if (value.length === 0) return null;
  if (field.type === "email" || /email/i.test(`${field.name ?? ""} ${field.label}`)) {
    if (!EMAIL_RE.test(value)) return "Please enter a valid email address.";
  }
  if (field.type === "tel") {
    if (!PHONE_RE.test(value)) return "Please enter a valid phone number.";
  }
  return null;
}

function buildSpinnerSvg(size: number): SVGSVGElement {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  svg.style.cssText = "display:inline-block;vertical-align:middle;";
  const trackEl = document.createElementNS(NS, "circle");
  trackEl.setAttribute("cx", "8");
  trackEl.setAttribute("cy", "8");
  trackEl.setAttribute("r", "6");
  trackEl.setAttribute("fill", "none");
  trackEl.setAttribute("stroke", "currentColor");
  trackEl.setAttribute("stroke-width", "2");
  trackEl.setAttribute("opacity", "0.25");
  svg.appendChild(trackEl);
  const arc = document.createElementNS(NS, "path");
  arc.setAttribute("d", "M14 8 a 6 6 0 0 0 -6 -6");
  arc.setAttribute("fill", "none");
  arc.setAttribute("stroke", "currentColor");
  arc.setAttribute("stroke-width", "2");
  arc.setAttribute("stroke-linecap", "round");
  svg.appendChild(arc);
  return svg;
}

function buildCheckmarkSvg(): SVGSVGElement {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("width", "24");
  svg.setAttribute("height", "24");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(NS, "path");
  path.setAttribute("d", "M5 12.5 L10 17.5 L19 7.5");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2.5");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.appendChild(path);
  return svg;
}

function buildClockIcon(): SVGElement {
  const icon = renderLucideIcon("clock", 14);
  if (icon) {
    icon.style.flexShrink = "0";
    return icon;
  }
  // Defensive fallback: lucide should always have "clock", but if it ever
  // can't be resolved (icon name typo, future rename) we still render a glyph.
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");
  svg.style.flexShrink = "0";
  return svg;
}

function maskSensitive(value: string): string {
  if (value.length <= 4) return "••••";
  return `••••${value.slice(-4)}`;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * DynamicForm component - renders a form with dynamic fields based on AI-generated props.
 * Themes via the host widget's `--persona-*` CSS variables; per-instance overrides via
 * `config.formStyles` or `props.styles`. After submit, swaps to a summary card with the
 * submitted values and a "what happens next" message; the user can click Edit to revise.
 */
export const DynamicForm: ComponentRenderer = (props, context) => {
  const theme = (context.config?.theme ?? {}) as {
    primary?: string;
    accent?: string;
    surface?: string;
    muted?: string;
  };
  const accentFallback = theme.accent || "#6366f1";

  const configStyles = (context.config as { formStyles?: DynamicFormStyles })?.formStyles;
  const propsStyles = props.styles as DynamicFormStyles | undefined;
  const styles: DynamicFormStyles = { ...configStyles, ...propsStyles };

  const accentVar = `var(--persona-accent, ${accentFallback})`;
  const surfaceVar = `var(--persona-surface, ${theme.surface || "#ffffff"})`;
  const inputFillVar = `var(--persona-input-background, var(--persona-surface, ${theme.surface || "#ffffff"}))`;
  const textVar = `var(--persona-text, ${theme.primary || "#1f2937"})`;
  const mutedVar = `var(--persona-text-muted, ${theme.muted || "#6b7280"})`;
  const borderVar = `var(--persona-border, ${theme.muted ? `${theme.muted}33` : "#e5e7eb"})`;
  const dividerVar = `var(--persona-divider, ${theme.muted ? `${theme.muted}1f` : "#eef0f3"})`;
  const errorColor = styles.errorColor || "#ef4444";
  const successAccent = styles.successAccentColor || accentVar;
  const buttonBgVar = `var(--persona-button-primary-bg, ${theme.primary || "#111827"})`;
  const buttonFgVar = `var(--persona-button-primary-fg, #ffffff)`;

  // Tinted variants. CSS doesn't allow concatenating an alpha hex onto a
  // `var(...)` reference (`var(...)33` is invalid and silently dropped),
  // so we use `color-mix()` to derive translucent tints from the resolved
  // theme tokens. Supported in all evergreen browsers (Chrome 111+).
  const accentTint15 = `color-mix(in srgb, ${accentVar} 15%, transparent)`;
  const textTint20 = `color-mix(in srgb, ${textVar} 20%, transparent)`;
  const errorTint12 = `color-mix(in srgb, ${errorColor} 12%, transparent)`;

  const borderShorthand = styles.border
    || `${styles.borderWidth || "1px"} solid ${styles.borderColor || borderVar}`;

  const container = document.createElement("div");
  container.className = "dynamic-form-card";
  container.style.cssText = `
    box-sizing: border-box;
    border: ${borderShorthand};
    border-radius: ${styles.borderRadius || "14px"};
    padding: ${styles.padding || "0.875rem 1rem"};
    background: ${surfaceVar};
    color: ${textVar};
    box-shadow: ${styles.boxShadow || "0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)"};
    max-width: ${styles.maxWidth || "460px"};
    margin: ${styles.margin || "0.5rem 0"};
    font-family: var(--persona-font-family, inherit);
  `;

  const title = String(props.title || "Form");
  const description = props.description ? String(props.description) : "";
  const fields = Array.isArray(props.fields) ? (props.fields as FormField[]) : [];
  const submitText = String(props.submit_text || props.submitText || "Submit");
  const helperText = typeof props.helper_text === "string"
    ? props.helper_text
    : typeof props.helperText === "string"
      ? props.helperText
      : fields.length > 2
        ? "Takes less than 30 seconds."
        : "";
  const successTitle = typeof props.success_title === "string"
    ? props.success_title
    : typeof props.successTitle === "string"
      ? props.successTitle
      : "You're all set!";
  const successFallbackBody = typeof props.success_message === "string"
    ? props.success_message
    : typeof props.successMessage === "string"
      ? props.successMessage
      : "We received your details and will follow up within one business day.";
  const allowEdit = props.allow_edit !== false && props.allowEdit !== false;

  const messageId = context.message?.id || "form";

  // Restore prior submission (if any): set after wrappers + helpers are built.
  const previousAction = getUserAction<Record<string, string>>(messageId);
  const hasPreviousSubmission =
    previousAction?.type === "submit"
    && previousAction.data !== null
    && typeof previousAction.data === "object";

  // ---------- form wrapper ----------
  const formWrapper = document.createElement("div");
  formWrapper.className = "dynamic-form-stage";
  container.appendChild(formWrapper);

  const header = document.createElement("div");
  header.style.cssText = "margin-bottom: 0.625rem;";

  const titleEl = document.createElement("h3");
  titleEl.style.cssText = `
    margin: 0 0 0.125rem 0;
    color: ${textVar};
    font-size: ${styles.titleFontSize || "1rem"};
    font-weight: ${styles.titleFontWeight || "700"};
    line-height: 1.25;
    letter-spacing: -0.01em;
  `;
  titleEl.textContent = title;
  header.appendChild(titleEl);

  if (description) {
    const descEl = document.createElement("p");
    descEl.style.cssText = `
      margin: 0;
      color: ${mutedVar};
      font-size: ${styles.descriptionFontSize || "0.8125rem"};
      line-height: 1.4;
    `;
    descEl.textContent = description;
    header.appendChild(descEl);
  }

  formWrapper.appendChild(header);

  const form = document.createElement("form");
  form.noValidate = true;
  form.style.cssText = `
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.625rem 0.625rem;
  `;

  type FieldHandle = {
    field: FormField;
    name: string;
    control: HTMLInputElement | HTMLTextAreaElement;
    group: HTMLDivElement;
    errorEl: HTMLDivElement;
    setError: (message: string | null) => void;
  };
  const handles: FieldHandle[] = [];

  fields.forEach((field, index) => {
    const fieldName = field.name || field.label.toLowerCase().replace(/\s+/g, "_");
    const fieldId = `${messageId}-${fieldName}-${index}`;

    const isHalfWidth = field.width === "half";
    const group = document.createElement("div");
    group.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      grid-column: ${isHalfWidth ? "span 1" : "1 / -1"};
      min-width: 0;
    `;

    const label = document.createElement("label");
    label.htmlFor = fieldId;
    label.style.cssText = `
      font-size: ${styles.labelFontSize || "0.8125rem"};
      font-weight: ${styles.labelFontWeight || "500"};
      color: ${textVar};
    `;
    label.textContent = field.label;
    // Modern convention: mark required fields with a red asterisk rather
    // than tagging optional ones: quieter for forms with many optional
    // fields and the asterisk is a near-universal "required" signal.
    if (field.required) {
      const star = document.createElement("span");
      star.textContent = "*";
      star.setAttribute("aria-hidden", "true");
      star.style.cssText = `color: ${errorColor}; margin-left: 0.25rem;`;
      label.appendChild(star);
    }
    group.appendChild(label);

    const inputType = field.type || "text";
    let control: HTMLInputElement | HTMLTextAreaElement;
    if (inputType === "textarea") {
      control = document.createElement("textarea");
      const ta = control as HTMLTextAreaElement;
      ta.rows = 1;
      // Auto-grow pattern (Linear/Cron-style): start at single-input
      // height so the form is compact at rest, expand up to maxHeight as
      // the user types. Avoids reserving vertical space for content the
      // user might never write.
      control.style.minHeight = "34px";
      control.style.maxHeight = "140px";
      control.style.resize = "none";
      control.style.overflow = "hidden";
      const autosize = () => {
        ta.style.height = "auto";
        ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
      };
      ta.addEventListener("input", autosize);
      queueMicrotask(autosize);
    } else {
      control = document.createElement("input");
      (control as HTMLInputElement).type = inputType;
    }

    control.id = fieldId;
    control.name = fieldName;
    control.placeholder = field.placeholder || "";
    if (field.required) control.required = true;

    const ac = inferAutocomplete(field);
    if (ac) control.setAttribute("autocomplete", ac);
    const im = inferInputMode(field);
    if (im) control.setAttribute("inputmode", im);
    if (field.type === "email" || /email/i.test(`${field.name ?? ""} ${field.label}`)) {
      control.setAttribute("autocapitalize", "off");
      control.setAttribute("spellcheck", "false");
    }

    const inputBorderResting = "1px solid transparent";
    const inputBorderHover = `1px solid ${borderVar}`;
    const inputBorderFocus = `1px solid ${accentVar}`;
    control.style.cssText += `
      box-sizing: border-box;
      width: 100%;
      min-height: 34px;
      padding: ${styles.inputPadding || "0.4375rem 0.625rem"};
      border: ${inputBorderResting};
      background: ${inputFillVar};
      border-radius: ${styles.inputBorderRadius || "var(--persona-input-radius, 0.5rem)"};
      font-size: ${styles.inputFontSize || "0.8125rem"};
      font-family: inherit;
      color: ${textVar};
      outline: none;
      box-shadow: inset 0 0 0 1px ${borderVar};
      transition: box-shadow 0.15s ease, background 0.15s ease;
    `;

    control.addEventListener("mouseenter", () => {
      if (group.dataset.invalid === "true") return;
      if (document.activeElement === control) return;
      control.style.boxShadow = `inset 0 0 0 1px ${textTint20}`;
    });
    control.addEventListener("mouseleave", () => {
      if (group.dataset.invalid === "true") return;
      if (document.activeElement === control) return;
      control.style.boxShadow = `inset 0 0 0 1px ${borderVar}`;
    });
    control.addEventListener("focus", () => {
      if (group.dataset.invalid === "true") {
        control.style.boxShadow = `inset 0 0 0 2px ${errorColor}, 0 0 0 4px ${errorTint12}`;
      } else {
        control.style.boxShadow = `inset 0 0 0 2px ${accentVar}, 0 0 0 4px ${accentTint15}`;
      }
    });
    control.addEventListener("blur", () => {
      if (group.dataset.invalid === "true") {
        control.style.boxShadow = `inset 0 0 0 2px ${errorColor}`;
      } else {
        control.style.boxShadow = `inset 0 0 0 1px ${borderVar}`;
      }
    });
    // suppress unused-var warnings on the constants used in handlers
    void inputBorderHover;
    void inputBorderFocus;

    group.appendChild(control);

    const helper = field.helper_text || field.helperText;
    if (helper) {
      const helperEl = document.createElement("div");
      helperEl.style.cssText = `
        font-size: ${styles.helperFontSize || "0.75rem"};
        color: ${mutedVar};
        line-height: 1.4;
      `;
      helperEl.textContent = helper;
      group.appendChild(helperEl);
    }

    const errorEl = document.createElement("div");
    errorEl.setAttribute("role", "alert");
    errorEl.id = `${fieldId}-error`;
    errorEl.style.cssText = `
      font-size: 0.75rem;
      color: ${errorColor};
      line-height: 1.4;
      display: none;
    `;
    group.appendChild(errorEl);

    const setError = (message: string | null) => {
      if (message) {
        group.dataset.invalid = "true";
        errorEl.textContent = message;
        errorEl.style.display = "";
        control.setAttribute("aria-invalid", "true");
        control.setAttribute("aria-describedby", errorEl.id);
        if (document.activeElement === control) {
          control.style.boxShadow = `inset 0 0 0 2px ${errorColor}, 0 0 0 4px ${errorTint12}`;
        } else {
          control.style.boxShadow = `inset 0 0 0 2px ${errorColor}`;
        }
      } else {
        delete group.dataset.invalid;
        errorEl.textContent = "";
        errorEl.style.display = "none";
        control.removeAttribute("aria-invalid");
        control.removeAttribute("aria-describedby");
        if (document.activeElement === control) {
          control.style.boxShadow = `inset 0 0 0 2px ${accentVar}, 0 0 0 4px ${accentTint15}`;
        } else {
          control.style.boxShadow = `inset 0 0 0 1px ${borderVar}`;
        }
      }
    };

    handles.push({ field, name: fieldName, control, group, errorEl, setError });
    form.appendChild(group);
  });

  // ---------- action area ----------
  const actions = document.createElement("div");
  actions.style.cssText = `
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.375rem;
    margin-top: 0.125rem;
    grid-column: 1 / -1;
  `;

  const submitBtn = document.createElement("button");
  submitBtn.type = "submit";
  submitBtn.style.cssText = `
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    width: 100%;
    padding: ${styles.buttonPadding || "0.5rem 1rem"};
    min-height: 34px;
    background: ${buttonBgVar};
    color: ${buttonFgVar};
    border: none;
    border-radius: ${styles.buttonBorderRadius || "0.5rem"};
    font-size: ${styles.buttonFontSize || "0.8125rem"};
    font-weight: ${styles.buttonFontWeight || "600"};
    font-family: inherit;
    cursor: pointer;
    transition: filter 0.15s ease, transform 0.1s ease;
  `;
  const submitLabel = document.createElement("span");
  submitLabel.textContent = submitText;
  submitBtn.appendChild(submitLabel);
  submitBtn.addEventListener("mouseenter", () => {
    if (submitBtn.disabled) return;
    submitBtn.style.filter = "brightness(0.92)";
  });
  submitBtn.addEventListener("mouseleave", () => {
    submitBtn.style.filter = "";
  });
  submitBtn.addEventListener("mousedown", () => {
    if (submitBtn.disabled) return;
    submitBtn.style.transform = "translateY(1px)";
  });
  submitBtn.addEventListener("mouseup", () => {
    submitBtn.style.transform = "";
  });

  actions.appendChild(submitBtn);

  const helperRow = document.createElement("div");
  helperRow.style.cssText = `
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: ${styles.helperFontSize || "0.75rem"};
    color: ${mutedVar};
    line-height: 1.4;
    min-height: 1rem;
  `;

  const helperContent = document.createElement("div");
  helperContent.style.cssText = "display: inline-flex; align-items: center; gap: 0.4375rem;";
  helperContent.appendChild(buildClockIcon());
  const helperEl = document.createElement("span");
  helperEl.textContent = helperText;
  helperContent.appendChild(helperEl);

  const errorBanner = document.createElement("div");
  errorBanner.setAttribute("role", "alert");
  errorBanner.style.cssText = `color: ${errorColor}; display: none;`;

  helperRow.appendChild(helperContent);
  helperRow.appendChild(errorBanner);

  if (!helperText) {
    helperContent.style.display = "none";
  }

  actions.appendChild(helperRow);

  form.appendChild(actions);
  formWrapper.appendChild(form);

  // ---------- submit lifecycle ----------
  let lastPayload: Record<string, string> = {};
  let triggeredSubmit = false;
  let isSubmitting = false;
  const reduceMotion = () => prefersReducedMotion();

  function setSubmitting(submitting: boolean) {
    isSubmitting = submitting;
    if (submitting) {
      const rect = submitBtn.getBoundingClientRect();
      if (rect.width) submitBtn.style.minWidth = `${rect.width}px`;
      submitBtn.disabled = true;
      submitBtn.style.opacity = "0.85";
      submitBtn.style.cursor = "wait";
      submitLabel.textContent = "Submitting…";
      const existingSpinner = submitBtn.querySelector("svg");
      if (!existingSpinner) {
        const spinner = buildSpinnerSvg(16);
        submitBtn.insertBefore(spinner, submitLabel);
        if (!reduceMotion()) {
          spinner.animate(
            [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
            { duration: 800, iterations: Infinity, easing: "linear" }
          );
        }
      }
      handles.forEach(({ control }) => {
        control.setAttribute("disabled", "true");
      });
    } else {
      submitBtn.disabled = false;
      submitBtn.style.opacity = "1";
      submitBtn.style.cursor = "pointer";
      submitBtn.style.minWidth = "";
      submitLabel.textContent = submitText;
      const spinner = submitBtn.querySelector("svg");
      if (spinner) spinner.remove();
      handles.forEach(({ control }) => {
        control.removeAttribute("disabled");
      });
    }
  }

  function clearBanner() {
    errorBanner.textContent = "";
    errorBanner.style.display = "none";
    if (helperText) helperContent.style.display = "inline-flex";
  }

  function showBanner(message: string) {
    errorBanner.textContent = message;
    errorBanner.style.display = "";
    helperContent.style.display = "none";
  }

  function attachLiveValidation(handle: FieldHandle) {
    if (handle.control.dataset.liveValidation === "true") return;
    handle.control.dataset.liveValidation = "true";
    const onInput = () => {
      const formData = new FormData(form);
      const error = validateValue(handle.field, formData.get(handle.name));
      handle.setError(error);
      if (!error) clearBanner();
    };
    handle.control.addEventListener("input", onInput);
    handle.control.addEventListener("blur", onInput);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    triggeredSubmit = true;
    const formData = new FormData(form);
    let firstInvalid: FieldHandle | null = null;
    handles.forEach((handle) => {
      const error = validateValue(handle.field, formData.get(handle.name));
      handle.setError(error);
      if (error && !firstInvalid) firstInvalid = handle;
      if (triggeredSubmit) attachLiveValidation(handle);
    });

    if (firstInvalid) {
      const target = firstInvalid as FieldHandle;
      target.control.focus({ preventScroll: false });
      target.control.scrollIntoView({ block: "nearest", behavior: reduceMotion() ? "auto" : "smooth" });
      showBanner("Please fix the highlighted fields.");
      return;
    }

    clearBanner();

    const payload: Record<string, string> = {};
    formData.forEach((value, key) => {
      payload[key] = typeof value === "string" ? value : "";
    });
    lastPayload = payload;

    setSubmitting(true);

    try {
      const formEndpoint = (context.config as { formEndpoint?: string }).formEndpoint || "/form";
      const response = await fetch(formEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(`Submission failed (${response.status})`);
      }
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      const successBody = typeof data.message === "string" && data.message.length > 0
        ? data.message
        : successFallbackBody;
      // Persist the userAction *after* the server confirms 2xx, so a failed
      // submission never leaves a "submitted" record behind.
      setUserAction<Record<string, string>>(messageId, {
        type: "submit",
        data: payload,
      });
      await swapToSuccess(successBody, payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong.";
      showBanner(message);
      setSubmitting(false);
    }
  });

  // ---------- success card ----------
  const successWrapper = document.createElement("div");
  successWrapper.className = "dynamic-form-success";
  successWrapper.setAttribute("role", "status");
  successWrapper.setAttribute("aria-live", "polite");
  successWrapper.style.cssText = `
    display: none;
    flex-direction: column;
    align-items: stretch;
    text-align: center;
    padding: ${styles.successCardPadding || "0.5rem 0.25rem"};
  `;
  container.appendChild(successWrapper);

  function buildSuccessContents(body: string, payload: Record<string, string>) {
    successWrapper.replaceChildren();

    const checkWrap = document.createElement("div");
    checkWrap.style.cssText = `
      align-self: center;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 52px;
      height: 52px;
      border-radius: 9999px;
      background: ${textVar};
      color: var(--persona-button-primary-fg, #ffffff);
      margin-bottom: 1.25rem;
    `;
    const check = buildCheckmarkSvg();
    check.setAttribute("width", "26");
    check.setAttribute("height", "26");
    checkWrap.appendChild(check);
    successWrapper.appendChild(checkWrap);

    const heading = document.createElement("h3");
    heading.tabIndex = -1;
    heading.style.cssText = `
      margin: 0 0 0.5rem 0;
      color: ${textVar};
      font-size: 1.75rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      line-height: 1.15;
      outline: none;
    `;
    heading.textContent = successTitle;
    successWrapper.appendChild(heading);

    const bodyEl = document.createElement("p");
    bodyEl.style.cssText = `
      margin: 0 0 1.75rem 0;
      color: ${mutedVar};
      font-size: 1rem;
      line-height: 1.5;
    `;
    bodyEl.textContent = body;
    successWrapper.appendChild(bodyEl);

    const recapEntries = handles
      .map(({ field, name }) => {
        const raw = payload[name];
        if (!raw || raw.trim().length === 0) return null;
        const display = field.sensitive ? maskSensitive(raw) : raw;
        return { label: field.label, value: display };
      })
      .filter((entry): entry is { label: string; value: string } => entry !== null);

    if (recapEntries.length > 0) {
      const recapSection = document.createElement("div");
      recapSection.style.cssText = `
        text-align: left;
        margin: 0 0 1.5rem 0;
      `;

      const sectionLabel = document.createElement("div");
      sectionLabel.textContent = "Submitted details";
      sectionLabel.style.cssText = `
        font-size: 0.75rem;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: ${mutedVar};
        margin-bottom: 0.625rem;
      `;
      recapSection.appendChild(sectionLabel);

      const recap = document.createElement("dl");
      recap.style.cssText = `
        display: grid;
        grid-template-columns: minmax(7rem, max-content) 1fr;
        margin: 0;
        padding: 0;
        border: 1px solid ${borderVar};
        border-radius: 0.75rem;
        overflow: hidden;
      `;
      recapEntries.forEach(({ label, value }, index) => {
        const isLast = index === recapEntries.length - 1;
        const cellBorder = isLast ? "none" : `1px solid ${dividerVar}`;
        const dt = document.createElement("dt");
        dt.style.cssText = `
          margin: 0;
          padding: 0.875rem 1rem;
          color: ${mutedVar};
          font-size: 0.9375rem;
          font-weight: 500;
          border-bottom: ${cellBorder};
        `;
        dt.textContent = label;
        const dd = document.createElement("dd");
        dd.style.cssText = `
          margin: 0;
          padding: 0.875rem 1rem;
          color: ${textVar};
          font-size: 0.9375rem;
          font-weight: 600;
          word-break: break-word;
          border-bottom: ${cellBorder};
        `;
        dd.textContent = value;
        recap.appendChild(dt);
        recap.appendChild(dd);
      });
      recapSection.appendChild(recap);
      successWrapper.appendChild(recapSection);
    }

    if (allowEdit) {
      const editRow = document.createElement("div");
      editRow.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.625rem;
      `;
      const editPrompt = document.createElement("div");
      editPrompt.style.cssText = `font-size: 0.9375rem; color: ${mutedVar};`;
      editPrompt.textContent = "Need to update something?";
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.textContent = "Edit details";
      editBtn.style.cssText = `
        appearance: none;
        background: transparent;
        border: 1px solid ${borderVar};
        color: ${textVar};
        padding: 0.625rem 1.25rem;
        min-height: 40px;
        border-radius: 9999px;
        font-size: 0.9375rem;
        font-weight: 600;
        font-family: inherit;
        cursor: pointer;
        transition: background 0.15s ease, border-color 0.15s ease;
      `;
      editBtn.addEventListener("mouseenter", () => {
        editBtn.style.background = `var(--persona-container, ${accentFallback}0d)`;
        editBtn.style.borderColor = textVar;
      });
      editBtn.addEventListener("mouseleave", () => {
        editBtn.style.background = "transparent";
        editBtn.style.borderColor = borderVar;
      });
      editBtn.addEventListener("click", () => {
        swapToForm();
      });
      editRow.appendChild(editPrompt);
      editRow.appendChild(editBtn);
      successWrapper.appendChild(editRow);
    }

    if (!reduceMotion()) {
      check.animate(
        [
          { transform: "scale(0)", opacity: 0 },
          { transform: "scale(1)", opacity: 1 },
        ],
        { duration: 280, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)", fill: "forwards" }
      );
    }
  }

  async function swapToSuccess(body: string, payload: Record<string, string>) {
    if (!reduceMotion()) {
      await formWrapper
        .animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: "ease", fill: "forwards" })
        .finished
        .catch(() => undefined);
    }
    formWrapper.style.display = "none";

    buildSuccessContents(body, payload);
    successWrapper.style.display = "flex";

    if (!reduceMotion()) {
      successWrapper.animate(
        [
          { opacity: 0, transform: "translateY(8px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: 260, easing: "ease", fill: "forwards" }
      );
    }

    setSubmitting(false);

    const heading = successWrapper.querySelector<HTMLHeadingElement>("h3");
    if (heading) {
      requestAnimationFrame(() => heading.focus({ preventScroll: false }));
    }
  }

  function swapToForm() {
    // Edit doesn't clear the stored userAction: the prior successful submission
    // stays canonical until the user re-submits, so a refresh mid-edit returns
    // them to the last recorded success state rather than losing the data.
    successWrapper.style.display = "none";
    formWrapper.style.display = "";
    formWrapper.style.opacity = "1";

    handles.forEach(({ control, name, setError }) => {
      const value = lastPayload[name];
      if (typeof value === "string") {
        control.value = value;
      }
      // Re-trigger the autogrow listener so restored textarea content
      // resizes to fit instead of staying at minHeight.
      if (control instanceof HTMLTextAreaElement) {
        control.dispatchEvent(new Event("input", { bubbles: true }));
      }
      setError(null);
    });
    clearBanner();

    if (!reduceMotion()) {
      formWrapper.animate(
        [
          { opacity: 0, transform: "translateY(4px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: 200, easing: "ease", fill: "forwards" }
      );
    }

    const firstControl = handles[0]?.control;
    if (firstControl) {
      requestAnimationFrame(() => firstControl.focus({ preventScroll: false }));
    }
  }

  // Restore success state from a prior submission (e.g. after page reload).
  // No animation: the user expects to find this state already there, not see
  // it animate in. Edit/Resubmit will overwrite the stored userAction.
  if (hasPreviousSubmission && previousAction) {
    const restored = previousAction.data as Record<string, string>;
    lastPayload = restored;
    formWrapper.style.display = "none";
    buildSuccessContents(successFallbackBody, restored);
    successWrapper.style.display = "flex";
  }

  return container;
};
