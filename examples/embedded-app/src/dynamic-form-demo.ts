import "@runtypelabs/persona/widget.css";
import { renderDemoScaffold } from "./demo-scaffold";
import "./index.css";
import "./App.css";

import {
  componentRegistry,
  createLocalStorageAdapter,
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetConfig,
  type AgentWidgetController,
} from "@runtypelabs/persona";

import {
  DynamicForm,
  ProductCard,
  SimpleChart,
  StatusBadge,
  InfoCard,
  type DynamicFormStyles,
} from "./components";
import { setupMountMode, runWidgetMountWithInspector, squareInlinePanel } from "./mount-mode";
import {
  createDemoConfigInspector,
  reportDemoConfig,
} from "./demo-config-inspector";
import { highlightVariantConfig } from "./dynamic-form-code-highlight";
import type { Mode } from "./examples-nav";

renderDemoScaffold({ slug: "dynamic-components" });

const configInspector = createDemoConfigInspector({ title: "Dynamic Components" });

componentRegistry.register("DynamicForm", DynamicForm);
componentRegistry.register("ProductCard", ProductCard);
componentRegistry.register("SimpleChart", SimpleChart);
componentRegistry.register("StatusBadge", StatusBadge);
componentRegistry.register("InfoCard", InfoCard);

const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const proxyUrl =
  import.meta.env.VITE_PROXY_URL
    ? `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch-component`
    : `http://localhost:${proxyPort}/api/chat/dispatch-component`;

let activeController: AgentWidgetController | null = null;
let activeMountMode: Mode = "inline";
let previewIndex = 0;

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
] satisfies Array<{
  label: string;
  type?: "text" | "email" | "tel" | "date" | "time" | "textarea" | "number" | "url";
  required?: boolean;
  width?: "full" | "half";
  placeholder?: string;
}>;

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

let selectedVariant = VARIANTS[0];

function buildFormProps(variant = selectedVariant) {
  return {
    title: "Schedule a demo",
    description: "Share your details: we'll follow up to confirm.",
    fields: VARIANT_FIELDS,
    submit_text: "Request meeting",
    styles: variant.formStyles,
    demo_variant: variant.id,
  };
}

const buildConfig = (mode: Mode): AgentWidgetConfig => {
  const isLauncher = mode === "launcher";
  return {
    ...DEFAULT_WIDGET_CONFIG,
    apiUrl: proxyUrl,
    storageAdapter: createLocalStorageAdapter(
      `persona-state-dynamic-components-${mode}`,
    ),
    parserType: "json",
    enableComponentStreaming: true,
    wrapComponentDirectiveInBubble: false,
    formEndpoint: "/form",
    launcher: {
      ...DEFAULT_WIDGET_CONFIG.launcher,
      enabled: isLauncher,
      width: isLauncher ? "min(420px, 95vw)" : "100%",
      title: isLauncher ? "Dynamic Components" : undefined,
      subtitle: isLauncher ? "Streams forms, cards, charts, and badges" : undefined,
      agentIconText: isLauncher ? "📋" : undefined,
      autoExpand: isLauncher ? false : undefined,
    },
    theme: {
      ...DEFAULT_WIDGET_CONFIG.theme,
      primary: isLauncher ? "#020617" : "#111827",
      accent: "#6366f1",
      surface: "#ffffff",
      muted: "#64748b",
      ...selectedVariant.themeOverrides,
    },
    features: {
      ...DEFAULT_WIDGET_CONFIG.features,
      showReasoning: true,
      showToolCalls: true,
    },
    copy: {
      ...DEFAULT_WIDGET_CONFIG.copy,
      welcomeTitle: "Dynamic Components Demo",
      welcomeSubtitle:
        "Ask for a form, product card, chart, status badge, or info card.",
    },
    suggestionChips: [
      "Can you schedule a demo for me?",
      "Show me a product card",
      "Display a chart with data",
      "Create a status badge",
    ],
    formStyles: {
      ...selectedVariant.formStyles,
      ...(isLauncher
        ? {
          borderRadius: "6px",
          borderWidth: "1px",
          borderColor: "#e5e7eb",
          padding: "1.25rem",
          titleFontSize: "1.25rem",
          buttonBorderRadius: "6px",
        }
        : {}),
    },
    postprocessMessage: ({ text }) => markdownPostprocessor(text),
  } as AgentWidgetConfig;
};

setupMountMode({
  slug: "dynamic-components",
  modes: ["inline", "launcher"],
  mount: (mode, { stage }) => {
    activeMountMode = mode;
    const { controller, teardown } = runWidgetMountWithInspector(
      configInspector,
      mode,
      stage,
      buildConfig,
    );
    activeController = controller;
    applyVariantToActivePreview(selectedVariant, { injectForm: false });
    return () => {
      teardown();
      activeController = null;
    };
  },
});

document.getElementById("dynamic-form-preview")?.addEventListener("click", () => {
  applyVariantToActivePreview(selectedVariant);
});

type PreviewDirective = {
  label: string;
  component: string;
  text: string;
  props: Record<string, unknown>;
};

const componentPreviews: Record<string, PreviewDirective> = {
  product: {
    label: "Product card",
    component: "ProductCard",
    text: "Preview: a streamed ProductCard component.",
    props: {
      id: "cashmere-crewneck",
      title: "Mongolian Cashmere Crewneck",
      price: 248,
      description: "A soft product card rendered from a JSON component directive.",
      image: "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=600&h=750&fit=crop",
    },
  },
  chart: {
    label: "Chart",
    component: "SimpleChart",
    text: "Preview: a streamed SimpleChart component.",
    props: {
      title: "Quarterly pipeline",
      data: [42, 68, 91, 76],
      labels: ["Q1", "Q2", "Q3", "Q4"],
    },
  },
  status: {
    label: "Status badge",
    component: "StatusBadge",
    text: "Preview: a streamed StatusBadge component.",
    props: {
      status: "success",
      message: "Account verified",
    },
  },
  info: {
    label: "Info card",
    component: "InfoCard",
    text: "Preview: a streamed InfoCard component.",
    props: {
      title: "Next step",
      content: "The same directive path can render any host-provided UI component.",
      icon: "i",
    },
  },
};

document.querySelectorAll<HTMLButtonElement>("[data-component-preview]").forEach((button) => {
  button.addEventListener("click", () => {
    if (!activeController) return;
    const preview = componentPreviews[button.dataset.componentPreview ?? ""];
    if (!preview) return;
    previewIndex += 1;
    activeController.injectComponentDirective({
      id: `preview-${preview.component}-${previewIndex}`,
      component: preview.component,
      text: preview.text,
      props: preview.props,
      llmContent: `[Demo: previewed ${preview.component} via injectComponentDirective.]`,
    });
    configInspector.setScenario(
      { component: preview.component, props: preview.props },
      `injectComponentDirective payload · ${preview.label}`,
    );
  });
});

// ---------------------------------------------------------------------------
// Layout variants: same DynamicForm directive, different config on the live
// preview widget. The tabs update the right-side preview instead of mounting
// duplicate mini widgets in the configure rail.
// ---------------------------------------------------------------------------

function renderVariantDef(variant: (typeof VARIANTS)[number]): string {
  const blocks: string[] = [];
  if (Object.keys(variant.themeOverrides).length > 0) {
    blocks.push(`theme: ${JSON.stringify(variant.themeOverrides, null, 2)}`);
  }
  blocks.push(`formStyles: ${JSON.stringify(variant.formStyles, null, 2)}`);
  return blocks.join(",\n\n");
}

const variantDefEl = document.getElementById("variants-def");
function updateVariantDef(variant: (typeof VARIANTS)[number]): void {
  if (variantDefEl) variantDefEl.innerHTML = highlightVariantConfig(renderVariantDef(variant));
}

updateVariantDef(selectedVariant);

function getVariantScenario(variant: (typeof VARIANTS)[number]) {
  return {
    component: "DynamicForm",
    props: buildFormProps(variant),
    formStyles: variant.formStyles,
    themeOverrides: variant.themeOverrides,
  };
}

function runtimeConfigForActiveMode(): AgentWidgetConfig {
  const config = buildConfig(activeMountMode);
  return activeMountMode === "inline" ? squareInlinePanel(config) : config;
}

function applyVariantToActivePreview(
  variant: (typeof VARIANTS)[number],
  options: { injectForm?: boolean } = {},
): void {
  selectedVariant = variant;
  updateVariantDef(variant);

  const scenario = getVariantScenario(variant);
  configInspector.setScenario(scenario, `Layout variant · ${variant.id}`);
  reportDemoConfig(configInspector, {
    config: buildConfig(activeMountMode),
    mode: activeMountMode,
  });

  if (!activeController) return;
  activeController.update(runtimeConfigForActiveMode());
  if (options.injectForm === false) return;

  activeController.injectComponentDirective({
    id: "dynamic-components-form-preview",
    component: "DynamicForm",
    text: "Preview: this is the same DynamicForm the AI would emit.",
    props: buildFormProps(variant),
    llmContent:
      "[Demo: previewed booking form via injectComponentDirective. Not a user request.]",
  });
}

configInspector.setScenario(
  getVariantScenario(selectedVariant),
  "Layout variant · compact",
);

setupTabs("variants-tabs");

function setupTabs(rootId: string): void {
  const root = document.getElementById(rootId);
  if (!root) return;
  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  function activate(tabId: string): void {
    tabs.forEach((tab) => {
      const isActive = tab.dataset.tabId === tabId;
      tab.setAttribute("aria-selected", String(isActive));
      tab.tabIndex = isActive ? 0 : -1;
    });
    const variant = VARIANTS.find((v) => v.id === tabId);
    if (variant) applyVariantToActivePreview(variant);
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
