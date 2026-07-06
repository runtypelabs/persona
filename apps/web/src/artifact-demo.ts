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
    welcomeSubtitle: "Use the artifact buttons in the Configure rail or chat with the proxy.",
    inputPlaceholder: "Message the model…",
  },
};

const configInspector = createDemoConfigInspector({
  title: "Artifact Sidebar",
  root: "[data-config-inspector]",
});

const buildConfig = (mode: Mode): AgentWidgetConfig =>
  ({
    ...artifactDemoConfigBase,
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

setupMountMode({
  slug: "artifact-demo",
  modes: ["inline", "launcher"],
  mount: (mode, { stage }) => {
    const config = buildConfig(mode);
    reportDemoConfig(configInspector, { config, mode });
    // Both modes use initAgentWidget so the handle (upsertArtifact / clearChat /
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

document.getElementById("btn-md")?.addEventListener("click", () => {
  handle?.upsertArtifact({
    artifactType: "markdown",
    title: "Sample",
    content: "## Hello\n\nThis **markdown** artifact was injected from the demo toolbar.",
  });
});

// Demo of a previewable HTML file artifact (as a Claude Managed agent would emit
// one): the content is a fenced code block on the wire, and `file` metadata lets
// Persona unfence + preview it in a sandboxed iframe. Exercise the rendered/source
// toggle and Download from here.
const CAT_HTML = `<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>Cat</title></head>
  <body style="font-family: system-ui, sans-serif; text-align: center; padding: 2rem;">
    <h1>Hello from an HTML file artifact</h1>
    <p>This file streamed as a fenced code block, then rendered in a sandboxed iframe.</p>
    <button onclick="this.textContent = 'Meow!'">Click me</button>
  </body>
</html>
`;

// Encode the way core does: escape any literal triple-backtick (backtick + ZWSP +
// backtick backtick), then wrap in a fence.
const ZWSP = "\u200b";
const encodeFileArtifact = (source: string, lang: string): string => {
  const escaped = source.split("```").join("`" + ZWSP + "``");
  return "```" + lang + "\n" + escaped + "\n```";
};

document.getElementById("btn-html-file")?.addEventListener("click", () => {
  handle?.upsertArtifact({
    artifactType: "markdown",
    title: "outputs/cat.html",
    content: encodeFileArtifact(CAT_HTML, "html"),
    file: { path: "outputs/cat.html", mimeType: "text/html", language: "html" },
  });
});

// Same wire shape, but the HTML file is a self-contained React app: React +
// ReactDOM UMD and Babel standalone from a CDN, JSX in an inline script. This is
// what agents typically write for single-file React outputs. The sandbox is
// `allow-scripts` so the CDN scripts load and run; note that `srcdoc` inherits
// the host page's CSP, so a strict host CSP can block the CDN loads.
const REACT_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>React Counter</title>
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <style>
      body { font-family: system-ui, sans-serif; text-align: center; padding: 2rem; }
      button { font-size: 1.25rem; padding: 0.5rem 1.25rem; border-radius: 0.5rem; border: 1px solid #ccc; cursor: pointer; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="text/babel">
      function Counter() {
        const [count, setCount] = React.useState(0);
        return (
          <div>
            <h1>React file artifact</h1>
            <p>This React app streamed as a fenced code block, then ran in a sandboxed iframe.</p>
            <button onClick={() => setCount((c) => c + 1)}>Count: {count}</button>
          </div>
        );
      }
      ReactDOM.createRoot(document.getElementById("root")).render(<Counter />);
    </script>
  </body>
</html>
`;

document.getElementById("btn-react-file")?.addEventListener("click", () => {
  handle?.upsertArtifact({
    artifactType: "markdown",
    title: "outputs/counter-react.html",
    content: encodeFileArtifact(REACT_HTML, "html"),
    file: { path: "outputs/counter-react.html", mimeType: "text/html", language: "html" },
  });
});

document.getElementById("btn-comp")?.addEventListener("click", () => {
  handle?.upsertArtifact({
    artifactType: "component",
    title: "Pill",
    component: "ArtifactDemoPill",
    props: { label: "Registered component" },
  });
});

document.getElementById("btn-unknown")?.addEventListener("click", () => {
  handle?.upsertArtifact({
    artifactType: "component",
    title: "Missing registry entry",
    component: "TotallyUnknownWidget",
    props: { foo: "bar" },
  });
});

document.getElementById("btn-clear")?.addEventListener("click", () => {
  handle?.clearChat();
});
