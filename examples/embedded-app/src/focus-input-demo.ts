import "@runtypelabs/persona/widget.css";

import {
  initAgentWidget,
  createAgentExperience,
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG,
} from "@runtypelabs/persona";

const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const proxyUrl =
  import.meta.env.VITE_PROXY_URL
    ? `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch`
    : `http://localhost:${proxyPort}/api/chat/dispatch`;

// ---------------------------------------------------------------------------
// Log helper
// ---------------------------------------------------------------------------
const logEl = document.getElementById("log");
const log = (msg: string) => {
  if (logEl) {
    const time = new Date().toLocaleTimeString();
    logEl.textContent += `[${time}] ${msg}\n`;
    logEl.scrollTop = logEl.scrollHeight;
  }
  console.log(`[FocusDemo] ${msg}`);
};

// ---------------------------------------------------------------------------
// Persisted autoFocusInput state (survives reload)
// ---------------------------------------------------------------------------
const STORAGE_KEY = "focus-demo-autoFocusInput";
const savedAutoFocus = localStorage.getItem(STORAGE_KEY) === "true";

// ---------------------------------------------------------------------------
// Inline widget
// ---------------------------------------------------------------------------
const inlineMount = document.getElementById("inline-widget");
if (!inlineMount) throw new Error("Inline widget mount missing");

const inlineController = createAgentExperience(inlineMount, {
  ...DEFAULT_WIDGET_CONFIG,
  apiUrl: proxyUrl,
  autoFocusInput: savedAutoFocus,
  launcher: { ...DEFAULT_WIDGET_CONFIG.launcher, enabled: false, width: "100%" },
  copy: {
    ...DEFAULT_WIDGET_CONFIG.copy,
    welcomeTitle: "Focus Input Demo",
    welcomeSubtitle: "Test autoFocusInput, controller.focusInput(), and persona:focusInput.",
    inputPlaceholder: "Type here…",
  },
  suggestionChips: ["Hello", "Focus test"],
  postprocessMessage: ({ text }) => markdownPostprocessor(text),
});

// ---------------------------------------------------------------------------
// Launcher widget
// ---------------------------------------------------------------------------
const launcherController = initAgentWidget({
  target: "#launcher-root",
  useShadowDom: false,
  config: {
    ...DEFAULT_WIDGET_CONFIG,
    apiUrl: proxyUrl,
    autoFocusInput: savedAutoFocus,
    copy: {
      ...DEFAULT_WIDGET_CONFIG.copy,
      welcomeTitle: "Launcher",
      welcomeSubtitle: "Open/close to test autoFocusInput.",
      inputPlaceholder: "Type here…",
    },
    suggestionChips: ["Hi", "Test focus"],
    postprocessMessage: ({ text }) => markdownPostprocessor(text),
  },
});

// ---------------------------------------------------------------------------
// 1. autoFocusInput toggle
// ---------------------------------------------------------------------------
const autoFocusToggle = document.getElementById("auto-focus-toggle") as HTMLInputElement;
if (autoFocusToggle) autoFocusToggle.checked = savedAutoFocus;
autoFocusToggle?.addEventListener("change", () => {
  const enabled = autoFocusToggle.checked;
  localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");
  inlineController.update({ autoFocusInput: enabled });
  launcherController.update({ autoFocusInput: enabled });
  log(`autoFocusInput: ${enabled ? "on" : "off"}`);
});

// ---------------------------------------------------------------------------
// 2. controller.focusInput()
// ---------------------------------------------------------------------------
document.getElementById("focus-inline")?.addEventListener("click", () => {
  const ok = inlineController.focusInput();
  log(`focusInput() on inline: ${ok ? "ok" : "failed (panel closed or no textarea)"}`);
});

document.getElementById("focus-launcher")?.addEventListener("click", () => {
  const ok = launcherController.focusInput();
  log(`focusInput() on launcher: ${ok ? "ok" : "failed (open the panel first)"}`);
});

// ---------------------------------------------------------------------------
// 3. persona:focusInput (DOM events)
// ---------------------------------------------------------------------------
document.getElementById("focus-win-all")?.addEventListener("click", () => {
  window.dispatchEvent(new CustomEvent("persona:focusInput"));
  log("Dispatched persona:focusInput (all instances)");
});

document.getElementById("focus-win-inline")?.addEventListener("click", () => {
  window.dispatchEvent(
    new CustomEvent("persona:focusInput", { detail: { instanceId: "inline-widget" } })
  );
  log("Dispatched persona:focusInput (instanceId: inline-widget)");
});

document.getElementById("focus-win-launcher")?.addEventListener("click", () => {
  window.dispatchEvent(
    new CustomEvent("persona:focusInput", { detail: { instanceId: "launcher-root" } })
  );
  log("Dispatched persona:focusInput (instanceId: launcher-root)");
});

document.getElementById("focus-win-wrong")?.addEventListener("click", () => {
  window.dispatchEvent(
    new CustomEvent("persona:focusInput", { detail: { instanceId: "wrong-id" } })
  );
  log("Dispatched persona:focusInput (instanceId: wrong-id) — no effect expected");
});

log("Focus Input Demo ready. Enable autoFocusInput and open the launcher to test.");
