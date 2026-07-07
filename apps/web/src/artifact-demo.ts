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
import {
  createDemoConfigInspector,
  reportDemoConfig,
} from "./demo-config-inspector";
import { renderDemoScaffold } from "./demo-scaffold";
import {
  setupMountMode,
  renderInlineMount,
  renderLauncherScene,
  squareInlinePanel,
  type Mode,
} from "./mount-mode";
import { createArtifactDemoStream, type ArtifactDemoButton } from "./artifact-demo-sse";

renderDemoScaffold({ slug: "artifact-demo" });

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
    welcomeSubtitle:
      "Use the artifact buttons to replay a scripted agent turn. Each button streams the real artifact wire frames, so the reference card appears in the chat.",
    inputPlaceholder: "Message the model…",
  },
  suggestionChips: [],
};

const configInspector = createDemoConfigInspector({
  title: "Artifact Sidebar",
  root: "[data-config-inspector]",
});

// ── Card loading animation controls ─────────────────────────────────────
// The rail lets visitors pick the animation for the reference card's
// "Generating…" status (features.artifacts.loadingAnimation & friends). The
// values live in the DOM controls, and buildArtifactsFeature() reads them each
// time a config is built, so both the initial mount, a mode re-mount, and a
// live handle.update() all see the current selection.
type ArtifactAnimationMode =
  | "none"
  | "pulse"
  | "shimmer"
  | "shimmer-color"
  | "rainbow";

const ANIMATION_DEFAULTS = {
  mode: "shimmer" as ArtifactAnimationMode,
  duration: 2000,
  primary: "#0ea5e9",
  secondary: "#3b82f6",
};

const getEl = <T extends HTMLElement>(id: string): T | null =>
  document.getElementById(id) as T | null;

const readAnimationControls = () => {
  const activeModeBtn = document.querySelector<HTMLButtonElement>(
    "#artifact-anim-mode .mode-btn.active",
  );
  const mode = (activeModeBtn?.dataset.mode ??
    ANIMATION_DEFAULTS.mode) as ArtifactAnimationMode;
  const durationEl = getEl<HTMLInputElement>("artifact-anim-duration");
  const duration = durationEl
    ? parseInt(durationEl.value, 10)
    : ANIMATION_DEFAULTS.duration;
  const primary =
    getEl<HTMLInputElement>("artifact-color-primary")?.value ??
    ANIMATION_DEFAULTS.primary;
  const secondary =
    getEl<HTMLInputElement>("artifact-color-secondary")?.value ??
    ANIMATION_DEFAULTS.secondary;
  return { mode, duration, primary, secondary };
};

// Build the features.artifacts block from the base config plus the current
// animation control selection. Color options are only sent for shimmer-color.
const buildArtifactsFeature = () => {
  const { mode, duration, primary, secondary } = readAnimationControls();
  return {
    ...artifactDemoConfigBase.features?.artifacts,
    loadingAnimation: mode,
    loadingAnimationDuration: duration,
    ...(mode === "shimmer-color"
      ? {
          loadingAnimationColor: primary,
          loadingAnimationSecondaryColor: secondary,
        }
      : {}),
  };
};

const buildConfig = (mode: Mode): AgentWidgetConfig =>
  ({
    ...artifactDemoConfigBase,
    features: {
      ...artifactDemoConfigBase.features,
      artifacts: buildArtifactsFeature(),
    },
    launcher:
      mode === "launcher"
        ? {
            ...DEFAULT_WIDGET_CONFIG.launcher,
            enabled: true,
            autoExpand: true,
            width: "480px",
            position: "bottom-right",
          }
        : {
            ...DEFAULT_WIDGET_CONFIG.launcher,
            enabled: false,
            autoExpand: true,
            width: "100%",
            fullHeight: true,
          },
    layout: { showHeader: false },
  }) as AgentWidgetConfig;

// Reassigned on every mode switch; the artifact toolbar buttons below read it
// lazily so they always target the current widget.
let handle: AgentWidgetInitHandle | null = null;
// Tracks the current mount mode so live animation-control updates rebuild the
// config with the right launcher/inline chrome.
let activeMountMode: Mode = "inline";

setupMountMode({
  slug: "artifact-demo",
  modes: ["inline", "launcher"],
  mount: (mode, { stage }) => {
    activeMountMode = mode;
    const config = buildConfig(mode);
    reportDemoConfig(configInspector, { config, mode });
    // Both modes use initAgentWidget so the handle (connectStream / clearChat /
    // open) is identical; only the mount target and launcher chrome differ.
    const target =
      mode === "launcher"
        ? renderLauncherScene(stage).mountEl
        : renderInlineMount(stage);
    if (mode !== "launcher") target.style.height = "100%";
    handle = initAgentWidget({
      target,
      useShadowDom: false,
      windowKey: "personaArtifactDemo",
      config: mode === "launcher" ? config : squareInlinePanel(config),
    });
    handle.open();
    return () => {
      handle?.destroy();
      handle = null;
    };
  },
});

// The artifact buttons drive MOCK SSE STREAMING through the widget's real
// pipeline (see artifact-demo-sse.ts), not the programmatic upsertArtifact() API.
// Each click replays the wire frames a real agent emits, so the in-chat
// reference card streams from "Generating\u2026" to done with a Download button, the
// side pane fills from artifact_delta chunks, and the status dot animates.
//
// `connectStream` no-ops if a stream is already running, so we serialize clicks
// through a promise chain: overlapping clicks queue instead of getting dropped.
// A per-click counter keeps every stream's execution/artifact ids unique, so
// repeated clicks create separate cards.
let clickSeq = 0;
let streamQueue: Promise<void> = Promise.resolve();

const runArtifactStream = (button: ArtifactDemoButton): void => {
  streamQueue = streamQueue.then(() => {
    if (!handle) return;
    clickSeq += 1;
    return handle.connectStream(createArtifactDemoStream(button, clickSeq));
  });
};

const wireButton = (id: string, button: ArtifactDemoButton): void => {
  document.getElementById(id)?.addEventListener("click", () => runArtifactStream(button));
};

wireButton("btn-md", "md");
wireButton("btn-html-file", "html-file");
wireButton("btn-react-file", "react-file");
wireButton("btn-comp", "comp");
wireButton("btn-unknown", "unknown");

document.getElementById("btn-clear")?.addEventListener("click", () => {
  // clearChat() only wipes the transcript, so also clear the artifact registry
  // and pane for a full reset.
  handle?.clearChat();
  handle?.clearArtifacts();
});

// ── Wire the card loading animation controls ─────────────────────────────
// Every control applies live via handle.update(): the widget re-applies
// features + re-renders the transcript in place (no messages lost), so the
// change lands on the NEXT streamed card and, because cards read their config
// at render time and re-render on each artifact_delta, on any in-flight card
// too. No re-mount: the widget is only re-created on a mount-mode switch.
const colorSection = document.getElementById("artifact-color-section");
const syncColorSectionVisibility = (mode: ArtifactAnimationMode): void => {
  if (colorSection) {
    colorSection.style.display = mode === "shimmer-color" ? "" : "none";
  }
};

const applyAnimationConfig = (): void => {
  const config = buildConfig(activeMountMode);
  handle?.update(
    activeMountMode === "launcher" ? config : squareInlinePanel(config),
  );
  reportDemoConfig(configInspector, { config, mode: activeMountMode });
};

const modeGroup = document.getElementById("artifact-anim-mode");
modeGroup?.addEventListener("click", (event) => {
  const btn = (event.target as HTMLElement).closest<HTMLButtonElement>(".mode-btn");
  if (!btn) return;
  modeGroup
    .querySelectorAll(".mode-btn")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  syncColorSectionVisibility(btn.dataset.mode as ArtifactAnimationMode);
  applyAnimationConfig();
});
// Default mode is shimmer, so the color options start hidden.
syncColorSectionVisibility(ANIMATION_DEFAULTS.mode);

const durationSlider = getEl<HTMLInputElement>("artifact-anim-duration");
const durationLabel = document.getElementById("artifact-anim-duration-label");
durationSlider?.addEventListener("input", () => {
  if (durationLabel) durationLabel.textContent = `${durationSlider.value}ms`;
  applyAnimationConfig();
});

getEl<HTMLInputElement>("artifact-color-primary")?.addEventListener(
  "input",
  applyAnimationConfig,
);
getEl<HTMLInputElement>("artifact-color-secondary")?.addEventListener(
  "input",
  applyAnimationConfig,
);

document.getElementById("btn-anim-reset")?.addEventListener("click", () => {
  modeGroup
    ?.querySelectorAll(".mode-btn")
    .forEach((b) =>
      b.classList.toggle(
        "active",
        (b as HTMLButtonElement).dataset.mode === ANIMATION_DEFAULTS.mode,
      ),
    );
  if (durationSlider) durationSlider.value = String(ANIMATION_DEFAULTS.duration);
  if (durationLabel) durationLabel.textContent = `${ANIMATION_DEFAULTS.duration}ms`;
  const primaryEl = getEl<HTMLInputElement>("artifact-color-primary");
  const secondaryEl = getEl<HTMLInputElement>("artifact-color-secondary");
  if (primaryEl) primaryEl.value = ANIMATION_DEFAULTS.primary;
  if (secondaryEl) secondaryEl.value = ANIMATION_DEFAULTS.secondary;
  syncColorSectionVisibility(ANIMATION_DEFAULTS.mode);
  applyAnimationConfig();
});
