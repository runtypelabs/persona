import "@runtypelabs/persona/widget.css";
import { renderDemoScaffold } from "./demo-scaffold";
import "./index.css";
import "./App.css";

import {
  createAgentExperience,
  componentRegistry,
  createLocalStorageAdapter,
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetConfig,
  type AgentWidgetController,
} from "@runtypelabs/persona";

import { DynamicForm, type DynamicFormStyles } from "./components";
import { setupMountMode, runWidgetMountWithInspector, squareInlinePanel } from "./mount-mode";
import {
  createDemoConfigInspector,
  reportDemoConfig,
} from "./demo-config-inspector";
import type { Mode } from "./examples-nav";

renderDemoScaffold({ slug: "dynamic-form" });

const configInspector = createDemoConfigInspector({ title: "Dynamic Forms" });

componentRegistry.register("DynamicForm", DynamicForm);

const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const proxyUrl =
  import.meta.env.VITE_PROXY_URL
    ? `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch-directive`
    : `http://localhost:${proxyPort}/api/chat/dispatch-directive`;

let activeController: AgentWidgetController | null = null;
let previewIndex = 0;

const buildConfig = (mode: Mode): AgentWidgetConfig => {
  const isLauncher = mode === "launcher";
  return {
    ...DEFAULT_WIDGET_CONFIG,
    apiUrl: proxyUrl,
    storageAdapter: createLocalStorageAdapter(
      `persona-state-dynamic-form-${mode}`,
    ),
    parserType: "json",
    enableComponentStreaming: true,
    wrapComponentDirectiveInBubble: false,
    formEndpoint: "/form",
    launcher: {
      ...DEFAULT_WIDGET_CONFIG.launcher,
      enabled: isLauncher,
      width: isLauncher ? "min(420px, 95vw)" : "100%",
      title: isLauncher ? "Form Demo" : undefined,
      subtitle: isLauncher ? "Opens the dynamic form example" : undefined,
      agentIconText: isLauncher ? "📋" : undefined,
      autoExpand: isLauncher ? false : undefined,
    },
    theme: {
      ...DEFAULT_WIDGET_CONFIG.theme,
      primary: isLauncher ? "#020617" : "#111827",
      accent: "#6366f1",
      surface: "#ffffff",
      muted: "#64748b",
    },
    features: {
      ...DEFAULT_WIDGET_CONFIG.features,
      showReasoning: true,
      showToolCalls: true,
    },
    copy: {
      ...DEFAULT_WIDGET_CONFIG.copy,
      welcomeTitle: "Dynamic Form Demo",
      welcomeSubtitle:
        "Ask about scheduling or try the suggested prompts to see dynamic forms in action.",
    },
    suggestionChips: [
      "Can you schedule a demo for me?",
      "What does the dynamic form do?",
      "Show me a form for extra context",
    ],
    formStyles: isLauncher
      ? {
          borderRadius: "6px",
          borderWidth: "1px",
          borderColor: "#e5e7eb",
          padding: "1.25rem",
          titleFontSize: "1.25rem",
          buttonBorderRadius: "6px",
        }
      : undefined,
    postprocessMessage: ({ text }) => markdownPostprocessor(text),
  };
};

setupMountMode({
  slug: "dynamic-form",
  modes: ["inline", "launcher"],
  mount: (mode, { stage }) => {
    const { controller, teardown } = runWidgetMountWithInspector(
      configInspector,
      mode,
      stage,
      buildConfig,
    );
    activeController = controller;
    return () => {
      teardown();
      activeController = null;
    };
  },
});

document.getElementById("dynamic-form-preview")?.addEventListener("click", () => {
  if (!activeController) return;
  previewIndex += 1;
  const props = {
      title: "Schedule a demo",
      description: "Share your details: we'll follow up to confirm.",
      fields: [
        { label: "First Name", type: "text", required: true, width: "half" },
        { label: "Last Name", type: "text", required: true, width: "half" },
        { label: "Email", type: "email", required: true },
        { label: "Phone", type: "tel", width: "half" },
        { label: "Company", type: "text", width: "half" },
        {
          label: "Notes",
          type: "textarea",
          placeholder: "Anything we should know?",
        },
      ],
      submit_text: "Request meeting",
    };
  activeController.injectComponentDirective({
    id: `preview-form-${previewIndex}`,
    component: "DynamicForm",
    text: "Preview: this is the same DynamicForm the AI would emit.",
    props,
    llmContent:
      "[Demo: previewed booking form via injectComponentDirective. Not a user request.]",
  });
  configInspector.setScenario(
    { component: "DynamicForm", props },
    "injectComponentDirective payload",
  );
});

// ---------------------------------------------------------------------------
// Layout variants: same form, three formStyles presets. Each variant is a
// fresh widget with `injectComponentDirective` to render the form on mount,
// no LLM round-trip required.
// ---------------------------------------------------------------------------

const VARIANT_FIELDS = [
  { label: "First Name", type: "text", required: true, width: "half" },
  { label: "Last Name", type: "text", required: true, width: "half" },
  { label: "Email", type: "email", required: true },
  { label: "Phone", type: "tel", width: "half" },
  { label: "Company", type: "text", width: "half" },
  {
    label: "Notes",
    type: "textarea",
    placeholder: "Anything we should know?",
  },
];

type VariantTheme = {
  primary?: string;
  accent?: string;
  surface?: string;
  muted?: string;
};

const VARIANTS: Array<{
  id: string;
  formStyles: DynamicFormStyles;
  themeOverrides: VariantTheme;
}> = [
  { id: "compact", formStyles: {}, themeOverrides: {} },
  {
    id: "spacious",
    formStyles: {
      padding: "1.5rem",
      borderRadius: "16px",
      titleFontSize: "1.25rem",
      descriptionFontSize: "0.9375rem",
      labelFontSize: "0.875rem",
      labelFontWeight: "500",
      inputFontSize: "0.9375rem",
      inputPadding: "0.75rem 0.875rem",
      inputBorderRadius: "0.625rem",
      buttonPadding: "0.75rem 1.25rem",
      buttonBorderRadius: "0.625rem",
      buttonFontSize: "0.9375rem",
    },
    themeOverrides: {},
  },
  {
    id: "branded",
    formStyles: {
      padding: "1.25rem",
      borderRadius: "20px",
      borderColor: "#fde68a",
      titleFontSize: "1.125rem",
      inputBorderRadius: "9999px",
      inputPadding: "0.5rem 0.875rem",
      buttonBorderRadius: "9999px",
      buttonPadding: "0.625rem 1.25rem",
    },
    themeOverrides: {
      primary: "#7c2d12",
      accent: "#ea580c",
      muted: "#a16207",
    },
  },
];

function mountVariant(variant: (typeof VARIANTS)[number]): void {
  const mount = document.getElementById(`dynamic-form-variant-${variant.id}`);
  if (!mount) return;

  const config: AgentWidgetConfig = {
    ...DEFAULT_WIDGET_CONFIG,
    apiUrl: proxyUrl,
    storageAdapter: createLocalStorageAdapter(
      `persona-state-dynamic-form-variant-${variant.id}`,
    ),
    parserType: "json",
    enableComponentStreaming: true,
    wrapComponentDirectiveInBubble: false,
    launcher: { enabled: false, width: "100%" },
    formEndpoint: "/form",
    theme: {
      ...DEFAULT_WIDGET_CONFIG.theme,
      primary: "#111827",
      accent: "#6366f1",
      surface: "#ffffff",
      muted: "#64748b",
      ...variant.themeOverrides,
    },
    formStyles: variant.formStyles,
    layout: {
      ...DEFAULT_WIDGET_CONFIG.layout,
      header: { layout: "minimal", showCloseButton: false },
    },
    suggestionChips: [],
    statusIndicator: { visible: false },
    postprocessMessage: ({ text }) => markdownPostprocessor(text),
  };

  const variantController = createAgentExperience(mount, squareInlinePanel(config));
  variantController.injectComponentDirective({
    id: `variant-${variant.id}`,
    component: "DynamicForm",
    text: "",
    props: {
      title: "Book a demo",
      description: "Share your details and we'll follow up to confirm.",
      fields: VARIANT_FIELDS,
      submit_text: "Request meeting",
    },
  });
}

function renderVariantDef(variant: (typeof VARIANTS)[number]): string {
  const blocks: string[] = [];
  if (Object.keys(variant.themeOverrides).length > 0) {
    blocks.push(`theme: ${JSON.stringify(variant.themeOverrides, null, 2)}`);
  }
  blocks.push(`formStyles: ${JSON.stringify(variant.formStyles, null, 2)}`);
  return blocks.join(",\n\n");
}

VARIANTS.forEach((variant) => {
  mountVariant(variant);
  const defEl = document.getElementById(`variants-def-${variant.id}`);
  if (defEl) defEl.textContent = renderVariantDef(variant);
});

configInspector.setScenario(
  {
    component: "DynamicForm",
    props: {
      title: "Book a demo",
      fields: VARIANT_FIELDS,
      submit_text: "Request meeting",
    },
    formStyles: VARIANTS[0].formStyles,
    themeOverrides: VARIANTS[0].themeOverrides,
  },
  "Layout variant · compact",
);

setupTabs("variants-tabs");

function setupTabs(rootId: string): void {
  const root = document.getElementById(rootId);
  if (!root) return;
  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const panels = Array.from(root.querySelectorAll<HTMLElement>('[role="tabpanel"]'));
  function activate(tabId: string): void {
    tabs.forEach((tab) => {
      const isActive = tab.dataset.tabId === tabId;
      tab.setAttribute("aria-selected", String(isActive));
      tab.tabIndex = isActive ? 0 : -1;
    });
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.tabPanel !== tabId;
    });
    const variant = VARIANTS.find((v) => v.id === tabId);
    if (variant) {
      configInspector.setScenario(
        {
          component: "DynamicForm",
          props: {
            title: "Book a demo",
            fields: VARIANT_FIELDS,
            submit_text: "Request meeting",
          },
          formStyles: variant.formStyles,
          themeOverrides: variant.themeOverrides,
        },
        `Layout variant · ${tabId}`,
      );
    }
  }
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const id = tab.dataset.tabId;
      if (id) activate(id);
    });
    tab.addEventListener("keydown", (event) => {
      const idx = tabs.indexOf(tab);
      let nextIdx: number | null = null;
      if (event.key === "ArrowRight") nextIdx = (idx + 1) % tabs.length;
      else if (event.key === "ArrowLeft") nextIdx = (idx - 1 + tabs.length) % tabs.length;
      else if (event.key === "Home") nextIdx = 0;
      else if (event.key === "End") nextIdx = tabs.length - 1;
      if (nextIdx === null) return;
      event.preventDefault();
      const next = tabs[nextIdx];
      const id = next.dataset.tabId;
      if (id) {
        activate(id);
        next.focus();
      }
    });
  });
}
