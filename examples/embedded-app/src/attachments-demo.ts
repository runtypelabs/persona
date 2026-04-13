import "@runtypelabs/persona/widget.css";
import {
  createAgentExperience,
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG,
} from "@runtypelabs/persona";
import type { AgentWidgetController, AgentWidgetAttachmentsConfig } from "@runtypelabs/persona";

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

// ---------------------------------------------------------------------------
// Log helper
// ---------------------------------------------------------------------------
const logEl = document.getElementById("log");

function log(msg: string) {
  if (!logEl) return;
  const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
  const line = document.createElement("div");
  line.textContent = `[${ts}] ${msg}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

// ---------------------------------------------------------------------------
// Read config from the UI controls
// ---------------------------------------------------------------------------
function readAttachmentsConfig(): AgentWidgetAttachmentsConfig {
  const maxFiles = Number(
    (document.getElementById("cfg-max-files") as HTMLSelectElement).value
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

// ---------------------------------------------------------------------------
// Widget lifecycle
// ---------------------------------------------------------------------------
let controller: AgentWidgetController | null = null;

function mountWidget() {
  const mount = document.getElementById("attachments-widget");
  if (!mount) throw new Error("Widget mount not found");

  mount.innerHTML = "";

  const attachments = readAttachmentsConfig();
  log(`Mounted — maxFiles=${attachments.maxFiles}, maxSize=${(attachments.maxFileSize ?? 0) / MB}MB, icon=${attachments.buttonIconName}`);

  controller = createAgentExperience(mount, {
    ...DEFAULT_WIDGET_CONFIG,
    apiUrl: proxyUrl,
    launcher: {
      ...DEFAULT_WIDGET_CONFIG.launcher,
      enabled: false,
      width: "100%",
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
  });

  (window as unknown as { attachmentsController: typeof controller }).attachmentsController =
    controller;
}

mountWidget();

// ---------------------------------------------------------------------------
// Sync blur dropdown when a "no blur" background preset is picked
// ---------------------------------------------------------------------------
const bgSelect = document.getElementById("cfg-drop-bg") as HTMLSelectElement | null;
const blurSelect = document.getElementById("cfg-drop-blur") as HTMLSelectElement | null;
bgSelect?.addEventListener("change", () => {
  const selected = bgSelect.selectedOptions[0];
  if (selected?.hasAttribute("data-no-blur") && blurSelect) {
    blurSelect.value = "0px";
  }
});

// ---------------------------------------------------------------------------
// Apply button — destroy and re-create with new config
// ---------------------------------------------------------------------------
document.getElementById("apply-config")?.addEventListener("click", () => {
  if (controller) {
    controller.destroy();
    controller = null;
  }
  mountWidget();
});
