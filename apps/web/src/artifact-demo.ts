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
      "Use the artifact buttons to replay a scripted agent turn. Each button streams the real artifact wire frames, rendered per the selected display mode (panel, card, or inline).",
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

// ── Display mode control ────────────────────────────────────────────────
// Same DOM-is-the-source-of-truth pattern as the animation controls: the
// active pill in #artifact-display-mode is read on every config build, so the
// selection survives mount-mode re-mounts and applies via handle.update().
type ArtifactDisplayMode = "panel" | "card" | "inline";

const DISPLAY_DEFAULT: ArtifactDisplayMode = "panel";

const readDisplayMode = (): ArtifactDisplayMode => {
  const activeBtn = document.querySelector<HTMLButtonElement>(
    "#artifact-display-mode .mode-btn.active",
  );
  return (activeBtn?.dataset.mode ?? DISPLAY_DEFAULT) as ArtifactDisplayMode;
};

// Same DOM-is-the-source-of-truth pattern: the active pill in
// #artifact-expand-toggle is read on every config build. Off (the default)
// omits showExpandToggle from the layout block; On sends it as true.
const readExpandToggle = (): boolean => {
  const activeBtn = document.querySelector<HTMLButtonElement>(
    "#artifact-expand-toggle .mode-btn.active",
  );
  return activeBtn?.dataset.mode === "on";
};

// Same DOM-is-the-source-of-truth pattern: the active pill in
// #artifact-custom-actions is read on every config build. Off (the default)
// omits the actions entirely; On spreads in the sample toolbar/card/inline actions.
const readCustomActions = (): boolean => {
  const activeBtn = document.querySelector<HTMLButtonElement>(
    "#artifact-custom-actions .mode-btn.active",
  );
  return activeBtn?.dataset.mode === "on";
};

// Same DOM-is-the-source-of-truth pattern: the active pill in
// #artifact-inline-chrome is read on every config build. On (the default) keeps
// the inline file-preview chrome; Off sends inlineChrome: false for a bare body.
const readInlineChrome = (): boolean => {
  const activeBtn = document.querySelector<HTMLButtonElement>(
    "#artifact-inline-chrome .mode-btn.active",
  );
  return activeBtn?.dataset.mode !== "off";
};

// ── Streaming body controls (inline display mode only) ───────────────────
// Same DOM-is-the-source-of-truth pattern as the other rail controls: the
// active pill in each #artifact-* group is read on every config build, so the
// selection survives mount-mode re-mounts and applies via handle.update().
// Together they populate features.artifacts.inlineBody, which only affects
// display: "inline".
const readStreamingView = (): "source" | "status" => {
  const activeBtn = document.querySelector<HTMLButtonElement>(
    "#artifact-streaming-view .mode-btn.active",
  );
  return (activeBtn?.dataset.mode ?? "source") as "source" | "status";
};

// 320 (default) reserves a fixed-height scroll window; "auto" grows with
// content; "split" pins a fixed streaming height then lets the completed
// iframe grow (streaming 320 / complete auto).
const readBodyHeight = ():
  | number
  | "auto"
  | { streaming: number; complete: "auto" } => {
  const activeBtn = document.querySelector<HTMLButtonElement>(
    "#artifact-body-height .mode-btn.active",
  );
  const mode = activeBtn?.dataset.mode ?? "320";
  if (mode === "auto") return "auto";
  if (mode === "split") return { streaming: 320, complete: "auto" };
  return 320;
};

// top (default) → { top: true }; both → true (top and bottom); off → false.
const readFadeMask = (): boolean | { top: boolean } => {
  const activeBtn = document.querySelector<HTMLButtonElement>(
    "#artifact-fade-mask .mode-btn.active",
  );
  const mode = activeBtn?.dataset.mode ?? "top";
  if (mode === "both") return true;
  if (mode === "off") return false;
  return { top: true };
};

const readFollowOutput = (): boolean => {
  const activeBtn = document.querySelector<HTMLButtonElement>(
    "#artifact-follow-output .mode-btn.active",
  );
  return activeBtn?.dataset.mode !== "off";
};

const readBodyTransition = (): "auto" | "none" => {
  const activeBtn = document.querySelector<HTMLButtonElement>(
    "#artifact-body-transition .mode-btn.active",
  );
  return (activeBtn?.dataset.mode ?? "auto") as "auto" | "none";
};

// rendered (default) previews files in an iframe; source always shows raw
// highlighted source, the no-preview mode for code editor style hosts.
const readViewMode = (): "rendered" | "source" => {
  const activeBtn = document.querySelector<HTMLButtonElement>(
    "#artifact-view-mode .mode-btn.active",
  );
  return (activeBtn?.dataset.mode ?? "rendered") as "rendered" | "source";
};

// On (default) adds the inline chrome rendered/source toggle button via
// inlineChrome.showViewToggle; Off omits it. The widget auto-hides the button
// where only one view exists (streaming, plain markdown, source-only), so it
// only surfaces when a rendered preview is available.
const readViewToggle = (): boolean => {
  const activeBtn = document.querySelector<HTMLButtonElement>(
    "#artifact-view-toggle .mode-btn.active",
  );
  return activeBtn?.dataset.mode !== "off";
};

const buildInlineBody = () => ({
  streamingView: readStreamingView(),
  viewMode: readViewMode(),
  height: readBodyHeight(),
  fadeMask: readFadeMask(),
  followOutput: readFollowOutput(),
  transition: readBodyTransition(),
});

// ── Custom artifact actions (toolbar + card) ─────────────────────────────
// Demos features.artifacts.toolbarActions and .cardActions: host-defined
// buttons that receive the artifact context on click. Here they mimic a
// "Save to Drive" integration: report to the status line and console, never
// alert(). Each action carries a custom colorful icon to exercise the
// icon-factory path.
type ArtifactActionContext = {
  artifactId: string;
  title: string;
  artifactType: string;
  markdown?: string;
  file?: unknown;
  jsonPayload?: unknown;
};

let actionStatusTimeout: ReturnType<typeof setTimeout> | null = null;

const reportArtifactAction = (ctx: ArtifactActionContext): void => {
  // Full context to the console so the whole payload is inspectable.
  console.log("[artifact custom action]", ctx);
  const statusEl = document.getElementById("artifact-action-status");
  if (statusEl) {
    statusEl.textContent = `Saved "${ctx.title}" to Drive (demo)`;
    if (actionStatusTimeout) clearTimeout(actionStatusTimeout);
    actionStatusTimeout = setTimeout(() => {
      statusEl.textContent = "";
      actionStatusTimeout = null;
    }, 4000);
  }
};

// A recognizable colorful Drive-ish mark, built as an inline SVG so it
// exercises the custom-icon path (icon can be a () => SVGElement factory).
const createDriveIcon = (): SVGElement => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 87 78");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("aria-hidden", "true");
  const paths: Array<[string, string]> = [
    ["M6.6 66.85 10.45 73.5c.8 1.4 1.95 2.5 3.3 3.3L27.5 53.5H0c0 1.55.4 3.1 1.2 4.5z", "#0066da"],
    ["M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3L1.2 48c-.8 1.4-1.2 2.95-1.2 4.5h27.5z", "#00ac47"],
    ["M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75L86.2 57.5c.8-1.4 1.2-2.95 1.2-4.5H59.9l5.85 11.5z", "#ea4335"],
    ["M43.65 25 57.4 1.2c-1.35-.8-2.9-1.2-4.5-1.2H34.4c-1.6 0-3.15.45-4.5 1.2z", "#00832d"],
    ["M59.9 53.5H27.5L13.75 77.3c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z", "#2684fc"],
    ["M73.4 26.5 60.75 4.5c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.9 53.5h27.45c0-1.55-.4-3.1-1.2-4.5z", "#ffba00"],
  ];
  for (const [d, fill] of paths) {
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", d);
    p.setAttribute("fill", fill);
    svg.appendChild(p);
  }
  return svg;
};

const buildCustomActions = () => ({
  toolbarActions: [
    {
      id: "drive-toolbar",
      label: "Save to Drive",
      icon: createDriveIcon,
      onClick: reportArtifactAction,
    },
  ],
  cardActions: [
    {
      id: "drive-card",
      label: "Save to Drive",
      icon: createDriveIcon,
      showLabel: true,
      onClick: reportArtifactAction,
    },
  ],
  inlineActions: [
    {
      id: "log-inline",
      label: "Log",
      icon: createDriveIcon,
      onClick: reportArtifactAction,
    },
  ],
});

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
// display-mode and animation control selections. Color options are only sent
// for shimmer-color.
const buildArtifactsFeature = () => {
  const { mode, duration, primary, secondary } = readAnimationControls();
  return {
    ...artifactDemoConfigBase.features?.artifacts,
    display: readDisplayMode(),
    loadingAnimation: mode,
    loadingAnimationDuration: duration,
    ...(mode === "shimmer-color"
      ? {
          loadingAnimationColor: primary,
          loadingAnimationSecondaryColor: secondary,
        }
      : {}),
    // Copy is always on in the demo so the default pane toolbar shows it;
    // the expand toggle stays behind its control pill. White pane surface so
    // the source view reads like a document sheet against this page's warm
    // cream background.
    layout: {
      showCopyButton: true,
      paneBackground: "#ffffff",
      ...(readExpandToggle() ? { showExpandToggle: true } : {}),
    },
    ...(readCustomActions() ? buildCustomActions() : {}),
    // Inline chrome On sends the object form so showViewToggle can ride along;
    // showCopy/showExpand default to true when unspecified in the object form.
    // Off sends inlineChrome: false for a bare inline body. showViewToggle is a
    // recent key: if the widget types don't yet carry it (concurrent work), TS
    // treats it as an extra property, which stays assignable to the feature type.
    ...(readInlineChrome()
      ? { inlineChrome: { showViewToggle: readViewToggle() } }
      : { inlineChrome: false }),
    // Only affects display: "inline". If the widget package types don't yet
    // carry the inlineBody key (concurrent work), TS treats it as an extra
    // property, which stays assignable to the artifacts feature type.
    inlineBody: buildInlineBody(),
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

// ── Wire the rail controls (display mode + loading animation) ─────────────
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

const applyControlConfig = (): void => {
  const config = buildConfig(activeMountMode);
  handle?.update(
    activeMountMode === "launcher" ? config : squareInlinePanel(config),
  );
  reportDemoConfig(configInspector, { config, mode: activeMountMode });
};

const displayModeGroup = document.getElementById("artifact-display-mode");
displayModeGroup?.addEventListener("click", (event) => {
  const btn = (event.target as HTMLElement).closest<HTMLButtonElement>(".mode-btn");
  if (!btn) return;
  displayModeGroup
    .querySelectorAll(".mode-btn")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  applyControlConfig();
});

const expandToggleGroup = document.getElementById("artifact-expand-toggle");
expandToggleGroup?.addEventListener("click", (event) => {
  const btn = (event.target as HTMLElement).closest<HTMLButtonElement>(".mode-btn");
  if (!btn) return;
  expandToggleGroup
    .querySelectorAll(".mode-btn")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  applyControlConfig();
});

const customActionsGroup = document.getElementById("artifact-custom-actions");
customActionsGroup?.addEventListener("click", (event) => {
  const btn = (event.target as HTMLElement).closest<HTMLButtonElement>(".mode-btn");
  if (!btn) return;
  customActionsGroup
    .querySelectorAll(".mode-btn")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  applyControlConfig();
});

const inlineChromeGroup = document.getElementById("artifact-inline-chrome");
inlineChromeGroup?.addEventListener("click", (event) => {
  const btn = (event.target as HTMLElement).closest<HTMLButtonElement>(".mode-btn");
  if (!btn) return;
  inlineChromeGroup
    .querySelectorAll(".mode-btn")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  applyControlConfig();
});

// Streaming body groups all share the plain segmented-control behavior: swap
// the active pill, then rebuild + apply the config live.
for (const groupId of [
  "artifact-streaming-view",
  "artifact-view-mode",
  "artifact-view-toggle",
  "artifact-body-height",
  "artifact-fade-mask",
  "artifact-follow-output",
  "artifact-body-transition",
]) {
  const group = document.getElementById(groupId);
  group?.addEventListener("click", (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>(".mode-btn");
    if (!btn) return;
    group
      .querySelectorAll(".mode-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    applyControlConfig();
  });
}

const modeGroup = document.getElementById("artifact-anim-mode");
modeGroup?.addEventListener("click", (event) => {
  const btn = (event.target as HTMLElement).closest<HTMLButtonElement>(".mode-btn");
  if (!btn) return;
  modeGroup
    .querySelectorAll(".mode-btn")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  syncColorSectionVisibility(btn.dataset.mode as ArtifactAnimationMode);
  applyControlConfig();
});
// Default mode is shimmer, so the color options start hidden.
syncColorSectionVisibility(ANIMATION_DEFAULTS.mode);

const durationSlider = getEl<HTMLInputElement>("artifact-anim-duration");
const durationLabel = document.getElementById("artifact-anim-duration-label");
durationSlider?.addEventListener("input", () => {
  if (durationLabel) durationLabel.textContent = `${durationSlider.value}ms`;
  applyControlConfig();
});

getEl<HTMLInputElement>("artifact-color-primary")?.addEventListener(
  "input",
  applyControlConfig,
);
getEl<HTMLInputElement>("artifact-color-secondary")?.addEventListener(
  "input",
  applyControlConfig,
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
  applyControlConfig();
});
