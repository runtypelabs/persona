/**
 * Field reference demo. One widget in the preview pane, three variant buttons
 * in the left rail: each selection re-mounts a fresh widget and pre-injects a
 * DynamicForm directive showcasing a different aspect of the field schema:
 *
 *   1. all field types (text, email, tel, url, number, date, time, textarea)
 *: also demonstrates `sensitive: true` masking via the phone field
 *   2. layout widths (full + half pairs)
 *   3. helper text + required marking
 *
 * The rendered form shows in the Preview pane; the directive `props` show in
 * the Code pane's Scenario tab. Useful as a copy-paste template for prompt
 * authors and as a smoke test when tweaking themes.
 */

import "@runtypelabs/persona/widget.css";
import { renderDemoScaffold } from "./demo-scaffold";
import { renderInlineMount, squareInlinePanel } from "./mount-mode";
import "./index.css";
import "./App.css";

import {
  createAgentExperience,
  componentRegistry,
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetConfig,
  type AgentWidgetInitHandle,
} from "@runtypelabs/persona";

import { DynamicForm } from "./components";
import {
  createDemoConfigInspector,
  reportDemoConfig,
} from "./demo-config-inspector";

renderDemoScaffold({ slug: "dynamic-form-fields" });

const configInspector = createDemoConfigInspector({
  title: "Form Field Reference",
  root: "[data-config-inspector]",
});

componentRegistry.register("DynamicForm", DynamicForm);

const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const proxyUrl = import.meta.env.VITE_PROXY_URL
  ? `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch-directive`
  : `http://localhost:${proxyPort}/api/chat/dispatch-directive`;

const widgetConfig: AgentWidgetConfig = {
  ...DEFAULT_WIDGET_CONFIG,
  apiUrl: proxyUrl,
  parserType: "json",
  enableComponentStreaming: true,
  wrapComponentDirectiveInBubble: false,
  launcher: { enabled: false, width: "100%" },
  formEndpoint: "/form",
  persistState: false,
  theme: {
    ...DEFAULT_WIDGET_CONFIG.theme,
    primary: "#111827",
    accent: "#6366f1",
    surface: "#ffffff",
    muted: "#64748b",
  },
  // Default header (with the native clear-chat control), matching the other
  // demos: not the minimal/headerless variant.
  statusIndicator: { visible: false },
  suggestionChips: [],
  postprocessMessage: ({ text }) => markdownPostprocessor(text),
};

type Variant = {
  id: string;
  label: string;
  directiveId: string;
  props: Record<string, unknown>;
};

const VARIANTS: Variant[] = [
  {
    id: "types",
    label: "Field types",
    directiveId: "field-types-form",
    props: {
      title: "Every field type",
      description: "One of each: see the rendered control for each `type`.",
      fields: [
        { label: "Full Name", name: "name", type: "text", required: true },
        { label: "Email", name: "email", type: "email", required: true },
        {
          label: "Phone",
          name: "phone",
          type: "tel",
          sensitive: true,
          helper_text: "Sensitive: masked on success recap.",
        },
        { label: "Website", name: "website", type: "url", placeholder: "https://…" },
        { label: "Headcount", name: "headcount", type: "number" },
        { label: "Preferred date", name: "date", type: "date" },
        { label: "Preferred time", name: "time", type: "time" },
        {
          label: "Notes",
          name: "notes",
          type: "textarea",
          placeholder: "Auto-grows up to ~140px as you type",
        },
      ],
      submit_text: "Submit",
    },
  },
  {
    id: "widths",
    label: "Layout widths",
    directiveId: "field-widths-form",
    props: {
      title: "Width: full vs half",
      description:
        "Two consecutive half-width fields share a row. A full-width field spans the grid.",
      fields: [
        { label: "First Name", type: "text", width: "half", required: true },
        { label: "Last Name", type: "text", width: "half", required: true },
        { label: "Email", type: "email", required: true },
        { label: "City", type: "text", width: "half" },
        { label: "Postal Code", type: "text", width: "half" },
        { label: "Country", type: "text" },
      ],
      submit_text: "Save address",
    },
  },
  {
    id: "helpers",
    label: "Helpers + required",
    directiveId: "field-helpers-form",
    props: {
      title: "Helpers + required",
      description: "Inline guidance per field; required fields show a red *.",
      fields: [
        {
          label: "Project name",
          type: "text",
          required: true,
          helper_text: "Visible to your team only.",
        },
        {
          label: "Slug",
          type: "text",
          required: true,
          helper_text: "Lowercase letters, numbers, and dashes.",
        },
        {
          label: "Description",
          type: "textarea",
          helper_text: "Optional: a one-liner is fine.",
        },
        { label: "Domain", type: "url", placeholder: "https://example.com" },
      ],
      submit_text: "Create project",
    },
  },
];

const stage = document.querySelector<HTMLElement>(".stage-widget");
const variantGroup = document.getElementById("field-variants");
let handle: AgentWidgetInitHandle | null = null;
let activeVariant = "";

/**
 * Re-mount a fresh widget for the selected variant and inject its form.
 * Always re-mounts, so re-selecting the active variant re-renders the form
 * (e.g. to recover it after submitting or clearing the chat).
 */
function showVariant(id: string): void {
  const variant = VARIANTS.find((v) => v.id === id);
  if (!variant || !stage) return;
  activeVariant = id;

  if (handle) handle.destroy();
  const mount = renderInlineMount(stage);
  mount.style.height = "100%";
  handle = createAgentExperience(mount, squareInlinePanel(widgetConfig)) as AgentWidgetInitHandle;
  handle.injectComponentDirective({
    id: variant.directiveId,
    component: "DynamicForm",
    text: "",
    props: variant.props,
  });

  reportDemoConfig(configInspector, { config: widgetConfig, mode: "inline" });
  configInspector.setScenario(
    { component: "DynamicForm", props: variant.props },
    `injectComponentDirective · ${variant.label}`,
  );

  variantGroup?.querySelectorAll<HTMLButtonElement>(".mode-btn").forEach((btn) => {
    const isActive = btn.dataset.variant === id;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-pressed", String(isActive));
  });
}

variantGroup?.addEventListener("click", (event) => {
  const btn = (event.target as HTMLElement).closest<HTMLButtonElement>(
    ".mode-btn",
  );
  if (btn?.dataset.variant) showVariant(btn.dataset.variant);
});

showVariant("types");
