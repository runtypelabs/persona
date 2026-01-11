import type { ComponentRenderer, ComponentContext } from "@runtypelabs/persona";

/**
 * Helper to adjust color brightness for hover states
 */
function adjustColorBrightness(hex: string, percent: number): string {
  // Handle shorthand hex
  let color = hex.replace("#", "");
  if (color.length === 3) {
    color = color.split("").map(c => c + c).join("");
  }
  
  const num = parseInt(color, 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + Math.round(2.55 * percent)));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + Math.round(2.55 * percent)));
  const b = Math.min(255, Math.max(0, (num & 0x0000FF) + Math.round(2.55 * percent)));
  
  return `#${(0x1000000 + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

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
 * Field definition for DynamicForm
 */
interface FormField {
  label: string;
  name?: string;
  type?: "text" | "email" | "tel" | "date" | "time" | "textarea" | "number";
  placeholder?: string;
  required?: boolean;
}

/**
 * Style overrides for DynamicForm
 * Can be passed via config.formStyles or as props.styles
 */
export interface DynamicFormStyles {
  // Container styles
  margin?: string;
  borderRadius?: string;
  borderWidth?: string;
  borderColor?: string;
  border?: string; // Legacy: full border shorthand (e.g., "1px solid #ccc")
  padding?: string;
  maxWidth?: string;
  boxShadow?: string;
  
  // Typography
  titleFontSize?: string;
  titleFontWeight?: string;
  descriptionFontSize?: string;
  labelFontSize?: string;
  labelFontWeight?: string;
  inputFontSize?: string;
  
  // Input styles
  inputPadding?: string;
  inputBorderRadius?: string;
  inputBorder?: string;
  
  // Button styles
  buttonPadding?: string;
  buttonBorderRadius?: string;
  buttonFontSize?: string;
  buttonFontWeight?: string;
}

/**
 * DynamicForm component - renders a form with dynamic fields based on AI-generated props
 * Supports theming via context.config.theme and style overrides via config.formStyles or props.styles
 */
export const DynamicForm: ComponentRenderer = (props, context) => {
  // Extract theme colors with fallbacks
  const theme = context.config?.theme || {};
  const primaryColor = theme.primary || "#1f2937";
  const accentColor = theme.accent || "#6366f1";
  const surfaceColor = theme.surface || "#ffffff";
  const mutedColor = theme.muted || "#6b7280";
  
  // Calculate a darker accent for hover state
  const accentHover = adjustColorBrightness(accentColor, -15);
  
  // Merge style overrides: config.formStyles < props.styles (props wins)
  const configStyles = (context.config as any)?.formStyles as DynamicFormStyles | undefined;
  const propsStyles = props.styles as DynamicFormStyles | undefined;
  const styles: DynamicFormStyles = { ...configStyles, ...propsStyles };
  
  // Build border style from individual properties or use shorthand
  const borderWidth = styles.borderWidth || "1px";
  const borderColor = styles.borderColor || `${mutedColor}30`;
  const borderStyle = styles.border || `${borderWidth} solid ${borderColor}`;
  
  const container = document.createElement("div");
  container.className = "dynamic-form-card";
  container.style.cssText = `
    border: ${borderStyle};
    border-radius: ${styles.borderRadius || "12px"};
    padding: ${styles.padding || "1.5rem"};
    background: ${surfaceColor};
    box-shadow: ${styles.boxShadow || "0 2px 8px rgba(0,0,0,0.1)"};
    max-width: ${styles.maxWidth || "450px"};
    margin: ${styles.margin || "1rem 0"};
  `;

  const title = String(props.title || "Form");
  const description = props.description ? String(props.description) : "";
  const fields = Array.isArray(props.fields) ? props.fields as FormField[] : [];
  const submitText = String(props.submit_text || props.submitText || "Submit");

  // Build header
  const header = document.createElement("div");
  header.style.cssText = "margin-bottom: 1.25rem;";
  
  const titleEl = document.createElement("h3");
  titleEl.style.cssText = `
    margin: 0 0 0.25rem 0;
    color: ${primaryColor};
    font-size: ${styles.titleFontSize || "1.125rem"};
    font-weight: ${styles.titleFontWeight || "600"};
  `;
  titleEl.textContent = title;
  header.appendChild(titleEl);
  
  if (description) {
    const descEl = document.createElement("p");
    descEl.style.cssText = `
      margin: 0;
      color: ${mutedColor};
      font-size: ${styles.descriptionFontSize || "0.875rem"};
    `;
    descEl.textContent = description;
    header.appendChild(descEl);
  }
  
  container.appendChild(header);

  // Build form
  const form = document.createElement("form");
  form.style.cssText = "display: flex; flex-direction: column; gap: 1rem;";
  
  const messageId = context.message?.id || "form";
  
  fields.forEach((field, index) => {
    const fieldName = field.name || field.label.toLowerCase().replace(/\s+/g, "_");
    const fieldId = `${messageId}-${fieldName}-${index}`;
    
    const group = document.createElement("div");
    group.style.cssText = "display: flex; flex-direction: column; gap: 0.375rem;";
    
    const label = document.createElement("label");
    label.htmlFor = fieldId;
    label.style.cssText = `
      font-size: ${styles.labelFontSize || "0.75rem"};
      font-weight: ${styles.labelFontWeight || "500"};
      color: ${mutedColor};
    `;
    label.textContent = field.label + (field.required ? " *" : "");
    group.appendChild(label);
    
    const inputType = field.type || "text";
    let control: HTMLInputElement | HTMLTextAreaElement;
    
    if (inputType === "textarea") {
      control = document.createElement("textarea");
      (control as HTMLTextAreaElement).rows = 3;
    } else {
      control = document.createElement("input");
      (control as HTMLInputElement).type = inputType;
    }
    
    const inputBorderDefault = styles.inputBorder || `1px solid ${mutedColor}40`;
    
    control.id = fieldId;
    control.name = fieldName;
    control.placeholder = field.placeholder || "";
    if (field.required) {
      control.required = true;
    }
    control.style.cssText = `
      padding: ${styles.inputPadding || "0.625rem 0.875rem"};
      border: ${inputBorderDefault};
      border-radius: ${styles.inputBorderRadius || "0.5rem"};
      font-size: ${styles.inputFontSize || "0.875rem"};
      color: ${primaryColor};
      background: ${surfaceColor};
      outline: none;
      transition: border-color 0.2s;
    `;
    control.addEventListener("focus", () => {
      control.style.borderColor = accentColor;
    });
    control.addEventListener("blur", () => {
      control.style.border = inputBorderDefault;
    });
    
    group.appendChild(control);
    form.appendChild(group);
  });

  // Actions row
  const actions = document.createElement("div");
  actions.style.cssText = "display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; margin-top: 0.5rem;";
  
  const status = document.createElement("div");
  status.style.cssText = `font-size: 0.75rem; color: ${mutedColor}; min-height: 1.25rem;`;
  
  const submitBtn = document.createElement("button");
  submitBtn.type = "submit";
  submitBtn.textContent = submitText;
  submitBtn.style.cssText = `
    display: inline-flex;
    align-items: center;
    padding: ${styles.buttonPadding || "0.625rem 1.25rem"};
    background: ${accentColor};
    color: white;
    border: none;
    border-radius: ${styles.buttonBorderRadius || "9999px"};
    font-size: ${styles.buttonFontSize || "0.875rem"};
    font-weight: ${styles.buttonFontWeight || "600"};
    cursor: pointer;
    transition: background 0.2s;
  `;
  submitBtn.addEventListener("mouseenter", () => {
    submitBtn.style.background = accentHover;
  });
  submitBtn.addEventListener("mouseleave", () => {
    submitBtn.style.background = accentColor;
  });
  
  actions.appendChild(status);
  actions.appendChild(submitBtn);
  form.appendChild(actions);
  
  // Form submission handler
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    
    const formData = new FormData(form);
    const payload: Record<string, unknown> = {};
    formData.forEach((value, key) => {
      payload[key] = value;
    });
    
    submitBtn.setAttribute("disabled", "true");
    submitBtn.style.opacity = "0.6";
    submitBtn.style.cursor = "not-allowed";
    status.textContent = "Submitting…";
    
    try {
      // Use form endpoint from config if available
      const formEndpoint = context.config?.formEndpoint || "/form";
      
      const response = await fetch(formEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error(`Submission failed (${response.status})`);
      }
      
      const data = await response.json();
      status.textContent = data.message || "Thanks! We'll be in touch soon.";
      status.style.color = "#10b981";
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "Something went wrong.";
      status.style.color = "#ef4444";
    } finally {
      submitBtn.removeAttribute("disabled");
      submitBtn.style.opacity = "1";
      submitBtn.style.cursor = "pointer";
    }
  });
  
  container.appendChild(form);
  
  return container;
};
