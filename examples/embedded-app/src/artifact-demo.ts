import "@runtypelabs/persona/widget.css";

import {
  initAgentWidget,
  componentRegistry,
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetArtifactsLayoutConfig,
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
  import.meta.env.VITE_PROXY_URL ?
    `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch` :
    `http://localhost:${proxyPort}/api/chat/dispatch`;

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
    welcomeSubtitle: "Use the toolbar or chat with the proxy.",
    inputPlaceholder: "Message the model…",
  },
};

const embedRoot = document.getElementById("artifact-root");
if (!embedRoot) throw new Error("#artifact-root missing");

const inlineHandle: AgentWidgetInitHandle = initAgentWidget({
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
    layout: {
      showHeader: false,
    },
    copy: {
      ...artifactDemoConfigBase.copy,
      welcomeSubtitle: "Use the toolbar buttons above or chat with the proxy.",
    },
  },
});

inlineHandle.open();

const launcherMount = document.getElementById("artifact-launcher-root");
if (!launcherMount) throw new Error("#artifact-launcher-root missing");

/** Fixed launcher fields; `width` is overridden by demo toolbar state. */
const LAUNCHER_DEMO_LAUNCHER_BASE = {
  ...DEFAULT_WIDGET_CONFIG.launcher,
  enabled: true,
  autoExpand: false,
  title: "Artifacts (launcher)",
  subtitle: "Floating trigger — artifacts sidebar inside the panel",
  agentIconText: "✨",
  position: "bottom-right" as const,
  width: "min(400px, calc(100vw - 24px))",
  iconUrl: "https://dummyimage.com/96x96/0ea5e9/0c1222&text=A",
};

let launcherDemoBaseWidth: string = LAUNCHER_DEMO_LAUNCHER_BASE.width;
let launcherDemoArtifactLayout: AgentWidgetArtifactsLayoutConfig = {};
let launcherDemoResizable = false;
let launcherDemoPaneAppearance: AgentWidgetArtifactsLayoutConfig["paneAppearance"] | undefined;
let launcherDemoUnifiedSplitChrome = false;

const launcherHandle: AgentWidgetInitHandle = initAgentWidget({
  target: launcherMount,
  useShadowDom: false,
  windowKey: "personaArtifactLauncherDemo",
  config: {
    ...artifactDemoConfigBase,
    persistState: {
      keyPrefix: "artifact-demo-launcher-",
    },
    theme: {
      ...DEFAULT_WIDGET_CONFIG.theme,
      launcherRadius: ".5rem",
    },
    // Default artifact layout: gap + separator, drawer when the panel is narrow (<520px),
    // and temporary widen to ~720px while artifacts are visible (see features.artifacts.layout).
    launcher: LAUNCHER_DEMO_LAUNCHER_BASE,
    layout: {
      ...DEFAULT_WIDGET_CONFIG.layout,
      showHeader: true,
    },
  },
});

function syncLauncherArtifactSizing() {
  const mergedLayout: AgentWidgetArtifactsLayoutConfig = { ...launcherDemoArtifactLayout };
  if (launcherDemoResizable) {
    mergedLayout.resizable = true;
  } else {
    delete mergedLayout.resizable;
  }
  if (launcherDemoPaneAppearance) {
    mergedLayout.paneAppearance = launcherDemoPaneAppearance;
  } else {
    delete mergedLayout.paneAppearance;
  }
  if (launcherDemoUnifiedSplitChrome) {
    mergedLayout.unifiedSplitChrome = true;
  } else {
    delete mergedLayout.unifiedSplitChrome;
  }
  const layout =
    Object.keys(mergedLayout).length > 0 ? mergedLayout : undefined;
  launcherHandle.update({
    launcher: {
      ...LAUNCHER_DEMO_LAUNCHER_BASE,
      width: launcherDemoBaseWidth,
    },
    features: {
      showEventStreamToggle: true,
      artifacts: {
        enabled: true,
        allowedTypes: ["markdown", "component"],
        ...(layout ? { layout } : {}),
      },
    },
  });
}

/** Open floating panel first so the artifact pane is mounted and visible. */
function withLauncherOpen(run: (h: AgentWidgetInitHandle) => void) {
  launcherHandle.open();
  run(launcherHandle);
}

document.getElementById("btn-md")?.addEventListener("click", () => {
  inlineHandle.upsertArtifact({
    artifactType: "markdown",
    title: "Sample",
    content: "## Hello\n\nThis **markdown** artifact was injected from the demo toolbar.",
  });
});

document.getElementById("btn-comp")?.addEventListener("click", () => {
  inlineHandle.upsertArtifact({
    artifactType: "component",
    title: "Pill",
    component: "ArtifactDemoPill",
    props: { label: "Registered component" },
  });
});

document.getElementById("btn-unknown")?.addEventListener("click", () => {
  inlineHandle.upsertArtifact({
    artifactType: "component",
    title: "Missing registry entry",
    component: "TotallyUnknownWidget",
    props: { foo: "bar" },
  });
});

document.getElementById("btn-clear")?.addEventListener("click", () => {
  inlineHandle.clearChat();
});

document.getElementById("btn-md-launcher")?.addEventListener("click", () => {
  withLauncherOpen((h) =>
    h.upsertArtifact({
      artifactType: "markdown",
      title: "Sample",
      content: "## From launcher\n\n**Markdown** artifact injected after opening the floating chat.",
    })
  );
});

document.getElementById("btn-comp-launcher")?.addEventListener("click", () => {
  withLauncherOpen((h) =>
    h.upsertArtifact({
      artifactType: "component",
      title: "Pill",
      component: "ArtifactDemoPill",
      props: { label: "Launcher widget" },
    })
  );
});

document.getElementById("btn-unknown-launcher")?.addEventListener("click", () => {
  withLauncherOpen((h) =>
    h.upsertArtifact({
      artifactType: "component",
      title: "Unknown (launcher)",
      component: "TotallyUnknownWidget",
      props: { source: "launcher" },
    })
  );
});

document.getElementById("btn-clear-launcher")?.addEventListener("click", () => {
  withLauncherOpen((h) => h.clearChat());
});

document.querySelectorAll("#toolbar-launcher-width [data-launcher-width]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const w = (btn as HTMLElement).dataset.launcherWidth;
    if (!w) return;
    launcherDemoBaseWidth = w;
    syncLauncherArtifactSizing();
  });
});

document.querySelectorAll("#toolbar-artifact-expanded [data-expanded-width]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const v = (btn as HTMLElement).dataset.expandedWidth;
    if (!v) return;
    launcherDemoArtifactLayout = { ...launcherDemoArtifactLayout };
    if (v === "min(720px, calc(100vw - 24px))") {
      delete launcherDemoArtifactLayout.expandedPanelWidth;
    } else {
      launcherDemoArtifactLayout.expandedPanelWidth = v;
    }
    syncLauncherArtifactSizing();
  });
});

document.querySelectorAll("#toolbar-artifact-pane [data-pane]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const preset = (btn as HTMLElement).dataset.pane;
    launcherDemoArtifactLayout = { ...launcherDemoArtifactLayout };
    if (preset === "40") {
      delete launcherDemoArtifactLayout.paneWidth;
      delete launcherDemoArtifactLayout.paneMaxWidth;
    } else if (preset === "32") {
      launcherDemoArtifactLayout.paneWidth = "32%";
      launcherDemoArtifactLayout.paneMaxWidth = "22rem";
    } else if (preset === "48") {
      launcherDemoArtifactLayout.paneWidth = "48%";
      launcherDemoArtifactLayout.paneMaxWidth = "32rem";
    }
    syncLauncherArtifactSizing();
  });
});

document.querySelectorAll("#toolbar-artifact-narrow [data-narrow]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const raw = (btn as HTMLElement).dataset.narrow;
    const px = raw ? Number(raw) : NaN;
    if (!Number.isFinite(px)) return;
    launcherDemoArtifactLayout = { ...launcherDemoArtifactLayout };
    if (px === 520) {
      delete launcherDemoArtifactLayout.narrowHostMaxWidth;
    } else {
      launcherDemoArtifactLayout.narrowHostMaxWidth = px;
    }
    syncLauncherArtifactSizing();
  });
});

document.getElementById("btn-artifact-layout-reset")?.addEventListener("click", () => {
  launcherDemoBaseWidth = LAUNCHER_DEMO_LAUNCHER_BASE.width;
  launcherDemoArtifactLayout = {};
  launcherDemoResizable = false;
  launcherDemoPaneAppearance = undefined;
  launcherDemoUnifiedSplitChrome = false;
  syncLauncherArtifactSizing();
});

document.getElementById("btn-unified-on")?.addEventListener("click", () => {
  launcherDemoUnifiedSplitChrome = true;
  syncLauncherArtifactSizing();
});

document.getElementById("btn-unified-off")?.addEventListener("click", () => {
  launcherDemoUnifiedSplitChrome = false;
  syncLauncherArtifactSizing();
});

document.querySelectorAll("#toolbar-artifact-appearance [data-appearance]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const v = (btn as HTMLElement).dataset.appearance as
      | AgentWidgetArtifactsLayoutConfig["paneAppearance"]
      | undefined;
    if (v !== "panel" && v !== "seamless") return;
    launcherDemoPaneAppearance = v;
    syncLauncherArtifactSizing();
  });
});

document.querySelectorAll("#toolbar-artifact-border [data-border-left]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const v = (btn as HTMLElement).dataset.borderLeft;
    if (!v) return;
    launcherDemoArtifactLayout = { ...launcherDemoArtifactLayout };
    delete launcherDemoArtifactLayout.paneBorder;
    launcherDemoArtifactLayout.paneBorderLeft = v;
    syncLauncherArtifactSizing();
  });
});

document.querySelectorAll("#toolbar-artifact-border [data-border-full]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const v = (btn as HTMLElement).dataset.borderFull;
    if (!v) return;
    launcherDemoArtifactLayout = { ...launcherDemoArtifactLayout };
    delete launcherDemoArtifactLayout.paneBorderLeft;
    launcherDemoArtifactLayout.paneBorder = v;
    syncLauncherArtifactSizing();
  });
});

document.getElementById("btn-artifact-border-clear")?.addEventListener("click", () => {
  launcherDemoArtifactLayout = { ...launcherDemoArtifactLayout };
  delete launcherDemoArtifactLayout.paneBorder;
  delete launcherDemoArtifactLayout.paneBorderLeft;
  syncLauncherArtifactSizing();
});

document.querySelectorAll("#toolbar-artifact-radius-shadow [data-radius]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const v = (btn as HTMLElement).dataset.radius;
    if (!v) return;
    launcherDemoArtifactLayout = { ...launcherDemoArtifactLayout };
    launcherDemoArtifactLayout.paneBorderRadius = v;
    syncLauncherArtifactSizing();
  });
});

document.querySelectorAll("#toolbar-artifact-radius-shadow [data-shadow]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const v = (btn as HTMLElement).dataset.shadow;
    if (!v) return;
    launcherDemoArtifactLayout = { ...launcherDemoArtifactLayout };
    launcherDemoArtifactLayout.paneShadow = v;
    syncLauncherArtifactSizing();
  });
});

document.getElementById("btn-artifact-radius-shadow-clear")?.addEventListener("click", () => {
  launcherDemoArtifactLayout = { ...launcherDemoArtifactLayout };
  delete launcherDemoArtifactLayout.paneBorderRadius;
  delete launcherDemoArtifactLayout.paneShadow;
  syncLauncherArtifactSizing();
});

document.getElementById("btn-resize-on")?.addEventListener("click", () => {
  launcherDemoResizable = true;
  syncLauncherArtifactSizing();
});

document.getElementById("btn-resize-off")?.addEventListener("click", () => {
  launcherDemoResizable = false;
  syncLauncherArtifactSizing();
});
