import "@runtypelabs/persona/widget.css";

import {
  initAgentWidget,
  componentRegistry,
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetConfig,
  type ComponentRenderer,
  type AgentWidgetInitHandle,
} from "@runtypelabs/persona";

const ArtifactDemoPill: ComponentRenderer = (props) => {
  const el = document.createElement("div");
  el.textContent = String(props.label ?? "Demo pill");
  el.style.cssText =
    "display:inline-block;padding:0.35rem 0.75rem;border-radius:999px;background:#0ea5e9;color:#0c1222;font-weight:600;font-size:0.9rem;";
  return el;
};

componentRegistry.register("ArtifactDemoPill", ArtifactDemoPill);

const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const proxyUrl =
  import.meta.env.VITE_PROXY_URL
    ? `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch`
    : `http://localhost:${proxyPort}/api/chat/dispatch`;

const artifactDemoConfigBase: Partial<AgentWidgetConfig> = {
  ...DEFAULT_WIDGET_CONFIG,
  apiUrl: proxyUrl,
  postprocessMessage: ({ text }) => markdownPostprocessor(text),
  features: {
    showEventStreamToggle: true,
    artifacts: {
      enabled: true,
      allowedTypes: ["markdown", "component"],
    },
  },
  copy: {
    ...DEFAULT_WIDGET_CONFIG.copy,
    welcomeTitle: "Artifacts demo",
    welcomeSubtitle: "Use the toolbar buttons above or chat with the proxy.",
    inputPlaceholder: "Message the model…",
  },
};

const embedRoot = document.getElementById("artifact-root");
if (!embedRoot) throw new Error("#artifact-root missing");

const handle: AgentWidgetInitHandle = initAgentWidget({
  target: embedRoot,
  useShadowDom: false,
  windowKey: "personaArtifactDemo",
  config: {
    ...artifactDemoConfigBase,
    launcher: {
      ...DEFAULT_WIDGET_CONFIG.launcher,
      enabled: false,
      autoExpand: true,
      width: "100%",
    },
    layout: { showHeader: false },
  },
});

handle.open();

document.getElementById("btn-md")?.addEventListener("click", () => {
  handle.upsertArtifact({
    artifactType: "markdown",
    title: "Sample",
    content: "## Hello\n\nThis **markdown** artifact was injected from the demo toolbar.",
  });
});

document.getElementById("btn-comp")?.addEventListener("click", () => {
  handle.upsertArtifact({
    artifactType: "component",
    title: "Pill",
    component: "ArtifactDemoPill",
    props: { label: "Registered component" },
  });
});

document.getElementById("btn-unknown")?.addEventListener("click", () => {
  handle.upsertArtifact({
    artifactType: "component",
    title: "Missing registry entry",
    component: "TotallyUnknownWidget",
    props: { foo: "bar" },
  });
});

document.getElementById("btn-clear")?.addEventListener("click", () => {
  handle.clearChat();
});
