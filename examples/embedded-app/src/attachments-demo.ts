import "@runtypelabs/persona/widget.css";
import { renderDemoScaffold } from "./demo-scaffold";
import {
  createLocalStorageAdapter,
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetConfig,
  type AgentWidgetController,
  type AgentWidgetAttachmentsConfig,
} from "@runtypelabs/persona";
import { setupMountMode, runWidgetMountWithInspector } from "./mount-mode";
import { createDemoConfigInspector } from "./demo-config-inspector";
import type { Mode } from "./examples-nav";

renderDemoScaffold({ slug: "attachments-demo" });

const configInspector = createDemoConfigInspector({ title: "File Attachments" });

const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const proxyUrl = import.meta.env.VITE_PROXY_URL
  ? `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch`
  : `http://localhost:${proxyPort}/api/chat/dispatch`;

const MB = 1024 * 1024;

const ALLOWED_TYPE_PRESETS: Record<string, string[]> = {
  images: ["image/png", "image/jpeg", "image/gif", "image/webp"],
  "images-pdf": ["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"],
  all: [
    "image/png", "image/jpeg", "image/gif", "image/webp",
    "application/pdf", "text/plain", "text/csv", "text/html",
    "application/json",
  ],
};

const logEl = document.getElementById("log");
function log(msg: string) {
  if (!logEl) return;
  const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
  const line = document.createElement("div");
  line.textContent = `[${ts}] ${msg}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

function readAttachmentsConfig(): AgentWidgetAttachmentsConfig {
  const maxFiles = Number(
    (document.getElementById("cfg-max-files") as HTMLSelectElement).value,
  );
  const maxFileSize =
    Number((document.getElementById("cfg-max-size") as HTMLSelectElement).value) * MB;
  const typesKey = (document.getElementById("cfg-allowed-types") as HTMLSelectElement).value;
  const allowedTypes = ALLOWED_TYPE_PRESETS[typesKey] ?? ALLOWED_TYPE_PRESETS.images;
  const buttonIconName = (document.getElementById("cfg-icon") as HTMLSelectElement).value;

  const dropBg = (document.getElementById("cfg-drop-bg") as HTMLSelectElement).value;
  const dropIcon = (document.getElementById("cfg-drop-icon") as HTMLSelectElement).value;
  const dropLabel = (document.getElementById("cfg-drop-label") as HTMLInputElement).value.trim();
  const dropBorder = (document.getElementById("cfg-drop-border") as HTMLSelectElement).value;
  const dropStroke = (document.getElementById("cfg-drop-stroke") as HTMLSelectElement).value;
  const dropBlur = (document.getElementById("cfg-drop-blur") as HTMLSelectElement).value;
  const dropInset = (document.getElementById("cfg-drop-inset") as HTMLSelectElement).value;

  const dropOverlay: AgentWidgetAttachmentsConfig["dropOverlay"] = {
    ...(dropBg ? { background: dropBg } : {}),
    ...(dropIcon ? { iconName: dropIcon } : {}),
    ...(dropStroke ? { iconStrokeWidth: Number(dropStroke) } : {}),
    ...(dropLabel ? { label: dropLabel } : {}),
    ...(dropBorder ? { border: dropBorder } : {}),
    ...(dropBlur ? { backdropBlur: dropBlur } : {}),
    ...(dropInset ? { inset: dropInset } : {}),
  };

  return {
    enabled: true,
    maxFiles,
    maxFileSize,
    allowedTypes,
    buttonIconName,
    ...(Object.keys(dropOverlay).length > 0 ? { dropOverlay } : {}),
  };
}

let activeController: AgentWidgetController | null = null;
let currentMode: Mode = "inline";

const buildConfig = (mode: Mode): AgentWidgetConfig => {
  const isLauncher = mode === "launcher";
  const attachments = readAttachmentsConfig();
  log(`Mounted (${mode}) — maxFiles=${attachments.maxFiles}, maxSize=${(attachments.maxFileSize ?? 0) / MB}MB, icon=${attachments.buttonIconName}`);
  return {
    ...DEFAULT_WIDGET_CONFIG,
    apiUrl: proxyUrl,
    storageAdapter: createLocalStorageAdapter(
      `persona-state-attachments-demo-${mode}`,
    ),
    launcher: {
      ...DEFAULT_WIDGET_CONFIG.launcher,
      enabled: isLauncher,
      width: isLauncher ? "min(420px, 95vw)" : "100%",
    },
    copy: {
      ...DEFAULT_WIDGET_CONFIG.copy,
      welcomeTitle: "Attachments Demo",
      welcomeSubtitle: "Attach images or files and send them with your message.",
      inputPlaceholder: "Type a message or attach a file…",
    },
    suggestionChips: [
      "Describe what you see in the image",
      "Summarize this document",
    ],
    attachments,
    postprocessMessage: ({ text }) => markdownPostprocessor(text),
  };
};

setupMountMode({
  slug: "attachments-demo",
  modes: ["inline", "launcher"],
  mount: (mode, { stage }) => {
    currentMode = mode;
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

const bgSelect = document.getElementById("cfg-drop-bg") as HTMLSelectElement | null;
const blurSelect = document.getElementById("cfg-drop-blur") as HTMLSelectElement | null;
bgSelect?.addEventListener("change", () => {
  const selected = bgSelect.selectedOptions[0];
  if (selected?.hasAttribute("data-no-blur") && blurSelect) {
    blurSelect.value = "0px";
  }
});

document.getElementById("apply-config")?.addEventListener("click", () => {
  // Rebuild the active mode's widget with the latest attachment config.
  activeController?.update({ attachments: readAttachmentsConfig() } as Partial<AgentWidgetConfig>);
  log(`Applied new config to ${currentMode} widget`);
  configInspector.update({
    config: buildConfig(currentMode),
    mode: currentMode,
  });
});
